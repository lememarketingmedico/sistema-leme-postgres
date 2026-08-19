(() => {
  const VERSION = '111.5';
  const GRADIENT_TEMPLATE = 'gradient-photo';
  const DARK_BG = '#0e1d2a';
  const DARK_TEXT = '#f4f4f4';
  const DEFAULT_ACCENT = '#52a4d5';
  const DARK_TAG = `assets/tag-leme-branca.png?v=${VERSION}`;
  const DARK_HAND_LOGO = `assets/logo-leme-manuscrita-escura.png?v=111.4`;
  const WHITE_LOGO = `logo-horizontal-white.png?v=110.4`;
  const DARK_BASE = {
    'twitter-text-dark': 'twitter-text',
    'twitter-image-dark': 'twitter-image',
    'twitter-two-images-dark': 'twitter-two-images',
    'handwritten-dark': 'handwritten'
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const isDark = template => Boolean(DARK_BASE[template]);
  const baseTemplate = template => DARK_BASE[template] || template;
  const isVideoSource = (src, explicit = '') => String(explicit || '').toLowerCase() === 'video' || /^data:video\//i.test(String(src || '')) || /^\/media\/leme-art\//.test(String(src || '')) || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(String(src || ''));

  const slotKeys = (slot = 'primary') => slot === 'secondary'
    ? { src:'image2DataUrl', name:'image2Name', type:'image2MediaType', element:'image2Element', x:'image2PositionX', y:'image2PositionY', start:'image2TrimStart', end:'image2TrimEnd' }
    : { src:'imageDataUrl', name:'imageName', type:'imageMediaType', element:'imageElement', x:'imagePositionX', y:'imagePositionY', start:'imageTrimStart', end:'imageTrimEnd' };

  function ensureGradientFields(draft, source = {}) {
    if (!draft || typeof draft !== 'object') return draft;
    draft.gradientTextY = clamp(source.gradientTextY ?? source.arte_gradient_text_y ?? draft.gradientTextY ?? 70, 30, 90);
    draft.gradientOverlayY = clamp(source.gradientOverlayY ?? source.arte_gradient_overlay_y ?? draft.gradientOverlayY ?? 34, 5, 80);
    draft.gradientLogoY = clamp(source.gradientLogoY ?? source.arte_gradient_logo_y ?? draft.gradientLogoY ?? 94, 70, 98);
    return draft;
  }

  const createDraftV1115 = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) {
    return ensureGradientFields(createDraftV1115(data, defaults), data || {});
  };

  const getDraftV1115 = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') {
    return ensureGradientFields(getDraftV1115(scope));
  };

  const prepareModalV1115 = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    return ensureGradientFields(prepareModalV1115(post), post || {});
  };

  const serializeSlidesV1115 = serializeLemeArtCarouselSlides;
  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    const carousel = getLemeArtCarousel(scope);
    return serializeSlidesV1115(scope).map((slide, index) => {
      const draft = ensureGradientFields(carousel.slides[index] || {});
      return {
        ...slide,
        gradientTextY: draft.gradientTextY,
        gradientOverlayY: draft.gradientOverlayY,
        gradientLogoY: draft.gradientLogoY
      };
    });
  };

  const collectPostV1115 = collectPost;
  collectPost = function() {
    const record = collectPostV1115();
    const reference = String(document.getElementById('p_referencias')?.value || '').trim();
    const next = {
      ...record,
      referencias: reference ? [reference] : [],
      referencia: reference
    };
    if (String(record.cliente_id || '') === LEME_CLIENT_ID) {
      const draft = getLemeArtDraft('modal');
      next.arte_gradient_text_y = draft.gradientTextY;
      next.arte_gradient_overlay_y = draft.gradientOverlayY;
      next.arte_gradient_logo_y = draft.gradientLogoY;
      next.arte_slides = serializeLemeArtCarouselSlides('modal-carousel');
    }
    return next;
  };

  const renderPostModalV1115 = renderPostModal;
  renderPostModal = function() {
    let html = renderPostModalV1115();
    const match = html.match(/<textarea[^>]*id="p_referencias"[^>]*>([\s\S]*?)<\/textarea>/i);
    const escapedValue = String(match?.[1] || '').split(/\r?\n/)[0].trim();
    const block = `
      <label class="full post-reference-field">Referência
        <div class="leme-reference-inline">
          <input class="input" id="p_referencias" type="url" value="${escapedValue}" placeholder="https://instagram.com/...">
          <button class="btn secondary" type="button" onclick="openLemeReferenceLink()">Abrir referência ↗</button>
        </div>
        <small>Cole um link para consultar esta referência depois.</small>
      </label>`;
    html = html.replace(/<label class="full post-reference-field">Referências[\s\S]*?<\/label>/i, block);
    return html;
  };

  window.openLemeReferenceLink = function() {
    const raw = String(document.getElementById('p_referencias')?.value || '').trim();
    if (!raw) return toast('Cole primeiro o link da referência.');
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(href);
      window.open(parsed.href, '_blank', 'noopener,noreferrer');
    } catch {
      toast('Esse link de referência não parece válido.');
    }
  };

  function gradientPositionControls(scope) {
    const draft = getLemeArtDraft(scope);
    const hidden = draft.template === GRADIENT_TEMPLATE ? '' : 'hidden';
    return `
      <div id="leme_art_${scope}_gradient_vertical_controls" class="leme-v1115-gradient-position ${hidden}">
        <div class="leme-art-v1104-gradient-heading">
          <strong>Posição vertical do layout</strong>
          <small>Ajuste separadamente texto, início do gradiente e logo.</small>
        </div>
        <label>Texto <span id="leme_art_${scope}_gradient_text_y_label">${Math.round(draft.gradientTextY)}%</span>
          <input type="range" min="30" max="90" step="1" value="${draft.gradientTextY}" oninput="setLemeGradientVertical('${escapeAttr(scope)}','text',this.value)">
        </label>
        <label>Início do gradiente <span id="leme_art_${scope}_gradient_overlay_y_label">${Math.round(draft.gradientOverlayY)}%</span>
          <input type="range" min="5" max="80" step="1" value="${draft.gradientOverlayY}" oninput="setLemeGradientVertical('${escapeAttr(scope)}','overlay',this.value)">
        </label>
        <label>Logo <span id="leme_art_${scope}_gradient_logo_y_label">${Math.round(draft.gradientLogoY)}%</span>
          <input type="range" min="70" max="98" step="1" value="${draft.gradientLogoY}" oninput="setLemeGradientVertical('${escapeAttr(scope)}','logo',this.value)">
        </label>
      </div>`;
  }

  window.setLemeGradientVertical = function(scope, kind, value) {
    const draft = getLemeArtDraft(scope);
    if (kind === 'text') draft.gradientTextY = clamp(value, 30, 90);
    if (kind === 'overlay') draft.gradientOverlayY = clamp(value, 5, 80);
    if (kind === 'logo') draft.gradientLogoY = clamp(value, 70, 98);
    const label = document.getElementById(`leme_art_${scope}_gradient_${kind}_y_label`);
    if (label) label.textContent = `${Math.round(Number(value) || 0)}%`;
    scheduleLemeArtPreview(scope);
  };

  const renderEditorV1115 = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    let html = renderEditorV1115(scope, options);
    if (!html.includes(`id="leme_art_${scope}_gradient_vertical_controls"`)) {
      html = html.replace('<div class="leme-art-actions">', `${gradientPositionControls(scope)}<div class="leme-art-actions">`);
    }
    return html;
  };

  function syncGradientControls(scope) {
    const draft = getLemeArtDraft(scope);
    const node = document.getElementById(`leme_art_${scope}_gradient_vertical_controls`);
    node?.classList.toggle('hidden', draft.template !== GRADIENT_TEMPLATE);
  }

  const setTemplateV1115 = setLemeArtTemplate;
  setLemeArtTemplate = function(scope, value) {
    const result = setTemplateV1115(scope, value);
    syncGradientControls(scope);
    return result;
  };
  window.setLemeArtTemplate = setLemeArtTemplate;

  const timelineCache = new Map();
  const trimSlotConfig = [
    ['single', 'primary'],
    ['left', 'primary'],
    ['right', 'secondary'],
    ['gradient', 'primary']
  ];

  function getTrimRange(draft, slot = 'primary') {
    const k = slotKeys(slot);
    const video = draft?.[k.element];
    const duration = Number(video?.duration || 0);
    const max = duration > 0 ? duration : 100;
    const start = clamp(draft?.[k.start] ?? 0, 0, max);
    let end = Number(draft?.[k.end] || 0);
    if (!end) end = duration || max;
    end = clamp(end, 0, max);
    if (end <= start + 0.05) end = Math.min(max, start + 0.1);
    return { duration, max, start, end };
  }

  function timeLabel(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(s / 60);
    const rest = s - (minutes * 60);
    return minutes ? `${minutes}:${rest.toFixed(1).padStart(4, '0')}` : `${rest.toFixed(1)}s`;
  }

  function timelineHtml(scope, controlKey, slot) {
    const p = `leme_art_${scope}_${controlKey}`;
    return `
      <button class="btn secondary small" type="button" onclick="toggleLemeTimeline('${escapeAttr(scope)}','${escapeAttr(controlKey)}','${escapeAttr(slot)}')">✂ Cortar vídeo</button>
      <div id="${p}_timeline_panel" class="leme-v1115-timeline-panel hidden">
        <div class="leme-v1115-timeline-meta"><strong id="${p}_timeline_selection">Trecho selecionado</strong><span id="${p}_timeline_duration"></span></div>
        <div class="leme-v1115-timeline" id="${p}_timeline">
          <div class="leme-v1115-filmstrip" id="${p}_filmstrip"></div>
          <div class="leme-v1115-dim leme-v1115-dim-left" id="${p}_dim_left"></div>
          <div class="leme-v1115-dim leme-v1115-dim-right" id="${p}_dim_right"></div>
          <div class="leme-v1115-selection" id="${p}_selection"></div>
          <button type="button" class="leme-v1115-handle leme-v1115-handle-start" id="${p}_handle_start" onpointerdown="beginLemeTimelineDrag(event,'${escapeAttr(scope)}','${escapeAttr(controlKey)}','${escapeAttr(slot)}','start')" aria-label="Arrastar começo do vídeo"></button>
          <button type="button" class="leme-v1115-handle leme-v1115-handle-end" id="${p}_handle_end" onpointerdown="beginLemeTimelineDrag(event,'${escapeAttr(scope)}','${escapeAttr(controlKey)}','${escapeAttr(slot)}','end')" aria-label="Arrastar final do vídeo"></button>
        </div>
        <div class="leme-v1115-timeline-times"><span id="${p}_start_time"></span><span id="${p}_end_time"></span></div>
        <small>Arraste a borda esquerda para cortar o começo e a borda direita para cortar o final.</small>
      </div>`;
  }

  function installTimelineUI(scope) {
    const draft = getLemeArtDraft(scope);
    for (const [controlKey, slot] of trimSlotConfig) {
      const box = document.getElementById(`leme_art_${scope}_${controlKey}_trim_box`);
      if (!box) continue;
      if (!box.dataset.v1115) {
        box.dataset.v1115 = '1';
        box.innerHTML = timelineHtml(scope, controlKey, slot);
      }
      const k = slotKeys(slot);
      const show = Boolean(draft[k.src]) && isVideoSource(draft[k.src], draft[k.type]);
      box.classList.toggle('hidden', !show);
      if (show) updateTimeline(scope, controlKey, slot);
    }
  }

  window.toggleLemeTimeline = async function(scope, controlKey, slot) {
    const panel = document.getElementById(`leme_art_${scope}_${controlKey}_timeline_panel`);
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      await buildFilmstrip(scope, controlKey, slot).catch(error => console.warn(error));
      updateTimeline(scope, controlKey, slot);
    }
  };

  function updateTimeline(scope, controlKey, slot) {
    const draft = getLemeArtDraft(scope);
    const range = getTrimRange(draft, slot);
    const p = `leme_art_${scope}_${controlKey}`;
    const max = Math.max(range.max, 0.001);
    const left = clamp((range.start / max) * 100, 0, 100);
    const right = clamp((range.end / max) * 100, 0, 100);
    const selection = document.getElementById(`${p}_selection`);
    const handleStart = document.getElementById(`${p}_handle_start`);
    const handleEnd = document.getElementById(`${p}_handle_end`);
    const dimLeft = document.getElementById(`${p}_dim_left`);
    const dimRight = document.getElementById(`${p}_dim_right`);
    if (selection) { selection.style.left = `${left}%`; selection.style.width = `${Math.max(0, right-left)}%`; }
    if (handleStart) handleStart.style.left = `${left}%`;
    if (handleEnd) handleEnd.style.left = `${right}%`;
    if (dimLeft) dimLeft.style.width = `${left}%`;
    if (dimRight) dimRight.style.width = `${100-right}%`;
    const s = document.getElementById(`${p}_start_time`);
    const e = document.getElementById(`${p}_end_time`);
    const d = document.getElementById(`${p}_timeline_duration`);
    const label = document.getElementById(`${p}_timeline_selection`);
    if (s) s.textContent = timeLabel(range.start);
    if (e) e.textContent = timeLabel(range.end);
    if (d) d.textContent = `Vídeo: ${timeLabel(range.duration || range.max)}`;
    if (label) label.textContent = `Trecho final: ${timeLabel(range.end-range.start)}`;
  }

  window.beginLemeTimelineDrag = function(event, scope, controlKey, slot, edge) {
    event.preventDefault();
    event.stopPropagation();
    const timeline = document.getElementById(`leme_art_${scope}_${controlKey}_timeline`);
    if (!timeline) return;
    const draft = getLemeArtDraft(scope);
    const k = slotKeys(slot);
    const move = clientX => {
      const rect = timeline.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const range = getTrimRange(draft, slot);
      const value = pct * range.max;
      if (edge === 'start') draft[k.start] = clamp(value, 0, Math.max(0, range.end - 0.1));
      else draft[k.end] = clamp(value, range.start + 0.1, range.max);
      if (typeof window.setLemeTrim === 'function') {
        window.setLemeTrim(scope, slot, edge === 'start' ? 's' : 'f', edge === 'start' ? draft[k.start] : draft[k.end]);
      } else {
        scheduleLemeArtPreview(scope);
      }
      updateTimeline(scope, controlKey, slot);
    };
    const onMove = e => move(e.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    move(event.clientX);
  };

  async function buildFilmstrip(scope, controlKey, slot) {
    const draft = getLemeArtDraft(scope);
    const k = slotKeys(slot);
    const src = String(draft[k.src] || '');
    if (!src) return;
    const host = document.getElementById(`leme_art_${scope}_${controlKey}_filmstrip`);
    if (!host || host.dataset.source === src) return;
    host.dataset.source = src;
    host.innerHTML = '<span class="leme-v1115-filmstrip-loading">Gerando prévia…</span>';
    let thumbs = timelineCache.get(src);
    if (!thumbs) {
      thumbs = await generateVideoThumbs(src, 9);
      timelineCache.set(src, thumbs);
    }
    if (host.dataset.source !== src) return;
    host.innerHTML = thumbs.map(url => `<img src="${url}" alt="">`).join('');
  }

  async function generateVideoThumbs(src, count = 9) {
    const video = document.createElement('video');
    video.src = src;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve, reject) => {
      if (video.readyState >= 1) return resolve();
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('Não foi possível criar a timeline do vídeo.')), { once: true });
      video.load();
    });
    const duration = Math.max(0.1, Number(video.duration) || 0.1);
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 78;
    const ctx = canvas.getContext('2d');
    const results = [];
    for (let index = 0; index < count; index += 1) {
      const target = duration * (index / Math.max(1, count - 1));
      await new Promise(resolve => {
        const done = () => resolve();
        video.addEventListener('seeked', done, { once: true });
        try { video.currentTime = Math.min(Math.max(0, target), Math.max(0, duration - 0.02)); } catch { resolve(); }
      });
      const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
      const scale = Math.max(canvas.width / vw, canvas.height / vh);
      const sw = canvas.width / scale, sh = canvas.height / scale;
      const sx = Math.max(0, (vw - sw) / 2), sy = Math.max(0, (vh - sh) / 2);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      try { ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); } catch {}
      results.push(canvas.toDataURL('image/jpeg', 0.72));
    }
    return results;
  }

  let whiteLogoPromise = null;
  let darkTagPromise = null;
  let darkHandPromise = null;
  const loadWhiteLogo = () => whiteLogoPromise || (whiteLogoPromise = loadLemeArtImageSource(WHITE_LOGO));
  const loadDarkTag = () => darkTagPromise || (darkTagPromise = loadLemeArtImageSource(DARK_TAG));
  const loadDarkHandLogo = () => darkHandPromise || (darkHandPromise = loadLemeArtImageSource(DARK_HAND_LOGO));

  function commitCanvas(buffer, targetCanvas) {
    if (!targetCanvas) return buffer;
    targetCanvas.width = buffer.width;
    targetCanvas.height = buffer.height;
    const out = targetCanvas.getContext('2d');
    out.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    out.drawImage(buffer, 0, 0);
    return targetCanvas;
  }

  async function renderGradientStable(draft, formatValue, targetCanvas = null) {
    ensureGradientFields(draft);
    const format = getLemeArtFormatConfig(formatValue);
    const buffer = document.createElement('canvas');
    buffer.width = format.width;
    buffer.height = format.height;
    const ctx = buffer.getContext('2d');
    ctx.fillStyle = '#222';
    ctx.fillRect(0,0,format.width,format.height);

    let media = null;
    try { media = await getLemeArtUserImage(draft, 'primary'); } catch (error) { console.warn(error); }
    if (media) drawLemeArtImageCover(ctx, media, 0, 0, format.width, format.height, 0);

    const startY = clamp(draft.gradientOverlayY, 5, 80) / 100 * format.height;
    const gradient = ctx.createLinearGradient(0, startY, 0, format.height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.28, 'rgba(0,0,0,.12)');
    gradient.addColorStop(0.56, 'rgba(0,0,0,.62)');
    gradient.addColorStop(0.8, 'rgba(0,0,0,.91)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,format.width,format.height);

    try { await Promise.race([document.fonts.load('132px Anton'), new Promise(resolve => setTimeout(resolve, 1200))]); } catch {}

    const text = normalizeLemeArtText(draft.text) || 'Digite o texto da arte.';
    const layout = fitLemeArtText(ctx, text, {
      fontFamily: 'Anton, Impact, sans-serif',
      fontWeight: '400',
      maxWidth: format.width - 170,
      maxHeight: format.key === 'story' ? 720 : 520,
      maxFontSize: getLemeArtMaxFontSize(GRADIENT_TEMPLATE, draft.fontScale),
      lineHeightRatio: .98
    });
    const textCenterY = clamp(draft.gradientTextY, 30, 90) / 100 * format.height;
    const textY = clamp(textCenterY - layout.height / 2, 40, format.height - layout.height - 80);
    const previousColor = window.__lemeV1104Color;
    window.__lemeV1104Color = draft.highlightColor || DEFAULT_ACCENT;
    drawLemeArtText(ctx, layout, format.width / 2, textY, {
      color: '#fff',
      align: 'center',
      circleColor: draft.highlightColor || DEFAULT_ACCENT,
      highlightColor: draft.highlightColor || DEFAULT_ACCENT,
      underlineColor: '#fff'
    });
    window.__lemeV1104Color = previousColor;

    try {
      const logo = await loadWhiteLogo();
      const width = 246;
      const height = Math.round(width * (logo.naturalHeight || logo.height) / Math.max(1, logo.naturalWidth || logo.width));
      const centerY = clamp(draft.gradientLogoY, 70, 98) / 100 * format.height;
      const y = clamp(centerY - height / 2, 12, format.height - height - 12);
      ctx.globalAlpha = 1;
      ctx.drawImage(logo, (format.width - width) / 2, y, width, height);
    } catch (error) { console.warn(error); }

    return commitCanvas(buffer, targetCanvas);
  }

  function drawDarkTagExact(ctx, tag, x, y, width) {
    const naturalWidth = Number(tag?.naturalWidth || tag?.width || 618);
    const naturalHeight = Number(tag?.naturalHeight || tag?.height || 101);
    const height = Math.round(width * naturalHeight / Math.max(1, naturalWidth));
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tag, x, y, width, height);
    ctx.restore();
    return height;
  }

  async function renderDarkTwitter(draft, formatValue, targetCanvas = null) {
    const format = getLemeArtFormatConfig(formatValue);
    const buffer = document.createElement('canvas');
    buffer.width = format.width;
    buffer.height = format.height;
    const ctx = buffer.getContext('2d');
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0,0,format.width,format.height);

    const b = baseTemplate(draft.template);
    const safeX = format.safeMarginX;
    const safeY = format.safeMarginY;
    const contentWidth = format.width - safeX * 2;
    const imageMode = b === 'twitter-two-images' ? 'two' : b === 'twitter-image' ? 'single' : 'none';
    const hasImages = imageMode !== 'none';
    const tag = await loadDarkTag();
    const tagWidth = 560;
    const tagHeight = Math.round(tagWidth * 101 / 618);
    const tagTextGap = 40;
    const textImageGap = 44;
    const imageHeight = hasImages ? (format.key === 'story' ? 640 : 500) : 0;
    const fixedHeight = tagHeight + tagTextGap + (hasImages ? textImageGap + imageHeight : 0);
    const availableTextHeight = format.height - safeY * 2 - fixedHeight;
    const text = normalizeLemeArtText(draft.text) || 'Digite a frase que será transformada em arte.';
    const layout = fitLemeArtText(ctx, text, {
      fontFamily: 'Poppins, Arial, sans-serif',
      fontWeight: '300',
      maxWidth: contentWidth,
      maxHeight: Math.max(180, availableTextHeight),
      maxFontSize: getLemeArtMaxFontSize(draft.template, draft.fontScale),
      lineHeightRatio: 1.28
    });
    const blockHeight = fixedHeight + layout.height;
    const startY = Math.max(safeY, (format.height - blockHeight) / 2);
    const tagY = startY;
    const textY = tagY + tagHeight + tagTextGap;

    drawDarkTagExact(ctx, tag, safeX, tagY, tagWidth);
    const prev = window.__lemeV1104Color;
    window.__lemeV1104Color = draft.highlightColor || DEFAULT_ACCENT;
    drawLemeArtText(ctx, layout, safeX, textY, {
      color: DARK_TEXT,
      align: 'left',
      circleColor: draft.highlightColor || DEFAULT_ACCENT,
      highlightColor: draft.highlightColor || DEFAULT_ACCENT,
      underlineColor: DARK_TEXT
    });
    window.__lemeV1104Color = prev;

    if (hasImages) {
      const imageY = textY + layout.height + textImageGap;
      if (imageMode === 'two') {
        const [leftMedia, rightMedia] = await Promise.all([
          getLemeArtUserImage(draft, 'primary').catch(() => null),
          getLemeArtUserImage(draft, 'secondary').catch(() => null)
        ]);
        const gap = 28;
        const leftWidth = Math.floor((contentWidth-gap)/2);
        const rightWidth = contentWidth-gap-leftWidth;
        const rightX = safeX+leftWidth+gap;
        if (leftMedia) drawLemeArtImageCover(ctx,leftMedia,safeX,imageY,leftWidth,imageHeight,30);
        else drawLemeArtImagePlaceholder(ctx,safeX,imageY,leftWidth,imageHeight,30,'Mídia da esquerda');
        if (rightMedia) drawLemeArtImageCover(ctx,rightMedia,rightX,imageY,rightWidth,imageHeight,30);
        else drawLemeArtImagePlaceholder(ctx,rightX,imageY,rightWidth,imageHeight,30,'Mídia da direita');
      } else {
        const media = await getLemeArtUserImage(draft, 'primary').catch(() => null);
        if (media) drawLemeArtImageCover(ctx,media,safeX,imageY,contentWidth,imageHeight,34);
        else drawLemeArtImagePlaceholder(ctx,safeX,imageY,contentWidth,imageHeight,34,'Mídia da publicação');
      }
    }
    return commitCanvas(buffer, targetCanvas);
  }

  async function renderDarkHandwritten(draft, formatValue, targetCanvas = null) {
    const format = getLemeArtFormatConfig(formatValue);
    const buffer = document.createElement('canvas');
    buffer.width = format.width;
    buffer.height = format.height;
    const ctx = buffer.getContext('2d');
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0,0,format.width,format.height);
    const safeX = Math.max(128,format.safeMarginX);
    const safeY = Math.max(128,format.safeMarginY);
    const text = normalizeLemeArtText(draft.text) || 'Digite a frase que será transformada em arte.';
    const layout = fitLemeArtText(ctx,text,{
      fontFamily:'"Elegant Bloom", "Segoe Print", cursive',
      fontWeight:'400',
      maxWidth:format.width-safeX*2,
      maxHeight:format.height-safeY*2-110,
      maxFontSize:getLemeArtMaxFontSize(draft.template,draft.fontScale),
      lineHeightRatio:1.32
    });
    const prev = window.__lemeV1104Color;
    window.__lemeV1104Color = draft.highlightColor || DEFAULT_ACCENT;
    drawLemeArtText(ctx,layout,format.width/2,(format.height-layout.height)/2,{
      color:DARK_TEXT,align:'center',circleColor:draft.highlightColor||DEFAULT_ACCENT,highlightColor:draft.highlightColor||DEFAULT_ACCENT,underlineColor:DARK_TEXT
    });
    window.__lemeV1104Color = prev;
    try {
      const logo = await loadDarkHandLogo();
      const width = Math.min(184,format.width-120);
      const height = Math.round(width*(logo.naturalHeight||logo.height)/Math.max(1,logo.naturalWidth||logo.width));
      ctx.globalAlpha = 1;
      ctx.drawImage(logo,(format.width-width)/2,format.height-60-height,width,height);
    } catch (error) { console.warn(error); }
    return commitCanvas(buffer,targetCanvas);
  }

  const renderDraftV1115 = renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
    ensureGradientFields(draft || {});
    if (draft?.template === GRADIENT_TEMPLATE) return renderGradientStable(draft, formatValue, targetCanvas);
    if (isDark(draft?.template)) {
      if (baseTemplate(draft.template) === 'handwritten') return renderDarkHandwritten(draft, formatValue, targetCanvas);
      return renderDarkTwitter(draft, formatValue, targetCanvas);
    }
    return renderDraftV1115(draft, formatValue, targetCanvas);
  };

  if (typeof window.setLemeTrim === 'function') {
    const setTrimV1115 = window.setLemeTrim;
    window.setLemeTrim = function(scope, slot, edge, value) {
      const result = setTrimV1115(scope, slot, edge, value);
      for (const [controlKey, candidateSlot] of trimSlotConfig) {
        if (candidateSlot === slot) updateTimeline(scope, controlKey, slot);
      }
      return result;
    };
  }

  const initV1115 = initializeLemeArtCanvases;
  initializeLemeArtCanvases = function() {
    const result = initV1115();
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => {
      const scope = editor.dataset.lemeArtEditor || 'page';
      syncGradientControls(scope);
      installTimelineUI(scope);
    });
    return result;
  };

  function mountStyles() {
    if (document.getElementById('leme-v1115-style')) return;
    const style = document.createElement('style');
    style.id = 'leme-v1115-style';
    style.textContent = `
      .leme-reference-inline{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.leme-reference-inline .btn{white-space:nowrap}
      .leme-v1115-gradient-position{display:grid;gap:13px;padding:16px;border:1px solid var(--border,#e2e6e9);border-radius:16px;background:rgba(82,164,213,.055)}.leme-v1115-gradient-position.hidden{display:none!important}.leme-v1115-gradient-position label{display:grid;grid-template-columns:1fr auto;gap:7px 12px;align-items:center;font-size:13px}.leme-v1115-gradient-position input{grid-column:1/-1;width:100%}
      .leme-v1115-timeline-panel{display:grid;gap:9px;margin-top:11px}.leme-v1115-timeline-panel.hidden{display:none!important}.leme-v1115-timeline-meta,.leme-v1115-timeline-times{display:flex;justify-content:space-between;gap:10px;font-size:12px}.leme-v1115-timeline{position:relative;height:62px;border-radius:10px;overflow:hidden;background:#101820;touch-action:none;user-select:none}.leme-v1115-filmstrip{position:absolute;inset:0;display:grid;grid-auto-flow:column;grid-auto-columns:1fr}.leme-v1115-filmstrip img{width:100%;height:100%;object-fit:cover;display:block}.leme-v1115-filmstrip-loading{display:grid;place-items:center;height:100%;font-size:11px;color:#fff8}.leme-v1115-dim{position:absolute;top:0;bottom:0;background:rgba(0,0,0,.58);pointer-events:none;z-index:2}.leme-v1115-dim-left{left:0}.leme-v1115-dim-right{right:0}.leme-v1115-selection{position:absolute;top:0;bottom:0;border-top:2px solid #52a4d5;border-bottom:2px solid #52a4d5;pointer-events:none;z-index:3}.leme-v1115-handle{position:absolute;top:0;bottom:0;width:16px;padding:0;border:0;background:#fff;box-shadow:0 0 0 2px rgba(82,164,213,.9);z-index:5;cursor:ew-resize;transform:translateX(-50%);border-radius:3px}.leme-v1115-handle::after{content:'';position:absolute;top:22px;left:6px;width:4px;height:18px;border-left:1px solid #0e1d2a;border-right:1px solid #0e1d2a}.leme-v1115-timeline-panel small{font-size:11px;opacity:.72}.leme-art-trim-box{padding:12px!important}
      @media(max-width:700px){.leme-reference-inline{grid-template-columns:1fr}.leme-reference-inline .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function refreshEditors() {
    mountStyles();
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => {
      const scope = editor.dataset.lemeArtEditor || 'page';
      installTimelineUI(scope);
      syncGradientControls(scope);
    });
  }

  const observer = new MutationObserver(() => window.requestAnimationFrame(refreshEditors));
  function boot() {
    mountStyles();
    refreshEditors();
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
