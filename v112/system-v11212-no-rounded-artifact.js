(() => {
  const VERSION = '112.13';
  const LIGHT_BACKGROUND = '#fbfaf7';
  const DARK_BACKGROUND = '#0e1d2a';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));

  function beginRoundedPath(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(Number(radius || 0), width / 2, height / 2));
    ctx.beginPath();
    if (r <= 0) {
      ctx.rect(x, y, width, height);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function resolveArtworkBackground(media) {
    const template = String(media?.__lemeTemplate || '').toLowerCase();
    if (template.endsWith('-dark') || template.includes('dark')) return DARK_BACKGROUND;
    return String(window.LEME_ART_CONFIG?.background || LIGHT_BACKGROUND);
  }

  // V112.13
  // Regra de camadas: o fundo da arte é sempre opaco e permanece por baixo da mídia.
  // A mídia é apenas sobreposta, como em camadas do Photoshop. Se a imagem/vídeo tiver
  // transparência ou estiver com zoom abaixo de 100%, a área restante mostra o fundo da
  // própria arte, nunca transparência no PNG/canvas.
  drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
    const mediaWidth = Number(media?.videoWidth || media?.naturalWidth || media?.width || 0);
    const mediaHeight = Number(media?.videoHeight || media?.naturalHeight || media?.height || 0);
    if (!ctx || !media || !mediaWidth || !mediaHeight || !width || !height) return;

    const position = media.__lemeCropPosition || { x: 50, y: 50 };
    const zoomPercent = clamp(media.__lemeZoomPercent ?? 100, 5, 300);
    const coverScale = Math.max(width / mediaWidth, height / mediaHeight);
    const scale = coverScale * (zoomPercent / 100);
    const drawWidth = Math.max(1, mediaWidth * scale);
    const drawHeight = Math.max(1, mediaHeight * scale);
    const px = clamp(position.x ?? 50, 0, 100) / 100;
    const py = clamp(position.y ?? 50, 0, 100) / 100;
    const drawX = x + ((width - drawWidth) * px);
    const drawY = y + ((height - drawHeight) * py);

    const sx = Math.round(x * 1000) / 1000;
    const sy = Math.round(y * 1000) / 1000;
    const sw = Math.round(width * 1000) / 1000;
    const sh = Math.round(height * 1000) / 1000;
    const sr = Math.round(Math.max(0, Number(radius || 0)) * 1000) / 1000;
    const background = resolveArtworkBackground(media);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Primeiro restaura a camada de fundo usando exatamente a mesma forma da moldura.
    // Isso apaga resíduos de frames anteriores sem furar o canvas e sem criar halo.
    beginRoundedPath(ctx, sx, sy, sw, sh, sr);
    ctx.fillStyle = background;
    ctx.fill();

    // Depois recorta a moldura e desenha a mídia por cima do fundo já preenchido.
    // PNGs transparentes e zoom < 100% revelam o fundo da arte, não alpha transparente.
    beginRoundedPath(ctx, sx, sy, sw, sh, sr);
    ctx.clip();
    try {
      ctx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
    } catch (error) {
      console.warn('V112.13: não foi possível desenhar a mídia.', error);
    }
    ctx.restore();
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  window.__LEME_NO_ROUNDED_ARTIFACT_VERSION__ = VERSION;
})();
