<?php

defined('WP_UNINSTALL_PLUGIN') || exit;

// Por segurança, a desinstalação preserva o histórico. Para remoção total,
// defina LEME_ANALYTICS_REMOVE_DATA como true no wp-config.php antes de excluir.
if (!defined('LEME_ANALYTICS_REMOVE_DATA') || true !== LEME_ANALYTICS_REMOVE_DATA) {
    return;
}

global $wpdb;
$wpdb->query('DROP TABLE IF EXISTS `' . esc_sql($wpdb->prefix . 'leme_analytics_visits') . '`');
$wpdb->query('DROP TABLE IF EXISTS `' . esc_sql($wpdb->prefix . 'leme_analytics_daily') . '`');
$wpdb->query('DROP TABLE IF EXISTS `' . esc_sql($wpdb->prefix . 'leme_analytics_sessions') . '`');
delete_option('leme_analytics_api_key');
delete_option('leme_analytics_api_key_hash');
delete_option('leme_analytics_collecting');
delete_option('leme_analytics_track_admins');
delete_option('leme_analytics_version');
delete_option('leme_analytics_first_collection');
delete_option('leme_analytics_last_collection');
delete_option('leme_analytics_total_views');

