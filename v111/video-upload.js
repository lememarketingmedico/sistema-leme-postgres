(() => {
  const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
  const previousReadMediaV111 = readLemeArtImageFile;

  function isStoredVideoUrl(value = '') {
    return /^\/media\/leme-art\//.test(String(value || '')) || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(String(value || ''));
  }

  function markStoredVideo(draft) {
    if (!draft || typeof draft !== 'object') return draft;
    if (isStoredVideoUrl(draft.imageDataUrl)) draft.imageMediaType = 'video';
    if (isStoredVideoUrl(draft.image2DataUrl)) draft.image2MediaType = 'video';
    return draft;
  }

  try {
    markStoredVideo(lemeArtRuntime?.page);
    markStoredVideo(lemeArtRuntime?.modal);
    lemeArtCarouselRuntime?.page?.slides?.forEach(markStoredVideo);
    lemeArtCarouselRuntime?.modal?.slides?.forEach(markStoredVideo);
  } catch {}

  const previousGetDraftV111Upload = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') {
    return markStoredVideo(previousGetDraftV111Upload(scope));
  };

  async function uploadLemeArtVideo(file) {
    const form = new FormData();
    form.append('file', file, file.name || 'video');
    const response = await fetch('/api/leme-art-media', {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false || !data?.url) {
      throw new Error(data?.error || 'Não foi possível salvar o vídeo no sistema.');
    }
    return data;
  }

  readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
    const type = String(file?.type || '').toLowerCase();
    if (!type.startsWith('video/')) return previousReadMediaV111(file, scope, slot, template);
    if (Number(file.size || 0) > MAX_VIDEO_BYTES) {
      toast('O vídeo deve ter no máximo 15 MB.');
      return;
    }

    toast('Salvando vídeo no sistema...');
    uploadLemeArtVideo(file).then(media => {
      const draft = getLemeArtDraft(scope);
      const secondary = slot === 'secondary';
      if (secondary) {
        draft.image2DataUrl = media.url;
        draft.image2Name = media.file_name || file.name || 'Vídeo selecionado';
        draft.image2Element = null;
        draft.image2MediaType = 'video';
        draft.image2PositionX = 50;
        draft.image2PositionY = 50;
        draft.video2AudioEnabled = true;
      } else {
        draft.imageDataUrl = media.url;
        draft.imageName = media.file_name || file.name || 'Vídeo selecionado';
        draft.imageElement = null;
        draft.imageMediaType = 'video';
        draft.imagePositionX = 50;
        draft.imagePositionY = 50;
        draft.videoAudioEnabled = true;
      }
      draft.template = normalizeLemeArtTemplate(template);

      try {
        if (typeof window.setLemeArtImagePosition === 'function') {
          window.setLemeArtImagePosition(scope, slot, 'x', 50);
          window.setLemeArtImagePosition(scope, slot, 'y', 50);
        }
      } catch {}

      render({ skipAutoSync: true });
      toast('Vídeo salvo. Agora você pode ajustar o enquadramento e o áudio.');
    }).catch(error => {
      console.error(error);
      toast(error.message || 'Não foi possível salvar o vídeo.');
    });
  };
})();
