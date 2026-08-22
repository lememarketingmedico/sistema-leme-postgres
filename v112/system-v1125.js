(() => {
  const VERSION = '112.5';
  const LIGHT_BG = String(window.LEME_ART_CONFIG?.background || '#fbfaf7');
  const DARK_BG = '#0e1d2a';
  const GRADIENT_BG = '#222222';
  const MAX_PROCESS_SIDE = 2048;
  const processedCache = new WeakMap();

  const templateOf = draft => String(draft?.template || '');
  const isGradient = draft => templateOf(draft) === 'gradient-photo';
  const isDark = draft => Boolean(draft?.artDarkMode) || /-dark$/i.test(templateOf(draft));
  const frameBackground = draft => isGradient(draft) ? GRADIENT_BG : (isDark(draft) ? DARK_BG : LIGHT_BG);

  function isVideo(media) {
    return String(media?.tagName || '').toUpperCase() === 'VIDEO' || Number(media?.videoWidth || 0) > 0;
  }

  function mediaSize(media) {
    return {
      width: Math.max(1, Number(media?.naturalWidth || media?.videoWidth || media?.width || 1)),
      height: Math.max(1, Number(media?.naturalHeight || media?.videoHeight || media?.height || 1))
    };
  }

  function copyMetadata(source, target) {
    if (!source || !target) return target;
    try {
      for (const key of Object.keys(source)) {
        if (key.startsWith('__leme')) {
          try { target[key] = source[key]; } catch {}
        }
      }
    } catch {}
    return target;
  }

  function parseHexColor(value, fallback = [251, 250, 247]) {
    const match = String(value || '').trim().match(/^#([0-9a-f]{6})$/i);
    if (!match) return fallback;
    const hex = match[1];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }

  function looksLikePng(name, media) {
    const filename = String(name || media?.__lemeFileName || '').toLowerCase();
    const src = String(media?.src || '').toLowerCase();
    return filename.endsWith('.png') || src.startsWith('data:image/png');
  }

  function buildProcessedCutout(media, draft, slot) {
    if (!media || isVideo(media)) return media;

    const filename = String(slot === 'secondary' ? draft?.image2Name : draft?.imageName || '');
    if (!looksLikePng(filename, media)) return media;

    let byKey = processedCache.get(media);
    if (!byKey) {
      byKey = new Map();
      processedCache.set(media, byKey);
    }

    const bg = frameBackground(draft || {});
    const { width: sourceWidth, height: sourceHeight } = mediaSize(media);
    const cacheKey = `${filename}|${bg}|${sourceWidth}x${sourceHeight}`;
    if (byKey.has(cacheKey)) return copyMetadata(media, byKey.get(cacheKey));

    const scale = Math.min(1, MAX_PROCESS_SIDE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const work = document.createElement('canvas');
    work.width = width;
    work.height = height;
    const ctx = work.getContext('2d', { willReadFrequently: true });
    if (!ctx) return media;

    try {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(media, 0, 0, width, height);
    } catch (error) {
      console.warn('V112.5: não foi possível analisar o PNG.', error);
      return media;
    }

    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (error) {
      console.warn('V112.5: não foi possível ler os pixels do PNG.', error);
      return media;
    }

    const data = imageData.data;
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    let removed = 0;
    const [br, bgc, bb] = parseHexColor(bg);

    const candidateAt = index => {
      const p = index * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const a = data[p + 3];
      if (a <= 8) return true;

      const expected = Math.abs(r - br) <= 24 && Math.abs(g - bgc) <= 24 && Math.abs(b - bb) <= 24;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const white = r >= 232 && g >= 232 && b >= 232 && (max - min) <= 26;
      return expected || white;
    };

    const push = index => {
      if (index < 0 || index >= total || visited[index] || !candidateAt(index)) return;
      visited[index] = 1;
      queue[tail++] = index;
    };

    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      push(y * width);
      push(y * width + width - 1);
    }

    while (head < tail) {
      const index = queue[head++];
      const p = index * 4;
      if (data[p + 3] !== 0) {
        data[p + 3] = 0;
        removed++;
      }
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) push(index - 1);
      if (x + 1 < width) push(index + 1);
      if (y > 0) push(index - width);
      if (y + 1 < height) push(index + width);
    }

    // Se praticamente nada foi removido, o PNG não parece ser um recorte.
    // Mantemos a mídia original para não alterar fotos PNG comuns.
    if (removed < Math.max(24, Math.round(total * 0.004))) {
      byKey.set(cacheKey, media);
      return media;
    }

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      byKey.set(cacheKey, media);
      return media;
    }

    ctx.putImageData(imageData, 0, 0);

    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    const pad = Math.max(2, Math.round(Math.max(contentW, contentH) * 0.018));
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropRight = Math.min(width, maxX + 1 + pad);
    const cropBottom = Math.min(height, maxY + 1 + pad);
    const cropW = Math.max(1, cropRight - cropX);
    const cropH = Math.max(1, cropBottom - cropY);

    const cutout = document.createElement('canvas');
    cutout.width = cropW;
    cutout.height = cropH;
    const out = cutout.getContext('2d');
    if (!out) return media;
    out.clearRect(0, 0, cropW, cropH);
    out.drawImage(work, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    cutout.__lemeFileName = filename;
    cutout.__lemeFrameBackground = bg;
    cutout.__lemePngCutout = true;
    copyMetadata(media, cutout);
    byKey.set(cacheKey, cutout);
    return cutout;
  }

  // V112.4 compõe a transparência sobre uma cor antes do render.
  // Aqui usamos a mídia entregue por ela, recuperamos o recorte PNG pelas bordas
  // e devolvemos um canvas transparente novamente para todos os renderizadores.
  const getMedia0 = window.getLemeArtUserImage || getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    const media = await getMedia0(draft, slot);
    if (!media) return media;
    const bg = frameBackground(draft || {});
    try {
      media.__lemeFrameBackground = bg;
      media.__lemeFileName = String(slot === 'secondary' ? draft?.image2Name : draft?.imageName || '');
      media.__lemeTemplate = templateOf(draft);
      media.__lemeFrameHeightPercent = Number(draft?.mediaFrameHeight || 100);
    } catch {}
    return buildProcessedCutout(media, draft || {}, slot);
  };
  window.getLemeArtUserImage = getLemeArtUserImage;

  // A moldura é pintada antes da mídia. Assim os pixels transparentes revelam
  // exatamente o fundo claro/escuro do modelo, tanto na prévia quanto no export.
  const drawCover0 = window.drawLemeArtImageCover || drawLemeArtImageCover;
  drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
    const bg = String(media?.__lemeFrameBackground || LIGHT_BG);
    ctx.save();
    try {
      roundedLemeArtRect(ctx, x, y, width, height, radius);
      ctx.fillStyle = bg;
      ctx.fill();
    } finally {
      ctx.restore();
    }
    return drawCover0(ctx, media, x, y, width, height, radius);
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  window.__LEME_PNG_EXPORT_FIX_VERSION__ = VERSION;
})();
