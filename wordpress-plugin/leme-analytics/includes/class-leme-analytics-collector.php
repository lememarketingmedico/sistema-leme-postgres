<?php

defined('ABSPATH') || exit;

final class LEME_Analytics_Collector {
    private $geo;

    public function __construct() {
        $this->geo = new LEME_Analytics_Geo_Location_Service();
        add_action('wp_enqueue_scripts', array($this, 'enqueue_collector'));
        add_action('rest_api_init', array($this, 'register_collect_route'));
    }

    public function enqueue_collector() {
        if (!$this->is_collection_allowed_for_page()) {
            return;
        }
        wp_enqueue_script(
            'leme-analytics-collector',
            LEME_ANALYTICS_URL . 'assets/collector.js',
            array(),
            LEME_ANALYTICS_VERSION,
            true
        );
        wp_localize_script('leme-analytics-collector', 'LEMEAnalyticsConfig', array(
            'endpoint' => esc_url_raw(rest_url('leme/v1/analytics/collect')),
            'pageId'   => (int) get_queried_object_id(),
            'heartbeatSeconds' => 15,
        ));
    }

    public function register_collect_route() {
        register_rest_route('leme/v1', '/analytics/collect', array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => array($this, 'collect'),
            'permission_callback' => '__return_true',
        ));
    }

    public function collect(WP_REST_Request $request) {
        if ('1' !== (string) get_option('leme_analytics_collecting', '1')) {
            return new WP_REST_Response(array('success' => true, 'collected' => false, 'reason' => 'disabled'), 202);
        }
        if (!$this->is_same_origin_request($request)) {
            return new WP_Error('leme_analytics_origin', 'Origem da coleta não autorizada.', array('status' => 403));
        }
        if ($this->is_bot_or_technical_request()) {
            return new WP_REST_Response(array('success' => true, 'collected' => false, 'reason' => 'technical'), 202);
        }
        if (is_user_logged_in() && current_user_can('manage_options') && '1' !== (string) get_option('leme_analytics_track_admins', '0')) {
            return new WP_REST_Response(array('success' => true, 'collected' => false, 'reason' => 'administrator'), 202);
        }

        $temporary_ip = $this->client_ip();
        if (!$this->within_rate_limit($temporary_ip)) {
            return new WP_Error('leme_analytics_rate_limit', 'Muitas coletas em pouco tempo.', array('status' => 429));
        }

        $body = $request->get_json_params();
        if (!is_array($body)) {
            $body = $request->get_body_params();
        }
        $event_type = sanitize_key((string) ($body['event_type'] ?? 'pageview'));
        if (!in_array($event_type, array('pageview', 'heartbeat', 'leave'), true)) {
            return new WP_Error('leme_analytics_event', 'Tipo de evento inválido.', array('status' => 400));
        }
        $event_uuid = strtolower(sanitize_text_field((string) ($body['event_uuid'] ?? '')));
        $session_id = strtolower(sanitize_text_field((string) ($body['session_id'] ?? '')));
        if (!preg_match('/^[a-f0-9-]{20,64}$/', $session_id) || ('pageview' === $event_type && !preg_match('/^[a-f0-9-]{20,64}$/', $event_uuid))) {
            return new WP_Error('leme_analytics_identifier', 'Identificador de coleta inválido.', array('status' => 400));
        }
        $page_url = $this->safe_page_url($body['url'] ?? '');
        $path = $this->sanitize_path($body['path'] ?? wp_parse_url($page_url, PHP_URL_PATH));
        if (!$page_url || !$path || $this->is_technical_path($path)) {
            return new WP_REST_Response(array('success' => true, 'collected' => false, 'reason' => 'invalid_page'), 202);
        }

        $location = $this->geo->locate($temporary_ip);
        unset($temporary_ip);

        $visitor_id = $this->visitor_id();
        $visitor_hash = hash_hmac('sha256', $visitor_id, wp_salt('auth'));
        $session_hash = hash_hmac('sha256', $visitor_id . '|' . $session_id, wp_salt('secure_auth'));
        $referrer = $this->safe_referrer($body['referrer'] ?? '');
        $utm_source = sanitize_text_field(wp_unslash($body['utm_source'] ?? ''));
        $now = current_datetime();
        $device = $this->device();
        $source = $this->source($referrer, $utm_source);
        $title = $this->truncate(sanitize_text_field(wp_unslash($body['title'] ?? '')), 255);
        $session = array(
            'session_hash' => $session_hash,
            'visitor_hash' => $visitor_hash,
            'now' => current_time('mysql'),
            'path' => $path,
            'title' => $title,
            'device' => $device,
            'source' => $source,
            'city' => $this->truncate($location['city'], 120),
            'state' => $this->truncate($location['state'], 120),
            'country' => $this->truncate($location['country'], 120),
            'pageview_increment' => 'pageview' === $event_type ? 1 : 0,
            'engaged_seconds' => min(30, max(0, absint($body['engaged_seconds'] ?? 0))),
            'is_visible' => ('leave' !== $event_type && !empty($body['visible'])) ? 1 : 0,
        );
        if ('pageview' !== $event_type) {
            LEME_Analytics_DB::touch_session($session);
            return new WP_REST_Response(array('success' => true, 'collected' => true, 'event' => $event_type), 202);
        }

        $visit = array(
            'created_at'   => $now->format('Y-m-d H:i:s'),
            'visit_date'   => $now->format('Y-m-d'),
            'page_id'      => absint($body['page_id'] ?? 0),
            'page_title'   => $title,
            'page_url'     => $page_url,
            'path'         => $path,
            'city'         => $this->truncate($location['city'], 120),
            'state'        => $this->truncate($location['state'], 120),
            'country'      => $this->truncate($location['country'], 120),
            'device'       => $device,
            'source'       => $source,
            'referrer'     => $referrer,
            'visitor_hash' => $visitor_hash,
            'utm_source'   => $this->truncate($utm_source, 120),
            'utm_medium'   => $this->truncate(sanitize_text_field(wp_unslash($body['utm_medium'] ?? '')), 120),
            'utm_campaign' => $this->truncate(sanitize_text_field(wp_unslash($body['utm_campaign'] ?? '')), 160),
            'event_uuid'   => $event_uuid,
            'session_hash' => $session_hash,
        );

        $result = LEME_Analytics_DB::insert_visit($visit);
        if (is_wp_error($result)) {
            return $result;
        }
        if ('duplicate' !== $result) {
            LEME_Analytics_DB::touch_session($session);
        }
        return new WP_REST_Response(array('success' => true, 'collected' => true, 'duplicate' => 'duplicate' === $result), 202);
    }

    private function is_collection_allowed_for_page() {
        if ('1' !== (string) get_option('leme_analytics_collecting', '1')) {
            return false;
        }
        if (is_admin() || wp_doing_ajax() || wp_doing_cron() || (defined('REST_REQUEST') && REST_REQUEST)) {
            return false;
        }
        if (is_user_logged_in() && current_user_can('manage_options') && '1' !== (string) get_option('leme_analytics_track_admins', '0')) {
            return false;
        }
        return true;
    }

    private function is_same_origin_request(WP_REST_Request $request) {
        $home_host = strtolower((string) wp_parse_url(home_url('/'), PHP_URL_HOST));
        $candidates = array(
            $request->get_header('origin'),
            $request->get_header('referer'),
            $request->get_param('url'),
        );
        foreach ($candidates as $candidate) {
            if (!$candidate) {
                continue;
            }
            $host = strtolower((string) wp_parse_url((string) $candidate, PHP_URL_HOST));
            if ($host && hash_equals($home_host, $host)) {
                return true;
            }
        }
        return 'same-origin' === strtolower((string) $request->get_header('sec-fetch-site'));
    }

    private function is_bot_or_technical_request() {
        if (wp_doing_ajax() || wp_doing_cron()) {
            return true;
        }
        $ua = strtolower((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
        if (!$ua) {
            return true;
        }
        return (bool) preg_match('/bot|crawl|spider|slurp|headless|lighthouse|pagespeed|monitor|uptime|healthcheck|curl|wget|python-requests|facebookexternalhit|whatsapp/i', $ua);
    }

    private function is_technical_path($path) {
        return (bool) preg_match('#/(wp-admin|wp-json|wp-cron\.php|wp-login\.php|admin-ajax\.php)(/|$)|/(health|healthz|status|uptime)(/|$)|/\.well-known/#i', $path);
    }

    private function sanitize_path($value) {
        $path = (string) $value;
        $path = wp_parse_url($path, PHP_URL_PATH) ?: $path;
        $path = '/' . ltrim(rawurldecode($path), '/');
        $path = preg_replace('#/+#', '/', $path);
        return $this->truncate(sanitize_text_field($path), 255);
    }

    private function safe_referrer($value) {
        $url = esc_url_raw((string) $value);
        if (!$url) {
            return '';
        }
        $parts = wp_parse_url($url);
        if (empty($parts['host'])) {
            return '';
        }
        $scheme = isset($parts['scheme']) ? $parts['scheme'] . '://' : 'https://';
        return esc_url_raw($scheme . $parts['host'] . ($parts['path'] ?? '/'));
    }

    private function safe_page_url($value) {
        $url = esc_url_raw((string) $value);
        $parts = $url ? wp_parse_url($url) : array();
        if (empty($parts['host'])) {
            return '';
        }
        $home_host = strtolower((string) wp_parse_url(home_url('/'), PHP_URL_HOST));
        if (!$home_host || !hash_equals($home_host, strtolower((string) $parts['host']))) {
            return '';
        }
        $scheme = isset($parts['scheme']) ? $parts['scheme'] . '://' : (is_ssl() ? 'https://' : 'http://');
        return esc_url_raw($scheme . $parts['host'] . ($parts['path'] ?? '/'));
    }

    private function source($referrer, $utm_source) {
        $referrer_host = strtolower((string) wp_parse_url($referrer, PHP_URL_HOST));
        $home_host = strtolower((string) wp_parse_url(home_url('/'), PHP_URL_HOST));
        if (!$utm_source && (!$referrer_host || ($home_host && hash_equals($home_host, $referrer_host)))) {
            return 'Direto';
        }
        $value = strtolower(trim($utm_source . ' ' . $referrer));
        if (preg_match('/google/', $value)) {
            return 'Google';
        }
        if (preg_match('/instagram|instagr\.am/', $value)) {
            return 'Instagram';
        }
        if (preg_match('/facebook|fb\.com|fbclid/', $value)) {
            return 'Facebook';
        }
        if (preg_match('/bing/', $value)) {
            return 'Bing';
        }
        return $value ? 'Outros' : 'Direto';
    }

    private function device() {
        $ua = strtolower((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
        if (preg_match('/ipad|tablet|kindle|silk|playbook/', $ua)) {
            return 'Tablet';
        }
        if (preg_match('/mobile|iphone|ipod|android.*mobile|windows phone/', $ua)) {
            return 'Celular';
        }
        if (preg_match('/windows|macintosh|linux|x11|cros/', $ua)) {
            return 'Desktop';
        }
        return 'Outros';
    }

    private function visitor_id() {
        $name = 'leme_analytics_vid';
        $current = isset($_COOKIE[$name]) ? preg_replace('/[^a-f0-9]/i', '', (string) wp_unslash($_COOKIE[$name])) : '';
        if (strlen($current) >= 32) {
            return substr($current, 0, 64);
        }
        $value = bin2hex(random_bytes(24));
        setcookie($name, $value, array(
            'expires'  => time() + (180 * DAY_IN_SECONDS),
            'path'     => COOKIEPATH ?: '/',
            'domain'   => COOKIE_DOMAIN,
            'secure'   => is_ssl(),
            'httponly' => true,
            'samesite' => 'Lax',
        ));
        return $value;
    }

    private function client_ip() {
        foreach (array('HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR') as $header) {
            if (empty($_SERVER[$header])) {
                continue;
            }
            $candidate = trim(explode(',', (string) wp_unslash($_SERVER[$header]))[0]);
            if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                return $candidate;
            }
        }
        return '0.0.0.0';
    }

    private function within_rate_limit($temporary_ip) {
        $key = 'leme_an_rl_' . substr(hash_hmac('sha256', (string) $temporary_ip, wp_salt('nonce')), 0, 32);
        $count = (int) get_transient($key);
        if ($count >= 180) {
            return false;
        }
        set_transient($key, $count + 1, 5 * MINUTE_IN_SECONDS);
        return true;
    }

    private function truncate($value, $length) {
        $value = (string) $value;
        return function_exists('mb_substr') ? mb_substr($value, 0, $length) : substr($value, 0, $length);
    }
}
