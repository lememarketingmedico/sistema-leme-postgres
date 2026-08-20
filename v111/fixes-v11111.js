(() => {
  const VERSION = '111.11';
  const DEFAULT_ZOOM = 100;
  const MIN_ZOOM = 5;
  const MAX_ZOOM = 300;
  const PAGE_STORE_KEY = 'leme_art_zoom_v11111';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const normalizeZoom = value => clamp(value ?? DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM);

  function enhanceZoomDraft(draft, source = null, fallback = null) {
    if (!draft || typeof draft !== 'object') return draft;
    const src = source && typeof source === 'object' ? source : {};
    const fb = fallback && typeof fallback === 'object' ? fallback : {};
    draft.imageZoom = normalizeZoom(src.imageZoom ?? src.arte_imagem_zoom ?? draft.imageZoom ?? fb.imageZoom ?? fb.arte_imagem_zoom);
    draft.image2Zoom = normalizeZoom(src.image2Zoom ?? src.arte_imagem2_zoom ?? draft.image2Zoom ?? fb.image2Zoom ?? fb.arte_imagem2_zoom);
    return draft;
  }

  function zoomKey(slot = 'primary') {
    return slot === 'secondary' ? 'image2Zoom' : 'imageZoom';
  }

  function dataKey(slot = 'primary') {
    return slot === 'secondary' ? 'image2DataUrl' : 'imageDataUrl';
  }

  function savePageZoomState() {
    try {
      const page = enhanceZoomDraft(getLemeArtDraft('page'));
      const carousel = getLemeArtCarousel('page-carousel');
      localStorage.setItem(PAGE_STORE_KEY, JSON.stringify({
        page: { imageZoom: page.imageZoom, image2Zoom: page.image2Zoom },
        slides: Object.fromEntries((carousel?.slides || []).map(slide => [String(slide.id || ''), {
          imageZoom: normalizeZoom(slide.imageZoom),
          image2Zoom: normalizeZoom(slide.image2Zoom)
        }]))
      }));
    } catch (error) {
      console.warn('Não foi possível salvar o zoom das artes.', error);
    }
  }

  function restorePageZoomState() {
    try {
      const stored = JSON.parse(localStorage.getItem(PAGE_STORE_KEY) || 'null');
      if (!stored || typeof stored !== 'object') return;
      if (lemeArtRuntime?.page) {
        lemeArtRuntime.page.imageZoom = normalizeZoom(stored.page?.imageZoom);
        lemeArtRuntime.page.image2Zoom = normalizeZoom(stored.page?.image2Zoom);
      }
      const slides = lemeArtCarouselRuntime?.page?.slides || [];
      slides.forEach(slide => {
        const saved = stored.slides?.[String(slide.id || '')];
        if (!saved) return;
        slide.imageZoom = normalizeZoom(saved.imageZoom);
        slide.image2Zoom = normalizeZoom(saved.image2Zoom);
      });
    } catch (error) {
      console.warn('Não foi possível restaurar o zoom das artes.', error);
    }
  }

  const previousCreateDraft = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) {
    return enhanceZoomDraft(previousCreateDraft(data, defaults), data, defaults);
  };

  const previousGetDraft = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') {
    return enhanceZoomDraft(previousGetDraft(scope));
  };

  const previousPrepareModal = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    return enhanceZoomDraft(previousPrepareModal(post), post || {});
  };

  const previousSerializeSlides = serializeLemeArtCarouselSlides;
  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    const sourceSlides = getLemeArtCarousel(scope)?.slides || [];
    const serialized = previousSerializeSlides(scope);
    return serialized.map((item, index) => {
      const slide = enhanceZoomDraft(sourceSlides[index] || {});
      return {
        ...item,
        imageZoom: normalizeZoom(slide.imageZoom),
        image2Zoom: normalizeZoom(slide.image2Zoom)
      };
    });
  };

  const previousCollectPost = collectPost;
  collectPost = function() {
    const record = previousCollectPost();
    if (String(record?.cliente_id || '') !== String(LEME_CLIENT_ID || 'leme-interno')) return record;
    const draft = enhanceZoomDraft(getLemeArtDraft('modal'));
    return {
      ...record,
      arte_imagem_zoom: normalizeZoom(draft.imageZoom),
      arte_imagem2_zoom: normalizeZoom(draft.image2Zoom),
      arte_slides: serializeLemeArtCarouselSlides('modal-carousel')
    };
  };

  const previousGetUserMedia = getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    enhanceZoomDraft(draft);
    const media = await previousGetUserMedia(draft, slot);
    if (media) {
      const secondary = slot === 'secondary';
      media.__lemeCropPosition = {
        x: clamp(secondary ? draft.image2PositionX : draft.imagePositionX, 0, 100),
        y: clamp(secondary ? draft.image2PositionY : draft.imagePositionY, 0, 100)
      };
      media.__lemeZoomPercent = normalizeZoom(secondary ? draft.image2Zoom : draft.imageZoom);
    }
    return media;
  };

  drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
    const mediaWidth = Number(media?.videoWidth || media?.naturalWidth || media?.width || 0);
    const mediaHeight = Number(media?.videoHeight || media?.naturalHeight || media?.height || 0);
    if (!mediaWidth || !mediaHeight || !width || !height) return;

    const position = media.__lemeCropPosition || { x: 50, y: 50 };
    const zoomPercent = normalizeZoom(media.__lemeZoomPercent);
    const coverScale = Math.max(width / mediaWidth, height / mediaHeight);
    const scale = coverScale * (zoomPercent / 100);
    const drawWidth = Math.max(1, mediaWidth * scale);
    const drawHeight = Math.max(1, mediaHeight * scale);
    const px = clamp(position.x, 0, 100) / 100;
    const py = clamp(position.y, 0, 100) / 100;
    const drawX = x + ((width - drawWidth) * px);
    const drawY = y + ((height - drawHeight) * py);

    ctx.save();
    roundedLemeArtRect(ctx, x, y, width, height, radius);
    ctx.clip();
    ctx.clearRect(x, y, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    try {
      ctx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
    } catch (error) {
      console.warn('Não foi possível desenhar a mídia com zoom.', error);
    }
    ctx.restore();
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  function zoomControl(scope, slot, label, draft) {
    const src = String(draft?.[dataKey(slot)] || '');
    if (!src) return '';
    const zoom = normalizeZoom(draft?.[zoomKey(slot)]);
    return `
      <div class="leme-art-zoom-card" data-zoom-slot="${escapeAttr(slot)}">
        <div class="leme-art-zoom-title">
          <div>
            <strong>Zoom ${escapeHtml(label)}</strong>
            <small>100% mantém o enquadramento padrão. Diminua para revelar área transparente ou aumente para aproximar.</small>
          </div>
          <button class="btn secondary small" type="button" onclick="resetLemeArtMediaZoom('${escapeAttr(scope)}','${escapeAttr(slot)}')">100%</button>
        </div>
        <div class="leme-art-zoom-row">
          <button type="button" class="leme-art-zoom-step" onclick="adjustLemeArtMediaZoom('${escapeAttr(scope)}','${escapeAttr(slot)}',-10)" aria-label="Diminuir zoom">−</button>
          <input id="leme_art_${scope}_${slot}_zoom" type="range" min="${MIN_ZOOM}" max="${MAX_ZOOM}" step="1" value="${zoom}" oninput="setLemeArtMediaZoom('${escapeAttr(scope)}','${escapeAttr(slot)}',this.value)">
          <button type="button" class="leme-art-zoom-step" onclick="adjustLemeArtMediaZoom('${escapeAttr(scope)}','${escapeAttr(slot)}',10)" aria-label="Aumentar zoom">＋</button>
          <strong id="leme_art_${scope}_${slot}_zoom_value">${Math.round(zoom)}%</strong>
        </div>
      </div>`;
  }

  function zoomControls(scope) {
    const draft = enhanceZoomDraft(getLemeArtDraft(scope));
    const controls = [];
    if (draft.imageDataUrl) controls.push(zoomControl(scope, 'primary', draft.image2DataUrl ? 'da mídia esquerda' : 'da mídia', draft));
    if (draft.image2DataUrl) controls.push(zoomControl(scope, 'secondary', 'da mídia direita', draft));
    return controls.join('');
  }

  const previousRenderEditor = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    const html = previousRenderEditor(scope, options);
    const host = `<div id="leme_art_${scope}_zoom_controls" class="leme-art-zoom-controls">${zoomControls(scope)}</div>`;
    if (html.includes('<div class="leme-art-actions">')) {
      return html.replace('<div class="leme-art-actions">', `${host}<div class="leme-art-actions">`);
    }
    return html + host;
  };
  window.renderLemeArtEditor = renderLemeArtEditor;

  window.refreshLemeArtZoomControls = function(scope = 'page') {
    const host = document.getElementById(`leme_art_${scope}_zoom_controls`);
    if (!host) return;
    host.innerHTML = zoomControls(scope);
  };

  window.setLemeArtMediaZoom = function(scope, slot = 'primary', value = DEFAULT_ZOOM) {
    const draft = enhanceZoomDraft(getLemeArtDraft(scope));
    draft[zoomKey(slot)] = normalizeZoom(value);
    const input = document.getElementById(`leme_art_${scope}_${slot}_zoom`);
    const label = document.getElementById(`leme_art_${scope}_${slot}_zoom_value`);
    if (input && Number(input.value) !== draft[zoomKey(slot)]) input.value = String(draft[zoomKey(slot)]);
    if (label) label.textContent = `${Math.round(draft[zoomKey(slot)])}%`;
    scheduleLemeArtPreview(scope);
    if (typeof getLemeArtScopeKey === 'function' && getLemeArtScopeKey(scope) === 'page') savePageZoomState();
  };

  window.adjustLemeArtMediaZoom = function(scope, slot = 'primary', delta = 0) {
    const draft = enhanceZoomDraft(getLemeArtDraft(scope));
    setLemeArtMediaZoom(scope, slot, Number(draft[zoomKey(slot)] || DEFAULT_ZOOM) + Number(delta || 0));
  };

  window.resetLemeArtMediaZoom = function(scope, slot = 'primary') {
    setLemeArtMediaZoom(scope, slot, DEFAULT_ZOOM);
  };

  const previousSyncImageControls = syncLemeArtImageControls;
  syncLemeArtImageControls = function(scope = 'page') {
    const result = previousSyncImageControls(scope);
    requestAnimationFrame(() => refreshLemeArtZoomControls(scope));
    return result;
  };
  window.syncLemeArtImageControls = syncLemeArtImageControls;

  const previousClearMedia = clearLemeArtImage;
  clearLemeArtImage = function(scope, slot = 'primary') {
    const draft = enhanceZoomDraft(getLemeArtDraft(scope));
    draft[zoomKey(slot)] = DEFAULT_ZOOM;
    const result = previousClearMedia(scope, slot);
    requestAnimationFrame(() => refreshLemeArtZoomControls(scope));
    if (typeof getLemeArtScopeKey === 'function' && getLemeArtScopeKey(scope) === 'page') savePageZoomState();
    return result;
  };
  window.clearLemeArtImage = clearLemeArtImage;

  const previousInitialize = initializeLemeArtCanvases;
  initializeLemeArtCanvases = function() {
    const result = previousInitialize();
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => {
      refreshLemeArtZoomControls(editor.dataset.lemeArtEditor || 'page');
    });
    return result;
  };
  window.initializeLemeArtCanvases = initializeLemeArtCanvases;

  function resolveExportDraft() {
    for (const scope of ['modal-carousel', 'page-carousel']) {
      const button = document.getElementById(`leme_art_${scope}_export_all`);
      if (!button?.disabled) continue;
      const carousel = getLemeArtCarousel(scope);
      const slides = carousel?.slides || [];
      if (!slides.length) continue;
      const match = String(button.textContent || '').match(/Gerando\s+(\d+)\//i);
      const ordinal = match ? Math.max(1, Number(match[1] || 1)) : 1;
      return enhanceZoomDraft(slides[(ordinal - 1) % slides.length] || slides[0]);
    }

    for (const scope of ['modal', 'page']) {
      const button = document.getElementById(`leme_art_${scope}_download`);
      if (button?.disabled) return enhanceZoomDraft(getLemeArtDraft(scope));
    }

    const modalDraft = getLemeArtDraft('modal');
    if (document.getElementById('leme_art_modal_canvas') && (modalDraft?.imageDataUrl || modalDraft?.image2DataUrl)) return enhanceZoomDraft(modalDraft);
    return enhanceZoomDraft(getLemeArtDraft('page'));
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    try {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      if (url === '/api/leme-art-render-mp4' && init?.body instanceof FormData) {
        const raw = init.body.get('config');
        if (typeof raw === 'string') {
          const config = JSON.parse(raw);
          if (Array.isArray(config?.videos) && config.videos.length) {
            const exportDraft = resolveExportDraft();
            config.videos = config.videos.map(item => ({
              ...item,
              zoom: normalizeZoom(item.slot === 'secondary' ? exportDraft?.image2Zoom : exportDraft?.imageZoom) / 100
            }));
            init.body.set('config', JSON.stringify(config));
          }
        }
      }
    } catch (error) {
      console.warn('Não foi possível anexar o zoom à exportação.', error);
    }
    return nativeFetch(input, init);
  };

  const style = document.createElement('style');
  style.id = 'leme-v11111-zoom-style';
  style.textContent = `
    .leme-art-zoom-controls{display:grid;gap:12px}
    .leme-art-zoom-controls:empty{display:none}
    .leme-art-zoom-card{display:grid;gap:12px;padding:15px 16px;border:1px solid rgba(82,164,213,.20);border-radius:16px;background:linear-gradient(145deg,rgba(14,29,42,.82),rgba(20,42,58,.72));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
    .leme-art-zoom-title{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
    .leme-art-zoom-title>div{display:grid;gap:3px}
    .leme-art-zoom-title strong{color:#f4f7f9}
    .leme-art-zoom-title small{color:#92a7b6;line-height:1.45}
    .leme-art-zoom-row{display:grid;grid-template-columns:38px minmax(120px,1fr) 38px 58px;gap:10px;align-items:center}
    .leme-art-zoom-row input[type=range]{width:100%;accent-color:#52a4d5}
    .leme-art-zoom-row>strong{color:#eef5f8;text-align:right;font-variant-numeric:tabular-nums}
    .leme-art-zoom-step{width:38px;height:36px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:#0b1721;color:#eaf2f6;font-size:20px;line-height:1;cursor:pointer}
    .leme-art-zoom-step:hover{border-color:rgba(82,164,213,.55);background:#102637}
    @media(max-width:700px){.leme-art-zoom-title{flex-direction:column}.leme-art-zoom-row{grid-template-columns:38px 1fr 38px}.leme-art-zoom-row>strong{grid-column:1/-1;text-align:center}}
  `;
  document.head.appendChild(style);

  restorePageZoomState();
})();
