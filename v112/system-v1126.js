(() => {
  const VERSION = '112.6';
  const LIGHT_BG = String(window.LEME_ART_CONFIG?.background || '#fbfaf7');
  const DARK_BG = '#0e1d2a';
  const trimCache = new WeakMap();

  function isVideo(media, draft, slot) {
    const secondary = slot === 'secondary';
    const type = String(secondary ? draft?.image2MediaType : draft?.imageMediaType || '').toLowerCase();
    return type === 'video' || String(media?.tagName || '').toUpperCase() === 'VIDEO' || Number(media?.videoWidth || 0) > 0;
  }

  function strictFrameBackground(draft = {}) {
    const template = String(draft.template || '').toLowerCase();
    if (template === 'gradient-photo') return LIGHT_BG;
    if (template.startsWith('handwritten')) {
      return (template.includes('dark') || Boolean(draft.artDarkMode)) ? DARK_BG : LIGHT_BG;
    }
    return /-dark$/i.test(template) ? DARK_BG : LIGHT_BG;
  }

  function fileNameOf(draft, slot) {
    return String(slot === 'secondary' ? draft?.image2Name : draft?.imageName || '');
  }

  function sourceOf(draft, slot) {
    return String(slot === 'secondary' ? draft?.image2DataUrl : draft?.imageDataUrl || '');
  }

  function elementKeyOf(slot) {
    return slot === 'secondary' ? 'image2Element' : 'imageElement';
  }

  function looksLikePng(draft, slot, media) {
    const name = fileNameOf(draft, slot).toLowerCase();
    const src = String(media?.src || sourceOf(draft, slot) || '').toLowerCase();
    return name.endsWith('.png') || src.startsWith('data:image/png');
  }

  function mediaSize(media) {
    return {
      width: Math.max(1, Number(media?.naturalWidth || media?.width || 1)),
      height: Math.max(1, Number(media?.naturalHeight || media?.height || 1))
    };
  }

  function copyRenderMetadata(source, target, draft, slot) {
    if (!target) return target;
    try {
      for (const key of Object.keys(source || {})) {
        if (key.startsWith('__leme')) {
          try { target[key] = source[key]; } catch {}
        }
      }
      target.__lemeFrameBackground = strictFrameBackground(draft);
      target.__lemeTemplate = String(draft?.template || '');
      target.__lemeFrameHeightPercent = Number(draft?.mediaFrameHeight || 100);
      target.__lemeCropPosition = {
        x: Number(slot === 'secondary' ? draft?.image2PositionX : draft?.imagePositionX) || 50,
        y: Number(slot === 'secondary' ? draft?.image2PositionY : draft?.imagePositionY) || 50
      };
      target.__lemeZoom = Number(slot === 'secondary' ? draft?.image2Zoom : draft?.imageZoom) || 100;
    } catch {}
    return target;
  }

  function trimTransparentPng(media, draft, slot) {
    if (!media || !looksLikePng(draft, slot, media)) return copyRenderMetadata(media, media, draft, slot);

    let cached = trimCache.get(media);
    if (!cached) {
      const { width, height } = mediaSize(media);
      const work = document.createElement('canvas');
      work.width = width;
      work.height = height;
      const ctx = work.getContext('2d', { willReadFrequently: true });
      if (!ctx) return copyRenderMetadata(media, media, draft, slot);

      try {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(media, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        let minX = width, minY = height, maxX = -1, maxY = -1;
        let transparent = 0;
        const total = width * height;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha <= 8) {
              transparent++;
              continue;
            }
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }

        // Só recorta quando existe transparência real. Nada de remover branco ou
        // transformar PNG opaco em recorte automaticamente.
        if (transparent > 0 && maxX >= minX && maxY >= minY) {
          const contentW = maxX - minX + 1;
          const contentH = maxY - minY + 1;
          const pad = Math.max(2, Math.round(Math.max(contentW, contentH) * 0.015));
          const x = Math.max(0, minX - pad);
          const y = Math.max(0, minY - pad);
          const right = Math.min(width, maxX + 1 + pad);
          const bottom = Math.min(height, maxY + 1 + pad);
          const cropW = Math.max(1, right - x);
          const cropH = Math.max(1, bottom - y);
          const out = document.createElement('canvas');
          out.width = cropW;
          out.height = cropH;
          const outCtx = out.getContext('2d');
          if (outCtx) {
            outCtx.clearRect(0, 0, cropW, cropH);
            outCtx.drawImage(work, x, y, cropW, cropH, 0, 0, cropW, cropH);
            cached = out;
          }
        }
      } catch (error) {
        console.warn('V112.6: não foi possível analisar a transparência do PNG.', error);
      }
      if (!cached) cached = media;
      trimCache.set(media, cached);
    }

    return copyRenderMetadata(media, cached, draft, slot);
  }

  async function loadRawImage(draft, slot) {
    const dataUrl = sourceOf(draft, slot);
    if (!dataUrl) return null;
    const key = elementKeyOf(slot);
    let media = draft?.[key] || null;

    if (media && isVideo(media, draft, slot)) return null;
    if (!media || String(media?.tagName || '').toUpperCase() === 'CANVAS') {
      media = await loadLemeArtImageSource(dataUrl);
      try { draft[key] = media; } catch {}
    }
    return media;
  }

  // Substitui o caminho das versões 112.4/112.5 apenas para imagens estáticas.
  // Vídeos continuam passando exatamente pelo pipeline anterior.
  const getMedia0 = window.getLemeArtUserImage || getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    const current = draft || {};
    const mediaType = String(slot === 'secondary' ? current.image2MediaType : current.imageMediaType || 'image').toLowerCase();
    if (mediaType === 'video') return getMedia0(current, slot);

    try {
      const raw = await loadRawImage(current, slot);
      if (!raw) return null;
      return trimTransparentPng(raw, current, slot);
    } catch (error) {
      console.warn('V112.6: fallback para carregamento anterior da mídia.', error);
      const fallback = await getMedia0(current, slot);
      return copyRenderMetadata(fallback, fallback, current, slot);
    }
  };
  window.getLemeArtUserImage = getLemeArtUserImage;

  // Preenche a moldura inteira ANTES de desenhar a mídia. Em PNG transparente,
  // as áreas vazias passam a revelar o mesmo fundo do modelo claro/escuro.
  const drawCover0 = window.drawLemeArtImageCover || drawLemeArtImageCover;
  drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
    const background = String(media?.__lemeFrameBackground || LIGHT_BG);
    ctx.save();
    try {
      roundedLemeArtRect(ctx, x, y, width, height, radius);
      ctx.fillStyle = background;
      ctx.fill();
    } finally {
      ctx.restore();
    }
    return drawCover0(ctx, media, x, y, width, height, radius);
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  // Informações LEME: algumas versões chamam este renderer antes de posts estar
  // hidratado. Normalizamos para array e impedimos a falha em posts.length.
  if (typeof window.renderLemeInformation === 'function' || typeof renderLemeInformation === 'function') {
    const renderInfo0 = window.renderLemeInformation || renderLemeInformation;
    renderLemeInformation = function(profile = {}, posts = []) {
      const safeProfile = profile && typeof profile === 'object' ? profile : {};
      const safePosts = Array.isArray(posts) ? posts : [];
      try {
        return renderInfo0(safeProfile, safePosts);
      } catch (error) {
        console.error('V112.6: erro ao renderizar Informações LEME.', error);
        // Segunda tentativa com defaults totalmente seguros.
        return renderInfo0({ nome: 'LEME', ...safeProfile }, safePosts);
      }
    };
    window.renderLemeInformation = renderLemeInformation;
  }

  window.__LEME_STABILITY_FIX_VERSION__ = VERSION;
})();
