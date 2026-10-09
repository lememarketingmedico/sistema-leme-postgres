<?php

defined('ABSPATH') || exit;

/**
 * Resolve somente a localização derivada. O IP recebido nunca é retornado nem
 * persistido. Instalações com GeoIP local podem usar o filtro documentado abaixo.
 */
final class LEME_Analytics_Geo_Location_Service {
    public function locate($temporary_ip) {
        $location = array(
            'city'    => $this->header('HTTP_CF_IPCITY'),
            'state'   => $this->header('HTTP_CF_REGION'),
            'country' => $this->header('HTTP_CF_IPCOUNTRY'),
        );

        /**
         * Permite integrar um banco GeoIP local sem criar dependência externa.
         * O callback deve retornar city, state e country. Não salve $temporary_ip.
         */
        $filtered = apply_filters('leme_analytics_geolocate_ip', $location, (string) $temporary_ip);
        if (is_array($filtered)) {
            $location = wp_parse_args($filtered, $location);
        }

        return array(
            'city'    => sanitize_text_field(wp_unslash($location['city'] ?? '')),
            'state'   => sanitize_text_field(wp_unslash($location['state'] ?? '')),
            'country' => strtoupper(substr(sanitize_text_field(wp_unslash($location['country'] ?? '')), 0, 3)),
        );
    }

    private function header($name) {
        return isset($_SERVER[$name]) ? sanitize_text_field(wp_unslash($_SERVER[$name])) : '';
    }
}

