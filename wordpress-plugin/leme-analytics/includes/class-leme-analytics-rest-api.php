<?php

defined('ABSPATH') || exit;

final class LEME_Analytics_REST_API {
    private $namespace = 'leme/v1';

    public function __construct() {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public function register_routes() {
        $routes = array(
            'status'   => 'status',
            'summary'  => 'summary',
            'timeline' => 'timeline',
            'pages'    => 'pages',
            'page'     => 'page_details',
            'cities'   => 'cities',
            'city'     => 'city_details',
            'states'   => 'states',
            'sources'  => 'sources',
            'devices'  => 'devices',
            'realtime' => 'realtime',
        );
        foreach ($routes as $route => $method) {
            register_rest_route($this->namespace, '/analytics/' . $route, array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array($this, $method),
                'permission_callback' => array($this, 'authorize'),
            ));
        }
    }

    public function authorize(WP_REST_Request $request) {
        $stored = (string) get_option('leme_analytics_api_key_hash', '');
        $received = (string) $request->get_header('x-leme-key');
        $candidate = $received ? hash_hmac('sha256', trim($received), wp_salt('auth')) : '';
        if (!$stored || !$candidate || !hash_equals($stored, $candidate)) {
            return new WP_Error('leme_analytics_unauthorized', 'X-LEME-KEY inválida.', array('status' => 401));
        }

        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $bucket = 'leme_an_api_' . gmdate('YmdHi') . '_' . substr(hash_hmac('sha256', $ip, wp_salt('nonce')), 0, 18);
        $count = (int) get_transient($bucket);
        if ($count >= 240) {
            return new WP_Error('leme_analytics_api_rate_limit', 'Limite temporário da API atingido.', array('status' => 429));
        }
        set_transient($bucket, $count + 1, 2 * MINUTE_IN_SECONDS);
        return true;
    }

    public function status() {
        return $this->success(LEME_Analytics_DB::status());
    }

    public function realtime() {
        return $this->success(LEME_Analytics_DB::realtime());
    }

    public function summary(WP_REST_Request $request) {
        $period = $this->period($request);
        if (is_wp_error($period)) {
            return $period;
        }
        list($start, $end, $days) = $period;
        $totals = $this->aggregate_totals('all', $start, $end);

        $end_previous = $this->shift_date($start, -1);
        $start_previous = $this->shift_date($end_previous, -($days - 1));
        $previous = $this->aggregate_totals('all', $start_previous, $end_previous);
        $change = 0.0;
        if ((int) $previous['views'] > 0) {
            $change = (((int) $totals['views'] - (int) $previous['views']) / (int) $previous['views']) * 100;
        } elseif ((int) $totals['views'] > 0) {
            $change = 100.0;
        }

        $top_page = $this->top_dimension('page', $start, $end);
        $top_city = $this->top_dimension('city', $start, $end);
        $views = (int) $totals['views'];
        $session_metrics = $this->session_metrics($start, $end);

        return $this->success(array(
            'views'          => $views,
            'visitors'       => (int) $totals['visitors'],
            'daily_average'  => $days ? round($views / $days, 1) : 0,
            'change_percent' => round($change, 1),
            'previous'       => array(
                'start_date' => $start_previous,
                'end_date'   => $end_previous,
                'views'      => (int) $previous['views'],
                'visitors'   => (int) $previous['visitors'],
            ),
            'top_page'       => $this->format_page_row($top_page, $views),
            'top_city'       => $this->format_city_row($top_city, $views),
            'sessions'       => $session_metrics['sessions'],
            'engaged_sessions' => $session_metrics['engaged_sessions'],
            'engagement_rate' => $session_metrics['engagement_rate'],
            'average_engagement_seconds' => $session_metrics['average_engagement_seconds'],
        ));
    }

    private function session_metrics($start, $end) {
        global $wpdb;
        $table = LEME_Analytics_DB::sessions_table();
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT COUNT(*) sessions,
                    SUM(CASE WHEN engaged_seconds >= 10 OR pageviews >= 2 THEN 1 ELSE 0 END) engaged_sessions,
                    COALESCE(AVG(engaged_seconds),0) average_engagement_seconds
             FROM {$table} WHERE DATE(started_at) BETWEEN %s AND %s",
            $start, $end
        ), ARRAY_A) ?: array();
        $sessions = (int) ($row['sessions'] ?? 0);
        $engaged = (int) ($row['engaged_sessions'] ?? 0);
        return array(
            'sessions' => $sessions,
            'engaged_sessions' => $engaged,
            'engagement_rate' => $sessions ? round(($engaged / $sessions) * 100, 1) : 0,
            'average_engagement_seconds' => round((float) ($row['average_engagement_seconds'] ?? 0), 1),
        );
    }

    public function timeline(WP_REST_Request $request) {
        $period = $this->period($request);
        if (is_wp_error($period)) {
            return $period;
        }
        list($start, $end) = $period;
        return $this->success(array('items' => $this->aggregate_timeline('all', $start, $end)));
    }

    public function pages(WP_REST_Request $request) {
        global $wpdb;
        $period = $this->period($request);
        if (is_wp_error($period)) {
            return $period;
        }
        list($start, $end) = $period;
        $pagination = $this->pagination($request);
        $search = sanitize_text_field((string) $request->get_param('search'));
        $order_by = in_array($request->get_param('orderby'), array('views', 'visitors', 'label'), true) ? $request->get_param('orderby') : 'views';
        $order = 'asc' === strtolower((string) $request->get_param('order')) ? 'ASC' : 'DESC';
        $table = LEME_Analytics_DB::daily_table();
        $where = "dimension_type='page' AND visit_date BETWEEN %s AND %s";
        $params = array($start, $end);
        if ($search) {
            $like = '%' . $wpdb->esc_like($search) . '%';
            $where .= ' AND (label LIKE %s OR dimension_key LIKE %s OR secondary_label LIKE %s)';
            array_push($params, $like, $like, $like);
        }

        $total = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(DISTINCT dimension_hash) FROM {$table} WHERE {$where}", $params));
        $query_params = array_merge($params, array($pagination['per_page'], $pagination['offset']));
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT dimension_key,MAX(label) AS label,MAX(secondary_label) AS secondary_label,SUM(views) AS views,SUM(visitors) AS visitors
                 FROM {$table} WHERE {$where}
                 GROUP BY dimension_hash,dimension_key
                 ORDER BY {$order_by} {$order} LIMIT %d OFFSET %d",
                $query_params
            ),
            ARRAY_A
        );
        $all = $this->aggregate_totals('all', $start, $end);
        $items = array_map(function ($row) use ($all) {
            return $this->format_page_row($row, (int) $all['views']);
        }, $rows);
        return $this->success(array(
            'items'      => $items,
            'pagination' => $this->pagination_result($pagination, $total),
        ));
    }

    public function page_details(WP_REST_Request $request) {
        global $wpdb;
        $period = $this->period($request);
        if (is_wp_error($period)) {
            return $period;
        }
        list($start, $end) = $period;
        $path = $this->path_param($request->get_param('path'));
        if (is_wp_error($path)) {
            return $path;
        }
        $table = LEME_Analytics_DB::visits_table();
        $summary = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT MAX(page_title) AS page_title,MAX(page_url) AS page_url,path,COUNT(*) AS views,COUNT(DISTINCT visitor_hash) AS visitors
                 FROM {$table} WHERE visit_date BETWEEN %s AND %s AND path=%s GROUP BY path",
                $start,
                $end,
                $path
            ),
            ARRAY_A
        );
        $summary = $summary ?: array('page_title' => $path, 'page_url' => '', 'path' => $path, 'views' => 0, 'visitors' => 0);
        $base = array($start, $end, $path);
        return $this->success(array(
            'page'      => array(
                'title'    => $summary['page_title'],
                'page_url' => $summary['page_url'],
                'path'     => $summary['path'],
                'views'    => (int) $summary['views'],
                'visitors' => (int) $summary['visitors'],
            ),
            'summary'   => array('views' => (int) $summary['views'], 'visitors' => (int) $summary['visitors']),
            'timeline'  => $this->raw_timeline('path=%s', $base, $start, $end),
            'cities'    => $this->raw_city_ranking('path=%s', $base, (int) $summary['views']),
            'states'    => $this->raw_ranking('state', 'path=%s', $base, (int) $summary['views']),
            'sources'   => $this->raw_ranking('source', 'path=%s', $base, (int) $summary['views']),
            'devices'   => $this->raw_ranking('device', 'path=%s', $base, (int) $summary['views']),
        ));
    }

    public function cities(WP_REST_Request $request) {
        $period = $this->period($request);
        if (is_wp_error($period)) {
            return $period;
        }
        list($start, $end) = $period;
        return $this->dimension_page('city', $start, $end, $request, 'city');
    }

    public function city_details(WP_REST_Request $request) {
        global $wpdb;
        $period = $this->period($request);
        if (is_wp_error($period)) {
            return $period;
        }
        list($start, $end) = $period;
        $city = $this->truncate(sanitize_text_field((string) $request->get_param('city')), 120);
        $state = $this->truncate(sanitize_text_field((string) $request->get_param('state')), 120);
        if (!$city) {
            return new WP_Error('leme_analytics_city_required', 'Informe a cidade.', array('status' => 400));
        }
        $table = LEME_Analytics_DB::visits_table();
        $unidentified = 'Não identificada' === $city;
        $filter = $unidentified ? "city=''" : 'city=%s';
        $base = $unidentified ? array($start, $end) : array($start, $end, $city);
        if ($state && !$unidentified) {
            $filter .= ' AND state=%s';
            $base[] = $state;
        }
        $summary = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT city,MAX(state) AS state,MAX(country) AS country,COUNT(*) AS views,COUNT(DISTINCT visitor_hash) AS visitors
                 FROM {$table} WHERE visit_date BETWEEN %s AND %s AND {$filter} GROUP BY city",
                $base
            ),
            ARRAY_A
        );
        $summary = $summary ?: array('city' => $city, 'state' => $state, 'country' => '', 'views' => 0, 'visitors' => 0);
        return $this->success(array(
            'city'      => array(
                'city'     => $summary['city'],
                'state'    => $summary['state'],
                'country'  => $summary['country'],
                'views'    => (int) $summary['views'],
                'visitors' => (int) $summary['visitors'],
            ),
            'summary'   => array('views' => (int) $summary['views'], 'visitors' => (int) $summary['visitors']),
            'timeline'  => $this->raw_timeline($filter, $base, $start, $end),
            'pages'     => $this->raw_page_ranking($filter, $base, (int) $summary['views']),
            'sources'   => $this->raw_ranking('source', $filter, $base, (int) $summary['views']),
            'devices'   => $this->raw_ranking('device', $filter, $base, (int) $summary['views']),
        ));
    }

    public function states(WP_REST_Request $request) {
        return $this->simple_dimension_response('state', $request);
    }

    public function sources(WP_REST_Request $request) {
        $result = $this->simple_dimension_response('source', $request);
        if (is_wp_error($result)) {
            return $result;
        }
        $data = $result->get_data();
        $by_label = array();
        foreach ($data['data']['items'] as $item) {
            $by_label[$item['label']] = $item;
        }
        $items = array();
        foreach (array('Google', 'Instagram', 'Facebook', 'Bing', 'Direto', 'Outros') as $label) {
            $items[] = $by_label[$label] ?? array('label' => $label, 'source' => $label, 'views' => 0, 'visitors' => 0, 'percentage' => 0);
        }
        $data['data']['items'] = $items;
        return new WP_REST_Response($data, 200);
    }

    public function devices(WP_REST_Request $request) {
        return $this->simple_dimension_response('device', $request);
    }

    private function simple_dimension_response($type, WP_REST_Request $request) {
        $period = $this->period($request);
        if (is_wp_error($period)) {
            return $period;
        }
        list($start, $end) = $period;
        return $this->dimension_page($type, $start, $end, $request, $type);
    }

    private function dimension_page($type, $start, $end, WP_REST_Request $request, $format) {
        global $wpdb;
        $pagination = $this->pagination($request);
        $table = LEME_Analytics_DB::daily_table();
        $total_groups = (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(DISTINCT dimension_hash) FROM {$table} WHERE dimension_type=%s AND visit_date BETWEEN %s AND %s", $type, $start, $end)
        );
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT dimension_key,MAX(label) AS label,MAX(secondary_label) AS secondary_label,MAX(tertiary_label) AS tertiary_label,SUM(views) AS views,SUM(visitors) AS visitors
                 FROM {$table} WHERE dimension_type=%s AND visit_date BETWEEN %s AND %s
                 GROUP BY dimension_hash,dimension_key ORDER BY views DESC LIMIT %d OFFSET %d",
                $type,
                $start,
                $end,
                $pagination['per_page'],
                $pagination['offset']
            ),
            ARRAY_A
        );
        $total = $this->aggregate_totals('all', $start, $end);
        $items = array();
        foreach ($rows as $row) {
            if ('city' === $format) {
                $items[] = $this->format_city_row($row, (int) $total['views']);
            } else {
                $items[] = array(
                    'label'      => $row['label'],
                    $type        => $row['label'],
                    'views'      => (int) $row['views'],
                    'visitors'   => (int) $row['visitors'],
                    'percentage' => $this->percentage($row['views'], $total['views']),
                );
            }
        }
        return $this->success(array('items' => $items, 'pagination' => $this->pagination_result($pagination, $total_groups)));
    }

    private function aggregate_totals($type, $start, $end) {
        global $wpdb;
        $table = LEME_Analytics_DB::daily_table();
        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COALESCE(SUM(views),0) AS views,COALESCE(SUM(visitors),0) AS visitors FROM {$table}
                 WHERE dimension_type=%s AND visit_date BETWEEN %s AND %s",
                $type,
                $start,
                $end
            ),
            ARRAY_A
        );
        return $row ?: array('views' => 0, 'visitors' => 0);
    }

    private function top_dimension($type, $start, $end) {
        global $wpdb;
        $table = LEME_Analytics_DB::daily_table();
        return $wpdb->get_row(
            $wpdb->prepare(
                "SELECT dimension_key,MAX(label) AS label,MAX(secondary_label) AS secondary_label,MAX(tertiary_label) AS tertiary_label,SUM(views) AS views,SUM(visitors) AS visitors
                 FROM {$table} WHERE dimension_type=%s AND visit_date BETWEEN %s AND %s
                 GROUP BY dimension_hash,dimension_key ORDER BY views DESC LIMIT 1",
                $type,
                $start,
                $end
            ),
            ARRAY_A
        ) ?: array();
    }

    private function aggregate_timeline($type, $start, $end) {
        global $wpdb;
        $table = LEME_Analytics_DB::daily_table();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT visit_date AS date,SUM(views) AS views,SUM(visitors) AS visitors FROM {$table}
                 WHERE dimension_type=%s AND visit_date BETWEEN %s AND %s GROUP BY visit_date ORDER BY visit_date",
                $type,
                $start,
                $end
            ),
            ARRAY_A
        );
        return $this->fill_timeline($rows, $start, $end);
    }

    private function raw_timeline($extra_filter, $params, $start, $end) {
        global $wpdb;
        $table = LEME_Analytics_DB::visits_table();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT visit_date AS date,COUNT(*) AS views,COUNT(DISTINCT visitor_hash) AS visitors
                 FROM {$table} WHERE visit_date BETWEEN %s AND %s AND {$extra_filter} GROUP BY visit_date ORDER BY visit_date",
                $params
            ),
            ARRAY_A
        );
        return $this->fill_timeline($rows, $start, $end);
    }

    private function raw_city_ranking($extra_filter, $params, $total_views) {
        global $wpdb;
        $table = LEME_Analytics_DB::visits_table();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT city,state,country,COUNT(*) AS views,COUNT(DISTINCT visitor_hash) AS visitors FROM {$table}
                 WHERE visit_date BETWEEN %s AND %s AND {$extra_filter} GROUP BY city,state,country ORDER BY views DESC LIMIT 20",
                $params
            ),
            ARRAY_A
        );
        foreach ($rows as &$row) {
            $row['city'] = $row['city'] ?: 'Não identificada';
            $row['views'] = (int) $row['views'];
            $row['visitors'] = (int) $row['visitors'];
            $row['percentage'] = $this->percentage($row['views'], $total_views);
        }
        return $rows;
    }

    private function raw_ranking($column, $extra_filter, $params, $total_views) {
        global $wpdb;
        $allowed = array('state', 'source', 'device');
        if (!in_array($column, $allowed, true)) {
            return array();
        }
        $table = LEME_Analytics_DB::visits_table();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT {$column} AS label,COUNT(*) AS views,COUNT(DISTINCT visitor_hash) AS visitors FROM {$table}
                 WHERE visit_date BETWEEN %s AND %s AND {$extra_filter} GROUP BY {$column} ORDER BY views DESC LIMIT 20",
                $params
            ),
            ARRAY_A
        );
        foreach ($rows as &$row) {
            $row['label'] = $row['label'] ?: 'Não identificado';
            $row[$column] = $row['label'];
            $row['views'] = (int) $row['views'];
            $row['visitors'] = (int) $row['visitors'];
            $row['percentage'] = $this->percentage($row['views'], $total_views);
        }
        return $rows;
    }

    private function raw_page_ranking($extra_filter, $params, $total_views) {
        global $wpdb;
        $table = LEME_Analytics_DB::visits_table();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT path,MAX(page_title) AS page_title,MAX(page_url) AS page_url,COUNT(*) AS views,COUNT(DISTINCT visitor_hash) AS visitors FROM {$table}
                 WHERE visit_date BETWEEN %s AND %s AND {$extra_filter} GROUP BY path ORDER BY views DESC LIMIT 20",
                $params
            ),
            ARRAY_A
        );
        return array_map(function ($row) use ($total_views) {
            return $this->format_page_row($row, $total_views);
        }, $rows);
    }

    private function format_page_row($row, $total_views) {
        if (!$row) {
            return array();
        }
        return array(
            'title'      => $row['page_title'] ?? $row['label'] ?? $row['dimension_key'] ?? '',
            'page_title' => $row['page_title'] ?? $row['label'] ?? '',
            'url'        => $row['page_url'] ?? $row['secondary_label'] ?? '',
            'path'       => $row['path'] ?? $row['dimension_key'] ?? '',
            'views'      => (int) ($row['views'] ?? 0),
            'visitors'   => (int) ($row['visitors'] ?? 0),
            'percentage' => $this->percentage($row['views'] ?? 0, $total_views),
        );
    }

    private function format_city_row($row, $total_views) {
        if (!$row) {
            return array();
        }
        return array(
            'city'       => $row['city'] ?? $row['label'] ?? 'Não identificada',
            'state'      => $row['state'] ?? $row['secondary_label'] ?? '',
            'country'    => $row['country'] ?? $row['tertiary_label'] ?? '',
            'views'      => (int) ($row['views'] ?? 0),
            'visitors'   => (int) ($row['visitors'] ?? 0),
            'percentage' => $this->percentage($row['views'] ?? 0, $total_views),
        );
    }

    private function fill_timeline($rows, $start, $end) {
        $indexed = array();
        foreach ($rows as $row) {
            $indexed[$row['date']] = array('date' => $row['date'], 'views' => (int) $row['views'], 'visitors' => (int) $row['visitors']);
        }
        $items = array();
        $cursor = new DateTimeImmutable($start, wp_timezone());
        $last = new DateTimeImmutable($end, wp_timezone());
        while ($cursor <= $last) {
            $date = $cursor->format('Y-m-d');
            $items[] = $indexed[$date] ?? array('date' => $date, 'views' => 0, 'visitors' => 0);
            $cursor = $cursor->modify('+1 day');
        }
        return $items;
    }

    private function period(WP_REST_Request $request) {
        $today = new DateTimeImmutable('today', wp_timezone());
        $start = (string) ($request->get_param('start_date') ?: $today->modify('-29 days')->format('Y-m-d'));
        $end = (string) ($request->get_param('end_date') ?: $today->format('Y-m-d'));
        $start_date = DateTimeImmutable::createFromFormat('!Y-m-d', $start, wp_timezone());
        $end_date = DateTimeImmutable::createFromFormat('!Y-m-d', $end, wp_timezone());
        if (!$start_date || !$end_date || $start_date->format('Y-m-d') !== $start || $end_date->format('Y-m-d') !== $end || $start_date > $end_date) {
            return new WP_Error('leme_analytics_invalid_period', 'Período inválido. Use YYYY-MM-DD.', array('status' => 400));
        }
        $days = (int) $start_date->diff($end_date)->days + 1;
        if ($days > 370) {
            return new WP_Error('leme_analytics_period_too_long', 'O período máximo é de 370 dias.', array('status' => 400));
        }
        return array($start, $end, $days);
    }

    private function path_param($value) {
        $path = '/' . ltrim(rawurldecode((string) $value), '/');
        $path = preg_replace('#/+#', '/', $path);
        $path = $this->truncate(sanitize_text_field($path), 255);
        if (!$path) {
            return new WP_Error('leme_analytics_path_required', 'Informe a página.', array('status' => 400));
        }
        return $path;
    }

    private function pagination(WP_REST_Request $request) {
        $page = max(1, min(10000, absint($request->get_param('page') ?: 1)));
        $per_page = max(1, min(100, absint($request->get_param('per_page') ?: 50)));
        return array('page' => $page, 'per_page' => $per_page, 'offset' => ($page - 1) * $per_page);
    }

    private function pagination_result($pagination, $total) {
        return array(
            'page'        => $pagination['page'],
            'per_page'    => $pagination['per_page'],
            'total'       => (int) $total,
            'total_pages' => (int) ceil($total / $pagination['per_page']),
        );
    }

    private function percentage($part, $total) {
        return (float) $total > 0 ? round(((float) $part / (float) $total) * 100, 1) : 0;
    }

    private function shift_date($value, $days) {
        return (new DateTimeImmutable($value, wp_timezone()))->modify(($days >= 0 ? '+' : '') . $days . ' days')->format('Y-m-d');
    }

    private function success($data) {
        return new WP_REST_Response(array('success' => true, 'data' => $data), 200);
    }

    private function truncate($value, $length) {
        $value = (string) $value;
        return function_exists('mb_substr') ? mb_substr($value, 0, $length) : substr($value, 0, $length);
    }
}
