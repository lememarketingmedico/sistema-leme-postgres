(() => {
  const PAGE_STORAGE_KEY = 'leme_art_studio_v1103';
  const DEFAULT_POS = 50;

  function clampPercent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : DEFAULT_POS;
  }

  function ensureEnhancedDraft(draft) {
    if (!draft || typeof draft !== 'object') return draft;
    draft.imagePositionX = clampPercent(draft.imagePositionX);
    draft.imagePositionY = clampPercent(draft.imagePositionY);
    draft.image2PositionX = clampPercent(draft.image2PositionX);
    draft.image2PositionY = clampPercent(draft.image2PositionY);
    return draft;
  }

  const originalCreateLemeArtDraft = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) {
    const draft = originalCreateLemeArtDraft(data, defaults);
    const source = data && typeof data === 'object' ? data : {};
    const fallback = defaults && typeof defaults === 'object' ? defaults : {};
    draft.imageDataUrl = String(source.imageDataUrl ?? source.imagem ?? fallback.imageDataUrl ?? '');
    draft.imageName = String(source.imageName ?? source.imagem_nome ?? fallback.imageName ?? '');
    draft.image2DataUrl = String(source.image2DataUrl ?? source.imagem2 ?? fallback.image2DataUrl ?? '');
    draft.image2Name = String(source.image2Name ?? source.imagem2_nome ?? fallback.image2Name ?? '');
    draft.imagePositionX = clampPercent(source.imagePositionX ?? source.imagem_pos_x ?? fallback.imagePositionX);
    draft.imagePositionY = clampPercent(source.imagePositionY ?? source.imagem_pos_y ?? fallback.imagePositionY);
    draft.image2PositionX = clampPercent(source.image2PositionX ?? source.imagem2_pos_x ?? fallback.image2PositionX);
    draft.image2PositionY = clampPercent(source.image2PositionY ?? source.imagem2_pos_y ?? fallback.image2PositionY);
    return draft;
  };

  const originalGetLemeArtDraft = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') {
    return ensureEnhancedDraft(originalGetLemeArtDraft(scope));
  };

  const originalPrepareLemeArtModalDraft = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    const draft = originalPrepareLemeArtModalDraft(post);
    if (post) {
      draft.imageDataUrl = String(post.arte_imagem || post.imageDataUrl || '');
      draft.imageName = String(post.arte_imagem_nome || post.imageName || '');
      draft.image2DataUrl = String(post.arte_imagem2 || post.image2DataUrl || '');
      draft.image2Name = String(post.arte_imagem2_nome || post.image2Name || '');
      draft.imagePositionX = clampPercent(post.arte_imagem_pos_x ?? post.imagePositionX);
      draft.imagePositionY = clampPercent(post.arte_imagem_pos_y ?? post.imagePositionY);
      draft.image2PositionX = clampPercent(post.arte_imagem2_pos_x ?? post.image2PositionX);
      draft.image2PositionY = clampPercent(post.arte_imagem2_pos_y ?? post.image2PositionY);
      draft.imageElement = null;
      draft.image2Element = null;
    }
    return ensureEnhancedDraft(draft);
  };

  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    return getLemeArtCarousel(scope).slides.map(slide => {
      ensureEnhancedDraft(slide);
      return {
        id: String(slide.id || uid()),
        template: normalizeLemeArtTemplate(slide.template),
        format: normalizeLemeArtFormat(slide.format),
        fontScale: normalizeLemeArtFontScale(slide.fontScale),
        text: normalizeLemeArtText(slide.text),
        imageDataUrl: String(slide.imageDataUrl || ''),
        imageName: String(slide.imageName || ''),
        image2DataUrl: String(slide.image2DataUrl || ''),
        image2Name: String(slide.image2Name || ''),
        imagePositionX: clampPercent(slide.imagePositionX),
        imagePositionY: clampPercent(slide.imagePositionY),
        image2PositionX: clampPercent(slide.image2PositionX),
        image2PositionY: clampPercent(slide.image2PositionY)
      };
    });
  };

  const originalCollectPost = collectPost;
  collectPost = function() {
    const record = originalCollectPost();
    if (String(record.cliente_id || '') !== LEME_CLIENT_ID) return record;
    const draft = ensureEnhancedDraft(getLemeArtDraft('modal'));
    return {
      ...record,
      arte_imagem: String(draft.imageDataUrl || ''),
      arte_imagem_nome: String(draft.imageName || ''),
      arte_imagem2: String(draft.image2DataUrl || ''),
      arte_imagem2_nome: String(draft.image2Name || ''),
      arte_imagem_pos_x: clampPercent(draft.imagePositionX),
      arte_imagem_pos_y: clampPercent(draft.imagePositionY),
      arte_imagem2_pos_x: clampPercent(draft.image2PositionX),
      arte_imagem2_pos_y: clampPercent(draft.image2PositionY),
      arte_slides: serializeLemeArtCarouselSlides('modal-carousel')
    };
  };

  function savePageStudio() {
    try {
      const page = ensureEnhancedDraft(getLemeArtDraft('page'));
      const carousel = getLemeArtCarousel('page-carousel');
      localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify({
        mode: lemeArtPageMode,
        page: {
          template: page.template,
          format: page.format,
          fontScale: page.fontScale,
          text: page.text,
          imageDataUrl: page.imageDataUrl,
          imageName: page.imageName,
          image2DataUrl: page.image2DataUrl,
          image2Name: page.image2Name,
          imagePositionX: page.imagePositionX,
          imagePositionY: page.imagePositionY,
          image2PositionX: page.image2PositionX,
          image2PositionY: page.image2PositionY
        },
        carousel: {
          activeSlideId: carousel.activeSlideId,
          slides: serializeLemeArtCarouselSlides('page-carousel')
        }
      }));
    } catch (error) {
      console.warn('Não foi possível salvar o rascunho local das artes.', error);
    }
  }

  function restorePageStudio() {
    try {
      const stored = JSON.parse(localStorage.getItem(PAGE_STORAGE_KEY) || 'null');
      if (!stored || typeof stored !== 'object') return;
      if (stored.page) lemeArtRuntime.page = createLemeArtDraft(stored.page, { id: 'page', recordKey: 'page' });
      const slides = normalizeLemeArtSlides(stored.carousel?.slides || []);
      if (slides.length) {
        lemeArtCarouselRuntime.page = {
          recordKey: 'page-carousel',
          activeSlideId: slides.some(item => item.id === stored.carousel?.activeSlideId) ? stored.carousel.activeSlideId : slides[0].id,
          slides
        };
      }
      lemeArtPageMode = stored.mode === 'carousel' ? 'carousel' : 'static';
    } catch (error) {
      console.warn('Não foi possível restaurar o rascunho local das artes.', error);
    }
  }
  restorePageStudio();

  async function optimizedArtImageDataUrl(file) {
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível abrir essa imagem.'));
      reader.readAsDataURL(file);
    });
    const image = await loadLemeArtImageSource(source);
    const maxSide = 1500;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    const webp = canvas.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.86);
  }

  readLemeArtImageFile = function(file, scope, slot = 'primary', template = 'twitter-image') {
    if (!String(file?.type || '').startsWith('image/')) {
      toast('Selecione uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (Number(file.size || 0) > 20 * 1024 * 1024) {
      toast('A imagem deve ter no máximo 20 MB.');
      return;
    }

    optimizedArtImageDataUrl(file).then(dataUrl => {
      const draft = ensureEnhancedDraft(getLemeArtDraft(scope));
      const isSecondary = slot === 'secondary';
      if (isSecondary) {
        draft.image2DataUrl = dataUrl;
        draft.image2Name = file.name || 'Imagem selecionada';
        draft.image2Element = null;
        draft.image2PositionX = DEFAULT_POS;
        draft.image2PositionY = DEFAULT_POS;
      } else {
        draft.imageDataUrl = dataUrl;
        draft.imageName = file.name || 'Imagem selecionada';
        draft.imageElement = null;
        draft.imagePositionX = DEFAULT_POS;
        draft.imagePositionY = DEFAULT_POS;
      }
      draft.template = normalizeLemeArtTemplate(template);
      const select = document.getElementById(`leme_art_${scope}_template`);
      if (select) select.value = draft.template;
      syncLemeArtFontControls(scope);
      syncLemeArtImageControls(scope);
      refreshImagePositionControls(scope);
      scheduleLemeArtPreview(scope);
      if (getLemeArtScopeKey(scope) === 'page') savePageStudio();
      toast(isSecondary ? 'Imagem da direita adicionada e salva na arte.' : 'Imagem adicionada e salva na arte.');
    }).catch(error => {
      console.error(error);
      toast(error.message || 'Não foi possível abrir essa imagem.');
    });
  };

  const originalClearLemeArtImage = clearLemeArtImage;
  clearLemeArtImage = function(scope, slot = 'primary') {
    originalClearLemeArtImage(scope, slot);
    const draft = ensureEnhancedDraft(getLemeArtDraft(scope));
    if (slot === 'secondary') {
      draft.image2PositionX = DEFAULT_POS;
      draft.image2PositionY = DEFAULT_POS;
    } else {
      draft.imagePositionX = DEFAULT_POS;
      draft.imagePositionY = DEFAULT_POS;
    }
    refreshImagePositionControls(scope);
    if (getLemeArtScopeKey(scope) === 'page') savePageStudio();
  };

  const originalGetLemeArtUserImage = getLemeArtUserImage;
  getLemeArtUserImage = async function(draft, slot = 'primary') {
    ensureEnhancedDraft(draft);
    const image = await originalGetLemeArtUserImage(draft, slot);
    if (image) {
      const secondary = slot === 'secondary';
      image.__lemeCropPosition = {
        x: clampPercent(secondary ? draft.image2PositionX : draft.imagePositionX),
        y: clampPercent(secondary ? draft.image2PositionY : draft.imagePositionY)
      };
    }
    return image;
  };

  drawLemeArtImageCover = function(ctx, image, x, y, width, height, radius) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const position = image.__lemeCropPosition || { x: DEFAULT_POS, y: DEFAULT_POS };
    const maxX = Math.max(0, imageWidth - sourceWidth);
    const maxY = Math.max(0, imageHeight - sourceHeight);
    const sourceX = maxX * (clampPercent(position.x) / 100);
    const sourceY = maxY * (clampPercent(position.y) / 100);

    ctx.save();
    roundedLemeArtRect(ctx, x, y, width, height, radius);
    ctx.clip();
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    ctx.restore();
  };

  window.setLemeArtImagePosition = function(scope, slot, axis, value) {
    const draft = ensureEnhancedDraft(getLemeArtDraft(scope));
    const secondary = slot === 'secondary';
    const key = secondary
      ? (axis === 'y' ? 'image2PositionY' : 'image2PositionX')
      : (axis === 'y' ? 'imagePositionY' : 'imagePositionX');
    draft[key] = clampPercent(value);
    const valueEl = document.getElementById(`leme_art_${scope}_${slot}_${axis}_value`);
    if (valueEl) valueEl.textContent = `${Math.round(draft[key])}%`;
    scheduleLemeArtPreview(scope);
    if (getLemeArtScopeKey(scope) === 'page') savePageStudio();
  };

  window.centerLemeArtImage = function(scope, slot) {
    setLemeArtImagePosition(scope, slot, 'x', DEFAULT_POS);
    setLemeArtImagePosition(scope, slot, 'y', DEFAULT_POS);
    const xInput = document.getElementById(`leme_art_${scope}_${slot}_x`);
    const yInput = document.getElementById(`leme_art_${scope}_${slot}_y`);
    if (xInput) xInput.value = DEFAULT_POS;
    if (yInput) yInput.value = DEFAULT_POS;
  };

  function imagePositionControl(scope, slot, label, dataUrl, x, y) {
    if (!dataUrl) return '';
    return `
      <div class="leme-art-position-card" data-position-slot="${escapeAttr(slot)}">
        <div class="leme-art-position-title">
          <strong>Posicionar ${escapeHtml(label)}</strong>
          <button class="btn secondary small" type="button" onclick="centerLemeArtImage('${escapeAttr(scope)}','${escapeAttr(slot)}')">Centralizar</button>
        </div>
        <label>Horizontal <span id="leme_art_${scope}_${slot}_x_value">${Math.round(x)}%</span>
          <input id="leme_art_${scope}_${slot}_x" type="range" min="0" max="100" step="1" value="${x}" oninput="setLemeArtImagePosition('${escapeAttr(scope)}','${escapeAttr(slot)}','x',this.value)">
        </label>
        <label>Vertical <span id="leme_art_${scope}_${slot}_y_value">${Math.round(y)}%</span>
          <input id="leme_art_${scope}_${slot}_y" type="range" min="0" max="100" step="1" value="${y}" oninput="setLemeArtImagePosition('${escapeAttr(scope)}','${escapeAttr(slot)}','y',this.value)">
        </label>
        <small>Mova a foto dentro da moldura até o enquadramento ficar como você quer.</small>
      </div>`;
  }

  function imagePositionControls(scope) {
    const draft = ensureEnhancedDraft(getLemeArtDraft(scope));
    if (draft.template === 'twitter-image') {
      return imagePositionControl(scope, 'primary', 'a imagem', draft.imageDataUrl, draft.imagePositionX, draft.imagePositionY);
    }
    if (draft.template === 'twitter-two-images') {
      return `
        <div class="leme-art-position-grid">
          ${imagePositionControl(scope, 'primary', 'a imagem da esquerda', draft.imageDataUrl, draft.imagePositionX, draft.imagePositionY)}
          ${imagePositionControl(scope, 'secondary', 'a imagem da direita', draft.image2DataUrl, draft.image2PositionX, draft.image2PositionY)}
        </div>`;
    }
    return '';
  }

  function refreshImagePositionControls(scope) {
    const host = document.getElementById(`leme_art_${scope}_position_controls`);
    if (host) host.innerHTML = imagePositionControls(scope);
  }

  const originalRenderLemeArtEditor = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    let html = originalRenderLemeArtEditor(scope, options);
    html = html.replace(
      '<div class="leme-art-actions">',
      `<div id="leme_art_${scope}_position_controls" class="leme-art-position-controls">${imagePositionControls(scope)}</div><div class="leme-art-actions">`
    );
    html = html.replace(
      '<span><code>--texto--</code> marca-texto azul</span>',
      '<span><code>--texto--</code> marca-texto azul</span><span><code>+texto+</code> negrito</span><span><code>/texto/</code> itálico</span>'
    );
    html = html.replace(
      'placeholder="Use *frase*, _frase_ ou --frase-- para destacar"',
      'placeholder="Use *texto*, _texto_, --texto--, +texto+ ou /texto/"'
    );
    return html;
  };

  parseLemeArtMarkup = function(value) {
    const source = normalizeLemeArtText(value);
    const plain = [];
    const decorations = [];
    const styles = [];
    const active = { circle: null, underline: null, highlight: null, bold: null, italic: null };
    const markers = [
      { token: '--', type: 'highlight', kind: 'decoration' },
      { token: '*', type: 'circle', kind: 'decoration' },
      { token: '_', type: 'underline', kind: 'decoration' },
      { token: '+', type: 'bold', kind: 'style' },
      { token: '/', type: 'italic', kind: 'style' }
    ];

    for (let index = 0; index < source.length;) {
      const marker = markers.find(item => source.startsWith(item.token, index));
      if (!marker) {
        plain.push(source[index]);
        index += 1;
        continue;
      }
      const { token, type, kind } = marker;
      if (active[type] !== null) {
        if (plain.length > active[type]) {
          (kind === 'style' ? styles : decorations).push({ type, start: active[type], end: plain.length });
        }
        active[type] = null;
        index += token.length;
        continue;
      }
      if (source.indexOf(token, index + token.length) !== -1) {
        active[type] = plain.length;
        index += token.length;
        continue;
      }
      plain.push(...token);
      index += token.length;
    }
    return { source, plainText: plain.join(''), decorations, styles };
  };

  function styleAt(styles, index) {
    return {
      bold: styles.some(style => style.type === 'bold' && index >= style.start && index < style.end),
      italic: styles.some(style => style.type === 'italic' && index >= style.start && index < style.end)
    };
  }

  function fontString(size, family, baseWeight, style) {
    const weight = style.bold ? '700' : baseWeight;
    return `${style.italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
  }

  function measureStyledRange(ctx, text, start, end, config) {
    if (end <= start) return 0;
    let width = 0;
    let runStart = start;
    let current = styleAt(config.styles, start);
    const flush = index => {
      if (index <= runStart) return;
      ctx.font = fontString(config.size, config.fontFamily, config.fontWeight, current);
      width += ctx.measureText(text.slice(runStart, index)).width;
      runStart = index;
    };
    for (let i = start + 1; i < end; i += 1) {
      const next = styleAt(config.styles, i);
      if (next.bold !== current.bold || next.italic !== current.italic) {
        flush(i);
        current = next;
      }
    }
    flush(end);
    return width;
  }

  function wrapStyledText(ctx, parsed, maxWidth, config) {
    const paragraphs = parsed.plainText.split('\n');
    const lines = [];
    let paragraphOffset = 0;
    paragraphs.forEach(paragraph => {
      const words = Array.from(paragraph.matchAll(/\S+/g));
      if (!words.length) {
        lines.push({ text: '', start: paragraphOffset, end: paragraphOffset });
      } else {
        let lineStart = null;
        let lineEnd = null;
        words.forEach(match => {
          const wordStart = paragraphOffset + Number(match.index || 0);
          const wordEnd = wordStart + match[0].length;
          const candidateStart = lineStart === null ? wordStart : lineStart;
          const candidateWidth = measureStyledRange(ctx, parsed.plainText, candidateStart, wordEnd, config);
          if (lineStart !== null && candidateWidth > maxWidth) {
            lines.push({ text: parsed.plainText.slice(lineStart, lineEnd), start: lineStart, end: lineEnd });
            lineStart = wordStart;
            lineEnd = wordEnd;
          } else {
            if (lineStart === null) lineStart = wordStart;
            lineEnd = wordEnd;
          }
        });
        if (lineStart !== null) lines.push({ text: parsed.plainText.slice(lineStart, lineEnd), start: lineStart, end: lineEnd });
      }
      paragraphOffset += paragraph.length + 1;
    });
    return lines.length ? lines : [{ text: '', start: 0, end: 0 }];
  }

  fitLemeArtText = function(ctx, text, options = {}) {
    const parsed = parseLemeArtMarkup(text);
    const fontFamily = options.fontFamily || 'Poppins, Arial, sans-serif';
    const fontWeight = options.fontWeight || '500';
    const maxWidth = Number(options.maxWidth || 800);
    const maxHeight = Number(options.maxHeight || 900);
    const lineHeightRatio = Number(options.lineHeightRatio || 1.28);
    const maxFontSize = Number(options.maxFontSize || 72);
    let selected = null;

    for (let size = maxFontSize; size >= 18; size -= 2) {
      const config = { size, fontFamily, fontWeight, styles: parsed.styles };
      const lines = wrapStyledText(ctx, parsed, maxWidth, config);
      const lineHeight = size * lineHeightRatio;
      const height = Math.max(lineHeight, lines.length * lineHeight);
      const widest = lines.reduce((maximum, line) => Math.max(maximum, measureStyledRange(ctx, parsed.plainText, line.start, line.end, config)), 0);
      selected = { size, lines, lineHeight, height, widest, fontFamily, fontWeight, decorations: parsed.decorations, styles: parsed.styles, plainText: parsed.plainText };
      if (widest <= maxWidth && height <= maxHeight) break;
    }
    return selected;
  };

  function layoutLineWidth(ctx, layout, line) {
    return measureStyledRange(ctx, layout.plainText, line.start, line.end, {
      size: layout.size,
      fontFamily: layout.fontFamily,
      fontWeight: layout.fontWeight,
      styles: layout.styles || []
    });
  }

  drawLemeArtDecorations = function(ctx, layout, x, y, options = {}) {
    const decorations = Array.isArray(layout.decorations) ? layout.decorations : [];
    if (!decorations.length) return;
    const align = options.align || 'left';
    const decorationType = options.decorationType || '';
    const config = { size: layout.size, fontFamily: layout.fontFamily, fontWeight: layout.fontWeight, styles: layout.styles || [] };

    layout.lines.forEach((line, lineIndex) => {
      if (!line.text) return;
      const lineWidth = layoutLineWidth(ctx, layout, line);
      const lineLeft = align === 'center' ? x - lineWidth / 2 : align === 'right' ? x - lineWidth : x;
      const lineY = y + lineIndex * layout.lineHeight;
      decorations.forEach(decoration => {
        if (decorationType && decoration.type !== decorationType) return;
        const fragmentStart = Math.max(decoration.start, line.start);
        const fragmentEnd = Math.min(decoration.end, line.end);
        if (fragmentEnd <= fragmentStart) return;
        const fragmentX = lineLeft + measureStyledRange(ctx, layout.plainText, line.start, fragmentStart, config);
        const fragmentWidth = measureStyledRange(ctx, layout.plainText, fragmentStart, fragmentEnd, config);
        if (fragmentWidth <= 1) return;
        const seed = fragmentStart * 31 + fragmentEnd * 17 + lineIndex * 13;
        if (decoration.type === 'circle') drawLemeArtHandCircle(ctx, fragmentX, lineY + layout.size * .03, fragmentWidth, layout.size * .98, options.circleColor || LEME_ART_CONFIG.accentColor, seed);
        if (decoration.type === 'underline') drawLemeArtHandUnderline(ctx, fragmentX, lineY + layout.size * 1.07, fragmentWidth, layout.size, options.underlineColor || LEME_ART_CONFIG.textColor, seed);
        if (decoration.type === 'highlight') drawLemeArtHandHighlight(ctx, fragmentX, lineY + layout.size * .22, fragmentWidth, layout.size * .68, options.highlightColor || LEME_ART_CONFIG.accentColor, seed);
      });
    });
  };

  function drawStyledLine(ctx, layout, line, x, y, align) {
    const config = { size: layout.size, fontFamily: layout.fontFamily, fontWeight: layout.fontWeight, styles: layout.styles || [] };
    const lineWidth = layoutLineWidth(ctx, layout, line);
    let cursor = align === 'center' ? x - lineWidth / 2 : align === 'right' ? x - lineWidth : x;
    let runStart = line.start;
    let current = styleAt(config.styles, line.start);
    const flush = index => {
      if (index <= runStart) return;
      const fragment = layout.plainText.slice(runStart, index);
      ctx.font = fontString(layout.size, layout.fontFamily, layout.fontWeight, current);
      ctx.fillText(fragment, cursor, y);
      cursor += ctx.measureText(fragment).width;
      runStart = index;
    };
    for (let i = line.start + 1; i < line.end; i += 1) {
      const next = styleAt(config.styles, i);
      if (next.bold !== current.bold || next.italic !== current.italic) {
        flush(i);
        current = next;
      }
    }
    flush(line.end);
  }

  drawLemeArtText = function(ctx, layout, x, y, options = {}) {
    ctx.save();
    ctx.fillStyle = options.color || LEME_ART_CONFIG.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawLemeArtDecorations(ctx, layout, x, y, { ...options, decorationType: 'highlight' });
    drawLemeArtDecorations(ctx, layout, x, y, { ...options, decorationType: 'circle' });
    layout.lines.forEach((line, index) => {
      if (line.text) drawStyledLine(ctx, layout, line, x, y + index * layout.lineHeight, options.align || 'left');
    });
    drawLemeArtDecorations(ctx, layout, x, y, { ...options, decorationType: 'underline' });
    ctx.restore();
  };

  LEME_HANDWRITTEN_LOGO_ASSET = 'assets/logo-leme-cinza-manuscrito.png?v=110.3';
  lemeHandwrittenLogoPromise = null;
  drawLemeHandwrittenLogo = function(ctx, image, format) {
    if (!ctx || !image || !format) return;
    const visibleRatio = 127 / 553;
    const logoWidth = 184;
    const logoHeight = logoWidth * visibleRatio;
    const bottomMargin = 66;
    const x = Math.round((format.width - logoWidth) / 2);
    const y = Math.max(0, Math.round(format.height - bottomMargin - logoHeight));
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(image, 0, 0, image.naturalWidth || image.width, 127, x, y, logoWidth, logoHeight);
    ctx.restore();
  };

  const wrappers = [
    ['handleLemeArtTextInput', () => handleLemeArtTextInput],
    ['setLemeArtTemplate', () => setLemeArtTemplate],
    ['setLemeArtFormat', () => setLemeArtFormat],
    ['setLemeArtFontScale', () => setLemeArtFontScale],
    ['addLemeArtCarouselSlide', () => addLemeArtCarouselSlide],
    ['duplicateLemeArtCarouselSlide', () => duplicateLemeArtCarouselSlide],
    ['removeLemeArtCarouselSlide', () => removeLemeArtCarouselSlide],
    ['moveLemeArtCarouselSlide', () => moveLemeArtCarouselSlide],
    ['setLemeArtPageMode', () => setLemeArtPageMode]
  ];
  wrappers.forEach(([name, getter]) => {
    const original = getter();
    window[name] = function(...args) {
      const result = original.apply(this, args);
      if (String(args[0] || '').startsWith('page') || name === 'setLemeArtPageMode') window.setTimeout(savePageStudio, 0);
      if (name === 'setLemeArtTemplate') window.setTimeout(() => refreshImagePositionControls(args[0]), 0);
      return result;
    };
    try { eval(`${name} = window[name]`); } catch {}
  });

  window.addEventListener('beforeunload', savePageStudio);
})();
