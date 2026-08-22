(() => {
  const VERSION = '112.7';
  const LIGHT_BG = '#fbfaf7';
  const DARK_BG = '#0e1d2a';

  const text = value => value === undefined || value === null ? '' : String(value);
  const html = value => {
    try { return escapeHtml(text(value)); }
    catch { return text(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])); }
  };
  const attr = value => {
    try { return escapeAttr(text(value)); }
    catch { return html(value); }
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));

  function slotValue(draft, slot, primaryKey, secondaryKey, fallback = '') {
    return slot === 'secondary' ? (draft?.[secondaryKey] ?? fallback) : (draft?.[primaryKey] ?? fallback);
  }

  function isVideoDraft(draft, slot = 'primary') {
    const type = text(slotValue(draft, slot, 'imageMediaType', 'image2MediaType', '')).toLowerCase();
    const src = text(slotValue(draft, slot, 'imageDataUrl', 'image2DataUrl', ''));
    return type === 'video' || /^data:video\//i.test(src) || /\/media\/leme-art-video\//i.test(src);
  }

  function decorateRawMedia(media, draft, slot = 'primary') {
    if (!media) return media;
    try {
      media.__lemeTemplate = text(draft?.template);
      media.__lemeFrameHeightPercent = Number(draft?.mediaFrameHeight || 100);
      media.__lemeCropPosition = {
        x: clamp(slotValue(draft, slot, 'imagePositionX', 'image2PositionX', 50), 0, 100),
        y: clamp(slotValue(draft, slot, 'imagePositionY', 'image2PositionY', 50), 0, 100)
      };
      media.__lemeZoom = clamp(slotValue(draft, slot, 'imageZoom', 'image2Zoom', 100), 5, 300);
    } catch {}
    return media;
  }

  async function loadOriginalStaticMedia(draft, slot = 'primary') {
    const src = text(slotValue(draft, slot, 'imageDataUrl', 'image2DataUrl', ''));
    if (!src) return null;
    const key = slot === 'secondary' ? 'image2Element' : 'imageElement';
    let current = draft?.[key] || null;

    // Canvas = imagem já achatada por alguma versão anterior. Nunca reutilizar.
    const tag = text(current?.tagName).toUpperCase();
    if (!current || tag === 'CANVAS' || tag === 'VIDEO') {
      current = await loadLemeArtImageSource(src);
      try { draft[key] = current; } catch {}
    }
    return decorateRawMedia(current, draft, slot);
  }

  // Para imagens estáticas, ignora completamente as composições de fundo das
  // versões anteriores e lê sempre a imagem original, preservando o canal alpha.
  const previousGetMedia = window.getLemeArtUserImage || getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    const safeDraft = draft && typeof draft === 'object' ? draft : {};
    if (isVideoDraft(safeDraft, slot)) return previousGetMedia(safeDraft, slot);
    try {
      return await loadOriginalStaticMedia(safeDraft, slot);
    } catch (error) {
      console.warn('V112.7: não foi possível carregar a imagem original; usando fallback.', error);
      const fallback = await previousGetMedia(safeDraft, slot);
      return decorateRawMedia(fallback, safeDraft, slot);
    }
  };
  window.getLemeArtUserImage = getLemeArtUserImage;

  function pixelAt(ctx, x, y) {
    try {
      const maxX = Math.max(0, Number(ctx?.canvas?.width || 1) - 1);
      const maxY = Math.max(0, Number(ctx?.canvas?.height || 1) - 1);
      const px = clamp(Math.round(x), 0, maxX);
      const py = clamp(Math.round(y), 0, maxY);
      const data = ctx.getImageData(px, py, 1, 1).data;
      if (!data || data[3] < 16) return '';
      return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
    } catch { return ''; }
  }

  function canvasBackground(ctx, x, y, width, height, media) {
    const template = text(media?.__lemeTemplate).toLowerCase();
    const cw = Number(ctx?.canvas?.width || 1);
    const ch = Number(ctx?.canvas?.height || 1);

    // Primeiro tentamos pixels imediatamente FORA da moldura. Isso faz a
    // moldura herdar exatamente o fundo que já está desenhado na arte.
    const candidates = [
      [x - 5, y + height / 2],
      [x + width + 5, y + height / 2],
      [x + width / 2, y - 5],
      [x + width / 2, y + height + 5],
      [4, 4],
      [cw - 5, 4],
      [4, ch - 5]
    ];
    for (const [px, py] of candidates) {
      if (px < 0 || py < 0 || px >= cw || py >= ch) continue;
      const value = pixelAt(ctx, px, py);
      if (value) return value;
    }

    if (template.includes('dark')) return DARK_BG;
    return LIGHT_BG;
  }

  const previousDrawCover = window.drawLemeArtImageCover || drawLemeArtImageCover;
  drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
    // A moldura inteira recebe PRIMEIRO o mesmo fundo da arte. A imagem original
    // é desenhada depois, então qualquer transparência revela esse fundo.
    const background = canvasBackground(ctx, x, y, width, height, media);
    ctx.save();
    try {
      roundedLemeArtRect(ctx, x, y, width, height, radius);
      ctx.fillStyle = background;
      ctx.fill();
    } finally {
      ctx.restore();
    }
    return previousDrawCover(ctx, media, x, y, width, height, radius);
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  function draftAppearance(draft = {}) {
    const template = text(draft.template).toLowerCase();
    return template.includes('dark') || Boolean(draft.artDarkMode) ? DARK_BG : LIGHT_BG;
  }

  function applyEditorMediaBackground(scope) {
    let draft = {};
    try { draft = getLemeArtDraft(scope) || {}; } catch {}
    const bg = draftAppearance(draft);
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => {
      if (text(editor.dataset.lemeArtEditor || 'page') !== text(scope)) return;
      editor.style.setProperty('--leme-media-frame-bg', bg);
      editor.dataset.lemeMediaTheme = bg === DARK_BG ? 'dark' : 'light';
    });
  }

  const previousSyncImages = window.syncLemeArtImageControls || syncLemeArtImageControls;
  window.syncLemeArtImageControls = function(scope = 'page') {
    const result = previousSyncImages(scope);
    requestAnimationFrame(() => applyEditorMediaBackground(scope));
    return result;
  };
  syncLemeArtImageControls = window.syncLemeArtImageControls;

  const previousSetTemplate = window.setLemeArtTemplate || setLemeArtTemplate;
  window.setLemeArtTemplate = function(scope, value) {
    const result = previousSetTemplate(scope, value);
    requestAnimationFrame(() => applyEditorMediaBackground(scope));
    return result;
  };
  setLemeArtTemplate = window.setLemeArtTemplate;

  // ---------------------------------------------------------------------------
  // Informações da LEME — renderer independente e defensivo.
  // ---------------------------------------------------------------------------
  function safeProfile() {
    try {
      const value = getLemeProfile();
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) {
      console.error('V112.7: falha ao ler Informações LEME.', error);
      return {};
    }
  }

  function safeLemePosts() {
    try {
      const list = getPosts();
      if (!Array.isArray(list)) return [];
      return list.filter(post => text(post?.cliente_id) === text(LEME_CLIENT_ID || 'leme-interno'));
    } catch (error) {
      console.error('V112.7: falha ao ler publicações da LEME.', error);
      return [];
    }
  }

  function passwordField(id, value) {
    return `<div class="password-field"><input class="input" type="password" id="${attr(id)}" value="${attr(value)}" autocomplete="new-password"><button type="button" onclick="togglePasswordVisibility('${attr(id)}',this)">Ver</button></div>`;
  }

  function inputField(label, id, value, placeholder = '', full = false) {
    return `<label class="${full ? 'full' : ''}">${html(label)}<input class="input" id="${attr(id)}" value="${attr(value)}" ${placeholder ? `placeholder="${attr(placeholder)}"` : ''}></label>`;
  }

  function passwordLabel(label, id, value, full = false) {
    return `<label class="${full ? 'full' : ''}">${html(label)}${passwordField(id, value)}</label>`;
  }

  function infoSection(title, description, content) {
    return `<div class="client-form-section full"><div class="client-section-title"><span>${html(title)}</span><small>${html(description)}</small></div><div class="client-section-grid">${content}</div></div>`;
  }

  function summaryMetric(label, value, hint) {
    return `<div class="metric card"><small>${html(label)}</small><strong>${html(value)}</strong><span>${html(hint)}</span></div>`;
  }

  function renderSafeLemeInformation(profile, posts) {
    const list = Array.isArray(posts) ? posts : [];
    const p = profile && typeof profile === 'object' ? profile : {};
    const ongoing = list.filter(post => normalizeSystemStatus(post?.status) === 'Em andamento').length;
    const published = list.filter(post => normalizeSystemStatus(post?.status) === 'Publicado').length;

    return `
      <section class="grid cols-3 leme-summary-grid">
        ${summaryMetric('Publicações', list.length, 'Total organizado no calendário da LEME')}
        ${summaryMetric('Em andamento', ongoing, 'Conteúdos em produção')}
        ${summaryMetric('Publicadas', published, 'Conteúdos já finalizados')}
      </section>

      <section class="card" style="margin-top:18px;" data-leme-info-form="true" oninput="markLemeInfoDirty()" onchange="markLemeInfoDirty()">
        <div class="section-title"><div><h2>Informações da LEME</h2><small>Acessos, links e dados internos da agência.</small></div></div>
        <div class="client-form-grid">
          ${infoSection('Dados principais','Identificação e contatos gerais da LEME.',
            inputField('Nome','leme_nome',p.nome || 'LEME') +
            inputField('Razão social','leme_razao_social',p.razao_social) +
            inputField('CNPJ','leme_cnpj',p.cnpj) +
            inputField('Telefone / WhatsApp','leme_telefone',p.telefone) +
            inputField('E-mail de contato','leme_email_contato',p.email_contato) +
            inputField('Site','leme_site',p.site,'https://...') +
            inputField('Endereço','leme_endereco',p.endereco,'',true))}

          ${infoSection('Redes sociais e Meta','Perfis, logins e painel do Meta Business.',
            inputField('Instagram / @','leme_instagram',p.instagram) +
            inputField('Login Instagram','leme_instagram_login',p.instagram_login) +
            passwordLabel('Senha Instagram','leme_instagram_senha',p.instagram_senha) +
            inputField('Facebook / Página','leme_facebook',p.facebook) +
            inputField('Login Facebook','leme_facebook_login',p.facebook_login) +
            passwordLabel('Senha Facebook','leme_facebook_senha',p.facebook_senha) +
            inputField('Meta Business Suite','leme_meta_business_url',p.meta_business_url,'https://business.facebook.com/...',true))}

          ${infoSection('Google','Conta principal e atalhos dos serviços Google.',
            inputField('E-mail Google','leme_google_email',p.google_email) +
            passwordLabel('Senha Google','leme_google_senha',p.google_senha) +
            inputField('Drive da LEME','leme_drive_url',p.drive_url,'https://drive.google.com/...') +
            inputField('Perfil da Empresa / GBP','leme_google_business_url',p.google_business_url) +
            inputField('Google Ads','leme_google_ads_url',p.google_ads_url) +
            inputField('Analytics / Search Console','leme_analytics_url',p.analytics_url))}

          ${infoSection('Site e infraestrutura','Domínio, WordPress, Registro.br e hospedagem.',
            inputField('Domínio','leme_dominio',p.dominio) +
            inputField('URL WordPress','leme_wordpress_url',p.wordpress_url) +
            inputField('Login WordPress','leme_wordpress_login',p.wordpress_login) +
            passwordLabel('Senha WordPress','leme_wordpress_senha',p.wordpress_senha) +
            inputField('Login Registro.br','leme_registrobr_login',p.registrobr_login) +
            passwordLabel('Senha Registro.br','leme_registrobr_senha',p.registrobr_senha) +
            inputField('URL EasyPanel','leme_easypanel_url',p.easypanel_url) +
            inputField('Login EasyPanel','leme_easypanel_login',p.easypanel_login) +
            passwordLabel('Senha EasyPanel','leme_easypanel_senha',p.easypanel_senha))}

          ${infoSection('Ferramentas internas','Atalhos e acessos de produção e automação.',
            inputField('Canva','leme_canva_url',p.canva_url) +
            inputField('Login Canva','leme_canva_login',p.canva_login) +
            passwordLabel('Senha Canva','leme_canva_senha',p.canva_senha) +
            inputField('n8n','leme_n8n_url',p.n8n_url) +
            inputField('Login n8n','leme_n8n_login',p.n8n_login) +
            passwordLabel('Senha n8n','leme_n8n_senha',p.n8n_senha) +
            inputField('Repositório GitHub','leme_github_url',p.github_url) +
            inputField('Usuário GitHub','leme_github_login',p.github_login) +
            passwordLabel('Token / chave GitHub','leme_github_token',p.github_token) +
            inputField('Projeto da LEME no ChatGPT','leme_chatgpt_project_url',p.chatgpt_project_url,'https://chatgpt.com/...',true))}

          <label class="full">Observações e outros acessos<textarea class="textarea" id="leme_observacoes" rows="5" placeholder="Registre aqui informações adicionais da LEME.">${html(p.observacoes)}</textarea></label>
        </div>
        <div class="actions"><button class="btn" type="button" onclick="saveLemeInformation()">Salvar informações da LEME</button></div>
      </section>`;
  }

  function renderSafeLemeInfoPage() {
    const profile = safeProfile();
    const posts = safeLemePosts();
    return `
      <section class="topbar leme-page-topbar">
        <div><p class="eyebrow">LEME</p><h1>Calendário LEME</h1><p style="margin:8px 0 0;color:var(--muted);">Gestão editorial e informações internas da LEME.</p></div>
        <div class="actions" style="margin-top:0;"><button class="btn" onclick="openPostModal('${attr(LEME_CLIENT_ID || 'leme-interno')}')">Nova publicação</button></div>
      </section>
      <div class="tabs leme-tabs">
        <button onclick="setLemeTab('calendario')">Calendário</button>
        <button class="active" onclick="setLemeTab('infos')">Informações da LEME</button>
        <button onclick="setLemeTab('artes')">Artes</button>
      </div>
      ${renderSafeLemeInformation(profile, posts)}`;
  }

  const previousRenderLemePage = renderLemePage;
  renderLemePage = function() {
    if (state?.lemeTab !== 'infos') return previousRenderLemePage();
    try {
      return renderSafeLemeInfoPage();
    } catch (error) {
      console.error('V112.7: falha no renderer seguro de Informações LEME.', error);
      return `<section class="card"><h2>Informações da LEME</h2><p>Não foi possível montar a tela completa.</p><button class="btn" onclick="setLemeTab('calendario')">Voltar ao calendário</button></section>`;
    }
  };
  window.renderLemePage = renderLemePage;

  window.__LEME_MEDIA_INFO_FIX_VERSION__ = VERSION;
})();
