(() => {
  function inferMediaType(dataUrl = '', explicit = '') {
    if (explicit === 'video' || explicit === 'image') return explicit;
    const value = String(dataUrl || '');
    return (/^data:video\//i.test(value) || /^\/media\/leme-art\//.test(value) || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(value)) ? 'video' : 'image';
  }

  function draftHasVideo(draft = {}) {
    return Boolean(
      (draft.imageDataUrl && inferMediaType(draft.imageDataUrl, draft.imageMediaType || draft.arte_midia_tipo) === 'video') ||
      (draft.image2DataUrl && inferMediaType(draft.image2DataUrl, draft.image2MediaType || draft.arte_midia2_tipo) === 'video')
    );
  }

  function freshExportVideo(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.playsInline = true;
      video.loop = false;
      video.crossOrigin = 'anonymous';
      video.src = src;
      video.addEventListener('loadedmetadata', () => resolve(video), { once: true });
      video.addEventListener('error', () => reject(new Error('Não foi possível preparar o vídeo para exportação.')), { once: true });
      video.load();
    });
  }

  function recorderMime() {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidates.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || 'video/webm';
  }

  async function renderVideoWebm(draft, formatKey) {
    if (!window.MediaRecorder) throw new Error('Seu navegador não suporta renderização de vídeo. Use Chrome ou Edge atualizado.');

    const clone = createLemeArtDraft(draft, draft);
    Object.assign(clone, {
      imageDataUrl: draft.imageDataUrl || '',
      imageName: draft.imageName || '',
      imageMediaType: draft.imageMediaType,
      image2DataUrl: draft.image2DataUrl || '',
      image2Name: draft.image2Name || '',
      image2MediaType: draft.image2MediaType,
      imagePositionX: draft.imagePositionX,
      imagePositionY: draft.imagePositionY,
      image2PositionX: draft.image2PositionX,
      image2PositionY: draft.image2PositionY,
      videoAudioEnabled: draft.videoAudioEnabled,
      video2AudioEnabled: draft.video2AudioEnabled,
      highlightColor: draft.highlightColor,
      text: draft.text,
      template: draft.template,
      fontScale: draft.fontScale
    });

    const sources = [];
    if (clone.imageDataUrl && inferMediaType(clone.imageDataUrl, clone.imageMediaType) === 'video') {
      sources.push({ slot: 'primary', src: clone.imageDataUrl, audio: clone.videoAudioEnabled !== false });
    }
    if (clone.image2DataUrl && inferMediaType(clone.image2DataUrl, clone.image2MediaType) === 'video') {
      sources.push({ slot: 'secondary', src: clone.image2DataUrl, audio: clone.video2AudioEnabled !== false });
    }
    if (!sources.length) throw new Error('Nenhum vídeo encontrado nesta arte.');

    const exportVideos = [];
    for (const source of sources) {
      const video = await freshExportVideo(source.src);
      video.__lemeCropPosition = {
        x: source.slot === 'secondary' ? Number(clone.image2PositionX || 50) : Number(clone.imagePositionX || 50),
        y: source.slot === 'secondary' ? Number(clone.image2PositionY || 50) : Number(clone.imagePositionY || 50)
      };
      if (source.slot === 'secondary') clone.image2Element = video;
      else clone.imageElement = video;
      exportVideos.push({ ...source, video });
    }

    const duration = Math.max(...exportVideos.map(item => Number.isFinite(item.video.duration) ? item.video.duration : 0), 1);
    const canvas = document.createElement('canvas');
    await renderLemeArtDraftCanvas(clone, formatKey, canvas);
    const stream = canvas.captureStream(30);

    let audioContext = null;
    const audioItems = exportVideos.filter(item => item.audio);
    if (audioItems.length && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      const destination = audioContext.createMediaStreamDestination();
      for (const item of audioItems) {
        try {
          const sourceNode = audioContext.createMediaElementSource(item.video);
          sourceNode.connect(destination);
        } catch (error) {
          console.warn('Áudio deste vídeo não pôde ser anexado.', error);
        }
      }
      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      await audioContext.resume().catch(() => {});
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: recorderMime(),
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 160_000
    });
    const finished = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', event => { if (event.data?.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })), { once: true });
      recorder.addEventListener('error', event => reject(event.error || new Error('Falha ao renderizar vídeo.')), { once: true });
    });

    exportVideos.forEach(item => {
      item.video.currentTime = 0;
      item.video.muted = false;
      item.video.volume = item.audio ? 1 : 0;
    });

    recorder.start(250);
    await Promise.all(exportVideos.map(item => item.video.play().catch(() => {})));
    const startedAt = performance.now();
    while ((performance.now() - startedAt) / 1000 < duration) {
      await renderLemeArtDraftCanvas(clone, formatKey, canvas);
      await new Promise(resolve => setTimeout(resolve, 34));
    }

    exportVideos.forEach(item => item.video.pause());
    recorder.stop();
    const blob = await finished;
    stream.getTracks().forEach(track => track.stop());
    if (audioContext) await audioContext.close().catch(() => {});
    return blob;
  }

  async function convertToMp4(webmBlob, fileName = 'leme-video.mp4') {
    const form = new FormData();
    const sourceName = String(fileName || 'leme-video.mp4').replace(/\.mp4$/i, '.webm');
    form.append('file', webmBlob, sourceName);
    const response = await fetch('/api/leme-art-convert-mp4', {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Não foi possível converter o vídeo para MP4.');
    }
    return response.blob();
  }

  async function exportDraftMp4(draft, formatKey, name = 'leme-video.mp4') {
    const webm = await renderVideoWebm(draft, formatKey);
    return convertToMp4(webm, name);
  }

  const staticDownload = generateAndDownloadLemeArt;
  generateAndDownloadLemeArt = async function(scope = 'page') {
    const draft = getLemeArtDraft(scope);
    if (!draftHasVideo(draft)) return staticDownload(scope);
    if (!normalizeLemeArtText(draft.text)) return toast('Digite o texto da arte antes de gerar.');

    const button = document.getElementById(`leme_art_${scope}_download`);
    const original = button?.textContent || 'Gerar e baixar MP4';
    if (button) { button.disabled = true; button.textContent = 'Renderizando MP4...'; }

    try {
      const baseName = lemeArtDownloadName(draft.text, draft.template, draft.format).replace(/\.png$/i, '.mp4');
      const mp4 = await exportDraftMp4(draft, draft.format, baseName);
      downloadLemeArtBlob(mp4, baseName);
      toast(`Vídeo MP4 exportado${(draft.videoAudioEnabled !== false || draft.video2AudioEnabled !== false) ? ' com a configuração de áudio escolhida' : ' sem áudio'}.`);
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível gerar o MP4.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.generateAndDownloadLemeArt = generateAndDownloadLemeArt;

  const staticCarouselExport = exportLemeArtCarousel;
  exportLemeArtCarousel = async function(scope = 'page-carousel') {
    const carousel = getLemeArtCarousel(scope);
    if (!carousel?.slides?.some(draftHasVideo)) return staticCarouselExport(scope);

    const invalidIndex = carousel.slides.findIndex((slide, index) => validateLemeArtDraft(slide, index + 1));
    if (invalidIndex !== -1) {
      carousel.activeSlideId = carousel.slides[invalidIndex].id;
      refreshLemeArtCarousel(scope);
      toast(validateLemeArtDraft(carousel.slides[invalidIndex], invalidIndex + 1));
      return;
    }

    const button = document.getElementById(`leme_art_${scope}_export_all`);
    const original = button?.textContent || 'Exportar carrossel';
    if (button) button.disabled = true;

    try {
      const files = [];
      const formats = [
        { key: 'feed', folder: 'Feed-1080x1350' },
        { key: 'story', folder: 'Story-1080x1920' }
      ];
      const total = carousel.slides.length * formats.length;
      let completed = 0;

      for (const format of formats) {
        for (let index = 0; index < carousel.slides.length; index += 1) {
          const slide = carousel.slides[index];
          const number = String(index + 1).padStart(2, '0');
          if (button) button.textContent = `Gerando ${completed + 1}/${total}...`;

          if (draftHasVideo(slide)) {
            const mp4 = await exportDraftMp4(slide, format.key, `slide-${number}.mp4`);
            files.push({ name: `${format.folder}/slide-${number}.mp4`, data: new Uint8Array(await mp4.arrayBuffer()) });
          } else {
            const canvas = await renderLemeArtDraftCanvas(slide, format.key);
            const blob = await canvasToPngBlob(canvas);
            files.push({ name: `${format.folder}/slide-${number}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
          }
          completed += 1;
        }
      }

      downloadLemeArtBlob(createLemeArtZip(files), 'leme-carrossel-artes-v111-2.zip');
      toast('Carrossel exportado: vídeos em MP4 e slides estáticos em PNG.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar o carrossel.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.exportLemeArtCarousel = exportLemeArtCarousel;

  const previousSync = syncLemeArtImageControls;
  syncLemeArtImageControls = function(scope = 'page') {
    const result = previousSync(scope);
    const draft = getLemeArtDraft(scope);
    const button = document.getElementById(`leme_art_${scope}_download`);
    if (button && draftHasVideo(draft)) button.textContent = 'Gerar e baixar MP4';
    return result;
  };
})();
