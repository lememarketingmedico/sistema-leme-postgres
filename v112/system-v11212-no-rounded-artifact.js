(() => {
  const VERSION = '112.14';

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

  // V112.14
  // A composição funciona em camadas, como no Photoshop:
  // 1. o renderizador da arte já pinta o fundo completo do canvas;
  // 2. esta função SOMENTE sobrepõe a imagem/vídeo;
  // 3. pixels transparentes da mídia revelam o fundo que já existe por baixo;
  // 4. nunca pintamos branco, nunca apagamos o canvas e nunca criamos uma
  //    "placa" preenchida dentro da moldura.
  //
  // Isso também elimina o arco/bordinha residual: o problema vinha justamente
  // de operações de limpeza/preenchimento na borda arredondada. Agora a borda
  // serve exclusivamente como clip da mídia.
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
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Não limpar nem preencher a moldura. O fundo da arte já está desenhado.
    // Apenas recortamos a área permitida e sobrepomos a mídia.
    beginRoundedPath(ctx, sx, sy, sw, sh, sr);
    ctx.clip();

    try {
      ctx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
    } catch (error) {
      console.warn('V112.14: não foi possível desenhar a mídia.', error);
    }

    ctx.restore();
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  window.__LEME_NO_ROUNDED_ARTIFACT_VERSION__ = VERSION;
})();
