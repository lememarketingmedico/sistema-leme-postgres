<?php
/**
 * Plugin Name: LEME Social Feed
 * Description: Galeria de publicações gerenciada pelo Sistema LEME, com armazenamento local e shortcode para Elementor.
 * Version: 1.1.0
 * Author: LEME Marketing Médico
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Text Domain: leme-social-feed
 */

if (!defined('ABSPATH')) exit;

final class LEME_Social_Feed {
    const VERSION = '1.1.0';
    const API_NS = 'leme-social/v1';
    const KEY_HASH = 'leme_social_feed_key_hash';
    const INSTALLATION = 'leme_social_feed_installation_id';
    const DATA = 'leme_social_feed_data';
    const LAST_SYNC = 'leme_social_feed_last_sync';
    const HISTORY = 'leme_social_feed_history';

    public static function boot() {
        register_activation_hook(__FILE__, array(__CLASS__, 'activate'));
        add_action('rest_api_init', array(__CLASS__, 'routes'));
        add_action('admin_menu', array(__CLASS__, 'admin_menu'));
        add_action('admin_post_leme_social_generate_key', array(__CLASS__, 'generate_key'));
        add_action('wp_enqueue_scripts', array(__CLASS__, 'register_assets'));
        add_shortcode('leme_social_feed', array(__CLASS__, 'shortcode'));
    }

    public static function activate() {
        if (!get_option(self::INSTALLATION)) update_option(self::INSTALLATION, wp_generate_uuid4(), false);
        if (!get_option(self::DATA)) update_option(self::DATA, array('version' => 0, 'request_id' => '', 'config' => self::defaults(), 'posts' => array()), false);
    }

    public static function defaults() {
        $defaults = array(
            'eyebrow' => 'INSTAGRAM', 'title' => 'Acompanhe nossas publicações.', 'description' => 'Conteúdos, orientações e novidades.',
            'instagram_username' => '', 'profile_url' => '', 'show_profile_button' => true, 'profile_button_text' => 'Ver perfil no Instagram',
            'show_card_button' => true, 'card_button_text' => 'Ver no Instagram', 'card_button_position' => 'left', 'card_button_translucent' => false, 'max_posts' => 6,
            'columns_desktop' => 3, 'columns_tablet' => 2, 'columns_mobile' => 2, 'gap' => 20, 'radius' => 10,
            'button_style' => 'solid', 'animations' => true, 'appearance_mode' => 'automatic',
            'colors' => array('background'=>'#f7f5f2','title'=>'#1c2b34','text'=>'#586771','primary'=>'#2f8fc0','button'=>'#2f8fc0','button_text'=>'#ffffff'),
            'fonts' => array('title'=>'inherit','body'=>'inherit')
        );
        return apply_filters('leme_social_feed_default_config', $defaults);
    }

    private static function response($data = array(), $status = 200) {
        return new WP_REST_Response(array('success' => true, 'data' => $data), $status);
    }

    private static function error($code, $message, $status = 400) {
        return new WP_Error($code, $message, array('status' => $status));
    }

    public static function authorize($request) {
        $hash = (string) get_option(self::KEY_HASH, '');
        $key = trim((string) $request->get_header('x-leme-key'));
        if (!$hash || !$key || !password_verify($key, $hash)) {
            $ip = sanitize_key(substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 80));
            $rate_key = 'leme_sf_fail_' . md5($ip);
            $attempts = (int) get_transient($rate_key) + 1;
            set_transient($rate_key, $attempts, MINUTE_IN_SECONDS);
            if ($attempts > 12) return self::error('leme_social_rate_limited', 'Muitas tentativas de autenticação.', 429);
            return self::error('leme_social_invalid_key', 'Chave de integração inválida.', 401);
        }
        return true;
    }

    public static function routes() {
        register_rest_route(self::API_NS, '/status', array('methods'=>'GET','callback'=>array(__CLASS__,'status'),'permission_callback'=>array(__CLASS__,'authorize')));
        register_rest_route(self::API_NS, '/feed', array(
            array('methods'=>'GET','callback'=>array(__CLASS__,'feed'),'permission_callback'=>array(__CLASS__,'authorize')),
            array('methods'=>'PUT','callback'=>array(__CLASS__,'update_feed'),'permission_callback'=>array(__CLASS__,'authorize')),
        ));
        register_rest_route(self::API_NS, '/media', array('methods'=>'POST','callback'=>array(__CLASS__,'media'),'permission_callback'=>array(__CLASS__,'authorize')));
    }

    public static function status() {
        $data = get_option(self::DATA, array());
        return self::response(array(
            'plugin' => 'LEME Social Feed', 'version' => self::VERSION,
            'installation_id' => get_option(self::INSTALLATION, ''),
            'published_version' => (int) ($data['version'] ?? 0),
            'posts' => count($data['posts'] ?? array()), 'last_sync' => get_option(self::LAST_SYNC, null),
            'shortcode' => '[leme_social_feed]'
        ));
    }

    public static function feed() {
        return self::response(get_option(self::DATA, array('version'=>0,'config'=>self::defaults(),'posts'=>array())));
    }

    public static function media($request) {
        if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) return self::error('leme_social_file_missing', 'Arquivo de imagem não recebido.');
        $file = $_FILES['file'];
        if ((int) $file['size'] > 8 * MB_IN_BYTES) return self::error('leme_social_file_too_large', 'A imagem ultrapassa o limite de 8 MB.', 413);
        $checked = wp_check_filetype_and_ext($file['tmp_name'], $file['name']);
        $allowed = array('image/jpeg','image/png','image/webp');
        if (empty($checked['type']) || !in_array($checked['type'], $allowed, true)) return self::error('leme_social_invalid_image', 'Envie somente JPG, PNG ou WebP.');
        $size = @getimagesize($file['tmp_name']);
        if (!$size || $size[0] < 320 || $size[1] < 400) return self::error('leme_social_invalid_dimensions', 'A imagem precisa ter pelo menos 320 × 400 pixels.');
        $hash = preg_replace('/[^a-f0-9]/', '', strtolower((string) $request->get_param('content_hash')));
        if (strlen($hash) !== 64 || !hash_equals($hash, hash_file('sha256', $file['tmp_name']))) return self::error('leme_social_hash_mismatch', 'A integridade da imagem não pôde ser confirmada.');
        $existing = get_posts(array('post_type'=>'attachment','post_status'=>'inherit','posts_per_page'=>1,'fields'=>'ids','meta_key'=>'_leme_social_hash','meta_value'=>$hash));
        if ($existing) return self::response(array('attachment_id'=>(int)$existing[0],'url'=>wp_get_attachment_url($existing[0]),'deduplicated'=>true));
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';
        $attachment_id = media_handle_upload('file', 0, array('post_title'=>sanitize_text_field(pathinfo($file['name'], PATHINFO_FILENAME))), array('test_form'=>false));
        if (is_wp_error($attachment_id)) return self::error('leme_social_upload_failed', $attachment_id->get_error_message(), 500);
        update_post_meta($attachment_id, '_leme_social_hash', $hash);
        update_post_meta($attachment_id, '_leme_social_external_id', sanitize_text_field((string)$request->get_param('external_id')));
        return self::response(array('attachment_id'=>(int)$attachment_id,'url'=>wp_get_attachment_url($attachment_id),'deduplicated'=>false), 201);
    }

    private static function instagram_url($value) {
        $url = esc_url_raw((string) $value, array('https'));
        $parts = wp_parse_url($url);
        $host = strtolower(preg_replace('/^www\./', '', (string)($parts['host'] ?? '')));
        if ($host !== 'instagram.com' || !preg_match('#^/(p|reel|reels)/[A-Za-z0-9_-]+/?$#', (string)($parts['path'] ?? ''))) return '';
        return 'https://www.instagram.com' . trailingslashit($parts['path']);
    }

    private static function sanitize_config($input) {
        $base = self::defaults(); $input = is_array($input) ? $input : array();
        $hex = function($value,$fallback){$clean=sanitize_hex_color($value);return $clean ?: $fallback;};
        $colors = is_array($input['colors'] ?? null) ? $input['colors'] : array();
        $fonts = is_array($input['fonts'] ?? null) ? $input['fonts'] : array();
        $font = function($value) {
            $clean = preg_replace('/[^a-z0-9 ,\.\'"_-]/i', '', (string) $value);
            return $clean !== '' ? substr($clean, 0, 100) : 'inherit';
        };
        $profile = esc_url_raw((string)($input['profile_url'] ?? ''), array('https'));
        if ($profile && strtolower(preg_replace('/^www\./','',(string)wp_parse_url($profile,PHP_URL_HOST))) !== 'instagram.com') $profile='';
        return array(
            'eyebrow'=>sanitize_text_field($input['eyebrow'] ?? $base['eyebrow']), 'title'=>sanitize_text_field($input['title'] ?? $base['title']), 'description'=>sanitize_textarea_field($input['description'] ?? ''),
            'instagram_username'=>preg_replace('/[^a-z0-9._]/i','',ltrim((string)($input['instagram_username']??''),'@')), 'profile_url'=>$profile,
            'show_profile_button'=>!empty($input['show_profile_button']), 'profile_button_text'=>sanitize_text_field($input['profile_button_text'] ?? $base['profile_button_text']),
            'show_card_button'=>!empty($input['show_card_button']), 'card_button_text'=>sanitize_text_field($input['card_button_text'] ?? $base['card_button_text']),
            'card_button_position'=>($input['card_button_position']??'')==='right'?'right':'left', 'card_button_translucent'=>!empty($input['card_button_translucent']), 'max_posts'=>min(24,max(1,absint($input['max_posts']??6))),
            'columns_desktop'=>min(4,max(1,absint($input['columns_desktop']??3))), 'columns_tablet'=>min(3,max(1,absint($input['columns_tablet']??2))), 'columns_mobile'=>min(2,max(1,absint($input['columns_mobile']??2))),
            'gap'=>min(48,max(0,absint($input['gap']??20))), 'radius'=>min(40,max(0,absint($input['radius']??10))),
            'button_style'=>in_array($input['button_style']??'',array('solid','outline','minimal'),true)?$input['button_style']:'solid', 'animations'=>!empty($input['animations']),
            'appearance_mode'=>($input['appearance_mode']??'')==='custom'?'custom':'automatic',
            'colors'=>array('background'=>$hex($colors['background']??'', $base['colors']['background']),'title'=>$hex($colors['title']??'', $base['colors']['title']),'text'=>$hex($colors['text']??'', $base['colors']['text']),'primary'=>$hex($colors['primary']??'', $base['colors']['primary']),'button'=>$hex($colors['button']??'', $base['colors']['button']),'button_text'=>$hex($colors['button_text']??'', $base['colors']['button_text'])),
            'fonts'=>array('title'=>$font($fonts['title']??'inherit'),'body'=>$font($fonts['body']??'inherit'))
        );
    }

    public static function update_feed($request) {
        $input = $request->get_json_params();
        if (!is_array($input)) return self::error('leme_social_invalid_payload', 'Conteúdo da sincronização inválido.');
        $version = absint($input['version'] ?? 0); $request_id = sanitize_key((string)($input['request_id'] ?? ''));
        $current = get_option(self::DATA, array('version'=>0,'request_id'=>'','posts'=>array()));
        $current_version = absint($current['version'] ?? 0);
        if ($version < $current_version) return self::error('leme_social_stale_version', 'Uma versão mais recente já está publicada.', 409);
        if ($version === $current_version && $request_id && hash_equals((string)($current['request_id']??''), $request_id)) return self::response(array('published_version'=>$current_version,'idempotent'=>true,'installation_id'=>get_option(self::INSTALLATION,''),'version'=>self::VERSION));
        if ($version === $current_version) return self::error('leme_social_version_conflict', 'Esta versão já foi publicada por outra requisição.', 409);
        $posts_input = is_array($input['posts'] ?? null) ? array_slice($input['posts'],0,24) : array(); $posts=array();
        foreach ($posts_input as $index=>$post) {
            $attachment_id = absint($post['attachment_id'] ?? 0); $attachment = get_post($attachment_id);
            if (!$attachment || $attachment->post_type !== 'attachment' || !wp_attachment_is_image($attachment_id)) return self::error('leme_social_invalid_attachment', 'Uma das imagens não está disponível no WordPress.', 409);
            $expected = preg_replace('/[^a-f0-9]/','',strtolower((string)($post['content_hash']??'')));
            if (!$expected || !hash_equals((string)get_post_meta($attachment_id,'_leme_social_hash',true),$expected)) return self::error('leme_social_attachment_mismatch', 'Uma imagem não corresponde ao arquivo validado.',409);
            $link = self::instagram_url($post['instagram_url'] ?? ''); if (!$link) return self::error('leme_social_invalid_instagram_url','Uma publicação possui link do Instagram inválido.');
            $alt = sanitize_text_field((string)($post['alt_text']??'')); update_post_meta($attachment_id,'_wp_attachment_image_alt',$alt);
            $posts[] = array('id'=>sanitize_key((string)($post['id']??$index)),'attachment_id'=>$attachment_id,'instagram_url'=>$link,'alt_text'=>$alt,'sort_order'=>$index,'crop_x'=>min(100,max(0,(float)($post['crop_x']??50))),'crop_y'=>min(100,max(0,(float)($post['crop_y']??50))),'content_hash'=>$expected);
        }
        $next = array('version'=>$version,'request_id'=>$request_id,'config'=>self::sanitize_config($input['config']??array()),'posts'=>$posts,'published_at'=>current_time('mysql',true));
        $history = get_option(self::HISTORY,array()); array_unshift($history,$current); update_option(self::HISTORY,array_slice(array_filter($history),0,5),false);
        update_option(self::DATA,$next,false); update_option(self::LAST_SYNC,current_time('mysql'),false);
        do_action('leme_social_feed_synced',$next); do_action('leme_social_feed_cache_purge');
        if (function_exists('rocket_clean_domain')) rocket_clean_domain();
        if (function_exists('wp_cache_clear_cache')) wp_cache_clear_cache();
        return self::response(array('published_version'=>$version,'posts'=>count($posts),'installation_id'=>get_option(self::INSTALLATION,''),'version'=>self::VERSION));
    }

    public static function register_assets() {
        wp_register_style('leme-social-feed', plugins_url('assets/social-feed.css', __FILE__), array(), self::VERSION);
        wp_add_inline_style('leme-social-feed', '.leme-social-feed{--leme-feed-bg:#f7f5f2;--leme-feed-title:var(--e-global-color-primary,#1c2b34);--leme-feed-text:var(--e-global-color-text,#586771)}.leme-card-button-right .leme-social-card-button{left:auto;right:14px}.leme-card-button-translucent .leme-social-card-button{background:rgba(8,20,40,.48);background:color-mix(in srgb,var(--leme-feed-button) 62%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}@media(max-width:600px){.leme-card-button-right .leme-social-card-button{right:8px}}');
        wp_register_script('leme-social-feed', plugins_url('assets/social-feed.js', __FILE__), array(), self::VERSION, true);
    }

    public static function shortcode($atts=array()) {
        $data = get_option(self::DATA,array()); $posts = array_slice($data['posts']??array(),0,absint($data['config']['max_posts']??6));
        if (!$posts) return '';
        $c = wp_parse_args($data['config']??array(), self::defaults()); $colors=wp_parse_args($c['colors']??array(),self::defaults()['colors']); $fonts=wp_parse_args($c['fonts']??array(),self::defaults()['fonts']);
        wp_enqueue_style('leme-social-feed'); if(!empty($c['animations'])) wp_enqueue_script('leme-social-feed');
        $style='--leme-feed-gap:'.absint($c['gap']).'px;--leme-feed-radius:'.absint($c['radius']).'px;--leme-feed-cols:'.absint($c['columns_desktop']).';--leme-feed-cols-tablet:'.absint($c['columns_tablet']).';--leme-feed-cols-mobile:'.absint($c['columns_mobile']).';';
        if(($c['appearance_mode']??'automatic')==='custom')$style.='--leme-feed-bg:'.$colors['background'].';--leme-feed-title:'.$colors['title'].';--leme-feed-text:'.$colors['text'].';--leme-feed-primary:'.$colors['primary'].';--leme-feed-button:'.$colors['button'].';--leme-feed-button-text:'.$colors['button_text'].';--leme-feed-title-font:'.$fonts['title'].';--leme-feed-body-font:'.$fonts['body'].';';
        ob_start(); ?>
        <section class="leme-social-feed <?php echo !empty($c['animations'])?'leme-social-animate':''; ?> leme-button-<?php echo esc_attr($c['button_style']); ?> leme-card-button-<?php echo esc_attr($c['card_button_position']); ?> <?php echo !empty($c['card_button_translucent'])?'leme-card-button-translucent':''; ?>" style="<?php echo esc_attr($style); ?>" data-leme-social-feed>
          <div class="leme-social-inner"><?php if(!empty($c['eyebrow'])):?><span class="leme-social-kicker"><?php echo esc_html($c['eyebrow']); ?></span><?php endif; ?><?php if(!empty($c['title'])):?><h2><?php echo esc_html($c['title']); ?></h2><?php endif; ?><?php if(!empty($c['description'])):?><p class="leme-social-description"><?php echo esc_html($c['description']); ?></p><?php endif; ?>
          <div class="leme-social-grid"><?php foreach($posts as $post): $id=absint($post['attachment_id']); ?><a class="leme-social-card" href="<?php echo esc_url($post['instagram_url']); ?>" target="_blank" rel="noopener noreferrer" aria-label="<?php echo esc_attr($post['alt_text']?:'Ver publicação no Instagram'); ?>"><?php echo wp_get_attachment_image($id,'large',false,array('class'=>'leme-social-image','loading'=>'lazy','decoding'=>'async','style'=>'object-position:'.(float)$post['crop_x'].'% '.(float)$post['crop_y'].'%;','alt'=>$post['alt_text'])); ?><?php if(!empty($c['show_card_button'])&&!empty($c['card_button_text'])):?><span class="leme-social-card-button"><?php echo esc_html($c['card_button_text']); ?></span><?php endif; ?></a><?php endforeach; ?></div>
          <?php if(!empty($c['show_profile_button'])&&!empty($c['profile_url'])&&!empty($c['profile_button_text'])):?><a class="leme-social-profile" href="<?php echo esc_url($c['profile_url']); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html($c['profile_button_text']); ?></a><?php endif; ?></div>
        </section><?php return ob_get_clean();
    }

    public static function admin_menu() { add_menu_page('LEME Social Feed','LEME Social Feed','manage_options','leme-social-feed',array(__CLASS__,'admin_page'),'dashicons-instagram',58); }
    public static function generate_key() {
        if(!current_user_can('manage_options'))wp_die('Sem permissão.');check_admin_referer('leme_social_generate_key');
        $key='leme_sf_'.wp_generate_password(48,false,false);update_option(self::KEY_HASH,password_hash($key,PASSWORD_DEFAULT),false);set_transient('leme_social_new_key_'.get_current_user_id(),$key,5*MINUTE_IN_SECONDS);wp_safe_redirect(admin_url('admin.php?page=leme-social-feed&key_generated=1'));exit;
    }
    public static function admin_page() {
        if(!current_user_can('manage_options'))return;$data=get_option(self::DATA,array());$posts=$data['posts']??array();$new_key=get_transient('leme_social_new_key_'.get_current_user_id());if($new_key)delete_transient('leme_social_new_key_'.get_current_user_id()); ?>
        <div class="wrap leme-social-admin"><h1>LEME Social Feed <small>v<?php echo esc_html(self::VERSION); ?></small></h1><p>Conecte este site ao Sistema LEME e use o shortcode em qualquer página ou widget do Elementor.</p>
        <?php if($new_key):?><div class="notice notice-success"><p><strong>Copie agora — esta chave não será exibida novamente:</strong></p><p><input id="leme-social-key" class="regular-text code" readonly value="<?php echo esc_attr($new_key); ?>"> <button class="button" onclick="navigator.clipboard.writeText(document.getElementById('leme-social-key').value)">Copiar</button></p></div><?php endif; ?>
        <div class="leme-admin-grid"><section class="card"><h2>Conexão</h2><table class="widefat striped"><tr><td>Status da chave</td><td><strong><?php echo get_option(self::KEY_HASH)?'Chave configurada':'Não configurada'; ?></strong></td></tr><tr><td>ID da instalação</td><td><code><?php echo esc_html(get_option(self::INSTALLATION,'')); ?></code></td></tr><tr><td>Última sincronização</td><td><?php echo esc_html(get_option(self::LAST_SYNC,'Nunca')); ?></td></tr><tr><td>Versão publicada</td><td><?php echo absint($data['version']??0); ?></td></tr><tr><td>Publicações</td><td><?php echo count($posts); ?></td></tr></table><form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" onsubmit="return confirm('Gerar uma nova chave desconectará a chave anterior. Continuar?')"><input type="hidden" name="action" value="leme_social_generate_key"><?php wp_nonce_field('leme_social_generate_key'); ?><p><button class="button button-primary"><?php echo get_option(self::KEY_HASH)?'Regenerar chave':'Gerar chave'; ?></button></p></form></section>
        <section class="card"><h2>Shortcode</h2><p>Adicione um widget de shortcode no Elementor, inclusive na versão gratuita:</p><p><input id="leme-shortcode" class="regular-text code" readonly value="[leme_social_feed]"> <button class="button" onclick="navigator.clipboard.writeText('[leme_social_feed]')">Copiar</button></p><h3>Diagnóstico</h3><p>REST API: <code><?php echo esc_html(rest_url(self::API_NS.'/status')); ?></code></p><p>Armazenamento: biblioteca de mídia local do WordPress.</p></section></div>
        <section class="card"><h2>Prévia das imagens recebidas</h2><?php if(!$posts):?><p>Nenhuma publicação sincronizada. A seção pública permanece totalmente oculta.</p><?php else:?><div class="leme-admin-preview"><?php foreach($posts as $post)echo wp_get_attachment_image(absint($post['attachment_id']),'thumbnail'); ?></div><?php endif; ?></section></div>
        <style>.leme-social-admin{max-width:1120px}.leme-social-admin>p{color:#5d6b74}.leme-social-admin .card{background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:20px;margin:18px 0;max-width:none}.leme-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.leme-admin-preview{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}.leme-admin-preview img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:8px}@media(max-width:782px){.leme-admin-grid{grid-template-columns:1fr}}</style><?php
    }
}

LEME_Social_Feed::boot();

