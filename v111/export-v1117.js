(() => {
  const VERSION = '111.7';
  const FPS = 30;
  const DEFAULT_ACCENT = '#52a4d5';
  const GRADIENT_TEMPLATE = 'gradient-photo';
  const DARK_BASE = {
    'twitter-text-dark': 'twitter-text',
    'twitter-image-dark': 'twitter-image',
    'twitter-two-images-dark': 'twitter-two-images',
    'handwritten-dark': 'handwritten'
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const baseTemplate = template => DARK_BASE[template] || template;
  const isVideoSource = (src, explicit = '') => String(explicit || '').toLowerCase() === 'video' || /^data:video\//i.test(String(src || '')) || /^\/media\/leme-art\//.test(String(src || '')) || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(String(src || ''));

  function hasVideo(draft = {}) {
    return Boolean(
      (draft.imageDataUrl && isVideoSource(draft.imageDataUrl, draft.imageMediaType)) ||
      (draft.image2DataUrl && isVideoSource(draft.image2DataUrl, draft.image2MediaType))
    );
  }

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

  function safeFilePart(value = '', fallback = 'Arte') {
    return (String(value || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback).slice(0, 120).trim();
  }

  function parseDate(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
    match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function fileDate(value) {
    const date = parseDate(value) || (typeof getSaoPauloNow === 'function' ? getSaoPauloNow() : new Date());
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getFullYear()).slice(-2)}`;
  }

  function postForRecordKey(recordKey = '') {
    const normalized = String(recordKey || '').replace(/-slide-\d+$/i, '').trim();
    if (!normalized || typeof getPosts !== 'function') return null;
    return getPosts().find(post => String(post?.registro_id || post?.id || '') === normalized) || null;
  }

  function exportMeta(scope, draft, carousel = null) {
    const recordKey = String(carousel?.recordKey || draft?.recordKey || '');
    const post = postForRecordKey(recordKey);
    const titleSource = post?.titulo || carousel?.slides?.[0]?.text || draft?.text || 'Arte';
    return { date: fileDate(post?.data_publicacao), title: safeFilePart(stripCommands(titleSource), 'Arte') };
  }

  function singleName(scope, draft, ext) {
    const meta = exportMeta(scope, draft);
    const label = normalizeLemeArtFormat(draft?.format) === 'story' ? 'Story' : 'Feed';
    return `${label} - Leme - ${meta.date} - ${meta.title}.${ext}`;
  }

  function slideName(scope, carousel, slide, index, formatKey, ext) {
    const meta = exportMeta(scope, slide, carousel);
    const label = formatKey === 'story' ? 'Story' : 'Feed';
    return `${label} ${index + 1} - Leme - ${meta.date} - ${meta.title}.${ext}`;
  }

  function zipName(scope, carousel) {
    const meta = exportMeta(scope, carousel?.slides?.[0] || {}, carousel);
    return `Carrossel - Leme - ${meta.date} - ${meta.title}.zip`;
  }

  function slotKeys(slot = 'primary') {
    return slot === 'secondary'
      ? { src:'image2DataUrl', type:'image2MediaType', x:'image2PositionX', y:'image2PositionY', start:'image2TrimStart', end:'image2TrimEnd', audio:'video2AudioEnabled' }
      : { src:'imageDataUrl', type:'imageMediaType', x:'imagePositionX', y:'imagePositionY', start:'imageTrimStart', end:'imageTrimEnd', audio:'videoAudioEnabled' };
  }

  async function mediaBlob(src) {
    const response = await fetch(src, { headers: /^\/api\//.test(String(src || '')) ? authHeaders() : undefined });
    if (!response.ok) throw new Error('Não foi possível ler o vídeo original para exportação.');
    return response.blob();
  }

  function roundedClear(ctx, x, y, width, height, radius) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    roundedLemeArtRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  function twitterGeometry(draft, formatValue) {
    const format = getLemeArtFormatConfig(formatValue);
    const template = baseTemplate(draft.template);
    const safeX = format.safeMarginX;
    const safeY = format.safeMarginY;
    const contentWidth = format.width - safeX * 2;
    const imageMode = template === 'twitter-two-images' ? 'two' : template === 'twitter-image' ? 'single' : 'none';
    if (imageMode === 'none') return [];
    const tagWidth = 560;
    const tagHeight = Math.round(tagWidth / (618 / 101));
    const tagTextGap = 40;
    const textImageGap = 44;
    const imageHeight = format.key === 'story' ? 640 : 500;
    const fixedHeight = tagHeight + tagTextGap + textImageGap + imageHeight;
    const text = normalizeLemeArtText(draft.text) || 'Digite a frase que será transformada em arte.';
    const measuring = document.createElement('canvas').getContext('2d');
    const layout = fitLemeArtText(measuring, text, {
      fontFamily: 'Poppins, Arial, sans-serif', fontWeight: '300', maxWidth: contentWidth,
      maxHeight: Math.max(180, format.height - safeY * 2 - fixedHeight),
      maxFontSize: getLemeArtMaxFontSize(draft.template, draft.fontScale), lineHeightRatio: 1.28
    });
    const blockHeight = fixedHeight + layout.height;
    const startY = Math.max(safeY, (format.height - blockHeight) / 2);
    const imageY = startY + tagHeight + tagTextGap + layout.height + textImageGap;
    if (imageMode === 'two') {
      const gap = 28;
      const leftWidth = Math.floor((contentWidth - gap) / 2);
      const rightWidth = contentWidth - gap - leftWidth;
      return [
        { slot:'primary', x:safeX, y:imageY, width:leftWidth, height:imageHeight, radius:30 },
        { slot:'secondary', x:safeX + leftWidth + gap, y:imageY, width:rightWidth, height:imageHeight, radius:30 }
      ];
    }
    return [{ slot:'primary', x:safeX, y:imageY, width:contentWidth, height:imageHeight, radius:34 }];
  }

  async function buildTwitterOverlay(draft, formatValue) {
    const canvas = await renderLemeArtDraftCanvas(draft, formatValue);
    const ctx = canvas.getContext('2d');
    const rects = twitterGeometry(draft, formatValue);
    rects.forEach(rect => roundedClear(ctx, rect.x, rect.y, rect.width, rect.height, rect.radius));
    return { canvas, rects };
  }

  async function buildGradientOverlay(draft, formatValue) {
    const format = getLemeArtFormatConfig(formatValue);
    const canvas = document.createElement('canvas');
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const startY = clamp(draft.gradientOverlayY ?? 34, 5, 80) / 100 * format.height;
    const gradient = ctx.createLinearGradient(0, startY, 0, format.height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.28, 'rgba(0,0,0,.12)');
    gradient.addColorStop(0.56, 'rgba(0,0,0,.62)');
    gradient.addColorStop(0.8, 'rgba(0,0,0,.91)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, format.width, format.height);

    try { await Promise.race([document.fonts.load('132px Anton'), new Promise(resolve => setTimeout(resolve, 800))]); } catch {}
    const text = normalizeLemeArtText(draft.text) || 'Digite o texto da arte.';
    const layout = fitLemeArtText(ctx, text, {
      fontFamily: 'Anton, Impact, sans-serif', fontWeight: '400', maxWidth: format.width - 170,
      maxHeight: format.key === 'story' ? 720 : 520,
      maxFontSize: getLemeArtMaxFontSize(GRADIENT_TEMPLATE, draft.fontScale), lineHeightRatio: .98
    });
    const textCenterY = clamp(draft.gradientTextY ?? 70, 30, 90) / 100 * format.height;
    const textY = clamp(textCenterY - layout.height / 2, 40, format.height - layout.height - 80);
    const previousColor = window.__lemeV1104Color;
    window.__lemeV1104Color = draft.highlightColor || DEFAULT_ACCENT;
    drawLemeArtText(ctx, layout, format.width / 2, textY, {
      color:'#fff', align:'center', circleColor:draft.highlightColor || DEFAULT_ACCENT,
      highlightColor:draft.highlightColor || DEFAULT_ACCENT, underlineColor:'#fff'
    });
    window.__lemeV1104Color = previousColor;

    try {
      const logo = await loadLemeArtImageSource('logo-horizontal-white.png?v=111.7');
      const width = 246;
      const height = Math.round(width * (logo.naturalHeight || logo.height) / Math.max(1, logo.naturalWidth || logo.width));
      const centerY = clamp(draft.gradientLogoY ?? 94, 70, 98) / 100 * format.height;
      const y = clamp(centerY - height / 2, 12, format.height - height - 12);
      ctx.globalAlpha = 1;
      ctx.drawImage(logo, (format.width - width) / 2, y, width, height);
    } catch (error) { console.warn(error); }

    return { canvas, rects:[{ slot:'primary', x:0, y:0, width:format.width, height:format.height, radius:0 }] };
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a composição do vídeo.')), 'image/png'));
  }

  async function buildServerPayload(draft, formatValue) {
    const format = getLemeArtFormatConfig(formatValue);
    const template = baseTemplate(draft.template);
    const overlay = draft.template === GRADIENT_TEMPLATE
      ? await buildGradientOverlay(draft, formatValue)
      : await buildTwitterOverlay(draft, formatValue);
    const form = new FormData();
    form.append('overlay', await canvasBlob(overlay.canvas), 'overlay.png');

    const videos = [];
    for (const rect of overlay.rects) {
      const keys = slotKeys(rect.slot);
      const src = String(draft[keys.src] || '');
      if (!src || !isVideoSource(src, draft[keys.type])) continue;
      const blob = await mediaBlob(src);
      const index = videos.length;
      form.append(`video${index + 1}`, blob, `video${index + 1}.${blob.type.includes('webm') ? 'webm' : blob.type.includes('quicktime') ? 'mov' : 'mp4'}`);
      videos.push({
        slot: rect.slot,
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        cropX: clamp(draft[keys.x] ?? 50, 0, 100), cropY: clamp(draft[keys.y] ?? 50, 0, 100),
        start: Math.max(0, Number(draft[keys.start] || 0)), end: Math.max(0, Number(draft[keys.end] || 0)),
        audio: draft[keys.audio] !== false
      });
    }
    if (!videos.length) throw new Error('Nenhum vídeo encontrado nesta arte.');

    form.append('config', JSON.stringify({ version:VERSION, width:format.width, height:format.height, fps:FPS, videos }));
    return form;
  }

  async function exportDraftMp4(draft, formatValue, fileName) {
    const form = await buildServerPayload(draft, formatValue);
    const response = await fetch('/api/leme-art-render-mp4', { method:'POST', headers:authHeaders(), body:form });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Não foi possível renderizar o MP4.');
    }
    return response.blob();
  }

  generateAndDownloadLemeArt = async function(scope = 'page') {
    const draft = getLemeArtDraft(scope);
    const validation = validateLemeArtDraft(draft);
    if (validation) return toast(validation);
    if (!hasVideo(draft)) {
      const canvas = await renderLemeArtCanvas(scope);
      const blob = await canvasToPngBlob(canvas);
      const name = singleName(scope, draft, 'png');
      downloadLemeArtBlob(blob, name);
      return toast('Arte exportada em PNG.');
    }

    const button = document.getElementById(`leme_art_${scope}_download`);
    const original = button?.textContent || 'Gerar e baixar MP4';
    if (button) { button.disabled = true; button.textContent = 'Renderizando MP4 no servidor...'; }
    window.__LEME_VIDEO_EXPORT_ACTIVE__ = true;
    try {
      const name = singleName(scope, draft, 'mp4');
      const mp4 = await exportDraftMp4(draft, draft.format, name);
      downloadLemeArtBlob(mp4, name);
      toast('MP4 exportado com os frames originais do vídeo, sem travadas do canvas.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar o MP4.');
    } finally {
      window.__LEME_VIDEO_EXPORT_ACTIVE__ = false;
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.generateAndDownloadLemeArt = generateAndDownloadLemeArt;

  exportLemeArtCarousel = async function(scope = 'page-carousel') {
    const carousel = getLemeArtCarousel(scope);
    const invalidIndex = carousel.slides.findIndex((slide, index) => validateLemeArtDraft(slide, index + 1));
    if (invalidIndex !== -1) {
      carousel.activeSlideId = carousel.slides[invalidIndex].id;
      refreshLemeArtCarousel(scope);
      return toast(validateLemeArtDraft(carousel.slides[invalidIndex], invalidIndex + 1));
    }
    const button = document.getElementById(`leme_art_${scope}_export_all`);
    const original = button?.textContent || 'Exportar carrossel';
    if (button) button.disabled = true;
    window.__LEME_VIDEO_EXPORT_ACTIVE__ = true;
    try {
      const files = [];
      const formats = [['feed','Feed-1080x1350'],['story','Story-1080x1920']];
      let done = 0;
      const total = carousel.slides.length * formats.length;
      for (const [formatKey, folder] of formats) {
        for (let index = 0; index < carousel.slides.length; index += 1) {
          const slide = carousel.slides[index];
          if (button) button.textContent = `Gerando ${done + 1}/${total}...`;
          if (hasVideo(slide)) {
            const name = slideName(scope, carousel, slide, index, formatKey, 'mp4');
            const mp4 = await exportDraftMp4(slide, formatKey, name);
            files.push({ name:`${folder}/${name}`, data:new Uint8Array(await mp4.arrayBuffer()) });
          } else {
            const canvas = await renderLemeArtDraftCanvas(slide, formatKey);
            const blob = await canvasToPngBlob(canvas);
            const name = slideName(scope, carousel, slide, index, formatKey, 'png');
            files.push({ name:`${folder}/${name}`, data:new Uint8Array(await blob.arrayBuffer()) });
          }
          done += 1;
        }
      }
      downloadLemeArtBlob(createLemeArtZip(files), zipName(scope, carousel));
      toast('Carrossel exportado com vídeos processados diretamente pelo FFmpeg.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar o carrossel.');
    } finally {
      window.__LEME_VIDEO_EXPORT_ACTIVE__ = false;
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.exportLemeArtCarousel = exportLemeArtCarousel;
})();
