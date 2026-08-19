(() => {
  const VERSION = '111.6';
  const PREVIEW_INTERVAL = 1000 / 30;
  const EXPORT_FPS = 30;
  const EXPORT_FRAME_MS = 1000 / EXPORT_FPS;
  const EXPORT_VIDEO_BITRATE = 12_000_000;
  const EXPORT_AUDIO_BITRATE = 192_000;
  const previewState = new Map();

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

  function inferMediaType(src = '', explicit = '') {
    if (explicit === 'video' || explicit === 'image') return explicit;
    const value = String(src || '');
    return (/^data:video\//i.test(value) || /^\/media\/leme-art\//.test(value) || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(value)) ? 'video' : 'image';
  }

  function hasVideo(draft = {}) {
    return Boolean(
      (draft.imageDataUrl && inferMediaType(draft.imageDataUrl, draft.imageMediaType) === 'video') ||
      (draft.image2DataUrl && inferMediaType(draft.image2DataUrl, draft.image2MediaType) === 'video')
    );
  }

  // V111.3/V111.4 criavam mais de um loop de preview. Este wrapper consolida
  // as chamadas, evita renders concorrentes e libera CPU durante a exportação.
  const baseRenderCanvas = window.renderLemeArtCanvas;
  if (typeof baseRenderCanvas === 'function') {
    window.renderLemeArtCanvas = function(scope = 'page') {
      let draft = null;
      try { draft = getLemeArtDraft(scope); } catch {}
      if (!draft || !hasVideo(draft)) return baseRenderCanvas(scope);
      if (window.__LEME_VIDEO_EXPORT_ACTIVE__) return Promise.resolve(document.getElementById(`leme_art_${scope}_canvas`) || null);
      if (document.hidden) return Promise.resolve(document.getElementById(`leme_art_${scope}_canvas`) || null);

      const now = performance.now();
      const state = previewState.get(scope) || { lastAt: 0, inflight: null, lastResult: null };
      if (state.inflight) return state.inflight;
      if (now - state.lastAt < PREVIEW_INTERVAL) return Promise.resolve(state.lastResult || document.getElementById(`leme_art_${scope}_canvas`) || null);

      state.lastAt = now;
      state.inflight = Promise.resolve(baseRenderCanvas(scope))
        .then(result => {
          state.lastResult = result;
          return result;
        })
        .finally(() => { state.inflight = null; });
      previewState.set(scope, state);
      return state.inflight;
    };
    renderLemeArtCanvas = window.renderLemeArtCanvas;
  }

  function stripCommands(text = '') {
    return String(text || '')
      .replace(/\[([^\]]+)\]/g, '$1')
      .replace(/\{([^}]+)\}/g, '$1')
      .replace(/\+([^+]+)\+/g, '$1')
      .replace(/\/([^/]+)\//g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/--([^-]+)--/g, '$1')
      .replace(/^\s*==\s*/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeFilePart(value = '', fallback = 'Arte') {
    const cleaned = String(value || '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (cleaned || fallback).slice(0, 120).trim();
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = String(value || '').trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12, 0, 0);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function fileDate(value) {
    const date = parseDate(value) || (typeof getSaoPauloNow === 'function' ? getSaoPauloNow() : new Date());
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getFullYear()).slice(-2)}`;
  }

  function postForRecordKey(recordKey = '') {
    const normalized = String(recordKey || '').replace(/-slide-\d+$/i, '').trim();
    if (!normalized || typeof getPosts !== 'function') return null;
    return getPosts().find(post => String(post?.registro_id || post?.id || '') === normalized) || null;
  }

  function exportMeta(scope, draft, carousel = null) {
    const recordKey = String(carousel?.recordKey || draft?.recordKey || '');
    const post = postForRecordKey(recordKey);
    const titleSource = post?.titulo || carousel?.slides?.[0]?.text || draft?.text || 'Arte';
    return {
      date: fileDate(post?.data_publicacao),
      title: safeFilePart(stripCommands(titleSource), 'Arte')
    };
  }

  function singleName(scope, draft, ext) {
    const meta = exportMeta(scope, draft);
    const label = normalizeLemeArtFormat(draft?.format) === 'story' ? 'Story' : 'Feed';
    return `${label} - Leme - ${meta.date} - ${meta.title}.${ext}`;
  }

  function slideName(scope, carousel, slide, index, formatKey, ext) {
    const meta = exportMeta(scope, slide, carousel);
    const label = formatKey === 'story' ? 'Story' : 'Feed';
    return `${label} ${index + 1} - Leme - ${meta.date} - ${meta.title}.${ext}`;
  }

  function zipName(scope, carousel) {
    const first = carousel?.slides?.[0] || {};
    const meta = exportMeta(scope, first, carousel);
    return `Carrossel - Leme - ${meta.date} - ${meta.title}.zip`;
  }

  function mediaKeys(slot = 'primary') {
    return slot === 'secondary'
      ? { src:'image2DataUrl', type:'image2MediaType', element:'image2Element', x:'image2PositionX', y:'image2PositionY', start:'image2TrimStart', end:'image2TrimEnd', audio:'video2AudioEnabled' }
      : { src:'imageDataUrl', type:'imageMediaType', element:'imageElement', x:'imagePositionX', y:'imagePositionY', start:'imageTrimStart', end:'imageTrimEnd', audio:'videoAudioEnabled' };
  }

  function createExportVideo(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.playsInline = true;
      video.loop = false;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.src = src;
      video.addEventListener('loadedmetadata', () => resolve(video), { once: true });
      video.addEventListener('error', () => reject(new Error('Não foi possível preparar o vídeo para exportação.')), { once: true });
      video.load();
    });
  }

  function seek(video, time) {
    const max = Math.max(0, Number(video.duration || 0) - 0.01);
    const target = clamp(time, 0, max);
    return new Promise(resolve => {
      if (Math.abs(Number(video.currentTime || 0) - target) < 0.02) return resolve();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener('seeked', finish);
        resolve();
      };
      const timer = setTimeout(finish, 1200);
      video.addEventListener('seeked', finish, { once: true });
      try { video.currentTime = target; } catch { finish(); }
    });
  }

  function trimRange(draft, slot, video) {
    const k = mediaKeys(slot);
    const duration = Math.max(0.1, Number(video.duration || 0.1));
    const start = clamp(draft?.[k.start] || 0, 0, Math.max(0, duration - 0.1));
    let end = Number(draft?.[k.end] || 0);
    if (!Number.isFinite(end) || end <= 0) end = duration;
    end = clamp(end, start + 0.1, duration);
    return { start, end, length: Math.max(0.1, end - start), duration };
  }

  function recorderMime() {
    return [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ].find(type => window.MediaRecorder?.isTypeSupported?.(type)) || 'video/webm';
  }

  async function renderSmoothWebm(draft, formatKey) {
    if (!window.MediaRecorder) throw new Error('Use Chrome ou Edge atualizado para exportar vídeos.');

    const clone = createLemeArtDraft(draft, draft);
    Object.assign(clone, { ...draft, imageElement: null, image2Element: null });

    const items = [];
    for (const slot of ['primary', 'secondary']) {
      const k = mediaKeys(slot);
      if (!clone[k.src] || inferMediaType(clone[k.src], clone[k.type]) !== 'video') continue;
      const video = await createExportVideo(clone[k.src]);
      const trim = trimRange(clone, slot, video);
      video.__lemeCropPosition = { x: Number(clone[k.x] ?? 50), y: Number(clone[k.y] ?? 50) };
      await seek(video, trim.start);
      clone[k.element] = video;
      items.push({ slot, k, video, trim, audio: clone[k.audio] !== false });
    }
    if (!items.length) throw new Error('Nenhum vídeo encontrado nesta arte.');

    const duration = Math.max(...items.map(item => item.trim.length), 0.1);
    const format = getLemeArtFormatConfig(formatKey);
    const stage = document.createElement('canvas');
    stage.width = format.width;
    stage.height = format.height;
    const output = document.createElement('canvas');
    output.width = format.width;
    output.height = format.height;
    const outputCtx = output.getContext('2d', { alpha: false });
    if (!outputCtx) throw new Error('Não foi possível preparar o vídeo.');

    await renderLemeArtDraftCanvas(clone, formatKey, stage);
    outputCtx.drawImage(stage, 0, 0);

    const stream = output.captureStream(EXPORT_FPS);
    let audioContext = null;
    if (items.some(item => item.audio) && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      const destination = audioContext.createMediaStreamDestination();
      for (const item of items.filter(item => item.audio)) {
        try {
          const source = audioContext.createMediaElementSource(item.video);
          source.connect(destination);
        } catch (error) {
          console.warn('Áudio não pôde ser conectado.', error);
        }
      }
      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      await audioContext.resume().catch(() => {});
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: recorderMime(),
      videoBitsPerSecond: EXPORT_VIDEO_BITRATE,
      audioBitsPerSecond: EXPORT_AUDIO_BITRATE
    });
    const finished = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', event => { if (event.data?.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })), { once: true });
      recorder.addEventListener('error', event => reject(event.error || new Error('Falha ao renderizar vídeo.')), { once: true });
    });

    window.__LEME_VIDEO_EXPORT_ACTIVE__ = true;
    try {
      for (const item of items) {
        item.video.muted = !item.audio;
        item.video.volume = item.audio ? 1 : 0;
        item.video.playbackRate = 1;
        await seek(item.video, item.trim.start);
      }

      recorder.start(1000);
      await Promise.all(items.map(item => item.video.play().catch(() => {})));

      const startedAt = performance.now();
      let frameIndex = 0;
      while (true) {
        const targetMs = frameIndex * EXPORT_FRAME_MS;
        const elapsedMs = performance.now() - startedAt;
        if (elapsedMs < targetMs) await sleep(targetMs - elapsedMs);
        const elapsed = (performance.now() - startedAt) / 1000;
        if (elapsed >= duration) break;

        for (const item of items) {
          if (elapsed >= item.trim.length) {
            item.video.pause();
            const freezeAt = Math.max(item.trim.start, item.trim.end - 1 / EXPORT_FPS);
            if (Math.abs(Number(item.video.currentTime || 0) - freezeAt) > 0.04) {
              try { item.video.currentTime = freezeAt; } catch {}
            }
          } else if (item.video.paused) {
            item.video.play().catch(() => {});
          }
        }

        await renderLemeArtDraftCanvas(clone, formatKey, stage);
        outputCtx.drawImage(stage, 0, 0);
        frameIndex += 1;
      }

      await renderLemeArtDraftCanvas(clone, formatKey, stage);
      outputCtx.drawImage(stage, 0, 0);
      await sleep(EXPORT_FRAME_MS);
      items.forEach(item => item.video.pause());
      recorder.stop();
      return await finished;
    } finally {
      window.__LEME_VIDEO_EXPORT_ACTIVE__ = false;
      stream.getTracks().forEach(track => track.stop());
      items.forEach(item => item.video.pause());
      if (audioContext) await audioContext.close().catch(() => {});
    }
  }

  async function convertToMp4(webmBlob, fileName) {
    const form = new FormData();
    form.append('file', webmBlob, String(fileName || 'video.mp4').replace(/\.mp4$/i, '.webm'));
    const response = await fetch('/api/leme-art-convert-mp4', { method: 'POST', headers: authHeaders(), body: form });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Não foi possível converter o vídeo para MP4.');
    }
    return response.blob();
  }

  async function exportMp4(draft, formatKey, fileName) {
    return convertToMp4(await renderSmoothWebm(draft, formatKey), fileName);
  }

  window.generateAndDownloadLemeArt = generateAndDownloadLemeArt = async function(scope = 'page') {
    const draft = getLemeArtDraft(scope);
    const validation = validateLemeArtDraft(draft);
    if (validation) return toast(validation);
    const video = hasVideo(draft);
    const button = document.getElementById(`leme_art_${scope}_download`);
    const oldLabel = button?.textContent || (video ? 'Gerar e baixar MP4' : 'Gerar e baixar PNG');
    if (button) { button.disabled = true; button.textContent = video ? 'Renderizando vídeo fluido...' : 'Gerando arte...'; }
    try {
      if (video) {
        const fileName = singleName(scope, draft, 'mp4');
        downloadLemeArtBlob(await exportMp4(draft, draft.format, fileName), fileName);
        toast('MP4 exportado em 30 fps com o corte e o áudio configurados.');
      } else {
        const canvas = await renderLemeArtCanvas(scope);
        if (!canvas) throw new Error('Canvas da arte não encontrado.');
        downloadLemeArtBlob(await canvasToPngBlob(canvas), singleName(scope, draft, 'png'));
        toast('Arte exportada em PNG.');
      }
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar a arte.');
    } finally {
      if (button) { button.disabled = false; button.textContent = oldLabel; }
    }
  };

  window.exportLemeArtCarousel = exportLemeArtCarousel = async function(scope = 'page-carousel') {
    const carousel = getLemeArtCarousel(scope);
    const invalid = carousel.slides.findIndex((slide, index) => validateLemeArtDraft(slide, index + 1));
    if (invalid !== -1) {
      carousel.activeSlideId = carousel.slides[invalid].id;
      refreshLemeArtCarousel(scope);
      return toast(validateLemeArtDraft(carousel.slides[invalid], invalid + 1));
    }

    const button = document.getElementById(`leme_art_${scope}_export_all`);
    const oldLabel = button?.textContent || 'Exportar carrossel';
    if (button) button.disabled = true;
    try {
      const files = [];
      const formats = [
        { key: 'feed', folder: 'Feed-1080x1350' },
        { key: 'story', folder: 'Story-1080x1920' }
      ];
      const total = carousel.slides.length * formats.length;
      let done = 0;
      for (const format of formats) {
        for (let index = 0; index < carousel.slides.length; index += 1) {
          const slide = carousel.slides[index];
          if (button) button.textContent = `Gerando ${done + 1}/${total}...`;
          if (hasVideo(slide)) {
            const name = slideName(scope, carousel, slide, index, format.key, 'mp4');
            const blob = await exportMp4(slide, format.key, name);
            files.push({ name: `${format.folder}/${name}`, data: new Uint8Array(await blob.arrayBuffer()) });
          } else {
            const canvas = await renderLemeArtDraftCanvas(slide, format.key);
            const blob = await canvasToPngBlob(canvas);
            const name = slideName(scope, carousel, slide, index, format.key, 'png');
            files.push({ name: `${format.folder}/${name}`, data: new Uint8Array(await blob.arrayBuffer()) });
          }
          done += 1;
          await sleep(0);
        }
      }
      downloadLemeArtBlob(createLemeArtZip(files), zipName(scope, carousel));
      toast('Carrossel exportado com nomes padronizados e vídeos em MP4.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível exportar o carrossel.');
    } finally {
      if (button) { button.disabled = false; button.textContent = oldLabel; }
    }
  };

  const oldSync = window.syncLemeArtImageControls;
  if (typeof oldSync === 'function') {
    window.syncLemeArtImageControls = function(scope = 'page') {
      const result = oldSync(scope);
      const draft = getLemeArtDraft(scope);
      const button = document.getElementById(`leme_art_${scope}_download`);
      if (button) button.textContent = hasVideo(draft) ? 'Gerar e baixar MP4' : 'Gerar e baixar PNG';
      return result;
    };
    syncLemeArtImageControls = window.syncLemeArtImageControls;
  }

  window.__LEME_V1116__ = { version: VERSION, exportFps: EXPORT_FPS, previewFps: Math.round(1000 / PREVIEW_INTERVAL) };
})();
