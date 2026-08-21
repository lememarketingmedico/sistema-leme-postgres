(() => {
  const VERSION = '111.15';
  const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
  const PAGE_STORAGE_KEY = 'leme_art_studio_v1103';
  const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|avif|gif|bmp)(?:$|\?)/i;
  const previousReadMedia = window.readLemeArtImageFile || readLemeArtImageFile;

  function isImageFile(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || IMAGE_EXT_RE.test(name);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível ler essa imagem no navegador.'));
      reader.readAsDataURL(file);
    });
  }

  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('O navegador não conseguiu decodificar essa imagem.'));
      image.src = src;
    });
  }

  async function uploadOriginalImage(file) {
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

  function applyImageToDraft(scope, slot, template, file, media, localImage) {
    const draft = getLemeArtDraft(scope);
    const secondary = slot === 'secondary';
    if (secondary) {
      draft.image2DataUrl = String(media.url || '');
      draft.image2Name = media.file_name || file.name || 'Imagem selecionada';
      draft.image2Element = localImage;
      draft.image2MediaType = 'image';
      draft.image2PositionX = 50;
      draft.image2PositionY = 50;
      draft.image2Zoom = 100;
    } else {
      draft.imageDataUrl = String(media.url || '');
      draft.imageName = media.file_name || file.name || 'Imagem selecionada';
      draft.imageElement = localImage;
      draft.imageMediaType = 'image';
      draft.imagePositionX = 50;
      draft.imagePositionY = 50;
      draft.imageZoom = 100;
    }
    draft.template = normalizeLemeArtTemplate(template);
    return draft;
  }

  function persistPageStudio() {
    try {
      if (typeof getLemeArtScopeKey !== 'function') return;
      const page = getLemeArtDraft('page');
      const carousel = getLemeArtCarousel('page-carousel');
      const pageData = {
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
        mediaFrameHeight: page.mediaFrameHeight
      };
      localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify({
        mode: typeof lemeArtPageMode === 'string' ? lemeArtPageMode : 'static',
        page: pageData,
        carousel: {
          activeSlideId: carousel.activeSlideId,
          slides: typeof serializeLemeArtCarouselSlides === 'function'
            ? serializeLemeArtCarouselSlides('page-carousel')
            : carousel.slides
        }
      }));
    } catch (error) {
      console.warn('V111.15: não foi possível persistir o rascunho da arte.', error);
    }
  }

  function refreshEditorAfterImage(scope, draft) {
    const select = document.getElementById(`leme_art_${scope}_template`);
    if (select) select.value = draft.template;

    // A V111.14 fazia um render completo antes da imagem estar carregada.
    // Mantemos o render para reconstruir os controles, mas entregamos o
    // HTMLImageElement já decodificado ao draft para eliminar a segunda
    // leitura/race da rota /media/leme-art-image.
    render({ skipAutoSync: true });
    requestAnimationFrame(() => {
      try { syncLemeArtFontControls(scope); } catch {}
      try { syncLemeArtImageControls(scope); } catch {}
      try { window.refreshLemeArtZoomControls?.(scope); } catch {}
      try { window.refreshLemeArtFrameHeightControl?.(scope); } catch {}
      try { scheduleLemeArtPreview(scope); } catch {}
    });
  }

  readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
    if (!isImageFile(file)) return previousReadMedia(file, scope, slot, template);
    if (Number(file?.size || 0) > MAX_IMAGE_BYTES) {
      toast('A imagem deve ter no máximo 30 MB.');
      return;
    }

    toast('Carregando e salvando imagem...');
    Promise.all([
      readFileAsDataUrl(file).then(preloadImage),
      uploadOriginalImage(file)
    ]).then(([localImage, media]) => {
      const draft = applyImageToDraft(scope, slot, template, file, media, localImage);
      if (getLemeArtScopeKey(scope) === 'page') persistPageStudio();
      refreshEditorAfterImage(scope, draft);
      toast(slot === 'secondary' ? 'Imagem da direita carregada.' : 'Imagem carregada.');
    }).catch(error => {
      console.error('V111.15: falha ao carregar imagem da arte.', error);
      toast(error.message || 'Não foi possível carregar essa imagem.');
    });
  };

  window.readLemeArtImageFile = readLemeArtImageFile;
  window.LEME_ART_MEDIA_HOTFIX_VERSION = VERSION;
})();
