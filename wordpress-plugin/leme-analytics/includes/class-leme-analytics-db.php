<?php

defined('ABSPATH') || exit;

final class LEME_Analytics_DB {
    public static function visits_table() {
        global $wpdb;
        return $wpdb->prefix . 'leme_analytics_visits';
    }

    public static function daily_table() {
        global $wpdb;
        return $wpdb->prefix . 'leme_analytics_daily';
    }

    public static function sessions_table() {
        global $wpdb;
        return $wpdb->prefix . 'leme_analytics_sessions';
    }

    public static function maybe_upgrade() {
        if (get_option('leme_analytics_version') !== LEME_ANALYTICS_VERSION) {
            self::install();
            update_option('leme_analytics_version', LEME_ANALYTICS_VERSION, false);
        }
    }

    public static function install() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset = $wpdb->get_charset_collate();
        $visits = self::visits_table();
        $daily = self::daily_table();
        $sessions = self::sessions_table();

        $sql_visits = "CREATE TABLE {$visits} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            created_at datetime NOT NULL,
            visit_date date NOT NULL,
            page_id bigint(20) unsigned NOT NULL DEFAULT 0,
            page_title varchar(255) NOT NULL DEFAULT '',
            page_url text NOT NULL,
            path varchar(255) NOT NULL DEFAULT '/',
            city varchar(120) NOT NULL DEFAULT '',
            state varchar(120) NOT NULL DEFAULT '',
            country varchar(120) NOT NULL DEFAULT '',
            device varchar(32) NOT NULL DEFAULT 'Outros',
            source varchar(32) NOT NULL DEFAULT 'Direto',
            referrer text NOT NULL,
            visitor_hash char(64) NOT NULL,
            utm_source varchar(120) NOT NULL DEFAULT '',
            utm_medium varchar(120) NOT NULL DEFAULT '',
            utm_campaign varchar(160) NOT NULL DEFAULT '',
            event_uuid char(36) NULL,
            session_hash char(64) NOT NULL DEFAULT '',
            PRIMARY KEY  (id),
            KEY visit_date (visit_date),
            KEY date_visitor (visit_date,visitor_hash),
            KEY date_path (visit_date,path(191)),
            KEY date_city (visit_date,city,state),
            KEY date_source (visit_date,source),
            KEY date_device (visit_date,device),
            UNIQUE KEY event_uuid (event_uuid),
            KEY session_hash (session_hash)
        ) {$charset};";

        $sql_daily = "CREATE TABLE {$daily} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            visit_date date NOT NULL,
            dimension_type varchar(24) NOT NULL,
            dimension_hash char(64) NOT NULL,
            dimension_key varchar(255) NOT NULL DEFAULT '',
            label varchar(255) NOT NULL DEFAULT '',
            secondary_label varchar(255) NOT NULL DEFAULT '',
            tertiary_label varchar(255) NOT NULL DEFAULT '',
            views bigint(20) unsigned NOT NULL DEFAULT 0,
            visitors bigint(20) unsigned NOT NULL DEFAULT 0,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY date_dimension (visit_date,dimension_type,dimension_hash),
            KEY type_date_views (dimension_type,visit_date,views),
            KEY type_key_date (dimension_type,dimension_hash,visit_date)
        ) {$charset};";

        $sql_sessions = "CREATE TABLE {$sessions} (
            session_hash char(64) NOT NULL,
            visitor_hash char(64) NOT NULL,
            started_at datetime NOT NULL,
            last_seen_at datetime NOT NULL,
            ended_at datetime NULL,
            current_path varchar(255) NOT NULL DEFAULT '/',
            current_title varchar(255) NOT NULL DEFAULT '',
            device varchar(32) NOT NULL DEFAULT 'Outros',
            source varchar(32) NOT NULL DEFAULT 'Direto',
            city varchar(120) NOT NULL DEFAULT '',
            state varchar(120) NOT NULL DEFAULT '',
            country varchar(120) NOT NULL DEFAULT '',
            pageviews int unsigned NOT NULL DEFAULT 0,
            engaged_seconds int unsigned NOT NULL DEFAULT 0,
            is_visible tinyint(1) NOT NULL DEFAULT 1,
            PRIMARY KEY  (session_hash),
            KEY active_presence (is_visible,last_seen_at),
            KEY started_at (started_at),
            KEY visitor_hash (visitor_hash)
        ) {$charset};";

        dbDelta($sql_visits);
        dbDelta($sql_daily);
        dbDelta($sql_sessions);

        // Migração segura: a Key antiga continua funcionando, mas deixa de ficar em texto puro.
        $legacy_key = (string) get_option('leme_analytics_api_key', '');
        if ($legacy_key && !get_option('leme_analytics_api_key_hash')) {
            update_option('leme_analytics_api_key_hash', hash_hmac('sha256', $legacy_key, wp_salt('auth')), false);
            delete_option('leme_analytics_api_key');
        }
    }

    public static function clear_all() {
        global $wpdb;
        $wpdb->query('TRUNCATE TABLE `' . esc_sql(self::visits_table()) . '`');
        $wpdb->query('TRUNCATE TABLE `' . esc_sql(self::daily_table()) . '`');
        $wpdb->query('TRUNCATE TABLE `' . esc_sql(self::sessions_table()) . '`');
        delete_option('leme_analytics_first_collection');
        delete_option('leme_analytics_last_collection');
        delete_option('leme_analytics_total_views');
    }

    public static function status() {
        global $wpdb;
        $total = (int) $wpdb->get_var(
            $wpdb->prepare(
                'SELECT COALESCE(SUM(views),0) FROM `' . esc_sql(self::daily_table()) . '` WHERE dimension_type=%s',
                'all'
            )
        );
        return array(
            'version'          => LEME_ANALYTICS_VERSION,
            'collecting'       => '1' === (string) get_option('leme_analytics_collecting', '1'),
            'first_collection' => get_option('leme_analytics_first_collection') ?: null,
            'last_collection'  => get_option('leme_analytics_last_collection') ?: null,
            'total_records'    => $total,
            'api_status'       => 'online',
            'active_visitors'  => self::active_visitors(),
            'presence_window_seconds' => 60,
        );
    }

    public static function active_visitors() {
        global $wpdb;
        $cutoff = current_datetime()->modify('-60 seconds')->format('Y-m-d H:i:s');
        return (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM `" . esc_sql(self::sessions_table()) . "` WHERE is_visible=1 AND last_seen_at >= %s", $cutoff)
        );
    }

    public static function realtime() {
        global $wpdb;
        $table = self::sessions_table();
        $cutoff = current_datetime()->modify('-60 seconds')->format('Y-m-d H:i:s');
        $rows = $wpdb->get_results(
            $wpdb->prepare("SELECT current_path,current_title,device,source,city,state,last_seen_at,engaged_seconds,pageviews
             FROM {$table} WHERE is_visible=1 AND last_seen_at >= %s
             ORDER BY last_seen_at DESC LIMIT 100", $cutoff),
            ARRAY_A
        );
        return array(
            'active_visitors' => count($rows),
            'definition' => 'Sessões visíveis com sinal recebido nos últimos 60 segundos.',
            'heartbeat_seconds' => 15,
            'visitors' => array_map(function ($row) {
                return array(
                    'path' => $row['current_path'], 'title' => $row['current_title'],
                    'device' => $row['device'], 'source' => $row['source'],
                    'city' => $row['city'], 'state' => $row['state'],
                    'last_seen_at' => $row['last_seen_at'],
                    'engaged_seconds' => (int) $row['engaged_seconds'],
                    'pageviews' => (int) $row['pageviews'],
                );
            }, $rows),
        );
    }

    public static function touch_session($session) {
        global $wpdb;
        $table = self::sessions_table();
        $sql = $wpdb->prepare(
            "INSERT INTO {$table}
             (session_hash,visitor_hash,started_at,last_seen_at,ended_at,current_path,current_title,device,source,city,state,country,pageviews,engaged_seconds,is_visible)
             VALUES (%s,%s,%s,%s,NULL,%s,%s,%s,%s,%s,%s,%s,%d,%d,%d)
             ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at),ended_at=IF(VALUES(is_visible)=0,VALUES(last_seen_at),NULL),
             current_path=VALUES(current_path),current_title=VALUES(current_title),pageviews=pageviews+VALUES(pageviews),
             engaged_seconds=engaged_seconds+LEAST(VALUES(engaged_seconds),30),is_visible=VALUES(is_visible)",
            $session['session_hash'], $session['visitor_hash'], $session['now'], $session['now'],
            $session['path'], $session['title'], $session['device'], $session['source'],
            $session['city'], $session['state'], $session['country'],
            (int) $session['pageview_increment'], (int) $session['engaged_seconds'], (int) $session['is_visible']
        );
        $wpdb->query($sql);
        if (mt_rand(1, 100) === 1) {
            $cutoff = current_datetime()->modify('-90 days')->format('Y-m-d H:i:s');
            $wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE last_seen_at < %s", $cutoff));
        }
    }

    public static function insert_visit($visit) {
        global $wpdb;
        $visits = self::visits_table();
        $daily = self::daily_table();
        $date = $visit['visit_date'];
        $visitor_hash = $visit['visitor_hash'];

        $prior = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT path,city,state,country,source,device FROM {$visits} WHERE visit_date=%s AND visitor_hash=%s",
                $date,
                $visitor_hash
            ),
            ARRAY_A
        );

        $seen = array(
            'all'    => !empty($prior),
            'page'   => array(),
            'city'   => array(),
            'state'  => array(),
            'source' => array(),
            'device' => array(),
        );
        foreach ($prior as $row) {
            $seen['page'][$row['path']] = true;
            $seen['city'][self::city_key($row['city'], $row['state'], $row['country'])] = true;
            $seen['state'][$row['state']] = true;
            $seen['source'][$row['source']] = true;
            $seen['device'][$row['device']] = true;
        }

        $inserted = $wpdb->insert(
            $visits,
            array(
                'created_at'   => $visit['created_at'],
                'visit_date'   => $date,
                'page_id'      => $visit['page_id'],
                'page_title'   => $visit['page_title'],
                'page_url'     => $visit['page_url'],
                'path'         => $visit['path'],
                'city'         => $visit['city'],
                'state'        => $visit['state'],
                'country'      => $visit['country'],
                'device'       => $visit['device'],
                'source'       => $visit['source'],
                'referrer'     => $visit['referrer'],
                'visitor_hash' => $visitor_hash,
                'utm_source'   => $visit['utm_source'],
                'utm_medium'   => $visit['utm_medium'],
                'utm_campaign' => $visit['utm_campaign'],
                'event_uuid'   => $visit['event_uuid'],
                'session_hash' => $visit['session_hash'],
            ),
            array('%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s')
        );

        if (false === $inserted) {
            if (false !== stripos((string) $wpdb->last_error, 'duplicate')) return 'duplicate';
            return new WP_Error('leme_analytics_insert_failed', 'Não foi possível registrar o acesso.', array('status' => 500));
        }

        $dimensions = array(
            array('all', 'all', 'Todos os acessos', '', '', $seen['all']),
            array('page', $visit['path'], $visit['page_title'] ?: $visit['path'], $visit['page_url'], '', isset($seen['page'][$visit['path']])),
            array('city', self::city_key($visit['city'], $visit['state'], $visit['country']), $visit['city'] ?: 'Não identificada', $visit['state'], $visit['country'], isset($seen['city'][self::city_key($visit['city'], $visit['state'], $visit['country'])])),
            array('state', $visit['state'] ?: 'Não identificado', $visit['state'] ?: 'Não identificado', $visit['country'], '', isset($seen['state'][$visit['state']])),
            array('source', $visit['source'], $visit['source'], '', '', isset($seen['source'][$visit['source']])),
            array('device', $visit['device'], $visit['device'], '', '', isset($seen['device'][$visit['device']])),
        );

        foreach ($dimensions as $dimension) {
            self::upsert_daily($daily, $date, $dimension[0], $dimension[1], $dimension[2], $dimension[3], $dimension[4], $dimension[5] ? 0 : 1);
        }

        $now = current_time('mysql');
        if (!get_option('leme_analytics_first_collection')) {
            update_option('leme_analytics_first_collection', $now, false);
        }
        update_option('leme_analytics_last_collection', $now, false);
        update_option('leme_analytics_total_views', (int) get_option('leme_analytics_total_views', 0) + 1, false);
        return true;
    }

    private static function city_key($city, $state, $country) {
        return implode('|', array($city ?: 'Não identificada', $state ?: '', $country ?: ''));
    }

    private static function upsert_daily($table, $date, $type, $key, $label, $secondary, $tertiary, $visitor_increment) {
        global $wpdb;
        $hash = hash('sha256', $key);
        $sql = $wpdb->prepare(
            "INSERT INTO {$table}
                (visit_date,dimension_type,dimension_hash,dimension_key,label,secondary_label,tertiary_label,views,visitors,updated_at)
             VALUES (%s,%s,%s,%s,%s,%s,%s,1,%d,%s)
             ON DUPLICATE KEY UPDATE
                dimension_key=VALUES(dimension_key),label=VALUES(label),secondary_label=VALUES(secondary_label),
                tertiary_label=VALUES(tertiary_label),views=views+1,visitors=visitors+VALUES(visitors),updated_at=VALUES(updated_at)",
            $date,
            $type,
            $hash,
            self::truncate($key, 255),
            self::truncate($label, 255),
            self::truncate($secondary, 255),
            self::truncate($tertiary, 255),
            (int) $visitor_increment,
            current_time('mysql')
        );
        $wpdb->query($sql);
    }

    private static function truncate($value, $length) {
        $value = (string) $value;
        return function_exists('mb_substr') ? mb_substr($value, 0, $length) : substr($value, 0, $length);
    }
}
