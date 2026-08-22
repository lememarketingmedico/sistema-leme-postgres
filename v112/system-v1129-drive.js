(() => {
  const VERSION = '112.9';
  const DRIVE_WEBHOOK_URL = String(window.LEME_ART_DRIVE_WEBHOOK_URL || 'https://n8n.adati.app.br/webhook/leme-enviar-arte-drive');
  let driveBusy = false;

  const text = value => value == null ? '' : String(value);

  function resolveDriveFolder() {
    const raw = text(document.getElementById('p_drive_folder_url')?.value).trim();
    if (!raw) return { raw: '', id: '', valid: false };

    let id = '';
    try {
      id = typeof extractGoogleDriveFolderId === 'function'
        ? text(extractGoogleDriveFolderId(raw)).trim()
        : '';
    } catch {}

    if (!id) {
      const match = raw.match(/\/folders\/([A-Za-z0-9_-]{10,})/i) || raw.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
      id = match?.[1] || (/^[A-Za-z0-9_-]{15,}$/.test(raw) ? raw : '');
    }

    const validUrl = /^https?:\/\/drive\.google\.com\//i.test(raw) && /(?:\/folders\/|[?&]id=)/i.test(raw);
    const validIdOnly = /^[A-Za-z0-9_-]{15,}$/.test(raw);
    const validId = /^[A-Za-z0-9_-]{10,}$/.test(id);
    return { raw, id, valid: Boolean(validId && (validUrl || validIdOnly)) };
  }

  function currentPostMeta() {
    const postId = text(state?.modal?.postId || '').trim();
    let post = null;
    try {
      post = postId
        ? (getPosts() || []).find(item => text(item?.registro_id || item?.id) === postId) || null
        : null;
    } catch {}
    return {
      id: text(post?.registro_id || post?.id || postId),
      title: text(document.getElementById('p_titulo')?.value || post?.titulo || ''),
      date: text(document.getElementById('p_data_publicacao')?.value || post?.data_publicacao || ''),
      format: text(document.getElementById('p_formato')?.value || post?.formato || ''),
      collaboratorId: text(document.getElementById('p_responsavel_id')?.value || post?.responsavel_id || '')
    };
  }

  function driveButtonId(scope, carousel) {
    return `leme_art_${scope}_${carousel ? 'drive_all' : 'drive'}`;
  }

  function refreshDriveButtons() {
    const folder = resolveDriveFolder();
    document.querySelectorAll('[data-leme-drive-button]').forEach(button => {
      const enabled = folder.valid && !driveBusy;
      button.disabled = !enabled;
      button.classList.toggle('is-disabled', !enabled);
      button.title = folder.valid
        ? 'Gerar o arquivo final, baixar e enviar os mesmos bytes para a pasta do Drive.'
        : 'Cadastre um link válido de uma pasta do Google Drive nesta publicação.';
    });
  }

  function makeDriveButton(scope, carousel) {
    const id = driveButtonId(scope, carousel);
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'btn secondary leme-art-drive-button';
    button.dataset.lemeDriveButton = 'true';
    button.innerHTML = carousel ? '☁ Enviar carrossel ao Drive' : '☁ Enviar para Drive';
    button.onclick = () => sendLemeArtToDrive(scope, carousel);
    return button;
  }

  function installDriveButtons() {
    // O envio é vinculado à pasta da publicação, por isso aparece no editor do modal.
    const singleScope = 'modal';
    const singleDownload = document.getElementById(`leme_art_${singleScope}_download`);
    if (singleDownload && !document.getElementById(driveButtonId(singleScope, false))) {
      singleDownload.insertAdjacentElement('afterend', makeDriveButton(singleScope, false));
    }

    const carouselScope = 'modal-carousel';
    const carouselExport = document.getElementById(`leme_art_${carouselScope}_export_all`);
    if (carouselExport && !document.getElementById(driveButtonId(carouselScope, true))) {
      carouselExport.insertAdjacentElement('afterend', makeDriveButton(carouselScope, true));
    }
    refreshDriveButtons();
  }

  function mimeFromName(name = '') {
    const lower = text(name).toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.zip')) return 'application/zip';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  function cleanDriveFileName(value = '') {
    return text(value)
      .replace(/[\\/]+/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220) || 'Arte LEME';
  }

  function swapGlobalFunction(name, replacement) {
    const original = window[name];
    window[name] = replacement;
    try {
      // Os scripts antigos chamam os bindings globais diretamente.
      globalThis[name] = replacement;
    } catch {}
    return () => {
      window[name] = original;
      try { globalThis[name] = original; } catch {}
    };
  }

  async function captureSingleExport(scope) {
    let captured = null;
    const restoreDownload = swapGlobalFunction('downloadLemeArtBlob', (blob, fileName) => {
      if (blob instanceof Blob) captured = { blob, name: cleanDriveFileName(fileName) };
    });

    try {
      await generateAndDownloadLemeArt(scope);
    } finally {
      restoreDownload();
    }

    if (!captured?.blob?.size) throw new Error('Não foi possível gerar o arquivo final da arte.');
    return captured;
  }

  async function captureCarouselExport(scope) {
    const originalZip = window.createLemeArtZip || createLemeArtZip;
    let capturedFiles = [];
    let capturedZip = null;

    const restoreZip = swapGlobalFunction('createLemeArtZip', files => {
      capturedFiles = Array.isArray(files)
        ? files.map(file => ({ name: text(file?.name), data: file?.data }))
        : [];
      return originalZip(files);
    });
    const restoreDownload = swapGlobalFunction('downloadLemeArtBlob', (blob, fileName) => {
      if (blob instanceof Blob) capturedZip = { blob, name: cleanDriveFileName(fileName) };
    });

    try {
      await exportLemeArtCarousel(scope);
    } finally {
      restoreZip();
      restoreDownload();
    }

    if (!capturedFiles.length) throw new Error('Não foi possível gerar os arquivos do carrossel.');

    const files = capturedFiles.map(file => {
      const relativePath = text(file.name);
      const name = cleanDriveFileName(relativePath);
      const bytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data || []);
      return {
        name,
        relativePath,
        blob: new Blob([bytes], { type: mimeFromName(relativePath) })
      };
    }).filter(file => file.blob.size > 0);

    if (!files.length) throw new Error('Os arquivos finais do carrossel ficaram vazios.');
    return { files, zip: capturedZip };
  }

  async function uploadExactBlob(folder, file, index, total) {
    const post = currentPostMeta();
    const body = new FormData();
    body.append('file', file.blob, cleanDriveFileName(file.name));
    body.append('folder_id', folder.id);
    body.append('folder_url', folder.raw);
    body.append('file_name', cleanDriveFileName(file.name));
    body.append('relative_path', text(file.relativePath || file.name));
    body.append('mime_type', text(file.blob.type || mimeFromName(file.name)));
    body.append('file_size', String(file.blob.size));
    body.append('post_id', post.id);
    body.append('post_title', post.title);
    body.append('publication_date', post.date);
    body.append('publication_format', post.format);
    body.append('collaborator_id', post.collaboratorId);
    body.append('source', 'sistema_leme');
    body.append('export_version', VERSION);
    body.append('file_index', String(index + 1));
    body.append('file_total', String(total));

    const response = await fetch(DRIVE_WEBHOOK_URL, {
      method: 'POST',
      body,
      mode: 'cors',
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || `O n8n não conseguiu enviar ${file.name} para o Drive.`);
    }
    return data;
  }

  function setDriveBusy(button, busy, label = '') {
    driveBusy = busy;
    if (button) {
      if (!button.dataset.originalLabel) button.dataset.originalLabel = button.innerHTML;
      button.disabled = busy;
      button.innerHTML = busy ? (label || 'Enviando para o Drive...') : button.dataset.originalLabel;
    }
    refreshDriveButtons();
  }

  async function sendLemeArtToDrive(scope = 'modal', carousel = false) {
    if (driveBusy) return;
    const folder = resolveDriveFolder();
    if (!folder.valid) {
      toast('Cadastre um link válido da pasta do Google Drive antes de enviar a arte.');
      refreshDriveButtons();
      return;
    }

    const button = document.getElementById(driveButtonId(scope, carousel));
    setDriveBusy(button, true, carousel ? 'Gerando carrossel...' : 'Gerando arquivo...');

    try {
      if (!carousel) {
        const capture = await captureSingleExport(scope);
        setDriveBusy(button, true, 'Enviando 1/1...');
        await uploadExactBlob(folder, { ...capture, relativePath: capture.name }, 0, 1);

        // O mesmo Blob que foi enviado ao Drive é entregue ao usuário.
        downloadLemeArtBlob(capture.blob, capture.name);
        toast('Arte baixada e enviada para a pasta do Drive sem recompressão.');
        return;
      }

      const capture = await captureCarouselExport(scope);
      for (let index = 0; index < capture.files.length; index += 1) {
        setDriveBusy(button, true, `Enviando ${index + 1}/${capture.files.length}...`);
        await uploadExactBlob(folder, capture.files[index], index, capture.files.length);
      }

      if (capture.zip?.blob?.size) {
        // O ZIP local é reconstruído pela exportação original. Os arquivos enviados
        // ao Drive são exatamente os mesmos bytes usados dentro dele.
        downloadLemeArtBlob(capture.zip.blob, capture.zip.name);
      }
      toast(`${capture.files.length} arquivos do carrossel enviados ao Drive sem recompressão.`);
    } catch (error) {
      console.error('V112.9: falha ao enviar arte para Drive.', error);
      toast(error?.message || 'Não foi possível enviar a arte para o Drive.');
    } finally {
      setDriveBusy(button, false);
    }
  }

  window.sendLemeArtToDrive = sendLemeArtToDrive;
  window.refreshLemeArtDriveButtons = refreshDriveButtons;

  const initialize0 = window.initializeLemeArtCanvases || initializeLemeArtCanvases;
  initializeLemeArtCanvases = function() {
    const result = initialize0();
    requestAnimationFrame(installDriveButtons);
    return result;
  };
  window.initializeLemeArtCanvases = initializeLemeArtCanvases;

  document.addEventListener('input', event => {
    if (event.target?.id === 'p_drive_folder_url') refreshDriveButtons();
  });
  document.addEventListener('change', event => {
    if (event.target?.id === 'p_drive_folder_url') refreshDriveButtons();
  });

  const style = document.createElement('style');
  style.id = 'leme-v1129-drive-style';
  style.textContent = `
    .leme-art-drive-button{display:inline-flex;align-items:center;justify-content:center;gap:7px}
    .leme-art-drive-button:disabled,.leme-art-drive-button.is-disabled{opacity:.44;cursor:not-allowed;filter:saturate(.35)}
    .leme-art-actions .leme-art-drive-button{min-height:44px}
    .leme-art-carousel-header-actions .leme-art-drive-button{white-space:nowrap}
  `;
  document.head.appendChild(style);

  requestAnimationFrame(installDriveButtons);
  window.__LEME_ART_DRIVE_VERSION__ = VERSION;
})();
