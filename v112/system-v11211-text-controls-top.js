(() => {
  const VERSION = '112.11';

  function moveTextControlsInside(editor) {
    if (!editor) return;
    const fontSize = editor.querySelector('.leme-art-font-control');
    const textControls = editor.querySelector('.leme-v112-controls');
    if (!fontSize || !textControls) return;

    // Ordem desejada no topo do editor:
    // modelo/formato -> tamanho da fonte -> fonte/posição do texto -> texto da arte.
    if (fontSize.nextElementSibling !== textControls) {
      fontSize.insertAdjacentElement('afterend', textControls);
    }
    textControls.classList.add('leme-v11211-text-controls-top');
  }

  function moveMountedEditors(root = document) {
    root.querySelectorAll?.('[data-leme-art-editor]').forEach(moveTextControlsInside);
  }

  function reorderEditorHtml(html) {
    if (!html || typeof html !== 'string' || !html.includes('leme-v112-controls')) return html;
    try {
      const template = document.createElement('template');
      template.innerHTML = html;
      template.content.querySelectorAll('[data-leme-art-editor]').forEach(moveTextControlsInside);
      return template.innerHTML;
    } catch (error) {
      console.warn('V112.11: não foi possível reorganizar os controles de texto.', error);
      return html;
    }
  }

  const render0 = window.renderLemeArtEditor || renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    return reorderEditorHtml(render0(scope, options));
  };
  window.renderLemeArtEditor = renderLemeArtEditor;

  // Garante a nova posição também em editores já montados ou re-renderizados
  // por alguma camada anterior do sistema.
  const start = () => {
    moveMountedEditors();
    const observer = new MutationObserver(mutations => {
      let changed = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes?.length) {
          changed = true;
          break;
        }
      }
      if (changed) requestAnimationFrame(() => moveMountedEditors());
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.__LEME_TEXT_CONTROLS_TOP_VERSION__ = VERSION;
})();
