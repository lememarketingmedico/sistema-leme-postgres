(() => {
  // Usa uma versão vetorial com o contorno visível exato do logo enviado.
  // Assim não existe área transparente escondida para deslocar ou cortar o símbolo.
  LEME_HANDWRITTEN_LOGO_ASSET = 'assets/logo-leme-cinza-manuscrito.svg?v=110.3';
  lemeHandwrittenLogoPromise = null;

  drawLemeHandwrittenLogo = function(ctx, image, format) {
    if (!ctx || !image || !format) return;

    const logoWidth = 184;
    const logoHeight = Math.round(logoWidth * (127 / 553));
    const bottomMargin = 66;
    const x = Math.round((format.width - logoWidth) / 2);
    const y = Math.min(
      format.height - logoHeight,
      Math.max(0, Math.round(format.height - bottomMargin - logoHeight))
    );

    ctx.save();
    // A referência usa o símbolo bem suave. 30% de opacidade aproxima
    // o logo exportado do cinza claro da arte original sem perder definição.
    ctx.globalAlpha = 0.30;
    ctx.drawImage(image, x, y, logoWidth, logoHeight);
    ctx.restore();
  };

  // Atualiza o aviso do carrossel: desde a V110.3 as fotos, enquadramentos
  // e demais configurações fazem parte dos dados salvos da publicação.
  const originalRenderLemeArtCarouselV1103 = renderLemeArtCarousel;
  renderLemeArtCarousel = function(scope = 'page-carousel', options = {}) {
    return originalRenderLemeArtCarouselV1103(scope, options)
      .replace(
        'As fotos ficam somente nesta sessão do navegador e não são gravadas no banco.',
        getLemeArtScopeKey(scope) === 'modal'
          ? 'Texto, modelos, imagens e enquadramentos ficam salvos junto da publicação para você continuar editando depois.'
          : 'O estúdio salva automaticamente o rascunho neste navegador, incluindo texto, modelos, imagens e enquadramentos.'
      );
  };
})();
