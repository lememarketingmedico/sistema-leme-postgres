(() => {
  const VERSION = '111.7';
  const PREVIEW_FPS = 18;
  const PREVIEW_INTERVAL = 1000 / PREVIEW_FPS;
  const previewState = new Map();
  let previewLoopStarted = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const isVideoSource = (src, explicit = '') => String(explicit || '').toLowerCase() === 'video' || /^data:video\//i.test(String(src || '')) || /^\/media\/leme-art\//.test(String(src || '')) || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(String(src || ''));

  function slotKeys(slot = 'primary') {
    return slot === 'secondary'
      ? { src:'image2DataUrl', name:'image2Name', element:'image2Element', type:'image2MediaType', x:'image2PositionX', y:'image2PositionY', start:'image2TrimStart', end:'image2TrimEnd', audio:'video2AudioEnabled' }
      : { src:'imageDataUrl', name:'imageName', element:'imageElement', type:'imageMediaType', x:'imagePositionX', y:'imagePositionY', start:'imageTrimStart', end:'imageTrimEnd', audio:'videoAudioEnabled' };
  }

  function hasVideo(draft = {}) {
    return Boolean(
      (draft.imageDataUrl && isVideoSource(draft.imageDataUrl, draft.imageMediaType)) ||
      (draft.image2DataUrl && isVideoSource(draft.image2DataUrl, draft.image2MediaType))
    );
  }

  function trimRange(draft, slot = 'primary') {
    const keys = slotKeys(slot);
    const video = draft?.[keys.element];
    const duration = Math.max(0.1, Number(video?.duration || 0) || 100);
    const start = clamp(draft?.[keys.start] || 0, 0, Math.max(0, duration - 0.1));
    let end = Number(draft?.[keys.end] || 0);
    if (!Number.isFinite(end) || end <= 0) end = duration;
    end = clamp(end, start + 0.1, duration);
    return { start, end, duration };
  }

  function timeLabel(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(value / 60);
    const rest = value - minutes * 60;
    return minutes ? `${minutes}:${rest.toFixed(1).padStart(4, '0')}` : `${rest.toFixed(1)}s`;
  }

  function updateTimelineDom(scope, controlKey, slot) {
    const draft = getLemeArtDraft(scope);
    const range = trimRange(draft, slot);
    const prefix = `leme_art_${scope}_${controlKey}`;
    const left = clamp(range.start / range.duration * 100, 0, 100);
    const right = clamp(range.end / range.duration * 100, 0, 100);
    const selection = document.getElementById(`${prefix}_selection`);
    const startHandle = document.getElementById(`${prefix}_handle_start`);
    const endHandle = document.getElementById(`${prefix}_handle_end`);
    const dimLeft = document.getElementById(`${prefix}_dim_left`);
    const dimRight = document.getElementById(`${prefix}_dim_right`);
    if (selection) { selection.style.left = `${left}%`; selection.style.width = `${Math.max(0, right - left)}%`; }
    if (startHandle) startHandle.style.left = `${left}%`;
    if (endHandle) endHandle.style.left = `${right}%`;
    if (dimLeft) dimLeft.style.width = `${left}%`;
    if (dimRight) dimRight.style.width = `${100 - right}%`;
    const startTime = document.getElementById(`${prefix}_start_time`);
    const endTime = document.getElementById(`${prefix}_end_time`);
    const durationLabel = document.getElementById(`${prefix}_timeline_duration`);
    const selectionLabel = document.getElementById(`${prefix}_timeline_selection`);
    if (startTime) startTime.textContent = timeLabel(range.start);
    if (endTime) endTime.textContent = timeLabel(range.end);
    if (durationLabel) durationLabel.textContent = `Vídeo: ${timeLabel(range.duration)}`;
    if (selectionLabel) selectionLabel.textContent = `Trecho final: ${timeLabel(range.end - range.start)}`;
  }

  // O corte não procura frames enquanto a borda está sendo arrastada.
  // Só atualiza a interface durante o gesto e aplica o seek uma única vez ao soltar.
  window.beginLemeTimelineDrag = function(event, scope, controlKey, slot, edge) {
    event.preventDefault();
    event.stopPropagation();
    const timeline = document.getElementById(`leme_art_${scope}_${controlKey}_timeline`);
    if (!timeline) return;
    const draft = getLemeArtDraft(scope);
    const keys = slotKeys(slot);
    window.__LEME_TIMELINE_DRAGGING__ = true;
    document.body.classList.add('leme-is-trimming-video');

    const move = clientX => {
      const rect = timeline.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const range = trimRange(draft, slot);
      const value = pct * range.duration;
      if (edge === 'start') draft[keys.start] = clamp(value, 0, Math.max(0, range.end - 0.1));
      else draft[keys.end] = clamp(value, range.start + 0.1, range.duration);
      updateTimelineDom(scope, controlKey, slot);
    };

    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.__LEME_TIMELINE_DRAGGING__ = false;
      document.body.classList.remove('leme-is-trimming-video');
      const value = edge === 'start' ? draft[keys.start] : draft[keys.end];
      try {
        if (typeof window.setLemeTrim === 'function') window.setLemeTrim(scope, slot, edge === 'start' ? 's' : 'f', value);
      } catch (error) { console.warn(error); }
      window.setTimeout(() => {
        try { renderLemeArtCanvas(scope); } catch {}
      }, 30);
    };

    const onMove = pointerEvent => move(pointerEvent.clientX);
    window.addEventListener('pointermove', onMove, { passive:true });
    window.addEventListener('pointerup', finish, { once:true });
    window.addEventListener('pointercancel', finish, { once:true });
    move(event.clientX);
  };

  const originalToggleTimeline = window.toggleLemeTimeline;
  if (typeof originalToggleTimeline === 'function') {
    window.toggleLemeTimeline = async function(scope, controlKey, slot) {
      window.__LEME_TIMELINE_BUSY__ = true;
      try { return await originalToggleTimeline(scope, controlKey, slot); }
      finally {
        window.__LEME_TIMELINE_BUSY__ = false;
        updateTimelineDom(scope, controlKey, slot);
      }
    };
  }

  // Preview único e controlado. As versões antigas iniciavam vários loops ao mesmo tempo.
  const rawRenderCanvas = window.renderLemeArtCanvas;
  window.renderLemeArtCanvas = function(scope = 'page') {
    if (window.__LEME_VIDEO_EXPORT_ACTIVE__ || window.__LEME_TIMELINE_DRAGGING__ || window.__LEME_TIMELINE_BUSY__ || document.hidden) {
      return Promise.resolve(document.getElementById(`leme_art_${scope}_canvas`) || null);
    }
    let draft = null;
    try { draft = getLemeArtDraft(scope); } catch {}
    if (!draft || !hasVideo(draft)) return rawRenderCanvas(scope);
    const state = previewState.get(scope) || { inflight:null, lastAt:0, last:null };
    const now = performance.now();
    if (state.inflight) return state.inflight;
    if (now - state.lastAt < PREVIEW_INTERVAL) return Promise.resolve(state.last || document.getElementById(`leme_art_${scope}_canvas`) || null);
    state.lastAt = now;
    state.inflight = Promise.resolve(rawRenderCanvas(scope)).then(result => {
      state.last = result;
      return result;
    }).finally(() => { state.inflight = null; });
    previewState.set(scope, state);
    return state.inflight;
  };
  renderLemeArtCanvas = window.renderLemeArtCanvas;

  window.scheduleLemeArtPreview = function(scope = 'page') {
    const state = previewState.get(`timer:${scope}`) || {};
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = null;
      if (!window.__LEME_TIMELINE_DRAGGING__) renderLemeArtCanvas(scope).catch(error => console.warn(error));
    }, 55);
    previewState.set(`timer:${scope}`, state);
  };
  scheduleLemeArtPreview = window.scheduleLemeArtPreview;

  function startPreviewLoop() {
    if (previewLoopStarted) return;
    previewLoopStarted = true;
    let lastAt = 0;
    const tick = timestamp => {
      if (timestamp - lastAt >= PREVIEW_INTERVAL && !document.hidden && !window.__LEME_VIDEO_EXPORT_ACTIVE__ && !window.__LEME_TIMELINE_DRAGGING__ && !window.__LEME_TIMELINE_BUSY__) {
        lastAt = timestamp;
        const editors = Array.from(document.querySelectorAll('[data-leme-art-editor]'));
        for (const editor of editors) {
          if (!editor.isConnected || editor.offsetParent === null) continue;
          const scope = editor.dataset.lemeArtEditor || 'page';
          let draft = null;
          try { draft = getLemeArtDraft(scope); } catch {}
          if (draft && hasVideo(draft)) renderLemeArtCanvas(scope).catch(() => {});
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Upload de vídeo sem rerenderizar a aplicação inteira: evita fechar modal,
  // evita piscadas e deixa o card pronto para editar assim que o upload termina.
  async function uploadVideo(file) {
    const form = new FormData();
    form.append('file', file, file.name || 'video');
    const response = await fetch('/api/leme-art-media', { method:'POST', headers:authHeaders(), body:form });
    if (await handleAuthResponse(response)) throw new Error('Sua sessão expirou.');
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.url) throw new Error(data?.error || 'Não foi possível salvar o vídeo.');
    return data;
  }

  const previousReadMedia = window.readLemeArtImageFile || readLemeArtImageFile;
  window.readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
    const type = String(file?.type || '').toLowerCase();
    if (!type.startsWith('video/')) return previousReadMedia(file, scope, slot, template);
    if (Number(file.size || 0) > 15 * 1024 * 1024) return toast('O vídeo deve ter no máximo 15 MB.');
    toast('Salvando vídeo...');
    uploadVideo(file).then(media => {
      const draft = getLemeArtDraft(scope);
      const keys = slotKeys(slot);
      draft[keys.src] = media.url;
      draft[keys.name] = media.file_name || file.name || 'Vídeo selecionado';
      draft[keys.element] = null;
      draft[keys.type] = 'video';
      draft[keys.x] = 50;
      draft[keys.y] = 50;
      draft[keys.start] = 0;
      draft[keys.end] = 0;
      draft[keys.audio] = true;
      draft.template = normalizeLemeArtTemplate(template);
      const select = document.getElementById(`leme_art_${scope}_template`);
      if (select) select.value = draft.template;
      try { syncLemeArtFontControls(scope); } catch {}
      try { syncLemeArtImageControls(scope); } catch {}
      try { renderLemeArtCanvas(scope); } catch {}
      window.setTimeout(() => {
        document.querySelectorAll(`[id^="leme_art_${scope}_"][id$="_timeline_panel"]`).forEach(panel => panel.classList.add('hidden'));
      }, 20);
      toast('Vídeo salvo. Você já pode ajustar posição, áudio e corte.');
    }).catch(error => {
      console.error(error);
      toast(error.message || 'Não foi possível salvar o vídeo.');
    });
  };
  readLemeArtImageFile = window.readLemeArtImageFile;

  // Inicialização enxuta: não chama os wrappers antigos que criavam loops extras.
  window.initializeLemeArtCanvases = function() {
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => {
      const scope = editor.dataset.lemeArtEditor || 'page';
      try { syncLemeArtFormatControls(scope); } catch {}
      try { syncLemeArtFontControls(scope); } catch {}
      try { syncLemeArtImageControls(scope); } catch {}
      try { renderLemeArtCanvas(scope); } catch {}
    });
    startPreviewLoop();
  };
  initializeLemeArtCanvases = window.initializeLemeArtCanvases;

  const style = document.createElement('style');
  style.id = 'leme-v1117-performance-style';
  style.textContent = `
    body.leme-is-trimming-video .leme-art-canvas { pointer-events:none; }
    body.leme-is-trimming-video .leme-v1115-timeline { cursor:ew-resize; }
    .leme-v1115-handle { touch-action:none; will-change:left; }
    .leme-v1115-selection,.leme-v1115-dim { will-change:left,width; }
    .leme-v1115-filmstrip img { content-visibility:auto; }
  `;
  document.head.appendChild(style);
})();
