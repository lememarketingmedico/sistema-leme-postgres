var LEME_HANDWRITTEN_LOGO_ASSET = 'assets/logo-leme-cinza-manuscrito.png?v=110.1';
var lemeHandwrittenLogoPromise = null;

function loadLemeHandwrittenLogo() {
  if (!lemeHandwrittenLogoPromise) {
    lemeHandwrittenLogoPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível carregar o logo manuscrito da LEME.'));
      image.src = LEME_HANDWRITTEN_LOGO_ASSET;
    });
  }
  return lemeHandwrittenLogoPromise;
}

function drawLemeHandwrittenLogo(ctx, image, format) {
  if (!ctx || !image || !format) return;

  // Medidas copiadas da arte de referência 1080 x 1350:
  // largura ~184 px, centralizado, com ~60 px de margem inferior.
  // Feed e Story têm 1080 px de largura, então o logo mantém exatamente
  // a mesma escala visual e o mesmo afastamento da borda inferior.
  const logoWidth = 184;
  const logoHeight = logoWidth * (image.naturalHeight / image.naturalWidth);
  const x = Math.round((format.width - logoWidth) / 2);
  const y = Math.round(format.height - 60 - logoHeight);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(image, x, y, logoWidth, logoHeight);
  ctx.restore();
}

var renderLemeArtDraftCanvasWithoutHandwrittenLogo = renderLemeArtDraftCanvas;

renderLemeArtDraftCanvas = async function(draft, formatValue = draft?.format, targetCanvas = null) {
  const canvas = await renderLemeArtDraftCanvasWithoutHandwrittenLogo(draft, formatValue, targetCanvas);
  if (!canvas || draft?.template !== 'handwritten') return canvas;

  try {
    const format = getLemeArtFormatConfig(formatValue);
    const ctx = canvas.getContext('2d');
    const logo = await loadLemeHandwrittenLogo();
    drawLemeHandwrittenLogo(ctx, logo, format);
  } catch (error) {
    console.warn(error);
  }

  return canvas;
};
