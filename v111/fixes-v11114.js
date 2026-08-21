(() => {
  const VERSION = '111.14';
  const MAX_MEDIA_BYTES = 30 * 1024 * 1024;
  const DEFAULT_FRAME_HEIGHT = 100;
  const MIN_FRAME_HEIGHT = 55;
  const MAX_FRAME_HEIGHT = 180;
  const FRAME_STORE_KEY = 'leme_art_frame_height_v11114';
  const DARK_BASE = {
    'twitter-text-dark': 'twitter-text',
    'twitter-image-dark': 'twitter-image',
    'twitter-two-images-dark': 'twitter-two-images',
    'handwritten-dark': 'handwritten'
  };
  const VIDEO_EXT_RE = /\.(?:mp4|m4v|mov|webm|mkv|avi|wmv|flv|mpeg|mpg|mpe|mts|m2ts|ts|3gp|3g2|ogv|vob|asf|rm|rmvb|divx|mxf|f4v|dv)(?:$|\?)/i;
  const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|avif|gif|bmp|svg)(?:$|\?)/i;
  const ACCEPT = 'image/*,video/*,.mkv,.avi,.wmv,.flv,.mpeg,.mpg,.mpe,.mts,.m2ts,.ts,.3gp,.3g2,.ogv,.vob,.asf,.rm,.rmvb,.divx,.mxf,.f4v,.dv,.m4v,.mov,.mp4,.webm';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const baseTemplate = template => DARK_BASE[String(template || '')] || String(template || '');
  const isTwitterMediaTemplate = template => ['twitter-image', 'twitter-two-images'].includes(baseTemplate(template));
  const normalizeFrameHeight = value => clamp(value ?? DEFAULT_FRAME_HEIGHT, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT);

  function mediaKind(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (type.startsWith('image/') || IMAGE_EXT_RE.test(name)) return 'image';
    if (type.startsWith('video/') || VIDEO_EXT_RE.test(name)) return 'video';
    return '';
  }

  function frameStorageKey(draft) {
    return String(draft?.recordKey || draft?.id || 'page');
  }

  function getStoredFrameHeight(draft) {
    try {
      const all = JSON.parse(localStorage.getItem(FRAME_STORE_KEY) || '{}') || {};
      return all[frameStorageKey(draft)];
    } catch { return undefined; }
  }

  function storeFrameHeight(draft) {
    try {
      const all = JSON.parse(localStorage.getItem(FRAME_STORE_KEY) || '{}') || {};
      all[frameStorageKey(draft)] = normalizeFrameHeight(draft.mediaFrameHeight);
      localStorage.setItem(FRAME_STORE_KEY, JSON.stringify(all));
    } catch {}
  }

  function enhanceFrameDraft(draft, source = {}, fallback = {}) {
    if (!draft || typeof draft !== 'object') return draft;
    const value = source.mediaFrameHeight ?? source.arte_moldura_altura ?? draft.mediaFrameHeight ?? fallback.mediaFrameHeight ?? fallback.arte_moldura_altura ?? getStoredFrameHeight(draft) ?? DEFAULT_FRAME_HEIGHT;
    draft.mediaFrameHeight = normalizeFrameHeight(value);
    return draft;
  }

  const previousCreateDraft = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) {
    return enhanceFrameDraft(previousCreateDraft(data, defaults), data, defaults);
  };

  const previousGetDraft = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') {
    return enhanceFrameDraft(previousGetDraft(scope));
  };

  const previousPrepareModal = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    return enhanceFrameDraft(previousPrepareModal(post), post || {});
  };

  const previousSerializeSlides = serializeLemeArtCarouselSlides;
  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    const sourceSlides = getLemeArtCarousel(scope)?.slides || [];
    return previousSerializeSlides(scope).map((item, index) => {
      const source = enhanceFrameDraft(sourceSlides[index] || {}, item || {});
      return { ...item, mediaFrameHeight: normalizeFrameHeight(source.mediaFrameHeight) };
    });
  };

  const previousCollectPost = collectPost;
  collectPost = function() {
    const record = previousCollectPost();
    if (String(record?.cliente_id || '') !== String(LEME_CLIENT_ID || 'leme-interno')) return record;
    const draft = enhanceFrameDraft(getLemeArtDraft('modal'));
    return {
      ...record,
      arte_moldura_altura: normalizeFrameHeight(draft.mediaFrameHeight),
      arte_slides: serializeLemeArtCarouselSlides('modal-carousel')
    };
  };

  function frameHeightControl(scope) {
    const draft = enhanceFrameDraft(getLemeArtDraft(scope));
    if (!isTwitterMediaTemplate(draft.template)) return '';
    const value = normalizeFrameHeight(draft.mediaFrameHeight);
    return `
      <div class="leme-v11114-frame-card">
        <div class="leme-v11114-frame-heading">
          <div>
            <strong>Altura das molduras</strong>
            <small>Aumente para aproveitar melhor fotos e vídeos verticais. O conjunto inteiro continua centralizado na arte.</small>
          </div>
          <button class="btn secondary small" type="button" onclick="setLemeArtFrameHeight('${escapeAttr(scope)}',100)">100%</button>
        </div>
        <div class="leme-v11114-frame-row">
          <button type="button" onclick="adjustLemeArtFrameHeight('${escapeAttr(scope)}',-10)" aria-label="Diminuir altura">−</button>
          <input id="leme_art_${scope}_frame_height" type="range" min="${MIN_FRAME_HEIGHT}" max="${MAX_FRAME_HEIGHT}" step="1" value="${value}" oninput="setLemeArtFrameHeight('${escapeAttr(scope)}',this.value)">
          <button type="button" onclick="adjustLemeArtFrameHeight('${escapeAttr(scope)}',10)" aria-label="Aumentar altura">＋</button>
          <strong id="leme_art_${scope}_frame_height_value">${Math.round(value)}%</strong>
        </div>
      </div>`;
  }

  const previousRenderEditor = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    let html = previousRenderEditor(scope, options);
    const control = `<div id="leme_art_${scope}_frame_height_controls">${frameHeightControl(scope)}</div>`;
    if (html.includes(`<div id="leme_art_${scope}_zoom_controls"`)) {
      html = html.replace(`<div id="leme_art_${scope}_zoom_controls"`, `${control}<div id="leme_art_${scope}_zoom_controls"`);
    } else if (html.includes('<div class="leme-art-actions">')) {
      html = html.replace('<div class="leme-art-actions">', `${control}<div class="leme-art-actions">`);
    } else {
      html += control;
    }
    return html;
  };
  window.renderLemeArtEditor = renderLemeArtEditor;

  window.refreshLemeArtFrameHeightControl = function(scope = 'page') {
    const host = document.getElementById(`leme_art_${scope}_frame_height_controls`);
    if (host) host.innerHTML = frameHeightControl(scope);
  };

  window.setLemeArtFrameHeight = function(scope, value) {
    const draft = enhanceFrameDraft(getLemeArtDraft(scope));
    draft.mediaFrameHeight = normalizeFrameHeight(value);
    const input = document.getElementById(`leme_art_${scope}_frame_height`);
    const label = document.getElementById(`leme_art_${scope}_frame_height_value`);
    if (input && Number(input.value) !== draft.mediaFrameHeight) input.value = String(draft.mediaFrameHeight);
    if (label) label.textContent = `${Math.round(draft.mediaFrameHeight)}%`;
    storeFrameHeight(draft);
    scheduleLemeArtPreview(scope);
  };

  window.adjustLemeArtFrameHeight = function(scope, delta) {
    const draft = enhanceFrameDraft(getLemeArtDraft(scope));
    setLemeArtFrameHeight(scope, Number(draft.mediaFrameHeight || DEFAULT_FRAME_HEIGHT) + Number(delta || 0));
  };

  const previousSetTemplate = setLemeArtTemplate;
  setLemeArtTemplate = function(scope, value) {
    const result = previousSetTemplate(scope, value);
    requestAnimationFrame(() => refreshLemeArtFrameHeightControl(scope));
    return result;
  };
  window.setLemeArtTemplate = setLemeArtTemplate;

  const previousSyncImageControls = window.syncLemeArtImageControls || syncLemeArtImageControls;
  window.syncLemeArtImageControls = function(scope = 'page') {
    const result = previousSyncImageControls(scope);
    requestAnimationFrame(() => refreshLemeArtFrameHeightControl(scope));
    return result;
  };
  syncLemeArtImageControls = window.syncLemeArtImageControls;

  const previousRenderDropzone = renderLemeArtImageDropzone;
  renderLemeArtImageDropzone = function(...args) {
    let html = previousRenderDropzone(...args);
    html = html.replace(/accept="[^"]*"/i, `accept="${ACCEPT}"`);
    html = html.replace(/PNG, JPG, WebP, MP4, WebM ou MOV/gi, 'Imagem original + vídeos compatíveis com FFmpeg');
    html = html.replace(/Arraste imagem ou vídeo aqui/gi, 'Arraste imagem ou qualquer vídeo aqui');
    return html;
  };
  window.renderLemeArtImageDropzone = renderLemeArtImageDropzone;

  async function uploadOriginalMedia(file) {
    const form = new FormData();
    form.append('file', file, file.name || 'midia');
    const response = await fetch('/api/leme-art-media', { method:'POST', headers:authHeaders(), body:form });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false || !data?.url) throw new Error(data?.error || 'Não foi possível salvar a mídia.');
    return data;
  }

  function assignUploadedMedia(scope, slot, template, file, media, kind) {
    const draft = enhanceFrameDraft(getLemeArtDraft(scope));
    const secondary = slot === 'secondary';
    if (secondary) {
      draft.image2DataUrl = media.url;
      draft.image2Name = media.file_name || file.name || 'Mídia selecionada';
      draft.image2Element = null;
      draft.image2MediaType = kind;
      draft.image2PositionX = 50;
      draft.image2PositionY = 50;
      draft.image2Zoom = 100;
      if (kind === 'video') draft.video2AudioEnabled = true;
    } else {
      draft.imageDataUrl = media.url;
      draft.imageName = media.file_name || file.name || 'Mídia selecionada';
      draft.imageElement = null;
      draft.imageMediaType = kind;
      draft.imagePositionX = 50;
      draft.imagePositionY = 50;
      draft.imageZoom = 100;
      if (kind === 'video') draft.videoAudioEnabled = true;
    }
    draft.template = normalizeLemeArtTemplate(template);
    storeFrameHeight(draft);
  }

  readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
    const kind = mediaKind(file);
    if (!kind) {
      toast('Esse arquivo não foi identificado como imagem ou vídeo.');
      return;
    }
    if (Number(file?.size || 0) > MAX_MEDIA_BYTES) {
      toast('A mídia deve ter no máximo 30 MB.');
      return;
    }

    toast(kind === 'video' ? 'Preparando vídeo em alta qualidade...' : 'Salvando imagem original, sem compressão...');
    uploadOriginalMedia(file).then(media => {
      const normalizedKind = String(media.media_type || media.kind || kind).toLowerCase() === 'video' ? 'video' : 'image';
      assignUploadedMedia(scope, slot, template, file, media, normalizedKind);
      render({ skipAutoSync: true });
      requestAnimationFrame(() => {
        try { syncLemeArtImageControls(scope); } catch {}
        try { window.refreshLemeArtZoomControls?.(scope); } catch {}
        try { window.refreshLemeArtFrameHeightControl?.(scope); } catch {}
        try { scheduleLemeArtPreview(scope); } catch {}
      });
      toast(normalizedKind === 'video'
        ? 'Vídeo normalizado para MP4 de alta qualidade e pronto para edição.'
        : 'Imagem original salva sem redução de resolução ou recompressão.');
    }).catch(error => {
      console.error(error);
      toast(error.message || 'Não foi possível abrir essa mídia.');
    });
  };
  window.readLemeArtImageFile = readLemeArtImageFile;

  const previousGetUserImage = getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    enhanceFrameDraft(draft);
    const media = await previousGetUserImage(draft, slot);
    if (media) {
      media.__lemeFrameHeightPercent = normalizeFrameHeight(draft.mediaFrameHeight);
      media.__lemeTemplate = draft.template;
    }
    return media;
  };
  window.getLemeArtUserImage = getLemeArtUserImage;

  drawLemeArtTwitterText = function(ctx, text, tag, imageMode, userImages, format, fontScale) {
    const safeX = format.safeMarginX;
    const safeY = format.safeMarginY;
    const contentWidth = format.width - (safeX * 2);
    const normalizedImageMode = ['single', 'two'].includes(imageMode) ? imageMode : 'none';
    const hasImages = normalizedImageMode !== 'none';
    const images = Array.isArray(userImages) ? userImages : [userImages];
    const tagWidth = 560;
    const tagHeight = Math.round(tagWidth / (618 / 101));
    const tagTextGap = 40;
    const textImageGap = 44;
    const defaultImageHeight = format.key === 'story' ? 640 : 500;
    const requestedPercent = normalizeFrameHeight(images.find(Boolean)?.__lemeFrameHeightPercent ?? DEFAULT_FRAME_HEIGHT);
    const maxImageHeight = Math.max(180, format.height - (safeY * 2) - tagHeight - tagTextGap - textImageGap - 180);
    const imageHeight = hasImages ? Math.min(maxImageHeight, Math.round(defaultImageHeight * requestedPercent / 100)) : 0;
    const fixedHeight = tagHeight + tagTextGap + (hasImages ? textImageGap + imageHeight : 0);
    const availableTextHeight = format.height - (safeY * 2) - fixedHeight;
    const draftTemplate = images.find(Boolean)?.__lemeTemplate;
    const template = draftTemplate || (normalizedImageMode === 'two' ? 'twitter-two-images' : normalizedImageMode === 'single' ? 'twitter-image' : 'twitter-text');
    const layout = fitLemeArtText(ctx, text, {
      fontFamily: 'Poppins, Arial, sans-serif',
      fontWeight: '300',
      maxWidth: contentWidth,
      maxHeight: Math.max(180, availableTextHeight),
      maxFontSize: getLemeArtMaxFontSize(template, fontScale),
      lineHeightRatio: 1.28
    });
    const blockHeight = fixedHeight + layout.height;
    const startY = Math.max(safeY, (format.height - blockHeight) / 2);
    const tagY = startY;
    const textY = tagY + tagHeight + tagTextGap;

    drawLemeArtTag(ctx, tag, safeX, tagY, tagWidth, tagHeight);
    drawLemeArtText(ctx, layout, safeX, textY, { color:LEME_ART_CONFIG.textColor, align:'left' });

    if (hasImages) {
      const imageY = textY + layout.height + textImageGap;
      if (normalizedImageMode === 'two') {
        const imageGap = 28;
        const leftWidth = Math.floor((contentWidth - imageGap) / 2);
        const rightWidth = contentWidth - imageGap - leftWidth;
        const rightX = safeX + leftWidth + imageGap;
        if (images[0]) drawLemeArtImageCover(ctx, images[0], safeX, imageY, leftWidth, imageHeight, 30);
        else drawLemeArtImagePlaceholder(ctx, safeX, imageY, leftWidth, imageHeight, 30, 'Imagem da esquerda');
        if (images[1]) drawLemeArtImageCover(ctx, images[1], rightX, imageY, rightWidth, imageHeight, 30);
        else drawLemeArtImagePlaceholder(ctx, rightX, imageY, rightWidth, imageHeight, 30, 'Imagem da direita');
      } else if (images[0]) {
        drawLemeArtImageCover(ctx, images[0], safeX, imageY, contentWidth, imageHeight, 34);
      } else {
        drawLemeArtImagePlaceholder(ctx, safeX, imageY, contentWidth, imageHeight, 34);
      }
    }
  };
  window.drawLemeArtTwitterText = drawLemeArtTwitterText;

  function twitterGeometry(draft, formatValue) {
    const format = getLemeArtFormatConfig(formatValue);
    const template = baseTemplate(draft.template);
    const safeX = format.safeMarginX;
    const safeY = format.safeMarginY;
    const contentWidth = format.width - safeX * 2;
    const mode = template === 'twitter-two-images' ? 'two' : template === 'twitter-image' ? 'single' : 'none';
    if (mode === 'none') return [];
    const tagWidth = 560;
    const tagHeight = Math.round(tagWidth / (618 / 101));
    const tagTextGap = 40;
    const textImageGap = 44;
    const defaultImageHeight = format.key === 'story' ? 640 : 500;
    const maxImageHeight = Math.max(180, format.height - (safeY * 2) - tagHeight - tagTextGap - textImageGap - 180);
    const imageHeight = Math.min(maxImageHeight, Math.round(defaultImageHeight * normalizeFrameHeight(draft.mediaFrameHeight) / 100));
    const fixedHeight = tagHeight + tagTextGap + textImageGap + imageHeight;
    const measuring = document.createElement('canvas').getContext('2d');
    const layout = fitLemeArtText(measuring, normalizeLemeArtText(draft.text) || 'Digite a frase que será transformada em arte.', {
      fontFamily:'Poppins, Arial, sans-serif', fontWeight:'300', maxWidth:contentWidth,
      maxHeight:Math.max(180, format.height - safeY * 2 - fixedHeight),
      maxFontSize:getLemeArtMaxFontSize(draft.template, draft.fontScale), lineHeightRatio:1.28
    });
    const blockHeight = fixedHeight + layout.height;
    const startY = Math.max(safeY, (format.height - blockHeight) / 2);
    const imageY = startY + tagHeight + tagTextGap + layout.height + textImageGap;
    if (mode === 'two') {
      const gap = 28;
      const leftWidth = Math.floor((contentWidth - gap) / 2);
      const rightWidth = contentWidth - gap - leftWidth;
      return [
        {slot:'primary', x:safeX, y:imageY, width:leftWidth, height:imageHeight, radius:30},
        {slot:'secondary', x:safeX + leftWidth + gap, y:imageY, width:rightWidth, height:imageHeight, radius:30}
      ];
    }
    return [{slot:'primary', x:safeX, y:imageY, width:contentWidth, height:imageHeight, radius:34}];
  }

  function isVideoSource(src, explicit = '') {
    return String(explicit || '').toLowerCase() === 'video' || /^\/media\/leme-art\//.test(String(src || '')) || /^data:video\//i.test(String(src || '')) || VIDEO_EXT_RE.test(String(src || ''));
  }

  function slotKeys(slot = 'primary') {
    return slot === 'secondary'
      ? {src:'image2DataUrl',type:'image2MediaType',x:'image2PositionX',y:'image2PositionY',start:'image2TrimStart',end:'image2TrimEnd',audio:'video2AudioEnabled',zoom:'image2Zoom'}
      : {src:'imageDataUrl',type:'imageMediaType',x:'imagePositionX',y:'imagePositionY',start:'imageTrimStart',end:'imageTrimEnd',audio:'videoAudioEnabled',zoom:'imageZoom'};
  }

  function roundedClear(ctx, rect) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    roundedLemeArtRect(ctx, rect.x, rect.y, rect.width, rect.height, rect.radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  async function blobFor(src) {
    const response = await fetch(src, { headers:/^\/api\//.test(String(src || '')) ? authHeaders() : undefined });
    if (!response.ok) throw new Error('Não foi possível ler o vídeo original para exportação.');
    return response.blob();
  }

  async function buildTwitterServerPayload(draft, formatValue) {
    const format = getLemeArtFormatConfig(formatValue);
    const canvas = await renderLemeArtDraftCanvas(draft, formatValue);
    const ctx = canvas.getContext('2d');
    const rects = twitterGeometry(draft, formatValue);
    rects.forEach(rect => roundedClear(ctx, rect));
    const overlay = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar o overlay.')), 'image/png'));
    const form = new FormData();
    form.append('overlay', overlay, 'overlay.png');
    const videos = [];
    for (const rect of rects) {
      const keys = slotKeys(rect.slot);
      const src = String(draft[keys.src] || '');
      if (!src || !isVideoSource(src, draft[keys.type])) continue;
      const blob = await blobFor(src);
      const index = videos.length;
      form.append(`video${index + 1}`, blob, `video${index + 1}.mp4`);
      videos.push({
        slot:rect.slot, x:rect.x, y:rect.y, width:rect.width, height:rect.height,
        cropX:clamp(draft[keys.x] ?? 50, 0, 100), cropY:clamp(draft[keys.y] ?? 50, 0, 100),
        zoom:clamp(Number(draft[keys.zoom] || 100) / 100, .05, 3),
        start:Math.max(0, Number(draft[keys.start] || 0)), end:Math.max(0, Number(draft[keys.end] || 0)),
        audio:draft[keys.audio] !== false
      });
    }
    form.append('config', JSON.stringify({version:VERSION,width:format.width,height:format.height,fps:30,videos}));
    return form;
  }

  function stripCommands(text = '') {
    return String(text || '').replace(/\[([^\]]+)\]/g,'$1').replace(/\+([^+]+)\+/g,'$1').replace(/\/([^/]+)\//g,'$1').replace(/\*([^*]+)\*/g,'$1').replace(/_([^_]+)_/g,'$1').replace(/--([^-]+)--/g,'$1').replace(/^\s*==\s*/gm,'').replace(/\s+/g,' ').trim();
  }
  function safeFilePart(value = '', fallback = 'Arte') { return (String(value || '').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim() || fallback).slice(0,120).trim(); }
  function exportMeta(draft, carousel = null) {
    const recordKey = String(carousel?.recordKey || draft?.recordKey || '').replace(/-slide-\d+$/i,'');
    const post = typeof getPosts === 'function' ? getPosts().find(item => String(item?.registro_id || item?.id || '') === recordKey) : null;
    const rawDate = String(post?.data_publicacao || '');
    let date = typeof getSaoPauloNow === 'function' ? getSaoPauloNow() : new Date();
    let match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    match = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
    return {
      date:`${String(date.getDate()).padStart(2,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getFullYear()).slice(-2)}`,
      title:safeFilePart(post?.titulo || carousel?.slides?.[0]?.text || stripCommands(draft.text) || 'Arte')
    };
  }

  const previousGenerate = generateAndDownloadLemeArt;
  generateAndDownloadLemeArt = async function(scope = 'page') {
    const draft = enhanceFrameDraft(getLemeArtDraft(scope));
    const template = baseTemplate(draft.template);
    const twitterVideo = ['twitter-image','twitter-two-images'].includes(template) && ((draft.imageDataUrl && isVideoSource(draft.imageDataUrl,draft.imageMediaType)) || (draft.image2DataUrl && isVideoSource(draft.image2DataUrl,draft.image2MediaType)));
    if (!twitterVideo) return previousGenerate(scope);
    const validation = validateLemeArtDraft(draft);
    if (validation) return toast(validation);
    const button = document.getElementById(`leme_art_${scope}_download`);
    const original = button?.textContent || 'Gerar e baixar MP4';
    if (button) { button.disabled = true; button.textContent = 'Renderizando MP4 em alta qualidade...'; }
    window.__LEME_VIDEO_EXPORT_ACTIVE__ = true;
    try {
      const form = await buildTwitterServerPayload(draft, draft.format);
      const response = await fetch('/api/leme-art-render-mp4', {method:'POST',headers:authHeaders(),body:form});
      if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || 'Não foi possível renderizar o MP4.'); }
      const meta = exportMeta(draft);
      const label = normalizeLemeArtFormat(draft.format) === 'story' ? 'Story' : 'Feed';
      downloadLemeArtBlob(await response.blob(), `${label} - Leme - ${meta.date} - ${meta.title}.mp4`);
      toast('MP4 exportado em alta qualidade.');
    } catch (error) {
      console.error(error); toast(error.message || 'Não foi possível exportar o MP4.');
    } finally {
      window.__LEME_VIDEO_EXPORT_ACTIVE__ = false;
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.generateAndDownloadLemeArt = generateAndDownloadLemeArt;

  const previousCarouselExport = exportLemeArtCarousel;
  exportLemeArtCarousel = async function(scope = 'page-carousel') {
    const carousel = getLemeArtCarousel(scope);
    const hasCustomTwitterVideo = (carousel?.slides || []).some(slide => {
      const template = baseTemplate(slide.template);
      return ['twitter-image','twitter-two-images'].includes(template) && ((slide.imageDataUrl && isVideoSource(slide.imageDataUrl,slide.imageMediaType)) || (slide.image2DataUrl && isVideoSource(slide.image2DataUrl,slide.image2MediaType)));
    });
    if (!hasCustomTwitterVideo) return previousCarouselExport(scope);

    const invalidIndex = carousel.slides.findIndex((slide, index) => validateLemeArtDraft(slide, index + 1));
    if (invalidIndex !== -1) { carousel.activeSlideId = carousel.slides[invalidIndex].id; refreshLemeArtCarousel(scope); toast(validateLemeArtDraft(carousel.slides[invalidIndex], invalidIndex + 1)); return; }
    const button = document.getElementById(`leme_art_${scope}_export_all`);
    const original = button?.textContent || 'Exportar carrossel';
    if (button) button.disabled = true;
    try {
      const files = [];
      const formats = [{key:'feed',folder:'Feed-1080x1350'},{key:'story',folder:'Story-1080x1920'}];
      let completed = 0;
      const total = carousel.slides.length * formats.length;
      for (const format of formats) {
        for (let index = 0; index < carousel.slides.length; index += 1) {
          const slide = enhanceFrameDraft(carousel.slides[index]);
          if (button) button.textContent = `Gerando ${completed + 1}/${total}...`;
          const template = baseTemplate(slide.template);
          const twitterVideo = ['twitter-image','twitter-two-images'].includes(template) && ((slide.imageDataUrl && isVideoSource(slide.imageDataUrl,slide.imageMediaType)) || (slide.image2DataUrl && isVideoSource(slide.image2DataUrl,slide.image2MediaType)));
          if (twitterVideo) {
            const form = await buildTwitterServerPayload(slide, format.key);
            const response = await fetch('/api/leme-art-render-mp4',{method:'POST',headers:authHeaders(),body:form});
            if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || `Falha no slide ${index + 1}.`); }
            const meta = exportMeta(slide, carousel);
            const label = format.key === 'story' ? 'Story' : 'Feed';
            const name = `${label} ${index + 1} - Leme - ${meta.date} - ${meta.title}.mp4`;
            files.push({name:`${format.folder}/${name}`,data:new Uint8Array(await (await response.blob()).arrayBuffer())});
          } else {
            const canvas = await renderLemeArtDraftCanvas(slide, format.key);
            const blob = await canvasToPngBlob(canvas);
            const meta = exportMeta(slide, carousel);
            const label = format.key === 'story' ? 'Story' : 'Feed';
            const name = `${label} ${index + 1} - Leme - ${meta.date} - ${meta.title}.png`;
            files.push({name:`${format.folder}/${name}`,data:new Uint8Array(await blob.arrayBuffer())});
          }
          completed += 1;
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }
      const meta = exportMeta(carousel.slides[0] || {}, carousel);
      downloadLemeArtBlob(createLemeArtZip(files), `Carrossel - Leme - ${meta.date} - ${meta.title}.zip`);
      toast('Carrossel exportado em alta qualidade.');
    } catch (error) {
      console.error(error); toast(error.message || 'Não foi possível exportar o carrossel.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.exportLemeArtCarousel = exportLemeArtCarousel;

  const previousInitialize = initializeLemeArtCanvases;
  initializeLemeArtCanvases = function() {
    const result = previousInitialize();
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => refreshLemeArtFrameHeightControl(editor.dataset.lemeArtEditor || 'page'));
    return result;
  };
  window.initializeLemeArtCanvases = initializeLemeArtCanvases;

  const style = document.createElement('style');
  style.id = 'leme-v11114-style';
  style.textContent = `
    #leme_art_page_frame_height_controls:empty,#leme_art_modal_frame_height_controls:empty,#leme_art_page-carousel_frame_height_controls:empty,#leme_art_modal-carousel_frame_height_controls:empty{display:none}
    .leme-v11114-frame-card{display:grid;gap:12px;padding:15px 16px;border:1px solid rgba(82,164,213,.22);border-radius:16px;background:linear-gradient(145deg,rgba(14,29,42,.88),rgba(18,39,55,.78));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
    .leme-v11114-frame-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
    .leme-v11114-frame-heading>div{display:grid;gap:3px}.leme-v11114-frame-heading strong{color:#f4f7f9}.leme-v11114-frame-heading small{color:#91a8b7;line-height:1.45}
    .leme-v11114-frame-row{display:grid;grid-template-columns:38px minmax(120px,1fr) 38px 58px;gap:10px;align-items:center}
    .leme-v11114-frame-row button{width:38px;height:38px;border:1px solid rgba(82,164,213,.22);border-radius:10px;background:#0f2231;color:#f5f8fa;font-size:20px;cursor:pointer}
    .leme-v11114-frame-row input[type=range]{width:100%;accent-color:#52a4d5}.leme-v11114-frame-row>strong{text-align:right;color:#f5f8fa}
    @media(max-width:760px){.leme-v11114-frame-heading{flex-direction:column}.leme-v11114-frame-row{grid-template-columns:36px minmax(90px,1fr) 36px 54px}}
  `;
  document.head.appendChild(style);
})();
