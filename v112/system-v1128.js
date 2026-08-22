(() => {
  const VERSION = '112.8';
  const LIGHT_BG = '#fbfaf7';
  const DARK_BG = '#0e1d2a';
  const HAND = 'handwritten-media';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const text = value => value === undefined || value === null ? '' : String(value);

  function slotValue(draft, slot, primaryKey, secondaryKey, fallback) {
    return slot === 'secondary' ? (draft?.[secondaryKey] ?? fallback) : (draft?.[primaryKey] ?? fallback);
  }

  function appearanceBackground(draft = {}) {
    const template = text(draft.template).toLowerCase();
    return (template.includes('dark') || Boolean(draft.artDarkMode)) ? DARK_BG : LIGHT_BG;
  }

  function decorateMedia(media, draft, slot = 'primary') {
    if (!media) return media;
    const zoom = clamp(slotValue(draft, slot, 'imageZoom', 'image2Zoom', 100), 5, 300);
    const position = {
      x: clamp(slotValue(draft, slot, 'imagePositionX', 'image2PositionX', 50), 0, 100),
      y: clamp(slotValue(draft, slot, 'imagePositionY', 'image2PositionY', 50), 0, 100)
    };
    try {
      media.__lemeCropPosition = position;
      media.__lemeZoomPercent = zoom;
      media.__lemeZoom = zoom;
      media.__lemeFrameBackground = appearanceBackground(draft);
      media.__lemeTemplate = text(draft.template);
      media.__lemeFrameHeightPercent = Number(draft.mediaFrameHeight || 100);
    } catch {}
    return media;
  }

  const getMedia0 = window.getLemeArtUserImage || getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    const safeDraft = draft && typeof draft === 'object' ? draft : {};
    const media = await getMedia0(safeDraft, slot);
    return decorateMedia(media, safeDraft, slot);
  };
  window.getLemeArtUserImage = getLemeArtUserImage;

  function readCanvasBackground(ctx, x, y, width, height, fallback) {
    const canvas = ctx?.canvas;
    if (!canvas || typeof ctx.getImageData !== 'function') return fallback;
    const points = [
      [x - 3, y + height / 2],
      [x + width + 3, y + height / 2],
      [x + width / 2, y - 3],
      [x + width / 2, y + height + 3],
      [3, 3],
      [canvas.width - 4, 3],
      [3, canvas.height - 4]
    ];
    for (const [rawX, rawY] of points) {
      const px = Math.round(rawX);
      const py = Math.round(rawY);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      try {
        const data = ctx.getImageData(px, py, 1, 1).data;
        if (data && data[3] >= 200) return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
      } catch {}
    }
    return fallback;
  }

  drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
    const mediaWidth = Number(media?.videoWidth || media?.naturalWidth || media?.width || 0);
    const mediaHeight = Number(media?.videoHeight || media?.naturalHeight || media?.height || 0);
    if (!ctx || !mediaWidth || !mediaHeight || !width || !height) return;

    const position = media?.__lemeCropPosition || { x: 50, y: 50 };
    const zoomPercent = clamp(media?.__lemeZoomPercent ?? media?.__lemeZoom ?? 100, 5, 300);
    const px = clamp(position.x, 0, 100) / 100;
    const py = clamp(position.y, 0, 100) / 100;
    const fallbackBackground = text(media?.__lemeFrameBackground) || (/dark/i.test(text(media?.__lemeTemplate)) ? DARK_BG : LIGHT_BG);
    const background = readCanvasBackground(ctx, x, y, width, height, fallbackBackground);

    const coverScale = Math.max(width / mediaWidth, height / mediaHeight);
    const scale = coverScale * (zoomPercent / 100);
    const drawWidth = Math.max(1, mediaWidth * scale);
    const drawHeight = Math.max(1, mediaHeight * scale);
    const drawX = x + ((width - drawWidth) * px);
    const drawY = y + ((height - drawHeight) * py);

    ctx.save();
    try {
      roundedLemeArtRect(ctx, x, y, width, height, radius);
      ctx.clip();
      ctx.fillStyle = background;
      ctx.fillRect(x, y, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
    } catch (error) {
      console.warn('V112.8: não foi possível desenhar a mídia.', error);
    } finally {
      ctx.restore();
    }
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  function handGeometry(draft, formatValue) {
    const format = getLemeArtFormatConfig(formatValue);
    const safeX = Math.max(104, format.safeMarginX);
    const safeY = Math.max(104, format.safeMarginY);
    const contentWidth = format.width - safeX * 2;
    const logoReserve = 110;
    const baseHeight = format.key === 'story' ? 610 : 470;
    const framePercent = clamp(draft?.mediaFrameHeight ?? 100, 55, 180);
    const maxImageHeight = Math.max(220, format.height - safeY * 2 - logoReserve - 180);
    const imageHeight = Math.min(maxImageHeight, Math.max(160, Math.round(baseHeight * framePercent / 100)));
    const imageY = format.height - safeY - logoReserve - imageHeight;
    const two = text(draft?.handwrittenMediaMode).toLowerCase() === 'two';
    if (two) {
      const gap = 26;
      const leftWidth = Math.floor((contentWidth - gap) / 2);
      const rightWidth = contentWidth - gap - leftWidth;
      return [
        { slot: 'primary', x: safeX, y: imageY, width: leftWidth, height: imageHeight, radius: 30 },
        { slot: 'secondary', x: safeX + leftWidth + gap, y: imageY, width: rightWidth, height: imageHeight, radius: 30 }
      ];
    }
    return [{ slot: 'primary', x: safeX, y: imageY, width: contentWidth, height: imageHeight, radius: 34 }];
  }

  const renderCanvas0 = window.renderLemeArtDraftCanvas || renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
    const canvas = await renderCanvas0(draft, formatValue, targetCanvas);
    if (!canvas || text(draft?.template) !== HAND) return canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const rects = handGeometry(draft || {}, formatValue);
    for (const rect of rects) {
      const src = text(slotValue(draft, rect.slot, 'imageDataUrl', 'image2DataUrl', ''));
      if (!src) continue;
      try {
        const media = await getLemeArtUserImage(draft, rect.slot);
        if (media) drawLemeArtImageCover(ctx, media, rect.x, rect.y, rect.width, rect.height, rect.radius);
      } catch (error) {
        console.warn('V112.8: não foi possível reaplicar a mídia do manuscrito.', error);
      }
    }
    return canvas;
  };
  window.renderLemeArtDraftCanvas = renderLemeArtDraftCanvas;

  const zoom0 = window.setLemeArtMediaZoom;
  if (typeof zoom0 === 'function') {
    window.setLemeArtMediaZoom = function(scope, slot = 'primary', value = 100) {
      const result = zoom0(scope, slot, value);
      try { scheduleLemeArtPreview(scope); } catch {}
      return result;
    };
  }

  const pos0 = window.setLemeArtImagePosition;
  if (typeof pos0 === 'function') {
    window.setLemeArtImagePosition = function(scope, slot = 'primary', axis = 'x', value = 50) {
      const result = pos0(scope, slot, axis, value);
      try { scheduleLemeArtPreview(scope); } catch {}
      return result;
    };
  }

  window.__LEME_MEDIA_RENDER_VERSION__ = VERSION;
})();
