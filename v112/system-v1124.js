(() => {
  const VERSION = '112.4';
  const LIGHT_BG = String(window.LEME_ART_CONFIG?.background || '#fbfaf7');
  const DARK_BG = '#0e1d2a';
  const GRADIENT_BG = '#222222';
  const compositeCache = new WeakMap();

  const templateOf = draft => String(draft?.template || '');
  const isGradient = draft => templateOf(draft) === 'gradient-photo';
  const isDark = draft => Boolean(draft?.artDarkMode) || /-dark$/i.test(templateOf(draft));
  const frameBackground = draft => isGradient(draft) ? GRADIENT_BG : (isDark(draft) ? DARK_BG : LIGHT_BG);

  function isVideoMedia(media) {
    return String(media?.tagName || '').toUpperCase() === 'VIDEO' || Number(media?.videoWidth || 0) > 0;
  }

  function mediaSize(media) {
    return {
      width: Math.max(1, Number(media?.naturalWidth || media?.videoWidth || media?.width || 1)),
      height: Math.max(1, Number(media?.naturalHeight || media?.videoHeight || media?.height || 1))
    };
  }

  function copyLemeMetadata(source, target) {
    if (!source || !target) return target;
    try {
      for (const key of Object.keys(source)) {
        if (key.startsWith('__leme')) {
          try { target[key] = source[key]; } catch {}
        }
      }
    } catch {}
    return target;
  }

  function compositeStillMedia(media, background) {
    if (!media || isVideoMedia(media)) return media;
    let byBackground = compositeCache.get(media);
    if (!byBackground) {
      byBackground = new Map();
      compositeCache.set(media, byBackground);
    }
    const { width, height } = mediaSize(media);
    const cacheKey = `${background}:${width}x${height}`;
    if (byBackground.has(cacheKey)) {
      return copyLemeMetadata(media, byBackground.get(cacheKey));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return media;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    try {
      ctx.drawImage(media, 0, 0, width, height);
    } catch (error) {
      console.warn('V112.4: não foi possível compor o fundo da mídia.', error);
      return media;
    }
    canvas.__lemeTransparentBackground = background;
    copyLemeMetadata(media, canvas);
    byBackground.set(cacheKey, canvas);
    return canvas;
  }

  const getMedia0 = window.getLemeArtUserImage || getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    const media = await getMedia0(draft, slot);
    if (!media) return media;
    const background = frameBackground(draft || {});
    try {
      media.__lemeFrameBackground = background;
      media.__lemeTemplate = templateOf(draft);
      media.__lemeFrameHeightPercent = Number(draft?.mediaFrameHeight || 100);
    } catch {}
    return compositeStillMedia(media, background);
  };
  window.getLemeArtUserImage = getLemeArtUserImage;

  function editorBackground(scope) {
    try { return frameBackground(getLemeArtDraft(scope)); }
    catch { return LIGHT_BG; }
  }

  function applyEditorBackground(scope) {
    const editor = Array.from(document.querySelectorAll('[data-leme-art-editor]'))
      .find(node => String(node.dataset.lemeArtEditor || '') === String(scope));
    if (!editor) return;
    const bg = editorBackground(scope);
    editor.style.setProperty('--leme-media-frame-bg', bg);
    editor.dataset.lemeMediaTheme = bg === DARK_BG ? 'dark' : (bg === GRADIENT_BG ? 'gradient' : 'light');
  }

  function refreshAllEditors(root = document) {
    root.querySelectorAll?.('[data-leme-art-editor]').forEach(editor => {
      applyEditorBackground(editor.dataset.lemeArtEditor || 'page');
    });
  }

  const renderEditor0 = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    const html = renderEditor0(scope, options);
    const bg = editorBackground(scope);
    const needle = `data-leme-art-editor="${escapeAttr(scope)}"`;
    return html.includes(needle)
      ? html.replace(needle, `${needle} style="--leme-media-frame-bg:${escapeAttr(bg)}"`)
      : html;
  };
  window.renderLemeArtEditor = renderLemeArtEditor;

  const syncImages0 = window.syncLemeArtImageControls || syncLemeArtImageControls;
  window.syncLemeArtImageControls = function(scope = 'page') {
    const result = syncImages0(scope);
    requestAnimationFrame(() => applyEditorBackground(scope));
    return result;
  };
  syncLemeArtImageControls = window.syncLemeArtImageControls;

  const template0 = window.setLemeArtTemplate || setLemeArtTemplate;
  window.setLemeArtTemplate = function(scope, value) {
    const result = template0(scope, value);
    requestAnimationFrame(() => applyEditorBackground(scope));
    return result;
  };
  setLemeArtTemplate = window.setLemeArtTemplate;

  const init0 = window.initializeLemeArtCanvases || initializeLemeArtCanvases;
  window.initializeLemeArtCanvases = function() {
    const result = init0();
    requestAnimationFrame(() => refreshAllEditors());
    return result;
  };
  initializeLemeArtCanvases = window.initializeLemeArtCanvases;

  const observer = new MutationObserver(mutations => {
    let needsRefresh = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes?.length) { needsRefresh = true; break; }
    }
    if (needsRefresh) requestAnimationFrame(() => refreshAllEditors());
  });

  const start = () => {
    refreshAllEditors();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.__LEME_TRANSPARENT_MEDIA_VERSION__ = VERSION;
})();
