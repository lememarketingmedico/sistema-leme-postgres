function renderPostModal() {
  const editing = state.modal.postId
    ? getPosts().find(post =>
        String(post.registro_id || post.id || '') === String(state.modal.postId || '')
      )
    : null;
  const preClientId = editing?.cliente_id || state.modal.clientId || state.selectedClientId || '';
  const isLemePost = String(preClientId || '') === LEME_CLIENT_ID;
  if (isLemePost) prepareLemeArtModalDraft(editing);
  const client = getCalendarClientById(preClientId);
  const sessionCollaboratorId = String(currentUser()?.registro_id || currentUser()?.id || getSession()?.collaboratorId || '');
  const preResp = editing?.responsavel_id || (isLemePost ? sessionCollaboratorId : (client?.responsavel_id || ''));
  const preDate = formatDate(editing?.data_publicacao || state.modal.date || getSaoPauloNow());
  const selectedFormat = editing?.formato || FORMATS[0];
  const selectedStatus = normalizeSystemStatus(editing?.status || STATUS[0]);
  const navigation = getPostModalNavigation(editing);
  return `
    <div
      class="modal-backdrop"
      onclick="handleModalBackdropClick(event)">
      <div class="post-modal-shell">
      ${editing ? `
        <button
          class="post-modal-nav previous"
          type="button"
          aria-label="Publicação anterior"
          title="Publicação anterior"
          ${navigation.previous ? '' : 'disabled'}
          onclick="navigatePostModal(-1)">‹</button>
      ` : '<span class="post-modal-nav-spacer" aria-hidden="true"></span>'}
      <div class="modal post-modal">
      <div class="modal-header">
        <div>
          <p class="eyebrow">${editing ? 'Editar publicação' : 'Nova publicação'}</p>
          <h2>${editing ? escapeHtml(editing.titulo) : 'Criar publicação'}</h2>
          ${editing && navigation.total > 1 ? `<small class="post-modal-position">${navigation.position} de ${navigation.total} publicações deste calendário</small>` : ''}
        </div>
        <div class="modal-top-actions">
          ${editing ? `<button class="btn danger" onclick="deletePost('${editing.id}')">Excluir</button>` : ''}
          <button class="btn secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn" onclick="${editing ? `updatePost('${editing.id}')` : 'createPost()'}">${editing ? 'Salvar' : 'Criar'}</button>
          <button class="close" onclick="closeModal()">×</button>
        </div>
      </div>
      <div class="form-grid">
        ${isLemePost
          ? `<label>Calendário <input class="input" value="LEME" readonly><input type="hidden" id="p_cliente_id" value="${LEME_CLIENT_ID}"></label>`
          : `<label>Cliente <select class="select" id="p_cliente_id" onchange="syncResponsibleFromClient()"><option value="">Selecione</option>${getClients().map(c => `<option value="${c.id}" ${preClientId===c.id?'selected':''}>${escapeHtml(c.nome_cliente)}</option>`).join('')}</select></label>`}
        <label>Data de publicação <input class="input" type="date" id="p_data_publicacao" value="${escapeAttr(preDate)}"></label>
        <label class="full">Título <textarea class="textarea post-title-textarea" id="p_titulo" rows="2" oninput="autoGrowTextarea(this); syncLemeArtTextFromPostTitle(this.value)">${escapeHtml(editing?.titulo || '')}</textarea></label>
        <label>Link da pasta no Drive <input class="input" id="p_drive_folder_url" value="${escapeAttr(editing?.drive_folder_url || '')}" placeholder="Cole o link da pasta ou deixe o n8n preencher"></label>
        <label>Formato <select class="select post-visual-select post-format-select ${postFormatClass(selectedFormat)}" id="p_formato" onchange="handlePostFormatChange(this)">${FORMATS.map(f => `<option value="${escapeAttr(f)}" ${selectedFormat===f?'selected':''}>${escapeHtml(f)}</option>`).join('')}</select></label>
        <label>Status <select class="select post-visual-select post-status-select ${calendarStatusClass(selectedStatus)}" id="p_status" onchange="updatePostVisualSelect(this, 'status')">${STATUS.map(s => `<option value="${escapeAttr(s)}" ${selectedStatus===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select></label>
        <label>${isLemePost ? 'Colaborador' : 'Responsável'} <select class="select" id="p_responsavel_id">${collaboratorOptions(preResp)}</select></label>
        ${editing?.drive_folder_url
          ? `<label>Abrir pasta
              <button
                class="btn drive-open-btn active"
                type="button"
                onclick="openDriveLink('${escapeAttr(editing.drive_folder_url)}', event)">
                Abrir no Drive
              </button>
            </label>`
          : `<label>Criar pasta no Drive
              <button
                type="button"
                class="btn secondary"
                onclick="event.preventDefault(); createDriveForPost('${editing?.id || ''}')">
                Acionar n8n
              </button>
            </label>`}
        ${editing ? renderPostPromptActions(editing) : `<div class="full prompt-helper-box"><strong>Prompts do ChatGPT</strong><small>Crie a publicação primeiro para copiar um prompt com as variáveis da demanda.</small></div>`}
        ${isLemePost ? renderLemePostArtGenerator(selectedFormat) : ''}
        <label class="full">Legenda <textarea class="textarea" id="p_legenda">${escapeHtml(editing?.legenda || '')}</textarea></label>
      </div>
    </div>
      ${editing ? `
        <button
          class="post-modal-nav next"
          type="button"
          aria-label="Próxima publicação"
          title="Próxima publicação"
          ${navigation.next ? '' : 'disabled'}
          onclick="navigatePostModal(1)">›</button>
      ` : '<span class="post-modal-nav-spacer" aria-hidden="true"></span>'}
    </div></div>
  `;
}

function updatePostVisualSelect(select, kind) {
  if (!select) return;

  const formatClasses = ['format-post-unico', 'format-carrossel', 'format-reels', 'format-stories', 'format-outro'];
  const statusClasses = ['status-ideia', 'status-em-andamento', 'status-concluidos', 'status-publicado'];

  select.classList.remove(...formatClasses, ...statusClasses);
  select.classList.add(
    kind === 'status'
      ? calendarStatusClass(select.value)
      : postFormatClass(select.value)
  );
}

function handlePostFormatChange(select) {
  updatePostVisualSelect(select, 'format');
  if (String(val('p_cliente_id') || '') !== LEME_CLIENT_ID) return;

  if (String(select?.value || '').toLowerCase() === 'carrossel') {
    const carousel = getLemeArtCarousel('modal-carousel');
    const firstSlide = carousel.slides[0];
    if (carousel.slides.length === 1 && firstSlide && !normalizeLemeArtText(firstSlide.text)) {
      firstSlide.text = String(val('p_titulo') || '');
      firstSlide.textCustomized = false;
    }
  }

  const generator = document.getElementById('leme_post_art_generator');
  if (!generator) return;
  generator.outerHTML = renderLemePostArtGenerator(select?.value || '');
  initializeLemeArtCanvases();
}

function syncResponsibleFromClient() {
  const clientId = val('p_cliente_id');
  const client = getClients().find(c => c.id === clientId);
  const responsibleSelect = document.getElementById('p_responsavel_id');
  if (client && responsibleSelect) responsibleSelect.value = client.responsavel_id || '';
}
function collectPost() {
  const captionInput = document.getElementById('p_legenda');
  const clientId = val('p_cliente_id');
  const isLemePost = String(clientId || '') === LEME_CLIENT_ID;
  const artDraft = isLemePost ? getLemeArtDraft('modal') : null;
  const isCarouselArt = isLemePost && String(val('p_formato') || '').toLowerCase() === 'carrossel';

  return {
    cliente_id: clientId,
    titulo: val('p_titulo'),
    tema: val('p_tema'),
    formato: val('p_formato'),
    data_publicacao: val('p_data_publicacao'),
    status: val('p_status'),
    responsavel_id: val('p_responsavel_id'),
    texto_carrossel: val('p_texto_carrossel'),
    legenda: captionInput?.value || '',
    observacoes: val('p_observacoes'),
    drive_folder_url: val('p_drive_folder_url'),
    ...(isLemePost ? {
      arte_tipo: isCarouselArt ? 'carousel' : 'static',
      arte_modelo: normalizeLemeArtTemplate(artDraft?.template),
      arte_formato: normalizeLemeArtFormat(artDraft?.format),
      arte_escala_fonte: normalizeLemeArtFontScale(artDraft?.fontScale),
      arte_texto: normalizeLemeArtText(artDraft?.text),
      arte_slides: serializeLemeArtCarouselSlides('modal-carousel')
    } : {})
  };
}
