(() => {
  const VERSION = '112.12';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));

  function beginRoundedPath(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(Number(radius || 0), width / 2, height / 2));
    if (r <= 0) {
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  // Corrige o halo/bordinha em arco que podia aparecer nas quinas da moldura.
  // A causa era o clearRect executado já dentro de um clip arredondado: os pixels
  // antialias da borda podiam sobreviver entre renderizações e formar uma linha curva.
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

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Apaga a área da moldura usando a própria forma arredondada e destination-out.
    // Isso remove completamente qualquer resíduo de antialias da renderização anterior.
    ctx.globalCompositeOperation = 'destination-out';
    beginRoundedPath(ctx, sx, sy, sw, sh, sr);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();

    // Desenha a mídia somente depois da limpeza, com um novo path limpo.
    ctx.globalCompositeOperation = 'source-over';
    beginRoundedPath(ctx, sx, sy, sw, sh, sr);
    ctx.clip();
    try {
      ctx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
    } catch (error) {
      console.warn('V112.12: não foi possível desenhar a mídia.', error);
    }
    ctx.restore();
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  window.__LEME_NO_ROUNDED_ARTIFACT_VERSION__ = VERSION;
})();
