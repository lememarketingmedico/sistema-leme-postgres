<?php

defined('ABSPATH') || exit;

final class LEME_Analytics_Admin {
    public function __construct() {
        add_action('admin_menu', array($this, 'menu'));
        add_action('admin_post_leme_analytics_action', array($this, 'handle_action'));
        add_action('admin_notices', array($this, 'notice'));
        add_action('wp_ajax_leme_analytics_realtime', array($this, 'realtime'));
    }

    public function menu() {
        add_options_page(
            'LEME Analytics',
            'LEME Analytics',
            'manage_options',
            'leme-analytics',
            array($this, 'render')
        );
    }

    public function render() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Você não tem permissão para acessar esta página.', 'leme-analytics'));
        }
        $status = LEME_Analytics_DB::status();
        $key = (string) get_transient('leme_analytics_new_api_key_' . get_current_user_id());
        $active = !empty($status['collecting']);
        $track_admins = '1' === (string) get_option('leme_analytics_track_admins', '0');
        ?>
        <div class="wrap leme-analytics-admin">
            <h1>LEME Analytics</h1>
            <p class="description">Coleta própria do site e API segura para o Sistema LEME.</p>

            <div class="leme-status-grid">
                <?php $this->status_card('Plugin', 'Ativo', 'ok'); ?>
                <?php $this->status_card('Versão', LEME_ANALYTICS_VERSION); ?>
                <?php $this->status_card('Coleta', $active ? 'Ativa' : 'Pausada', $active ? 'ok' : 'warning'); ?>
                <?php $this->status_card('Status da API', 'Online', 'ok'); ?>
                <?php $this->status_card('Ativos agora', number_format_i18n((int) ($status['active_visitors'] ?? 0)), 'ok', 'leme-active-visitors'); ?>
                <?php $this->status_card('Total de acessos', number_format_i18n((int) $status['total_records'])); ?>
                <?php $this->status_card('Primeira coleta', $this->format_date($status['first_collection'])); ?>
                <?php $this->status_card('Última coleta', $this->format_date($status['last_collection'])); ?>
            </div>

            <section class="leme-panel">
                <h2>Integração com o Sistema LEME</h2>
                <p>A Key fica armazenada somente como hash. Ela é exibida uma única vez após a instalação ou regeneração.</p>
                <?php if ($key) : ?>
                    <label for="leme-api-key"><strong>Nova API Key — copie agora</strong></label>
                    <div class="leme-key-row">
                        <input id="leme-api-key" class="regular-text code" type="text" readonly value="<?php echo esc_attr($key); ?>">
                        <button type="button" class="button button-primary" id="leme-copy-key">Copiar Key</button>
                    </div>
                <?php else : ?>
                    <p><strong>Key configurada e protegida.</strong> Se o Sistema LEME não possuir uma cópia válida, regenere abaixo.</p>
                <?php endif; ?>
                <p><code><?php echo esc_html(rest_url('leme/v1/analytics/status')); ?></code></p>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" onsubmit="return confirm('Regenerar a Key? A integração atual deixará de funcionar até a nova Key ser salva no Sistema LEME.');">
                    <?php wp_nonce_field('leme_analytics_action'); ?>
                    <input type="hidden" name="action" value="leme_analytics_action">
                    <input type="hidden" name="operation" value="regenerate_key">
                    <button class="button" type="submit">Regenerar Key</button>
                </form>
            </section>

            <section class="leme-panel">
                <h2>Coleta</h2>
                <p>Bots e rotas técnicas não são contabilizados. Nenhum IP puro é armazenado.</p>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <?php wp_nonce_field('leme_analytics_action'); ?>
                    <input type="hidden" name="action" value="leme_analytics_action">
                    <input type="hidden" name="operation" value="toggle_collection">
                    <button class="button <?php echo $active ? '' : 'button-primary'; ?>" type="submit"><?php echo $active ? 'Desativar coleta' : 'Ativar coleta'; ?></button>
                </form>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <?php wp_nonce_field('leme_analytics_action'); ?>
                    <input type="hidden" name="action" value="leme_analytics_action">
                    <input type="hidden" name="operation" value="toggle_admin_tracking">
                    <button class="button" type="submit"><?php echo $track_admins ? 'Parar de contar administradores' : 'Modo de teste: contar administradores'; ?></button>
                    <p class="description"><?php echo $track_admins ? 'Modo de teste ativo. Seus próprios acessos entram nas métricas.' : 'Por padrão, administradores logados são excluídos. Ative temporariamente para testar o tempo real sem janela anônima.'; ?></p>
                </form>
            </section>

            <section class="leme-panel leme-danger-panel">
                <h2>Limpar dados</h2>
                <p>Apaga definitivamente os acessos e agregados do plugin. A Key e as configurações serão mantidas.</p>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" onsubmit="return confirm('Tem certeza? Todos os dados de Analytics deste site serão apagados definitivamente.');">
                    <?php wp_nonce_field('leme_analytics_action'); ?>
                    <input type="hidden" name="action" value="leme_analytics_action">
                    <input type="hidden" name="operation" value="clear_data">
                    <button class="button button-link-delete" type="submit">Limpar todos os dados</button>
                </form>
            </section>
        </div>
        <style>
            .leme-analytics-admin{max-width:1050px}.leme-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:22px 0}.leme-status-card,.leme-panel{background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:18px;box-shadow:0 4px 18px rgba(0,0,0,.035)}.leme-status-card small{display:block;color:#646970;font-weight:700;margin-bottom:8px}.leme-status-card strong{font-size:20px}.leme-status-card.ok{border-left:4px solid #1f8f55}.leme-status-card.warning{border-left:4px solid #dba617}.leme-panel{margin-top:16px}.leme-panel h2{margin-top:0}.leme-key-row{display:flex;gap:8px;align-items:center;margin:8px 0}.leme-key-row input{width:min(560px,100%)}.leme-panel form{margin-top:14px}.leme-danger-panel{border-color:#e7b6b6}@media(max-width:600px){.leme-key-row{align-items:stretch;flex-direction:column}}
        </style>
        <script>
            document.getElementById('leme-copy-key')?.addEventListener('click', async function () {
                const input = document.getElementById('leme-api-key');
                try { await navigator.clipboard.writeText(input.value); this.textContent = 'Key copiada'; }
                catch (error) { input.select(); document.execCommand('copy'); this.textContent = 'Key copiada'; }
                window.setTimeout(() => { this.textContent = 'Copiar Key'; }, 1800);
            });
            (function refreshRealtime() {
                const body = new URLSearchParams({ action: 'leme_analytics_realtime', nonce: '<?php echo esc_js(wp_create_nonce('leme_analytics_realtime')); ?>' });
                fetch(ajaxurl, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: body.toString() })
                    .then(response => response.json()).then(payload => {
                        const target = document.getElementById('leme-active-visitors');
                        if (target && payload?.success) target.textContent = String(payload.data?.active_visitors || 0);
                    }).catch(() => {}).finally(() => window.setTimeout(refreshRealtime, 15000));
            })();
        </script>
        <?php
    }

    public function handle_action() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Operação não autorizada.', 'leme-analytics'));
        }
        check_admin_referer('leme_analytics_action');
        $operation = sanitize_key(wp_unslash($_POST['operation'] ?? ''));
        $message = 'updated';
        if ('regenerate_key' === $operation) {
            LEME_Analytics::store_new_api_key(LEME_Analytics::generate_api_key());
            $message = 'key_regenerated';
        } elseif ('toggle_collection' === $operation) {
            $enabled = '1' === (string) get_option('leme_analytics_collecting', '1');
            update_option('leme_analytics_collecting', $enabled ? '0' : '1', false);
            $message = $enabled ? 'collection_disabled' : 'collection_enabled';
        } elseif ('toggle_admin_tracking' === $operation) {
            $enabled = '1' === (string) get_option('leme_analytics_track_admins', '0');
            update_option('leme_analytics_track_admins', $enabled ? '0' : '1', false);
            $message = $enabled ? 'admin_tracking_disabled' : 'admin_tracking_enabled';
        } elseif ('clear_data' === $operation) {
            LEME_Analytics_DB::clear_all();
            $message = 'data_cleared';
        }
        wp_safe_redirect(add_query_arg(array('page' => 'leme-analytics', 'leme_notice' => $message), admin_url('options-general.php')));
        exit;
    }

    public function notice() {
        if (!isset($_GET['page']) || 'leme-analytics' !== $_GET['page'] || empty($_GET['leme_notice'])) {
            return;
        }
        $messages = array(
            'key_regenerated'     => 'Nova Key gerada. Atualize a integração no Sistema LEME.',
            'collection_disabled' => 'Coleta pausada.',
            'collection_enabled'  => 'Coleta ativada.',
            'admin_tracking_enabled' => 'Modo de teste ativo: administradores serão contabilizados.',
            'admin_tracking_disabled' => 'Modo de teste encerrado: administradores voltaram a ser excluídos.',
            'data_cleared'        => 'Os dados de Analytics foram apagados.',
            'updated'             => 'Configuração atualizada.',
        );
        $key = sanitize_key(wp_unslash($_GET['leme_notice']));
        if (isset($messages[$key])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html($messages[$key]) . '</p></div>';
        }
    }

    public function realtime() {
        if (!current_user_can('manage_options') || !check_ajax_referer('leme_analytics_realtime', 'nonce', false)) {
            wp_send_json_error(array('message' => 'Não autorizado.'), 403);
        }
        wp_send_json_success(LEME_Analytics_DB::realtime());
    }

    private function status_card($label, $value, $class = '', $id = '') {
        echo '<div class="leme-status-card ' . esc_attr($class) . '"><small>' . esc_html($label) . '</small><strong' . ($id ? ' id="' . esc_attr($id) . '"' : '') . '>' . esc_html($value) . '</strong></div>';
    }

    private function format_date($value) {
        if (!$value) {
            return 'Ainda não registrada';
        }
        $timestamp = strtotime($value);
        return $timestamp ? wp_date('d/m/Y H:i', $timestamp) : (string) $value;
    }
}

