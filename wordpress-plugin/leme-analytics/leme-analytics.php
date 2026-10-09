<?php
/**
 * Plugin Name: LEME Analytics
 * Plugin URI: https://lememarketingmedico.com.br/
 * Description: Coleta Analytics próprio, anônimo e leve, com API REST segura para o Sistema LEME.
 * Version: 2.0.0
 * Author: LEME Marketing Médico
 * Text Domain: leme-analytics
 * Requires at least: 6.2
 * Requires PHP: 7.4
 */

defined('ABSPATH') || exit;

define('LEME_ANALYTICS_VERSION', '2.0.0');
define('LEME_ANALYTICS_FILE', __FILE__);
define('LEME_ANALYTICS_DIR', plugin_dir_path(__FILE__));
define('LEME_ANALYTICS_URL', plugin_dir_url(__FILE__));

require_once LEME_ANALYTICS_DIR . 'includes/class-leme-analytics-db.php';
require_once LEME_ANALYTICS_DIR . 'includes/class-leme-analytics-geo-location-service.php';
require_once LEME_ANALYTICS_DIR . 'includes/class-leme-analytics-collector.php';
require_once LEME_ANALYTICS_DIR . 'includes/class-leme-analytics-rest-api.php';
require_once LEME_ANALYTICS_DIR . 'includes/class-leme-analytics-admin.php';

final class LEME_Analytics {
    private static $instance = null;

    public static function instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        LEME_Analytics_DB::maybe_upgrade();
        new LEME_Analytics_Collector();
        new LEME_Analytics_REST_API();
        if (is_admin()) {
            new LEME_Analytics_Admin();
        }
    }

    public static function activate() {
        LEME_Analytics_DB::install();
        if (!get_option('leme_analytics_api_key_hash') && !get_option('leme_analytics_api_key')) {
            self::store_new_api_key(self::generate_api_key());
        }
        if (false === get_option('leme_analytics_collecting', false)) {
            update_option('leme_analytics_collecting', '1', false);
        }
        update_option('leme_analytics_version', LEME_ANALYTICS_VERSION, false);
    }

    public static function generate_api_key() {
        return 'leme_sk_' . bin2hex(random_bytes(24));
    }

    public static function store_new_api_key($key) {
        update_option('leme_analytics_api_key_hash', hash_hmac('sha256', (string) $key, wp_salt('auth')), false);
        delete_option('leme_analytics_api_key');
        set_transient('leme_analytics_new_api_key_' . get_current_user_id(), (string) $key, 15 * MINUTE_IN_SECONDS);
    }
}

register_activation_hook(__FILE__, array('LEME_Analytics', 'activate'));
add_action('plugins_loaded', array('LEME_Analytics', 'instance'));

