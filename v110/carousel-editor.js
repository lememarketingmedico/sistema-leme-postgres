function renderLemeArtEditor(scope = 'page', options = {}) {
  const draft = getLemeArtDraft(scope);
  const compact = Boolean(options.compact);
  const carousel = Boolean(options.carousel);
  const prefix = `leme_art_${scope}`;
  const needsSingleImage = draft.template === 'twitter-image';
  const needsTwoImages = draft.template === 'twitter-two-images';
  const format = getLemeArtFormatConfig(draft);
  const fontScale = normalizeLemeArtFontScale(draft.fontScale);
  const fontSize = getLemeArtMaxFontSize(draft.template, fontScale);

  return `
    <div class="leme-art-editor ${compact ? 'is-compact' : ''}" data-leme-art-editor="${escapeAttr(scope)}">
      <div class="leme-art-controls">
        <div class="leme-art-select-grid">
          <label>Modelo da arte
            <select
              class="select"
              id="${prefix}_template"
              onchange="setLemeArtTemplate('${escapeAttr(scope)}', this.value)">
              ${lemeArtTemplateOptions(draft.template)}
            </select>
          </label>

          <label>${carousel ? 'Pré-visualizar em' : 'Formato de saída'}
            <select
              class="select"
              id="${prefix}_format"
              onchange="setLemeArtFormat('${escapeAttr(scope)}', this.value)">
              ${lemeArtFormatOptions(format.key)}
            </select>
          </label>
        </div>

        <div class="leme-art-font-control">
          <div class="leme-art-font-heading">
            <span>Tamanho da fonte</span>
            <strong id="${prefix}_font_value">${fontSize} px · ${fontScale}%</strong>
          </div>
          <div class="leme-art-font-adjuster">
            <button
              type="button"
              aria-label="Diminuir tamanho da fonte"
              onclick="adjustLemeArtFontScale('${escapeAttr(scope)}', -${LEME_ART_FONT_SCALE.step})">−</button>
            <input
              id="${prefix}_font_scale"
              type="range"
              min="${LEME_ART_FONT_SCALE.min}"
              max="${LEME_ART_FONT_SCALE.max}"
              step="${LEME_ART_FONT_SCALE.step}"
              value="${fontScale}"
              aria-label="Tamanho da fonte em porcentagem"
              oninput="setLemeArtFontScale('${escapeAttr(scope)}', this.value)">
            <button
              type="button"
              aria-label="Aumentar tamanho da fonte"
              onclick="adjustLemeArtFontScale('${escapeAttr(scope)}', ${LEME_ART_FONT_SCALE.step})">＋</button>
          </div>
          <small>Você escolhe o tamanho máximo; textos longos ainda diminuem automaticamente para respeitar as margens.</small>
        </div>

        <label>Texto da arte
          <textarea
            class="textarea leme-art-textarea"
            id="${prefix}_text"
            rows="${compact ? '4' : '7'}"
            maxlength="900"
            placeholder="Use *frase*, _frase_ ou --frase-- para destacar"
            oninput="handleLemeArtTextInput('${escapeAttr(scope)}', this.value)">${escapeHtml(draft.text || '')}</textarea>
        </label>
        <div class="leme-art-text-meta">
          <span>As linhas quebram somente entre palavras.</span>
          <strong id="${prefix}_count">${String(draft.text || '').length}/900</strong>
        </div>
        <div class="leme-art-markup-help" aria-label="Comandos de destaque do texto">
          <span><code>*texto*</code> circula em azul</span>
          <span><code>_texto_</code> sublinha à mão</span>
          <span><code>--texto--</code> marca-texto azul</span>
        </div>

        <div id="${prefix}_image_group" class="leme-art-image-group ${needsSingleImage ? '' : 'hidden'}">
          ${renderLemeArtImageDropzone(scope, 'single', 'primary', 'Imagem da publicação', 'twitter-image', draft)}
        </div>

        <div id="${prefix}_two_image_group" class="leme-art-image-group ${needsTwoImages ? '' : 'hidden'}">
          <span class="field-label">Imagens da publicação</span>
          <div class="leme-art-two-image-grid">
            ${renderLemeArtImageDropzone(scope, 'left', 'primary', 'Imagem da esquerda', 'twitter-two-images', draft)}
            ${renderLemeArtImageDropzone(scope, 'right', 'secondary', 'Imagem da direita', 'twitter-two-images', draft)}
          </div>
        </div>

        <div class="leme-art-actions">
          <button
            class="btn"
            id="${prefix}_download"
            type="button"
            onclick="generateAndDownloadLemeArt('${escapeAttr(scope)}')">
            ${carousel ? 'Baixar este slide' : 'Gerar e baixar PNG'}
          </button>
          <small id="${prefix}_output_size">Arquivo final: ${format.width} × ${format.height} px</small>
        </div>
      </div>

      <div class="leme-art-preview-panel">
        <div class="leme-art-preview-heading">
          <div>
            <span>Pré-visualização</span>
            <small>Margem segura e centralização automáticas</small>
          </div>
          <strong id="${prefix}_ratio">${format.ratioLabel}</strong>
        </div>
        <div
          class="leme-art-canvas-frame"
          id="${prefix}_canvas_frame"
          style="aspect-ratio: ${format.width} / ${format.height}; --leme-art-preview-width: ${format.previewMaxWidth}px;">
          <canvas
            id="${prefix}_canvas"
            class="leme-art-canvas"
            width="${format.width}"
            height="${format.height}"
            aria-label="Pré-visualização da arte da LEME"></canvas>
        </div>
      </div>
    </div>
  `;
}
