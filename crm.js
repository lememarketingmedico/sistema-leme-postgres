(function () {
  'use strict';

  const CRM_STORAGE = {
    prospects: 'lemeflow_crm_prospects_v1',
    actions: 'lemeflow_crm_actions_v1',
    workspace: 'lemeflow_crm_workspace_v1',
    lastSync: 'lemeflow_crm_last_sync_v1'
  };

  const CRM_STAGES = [
    'Mapeado',
    'Material preparado',
    'Material enviado',
    'Em conversa',
    'Reunião marcada',
    'Proposta enviada',
    'Negociação',
    'Fechado',
    'Perdido'
  ];

  const CRM_TEMPERATURES = ['Frio', 'Morno', 'Quente'];
  const CRM_ACTION_TYPES = [
    'Ideia de conteúdo', 'Carta', 'Lemesaldina', 'Experience LEME',
    'Análise de perfil', 'WhatsApp', 'Ligação', 'E-mail', 'Reunião',
    'Proposta', 'Follow-up', 'Resposta recebida', 'Observação', 'Outro'
  ];
  const CRM_ACTION_STATUSES = ['Planejada', 'Realizada', 'Respondida', 'Cancelada'];

  let crmSyncing = false;
  let crmSyncScheduled = false;
  let crmDraggedProspectId = null;
  let crmPendingAttachmentFile = null;
  let crmReturnProspectId = null;

  function crmLoad(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function crmSave(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function crmWorkspaceId() {
    try {
      return String(typeof activeWorkspaceId !== 'undefined' && activeWorkspaceId ? activeWorkspaceId : 'default');
    } catch {
      return 'default';
    }
  }

  function crmGetWorkspaceState() {
    const all = crmLoad(CRM_STORAGE.workspace, {});
    const key = crmWorkspaceId();
    if (!all[key]) {
      all[key] = { search: '', responsible: '', temperature: '', compact: false };
      crmSave(CRM_STORAGE.workspace, all);
    }
    return all[key];
  }

  function crmPatchWorkspaceState(patch) {
    const all = crmLoad(CRM_STORAGE.workspace, {});
    const key = crmWorkspaceId();
    all[key] = { search: '', responsible: '', temperature: '', compact: false, ...(all[key] || {}), ...patch };
    crmSave(CRM_STORAGE.workspace, all);
  }

  function crmId(value) {
    return String(value?.registro_id || value?.id || value || '');
  }

  function crmNormalizeProspect(row) {
    const id = crmId(row) || crypto.randomUUID();
    return {
      ...row,
      id,
      registro_id: id,
      nome: row?.nome || row?.nome_prospect || 'Prospect sem nome',
      especialidade: row?.especialidade || '',
      cidade: row?.cidade || '',
      clinica: row?.clinica || '',
      instagram: row?.instagram || '',
      whatsapp: row?.whatsapp || '',
      email: row?.email || '',
      responsavel_id: row?.responsavel_id || '',
      origem_lead: row?.origem_lead || '',
      status_funil: CRM_STAGES.includes(row?.status_funil) ? row.status_funil : 'Mapeado',
      temperatura: CRM_TEMPERATURES.includes(row?.temperatura) ? row.temperatura : 'Morno',
      data_ultimo_contato: row?.data_ultimo_contato || '',
      proximo_follow_up: row?.proximo_follow_up || '',
      observacoes: row?.observacoes || '',
      cliente_id_convertido: row?.cliente_id_convertido || '',
      data_conversao: row?.data_conversao || '',
      created_at: row?.created_at || row?.createdAt || new Date().toISOString(),
      updated_at: row?.updated_at || row?.updatedAt || new Date().toISOString()
    };
  }

  function crmNormalizeAction(row) {
    const id = crmId(row) || crypto.randomUUID();
    return {
      ...row,
      id,
      registro_id: id,
      prospect_id: String(row?.prospect_id || ''),
      tipo: row?.tipo || 'Observação',
      titulo: row?.titulo || row?.tipo || 'Ação registrada',
      descricao: row?.descricao || '',
      data_acao: row?.data_acao || new Date().toISOString(),
      status_acao: row?.status_acao || 'Realizada',
      responsavel_id: row?.responsavel_id || '',
      anexo_url: row?.anexo_url || '',
      anexo_nome: row?.anexo_nome || '',
      proximo_follow_up: row?.proximo_follow_up || '',
      created_at: row?.created_at || row?.createdAt || new Date().toISOString(),
      updated_at: row?.updated_at || row?.updatedAt || new Date().toISOString()
    };
  }

  function crmGetProspects() {
    return crmLoad(CRM_STORAGE.prospects, []).map(crmNormalizeProspect);
  }

  function crmSetProspects(list) {
    crmSave(CRM_STORAGE.prospects, (list || []).map(crmNormalizeProspect));
  }

  function crmGetActions() {
    return crmLoad(CRM_STORAGE.actions, []).map(crmNormalizeAction);
  }

  function crmSetActions(list) {
    crmSave(CRM_STORAGE.actions, (list || []).map(crmNormalizeAction));
  }

  function crmEscape(value) {
    return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '');
  }

  function crmAttr(value) {
    return typeof escapeAttr === 'function' ? escapeAttr(value) : crmEscape(value);
  }


  function crmAuthHeaders(extra = {}) {
    try {
      if (typeof window.lemeAuthHeaders === 'function') return window.lemeAuthHeaders(extra);
      if (typeof authHeaders === 'function') return authHeaders(extra);
    } catch {}
    return extra;
  }

  function crmDateKey(value) {
    if (!value) return '';
    try {
      if (typeof formatDate === 'function') return formatDate(value);
    } catch {}
    return String(value).slice(0, 10);
  }

  function crmFormatDate(value) {
    if (!value) return 'Não informado';
    try {
      if (typeof brDate === 'function') return brDate(value);
    } catch {}
    const key = crmDateKey(value);
    const [y, m, d] = key.split('-');
    return d && m && y ? `${d}/${m}/${y}` : String(value);
  }

  function crmFormatDateTime(value) {
    if (!value) return 'Não informado';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return crmFormatDate(value);
    return date.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
  }

  function crmToDateTimeLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function crmInputValue(id) {
    return document.getElementById(id)?.value?.trim?.() || '';
  }

  function crmResponsibleOptions(selected = '') {
    const collaborators = typeof getCollaborators === 'function' ? getCollaborators() : [];
    return `<option value="">Sem responsável</option>${collaborators.map(item => {
      const id = crmId(item);
      return `<option value="${crmAttr(id)}" ${String(selected) === id ? 'selected' : ''}>${crmEscape(item.nome || 'Colaborador')}</option>`;
    }).join('')}`;
  }

  function crmResponsibleName(id) {
    if (!id) return 'Sem responsável';
    const collaborators = typeof getCollaborators === 'function' ? getCollaborators() : [];
    return collaborators.find(item => crmId(item) === String(id))?.nome || 'Sem responsável';
  }

  function crmActionsForProspect(prospectId) {
    return crmGetActions()
      .filter(action => String(action.prospect_id) === String(prospectId))
      .sort((a, b) => new Date(b.data_acao || b.created_at).getTime() - new Date(a.data_acao || a.created_at).getTime());
  }

  function crmLatestAction(prospectId) {
    return crmActionsForProspect(prospectId)[0] || null;
  }

  function crmIsClosed(prospect) {
    return ['Fechado', 'Perdido'].includes(prospect.status_funil);
  }

  function crmIsFollowUpOverdue(prospect) {
    const key = crmDateKey(prospect.proximo_follow_up);
    if (!key || crmIsClosed(prospect)) return false;
    const today = typeof getSaoPauloDateKey === 'function' ? getSaoPauloDateKey() : new Date().toISOString().slice(0, 10);
    return key < today;
  }

  async function crmRequest(settingKey, payload) {
    const settings = typeof getSettings === 'function' ? getSettings() : {};
    if (settings.apiMode !== 'webhook') return { ok: true, skipped: true };
    const url = settings[settingKey];
    if (!url) return { ok: false, error: 'Webhook do CRM não configurado.' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        method: 'POST', headers: crmAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload), signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.message || data?.error || `Webhook respondeu ${response.status}`);
      return { ok: true, ...data };
    } catch (error) {
      console.error('CRM webhook:', error);
      return { ok: false, error: error?.name === 'AbortError' ? 'O n8n demorou para responder.' : (error?.message || String(error)) };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function crmFetchList(settingKey) {
    const settings = typeof getSettings === 'function' ? getSettings() : {};
    const url = settings[settingKey];
    if (!url) return [];
    const response = await fetch(url, {
      method: 'POST', headers: crmAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'sistema_leme_crm' })
    });
    if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
    const data = await response.json().catch(() => ({}));
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }

  function crmDataChanged(a, b) {
    try {
      const clean = value => JSON.stringify((value || []).map(item => ({ ...item, updatedAt: undefined, createdAt: undefined })).sort((x, y) => crmId(x).localeCompare(crmId(y))));
      return clean(a) !== clean(b);
    } catch { return true; }
  }

  async function crmSyncFromN8n(options = {}) {
    if (crmSyncing) return { ok: false, skipped: true };
    const settings = typeof getSettings === 'function' ? getSettings() : {};
    if (settings.apiMode !== 'webhook') return { ok: false, skipped: true };
    crmSyncing = true;
    let changed = false;
    try {
      const [prospectRows, actionRows] = await Promise.all([
        crmFetchList('crmListProspectsWebhook'), crmFetchList('crmListActionsWebhook')
      ]);
      const prospects = prospectRows.map(crmNormalizeProspect);
      const actions = actionRows.map(crmNormalizeAction);
      if (crmDataChanged(crmGetProspects(), prospects)) { crmSetProspects(prospects); changed = true; }
      if (crmDataChanged(crmGetActions(), actions)) { crmSetActions(actions); changed = true; }
      localStorage.setItem(CRM_STORAGE.lastSync, new Date().toISOString());
      if (options.render !== false && changed && typeof state !== 'undefined' && state.view === 'crm') render({ skipAutoSync: true });
      if (!options.silent && typeof toast === 'function') toast('CRM sincronizado com o n8n.');
      return { ok: true, changed };
    } catch (error) {
      console.error(error);
      if (!options.silent && typeof toast === 'function') toast('Não foi possível sincronizar o CRM.');
      return { ok: false, error };
    } finally { crmSyncing = false; }
  }

  function crmScheduleSync() {
    if (crmSyncScheduled) return;
    const last = Date.parse(localStorage.getItem(CRM_STORAGE.lastSync) || 0);
    if (Date.now() - last < 10000) return;
    crmSyncScheduled = true;
    setTimeout(async () => {
      crmSyncScheduled = false;
      if (document.hidden) return;
      await crmSyncFromN8n({ silent: true, render: true });
    }, 180);
  }

  function crmMetric(label, value, hint) {
    return `<div class="card crm-metric-card"><small>${crmEscape(label)}</small><strong>${crmEscape(value)}</strong><span>${crmEscape(hint || '')}</span></div>`;
  }

  function crmRenderPage() {
    crmScheduleSync();
    const workspace = crmGetWorkspaceState();
    const prospects = crmGetProspects();
    const actions = crmGetActions();
    const search = String(workspace.search || '').toLowerCase();
    const filtered = prospects.filter(prospect => {
      if (workspace.responsible && String(prospect.responsavel_id) !== String(workspace.responsible)) return false;
      if (workspace.temperature && prospect.temperatura !== workspace.temperature) return false;
      if (search && ![prospect.nome, prospect.especialidade, prospect.cidade, prospect.clinica, prospect.instagram].join(' ').toLowerCase().includes(search)) return false;
      return true;
    });
    const active = prospects.filter(item => !crmIsClosed(item)).length;
    const countType = type => actions.filter(action => action.tipo === type).length;
    const pendingFollowups = prospects.filter(item => item.proximo_follow_up && !crmIsClosed(item)).length;
    const closed = prospects.filter(item => item.status_funil === 'Fechado').length;
    return `
      <section class="topbar crm-topbar">
        <div><p class="eyebrow">CRM de Prospecção</p><h1>Prospecção LEME</h1><p class="crm-page-description">Acompanhe cada contato, material enviado, resposta e próxima ação comercial.</p></div>
        <div class="crm-top-actions"><button class="btn secondary" onclick="crmSyncFromN8n({silent:false,render:true,force:true})">Sincronizar CRM</button><button class="btn" onclick="crmOpenProspectForm()">Novo prospect</button></div>
      </section>
      <section class="crm-metrics-grid">
        ${crmMetric('Prospects ativos', active, 'Em acompanhamento')}
        ${crmMetric('Cartas enviadas', countType('Carta'), 'Ações registradas')}
        ${crmMetric('Ideias enviadas', countType('Ideia de conteúdo'), 'Materiais preparados')}
        ${crmMetric('Follow-ups pendentes', pendingFollowups, 'Com próxima data')}
        ${crmMetric('Reuniões marcadas', prospects.filter(item => item.status_funil === 'Reunião marcada').length, 'Etapa do funil')}
        ${crmMetric('Propostas enviadas', countType('Proposta'), 'Ações registradas')}
        ${crmMetric('Clientes fechados', closed, 'Convertidos')}
      </section>
      <section class="card crm-toolbar">
        <input class="input" value="${crmAttr(workspace.search || '')}" placeholder="Buscar nome, especialidade, cidade..." oninput="crmSetFilter('search', this.value)">
        <select class="select" onchange="crmSetFilter('responsible', this.value)"><option value="">Todos os responsáveis</option>${crmResponsibleOptions(workspace.responsible).replace('<option value="">Sem responsável</option>', '<option value="">Todos os responsáveis</option><option value="sem-responsavel" '+(workspace.responsible==='sem-responsavel'?'selected':'')+'>Sem responsável</option>')}</select>
        <select class="select" onchange="crmSetFilter('temperature', this.value)"><option value="">Todas as temperaturas</option>${CRM_TEMPERATURES.map(item => `<option ${workspace.temperature===item?'selected':''}>${item}</option>`).join('')}</select>
      </section>
      <section class="crm-kanban" aria-label="Funil comercial">
        ${CRM_STAGES.map(stage => crmRenderColumn(stage, filtered.filter(item => item.status_funil === stage))).join('')}
      </section>`;
  }

  function crmRenderColumn(stage, prospects) {
    return `<div class="crm-kanban-column" data-stage="${crmAttr(stage)}" ondragover="crmAllowDrop(event)" ondragenter="crmDragEnter(event)" ondragleave="crmDragLeave(event)" ondrop="crmDropProspect(event, '${crmAttr(stage)}')"><div class="crm-column-header"><strong>${crmEscape(stage)}</strong><span>${prospects.length}</span></div><div class="crm-column-body">${prospects.map(crmRenderCard).join('') || '<div class="crm-column-empty">Nenhum prospect</div>'}</div></div>`;
  }

  function crmRenderCard(prospect) {
    const latest = crmLatestAction(prospect.id);
    const overdue = crmIsFollowUpOverdue(prospect);
    return `<article class="crm-prospect-card ${overdue ? 'followup-overdue' : ''}" draggable="true" ondragstart="crmDragStart(event, '${crmAttr(prospect.id)}')" ondragend="crmDragEnd(event)" onclick="if(!window.crmDraggingActive) crmOpenProspect('${crmAttr(prospect.id)}')"><div class="crm-card-head"><div><strong>${crmEscape(prospect.nome)}</strong><small>${crmEscape(prospect.especialidade || 'Especialidade não informada')}</small></div><span class="crm-temperature ${prospect.temperatura.toLowerCase()}">${crmEscape(prospect.temperatura)}</span></div><div class="crm-card-location">${crmEscape(prospect.cidade || 'Cidade não informada')} • ${crmEscape(crmResponsibleName(prospect.responsavel_id))}</div><div class="crm-card-action"><small>Última ação</small><strong>${crmEscape(latest?.tipo || 'Nenhuma ação registrada')}</strong></div><div class="crm-card-dates"><span>Último contato: ${crmFormatDate(prospect.data_ultimo_contato)}</span><span class="${overdue ? 'overdue' : ''}">Follow-up: ${crmFormatDate(prospect.proximo_follow_up)}</span></div>${overdue ? '<div class="crm-overdue-label">Follow-up atrasado</div>' : ''}</article>`;
  }

  function crmSetFilter(key, value) { crmPatchWorkspaceState({ [key]: value }); render({ skipAutoSync: true }); }
  function crmAllowDrop(event) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
  function crmDragEnter(event) { event.preventDefault(); event.currentTarget.classList.add('drag-over'); }
  function crmDragLeave(event) { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('drag-over'); }
  function crmDragStart(event, id) { crmDraggedProspectId = String(id); window.crmDraggingActive = true; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', crmDraggedProspectId); event.currentTarget.classList.add('dragging'); }
  function crmDragEnd(event) { event.currentTarget?.classList.remove('dragging'); document.querySelectorAll('.crm-kanban-column.drag-over').forEach(el => el.classList.remove('drag-over')); setTimeout(() => { window.crmDraggingActive = false; }, 60); crmDraggedProspectId = null; }

  async function crmDropProspect(event, stage) {
    event.preventDefault(); event.currentTarget.classList.remove('drag-over');
    const id = String(crmDraggedProspectId || event.dataTransfer.getData('text/plain') || '');
    if (!id) return;
    const list = crmGetProspects(); const index = list.findIndex(item => item.id === id); if (index === -1) return;
    const previous = { ...list[index] }; if (previous.status_funil === stage) return;
    const updated = { ...previous, status_funil: stage, updated_at: new Date().toISOString() };
    list[index] = updated; crmSetProspects(list); render({ skipAutoSync: true });
    const result = await crmRequest('crmUpdateProspectWebhook', { action: 'update_crm_prospect', source: 'sistema_leme_crm', triggered_at: updated.updated_at, prospect: updated });
    if (!result.ok) { const rollback = crmGetProspects(); const pos = rollback.findIndex(item => item.id === id); if (pos !== -1) rollback[pos] = previous; crmSetProspects(rollback); render({ skipAutoSync: true }); toast(result.error || 'O n8n não confirmou a mudança.'); return; }
    await crmSyncFromN8n({ silent: true, render: true });
  }

  function crmOpenProspectForm(id = '') { state.modal = { type: 'crm-prospect-form', prospectId: id || null }; render({ skipAutoSync: true }); }
  function crmOpenProspect(id) { state.modal = { type: 'crm-prospect-view', prospectId: String(id) }; render({ skipAutoSync: true }); }
  function crmOpenActionForm(prospectId, actionId = '', presetType = '') { crmReturnProspectId = String(prospectId); crmPendingAttachmentFile = null; state.modal = { type: 'crm-action-form', prospectId: String(prospectId), actionId: actionId || null, presetType }; render({ skipAutoSync: true }); }
  function crmOpenConvertModal(prospectId) { state.modal = { type: 'crm-convert', prospectId: String(prospectId) }; render({ skipAutoSync: true }); }
  function crmCancelToProspect() { if (crmReturnProspectId) crmOpenProspect(crmReturnProspectId); else closeModal(); }

  function crmRenderModal() {
    if (!state.modal) return '';
    if (state.modal.type === 'crm-prospect-form') return crmRenderProspectForm();
    if (state.modal.type === 'crm-prospect-view') return crmRenderProspectView();
    if (state.modal.type === 'crm-action-form') return crmRenderActionForm();
    if (state.modal.type === 'crm-convert') return crmRenderConvertModal();
    return '';
  }

  function crmModalShell(content, extraClass = '') {
    return `<div class="modal-backdrop" onclick="if(event.target===event.currentTarget) closeModal()"><div class="modal crm-modal ${extraClass}">${content}</div></div>`;
  }

  function crmRenderProspectForm() {
    const editing = state.modal.prospectId ? crmGetProspects().find(item => item.id === state.modal.prospectId) : null;
    const current = typeof currentUser === 'function' ? currentUser() : null;
    const selectedResponsible = editing?.responsavel_id || crmId(current);
    const body = `<div class="modal-header"><div><p class="eyebrow">${editing ? 'Editar prospect' : 'Novo prospect'}</p><h2>${editing ? crmEscape(editing.nome) : 'Cadastrar prospect'}</h2></div><div class="modal-top-actions">${editing ? `<button class="btn danger" onclick="crmDeleteProspect('${crmAttr(editing.id)}')">Excluir</button>` : ''}<button class="btn secondary" onclick="closeModal()">Cancelar</button><button class="btn" onclick="crmSaveProspect('${crmAttr(editing?.id || '')}')">${editing ? 'Salvar' : 'Criar'}</button><button class="close" onclick="closeModal()">×</button></div></div><div class="form-grid crm-form-grid"><label>Nome <input class="input" id="crm_p_nome" value="${crmAttr(editing?.nome || '')}"></label><label>Especialidade <input class="input" id="crm_p_especialidade" value="${crmAttr(editing?.especialidade || '')}"></label><label>Cidade <input class="input" id="crm_p_cidade" value="${crmAttr(editing?.cidade || '')}"></label><label>Clínica <input class="input" id="crm_p_clinica" value="${crmAttr(editing?.clinica || '')}"></label><label>Instagram <input class="input" id="crm_p_instagram" value="${crmAttr(editing?.instagram || '')}"></label><label>WhatsApp <input class="input" id="crm_p_whatsapp" value="${crmAttr(editing?.whatsapp || '')}"></label><label>E-mail <input class="input" type="email" id="crm_p_email" value="${crmAttr(editing?.email || '')}"></label><label>Responsável <select class="select" id="crm_p_responsavel">${crmResponsibleOptions(selectedResponsible)}</select></label><label>Origem do lead <input class="input" id="crm_p_origem" value="${crmAttr(editing?.origem_lead || '')}"></label><label>Status no funil <select class="select" id="crm_p_status">${CRM_STAGES.map(item => `<option ${editing?.status_funil===item?'selected':''}>${item}</option>`).join('')}</select></label><label>Temperatura <select class="select" id="crm_p_temperatura">${CRM_TEMPERATURES.map(item => `<option ${editing?.temperatura===item?'selected':''}>${item}</option>`).join('')}</select></label><label>Último contato <input class="input" type="datetime-local" id="crm_p_ultimo" value="${crmAttr(crmToDateTimeLocal(editing?.data_ultimo_contato))}"></label><label>Próximo follow-up <input class="input" type="datetime-local" id="crm_p_followup" value="${crmAttr(crmToDateTimeLocal(editing?.proximo_follow_up))}"></label><label class="full">Observações gerais <textarea class="textarea" id="crm_p_observacoes">${crmEscape(editing?.observacoes || '')}</textarea></label></div>`;
    return crmModalShell(body, 'crm-form-modal');
  }

  function crmCollectProspect(existing = {}) {
    const now = new Date().toISOString();
    return crmNormalizeProspect({ ...existing, nome: crmInputValue('crm_p_nome'), especialidade: crmInputValue('crm_p_especialidade'), cidade: crmInputValue('crm_p_cidade'), clinica: crmInputValue('crm_p_clinica'), instagram: crmInputValue('crm_p_instagram'), whatsapp: crmInputValue('crm_p_whatsapp'), email: crmInputValue('crm_p_email'), responsavel_id: crmInputValue('crm_p_responsavel'), origem_lead: crmInputValue('crm_p_origem'), status_funil: crmInputValue('crm_p_status') || 'Mapeado', temperatura: crmInputValue('crm_p_temperatura') || 'Morno', data_ultimo_contato: crmInputValue('crm_p_ultimo') ? new Date(crmInputValue('crm_p_ultimo')).toISOString() : '', proximo_follow_up: crmInputValue('crm_p_followup') ? new Date(crmInputValue('crm_p_followup')).toISOString() : '', observacoes: crmInputValue('crm_p_observacoes'), created_at: existing.created_at || now, updated_at: now });
  }

  async function crmSaveProspect(id = '') {
    const list = crmGetProspects(); const index = list.findIndex(item => item.id === String(id));
    const existing = index >= 0 ? list[index] : { id: crypto.randomUUID(), registro_id: crypto.randomUUID() };
    if (index < 0) existing.registro_id = existing.id;
    const prospect = crmCollectProspect(existing);
    if (!prospect.nome) return toast('Informe o nome do prospect.');
    const settingKey = index >= 0 ? 'crmUpdateProspectWebhook' : 'crmCreateProspectWebhook';
    const action = index >= 0 ? 'update_crm_prospect' : 'create_crm_prospect';
    const result = await crmRequest(settingKey, { action, source: 'sistema_leme_crm', triggered_at: prospect.updated_at, prospect });
    if (!result.ok) return toast(result.error || 'Não foi possível salvar o prospect.');
    if (index >= 0) list[index] = prospect; else list.push(prospect);
    crmSetProspects(list); closeModal(); await crmSyncFromN8n({ silent: true, render: true }); toast(index >= 0 ? 'Prospect atualizado.' : 'Prospect criado.');
  }

  async function crmDeleteProspect(id) {
    const prospect = crmGetProspects().find(item => item.id === String(id)); if (!prospect) return;
    if (!confirm(`Excluir o prospect "${prospect.nome}" e todo o histórico de ações?`)) return;
    const result = await crmRequest('crmDeleteProspectWebhook', { action: 'delete_crm_prospect', source: 'sistema_leme_crm', prospect_id: prospect.id, registro_id: prospect.id });
    if (!result.ok) return toast(result.error || 'Não foi possível excluir o prospect.');
    crmSetProspects(crmGetProspects().filter(item => item.id !== prospect.id)); crmSetActions(crmGetActions().filter(item => item.prospect_id !== prospect.id)); closeModal(); toast('Prospect excluído.');
  }

  function crmRenderProspectView() {
    const prospect = crmGetProspects().find(item => item.id === String(state.modal.prospectId));
    if (!prospect) return crmModalShell('<div class="empty">Prospect não encontrado.</div>');
    const actions = crmActionsForProspect(prospect.id);
    const wa = crmWhatsappUrl(prospect.whatsapp);
    const body = `<div class="modal-header"><div><p class="eyebrow">Prospect</p><h2>${crmEscape(prospect.nome)}</h2><small>${crmEscape(prospect.especialidade || '')}${prospect.cidade ? ` • ${crmEscape(prospect.cidade)}` : ''}</small></div><div class="modal-top-actions"><button class="btn secondary" onclick="crmOpenProspectForm('${crmAttr(prospect.id)}')">Editar prospect</button><button class="close" onclick="closeModal()">×</button></div></div><div class="crm-prospect-layout"><aside class="crm-prospect-sidebar"><div class="crm-info-card"><div><small>Status</small><strong>${crmEscape(prospect.status_funil)}</strong></div><div><small>Temperatura</small><span class="crm-temperature ${prospect.temperatura.toLowerCase()}">${crmEscape(prospect.temperatura)}</span></div><div><small>Responsável</small><strong>${crmEscape(crmResponsibleName(prospect.responsavel_id))}</strong></div><div><small>Origem</small><strong>${crmEscape(prospect.origem_lead || 'Não informada')}</strong></div><div><small>WhatsApp</small><strong>${crmEscape(prospect.whatsapp || 'Não informado')}</strong></div><div><small>Instagram</small><strong>${crmEscape(prospect.instagram || 'Não informado')}</strong></div><div><small>Próximo follow-up</small><strong class="${crmIsFollowUpOverdue(prospect)?'crm-text-danger':''}">${crmFormatDateTime(prospect.proximo_follow_up)}</strong></div></div>${prospect.observacoes ? `<div class="crm-observations"><small>Observações gerais</small><p>${crmEscape(prospect.observacoes)}</p></div>` : ''}<div class="crm-prospect-buttons"><button class="btn" onclick="crmOpenActionForm('${crmAttr(prospect.id)}')">Registrar ação</button><button class="btn secondary" ${wa?'':'disabled'} onclick="crmOpenWhatsApp('${crmAttr(prospect.id)}')">Abrir WhatsApp</button><button class="btn secondary" onclick="crmOpenActionForm('${crmAttr(prospect.id)}','','Follow-up')">Agendar follow-up</button><button class="btn secondary" onclick="crmOpenActionForm('${crmAttr(prospect.id)}','','Reunião')">Agendar reunião</button><button class="btn secondary" onclick="crmMarkLost('${crmAttr(prospect.id)}')">Marcar como perdido</button><button class="btn crm-convert-button" onclick="crmOpenConvertModal('${crmAttr(prospect.id)}')">Converter em cliente</button></div></aside><section class="crm-timeline-panel"><div class="section-title"><div><h2>Histórico de prospecção</h2><small>${actions.length} ${actions.length===1?'ação registrada':'ações registradas'}</small></div></div><div class="crm-timeline">${actions.length ? actions.map(crmRenderTimelineAction).join('') : '<div class="empty">Nenhuma ação registrada.</div>'}</div></section></div>`;
    return crmModalShell(body, 'crm-prospect-modal');
  }

  function crmRenderTimelineAction(action) {
    return `<article class="crm-timeline-item"><div class="crm-timeline-dot"></div><div class="crm-timeline-card"><div class="crm-timeline-head"><div><span class="crm-action-type">${crmEscape(action.tipo)}</span><strong>${crmEscape(action.titulo)}</strong></div><time>${crmFormatDateTime(action.data_acao)}</time></div>${action.descricao ? `<p>${crmEscape(action.descricao)}</p>` : ''}<div class="crm-action-meta"><span>${crmEscape(crmResponsibleName(action.responsavel_id))}</span><span>${crmEscape(action.status_acao)}</span>${action.proximo_follow_up ? `<span>Follow-up: ${crmFormatDateTime(action.proximo_follow_up)}</span>` : ''}</div>${action.anexo_url ? `<a class="btn small secondary" target="_blank" rel="noopener noreferrer" href="${crmAttr(action.anexo_url)}">Abrir anexo</a>` : ''}<div class="crm-action-controls"><button class="btn small ghost" onclick="crmOpenActionForm('${crmAttr(action.prospect_id)}','${crmAttr(action.id)}')">Editar</button><button class="btn small danger" onclick="crmDeleteAction('${crmAttr(action.id)}')">Excluir</button></div></div></article>`;
  }

  function crmRenderActionForm() {
    const prospect = crmGetProspects().find(item => item.id === String(state.modal.prospectId));
    const action = state.modal.actionId ? crmGetActions().find(item => item.id === String(state.modal.actionId)) : null;
    const preset = state.modal.presetType || action?.tipo || 'WhatsApp';
    const current = typeof currentUser === 'function' ? currentUser() : null;
    const body = `<div class="modal-header"><div><p class="eyebrow">${action?'Editar ação':'Registrar ação'}</p><h2>${crmEscape(prospect?.nome || 'Prospect')}</h2></div><div class="modal-top-actions">${action?`<button class="btn danger" onclick="crmDeleteAction('${crmAttr(action.id)}')">Excluir</button>`:''}<button class="btn secondary" onclick="crmCancelToProspect()">Cancelar</button><button class="btn" onclick="crmSaveAction('${crmAttr(action?.id || '')}')">Salvar</button><button class="close" onclick="crmCancelToProspect()">×</button></div></div><div class="form-grid crm-form-grid"><label>Tipo <select class="select" id="crm_a_tipo">${CRM_ACTION_TYPES.map(item=>`<option ${preset===item?'selected':''}>${item}</option>`).join('')}</select></label><label>Status <select class="select" id="crm_a_status">${CRM_ACTION_STATUSES.map(item=>`<option ${action?.status_acao===item?'selected':''}>${item}</option>`).join('')}</select></label><label class="full">Título <input class="input" id="crm_a_titulo" value="${crmAttr(action?.titulo || preset)}"></label><label class="full">Descrição <textarea class="textarea" id="crm_a_descricao">${crmEscape(action?.descricao || '')}</textarea></label><label>Data da ação <input class="input" type="datetime-local" id="crm_a_data" value="${crmAttr(crmToDateTimeLocal(action?.data_acao || new Date().toISOString()))}"></label><label>Responsável <select class="select" id="crm_a_responsavel">${crmResponsibleOptions(action?.responsavel_id || crmId(current))}</select></label><label>Próximo follow-up <input class="input" type="datetime-local" id="crm_a_followup" value="${crmAttr(crmToDateTimeLocal(action?.proximo_follow_up))}"></label><label>Link ou anexo já existente <input class="input" id="crm_a_link" value="${crmAttr(action?.anexo_url || '')}"></label><label class="full">Arquivo opcional <input class="input" type="file" id="crm_a_file" onchange="crmSelectAttachment(this)"><small id="crm_a_file_name">${crmEscape(action?.anexo_nome || 'Nenhum arquivo selecionado')}</small></label></div>`;
    return crmModalShell(body, 'crm-form-modal');
  }

  function crmSelectAttachment(input) { crmPendingAttachmentFile = input?.files?.[0] || null; const label=document.getElementById('crm_a_file_name'); if(label) label.textContent=crmPendingAttachmentFile?.name || 'Nenhum arquivo selecionado'; }

  async function crmUploadAttachment(prospectId, actionId) {
    if (!crmPendingAttachmentFile) return { ok: true, url: '', name: '' };
    const settings = getSettings(); const url = settings.crmUploadAttachmentWebhook;
    if (!url) return { ok: false, error: 'Webhook de upload não configurado.' };
    const form = new FormData(); form.append('file', crmPendingAttachmentFile); form.append('prospect_id', prospectId); form.append('action_id', actionId); form.append('nome_arquivo', crmPendingAttachmentFile.name);
    try { const response = await fetch(url,{method:'POST',headers:crmAuthHeaders(),body:form}); const data=await response.json().catch(()=>({})); if(!response.ok||data?.ok===false) throw new Error(data?.message||data?.error||`Upload respondeu ${response.status}`); return {ok:true,url:data.url||data.webViewLink||data.anexo_url||'',name:data.name||data.nome_arquivo||crmPendingAttachmentFile.name}; } catch(error){ return {ok:false,error:error.message||String(error)}; }
  }

  async function crmSaveAction(id = '') {
    const actions=crmGetActions(); const index=actions.findIndex(item=>item.id===String(id)); const existing=index>=0?actions[index]:{id:crypto.randomUUID(),registro_id:''}; if(!existing.registro_id) existing.registro_id=existing.id;
    const prospectId=String(state.modal.prospectId||crmReturnProspectId||existing.prospect_id||''); const now=new Date().toISOString(); const action=crmNormalizeAction({...existing,prospect_id:prospectId,tipo:crmInputValue('crm_a_tipo'),titulo:crmInputValue('crm_a_titulo'),descricao:crmInputValue('crm_a_descricao'),data_acao:crmInputValue('crm_a_data')?new Date(crmInputValue('crm_a_data')).toISOString():now,status_acao:crmInputValue('crm_a_status')||'Realizada',responsavel_id:crmInputValue('crm_a_responsavel'),anexo_url:crmInputValue('crm_a_link'),proximo_follow_up:crmInputValue('crm_a_followup')?new Date(crmInputValue('crm_a_followup')).toISOString():'',created_at:existing.created_at||now,updated_at:now});
    if(!action.titulo) return toast('Informe o título da ação.');
    const upload=await crmUploadAttachment(prospectId,action.id); if(!upload.ok) return toast(upload.error||'Não foi possível enviar o arquivo.'); if(upload.url){action.anexo_url=upload.url;action.anexo_nome=upload.name;}
    const setting=index>=0?'crmUpdateActionWebhook':'crmCreateActionWebhook'; const result=await crmRequest(setting,{action:index>=0?'update_crm_action':'create_crm_action',source:'sistema_leme_crm',triggered_at:now,crm_action:action}); if(!result.ok) return toast(result.error||'Não foi possível salvar a ação.');
    if(index>=0) actions[index]=action; else actions.push(action); crmSetActions(actions); crmPendingAttachmentFile=null;
    const prospects=crmGetProspects(); const pIndex=prospects.findIndex(item=>item.id===prospectId); if(pIndex!==-1){const latest=crmActionsForProspect(prospectId)[0]||action; const updated={...prospects[pIndex],data_ultimo_contato:latest.data_acao||prospects[pIndex].data_ultimo_contato,proximo_follow_up:action.proximo_follow_up||prospects[pIndex].proximo_follow_up,updated_at:now}; prospects[pIndex]=updated; crmSetProspects(prospects); await crmRequest('crmUpdateProspectWebhook',{action:'update_crm_prospect',source:'sistema_leme_crm',triggered_at:now,prospect:updated});}
    crmOpenProspect(prospectId); await crmSyncFromN8n({silent:true,render:true}); toast(index>=0?'Ação atualizada.':'Ação registrada.');
  }

  async function crmDeleteAction(id) {
    const action=crmGetActions().find(item=>item.id===String(id)); if(!action) return; if(!confirm(`Excluir a ação "${action.titulo}"?`)) return;
    const result=await crmRequest('crmDeleteActionWebhook',{action:'delete_crm_action',source:'sistema_leme_crm',registro_id:action.id,prospect_id:action.prospect_id}); if(!result.ok) return toast(result.error||'Não foi possível excluir a ação.');
    crmSetActions(crmGetActions().filter(item=>item.id!==action.id)); crmOpenProspect(action.prospect_id); toast('Ação excluída.');
  }

  function crmWhatsappUrl(phone) { let digits=String(phone||'').replace(/\D/g,''); if(!digits)return''; if(!digits.startsWith('55')&&(digits.length===10||digits.length===11))digits=`55${digits}`; return `https://wa.me/${digits}`; }
  function crmOpenWhatsApp(id) { const prospect=crmGetProspects().find(item=>item.id===String(id)); const url=crmWhatsappUrl(prospect?.whatsapp); if(!url)return toast('WhatsApp não cadastrado.'); window.open(url,'_blank','noopener'); }
  async function crmMarkLost(id) { const list=crmGetProspects(); const index=list.findIndex(item=>item.id===String(id)); if(index===-1)return; const previous={...list[index]}; const updated={...previous,status_funil:'Perdido',updated_at:new Date().toISOString()}; const result=await crmRequest('crmUpdateProspectWebhook',{action:'update_crm_prospect',source:'sistema_leme_crm',triggered_at:updated.updated_at,prospect:updated}); if(!result.ok)return toast(result.error||'Não foi possível atualizar.'); list[index]=updated;crmSetProspects(list);crmOpenProspect(id);toast('Prospect marcado como perdido.'); }

  function crmNormalizeComparable(value) { return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\W+/g,''); }
  function crmFindExistingClient(prospect) { const clients=typeof getClients==='function'?getClients():[]; const phone=String(prospect.whatsapp||'').replace(/\D/g,''); const email=String(prospect.email||'').toLowerCase(); const insta=crmNormalizeComparable(prospect.instagram); return clients.find(client=>{const cphone=String(client.telefone_doutor||'').replace(/\D/g,''); const cemail=String(client.email_google||client.email||'').toLowerCase(); const cinsta=crmNormalizeComparable(client.instagram||client.conta_instagram); return (phone&&cphone&&phone===cphone)||(email&&cemail&&email===cemail)||(insta&&cinsta&&insta===cinsta)||(crmNormalizeComparable(client.nome_cliente)===crmNormalizeComparable(prospect.nome)&&crmNormalizeComparable(client.cidade)===crmNormalizeComparable(prospect.cidade));})||null; }

  function crmRenderConvertModal() {
    const prospect=crmGetProspects().find(item=>item.id===String(state.modal.prospectId)); if(!prospect)return crmModalShell('<div class="empty">Prospect não encontrado.</div>'); const existing=crmFindExistingClient(prospect);
    const body=`<div class="modal-header"><div><p class="eyebrow">Conversão</p><h2>Converter em cliente</h2></div><button class="close" onclick="crmOpenProspect('${crmAttr(prospect.id)}')">×</button></div><div class="crm-convert-summary"><strong>${crmEscape(prospect.nome)}</strong><span>${crmEscape(prospect.especialidade||'')} • ${crmEscape(prospect.cidade||'')}</span>${existing?`<div class="crm-duplicate-alert">Já existe um cliente semelhante: <strong>${crmEscape(existing.nome_cliente)}</strong>. O CRM fará o vínculo sem duplicar.</div>`:''}</div><div class="form-grid"><label>Colaborador responsável <select class="select" id="crm_convert_responsavel">${crmResponsibleOptions(prospect.responsavel_id)}</select></label><label>Status do novo cliente <select class="select" id="crm_convert_status"><option>Ativo</option><option>Prospect</option></select></label><label class="full">Observações iniciais <textarea class="textarea" id="crm_convert_observacoes">Convertido pelo CRM de Prospecção. ${crmEscape(prospect.observacoes||'')}</textarea></label></div><div class="actions"><button class="btn secondary" onclick="crmOpenProspect('${crmAttr(prospect.id)}')">Cancelar</button><button class="btn crm-convert-button" onclick="crmConvertToClient('${crmAttr(prospect.id)}')">Confirmar conversão</button></div>`;
    return crmModalShell(body,'crm-convert-modal');
  }

  async function crmConvertToClient(id) {
    const prospect=crmGetProspects().find(item=>item.id===String(id)); if(!prospect)return; const existing=crmFindExistingClient(prospect); const responsible=crmInputValue('crm_convert_responsavel'); if(!responsible)return toast('Selecione o colaborador responsável.');
    const client={nome_cliente:prospect.nome,especialidade:prospect.especialidade,cidade:prospect.cidade,telefone_doutor:prospect.whatsapp,instagram:prospect.instagram,conta_instagram:prospect.instagram,email_google:prospect.email,responsavel_id:responsible,status:crmInputValue('crm_convert_status')||'Ativo',observacoes:crmInputValue('crm_convert_observacoes'),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const result=await crmRequest('crmConvertClientWebhook',{action:'convert_crm_prospect',source:'sistema_leme_crm',prospect_id:prospect.id,responsavel_id:responsible,existing_client_id:existing?crmId(existing):'',client}); if(!result.ok)return toast(result.error||'Não foi possível converter o prospect.');
    const list=crmGetProspects(); const index=list.findIndex(item=>item.id===prospect.id); const updated={...prospect,status_funil:'Fechado',cliente_id_convertido:result.cliente_id||crmId(existing)||'',data_conversao:new Date().toISOString(),responsavel_id:responsible,updated_at:new Date().toISOString()}; if(index!==-1)list[index]=updated;crmSetProspects(list);closeModal(); if(typeof syncFromN8n==='function')await syncFromN8n({silent:true,render:true}); await crmSyncFromN8n({silent:true,render:true});toast(existing?'Prospect vinculado ao cliente existente.':'Prospect convertido em cliente.');
  }

  window.crmRenderPage=crmRenderPage; window.crmRenderModal=crmRenderModal; window.crmSyncFromN8n=crmSyncFromN8n; window.crmSetFilter=crmSetFilter; window.crmOpenProspectForm=crmOpenProspectForm; window.crmOpenProspect=crmOpenProspect; window.crmOpenActionForm=crmOpenActionForm; window.crmOpenConvertModal=crmOpenConvertModal; window.crmCancelToProspect=crmCancelToProspect; window.crmSaveProspect=crmSaveProspect; window.crmDeleteProspect=crmDeleteProspect; window.crmSaveAction=crmSaveAction; window.crmDeleteAction=crmDeleteAction; window.crmSelectAttachment=crmSelectAttachment; window.crmOpenWhatsApp=crmOpenWhatsApp; window.crmMarkLost=crmMarkLost; window.crmConvertToClient=crmConvertToClient; window.crmAllowDrop=crmAllowDrop; window.crmDragEnter=crmDragEnter; window.crmDragLeave=crmDragLeave; window.crmDragStart=crmDragStart; window.crmDragEnd=crmDragEnd; window.crmDropProspect=crmDropProspect;

  setInterval(()=>{try{if(!document.hidden&&typeof state!=='undefined'&&state.view==='crm')crmSyncFromN8n({silent:true,render:true});}catch{}},30000);
  document.addEventListener('visibilitychange',()=>{try{if(!document.hidden&&typeof state!=='undefined'&&state.view==='crm')crmSyncFromN8n({silent:true,render:true});}catch{}});
  window.addEventListener('focus',()=>{try{if(typeof state!=='undefined'&&state.view==='crm')crmSyncFromN8n({silent:true,render:true});}catch{}});
})();
