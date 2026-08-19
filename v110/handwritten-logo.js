var LEME_HANDWRITTEN_LOGO_ASSET = 'assets/logo-leme-cinza-manuscrito.png?v=110.2';
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

  // O arquivo já está recortado exatamente no conteúdo visível do logo,
  // sem transparência extra. Assim nunca desenhamos parte do símbolo fora do canvas.
  const targetWidth = Math.min(184, format.width - 120);
  const ratio = image.naturalHeight / image.naturalWidth;
  const targetHeight = Math.round(targetWidth * ratio);
  const bottomMargin = 60;
  const x = Math.round((format.width - targetWidth) / 2);
  const y = Math.max(0, Math.round(format.height - bottomMargin - targetHeight));

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(image, x, y, targetWidth, targetHeight);
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
