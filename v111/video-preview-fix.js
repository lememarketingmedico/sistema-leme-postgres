(() => {
  const VIDEO_DATA_RE = /^data:video\//i;
  const STAGE_ID = 'leme-video-render-stage-fix-v1113';
  const SCOPES = ['page', 'page-carousel', 'modal', 'modal-carousel'];

  function ensureStage() {
    let stage = document.getElementById(STAGE_ID);
    if (stage) return stage;
    stage = document.createElement('div');
    stage.id = STAGE_ID;
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = [
      'position:fixed',
      'left:-99999px',
      'top:-99999px',
      'width:1px',
      'height:1px',
      'overflow:hidden',
      'pointer-events:none',
      'opacity:0',
      'z-index:-1'
    ].join(';');
    document.body.appendChild(stage);
    return stage;
  }

  function isVideoSlot(draft, slot = 'primary') {
    const secondary = slot === 'secondary';
    const dataUrl = String(secondary ? (draft?.image2DataUrl || '') : (draft?.imageDataUrl || ''));
    const explicit = String(secondary ? (draft?.image2MediaType || '') : (draft?.imageMediaType || '')).toLowerCase();
    return Boolean(dataUrl) && (explicit === 'video' || VIDEO_DATA_RE.test(dataUrl));
  }

  function draftHasVideo(draft) {
    return isVideoSlot(draft, 'primary') || isVideoSlot(draft, 'secondary');
  }

  function slotKeys(slot = 'primary') {
    const secondary = slot === 'secondary';
    return {
      dataUrlKey: secondary ? 'image2DataUrl' : 'imageDataUrl',
      elementKey: secondary ? 'image2Element' : 'imageElement',
      posXKey: secondary ? 'image2PositionX' : 'imagePositionX',
      posYKey: secondary ? 'image2PositionY' : 'imagePositionY'
    };
  }

  function clampPercent(value, fallback = 50) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.min(100, num));
  }

  function waitForVideoReady(video) {
    if (!video) return Promise.reject(new Error('Vídeo inválido.'));
    if (video.readyState >= 2 && (video.videoWidth || video.clientWidth)) return Promise.resolve(video);

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('O vídeo demorou para carregar.'));
      }, 8000);

      const done = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(video);
      };

      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Não foi possível carregar o vídeo.'));
      };

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('canplay', done);
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', fail);
      };

      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      video.addEventListener('seeked', done, { once: true });
      video.addEventListener('error', fail, { once: true });
      try { video.load(); } catch {}
    });
  }

  async function nudgeFirstFrame(video) {
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.currentTime > 0.001) return;

    await new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('seeked', finish);
      };
      const timeout = window.setTimeout(finish, 500);
      video.addEventListener('seeked', finish, { once: true });
      try {
        video.currentTime = Math.min(0.04, Math.max(0, video.duration - 0.04));
      } catch {
        finish();
      }
    });
  }

  async function createStageVideo(src) {
    const video = document.createElement('video');
    video.src = src;
    video.preload = 'auto';
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    ensureStage().appendChild(video);
    await waitForVideoReady(video);
    await nudgeFirstFrame(video).catch(() => {});
    try { await video.play(); } catch {}
    return video;
  }

  const previousGetUserImage = window.getLemeArtUserImage;
  if (typeof previousGetUserImage === 'function') {
    window.getLemeArtUserImage = async function(draft, slot = 'primary') {
      if (!isVideoSlot(draft, slot)) return previousGetUserImage(draft, slot);

      const { dataUrlKey, elementKey, posXKey, posYKey } = slotKeys(slot);
      const src = String(draft?.[dataUrlKey] || '');
      let video = draft?.[elementKey];

      if (!video || video.tagName !== 'VIDEO' || video.__lemeSource !== src) {
        video = await createStageVideo(src);
        video.__lemeSource = src;
        draft[elementKey] = video;
      } else if (!video.isConnected) {
        ensureStage().appendChild(video);
      }

      await waitForVideoReady(video).catch(() => {});
      await nudgeFirstFrame(video).catch(() => {});
      try { if (video.paused) await video.play(); } catch {}

      video.__lemeCropPosition = {
        x: clampPercent(draft?.[posXKey]),
        y: clampPercent(draft?.[posYKey])
      };

      return video;
    };
  }

  const previousDrawCover = window.drawLemeArtImageCover;
  if (typeof previousDrawCover === 'function') {
    window.drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
      const mediaWidth = Number(media?.videoWidth || media?.naturalWidth || media?.width || 0);
      const mediaHeight = Number(media?.videoHeight || media?.naturalHeight || media?.height || 0);

      if (!mediaWidth || !mediaHeight) {
        try { return previousDrawCover(ctx, media, x, y, width, height, radius); } catch { return; }
      }

      const scale = Math.max(width / mediaWidth, height / mediaHeight);
      const sourceWidth = width / scale;
      const sourceHeight = height / scale;
      const position = media.__lemeCropPosition || { x: 50, y: 50 };
      const maxX = Math.max(0, mediaWidth - sourceWidth);
      const maxY = Math.max(0, mediaHeight - sourceHeight);
      const sourceX = maxX * (clampPercent(position.x) / 100);
      const sourceY = maxY * (clampPercent(position.y) / 100);

      ctx.save();
      roundedLemeArtRect(ctx, x, y, width, height, radius);
      ctx.clip();
      try {
        ctx.drawImage(media, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
      } catch (error) {
        try { previousDrawCover(ctx, media, x, y, width, height, radius); } catch {}
      }
      ctx.restore();
    };
  }

  async function refreshVideoScopes() {
    let hasAnyVideo = false;
    for (const scope of SCOPES) {
      const canvas = document.getElementById(`leme_art_${scope}_canvas`);
      if (!canvas) continue;
      let draft = null;
      try { draft = getLemeArtDraft(scope); } catch {}
      if (!draft || !draftHasVideo(draft)) continue;
      hasAnyVideo = true;
      try { await renderLemeArtCanvas(scope); } catch (error) { console.warn(error); }
    }
    return hasAnyVideo;
  }

  let previewLoopActive = false;
  async function previewLoop() {
    const hasAnyVideo = await refreshVideoScopes();
    if (!hasAnyVideo) {
      previewLoopActive = false;
      return;
    }
    window.requestAnimationFrame(previewLoop);
  }

  function startPreviewLoop() {
    if (previewLoopActive) return;
    previewLoopActive = true;
    window.requestAnimationFrame(previewLoop);
  }

  const previousInit = window.initializeLemeArtCanvases;
  if (typeof previousInit === 'function') {
    window.initializeLemeArtCanvases = function() {
      const result = previousInit();
      startPreviewLoop();
      return result;
    };
  }

  const previousReadFile = window.readLemeArtImageFile;
  if (typeof previousReadFile === 'function') {
    window.readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
      const isVideo = String(file?.type || '').toLowerCase().startsWith('video/');
      const result = previousReadFile(file, scope, slot, template);
      if (isVideo) {
        startPreviewLoop();
        window.setTimeout(() => {
          try { renderLemeArtCanvas(scope); } catch {}
        }, 160);
      }
      return result;
    };
  }

  const previousSyncControls = window.syncLemeArtImageControls;
  if (typeof previousSyncControls === 'function') {
    window.syncLemeArtImageControls = function(scope = 'page') {
      const result = previousSyncControls(scope);
      const draft = typeof getLemeArtDraft === 'function' ? getLemeArtDraft(scope) : null;
      if (!draft || !draftHasVideo(draft)) return result;

      const prefix = `leme_art_${scope}`;
      [
        { key: 'single', slot: 'primary' },
        { key: 'left', slot: 'primary' },
        { key: 'right', slot: 'secondary' }
      ].forEach(item => {
        if (!isVideoSlot(draft, item.slot)) return;
        const { dataUrlKey } = slotKeys(item.slot);
        const zone = document.getElementById(`${prefix}_${item.key}_dropzone`);
        const oldThumb = document.getElementById(`${prefix}_${item.key}_thumb`);
        const src = String(draft?.[dataUrlKey] || '');
        if (!zone || !oldThumb || oldThumb.tagName === 'VIDEO') return;

        const video = document.createElement('video');
        video.id = oldThumb.id;
        video.className = oldThumb.className;
        video.src = src;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        oldThumb.replaceWith(video);
        video.play().catch(() => {});
      });

      startPreviewLoop();
      return result;
    };
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    startPreviewLoop();
  } else {
    document.addEventListener('DOMContentLoaded', startPreviewLoop, { once: true });
  }
})();
