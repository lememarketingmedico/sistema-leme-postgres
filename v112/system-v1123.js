(() => {
  const VERSION = '112.3';
  const LEGACY_FIT_MIN = 18;

  // A escala continua sendo salva no mesmo campo de sempre para preservar
  // todas as artes existentes. Apenas ampliamos o intervalo disponível.
  try {
    LEME_ART_FONT_SCALE.min = 1;
    LEME_ART_FONT_SCALE.step = 1;
  } catch (error) {
    console.warn('V112.3: não foi possível ampliar o controle de fonte.', error);
  }

  const previousMaxFontSize = getLemeArtMaxFontSize;
  getLemeArtMaxFontSize = function(template, fontScale) {
    const size = Number(previousMaxFontSize(template, fontScale));
    return Math.max(1, Number.isFinite(size) ? size : 1);
  };
  window.getLemeArtMaxFontSize = getLemeArtMaxFontSize;

  // O motor original tentava fontes somente a partir de 18 px. Para permitir
  // o slider chegar realmente até 1, preservamos todo o comportamento antigo
  // acima de 18 e usamos o mesmo layout/markup para tamanhos menores.
  const previousFitText = fitLemeArtText;
  fitLemeArtText = function(ctx, text, options = {}) {
    const requested = Math.max(1, Number(options.maxFontSize || 72));
    if (requested >= LEGACY_FIT_MIN) {
      return previousFitText(ctx, text, { ...options, maxFontSize: requested });
    }

    // A chamada em 18 px resolve fonte, peso, estilos, destaques e texto já
    // normalizado através de todos os wrappers das versões anteriores.
    const probe = previousFitText(ctx, text, { ...options, maxFontSize: LEGACY_FIT_MIN });
    if (!probe) return probe;

    const maxWidth = Math.max(1, Number(options.maxWidth || 800));
    const maxHeight = Math.max(1, Number(options.maxHeight || 900));
    const lineHeightRatio = Math.max(0.5, Number(options.lineHeightRatio || (probe.lineHeight && probe.size ? probe.lineHeight / probe.size : 1.28)));
    const fontFamily = probe.fontFamily || options.fontFamily || 'Poppins, Arial, sans-serif';
    const fontWeight = probe.fontWeight || options.fontWeight || '500';
    const plainText = String(probe.plainText ?? text ?? '');

    const build = sizeValue => {
      const size = Math.max(1, Number(sizeValue || 1));
      ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
      const lines = wrapLemeArtText(ctx, plainText, maxWidth);
      const lineHeight = Math.max(1, size * lineHeightRatio);
      const height = Math.max(lineHeight, Math.max(1, lines.length) * lineHeight);
      const widest = lines.reduce((largest, line) => Math.max(largest, ctx.measureText(line.text || '').width), 0);
      return {
        ...probe,
        size,
        lines,
        lineHeight,
        height,
        widest,
        fontFamily,
        fontWeight,
        plainText
      };
    };

    let result = build(requested);
    if (result.widest > maxWidth || result.height > maxHeight) {
      const scale = Math.min(
        maxWidth / Math.max(1, result.widest),
        maxHeight / Math.max(1, result.height)
      );
      result = build(Math.max(1, requested * scale));
    }
    return result;
  };
  window.fitLemeArtText = fitLemeArtText;

  function normalizeFontSlider(scope) {
    const slider = document.getElementById(`leme_art_${scope}_font_scale`);
    if (!slider) return;
    slider.min = '1';
    slider.step = '1';
    slider.max = String(LEME_ART_FONT_SCALE.max || 160);
  }

  function normalizeAllFontSliders(root = document) {
    root.querySelectorAll?.('input[id^="leme_art_"][id$="_font_scale"]').forEach(slider => {
      slider.min = '1';
      slider.step = '1';
      slider.max = String(LEME_ART_FONT_SCALE.max || 160);
    });
  }

  const previousSyncFontControls = syncLemeArtFontControls;
  syncLemeArtFontControls = function(scope) {
    const result = previousSyncFontControls(scope);
    normalizeFontSlider(scope);
    return result;
  };
  window.syncLemeArtFontControls = syncLemeArtFontControls;

  // Garante o intervalo correto mesmo em editores reconstruídos por carrossel,
  // troca de modelo, modal ou qualquer renderização legada.
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('input[id^="leme_art_"][id$="_font_scale"]')) {
          node.min = '1';
          node.step = '1';
          node.max = String(LEME_ART_FONT_SCALE.max || 160);
        }
        normalizeAllFontSliders(node);
      }
    }
  });

  const start = () => {
    normalizeAllFontSliders();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.__LEME_SYSTEM_RESPONSIVE_VERSION__ = VERSION;
})();
