(() => {
  const VERSION = '112.15';
  const EXPAND_FIX_PX = 3;

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

  function pixelAt(ctx, x, y) {
    try {
      const canvas = ctx.canvas;
      const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
      const data = ctx.getImageData(px, py, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2], a: data[3] };
    } catch {
      return null;
    }
  }

  function colorCss(pixel) {
    if (!pixel || pixel.a <= 0) return '';
    return `rgba(${pixel.r},${pixel.g},${pixel.b},${pixel.a / 255})`;
  }

  function resolveArtworkBackground(ctx, x, y, width, height) {
    const canvas = ctx.canvas;
    const candidates = [
      [2, 2],
      [canvas.width - 3, 2],
      [2, canvas.height - 3],
      [canvas.width - 3, canvas.height - 3],
      [x - 6, y + height / 2],
      [x + width + 6, y + height / 2],
      [x + width / 2, y - 6],
      [x + width / 2, y + height + 6]
    ];

    for (const [px, py] of candidates) {
      const pixel = pixelAt(ctx, px, py);
      if (pixel && pixel.a >= 250) return colorCss(pixel);
    }

    const template = String(window.__LEME_ACTIVE_ART_TEMPLATE__ || '').toLowerCase();
    if (template.includes('dark')) return '#0e1d2a';
    return String(window.LEME_ART_CONFIG?.background || '#fbfaf7');
  }

  function fillArtworkBehindFrame(ctx, x, y, width, height, radius, background) {
    if (!background) return;
    const expand = Math.max(0, EXPAND_FIX_PX);
    const ex = x - expand;
    const ey = y - expand;
    const ew = width + (expand * 2);
    const eh = height + (expand * 2);
    const er = Math.max(0, Number(radius || 0) + expand);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = background;
    beginRoundedPath(ctx, ex, ey, ew, eh, er);
    ctx.fill();
    ctx.restore();
  }

  // A moldura é somente uma máscara de recorte. Antes de desenhar a mídia,
  // restauramos sob ela exatamente a cor que já existe no fundo da arte.
  // Isso remove resíduos de renderizações antigas sem abrir alpha e sem criar
  // uma placa branca/preta. PNGs transparentes revelam o fundo real da arte.
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

    const background = resolveArtworkBackground(ctx, x, y, width, height);

    // Elimina qualquer resíduo antigo da moldura usando o PRÓPRIO fundo da arte.
    // A expansão de poucos pixels apaga também o arco antialias que originou o bug.
    fillArtworkBehindFrame(ctx, x, y, width, height, radius, background);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    beginRoundedPath(ctx, x, y, width, height, radius);
    ctx.clip();
    try {
      ctx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
    } catch (error) {
      console.warn('V112.15: não foi possível desenhar a mídia.', error);
    }
    ctx.restore();
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  // Garante que nenhum PNG final ou canvas de prévia termine com regiões alpha
  // por causa de renderizações antigas. O preenchimento é feito atrás do conteúdo,
  // portanto não cobre texto, imagem, vídeo ou logo.
  const previousRenderDraftCanvas = window.renderLemeArtDraftCanvas || (typeof renderLemeArtDraftCanvas === 'function' ? renderLemeArtDraftCanvas : null);
  if (typeof previousRenderDraftCanvas === 'function') {
    renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
      window.__LEME_ACTIVE_ART_TEMPLATE__ = String(draft?.template || '');
      const canvas = await previousRenderDraftCanvas(draft, formatValue, targetCanvas);
      if (!canvas) return canvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;

      const background = resolveArtworkBackground(ctx, 0, 0, canvas.width, canvas.height);
      if (background) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      return canvas;
    };
    window.renderLemeArtDraftCanvas = renderLemeArtDraftCanvas;
  }

  window.__LEME_NO_ROUNDED_ARTIFACT_VERSION__ = VERSION;
})();
