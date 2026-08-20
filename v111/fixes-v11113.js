(() => {
  const VERSION = '111.13';

  const STYLE_ACTIONS = {
    bold: { before: '+', after: '+', label: 'Negrito' },
    italic: { before: '/', after: '/', label: 'Itálico' },
    circle: { before: '*', after: '*', label: 'Círculo' },
    underline: { before: '_', after: '_', label: 'Sublinhado' },
    highlight: { before: '--', after: '--', label: 'Marca-texto' },
    color: { before: '[', after: ']', label: 'Cor destacada' }
  };

  function editor(scope) {
    return document.getElementById(`leme_art_${scope}_text`);
  }

  function commit(scope, textarea) {
    if (!textarea) return;
    if (typeof handleLemeArtTextInput === 'function') {
      handleLemeArtTextInput(scope, textarea.value);
      return;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setSelection(textarea, start, end) {
    requestAnimationFrame(() => {
      try {
        textarea.focus({ preventScroll: true });
      } catch {
        textarea.focus();
      }
      textarea.setSelectionRange(Math.max(0, start), Math.max(0, end));
    });
  }

  function selectedRange(textarea) {
    return {
      start: Number(textarea.selectionStart || 0),
      end: Number(textarea.selectionEnd || 0)
    };
  }

  function toggleWrappedStyle(scope, action) {
    const textarea = editor(scope);
    const config = STYLE_ACTIONS[action];
    if (!textarea || !config) return;

    const { start, end } = selectedRange(textarea);
    if (start === end) {
      toast(`Selecione a palavra ou frase e clique em ${config.label}.`);
      textarea.focus();
      return;
    }

    const value = textarea.value;
    const before = config.before;
    const after = config.after;
    const selected = value.slice(start, end);

    // Se o próprio trecho selecionado já contém os marcadores, remove o estilo.
    if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
      const inner = selected.slice(before.length, selected.length - after.length);
      textarea.value = value.slice(0, start) + inner + value.slice(end);
      commit(scope, textarea);
      setSelection(textarea, start, start + inner.length);
      return;
    }

    // Se o usuário selecionou somente o texto interno de algo já formatado, também alterna/remover.
    const leftStart = start - before.length;
    const rightEnd = end + after.length;
    if (
      leftStart >= 0 &&
      value.slice(leftStart, start) === before &&
      value.slice(end, rightEnd) === after
    ) {
      textarea.value = value.slice(0, leftStart) + selected + value.slice(rightEnd);
      commit(scope, textarea);
      setSelection(textarea, leftStart, leftStart + selected.length);
      return;
    }

    const replacement = before + selected + after;
    textarea.value = value.slice(0, start) + replacement + value.slice(end);
    commit(scope, textarea);
    setSelection(textarea, start + before.length, start + before.length + selected.length);
  }

  function toggleBullet(scope) {
    const textarea = editor(scope);
    if (!textarea) return;

    const value = textarea.value;
    const selection = selectedRange(textarea);
    const lineStart = value.lastIndexOf('\n', Math.max(0, selection.start - 1)) + 1;
    const foundEnd = value.indexOf('\n', selection.end);
    const lineEnd = foundEnd === -1 ? value.length : foundEnd;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const meaningful = lines.filter(line => line.trim());
    const remove = meaningful.length > 0 && meaningful.every(line => /^\s*==\s?/.test(line));

    const transformed = lines.map(line => {
      if (!line.trim()) return line;
      if (remove) return line.replace(/^(\s*)==\s?/, '$1');
      if (/^\s*==\s?/.test(line)) return line;
      const indent = (line.match(/^\s*/) || [''])[0];
      return indent + '== ' + line.slice(indent.length);
    }).join('\n');

    textarea.value = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
    commit(scope, textarea);
    setSelection(textarea, lineStart, lineStart + transformed.length);
  }

  window.applyLemeArtSelectionStyle = function(scope, action) {
    if (action === 'bullet') return toggleBullet(scope);
    toggleWrappedStyle(scope, action);
  };

  function toolbarButton(scope, action, icon, label, iconClass = '') {
    return `<button type="button" class="leme-art-format-button" title="${escapeAttr(label)}" onpointerdown="event.preventDefault()" onclick="applyLemeArtSelectionStyle('${escapeAttr(scope)}','${escapeAttr(action)}')"><span class="leme-art-format-icon ${iconClass}">${icon}</span><span>${escapeHtml(label)}</span></button>`;
  }

  function toolbar(scope) {
    return `<div class="leme-art-format-toolbar" aria-label="Formatação do texto">
      <div class="leme-art-format-toolbar-heading">
        <strong>Formatar seleção</strong>
        <small>Selecione uma palavra ou frase no texto e clique no estilo.</small>
      </div>
      <div class="leme-art-format-buttons">
        ${toolbarButton(scope, 'bold', 'B', 'Negrito', 'is-bold')}
        ${toolbarButton(scope, 'italic', 'I', 'Itálico', 'is-italic')}
        ${toolbarButton(scope, 'circle', '◯', 'Círculo', 'is-circle')}
        ${toolbarButton(scope, 'underline', 'U', 'Sublinhado', 'is-underline')}
        ${toolbarButton(scope, 'highlight', '▰', 'Marca-texto', 'is-highlight')}
        ${toolbarButton(scope, 'color', '●', 'Cor destacada', 'is-color')}
        ${toolbarButton(scope, 'bullet', '•', 'Bullet point', 'is-bullet')}
      </div>
    </div>`;
  }

  const previousRenderEditor = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    let html = previousRenderEditor(scope, options);

    // Remove a antiga lista de comandos digitáveis.
    html = html.replace(/<div class="leme-art-markup-help"[\s\S]*?<\/div>/g, '');

    const bar = toolbar(scope);
    const metaPattern = /(<div class="leme-art-text-meta">[\s\S]*?<\/div>)/;
    if (metaPattern.test(html)) {
      html = html.replace(metaPattern, `$1${bar}`);
    } else {
      html = html.replace('</label>', `</label>${bar}`);
    }

    return html;
  };
  window.renderLemeArtEditor = renderLemeArtEditor;

  const style = document.createElement('style');
  style.id = 'leme-v11113-format-toolbar-style';
  style.textContent = `
    .leme-art-markup-help{display:none!important}
    .leme-art-format-toolbar{display:grid;gap:10px;margin-top:2px;padding:13px 14px;border:1px solid rgba(82,164,213,.18);border-radius:14px;background:linear-gradient(145deg,rgba(12,28,40,.60),rgba(18,39,54,.46));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
    .leme-art-format-toolbar-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .leme-art-format-toolbar-heading strong{font-size:13px;color:#eef6fb}
    .leme-art-format-toolbar-heading small{font-size:11px;color:#87a2b5}
    .leme-art-format-buttons{display:flex;flex-wrap:wrap;gap:7px}
    .leme-art-format-button{appearance:none;display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:7px 10px;border:1px solid rgba(126,160,181,.23);border-radius:10px;background:#132433;color:#d9e7ef;font:600 11px/1 Poppins,Arial,sans-serif;cursor:pointer;transition:transform .12s ease,border-color .12s ease,background .12s ease,box-shadow .12s ease;user-select:none}
    .leme-art-format-button:hover{background:#183047;border-color:rgba(82,164,213,.58);box-shadow:0 4px 14px rgba(0,0,0,.12)}
    .leme-art-format-button:active{transform:translateY(1px)}
    .leme-art-format-icon{display:grid;place-items:center;width:20px;height:20px;flex:0 0 20px;border-radius:6px;background:rgba(255,255,255,.055);font-size:14px;font-weight:800;color:#f3f7f9}
    .leme-art-format-icon.is-bold{font-family:Arial,sans-serif;font-weight:900}
    .leme-art-format-icon.is-italic{font-family:Georgia,serif;font-style:italic}
    .leme-art-format-icon.is-circle{font-size:19px;color:#52a4d5;background:transparent}
    .leme-art-format-icon.is-underline{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:2px}
    .leme-art-format-icon.is-highlight{color:#52a4d5;font-size:17px}
    .leme-art-format-icon.is-color{color:#52a4d5;font-size:18px;background:transparent}
    .leme-art-format-icon.is-bullet{font-size:21px;color:#52a4d5;background:transparent}
    @media(max-width:680px){
      .leme-art-format-toolbar-heading{display:grid;gap:3px}
      .leme-art-format-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
      .leme-art-format-button{width:100%;justify-content:flex-start}
    }
  `;
  document.head.appendChild(style);
})();
