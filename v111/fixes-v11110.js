(() => {
  const VERSION = '111.10';
  const REELS_TEMPLATE = 'reels-box';
  const LOGO_ASSET = 'logo-horizontal-white.png?v=111.10';
  const DEFAULT_HIGHLIGHT = '#52a4d5';
  let logoPromise = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const isReels = draft => String(draft?.template || '') === REELS_TEMPLATE;

  function loadLogo() {
    if (!logoPromise) {
      logoPromise = loadLemeArtImageSource(LOGO_ASSET).catch(error => {
        logoPromise = null;
        throw error;
      });
    }
    return logoPromise;
  }

  function fontConfig(draft) {
    return String(draft?.reelsFontFamily || '').toLowerCase() === 'anton'
      ? { family: 'Anton, Impact, sans-serif', weight: '400', lineHeight: 1.02 }
      : { family: 'Poppins, Arial, sans-serif', weight: '700', lineHeight: 1.12 };
  }

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

  // V111.10: a caixa passa a usar a caixa visual real do glifo (TextMetrics)
  // em vez do line-height. Isso deixa o espaço superior e inferior exatamente
  // equilibrado, inclusive com Anton/Poppins e em textos de duas ou mais linhas.
  function drawCenteredAdaptiveBoxes(ctx, layout, centerX, topY, color) {
    ctx.save();
    ctx.font = `${layout.fontWeight} ${layout.size}px ${layout.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;

    const padX = Math.max(30, layout.size * 0.28);
    const padY = Math.max(12, layout.size * 0.105);
    const maxWidth = ctx.canvas.width - 76;
    const boxes = [];

    layout.lines.forEach((line, index) => {
      if (!line.text) return;
      const lineY = topY + (index * layout.lineHeight);
      const metrics = ctx.measureText(line.text);
      const textWidth = metrics.width;

      // Com textBaseline='top', ascent pode ser negativo. Essas fórmulas
      // representam os limites VISUAIS reais dos caracteres no canvas.
      let glyphTop = lineY - Number(metrics.actualBoundingBoxAscent || 0);
      let glyphBottom = lineY + Number(metrics.actualBoundingBoxDescent || layout.size * 0.78);
      let glyphHeight = glyphBottom - glyphTop;

      // Fallback para navegadores que não retornam métricas avançadas.
      if (!Number.isFinite(glyphHeight) || glyphHeight < layout.size * 0.35) {
        glyphTop = lineY + (layout.size * 0.08);
        glyphHeight = layout.size * 0.78;
        glyphBottom = glyphTop + glyphHeight;
      }

      const visualCenterY = (glyphTop + glyphBottom) / 2;
      const width = Math.min(maxWidth, textWidth + (padX * 2));
      const height = glyphHeight + (padY * 2);
      const x = centerX - (width / 2);
      const y = visualCenterY - (height / 2);

      boxes.push({ x, y, width, height });
    });

    // Sobreposição mínima apenas para unir perfeitamente os degraus sem criar
    // uma linha/fresta entre duas caixas consecutivas.
    boxes.forEach((box, index) => {
      const previous = boxes[index - 1];
      let y = box.y;
      let height = box.height;
      if (previous) {
        const previousBottom = previous.y + previous.height;
        if (y > previousBottom - 3) {
          const bridge = y - previousBottom + 4;
          y -= bridge;
          height += bridge;
        }
      }
      const radius = Math.min(20, height * 0.22);
      roundedRect(ctx, box.x, y, box.width, height, radius);
      ctx.fill();
    });

    ctx.restore();
  }

  async function renderReels1120(draft, targetCanvas = null, includeVideo = true) {
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
      } catch (error) {
        console.warn(error);
      }
    }

    const config = fontConfig(draft);
    try {
      const family = String(draft?.reelsFontFamily || '').toLowerCase() === 'anton' ? 'Anton' : 'Poppins';
      await Promise.race([
        document.fonts.load(`${Math.round(getLemeArtMaxFontSize(REELS_TEMPLATE, draft.fontScale))}px ${family}`),
        new Promise(resolve => setTimeout(resolve, 700))
      ]);
    } catch {}

    const text = normalizeLemeArtText(draft.text) || 'Texto aqui!\nOutra linha';
    const layout = fitLemeArtText(ctx, text, {
      fontFamily: config.family,
      fontWeight: config.weight,
      maxWidth: canvas.width - 150,
      maxHeight: 520,
      maxFontSize: getLemeArtMaxFontSize(REELS_TEMPLATE, draft.fontScale),
      lineHeightRatio: config.lineHeight
    });

    const centerY = clamp(draft.reelsTextY ?? 60, 10, 90) / 100 * canvas.height;
    const topY = clamp(centerY - (layout.height / 2), 80, canvas.height - layout.height - 130);

    drawCenteredAdaptiveBoxes(
      ctx,
      layout,
      canvas.width / 2,
      topY,
      draft.reelsBoxColor || '#ffffff'
    );

    const previousColor = window.__lemeV1104Color;
    window.__lemeV1104Color = draft.highlightColor || DEFAULT_HIGHLIGHT;
    drawLemeArtText(ctx, layout, canvas.width / 2, topY, {
      color: draft.reelsTextColor || '#111111',
      align: 'center',
      circleColor: draft.highlightColor || DEFAULT_HIGHLIGHT,
      highlightColor: draft.highlightColor || DEFAULT_HIGHLIGHT,
      underlineColor: draft.reelsTextColor || '#111111'
    });
    window.__lemeV1104Color = previousColor;

    try {
      const logo = await loadLogo();
      const width = 246;
      const naturalWidth = logo.naturalWidth || logo.width || 1;
      const naturalHeight = logo.naturalHeight || logo.height || 1;
      const height = Math.round(width * naturalHeight / naturalWidth);
      const center = clamp(draft.reelsLogoY ?? 93, 72, 98) / 100 * canvas.height;
      const y = clamp(center - height / 2, 16, canvas.height - height - 16);
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.drawImage(logo, (canvas.width - width) / 2, y, width, height);
      ctx.restore();
    } catch (error) {
      console.warn(error);
    }

    return canvas;
  }

  const previousRender = renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
    if (isReels(draft)) return renderReels1120(draft, targetCanvas, true);
    return previousRender(draft, formatValue, targetCanvas);
  };
  window.renderLemeArtDraftCanvas = renderLemeArtDraftCanvas;

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar o texto do Reels.')), 'image/png');
    });
  }

  async function mediaBlob(src) {
    const response = await fetch(src, { headers: /^\/api\//.test(String(src || '')) ? authHeaders() : undefined });
    if (!response.ok) throw new Error('Não foi possível ler o vídeo original para exportação.');
    return response.blob();
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

  async function exportReels1120(draft) {
    const overlay = await renderReels1120(draft, null, false);
    const form = new FormData();
    form.append('overlay', await canvasBlob(overlay), 'overlay.png');

    const blob = await mediaBlob(draft.imageDataUrl);
    const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('quicktime') ? 'mov' : 'mp4';
    form.append('video1', blob, `video1.${ext}`);
    form.append('config', JSON.stringify({
      version: VERSION,
      width: 1080,
      height: 1920,
      fps: 30,
      videos: [{
        slot: 'primary',
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        cropX: clamp(draft.imagePositionX ?? 50, 0, 100),
        cropY: clamp(draft.imagePositionY ?? 50, 0, 100),
        start: Math.max(0, Number(draft.imageTrimStart || 0)),
        end: Math.max(0, Number(draft.imageTrimEnd || 0)),
        audio: draft.videoAudioEnabled !== false
      }]
    }));

    const response = await fetch('/api/leme-art-render-mp4', {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Não foi possível renderizar o Reels em MP4.');
    }
    return response.blob();
  }

  const previousGenerate = generateAndDownloadLemeArt;
  generateAndDownloadLemeArt = async function(scope = 'page') {
    const draft = getLemeArtDraft(scope);
    if (!isReels(draft)) return previousGenerate(scope);

    const validation = validateLemeArtDraft(draft);
    if (validation) return toast(validation);

    const button = document.getElementById(`leme_art_${scope}_download`);
    const original = button?.textContent || 'Gerar e baixar MP4';
    if (button) {
      button.disabled = true;
      button.textContent = 'Renderizando Reels em MP4...';
    }
    window.__LEME_VIDEO_EXPORT_ACTIVE__ = true;

    try {
      const mp4 = await exportReels1120(draft);
      const meta = exportMeta(draft);
      downloadLemeArtBlob(mp4, `Story - Leme - ${meta.formatted} - ${meta.title}.mp4`);
      toast('Reels exportado em MP4.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar o Reels.');
    } finally {
      window.__LEME_VIDEO_EXPORT_ACTIVE__ = false;
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  };
  window.generateAndDownloadLemeArt = generateAndDownloadLemeArt;
})();
