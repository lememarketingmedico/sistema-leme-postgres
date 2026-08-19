(() => {
  const VERSION = '111.9';
  const REELS_TEMPLATE = 'reels-box';
  const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
  const LOGO_ASSET = 'logo-horizontal-white.png?v=111.9';
  const DEFAULT_HIGHLIGHT = '#52a4d5';
  let reelsLogoPromise = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const isReels = draft => String(draft?.template || '') === REELS_TEMPLATE;

  function injectPolishStyles() {
    if (document.getElementById('leme-v1119-polish-style')) return;
    const style = document.createElement('style');
    style.id = 'leme-v1119-polish-style';
    style.textContent = `
      .leme-art-v1104-color-control {
        background: linear-gradient(135deg, rgba(14,29,42,.94), rgba(19,40,55,.88)) !important;
        border: 1px solid rgba(82,164,213,.28) !important;
        box-shadow: 0 12px 30px rgba(5,15,23,.16), inset 0 1px 0 rgba(255,255,255,.035) !important;
        border-radius: 16px !important;
        padding: 14px 16px !important;
      }
      .leme-art-v1104-color-control span { color: #f4f7f9 !important; font-weight: 700 !important; }
      .leme-art-v1104-color-control small { color: #95a9b8 !important; }
      .leme-art-v1104-color-control code { color: #69b5df !important; background: rgba(82,164,213,.10); padding: 2px 5px; border-radius: 6px; }
      .leme-art-v1104-color-picker { gap: 10px !important; }
      .leme-art-v1104-color-swatch {
        width: 48px !important; height: 42px !important; padding: 3px !important;
        border: 1px solid rgba(255,255,255,.18) !important;
        background: #0b1721 !important; border-radius: 11px !important;
        box-shadow: 0 0 0 3px rgba(82,164,213,.08) !important;
      }
      .leme-art-v1104-color-hex {
        background: #0b1721 !important; color: #eef4f7 !important;
        border: 1px solid rgba(255,255,255,.10) !important;
        border-radius: 11px !important; height: 42px !important;
      }
      .leme-reels-color-row {
        background: rgba(14,29,42,.76) !important;
        border: 1px solid rgba(82,164,213,.20) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.025) !important;
      }
      .leme-reels-color-row strong { color: #f4f7f9; }
      .leme-reels-color-picker input[type=color] { background: #0b1721 !important; border-color: rgba(255,255,255,.14) !important; }
      .leme-reels-color-picker .input { background: #0b1721 !important; color: #eef4f7 !important; border-color: rgba(255,255,255,.10) !important; }
    `;
    document.head.appendChild(style);
  }

  async function uploadVideo30(file) {
    const form = new FormData();
    form.append('file', file, file.name || 'video');
    const response = await fetch('/api/leme-art-media', { method: 'POST', headers: authHeaders(), body: form });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false || !data?.url) throw new Error(data?.error || 'Não foi possível salvar o vídeo no sistema.');
    return data;
  }

  const previousReadMedia1119 = readLemeArtImageFile;
  readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
    const type = String(file?.type || '').toLowerCase();
    if (!type.startsWith('video/')) return previousReadMedia1119(file, scope, slot, template);
    if (Number(file.size || 0) > MAX_VIDEO_BYTES) {
      toast('O vídeo deve ter no máximo 30 MB.');
      return;
    }
    toast('Salvando vídeo no sistema...');
    uploadVideo30(file).then(media => {
      const draft = getLemeArtDraft(scope);
      const secondary = slot === 'secondary';
      if (secondary) {
        draft.image2DataUrl = media.url; draft.image2Name = media.file_name || file.name || 'Vídeo selecionado';
        draft.image2Element = null; draft.image2MediaType = 'video'; draft.image2PositionX = 50; draft.image2PositionY = 50;
        draft.image2TrimStart = 0; draft.image2TrimEnd = 0; draft.video2AudioEnabled = true;
      } else {
        draft.imageDataUrl = media.url; draft.imageName = media.file_name || file.name || 'Vídeo selecionado';
        draft.imageElement = null; draft.imageMediaType = 'video'; draft.imagePositionX = 50; draft.imagePositionY = 50;
        draft.imageTrimStart = 0; draft.imageTrimEnd = 0; draft.videoAudioEnabled = true;
      }
      draft.template = normalizeLemeArtTemplate(template);
      if (draft.template === REELS_TEMPLATE) draft.format = 'story';
      render({ skipAutoSync: true });
      toast('Vídeo salvo. Limite atualizado para 30 MB.');
    }).catch(error => { console.error(error); toast(error.message || 'Não foi possível salvar o vídeo.'); });
  };
  window.readLemeArtImageFile = readLemeArtImageFile;

  function fontConfig(draft) {
    return String(draft?.reelsFontFamily || '').toLowerCase() === 'anton'
      ? { family: 'Anton, Impact, sans-serif', weight: '400', lineHeight: 1.02 }
      : { family: 'Poppins, Arial, sans-serif', weight: '700', lineHeight: 1.12 };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
  }

  function drawBalancedAdaptiveBoxes(ctx, layout, centerX, textTopY, color) {
    const padX = Math.max(22, layout.size * 0.22);
    const boxHeight = Math.max(layout.lineHeight * 1.08, layout.size * 1.15);
    const verticalNudge = Math.max(3, layout.size * 0.055);
    const radius = Math.min(24, Math.max(14, boxHeight * 0.16));
    ctx.save(); ctx.fillStyle = color;
    layout.lines.forEach((line, index) => {
      if (!line.text) return;
      ctx.font = `${layout.fontWeight} ${layout.size}px ${layout.fontFamily}`;
      const textWidth = ctx.measureText(line.text).width;
      const width = Math.min(ctx.canvas.width - 72, textWidth + padX * 2);
      const lineTop = textTopY + index * layout.lineHeight;
      const x = centerX - width / 2;
      const y = lineTop + (layout.lineHeight - boxHeight) / 2 + verticalNudge;
      roundedRect(ctx, x, y, width, boxHeight, radius); ctx.fill();
    });
    ctx.restore();
  }

  function loadReelsLogo() {
    if (!reelsLogoPromise) reelsLogoPromise = loadLemeArtImageSource(LOGO_ASSET).catch(error => { reelsLogoPromise = null; throw error; });
    return reelsLogoPromise;
  }

  async function renderReels1119(draft, targetCanvas = null, includeVideo = true) {
    const format = getLemeArtFormatConfig('story');
    const canvas = targetCanvas || document.createElement('canvas');
    canvas.width = format.width; canvas.height = format.height;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (includeVideo) {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      try { const media = await getLemeArtUserImage(draft, 'primary'); if (media) drawLemeArtImageCover(ctx, media, 0, 0, canvas.width, canvas.height, 0); } catch {}
    }
    const cfg = fontConfig(draft);
    try {
      const family = String(draft.reelsFontFamily || '').toLowerCase() === 'anton' ? 'Anton' : 'Poppins';
      await Promise.race([document.fonts.load(`${Math.round(getLemeArtMaxFontSize(REELS_TEMPLATE, draft.fontScale))}px ${family}`), new Promise(resolve => setTimeout(resolve, 700))]);
    } catch {}
    const text = normalizeLemeArtText(draft.text) || 'Texto aqui!\nOutra linha';
    const layout = fitLemeArtText(ctx, text, {
      fontFamily: cfg.family, fontWeight: cfg.weight, maxWidth: canvas.width - 150, maxHeight: 520,
      maxFontSize: getLemeArtMaxFontSize(REELS_TEMPLATE, draft.fontScale), lineHeightRatio: cfg.lineHeight
    });
    const centerY = clamp(draft.reelsTextY ?? 60, 10, 90) / 100 * canvas.height;
    const topY = clamp(centerY - layout.height / 2, 80, canvas.height - layout.height - 130);
    drawBalancedAdaptiveBoxes(ctx, layout, canvas.width / 2, topY, draft.reelsBoxColor || '#ffffff');
    const previousColor = window.__lemeV1104Color;
    window.__lemeV1104Color = draft.highlightColor || DEFAULT_HIGHLIGHT;
    drawLemeArtText(ctx, layout, canvas.width / 2, topY, {
      color: draft.reelsTextColor || '#111111', align: 'center', circleColor: draft.highlightColor || DEFAULT_HIGHLIGHT,
      highlightColor: draft.highlightColor || DEFAULT_HIGHLIGHT, underlineColor: draft.reelsTextColor || '#111111'
    });
    window.__lemeV1104Color = previousColor;
    try {
      const logo = await loadReelsLogo(); const width = 246;
      const height = Math.round(width * (logo.naturalHeight || logo.height) / Math.max(1, logo.naturalWidth || logo.width));
      const center = clamp(draft.reelsLogoY ?? 93, 72, 98) / 100 * canvas.height;
      const y = clamp(center - height / 2, 16, canvas.height - height - 16);
      ctx.globalAlpha = 1; ctx.drawImage(logo, (canvas.width - width) / 2, y, width, height);
    } catch (error) { console.warn(error); }
    return canvas;
  }

  const previousRender1119 = renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
    if (isReels(draft)) return renderReels1119(draft, targetCanvas, true);
    return previousRender1119(draft, formatValue, targetCanvas);
  };
  window.renderLemeArtDraftCanvas = renderLemeArtDraftCanvas;

  function canvasBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a composição do Reels.')), 'image/png')); }
  async function mediaBlob(src) { const response = await fetch(src); if (!response.ok) throw new Error('Não foi possível ler o vídeo original para exportação.'); return response.blob(); }

  async function exportReels1119(draft) {
    const overlay = await renderReels1119(draft, null, false);
    const form = new FormData(); form.append('overlay', await canvasBlob(overlay), 'overlay.png');
    const blob = await mediaBlob(draft.imageDataUrl);
    form.append('video1', blob, `video1.${blob.type.includes('webm') ? 'webm' : blob.type.includes('quicktime') ? 'mov' : 'mp4'}`);
    form.append('config', JSON.stringify({ version: VERSION, width: 1080, height: 1920, fps: 30, videos: [{
      slot: 'primary', x: 0, y: 0, width: 1080, height: 1920,
      cropX: clamp(draft.imagePositionX ?? 50, 0, 100), cropY: clamp(draft.imagePositionY ?? 50, 0, 100),
      start: Math.max(0, Number(draft.imageTrimStart || 0)), end: Math.max(0, Number(draft.imageTrimEnd || 0)), audio: draft.videoAudioEnabled !== false
    }] }));
    const response = await fetch('/api/leme-art-render-mp4', { method: 'POST', headers: authHeaders(), body: form });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || 'Não foi possível renderizar o Reels em MP4.'); }
    return response.blob();
  }

  const previousGenerate1119 = generateAndDownloadLemeArt;
  generateAndDownloadLemeArt = async function(scope = 'page') {
    const draft = getLemeArtDraft(scope);
    if (!isReels(draft)) return previousGenerate1119(scope);
    const validation = validateLemeArtDraft(draft); if (validation) return toast(validation);
    const button = document.getElementById(`leme_art_${scope}_download`); const original = button?.textContent || 'Gerar e baixar MP4';
    if (button) { button.disabled = true; button.textContent = 'Renderizando Reels em MP4...'; }
    window.__LEME_VIDEO_EXPORT_ACTIVE__ = true;
    try {
      const mp4 = await exportReels1119(draft);
      const recordKey = String(draft?.recordKey || '').replace(/-slide-\d+$/i, '');
      const post = typeof getPosts === 'function' ? getPosts().find(item => String(item?.registro_id || item?.id || '') === recordKey) : null;
      const now = typeof getSaoPauloNow === 'function' ? getSaoPauloNow() : new Date();
      const date = post?.data_publicacao ? new Date(`${String(post.data_publicacao).slice(0,10)}T12:00:00`) : now;
      const formatted = `${String(date.getDate()).padStart(2,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getFullYear()).slice(-2)}`;
      const title = String(post?.titulo || draft.text || 'Reels').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
      downloadLemeArtBlob(mp4, `Story - Leme - ${formatted} - ${title}.mp4`);
      toast('Reels exportado em MP4.');
    } catch (error) { console.error(error); toast(error.message || 'Não foi possível exportar o Reels.'); }
    finally { window.__LEME_VIDEO_EXPORT_ACTIVE__ = false; if (button) { button.disabled = false; button.textContent = original; } }
  };
  window.generateAndDownloadLemeArt = generateAndDownloadLemeArt;

  injectPolishStyles();
})();