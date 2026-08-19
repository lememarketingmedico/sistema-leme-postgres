(() => {
  const timelineCache = new Map();
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const slotKeys = slot => slot === 'secondary'
    ? { src:'image2DataUrl', type:'image2MediaType', element:'image2Element', start:'image2TrimStart', end:'image2TrimEnd' }
    : { src:'imageDataUrl', type:'imageMediaType', element:'imageElement', start:'imageTrimStart', end:'imageTrimEnd' };
  const isVideo = (src, type = '') => String(type || '').toLowerCase() === 'video' || /^data:video\//i.test(String(src || '')) || /^\/media\/leme-art\//.test(String(src || '')) || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(String(src || ''));

  function timeLabel(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(value / 60);
    const rest = value - minutes * 60;
    return minutes ? `${minutes}:${rest.toFixed(1).padStart(4, '0')}` : `${rest.toFixed(1)}s`;
  }

  function rangeFor(draft, slot) {
    const keys = slotKeys(slot);
    const duration = Math.max(0.1, Number(draft?.[keys.element]?.duration || 0) || 100);
    const start = clamp(draft?.[keys.start] || 0, 0, Math.max(0, duration - .1));
    let end = Number(draft?.[keys.end] || 0);
    if (!Number.isFinite(end) || end <= 0) end = duration;
    end = clamp(end, start + .1, duration);
    return { start, end, duration };
  }

  function timelineMarkup(scope, controlKey, slot) {
    const prefix = `leme_art_${scope}_${controlKey}`;
    return `
      <button class="btn secondary small" type="button" onclick="toggleLemeTimeline1117('${escapeAttr(scope)}','${escapeAttr(controlKey)}','${escapeAttr(slot)}')">✂ Cortar vídeo</button>
      <div id="${prefix}_timeline_panel" class="leme-v1115-timeline-panel hidden">
        <div class="leme-v1115-timeline-meta">
          <strong id="${prefix}_timeline_selection">Trecho selecionado</strong>
          <span id="${prefix}_timeline_duration"></span>
        </div>
        <div class="leme-v1115-timeline" id="${prefix}_timeline">
          <div class="leme-v1115-filmstrip" id="${prefix}_filmstrip"><span class="leme-v1115-filmstrip-loading">Abra para gerar a prévia</span></div>
          <div class="leme-v1115-dim leme-v1115-dim-left" id="${prefix}_dim_left"></div>
          <div class="leme-v1115-dim leme-v1115-dim-right" id="${prefix}_dim_right"></div>
          <div class="leme-v1115-selection" id="${prefix}_selection"></div>
          <button type="button" class="leme-v1115-handle leme-v1115-handle-start" id="${prefix}_handle_start" onpointerdown="beginLemeTimelineDrag(event,'${escapeAttr(scope)}','${escapeAttr(controlKey)}','${escapeAttr(slot)}','start')" aria-label="Arrastar começo do vídeo"></button>
          <button type="button" class="leme-v1115-handle leme-v1115-handle-end" id="${prefix}_handle_end" onpointerdown="beginLemeTimelineDrag(event,'${escapeAttr(scope)}','${escapeAttr(controlKey)}','${escapeAttr(slot)}','end')" aria-label="Arrastar final do vídeo"></button>
        </div>
        <div class="leme-v1115-timeline-times"><span id="${prefix}_start_time"></span><span id="${prefix}_end_time"></span></div>
        <small>Arraste apenas as duas bordas. O vídeo só é reposicionado quando você soltar, evitando piscadas e travamentos.</small>
      </div>`;
  }

  function updateTimeline(scope, controlKey, slot) {
    const draft = getLemeArtDraft(scope);
    const range = rangeFor(draft, slot);
    const prefix = `leme_art_${scope}_${controlKey}`;
    const left = clamp(range.start / range.duration * 100, 0, 100);
    const right = clamp(range.end / range.duration * 100, 0, 100);
    const selection = document.getElementById(`${prefix}_selection`);
    const startHandle = document.getElementById(`${prefix}_handle_start`);
    const endHandle = document.getElementById(`${prefix}_handle_end`);
    const dimLeft = document.getElementById(`${prefix}_dim_left`);
    const dimRight = document.getElementById(`${prefix}_dim_right`);
    if (selection) { selection.style.left = `${left}%`; selection.style.width = `${Math.max(0, right-left)}%`; }
    if (startHandle) startHandle.style.left = `${left}%`;
    if (endHandle) endHandle.style.left = `${right}%`;
    if (dimLeft) dimLeft.style.width = `${left}%`;
    if (dimRight) dimRight.style.width = `${100-right}%`;
    const startTime = document.getElementById(`${prefix}_start_time`);
    const endTime = document.getElementById(`${prefix}_end_time`);
    const duration = document.getElementById(`${prefix}_timeline_duration`);
    const selected = document.getElementById(`${prefix}_timeline_selection`);
    if (startTime) startTime.textContent = timeLabel(range.start);
    if (endTime) endTime.textContent = timeLabel(range.end);
    if (duration) duration.textContent = `Vídeo: ${timeLabel(range.duration)}`;
    if (selected) selected.textContent = `Trecho final: ${timeLabel(range.end-range.start)}`;
  }

  function ensureTimeline(scope) {
    const draft = getLemeArtDraft(scope);
    const controls = [['single','primary'],['left','primary'],['right','secondary'],['gradient','primary']];
    for (const [controlKey, slot] of controls) {
      const box = document.getElementById(`leme_art_${scope}_${controlKey}_trim_box`);
      if (!box) continue;
      const keys = slotKeys(slot);
      const show = Boolean(draft?.[keys.src]) && isVideo(draft?.[keys.src], draft?.[keys.type]);
      box.classList.toggle('hidden', !show);
      if (!show) continue;
      if (box.dataset.timeline1117 !== '1') {
        box.dataset.timeline1117 = '1';
        box.innerHTML = timelineMarkup(scope, controlKey, slot);
      }
      updateTimeline(scope, controlKey, slot);
    }
  }

  async function generateThumbs(src, count = 6) {
    if (timelineCache.has(src)) return timelineCache.get(src);
    const promise = (async () => {
      const video = document.createElement('video');
      video.src = src;
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1) return resolve();
        video.addEventListener('loadedmetadata', resolve, { once:true });
        video.addEventListener('error', () => reject(new Error('Não foi possível montar a timeline.')), { once:true });
        video.load();
      });
      const duration = Math.max(.1, Number(video.duration || .1));
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 68;
      const ctx = canvas.getContext('2d');
      const thumbs = [];
      for (let index = 0; index < count; index += 1) {
        const target = Math.min(Math.max(0, duration * index / Math.max(1, count-1)), Math.max(0, duration-.03));
        await new Promise(resolve => {
          if (Math.abs(Number(video.currentTime || 0)-target) < .02) return resolve();
          let settled = false;
          const done = () => { if (settled) return; settled = true; clearTimeout(timer); video.removeEventListener('seeked', done); resolve(); };
          const timer = setTimeout(done, 800);
          video.addEventListener('seeked', done, { once:true });
          try { video.currentTime = target; } catch { done(); }
        });
        const vw = Math.max(1, video.videoWidth || 1), vh = Math.max(1, video.videoHeight || 1);
        const scale = Math.max(canvas.width/vw, canvas.height/vh);
        const sw = canvas.width/scale, sh = canvas.height/scale;
        const sx = Math.max(0,(vw-sw)/2), sy = Math.max(0,(vh-sh)/2);
        ctx.clearRect(0,0,canvas.width,canvas.height);
        try { ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height); } catch {}
        thumbs.push(canvas.toDataURL('image/jpeg', .58));
      }
      video.removeAttribute('src');
      video.load();
      return thumbs;
    })();
    timelineCache.set(src, promise);
    return promise;
  }

  window.toggleLemeTimeline1117 = async function(scope, controlKey, slot) {
    const panel = document.getElementById(`leme_art_${scope}_${controlKey}_timeline_panel`);
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (panel.classList.contains('hidden')) return;
    const draft = getLemeArtDraft(scope);
    const keys = slotKeys(slot);
    const src = String(draft?.[keys.src] || '');
    const host = document.getElementById(`leme_art_${scope}_${controlKey}_filmstrip`);
    updateTimeline(scope, controlKey, slot);
    if (!src || !host || host.dataset.source === src) return;
    window.__LEME_TIMELINE_BUSY__ = true;
    host.innerHTML = '<span class="leme-v1115-filmstrip-loading">Gerando prévia…</span>';
    try {
      const thumbs = await generateThumbs(src);
      if (String(getLemeArtDraft(scope)?.[keys.src] || '') !== src) return;
      host.dataset.source = src;
      host.innerHTML = thumbs.map(url => `<img src="${url}" alt="">`).join('');
    } catch (error) {
      console.warn(error);
      host.innerHTML = '<span class="leme-v1115-filmstrip-loading">Não foi possível gerar a prévia</span>';
    } finally {
      window.__LEME_TIMELINE_BUSY__ = false;
    }
  };

  const previousInitialize = window.initializeLemeArtCanvases;
  window.initializeLemeArtCanvases = function() {
    const result = previousInitialize();
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => ensureTimeline(editor.dataset.lemeArtEditor || 'page'));
    return result;
  };
  initializeLemeArtCanvases = window.initializeLemeArtCanvases;

  const previousSync = window.syncLemeArtImageControls;
  window.syncLemeArtImageControls = function(scope = 'page') {
    const result = previousSync(scope);
    requestAnimationFrame(() => ensureTimeline(scope));
    return result;
  };
  syncLemeArtImageControls = window.syncLemeArtImageControls;
})();
