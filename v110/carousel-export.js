async function renderLemeArtDraftCanvas(draft, formatValue = draft?.format, targetCanvas = null) {
  const canvas = targetCanvas || document.createElement('canvas');
  const format = getLemeArtFormatConfig(formatValue);
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  paintLemeArtBackground(ctx, format);

  const text = normalizeLemeArtText(draft?.text) || 'Digite a frase que será transformada em arte.';
  const assets = await loadLemeArtAssets();
  paintLemeArtBackground(ctx, format);

  if (draft.template === 'handwritten') {
    drawLemeArtHandwritten(ctx, text, format, draft.fontScale);
  } else if (draft.template === 'twitter-two-images') {
    const userImages = await Promise.all([
      getLemeArtUserImage(draft, 'primary').catch(error => {
        console.warn(error);
        return null;
      }),
      getLemeArtUserImage(draft, 'secondary').catch(error => {
        console.warn(error);
        return null;
      })
    ]);
    drawLemeArtTwitterText(ctx, text, assets.tag, 'two', userImages, format, draft.fontScale);
  } else if (draft.template === 'twitter-image') {
    let userImage = null;
    try {
      userImage = await getLemeArtUserImage(draft, 'primary');
    } catch (error) {
      console.warn(error);
    }
    drawLemeArtTwitterText(ctx, text, assets.tag, 'single', [userImage], format, draft.fontScale);
  } else {
    drawLemeArtTwitterText(ctx, text, assets.tag, 'none', [], format, draft.fontScale);
  }

  return canvas;
}

async function renderLemeArtCanvas(scope = 'page') {
  const canvas = document.getElementById(`leme_art_${scope}_canvas`);
  if (!canvas) return null;
  const draft = getLemeArtDraft(scope);
  const rendered = await renderLemeArtDraftCanvas(draft, draft.format, canvas);
  if (document.getElementById(`leme_art_${scope}_canvas`) !== canvas) return null;
  return rendered;
}

function scheduleLemeArtPreview(scope = 'page') {
  window.clearTimeout(lemeArtPreviewTimer);
  lemeArtPreviewTimer = window.setTimeout(() => {
    renderLemeArtCanvas(scope).catch(error => {
      console.error(error);
      toast('Não foi possível atualizar a pré-visualização.');
    });
  }, 90);
}

function initializeLemeArtCanvases() {
  document.querySelectorAll('[data-leme-art-editor]').forEach(editor => {
    const scope = editor.dataset.lemeArtEditor || 'page';
    syncLemeArtFormatControls(scope);
    syncLemeArtFontControls(scope);
    syncLemeArtImageControls(scope);
    renderLemeArtCanvas(scope).catch(error => console.error(error));
  });
}

function lemeArtDownloadName(text, template, format) {
  const slug = normalizeLemeArtText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54);
  return `leme-${normalizeLemeArtFormat(format)}-${template}-${slug || 'arte'}.png`;
}

async function generateAndDownloadLemeArt(scope = 'page') {
  const draft = getLemeArtDraft(scope);
  const text = normalizeLemeArtText(draft.text);

  if (!text) {
    toast('Digite o texto da arte antes de gerar.');
    return;
  }

  if (draft.template === 'twitter-image' && !draft.imageDataUrl) {
    toast('Adicione uma imagem para usar o modelo Twitter Texto + imagem.');
    return;
  }

  if (draft.template === 'twitter-two-images' && (!draft.imageDataUrl || !draft.image2DataUrl)) {
    toast('Adicione as imagens da esquerda e da direita para usar o modelo Twitter Texto + 2 imagens.');
    return;
  }

  const button = document.getElementById(`leme_art_${scope}_download`);
  const originalLabel = button?.textContent || 'Gerar e baixar PNG';
  if (button) {
    button.disabled = true;
    button.textContent = 'Gerando arte...';
  }

  try {
    const canvas = await renderLemeArtCanvas(scope);
    if (!canvas) throw new Error('Canvas da arte não encontrado.');
    const format = getLemeArtFormatConfig(draft);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error('Não foi possível gerar o PNG.'));
      }, 'image/png');
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = lemeArtDownloadName(text, draft.template, format.key);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(`Arte ${format.label} baixada em PNG.`);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não foi possível gerar a arte.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel.trim();
    }
  }
}

function validateLemeArtDraft(draft, slideNumber = null) {
  const label = slideNumber ? `O slide ${slideNumber}` : 'A arte';
  if (!normalizeLemeArtText(draft?.text)) return `${label} está sem texto.`;
  if (draft.template === 'twitter-image' && !draft.imageDataUrl) {
    return `${label} precisa de uma imagem.`;
  }
  if (draft.template === 'twitter-two-images' && (!draft.imageDataUrl || !draft.image2DataUrl)) {
    return `${label} precisa das imagens da esquerda e da direita.`;
  }
  return '';
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(result => {
      if (result) resolve(result);
      else reject(new Error('Não foi possível gerar um dos arquivos PNG.'));
    }, 'image/png');
  });
}

let lemeArtCrcTable = null;
function getLemeArtCrcTable() {
  if (lemeArtCrcTable) return lemeArtCrcTable;
  lemeArtCrcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    lemeArtCrcTable[index] = value >>> 0;
  }
  return lemeArtCrcTable;
}

function lemeArtCrc32(bytes) {
  const table = getLemeArtCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeLemeArtZipHeader(size, writer) {
  const bytes = new Uint8Array(size);
  writer(new DataView(bytes.buffer));
  return bytes;
}

function createLemeArtZip(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((Math.floor(now.getSeconds() / 2)) & 31);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

  files.forEach(file => {
    const nameBytes = encoder.encode(file.name);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = lemeArtCrc32(data);
    const localHeader = writeLemeArtZipHeader(30 + nameBytes.length, view => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, dosTime, true);
      view.setUint16(12, dosDate, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      new Uint8Array(view.buffer, 30).set(nameBytes);
    });
    localChunks.push(localHeader, data);

    const centralHeader = writeLemeArtZipHeader(46 + nameBytes.length, view => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, dosTime, true);
      view.setUint16(14, dosDate, true);
      view.setUint32(16, crc, true);
      view.setUint32(20, data.length, true);
      view.setUint32(24, data.length, true);
      view.setUint16(28, nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, localOffset, true);
      new Uint8Array(view.buffer, 46).set(nameBytes);
    });
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + data.length;
  });

  const centralSize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
  const end = writeLemeArtZipHeader(22, view => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, localOffset, true);
    view.setUint16(20, 0, true);
  });

  return new Blob([...localChunks, ...centralChunks, end], { type: 'application/zip' });
}

function downloadLemeArtBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportLemeArtCarousel(scope = 'page-carousel') {
  const carousel = getLemeArtCarousel(scope);
  const invalidIndex = carousel.slides.findIndex((slide, index) => validateLemeArtDraft(slide, index + 1));
  if (invalidIndex !== -1) {
    carousel.activeSlideId = carousel.slides[invalidIndex].id;
    refreshLemeArtCarousel(scope);
    toast(validateLemeArtDraft(carousel.slides[invalidIndex], invalidIndex + 1));
    return;
  }

  const button = document.getElementById(`leme_art_${scope}_export_all`);
  const originalLabel = button?.textContent || 'Exportar carrossel';
  if (button) button.disabled = true;

  try {
    const files = [];
    const formats = [
      { key: 'feed', folder: 'Feed-1080x1350' },
      { key: 'story', folder: 'Story-1080x1920' }
    ];
    const total = carousel.slides.length * formats.length;
    let completed = 0;

    for (const format of formats) {
      for (let index = 0; index < carousel.slides.length; index += 1) {
        if (button) button.textContent = `Gerando ${completed + 1}/${total}...`;
        const canvas = await renderLemeArtDraftCanvas(carousel.slides[index], format.key);
        if (!canvas) throw new Error(`Não foi possível renderizar o slide ${index + 1}.`);
        const blob = await canvasToPngBlob(canvas);
        files.push({
          name: `${format.folder}/slide-${String(index + 1).padStart(2, '0')}.png`,
          data: new Uint8Array(await blob.arrayBuffer())
        });
        completed += 1;
        await new Promise(resolve => window.requestAnimationFrame(resolve));
      }
    }

    const firstText = normalizeLemeArtText(carousel.slides[0]?.text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 44);
    downloadLemeArtBlob(createLemeArtZip(files), `leme-carrossel-${firstText || 'artes'}.zip`);
    toast(`Carrossel exportado: ${carousel.slides.length} slides em Feed e Story.`);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não foi possível exportar o carrossel.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel.trim();
    }
  }
}
