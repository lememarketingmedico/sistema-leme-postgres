(() => {
  const TEMPLATE = 'reels-box';
  const VERSION = '111.8';
  const LOGO_ASSET = 'logo-horizontal-white.png?v=111.8';
  const DEFAULT_TEXT_COLOR = '#111111';
  const DEFAULT_BOX_COLOR = '#ffffff';
  const DEFAULT_HIGHLIGHT = '#52a4d5';
  const DEFAULT_TEXT_Y = 60;
  const DEFAULT_LOGO_Y = 93;
  const DEFAULT_FONT = 'poppins';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const normalizeColor = (value, fallback) => {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
    return fallback;
  };
  const normalizeFont = value => String(value || '').toLowerCase() === 'anton' ? 'anton' : 'poppins';
  const isReels = draft => String(draft?.template || '') === TEMPLATE;
  const isVideoSource = (src, type = '') => String(type || '').toLowerCase() === 'video' || /^data:video\//i.test(String(src || '')) || /^\/media\/leme-art\//.test(String(src || '')) || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(String(src || ''));

  LEME_ART_TEMPLATES[TEMPLATE] = 'Reels · caixa adaptável';
  LEME_ART_BASE_FONT_SIZES[TEMPLATE] = 126;

  function enhance(draft, source = {}) {
    if (!draft || typeof draft !== 'object') return draft;
    draft.reelsFontFamily = normalizeFont(draft.reelsFontFamily ?? source.reelsFontFamily ?? source.arte_reels_font ?? DEFAULT_FONT);
    draft.reelsTextColor = normalizeColor(draft.reelsTextColor ?? source.reelsTextColor ?? source.arte_reels_text_color, DEFAULT_TEXT_COLOR);
    draft.reelsBoxColor = normalizeColor(draft.reelsBoxColor ?? source.reelsBoxColor ?? source.arte_reels_box_color, DEFAULT_BOX_COLOR);
    draft.reelsTextY = clamp(draft.reelsTextY ?? source.reelsTextY ?? source.arte_reels_text_y ?? DEFAULT_TEXT_Y, 10, 90);
    draft.reelsLogoY = clamp(draft.reelsLogoY ?? source.reelsLogoY ?? source.arte_reels_logo_y ?? DEFAULT_LOGO_Y, 72, 98);
    draft.highlightColor = normalizeColor(draft.highlightColor ?? source.highlightColor ?? source.arte_cor_destaque, DEFAULT_HIGHLIGHT);
    if (isReels(draft)) draft.format = 'story';
    return draft;
  }

  const previousCreateDraft = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) {
    const draft = previousCreateDraft(data, defaults);
    return enhance(draft, { ...defaults, ...data });
  };

  const previousGetDraft = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') {
    return enhance(previousGetDraft(scope));
  };

  const previousPrepareModal = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    const draft = previousPrepareModal(post);
    return enhance(draft, post || {});
  };

  const previousCollectPost = collectPost;
  collectPost = function() {
    const record = previousCollectPost();
    if (String(record.cliente_id || '') !== String(LEME_CLIENT_ID)) return record;
    const draft = enhance(getLemeArtDraft('modal'));
    return {
      ...record,
      arte_reels_font: draft.reelsFontFamily,
      arte_reels_text_color: draft.reelsTextColor,
      arte_reels_box_color: draft.reelsBoxColor,
      arte_reels_text_y: draft.reelsTextY,
      arte_reels_logo_y: draft.reelsLogoY
    };
  };

  const previousSerializeSlides = serializeLemeArtCarouselSlides;
  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    return previousSerializeSlides(scope).map(slide => ({
      ...slide,
      reelsFontFamily: normalizeFont(slide.reelsFontFamily || DEFAULT_FONT),
      reelsTextColor: normalizeColor(slide.reelsTextColor, DEFAULT_TEXT_COLOR),
      reelsBoxColor: normalizeColor(slide.reelsBoxColor, DEFAULT_BOX_COLOR),
      reelsTextY: clamp(slide.reelsTextY ?? DEFAULT_TEXT_Y, 10, 90),
      reelsLogoY: clamp(slide.reelsLogoY ?? DEFAULT_LOGO_Y, 72, 98)
    }));
  };

  function formatColorInput(scope, field, label, value, setter) {
    const normalized = normalizeColor(value, field === 'text' ? DEFAULT_TEXT_COLOR : DEFAULT_BOX_COLOR);
    return `<div class="leme-reels-color-row">
      <div><strong>${escapeHtml(label)}</strong></div>
      <div class="leme-reels-color-picker">
        <input type="color" value="${normalized}" oninput="${setter}('${escapeAttr(scope)}',this.value)">
        <input class="input" value="${normalized.toUpperCase()}" maxlength="7" onchange="${setter}('${escapeAttr(scope)}',this.value)">
      </div>
    </div>`;
  }

  function timelineMarkup(scope) {
    const prefix = `leme_art_${scope}_reels`;
    return `<div id="${prefix}_trim_box" class="leme-v1115-trim-box hidden">
      <button class="btn secondary small" type="button" onclick="toggleLemeTimeline1117('${escapeAttr(scope)}','reels','primary')">✂ Cortar vídeo</button>
      <div id="${prefix}_timeline_panel" class="leme-v1115-timeline-panel hidden">
        <div class="leme-v1115-timeline-meta">
          <strong id="${prefix}_timeline_selection">Trecho selecionado</strong>
          <span id="${prefix}_timeline_duration"></span>
        </div>
        <div class="leme-v1115-timeline" id="${prefix}_timeline">
          <div class="leme-v1115-filmstrip" id="${prefix}_filmstrip"><span class="leme-v1115-filmstrip-loading">Abra para gerar a prévia</span></div>
          <div class="leme-v1115-dim leme-v1115-dim-left" id="${prefix}_dim_left"></div>
          <div class="leme-v1115-dim leme-v1115-dim-right" id="${prefix}_dim_right"></div>
          <div class="leme-v1115-selection" id="${prefix}_selection"></div>
          <button type="button" class="leme-v1115-handle leme-v1115-handle-start" id="${prefix}_handle_start" onpointerdown="beginLemeTimelineDrag(event,'${escapeAttr(scope)}','reels','primary','start')" aria-label="Arrastar começo do vídeo"></button>
          <button type="button" class="leme-v1115-handle leme-v1115-handle-end" id="${prefix}_handle_end" onpointerdown="beginLemeTimelineDrag(event,'${escapeAttr(scope)}','reels','primary','end')" aria-label="Arrastar final do vídeo"></button>
        </div>
        <div class="leme-v1115-timeline-times"><span id="${prefix}_start_time"></span><span id="${prefix}_end_time"></span></div>
        <small>Arraste as bordas para escolher exatamente o trecho que será exportado.</small>
      </div>
    </div>`;
  }

  function renderReelsControls(scope) {
    const draft = enhance(getLemeArtDraft(scope));
    const show = isReels(draft);
    return `<div id="leme_art_${scope}_reels_group" class="leme-reels-group ${show ? '' : 'hidden'}">
      <div class="leme-reels-heading">
        <strong>Reels · caixa adaptável</strong>
        <small>Vídeo em tela cheia, sem gradiente, com caixa de texto ajustada automaticamente ao conteúdo.</small>
      </div>

      ${renderLemeArtImageDropzone(scope, 'reels', 'primary', 'Vídeo de fundo', TEMPLATE, draft)}

      <div class="leme-art-position-card">
        <div class="leme-art-position-title"><strong>Posicionar vídeo</strong><button class="btn secondary small" type="button" onclick="centerLemeArtImage('${escapeAttr(scope)}','primary')">Centralizar</button></div>
        <label>Horizontal <span>${Math.round(Number(draft.imagePositionX || 50))}%</span><input type="range" min="0" max="100" step="1" value="${Number(draft.imagePositionX || 50)}" oninput="setLemeArtImagePosition('${escapeAttr(scope)}','primary','x',this.value);this.previousElementSibling.textContent=Math.round(this.value)+'%'"></label>
        <label>Vertical <span>${Math.round(Number(draft.imagePositionY || 50))}%</span><input type="range" min="0" max="100" step="1" value="${Number(draft.imagePositionY || 50)}" oninput="setLemeArtImagePosition('${escapeAttr(scope)}','primary','y',this.value);this.previousElementSibling.textContent=Math.round(this.value)+'%'"></label>
      </div>

      ${timelineMarkup(scope)}

      <div class="leme-reels-grid">
        <label>Fonte
          <select class="select" onchange="setLemeReelsFont('${escapeAttr(scope)}',this.value)">
            <option value="poppins" ${draft.reelsFontFamily === 'poppins' ? 'selected' : ''}>Poppins</option>
            <option value="anton" ${draft.reelsFontFamily === 'anton' ? 'selected' : ''}>Anton</option>
          </select>
        </label>
        <label>Posição vertical do texto <span>${Math.round(draft.reelsTextY)}%</span>
          <input type="range" min="10" max="90" step="1" value="${draft.reelsTextY}" oninput="setLemeReelsPosition('${escapeAttr(scope)}','text',this.value);this.previousElementSibling.textContent=Math.round(this.value)+'%'">
        </label>
      </div>

      ${formatColorInput(scope, 'text', 'Cor do texto', draft.reelsTextColor, 'setLemeReelsTextColor')}
      ${formatColorInput(scope, 'box', 'Cor da caixa', draft.reelsBoxColor, 'setLemeReelsBoxColor')}

      <label>Posição vertical do logo <span>${Math.round(draft.reelsLogoY)}%</span>
        <input type="range" min="72" max="98" step="1" value="${draft.reelsLogoY}" oninput="setLemeReelsPosition('${escapeAttr(scope)}','logo',this.value);this.previousElementSibling.textContent=Math.round(this.value)+'%'">
      </label>

      <div class="leme-reels-note">O formato deste modelo é fixo em <strong>Reels/Story 1080 × 1920</strong>.</div>
    </div>`;
  }

  function syncReelsUi(scope) {
    const draft = enhance(getLemeArtDraft(scope));
    const current = document.getElementById(`leme_art_${scope}_reels_group`);
    if (current) {
      const holder = document.createElement('div');
      holder.innerHTML = renderReelsControls(scope);
      current.replaceWith(holder.firstElementChild);
    }
    const formatSelect = document.getElementById(`leme_art_${scope}_format`);
    if (formatSelect) {
      formatSelect.disabled = isReels(draft);
      if (isReels(draft)) formatSelect.value = 'story';
    }
    const trimBox = document.getElementById(`leme_art_${scope}_reels_trim_box`);
    const showTrim = isReels(draft) && Boolean(draft.imageDataUrl) && isVideoSource(draft.imageDataUrl, draft.imageMediaType);
    trimBox?.classList.toggle('hidden', !showTrim);
  }

  window.setLemeReelsFont = function(scope, value) {
    const draft = enhance(getLemeArtDraft(scope));
    draft.reelsFontFamily = normalizeFont(value);
    scheduleLemeArtPreview(scope);
  };
  window.setLemeReelsTextColor = function(scope, value) {
    const draft = enhance(getLemeArtDraft(scope));
    draft.reelsTextColor = normalizeColor(value, draft.reelsTextColor || DEFAULT_TEXT_COLOR);
    syncReelsUi(scope);
    scheduleLemeArtPreview(scope);
  };
  window.setLemeReelsBoxColor = function(scope, value) {
    const draft = enhance(getLemeArtDraft(scope));
    draft.reelsBoxColor = normalizeColor(value, draft.reelsBoxColor || DEFAULT_BOX_COLOR);
    syncReelsUi(scope);
    scheduleLemeArtPreview(scope);
  };
  window.setLemeReelsPosition = function(scope, target, value) {
    const draft = enhance(getLemeArtDraft(scope));
    if (target === 'logo') draft.reelsLogoY = clamp(value, 72, 98);
    else draft.reelsTextY = clamp(value, 10, 90);
    scheduleLemeArtPreview(scope);
  };

  const previousRenderEditor = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    let html = previousRenderEditor(scope, options);
    if (options.carousel) {
      html = html.replace(new RegExp(`<option value="${TEMPLATE}"[^>]*>[^<]*<\/option>`, 'g'), '');
      return html;
    }
    html = html.replace('<div class="leme-art-actions">', `${renderReelsControls(scope)}<div class="leme-art-actions">`);
    return html;
  };

  const previousSetTemplate = setLemeArtTemplate;
  setLemeArtTemplate = function(scope, value) {
    const result = previousSetTemplate(scope, value);
    const draft = enhance(getLemeArtDraft(scope));
    if (value === TEMPLATE) {
      draft.format = 'story';
      try { setLemeArtFormat(scope, 'story'); } catch {}
    }
    requestAnimationFrame(() => syncReelsUi(scope));
    return result;
  };
  window.setLemeArtTemplate = setLemeArtTemplate;

  const previousSetFormat = setLemeArtFormat;
  setLemeArtFormat = function(scope, value) {
    const draft = enhance(getLemeArtDraft(scope));
    if (isReels(draft)) value = 'story';
    const result = previousSetFormat(scope, value);
    requestAnimationFrame(() => syncReelsUi(scope));
    return result;
  };
  window.setLemeArtFormat = setLemeArtFormat;

  const previousSyncImages = window.syncLemeArtImageControls || syncLemeArtImageControls;
  window.syncLemeArtImageControls = function(scope = 'page') {
    const result = previousSyncImages(scope);
    requestAnimationFrame(() => syncReelsUi(scope));
    return result;
  };
  syncLemeArtImageControls = window.syncLemeArtImageControls;

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fontConfig(draft) {
    return draft.reelsFontFamily === 'anton'
      ? { family:'Anton, Impact, sans-serif', weight:'400', lineHeight:1.02 }
      : { family:'Poppins, Arial, sans-serif', weight:'700', lineHeight:1.12 };
  }

  function drawAdaptiveBoxes(ctx, layout, centerX, topY, color) {
    const padX = Math.max(34, layout.size * .36);
    const padY = Math.max(14, layout.size * .18);
    const overlap = Math.max(10, layout.size * .13);
    ctx.save();
    ctx.fillStyle = color;
    layout.lines.forEach((line, index) => {
      if (!line.text) return;
      ctx.font = `${layout.fontWeight} ${layout.size}px ${layout.fontFamily}`;
      const textWidth = ctx.measureText(line.text).width;
      const width = Math.min(ctx.canvas.width - 90, textWidth + padX * 2);
      const height = layout.lineHeight + padY * 2;
      const x = centerX - width / 2;
      const y = topY + index * layout.lineHeight - padY - (index ? overlap : 0);
      roundedRect(ctx, x, y, width, height + overlap, Math.min(24, height * .28));
      ctx.fill();
    });
    ctx.restore();
  }

  let logoPromise = null;
  function loadLogo() {
    if (!logoPromise) logoPromise = loadLemeArtImageSource(LOGO_ASSET).catch(error => { logoPromise = null; throw error; });
    return logoPromise;
  }

  async function renderReelsOverlay(draft, formatValue, targetCanvas = null, includeVideo = true) {
    enhance(draft);
    const format = getLemeArtFormatConfig('story');
    const canvas = targetCanvas || document.createElement('canvas');
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (includeVideo) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      try {
        const media = await getLemeArtUserImage(draft, 'primary');
        if (media) drawLemeArtImageCover(ctx, media, 0, 0, canvas.width, canvas.height, 0);
      } catch {}
    }

    const config = fontConfig(draft);
    try { await Promise.race([document.fonts.load(`${Math.round(getLemeArtMaxFontSize(TEMPLATE, draft.fontScale))}px ${draft.reelsFontFamily === 'anton' ? 'Anton' : 'Poppins'}`), new Promise(resolve => setTimeout(resolve, 700))]); } catch {}

    const text = normalizeLemeArtText(draft.text) || 'Texto aqui!\nOutra linha';
    const layout = fitLemeArtText(ctx, text, {
      fontFamily: config.family,
      fontWeight: config.weight,
      maxWidth: canvas.width - 150,
      maxHeight: 520,
      maxFontSize: getLemeArtMaxFontSize(TEMPLATE, draft.fontScale),
      lineHeightRatio: config.lineHeight
    });
    const centerY = clamp(draft.reelsTextY, 10, 90) / 100 * canvas.height;
    const topY = clamp(centerY - layout.height / 2, 80, canvas.height - layout.height - 130);
    drawAdaptiveBoxes(ctx, layout, canvas.width / 2, topY, draft.reelsBoxColor);

    const previousColor = window.__lemeV1104Color;
    window.__lemeV1104Color = draft.highlightColor || DEFAULT_HIGHLIGHT;
    drawLemeArtText(ctx, layout, canvas.width / 2, topY, {
      color: draft.reelsTextColor,
      align: 'center',
      circleColor: draft.highlightColor || DEFAULT_HIGHLIGHT,
      highlightColor: draft.highlightColor || DEFAULT_HIGHLIGHT,
      underlineColor: draft.reelsTextColor
    });
    window.__lemeV1104Color = previousColor;

    try {
      const logo = await loadLogo();
      const width = 246;
      const height = Math.round(width * (logo.naturalHeight || logo.height) / Math.max(1, logo.naturalWidth || logo.width));
      const center = clamp(draft.reelsLogoY, 72, 98) / 100 * canvas.height;
      const y = clamp(center - height / 2, 16, canvas.height - height - 16);
      ctx.globalAlpha = 1;
      ctx.drawImage(logo, (canvas.width - width) / 2, y, width, height);
    } catch (error) { console.warn(error); }

    return canvas;
  }

  const previousRenderDraft = renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
    enhance(draft);
    if (isReels(draft)) return renderReelsOverlay(draft, 'story', targetCanvas, true);
    return previousRenderDraft(draft, formatValue, targetCanvas);
  };

  const previousValidate = validateLemeArtDraft;
  validateLemeArtDraft = function(draft, slideNumber = null) {
    if (isReels(draft)) {
      const label = slideNumber ? `O slide ${slideNumber}` : 'A arte';
      if (!normalizeLemeArtText(draft?.text)) return `${label} está sem texto.`;
      if (!draft?.imageDataUrl || !isVideoSource(draft.imageDataUrl, draft.imageMediaType)) return `${label} precisa de um vídeo de fundo.`;
      return '';
    }
    return previousValidate(draft, slideNumber);
  };

  function stripCommands(text = '') {
    return String(text || '')
      .replace(/\[([^\]]+)\]/g, '$1')
      .replace(/\+([^+]+)\+/g, '$1')
      .replace(/\/([^/]+)\//g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/--([^-]+)--/g, '$1')
      .replace(/^\s*==\s*/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeFilePart(value = '', fallback = 'Reels') {
    return (String(value || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback).slice(0, 120).trim();
  }

  function exportMeta(draft) {
    const recordKey = String(draft?.recordKey || '').replace(/-slide-\d+$/i, '');
    const post = typeof getPosts === 'function' ? getPosts().find(item => String(item?.registro_id || item?.id || '') === recordKey) : null;
    const dateValue = String(post?.data_publicacao || '');
    let date = typeof getSaoPauloNow === 'function' ? getSaoPauloNow() : new Date();
    const iso = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
    const br = dateValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) date = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12, 0, 0);
    const formatted = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getFullYear()).slice(-2)}`;
    const title = safeFilePart(post?.titulo || stripCommands(draft.text) || 'Reels');
    return { formatted, title };
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar o texto do Reels.')), 'image/png'));
  }

  async function mediaBlob(src) {
    const response = await fetch(src, { headers: /^\/api\//.test(String(src || '')) ? authHeaders() : undefined });
    if (!response.ok) throw new Error('Não foi possível ler o vídeo original para exportação.');
    return response.blob();
  }

  async function exportReelsMp4(draft) {
    const overlay = await renderReelsOverlay(draft, 'story', null, false);
    const form = new FormData();
    form.append('overlay', await canvasBlob(overlay), 'overlay.png');
    const blob = await mediaBlob(draft.imageDataUrl);
    form.append('video1', blob, `video1.${blob.type.includes('webm') ? 'webm' : blob.type.includes('quicktime') ? 'mov' : 'mp4'}`);
    form.append('config', JSON.stringify({
      version: VERSION,
      width: 1080,
      height: 1920,
      fps: 30,
      videos: [{
        slot: 'primary',
        x: 0, y: 0, width: 1080, height: 1920,
        cropX: clamp(draft.imagePositionX ?? 50, 0, 100),
        cropY: clamp(draft.imagePositionY ?? 50, 0, 100),
        start: Math.max(0, Number(draft.imageTrimStart || 0)),
        end: Math.max(0, Number(draft.imageTrimEnd || 0)),
        audio: draft.videoAudioEnabled !== false
      }]
    }));
    const response = await fetch('/api/leme-art-render-mp4', { method: 'POST', headers: authHeaders(), body: form });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Não foi possível renderizar o Reels em MP4.');
    }
    return response.blob();
  }

  const previousGenerate = generateAndDownloadLemeArt;
  generateAndDownloadLemeArt = async function(scope = 'page') {
    const draft = enhance(getLemeArtDraft(scope));
    if (!isReels(draft)) return previousGenerate(scope);
    const validation = validateLemeArtDraft(draft);
    if (validation) return toast(validation);
    const button = document.getElementById(`leme_art_${scope}_download`);
    const original = button?.textContent || 'Gerar e baixar MP4';
    if (button) { button.disabled = true; button.textContent = 'Renderizando Reels em MP4...'; }
    window.__LEME_VIDEO_EXPORT_ACTIVE__ = true;
    try {
      const mp4 = await exportReelsMp4(draft);
      const meta = exportMeta(draft);
      const name = `Story - Leme - ${meta.formatted} - ${meta.title}.mp4`;
      downloadLemeArtBlob(mp4, name);
      toast('Reels exportado em MP4.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar o Reels.');
    } finally {
      window.__LEME_VIDEO_EXPORT_ACTIVE__ = false;
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.generateAndDownloadLemeArt = generateAndDownloadLemeArt;

  const previousInitialize = initializeLemeArtCanvases;
  initializeLemeArtCanvases = function() {
    const result = previousInitialize();
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => syncReelsUi(editor.dataset.lemeArtEditor || 'page'));
    return result;
  };
  window.initializeLemeArtCanvases = initializeLemeArtCanvases;

  const style = document.createElement('style');
  style.id = 'leme-reels-v1118-style';
  style.textContent = `
    .leme-reels-group{display:grid;gap:16px;padding:16px;border:1px solid var(--border,#e2e6e9);border-radius:16px;background:rgba(82,164,213,.05)}
    .leme-reels-group.hidden{display:none!important}
    .leme-reels-heading{display:grid;gap:4px}
    .leme-reels-heading small,.leme-reels-note{color:var(--muted,#6c737a);font-size:12px}
    .leme-reels-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .leme-reels-grid label,.leme-reels-group>label{display:grid;gap:8px}
    .leme-reels-color-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid var(--border,#e2e6e9);border-radius:14px;background:rgba(255,255,255,.65)}
    .leme-reels-color-picker{display:flex;align-items:center;gap:8px}
    .leme-reels-color-picker input[type=color]{width:46px;height:40px;border:1px solid #cfd5da;border-radius:10px;padding:3px;background:#fff;cursor:pointer}
    .leme-reels-color-picker .input{width:104px;text-transform:uppercase;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    @media(max-width:760px){.leme-reels-grid{grid-template-columns:1fr}.leme-reels-color-row{align-items:flex-start;flex-direction:column}.leme-reels-color-picker{width:100%}.leme-reels-color-picker .input{flex:1;width:auto}}
  `;
  document.head.appendChild(style);
})();
