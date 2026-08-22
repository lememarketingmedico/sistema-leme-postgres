(() => {
  const VERSION = '112.2';
  const HAND = 'handwritten-media';
  const GRAD = 'gradient-photo';
  const MIN_FRAME = 55;
  const MAX_FRAME = 180;
  const DEFAULT_FRAME = 100;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const frameValue = draft => clamp(draft?.mediaFrameHeight ?? DEFAULT_FRAME, MIN_FRAME, MAX_FRAME);

  function mediaCount(draft = {}) {
    const template = String(draft.template || '');
    if (template === GRAD) return 1;
    if (template === HAND) return String(draft.handwrittenMediaMode || '').toLowerCase() === 'two' ? 2 : 1;
    if (template.includes('two-images')) return 2;
    if (template.includes('image')) return 1;
    return 0;
  }

  function slotData(draft, slot) {
    const secondary = slot === 'secondary';
    return {
      src: String(secondary ? draft.image2DataUrl : draft.imageDataUrl || ''),
      x: clamp(secondary ? draft.image2PositionX : draft.imagePositionX, 0, 100),
      y: clamp(secondary ? draft.image2PositionY : draft.imagePositionY, 0, 100),
      zoom: clamp(secondary ? draft.image2Zoom : draft.imageZoom, 5, 300)
    };
  }

  function slotCard(scope, draft, slot, label) {
    const media = slotData(draft, slot);
    const prefix = `leme_art_${scope}_v1122_${slot}`;
    if (!media.src) {
      return `<div class="leme-v1122-media-card is-empty"><div class="leme-v1122-media-head"><div><strong>${escapeHtml(label)}</strong><small>Adicione a mídia para liberar posição e zoom.</small></div></div></div>`;
    }
    return `
      <div class="leme-v1122-media-card">
        <div class="leme-v1122-media-head">
          <div>
            <strong>${escapeHtml(label)}</strong>
            <small>Os mesmos controles de enquadramento em qualquer modelo.</small>
          </div>
          <button class="btn secondary small" type="button" onclick="resetLemeUnifiedMediaV1122('${escapeAttr(scope)}','${escapeAttr(slot)}')">Centralizar</button>
        </div>
        <div class="leme-v1122-media-grid">
          <label>Horizontal <span id="${prefix}_x_value">${Math.round(media.x)}%</span>
            <input id="${prefix}_x" type="range" min="0" max="100" step="1" value="${media.x}" oninput="setLemeUnifiedMediaV1122('${escapeAttr(scope)}','${escapeAttr(slot)}','x',this.value)">
          </label>
          <label>Vertical <span id="${prefix}_y_value">${Math.round(media.y)}%</span>
            <input id="${prefix}_y" type="range" min="0" max="100" step="1" value="${media.y}" oninput="setLemeUnifiedMediaV1122('${escapeAttr(scope)}','${escapeAttr(slot)}','y',this.value)">
          </label>
          <label class="is-wide">Zoom <span id="${prefix}_zoom_value">${Math.round(media.zoom)}%</span>
            <input id="${prefix}_zoom" type="range" min="5" max="300" step="1" value="${media.zoom}" oninput="setLemeUnifiedMediaV1122('${escapeAttr(scope)}','${escapeAttr(slot)}','zoom',this.value)">
          </label>
        </div>
      </div>`;
  }

  function frameCard(scope, draft) {
    const value = frameValue(draft);
    return `
      <div class="leme-v1122-frame-card">
        <div class="leme-v1122-media-head">
          <div>
            <strong>Altura da moldura</strong>
            <small>O mesmo ajuste de moldura para Twitter, Manuscrito e Foto + Gradiente.</small>
          </div>
          <button class="btn secondary small" type="button" onclick="setLemeUnifiedFrameHeightV1122('${escapeAttr(scope)}',100)">100%</button>
        </div>
        <div class="leme-v1122-frame-row">
          <button type="button" onclick="adjustLemeUnifiedFrameHeightV1122('${escapeAttr(scope)}',-10)" aria-label="Diminuir moldura">−</button>
          <input id="leme_art_${scope}_v1122_frame" type="range" min="${MIN_FRAME}" max="${MAX_FRAME}" step="1" value="${value}" oninput="setLemeUnifiedFrameHeightV1122('${escapeAttr(scope)}',this.value)">
          <button type="button" onclick="adjustLemeUnifiedFrameHeightV1122('${escapeAttr(scope)}',10)" aria-label="Aumentar moldura">＋</button>
          <strong id="leme_art_${scope}_v1122_frame_value">${Math.round(value)}%</strong>
        </div>
      </div>`;
  }

  function unifiedControls(scope) {
    const draft = getLemeArtDraft(scope);
    const count = mediaCount(draft);
    if (!count) return '';
    const cards = [slotCard(scope, draft, 'primary', count === 2 ? 'Mídia da esquerda' : 'Mídia')];
    if (count === 2) cards.push(slotCard(scope, draft, 'secondary', 'Mídia da direita'));
    return `<section class="leme-v1122-media-controls">
      <div class="leme-v1122-section-head">
        <div><strong>Ajustes da mídia</strong><small>Posição, zoom e moldura padronizados em todos os modelos com imagem.</small></div>
      </div>
      ${frameCard(scope, draft)}
      <div class="leme-v1122-media-cards">${cards.join('')}</div>
    </section>`;
  }

  function refresh(scope) {
    const host = document.getElementById(`leme_art_${scope}_v1122_media_controls`);
    if (host) host.innerHTML = unifiedControls(scope);
  }

  window.setLemeUnifiedMediaV1122 = function(scope, slot, axis, value) {
    const secondary = slot === 'secondary';
    const draft = getLemeArtDraft(scope);
    if (axis === 'zoom') {
      const zoom = clamp(value, 5, 300);
      if (typeof window.setLemeArtMediaZoom === 'function') window.setLemeArtMediaZoom(scope, slot, zoom);
      else draft[secondary ? 'image2Zoom' : 'imageZoom'] = zoom;
      const label = document.getElementById(`leme_art_${scope}_v1122_${slot}_zoom_value`);
      if (label) label.textContent = `${Math.round(zoom)}%`;
    } else {
      const position = clamp(value, 0, 100);
      if (typeof window.setLemeArtImagePosition === 'function') window.setLemeArtImagePosition(scope, slot, axis, position);
      else draft[secondary ? (axis === 'y' ? 'image2PositionY' : 'image2PositionX') : (axis === 'y' ? 'imagePositionY' : 'imagePositionX')] = position;
      const label = document.getElementById(`leme_art_${scope}_v1122_${slot}_${axis}_value`);
      if (label) label.textContent = `${Math.round(position)}%`;
    }
    try { scheduleLemeArtPreview(scope); } catch {}
  };

  window.resetLemeUnifiedMediaV1122 = function(scope, slot) {
    setLemeUnifiedMediaV1122(scope, slot, 'x', 50);
    setLemeUnifiedMediaV1122(scope, slot, 'y', 50);
    setLemeUnifiedMediaV1122(scope, slot, 'zoom', 100);
    requestAnimationFrame(() => refresh(scope));
  };

  window.setLemeUnifiedFrameHeightV1122 = function(scope, value) {
    const normalized = clamp(value, MIN_FRAME, MAX_FRAME);
    if (typeof window.setLemeArtFrameHeight === 'function') window.setLemeArtFrameHeight(scope, normalized);
    else {
      const draft = getLemeArtDraft(scope);
      draft.mediaFrameHeight = normalized;
      try { scheduleLemeArtPreview(scope); } catch {}
    }
    const input = document.getElementById(`leme_art_${scope}_v1122_frame`);
    const label = document.getElementById(`leme_art_${scope}_v1122_frame_value`);
    if (input && Number(input.value) !== normalized) input.value = String(normalized);
    if (label) label.textContent = `${Math.round(normalized)}%`;
  };

  window.adjustLemeUnifiedFrameHeightV1122 = function(scope, delta) {
    setLemeUnifiedFrameHeightV1122(scope, frameValue(getLemeArtDraft(scope)) + Number(delta || 0));
  };

  const editor0 = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    let html = editor0(scope, options);
    const host = `<div id="leme_art_${scope}_v1122_media_controls">${unifiedControls(scope)}</div>`;
    if (html.includes('<div class="leme-art-actions">')) {
      html = html.replace('<div class="leme-art-actions">', `${host}<div class="leme-art-actions">`);
    } else {
      html += host;
    }
    return html;
  };
  window.renderLemeArtEditor = renderLemeArtEditor;

  const sync0 = window.syncLemeArtImageControls || syncLemeArtImageControls;
  window.syncLemeArtImageControls = function(scope = 'page') {
    const result = sync0(scope);
    requestAnimationFrame(() => refresh(scope));
    return result;
  };
  syncLemeArtImageControls = window.syncLemeArtImageControls;

  const template0 = setLemeArtTemplate;
  setLemeArtTemplate = function(scope, value) {
    const result = template0(scope, value);
    requestAnimationFrame(() => refresh(scope));
    return result;
  };
  window.setLemeArtTemplate = setLemeArtTemplate;

  const init0 = initializeLemeArtCanvases;
  initializeLemeArtCanvases = function() {
    const result = init0();
    document.querySelectorAll('[data-leme-art-editor]').forEach(editor => refresh(editor.dataset.lemeArtEditor || 'page'));
    return result;
  };
  window.initializeLemeArtCanvases = initializeLemeArtCanvases;

  const clear0 = window.clearLemeArtImage || clearLemeArtImage;
  window.clearLemeArtImage = function(scope, slot = 'primary') {
    const result = clear0(scope, slot);
    requestAnimationFrame(() => refresh(scope));
    return result;
  };
  clearLemeArtImage = window.clearLemeArtImage;

  // Foto + Gradiente passa a respeitar a mesma altura de moldura.
  // Twitter já usa mediaFrameHeight nativamente na V111.14.
  const drawCover0 = window.drawLemeArtImageCover || drawLemeArtImageCover;
  drawLemeArtImageCover = function(ctx, media, x, y, width, height, radius) {
    const template = String(media?.__lemeTemplate || '');
    if (template === GRAD) {
      const percent = clamp(media?.__lemeFrameHeightPercent ?? DEFAULT_FRAME, MIN_FRAME, MAX_FRAME);
      const targetHeight = height * percent / 100;
      const targetY = y + (height - targetHeight) / 2;
      return drawCover0(ctx, media, x, targetY, width, targetHeight, radius);
    }
    return drawCover0(ctx, media, x, y, width, height, radius);
  };
  window.drawLemeArtImageCover = drawLemeArtImageCover;

  let darkLogoPromise = null;
  function loadDarkHandLogo() {
    if (!darkLogoPromise) {
      darkLogoPromise = loadLemeArtImageSource('assets/logo-leme-manuscrita-escura.png?v=111.4').catch(error => {
        darkLogoPromise = null;
        throw error;
      });
    }
    return darkLogoPromise;
  }

  async function rerenderHandwrittenWithFrame(draft, formatValue, canvas) {
    if (!canvas) return canvas;
    const format = getLemeArtFormatConfig(formatValue);
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const dark = Boolean(draft.artDarkMode);
    ctx.clearRect(0, 0, format.width, format.height);
    if (dark) {
      ctx.fillStyle = '#0e1d2a';
      ctx.fillRect(0, 0, format.width, format.height);
    } else {
      paintLemeArtBackground(ctx, format);
    }

    const safeX = Math.max(104, format.safeMarginX);
    const safeY = Math.max(104, format.safeMarginY);
    const contentWidth = format.width - safeX * 2;
    const logoReserve = 110;
    const baseHeight = format.key === 'story' ? 610 : 470;
    const requested = frameValue(draft);
    const maxImageHeight = Math.max(220, format.height - safeY * 2 - logoReserve - 180);
    const imageHeight = Math.min(maxImageHeight, Math.max(160, Math.round(baseHeight * requested / 100)));
    const imageY = format.height - safeY - logoReserve - imageHeight;
    const textBottom = imageY - 42;
    const text = normalizeLemeArtText(draft.text) || 'Digite a frase que será transformada em arte.';
    const layout = fitLemeArtText(ctx, text, {
      fontFamily: 'Poppins, Arial, sans-serif',
      fontWeight: '400',
      maxWidth: contentWidth,
      maxHeight: Math.max(150, textBottom - safeY),
      maxFontSize: getLemeArtMaxFontSize(HAND, draft.fontScale),
      lineHeightRatio: 1.30
    });

    const textColor = dark ? '#f4f4f4' : '#272a2c';
    const previousColor = window.__lemeV1104Color;
    window.__lemeV1104Color = draft.highlightColor || '#52a4d5';
    drawLemeArtText(
      ctx,
      layout,
      format.width / 2,
      safeY + Math.max(0, (textBottom - safeY - layout.height) / 2),
      {
        color: textColor,
        align: 'center',
        circleColor: draft.highlightColor || '#52a4d5',
        highlightColor: draft.highlightColor || '#52a4d5',
        underlineColor: textColor
      }
    );
    window.__lemeV1104Color = previousColor;

    const two = String(draft.handwrittenMediaMode || '').toLowerCase() === 'two';
    const media = await Promise.all([
      getLemeArtUserImage(draft, 'primary').catch(() => null),
      two ? getLemeArtUserImage(draft, 'secondary').catch(() => null) : Promise.resolve(null)
    ]);

    if (two) {
      const gap = 26;
      const leftWidth = Math.floor((contentWidth - gap) / 2);
      const rightWidth = contentWidth - gap - leftWidth;
      if (media[0]) drawCover0(ctx, media[0], safeX, imageY, leftWidth, imageHeight, 30);
      else drawLemeArtImagePlaceholder(ctx, safeX, imageY, leftWidth, imageHeight, 30, 'Imagem da esquerda');
      if (media[1]) drawCover0(ctx, media[1], safeX + leftWidth + gap, imageY, rightWidth, imageHeight, 30);
      else drawLemeArtImagePlaceholder(ctx, safeX + leftWidth + gap, imageY, rightWidth, imageHeight, 30, 'Imagem da direita');
    } else if (media[0]) {
      drawCover0(ctx, media[0], safeX, imageY, contentWidth, imageHeight, 34);
    } else {
      drawLemeArtImagePlaceholder(ctx, safeX, imageY, contentWidth, imageHeight, 34, 'Imagem da publicação');
    }

    if (dark) {
      try {
        const logo = await loadDarkHandLogo();
        const width = Math.min(184, format.width - 120);
        const height = Math.round(width * (logo.naturalHeight || logo.height || 1) / Math.max(1, logo.naturalWidth || logo.width || 1));
        ctx.drawImage(logo, (format.width - width) / 2, Math.max(0, format.height - 60 - height), width, height);
      } catch {}
    } else {
      try {
        const logo = await loadLemeHandwrittenLogo();
        drawLemeHandwrittenLogo(ctx, logo, format);
      } catch (error) {
        console.warn(error);
      }
    }

    return canvas;
  }

  const render0 = renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
    const canvas = await render0(draft, formatValue, targetCanvas);
    if (String(draft?.template || '') === HAND) {
      return rerenderHandwrittenWithFrame(draft, formatValue, canvas);
    }
    return canvas;
  };
  window.renderLemeArtDraftCanvas = renderLemeArtDraftCanvas;

  window.__LEME_ART_UNIFIED_MEDIA_VERSION__ = VERSION;
})();