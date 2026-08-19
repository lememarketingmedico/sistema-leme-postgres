(() => {
  const VIDEO_MAX_BYTES = 8 * 1024 * 1024;
  const MEDIA_OPTIONS_KEY = 'leme_art_media_options_v111';
  const VIDEO_MIME_RE = /^data:video\//i;

  function inferMediaType(dataUrl = '', explicit = '') {
    if (explicit === 'video' || explicit === 'image') return explicit;
    return VIDEO_MIME_RE.test(String(dataUrl || '')) ? 'video' : 'image';
  }

  function boolValue(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null || value === '') return fallback;
    return !['false', '0', 'nao', 'não', 'off', 'muted', 'sem_audio'].includes(String(value).toLowerCase());
  }

  function mediaDraftKey(draft, slot = 'primary') {
    return `${String(draft?.recordKey || draft?.id || 'draft')}:${slot}`;
  }

  function getMediaOptions() {
    try { return JSON.parse(localStorage.getItem(MEDIA_OPTIONS_KEY) || '{}') || {}; } catch { return {}; }
  }

  function saveMediaOption(draft, slot, enabled) {
    try {
      const all = getMediaOptions();
      all[mediaDraftKey(draft, slot)] = Boolean(enabled);
      localStorage.setItem(MEDIA_OPTIONS_KEY, JSON.stringify(all));
    } catch {}
  }

  function restoreMediaOption(draft, slot, fallback = true) {
    const all = getMediaOptions();
    const key = mediaDraftKey(draft, slot);
    return Object.prototype.hasOwnProperty.call(all, key) ? Boolean(all[key]) : fallback;
  }

  function enhanceMediaDraft(draft) {
    if (!draft || typeof draft !== 'object') return draft;
    draft.imageMediaType = inferMediaType(draft.imageDataUrl, draft.imageMediaType || draft.midia_tipo);
    draft.image2MediaType = inferMediaType(draft.image2DataUrl, draft.image2MediaType || draft.midia2_tipo);
    draft.videoAudioEnabled = restoreMediaOption(draft, 'primary', boolValue(draft.videoAudioEnabled ?? draft.video_audio, true));
    draft.video2AudioEnabled = restoreMediaOption(draft, 'secondary', boolValue(draft.video2AudioEnabled ?? draft.video2_audio, true));
    return draft;
  }

  const previousCreateDraft = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) {
    const draft = previousCreateDraft(data, defaults);
    const source = data && typeof data === 'object' ? data : {};
    const fallback = defaults && typeof defaults === 'object' ? defaults : {};
    draft.imageMediaType = inferMediaType(draft.imageDataUrl, source.imageMediaType ?? source.midia_tipo ?? fallback.imageMediaType);
    draft.image2MediaType = inferMediaType(draft.image2DataUrl, source.image2MediaType ?? source.midia2_tipo ?? fallback.image2MediaType);
    draft.videoAudioEnabled = boolValue(source.videoAudioEnabled ?? source.video_audio ?? fallback.videoAudioEnabled, true);
    draft.video2AudioEnabled = boolValue(source.video2AudioEnabled ?? source.video2_audio ?? fallback.video2AudioEnabled, true);
    return enhanceMediaDraft(draft);
  };

  const previousGetDraft = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') {
    return enhanceMediaDraft(previousGetDraft(scope));
  };

  const previousPrepareModal = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    const draft = previousPrepareModal(post);
    if (post) {
      draft.imageMediaType = inferMediaType(draft.imageDataUrl, post.arte_midia_tipo || post.imageMediaType);
      draft.image2MediaType = inferMediaType(draft.image2DataUrl, post.arte_midia2_tipo || post.image2MediaType);
      draft.videoAudioEnabled = boolValue(post.arte_video_audio ?? post.videoAudioEnabled, true);
      draft.video2AudioEnabled = boolValue(post.arte_video2_audio ?? post.video2AudioEnabled, true);
    }
    return enhanceMediaDraft(draft);
  };

  function parseReferenceLinks(value) {
    const source = Array.isArray(value) ? value.join('\n') : String(value || '');
    return [...new Set(source.split(/\r?\n|\s*,\s*/).map(item => item.trim()).filter(Boolean))].slice(0, 30);
  }

  function renderReferenceList(value) {
    const refs = parseReferenceLinks(value);
    if (!refs.length) return '';
    return `<div class="post-reference-list">${refs.map((url, index) => {
      const safeHttp = /^https?:\/\//i.test(url);
      return safeHttp
        ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Referência ${index + 1} ↗</a>`
        : `<span>${escapeHtml(url)}</span>`;
    }).join('')}</div>`;
  }

  const previousRenderPostModal = renderPostModal;
  renderPostModal = function() {
    const editing = state.modal?.postId
      ? getPosts().find(post => String(post.registro_id || post.id || '') === String(state.modal.postId || ''))
      : null;
    let html = previousRenderPostModal();
    const refsValue = parseReferenceLinks(editing?.referencias || editing?.referencia || editing?.links_referencia || []).join('\n');
    const refsBlock = `
      <label class="full post-reference-field">Referências
        <textarea class="textarea" id="p_referencias" rows="3" placeholder="Cole um link por linha. Ex.: post, vídeo, artigo, campanha...">${escapeHtml(refsValue)}</textarea>
        <small>Esses links ficam salvos junto da publicação para consultar depois.</small>
        ${renderReferenceList(refsValue)}
      </label>`;
    html = html.replace('<label>Formato <select', `${refsBlock}<label>Formato <select`);
    return html;
  };

  const previousCollectPost = collectPost;
  collectPost = function() {
    const record = previousCollectPost();
    return {
      ...record,
      referencias: parseReferenceLinks(document.getElementById('p_referencias')?.value || record.referencias || [])
    };
  };

  // == no início de uma linha vira bullet point em todos os modelos.
  const previousParseMarkup = parseLemeArtMarkup;
  parseLemeArtMarkup = function(value) {
    const withBullets = String(value || '').replace(/^\s*==\s*/gm, '• ');
    return previousParseMarkup(withBullets);
  };

  const previousRenderEditor = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    let html = previousRenderEditor(scope, options);
    if (!html.includes('== texto')) {
      html = html.replace(
        '</div>\n\n        <div id="leme_art_',
        '<span><code>== texto</code> cria um bullet point •</span></div>\n\n        <div id="leme_art_'
      );
    }
    return html;
  };

  function getSlotState(draft, slot = 'primary') {
    const secondary = slot === 'secondary';
    const dataUrl = String(secondary ? draft.image2DataUrl : draft.imageDataUrl || '');
    const name = String(secondary ? draft.image2Name : draft.imageName || '');
    const mediaType = inferMediaType(dataUrl, secondary ? draft.image2MediaType : draft.imageMediaType);
    const audioEnabled = secondary ? draft.video2AudioEnabled : draft.videoAudioEnabled;
    return { dataUrl, name, mediaType, audioEnabled };
  }

  renderLemeArtImageDropzone = function(scope, controlKey, slot, label, template, draft) {
    const prefix = `leme_art_${scope}_${controlKey}`;
    const media = getSlotState(enhanceMediaDraft(draft), slot);
    const hasMedia = Boolean(media.dataUrl);
    const isVideo = media.mediaType === 'video';
    return `
      <div class="leme-art-image-slot leme-media-slot ${isVideo ? 'is-video' : ''}">
        <span class="field-label">${escapeHtml(label)}</span>
        <div class="leme-art-dropzone"
          id="${prefix}_dropzone"
          role="button"
          tabindex="0"
          onclick="document.getElementById('${prefix}_file')?.click()"
          onkeydown="if(event.key === 'Enter' || event.key === ' '){event.preventDefault(); document.getElementById('${prefix}_file')?.click();}"
          ondragover="handleLemeArtDragOver(event)"
          ondragleave="handleLemeArtDragLeave(event)"
          ondrop="handleLemeArtDrop(event, '${escapeAttr(scope)}', '${escapeAttr(slot)}', '${escapeAttr(template)}')">
          <input class="hidden" id="${prefix}_file" type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
            onchange="handleLemeArtFileInput(event, '${escapeAttr(scope)}', '${escapeAttr(slot)}', '${escapeAttr(template)}')">
          <div class="leme-art-drop-icon" aria-hidden="true">＋</div>
          <div>
            <strong>Arraste imagem ou vídeo aqui</strong>
            <small>PNG, JPG, WebP, MP4, WebM ou MOV</small>
            <span id="${prefix}_file_name">${hasMedia ? escapeHtml(media.name || (isVideo ? 'Vídeo selecionado' : 'Imagem selecionada')) : 'Nenhuma mídia selecionada'}</span>
          </div>
          ${hasMedia ? (isVideo
            ? `<video id="${prefix}_thumb" class="leme-art-drop-thumb leme-art-drop-video" src="${escapeAttr(media.dataUrl)}" muted loop playsinline autoplay></video>`
            : `<img id="${prefix}_thumb" class="leme-art-drop-thumb" src="${escapeAttr(media.dataUrl)}" alt="Prévia de ${escapeAttr(label.toLowerCase())}">`)
            : `<img id="${prefix}_thumb" class="leme-art-drop-thumb hidden" src="" alt="Prévia">`}
        </div>
        ${isVideo ? `<label class="leme-video-audio-toggle" onclick="event.stopPropagation()">
          <input type="checkbox" ${media.audioEnabled ? 'checked' : ''} onchange="setLemeArtVideoAudio('${escapeAttr(scope)}','${escapeAttr(slot)}',this.checked)">
          <span>Exportar com áudio</span>
          <small>Se o arquivo possuir áudio. Desmarque para exportar mudo.</small>
        </label>` : ''}
        <button class="leme-art-clear-image ${hasMedia ? '' : 'hidden'}" id="${prefix}_clear_image" type="button"
          onclick="event.stopPropagation(); clearLemeArtImage('${escapeAttr(scope)}', '${escapeAttr(slot)}')">
          Remover mídia
        </button>
      </div>`;
  };

  window.setLemeArtVideoAudio = function(scope, slot, enabled) {
    const draft = enhanceMediaDraft(getLemeArtDraft(scope));
    if (slot === 'secondary') draft.video2AudioEnabled = Boolean(enabled);
    else draft.videoAudioEnabled = Boolean(enabled);
    saveMediaOption(draft, slot, enabled);
  };

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível abrir o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  const previousReadMedia = readLemeArtImageFile;
  readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
    const type = String(file?.type || '').toLowerCase();
    const isVideo = type.startsWith('video/');
    const isImage = type.startsWith('image/');
    if (!isVideo && !isImage) {
      toast('Selecione uma imagem ou vídeo válido.');
      return;
    }
    if (!isVideo) {
      const draft = enhanceMediaDraft(getLemeArtDraft(scope));
      if (slot === 'secondary') draft.image2MediaType = 'image'; else draft.imageMediaType = 'image';
      return previousReadMedia(file, scope, slot, template);
    }
    if (Number(file.size || 0) > VIDEO_MAX_BYTES) {
      toast('Para manter a edição salva no sistema, use vídeos de até 8 MB por arquivo.');
      return;
    }
    readFileAsDataUrl(file).then(dataUrl => {
      const draft = enhanceMediaDraft(getLemeArtDraft(scope));
      const secondary = slot === 'secondary';
      if (secondary) {
        draft.image2DataUrl = dataUrl;
        draft.image2Name = file.name || 'Vídeo selecionado';
        draft.image2Element = null;
        draft.image2MediaType = 'video';
        draft.image2PositionX = 50;
        draft.image2PositionY = 50;
        draft.video2AudioEnabled = true;
      } else {
        draft.imageDataUrl = dataUrl;
        draft.imageName = file.name || 'Vídeo selecionado';
        draft.imageElement = null;
        draft.imageMediaType = 'video';
        draft.imagePositionX = 50;
        draft.imagePositionY = 50;
        draft.videoAudioEnabled = true;
      }
      saveMediaOption(draft, slot, true);
      draft.template = normalizeLemeArtTemplate(template);
      render({ skipAutoSync: true });
      ensureVideoPreviewLoop();
      toast('Vídeo adicionado. Você pode reposicionar e escolher áudio na exportação.');
    }).catch(error => toast(error.message || 'Não foi possível abrir o vídeo.'));
  };

  const previousClearMedia = clearLemeArtImage;
  clearLemeArtImage = function(scope, slot = 'primary') {
    const draft = enhanceMediaDraft(getLemeArtDraft(scope));
    previousClearMedia(scope, slot);
    if (slot === 'secondary') {
      draft.image2MediaType = 'image';
      draft.video2AudioEnabled = true;
    } else {
      draft.imageMediaType = 'image';
      draft.videoAudioEnabled = true;
    }
    render({ skipAutoSync: true });
  };

  function loadVideoSource(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.playsInline = true;
      video.loop = true;
      video.muted = true;
      video.src = src;
      const done = () => {
        cleanup();
        video.play().catch(() => {});
        resolve(video);
      };
      const fail = () => { cleanup(); reject(new Error('Não foi possível carregar o vídeo da arte.')); };
      const cleanup = () => {
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('error', fail);
      };
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('error', fail, { once: true });
      video.load();
    });
  }

  const previousGetUserImage = getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    enhanceMediaDraft(draft);
    const media = getSlotState(draft, slot);
    if (media.mediaType !== 'video') return previousGetUserImage(draft, slot);
    const secondary = slot === 'secondary';
    const elementKey = secondary ? 'image2Element' : 'imageElement';
    if (!draft[elementKey] || draft[elementKey].tagName !== 'VIDEO') {
      draft[elementKey] = await loadVideoSource(media.dataUrl);
    }
    const video = draft[elementKey];
    video.__lemeCropPosition = {
      x: Number(secondary ? draft.image2PositionX : draft.imagePositionX) || 50,
      y: Number(secondary ? draft.image2PositionY : draft.imagePositionY) || 50
    };
    return video;
  };

  drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
    const mediaWidth = media.videoWidth || media.naturalWidth || media.width || 1;
    const mediaHeight = media.videoHeight || media.naturalHeight || media.height || 1;
    const scale = Math.max(width / mediaWidth, height / mediaHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const position = media.__lemeCropPosition || { x: 50, y: 50 };
    const maxX = Math.max(0, mediaWidth - sourceWidth);
    const maxY = Math.max(0, mediaHeight - sourceHeight);
    const px = Math.max(0, Math.min(100, Number(position.x) || 50));
    const py = Math.max(0, Math.min(100, Number(position.y) || 50));
    const sourceX = maxX * (px / 100);
    const sourceY = maxY * (py / 100);
    ctx.save();
    roundedLemeArtRect(ctx, x, y, width, height, radius);
    ctx.clip();
    try { ctx.drawImage(media, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height); } catch {}
    ctx.restore();
  };

  const previousSerializeSlides = serializeLemeArtCarouselSlides;
  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    const carousel = getLemeArtCarousel(scope);
    return previousSerializeSlides(scope).map((serialized, index) => {
      const slide = enhanceMediaDraft(carousel.slides[index] || {});
      return {
        ...serialized,
        imageMediaType: slide.imageMediaType,
        image2MediaType: slide.image2MediaType,
        videoAudioEnabled: Boolean(slide.videoAudioEnabled),
        video2AudioEnabled: Boolean(slide.video2AudioEnabled)
      };
    });
  };

  const previousCollectWithMedia = collectPost;
  collectPost = function() {
    const record = previousCollectWithMedia();
    if (String(record.cliente_id || '') !== LEME_CLIENT_ID) return record;
    const draft = enhanceMediaDraft(getLemeArtDraft('modal'));
    return {
      ...record,
      arte_midia_tipo: draft.imageMediaType,
      arte_midia2_tipo: draft.image2MediaType,
      arte_video_audio: Boolean(draft.videoAudioEnabled),
      arte_video2_audio: Boolean(draft.video2AudioEnabled),
      arte_slides: serializeLemeArtCarouselSlides('modal-carousel')
    };
  };

  function draftHasVideo(draft) {
    enhanceMediaDraft(draft);
    return (draft.imageDataUrl && draft.imageMediaType === 'video') ||
      (draft.image2DataUrl && draft.image2MediaType === 'video');
  }

  let videoPreviewLoopRunning = false;
  function ensureVideoPreviewLoop() {
    if (videoPreviewLoopRunning) return;
    videoPreviewLoopRunning = true;
    const tick = async () => {
      let found = false;
      for (const scope of ['page', 'page-carousel', 'modal', 'modal-carousel']) {
        const canvas = document.getElementById(`leme_art_${scope}_canvas`);
        if (!canvas) continue;
        const draft = getLemeArtDraft(scope);
        if (!draftHasVideo(draft)) continue;
        found = true;
        try { await renderLemeArtCanvas(scope); } catch {}
      }
      if (!found) { videoPreviewLoopRunning = false; return; }
      window.setTimeout(() => window.requestAnimationFrame(tick), 90);
    };
    window.requestAnimationFrame(tick);
  }

  const previousInitializeCanvases = initializeLemeArtCanvases;
  initializeLemeArtCanvases = function() {
    const result = previousInitializeCanvases();
    ensureVideoPreviewLoop();
    return result;
  };

  async function freshExportVideo(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.playsInline = true;
      video.loop = false;
      video.src = src;
      video.addEventListener('loadedmetadata', () => resolve(video), { once: true });
      video.addEventListener('error', () => reject(new Error('Não foi possível preparar o vídeo para exportação.')), { once: true });
      video.load();
    });
  }

  function supportedRecorderMime() {
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return candidates.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || 'video/webm';
  }

  async function exportDraftVideoBlob(draft, formatKey) {
    if (!window.MediaRecorder) throw new Error('Este navegador não suporta exportação de vídeo. Use Chrome ou Edge atualizado.');
    const clone = createLemeArtDraft(draft, draft);
    Object.assign(clone, JSON.parse(JSON.stringify({
      imageDataUrl: draft.imageDataUrl || '', imageName: draft.imageName || '', imageMediaType: draft.imageMediaType,
      image2DataUrl: draft.image2DataUrl || '', image2Name: draft.image2Name || '', image2MediaType: draft.image2MediaType,
      imagePositionX: draft.imagePositionX, imagePositionY: draft.imagePositionY,
      image2PositionX: draft.image2PositionX, image2PositionY: draft.image2PositionY,
      videoAudioEnabled: draft.videoAudioEnabled, video2AudioEnabled: draft.video2AudioEnabled,
      highlightColor: draft.highlightColor, text: draft.text, template: draft.template, fontScale: draft.fontScale
    })));
    const sources = [];
    if (clone.imageDataUrl && inferMediaType(clone.imageDataUrl, clone.imageMediaType) === 'video') sources.push({ slot: 'primary', src: clone.imageDataUrl, audio: Boolean(clone.videoAudioEnabled) });
    if (clone.image2DataUrl && inferMediaType(clone.image2DataUrl, clone.image2MediaType) === 'video') sources.push({ slot: 'secondary', src: clone.image2DataUrl, audio: Boolean(clone.video2AudioEnabled) });
    if (!sources.length) throw new Error('Nenhum vídeo encontrado nesta arte.');

    const exportVideos = [];
    for (const source of sources) {
      const video = await freshExportVideo(source.src);
      video.__lemeCropPosition = {
        x: source.slot === 'secondary' ? Number(clone.image2PositionX || 50) : Number(clone.imagePositionX || 50),
        y: source.slot === 'secondary' ? Number(clone.image2PositionY || 50) : Number(clone.imagePositionY || 50)
      };
      if (source.slot === 'secondary') clone.image2Element = video; else clone.imageElement = video;
      exportVideos.push({ ...source, video });
    }

    const duration = Math.max(...exportVideos.map(item => Number.isFinite(item.video.duration) ? item.video.duration : 0), 1);
    const canvas = document.createElement('canvas');
    await renderLemeArtDraftCanvas(clone, formatKey, canvas);
    const stream = canvas.captureStream(30);
    let audioContext = null;
    let destination = null;
    const audioItems = exportVideos.filter(item => item.audio);
    if (audioItems.length && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      destination = audioContext.createMediaStreamDestination();
      for (const item of audioItems) {
        try {
          const sourceNode = audioContext.createMediaElementSource(item.video);
          sourceNode.connect(destination);
        } catch (error) { console.warn('Áudio deste vídeo não pôde ser anexado.', error); }
      }
      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      await audioContext.resume().catch(() => {});
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: supportedRecorderMime(), videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
    const finished = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', event => { if (event.data?.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })), { once: true });
      recorder.addEventListener('error', event => reject(event.error || new Error('Falha ao exportar vídeo.')), { once: true });
    });

    exportVideos.forEach(item => { item.video.currentTime = 0; item.video.muted = false; item.video.volume = item.audio ? 1 : 0; });
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

  const previousDownloadArt = generateAndDownloadLemeArt;
  generateAndDownloadLemeArt = async function(scope = 'page') {
    const draft = enhanceMediaDraft(getLemeArtDraft(scope));
    if (!draftHasVideo(draft)) return previousDownloadArt(scope);
    if (!normalizeLemeArtText(draft.text)) return toast('Digite o texto da arte antes de gerar.');
    const button = document.getElementById(`leme_art_${scope}_download`);
    const original = button?.textContent || 'Exportar vídeo';
    if (button) { button.disabled = true; button.textContent = 'Renderizando vídeo...'; }
    try {
      const blob = await exportDraftVideoBlob(draft, draft.format);
      const fileName = lemeArtDownloadName(draft.text, draft.template, draft.format).replace(/\.png$/i, '.webm');
      downloadLemeArtBlob(blob, fileName);
      toast(`Vídeo exportado${(draft.videoAudioEnabled || draft.video2AudioEnabled) ? ' com a configuração de áudio escolhida' : ' sem áudio'}.`);
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar o vídeo.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.generateAndDownloadLemeArt = generateAndDownloadLemeArt;

  const previousExportCarousel = exportLemeArtCarousel;
  exportLemeArtCarousel = async function(scope = 'page-carousel') {
    const carousel = getLemeArtCarousel(scope);
    if (!carousel.slides.some(draftHasVideo)) return previousExportCarousel(scope);
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
      const formats = [{ key: 'feed', folder: 'Feed-1080x1350' }, { key: 'story', folder: 'Story-1080x1920' }];
      const total = carousel.slides.length * formats.length;
      let completed = 0;
      for (const format of formats) {
        for (let index = 0; index < carousel.slides.length; index += 1) {
          const slide = enhanceMediaDraft(carousel.slides[index]);
          if (button) button.textContent = `Gerando ${completed + 1}/${total}...`;
          if (draftHasVideo(slide)) {
            const blob = await exportDraftVideoBlob(slide, format.key);
            files.push({ name: `${format.folder}/slide-${String(index + 1).padStart(2, '0')}.webm`, data: new Uint8Array(await blob.arrayBuffer()) });
          } else {
            const canvas = await renderLemeArtDraftCanvas(slide, format.key);
            const blob = await canvasToPngBlob(canvas);
            files.push({ name: `${format.folder}/slide-${String(index + 1).padStart(2, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
          }
          completed += 1;
        }
      }
      downloadLemeArtBlob(createLemeArtZip(files), 'leme-carrossel-artes-v111.zip');
      toast('Carrossel exportado. Slides com vídeo saíram em WebM; slides estáticos em PNG.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar o carrossel.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  window.exportLemeArtCarousel = exportLemeArtCarousel;

  // Atualiza textos dos botões quando houver vídeo no editor aberto.
  const previousSyncImages = syncLemeArtImageControls;
  syncLemeArtImageControls = function(scope = 'page') {
    const result = previousSyncImages(scope);
    const draft = enhanceMediaDraft(getLemeArtDraft(scope));
    const button = document.getElementById(`leme_art_${scope}_download`);
    if (button && draftHasVideo(draft)) button.textContent = 'Gerar e baixar vídeo';
    document.querySelectorAll(`#leme_art_${scope}_image_group video, #leme_art_${scope}_two_image_group video, #leme_art_${scope}_gradient_group video`).forEach(video => video.play().catch(() => {}));
    ensureVideoPreviewLoop();
    return result;
  };
})();
