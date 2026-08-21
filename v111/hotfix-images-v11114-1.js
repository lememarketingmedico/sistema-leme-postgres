(() => {
  const HOTFIX_VERSION = '111.14.1';
  const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
  const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|avif|gif|bmp|svg)(?:$|\?)/i;
  const previousReadMedia = window.readLemeArtImageFile || readLemeArtImageFile;

  function isImageFile(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || IMAGE_EXT_RE.test(name);
  }

  async function uploadImage(file) {
    const form = new FormData();
    form.append('file', file, file.name || 'imagem');
    const response = await fetch('/api/leme-art-media', {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false || !data?.url) {
      throw new Error(data?.error || 'Não foi possível salvar a imagem no sistema.');
    }
    return data;
  }

  function decodeLocalImage(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try { URL.revokeObjectURL(objectUrl); } catch {}
        resolve(image);
      };
      image.onerror = () => {
        try { URL.revokeObjectURL(objectUrl); } catch {}
        reject(new Error('Não foi possível abrir a imagem selecionada.'));
      };
      image.src = objectUrl;
    });
  }

  function assignImage(scope, slot, template, file, media, imageElement) {
    const draft = getLemeArtDraft(scope);
    const secondary = slot === 'secondary';
    if (secondary) {
      draft.image2DataUrl = String(media.url || '');
      draft.image2Name = media.file_name || file.name || 'Imagem selecionada';
      draft.image2Element = imageElement || null;
      draft.image2MediaType = 'image';
      draft.image2PositionX = 50;
      draft.image2PositionY = 50;
      draft.image2Zoom = 100;
    } else {
      draft.imageDataUrl = String(media.url || '');
      draft.imageName = media.file_name || file.name || 'Imagem selecionada';
      draft.imageElement = imageElement || null;
      draft.imageMediaType = 'image';
      draft.imagePositionX = 50;
      draft.imagePositionY = 50;
      draft.imageZoom = 100;
    }
    draft.template = normalizeLemeArtTemplate(template);
    return draft;
  }

  function persistPageDraft(scope) {
    try {
      if (typeof getLemeArtScopeKey !== 'function' || getLemeArtScopeKey(scope) !== 'page') return;
      const key = 'leme_art_studio_v1103';
      const existing = JSON.parse(localStorage.getItem(key) || '{}') || {};
      const page = getLemeArtDraft('page');
      const carousel = getLemeArtCarousel('page-carousel');
      const plainPage = {
        template: page.template,
        format: page.format,
        fontScale: page.fontScale,
        text: page.text,
        imageDataUrl: page.imageDataUrl,
        imageName: page.imageName,
        image2DataUrl: page.image2DataUrl,
        image2Name: page.image2Name,
        imagePositionX: page.imagePositionX,
        imagePositionY: page.imagePositionY,
        image2PositionX: page.image2PositionX,
        image2PositionY: page.image2PositionY,
        imageZoom: page.imageZoom,
        image2Zoom: page.image2Zoom,
        imageMediaType: page.imageMediaType,
        image2MediaType: page.image2MediaType,
        mediaFrameHeight: page.mediaFrameHeight
      };
      localStorage.setItem(key, JSON.stringify({
        ...existing,
        mode: typeof lemeArtPageMode === 'string' ? lemeArtPageMode : (existing.mode || 'static'),
        page: plainPage,
        carousel: {
          ...(existing.carousel || {}),
          activeSlideId: carousel?.activeSlideId || '',
          slides: typeof serializeLemeArtCarouselSlides === 'function'
            ? serializeLemeArtCarouselSlides('page-carousel')
            : (carousel?.slides || [])
        }
      }));
    } catch (error) {
      console.warn('Hotfix de imagens: não foi possível persistir o rascunho local.', error);
    }
  }

  function refreshImageUi(scope) {
    try {
      const select = document.getElementById(`leme_art_${scope}_template`);
      if (select) select.value = getLemeArtDraft(scope).template;
    } catch {}
    try { syncLemeArtFontControls(scope); } catch {}
    try { syncLemeArtImageControls(scope); } catch {}
    try { window.refreshLemeArtZoomControls?.(scope); } catch {}
    try { window.refreshLemeArtFrameHeightControl?.(scope); } catch {}
    try { scheduleLemeArtPreview(scope); } catch (error) { console.error(error); }
  }

  async function handleImage(file, scope, slot, template) {
    if (Number(file?.size || 0) > MAX_IMAGE_BYTES) {
      toast('A imagem deve ter no máximo 30 MB.');
      return;
    }

    toast('Salvando imagem original, sem compressão...');
    try {
      const [media, localImage] = await Promise.all([
        uploadImage(file),
        decodeLocalImage(file).catch(() => null)
      ]);

      const draft = assignImage(scope, slot, template, file, media, localImage);

      if (!localImage) {
        try {
          const loaded = await loadLemeArtImageSource(media.url);
          if (slot === 'secondary') draft.image2Element = loaded;
          else draft.imageElement = loaded;
        } catch (error) {
          console.warn('Hotfix de imagens: arquivo salvo, mas o preview não foi decodificado.', error);
        }
      }

      // Não reconstrói a aplicação inteira após o upload. A V111.14 fazia render()
      // aqui e podia perder o estado da imagem antes do preview consumi-la.
      persistPageDraft(scope);
      refreshImageUi(scope);
      toast(slot === 'secondary'
        ? 'Imagem da direita adicionada à arte.'
        : 'Imagem adicionada à arte.');
    } catch (error) {
      console.error('Hotfix de imagens V111.14.1:', error);
      toast(error.message || 'Não foi possível abrir essa imagem.');
    }
  }

  readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
    if (!isImageFile(file)) return previousReadMedia(file, scope, slot, template);
    return handleImage(file, scope, slot, template);
  };
  window.readLemeArtImageFile = readLemeArtImageFile;
  window.__LEME_IMAGE_HOTFIX_VERSION__ = HOTFIX_VERSION;
})();
