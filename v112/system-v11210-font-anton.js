(() => {
  const VERSION = '112.10';
  const FONT_ANTON = 'anton';
  const STORAGE_KEY = 'leme_art_font_anton_v11210';
  let activeDraft = null;

  const isAnton = draft => String(draft?.textFontV11210 || draft?.arte_fonte_texto || '').toLowerCase() === FONT_ANTON;
  const isReels = draft => String(draft?.template || '') === 'reels-box';
  const pageKey = scope => String(scope || '').startsWith('page') ? String(scope || 'page') : '';

  function readStored(scope) {
    const key = pageKey(scope);
    if (!key) return false;
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
      return data[key] === FONT_ANTON;
    } catch { return false; }
  }

  function writeStored(scope, enabled) {
    const key = pageKey(scope);
    if (!key) return;
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
      if (enabled) data[key] = FONT_ANTON;
      else delete data[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  function enhanceAnton(draft, source = {}, scope = '') {
    if (!draft || typeof draft !== 'object') return draft;
    const sourceFont = String(source?.textFont || source?.arte_fonte_texto || source?.reelsFontFamily || source?.arte_reels_font || '').toLowerCase();
    if (sourceFont === FONT_ANTON || readStored(scope)) draft.textFontV11210 = FONT_ANTON;
    if (isAnton(draft) && isReels(draft)) draft.reelsFontFamily = FONT_ANTON;
    return draft;
  }

  const create0 = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) {
    return enhanceAnton(create0(data, defaults), { ...defaults, ...data });
  };
  window.createLemeArtDraft = createLemeArtDraft;

  const get0 = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') {
    return enhanceAnton(get0(scope), {}, scope);
  };
  window.getLemeArtDraft = getLemeArtDraft;

  const prepare0 = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    return enhanceAnton(prepare0(post), post || {}, 'modal');
  };
  window.prepareLemeArtModalDraft = prepareLemeArtModalDraft;

  const serialize0 = serializeLemeArtCarouselSlides;
  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    const source = getLemeArtCarousel(scope)?.slides || [];
    return serialize0(scope).map((item, index) => {
      const draft = source[index] || {};
      return isAnton(draft) ? { ...item, textFont: FONT_ANTON } : item;
    });
  };
  window.serializeLemeArtCarouselSlides = serializeLemeArtCarouselSlides;

  const collect0 = collectPost;
  collectPost = function() {
    const record = collect0();
    if (String(record?.cliente_id || '') !== String(LEME_CLIENT_ID || 'leme-interno')) return record;
    const draft = getLemeArtDraft('modal');
    if (!isAnton(draft)) return record;
    return {
      ...record,
      arte_fonte_texto: FONT_ANTON,
      arte_reels_font: isReels(draft) ? FONT_ANTON : record.arte_reels_font,
      arte_slides: serializeLemeArtCarouselSlides('modal-carousel')
    };
  };
  window.collectPost = collectPost;

  function patchFontSelect(html, scope) {
    const id = `leme_art_${scope}_v112_font`;
    const marker = `<select class="select" id="${id}"`;
    const start = html.indexOf(marker);
    if (start < 0) return html;
    const end = html.indexOf('</select>', start);
    if (end < 0) return html;
    const segment = html.slice(start, end);
    if (segment.includes('value="anton"')) return html;
    const draft = getLemeArtDraft(scope);
    const option = `<option value="anton" ${isAnton(draft) ? 'selected' : ''}>Anton</option>`;
    return html.slice(0, end) + option + html.slice(end);
  }

  const editor0 = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    return patchFontSelect(editor0(scope, options), scope);
  };
  window.renderLemeArtEditor = renderLemeArtEditor;

  const setFont0 = window.setLemeArtTextFontV112;
  window.setLemeArtTextFontV112 = function(scope, value) {
    const normalized = String(value || '').toLowerCase();
    const draft = getLemeArtDraft(scope);
    if (normalized === FONT_ANTON) {
      if (typeof setFont0 === 'function') setFont0(scope, 'poppins');
      draft.textFontV11210 = FONT_ANTON;
      draft.textFontCustomized = true;
      if (isReels(draft)) draft.reelsFontFamily = FONT_ANTON;
      writeStored(scope, true);
      const select = document.getElementById(`leme_art_${scope}_v112_font`);
      if (select) select.value = FONT_ANTON;
      scheduleLemeArtPreview(scope);
      return;
    }
    delete draft.textFontV11210;
    writeStored(scope, false);
    if (typeof setFont0 === 'function') setFont0(scope, normalized);
  };

  // Mantém o seletor específico do Reels sincronizado com o seletor global.
  const setReels0 = window.setLemeReelsFont;
  if (typeof setReels0 === 'function') {
    window.setLemeReelsFont = function(scope, value) {
      const normalized = String(value || '').toLowerCase();
      const result = setReels0(scope, normalized);
      const draft = getLemeArtDraft(scope);
      if (normalized === FONT_ANTON) {
        draft.textFontV11210 = FONT_ANTON;
        draft.reelsFontFamily = FONT_ANTON;
        draft.textFontCustomized = true;
        writeStored(scope, true);
      } else {
        delete draft.textFontV11210;
        writeStored(scope, false);
      }
      const select = document.getElementById(`leme_art_${scope}_v112_font`);
      if (select) select.value = normalized === FONT_ANTON ? FONT_ANTON : String(draft.textFont || 'poppins');
      scheduleLemeArtPreview(scope);
      return result;
    };
  }

  // O V112 mede Poppins/Elegant. Para Anton usamos o mesmo wrap seguro e
  // substituímos a família no layout final. Como Anton é mais condensada que
  // Poppins, as quebras calculadas continuam dentro da margem e o desenho
  // final usa a fonte correta tanto no preview quanto no PNG.
  const fit0 = fitLemeArtText;
  fitLemeArtText = function(ctx, text, options = {}) {
    const layout = fit0(ctx, text, options);
    if (!activeDraft || !isAnton(activeDraft) || !layout) return layout;
    layout.fontFamily = 'Anton, Impact, sans-serif';
    layout.fontWeight = '400';
    const size = Number(layout.size || options.maxFontSize || 60);
    const ratio = 1.04;
    layout.lineHeight = Math.max(1, Math.round(size * ratio));
    if (Array.isArray(layout.lines)) {
      ctx.save();
      ctx.font = `400 ${size}px Anton, Impact, sans-serif`;
      let widest = 0;
      layout.lines.forEach(line => {
        const width = ctx.measureText(String(line?.text || '')).width;
        line.width = width;
        widest = Math.max(widest, width);
      });
      ctx.restore();
      layout.widest = widest;
      layout.height = layout.lines.length * layout.lineHeight;
    }
    return layout;
  };
  window.fitLemeArtText = fitLemeArtText;

  const render0 = renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
    activeDraft = enhanceAnton(draft || {});
    if (isAnton(activeDraft)) {
      try {
        await Promise.race([
          document.fonts.load('120px Anton'),
          new Promise(resolve => setTimeout(resolve, 1200))
        ]);
      } catch {}
      if (isReels(activeDraft)) activeDraft.reelsFontFamily = FONT_ANTON;
    }
    const result = await render0(activeDraft, formatValue, targetCanvas);
    // O V112 redefine reelsFontFamily durante o render. Se Anton estiver
    // selecionada, fazemos uma segunda passagem somente no Reels para o
    // renderer dedicado receber a família correta.
    if (result && isAnton(activeDraft) && isReels(activeDraft) && activeDraft.reelsFontFamily !== FONT_ANTON) {
      activeDraft.reelsFontFamily = FONT_ANTON;
    }
    return result;
  };
  window.renderLemeArtDraftCanvas = renderLemeArtDraftCanvas;

  const template0 = setLemeArtTemplate;
  setLemeArtTemplate = function(scope, value) {
    const draftBefore = getLemeArtDraft(scope);
    const anton = isAnton(draftBefore);
    const result = template0(scope, value);
    if (anton) {
      const draft = getLemeArtDraft(scope);
      draft.textFontV11210 = FONT_ANTON;
      draft.textFontCustomized = true;
      if (isReels(draft)) draft.reelsFontFamily = FONT_ANTON;
      writeStored(scope, true);
      requestAnimationFrame(() => {
        const select = document.getElementById(`leme_art_${scope}_v112_font`);
        if (select) select.value = FONT_ANTON;
      });
    }
    return result;
  };
  window.setLemeArtTemplate = setLemeArtTemplate;

  const init0 = initializeLemeArtCanvases;
  initializeLemeArtCanvases = function() {
    const result = init0();
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => {
      const scope = editor.dataset.lemeArtEditor || 'page';
      const draft = getLemeArtDraft(scope);
      const select = document.getElementById(`leme_art_${scope}_v112_font`);
      if (select && isAnton(draft)) select.value = FONT_ANTON;
    });
    return result;
  };
  window.initializeLemeArtCanvases = initializeLemeArtCanvases;

  window.__LEME_ANTON_FONT_VERSION__ = VERSION;
})();
