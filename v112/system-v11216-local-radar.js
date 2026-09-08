(() => {
  const VERSION = '112.16';
  const LOCAL_RADAR_URL = 'https://maps.lememarketingmedico.com.br/';
  const DEFAULT_GRID_POINTS = '5';

  function esc(value = '') {
    return typeof escapeHtml === 'function'
      ? escapeHtml(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function attr(value = '') {
    return typeof escapeAttr === 'function' ? escapeAttr(String(value ?? '')) : esc(value);
  }

  function radarClientId(client = {}) {
    return String(client.registro_id || client.id || '');
  }

  function radarConfig(client = {}) {
    const pointsRaw = String(client.local_radar_grid_points || client.local_radar_grade || DEFAULT_GRID_POINTS).replace(/[^0-9]/g, '');
    return {
      local: String(client.local_radar_local || client.local_radar_nome_local || ''),
      address: String(client.local_radar_endereco || client.local_radar_address || client.endereco || ''),
      gridKm: String(client.local_radar_grid_km || client.local_radar_distancia_km || ''),
      gridPoints: pointsRaw === '7' ? '7' : '5'
    };
  }

  function configured(client = {}) {
    const cfg = radarConfig(client);
    return Boolean(cfg.address.trim() && Number(cfg.gridKm) > 0 && ['5','7'].includes(cfg.gridPoints));
  }

  function radarConfigSection(client = {}) {
    const cfg = radarConfig(client);
    const id = radarClientId(client);
    return `
      <div class="client-section local-radar-client-section">
        <div class="client-section-title">
          <span>Local Radar GBP</span>
          <small>Configuração usada pelo radar de posicionamento local da LEME.</small>
        </div>
        <div class="client-section-grid local-radar-client-grid">
          <label>Local / unidade
            <input class="input" id="edit_local_radar_local" value="${attr(cfg.local)}" placeholder="Ex: Consultório Araguari" oninput="markClientInfoEditing('${attr(id)}')">
          </label>
          <label class="full">Endereço do ponto central
            <input class="input" id="edit_local_radar_endereco" value="${attr(cfg.address)}" placeholder="Rua, número, bairro, cidade - UF" oninput="markClientInfoEditing('${attr(id)}')">
          </label>
          <label>Tamanho do grid em km
            <input class="input" id="edit_local_radar_grid_km" type="number" min="0.2" max="50" step="0.1" value="${attr(cfg.gridKm)}" placeholder="Ex: 5" oninput="markClientInfoEditing('${attr(id)}')">
          </label>
          <label>Pontos do grid
            <select class="select" id="edit_local_radar_grid_points" onchange="markClientInfoEditing('${attr(id)}')">
              <option value="5" ${cfg.gridPoints === '5' ? 'selected' : ''}>5 × 5 pontos</option>
              <option value="7" ${cfg.gridPoints === '7' ? 'selected' : ''}>7 × 7 pontos</option>
            </select>
          </label>
        </div>
        <div class="local-radar-client-note">
          <span>O tamanho pode variar de <strong>0,2 km a 50 km</strong>. A grade define quantos pontos serão distribuídos na análise.</span>
          <button class="btn secondary small" type="button" onclick="openLocalRadarForClient('${attr(id)}')">Abrir no Local Radar</button>
        </div>
      </div>`;
  }

  // 1) Integra a configuração do Local Radar à ficha dos clientes.
  if (typeof renderClientInfos === 'function') {
    const previousRenderClientInfos = renderClientInfos;
    renderClientInfos = function(client, posts) {
      const html = previousRenderClientInfos(client, posts);
      const section = radarConfigSection(client);
      const marker = '<div class="actions">';
      const index = html.lastIndexOf(marker);
      return index >= 0
        ? `${html.slice(0, index)}${section}${html.slice(index)}`
        : `${html}${section}`;
    };
    window.renderClientInfos = renderClientInfos;
  }

  if (typeof readClientInfoDraftFromForm === 'function') {
    const previousReadClientInfoDraft = readClientInfoDraftFromForm;
    readClientInfoDraftFromForm = function() {
      const draft = previousReadClientInfoDraft();
      const points = document.getElementById('edit_local_radar_grid_points');
      return {
        ...draft,
        local_radar_local: val('edit_local_radar_local'),
        local_radar_endereco: val('edit_local_radar_endereco'),
        local_radar_grid_km: val('edit_local_radar_grid_km'),
        local_radar_grid_points: points?.value || DEFAULT_GRID_POINTS
      };
    };
    window.readClientInfoDraftFromForm = readClientInfoDraftFromForm;
  }

  if (typeof saveClientEdit === 'function') {
    const previousSaveClientEdit = saveClientEdit;
    saveClientEdit = async function(id) {
      const clients = getClients();
      const index = clients.findIndex(client => radarClientId(client) === String(id || ''));
      if (index >= 0 && document.getElementById('edit_local_radar_endereco')) {
        clients[index] = {
          ...clients[index],
          local_radar_local: val('edit_local_radar_local'),
          local_radar_endereco: val('edit_local_radar_endereco'),
          local_radar_grid_km: val('edit_local_radar_grid_km'),
          local_radar_grid_points: document.getElementById('edit_local_radar_grid_points')?.value || DEFAULT_GRID_POINTS
        };
        setClients(clients);
      }
      return previousSaveClientEdit(id);
    };
    window.saveClientEdit = saveClientEdit;
  }

  function internalRadarButton() {
    return `
      <button
        type="button"
        class="sidebar-gbp-link local-radar-sidebar-button ${state.view === 'local-radar' ? 'active' : ''}"
        onclick="go('local-radar')">
        <span>📍</span>
        <strong>GBP LEME</strong>
      </button>`;
  }

  // 2) Mantém o botão exatamente no mesmo local da sidebar, mas transforma
  //    o destino em uma página interna do Sistema LEME.
  if (typeof appShell === 'function') {
    const previousAppShell = appShell;
    appShell = function(content) {
      let html = previousAppShell(content);
      html = html.replace(
        /<a\s+class="sidebar-gbp-link"[\s\S]*?<strong>GBP LEME<\/strong>[\s\S]*?<\/a>/i,
        internalRadarButton()
      );
      return html;
    };
    window.appShell = appShell;
  }

  function activeRadarClients() {
    return getClients()
      .filter(client => String(client.status || 'Ativo') !== 'Encerrado')
      .sort((a, b) => String(a.nome_cliente || '').localeCompare(String(b.nome_cliente || ''), 'pt-BR'));
  }

  function currentRadarClient() {
    const clients = activeRadarClients();
    if (!clients.length) return null;
    const selected = clients.find(client => radarClientId(client) === String(state.localRadarClientId || ''));
    const fallback = selected || clients.find(configured) || clients[0];
    state.localRadarClientId = radarClientId(fallback);
    return fallback;
  }

  function radarEmbedUrl(client) {
    const cfg = radarConfig(client || {});
    const url = new URL(LOCAL_RADAR_URL);
    // Esses parâmetros mantêm a configuração disponível para a versão atual
    // do Radar e para futuras leituras diretas pelo aplicativo, sem alterar
    // o funcionamento caso a versão externa ignore parâmetros desconhecidos.
    url.searchParams.set('embed', '1');
    if (client) {
      url.searchParams.set('cliente_id', radarClientId(client));
      url.searchParams.set('cliente', String(client.nome_cliente || ''));
      if (cfg.local) url.searchParams.set('local', cfg.local);
      if (cfg.address) url.searchParams.set('endereco', cfg.address);
      if (cfg.gridKm) url.searchParams.set('grid_km', cfg.gridKm);
      url.searchParams.set('grid_pontos', `${cfg.gridPoints}x${cfg.gridPoints}`);
    }
    return url.toString();
  }

  function clientRadarOption(client) {
    const id = radarClientId(client);
    return `<option value="${attr(id)}" ${String(state.localRadarClientId || '') === id ? 'selected' : ''}>${esc(client.nome_cliente || 'Cliente')}</option>`;
  }

  function renderLocalRadarPage() {
    const clients = activeRadarClients();
    const client = currentRadarClient();
    const cfg = radarConfig(client || {});
    const configuredCount = clients.filter(configured).length;
    const pendingCount = Math.max(0, clients.length - configuredCount);

    if (!client) {
      return `
        <main class="local-radar-page">
          <div class="local-radar-page-head">
            <div><span class="local-radar-kicker">GBP LEME</span><h1>Local Radar</h1><p>Cadastre um cliente para começar a configurar as análises locais.</p></div>
          </div>
          <section class="card local-radar-empty"><strong>Nenhum cliente disponível.</strong><button class="btn" onclick="go('clientes')">Ir para Clientes</button></section>
        </main>`;
    }

    const isConfigured = configured(client);
    const embedUrl = radarEmbedUrl(client);
    return `
      <main class="local-radar-page">
        <div class="local-radar-page-head">
          <div>
            <span class="local-radar-kicker">GBP LEME</span>
            <h1>Local Radar</h1>
            <p>Radar de posicionamento local integrado ao Sistema LEME.</p>
          </div>
          <div class="local-radar-head-actions">
            <button class="btn secondary" onclick="reloadLocalRadarFrame()">Recarregar radar</button>
            <button class="btn" onclick="editLocalRadarClientInfo('${attr(radarClientId(client))}')">Informações do cliente</button>
          </div>
        </div>

        <section class="local-radar-stats">
          <article><span>Clientes</span><strong>${clients.length}</strong><small>disponíveis no sistema</small></article>
          <article><span>Configurados</span><strong>${configuredCount}</strong><small>prontos para o radar</small></article>
          <article><span>Pendentes</span><strong>${pendingCount}</strong><small>sem endereço/grid completo</small></article>
        </section>

        <section class="card local-radar-config-card">
          <div class="local-radar-config-head">
            <div>
              <span class="field-label">Cliente da análise</span>
              <select class="select" id="local_radar_client_select" onchange="selectLocalRadarClient(this.value)">
                ${clients.map(clientRadarOption).join('')}
              </select>
            </div>
            <span class="local-radar-status ${isConfigured ? 'ready' : 'pending'}">${isConfigured ? '● Configurado' : '● Configuração pendente'}</span>
          </div>

          <div class="local-radar-config-grid">
            <label>Local / unidade
              <input class="input" id="local_radar_local" value="${attr(cfg.local)}" placeholder="Ex: Consultório Araguari">
            </label>
            <label class="wide">Endereço do ponto central
              <input class="input" id="local_radar_endereco" value="${attr(cfg.address)}" placeholder="Rua, número, bairro, cidade - UF">
            </label>
            <label>Tamanho do grid (km)
              <input class="input" id="local_radar_grid_km" type="number" min="0.2" max="50" step="0.1" value="${attr(cfg.gridKm)}" placeholder="Ex: 5">
            </label>
            <label>Pontos
              <select class="select" id="local_radar_grid_points">
                <option value="5" ${cfg.gridPoints === '5' ? 'selected' : ''}>5 × 5</option>
                <option value="7" ${cfg.gridPoints === '7' ? 'selected' : ''}>7 × 7</option>
              </select>
            </label>
            <button class="btn local-radar-save" onclick="saveLocalRadarClientConfig('${attr(radarClientId(client))}')">Salvar configuração</button>
          </div>
          <div class="local-radar-config-foot">
            <span><strong>${esc(client.nome_cliente || '')}</strong>${cfg.address ? ` · ${esc(cfg.address)}` : ''}</span>
            <span>${cfg.gridKm ? `${esc(cfg.gridKm)} km` : 'Grid não definido'} · ${cfg.gridPoints} × ${cfg.gridPoints} pontos</span>
          </div>
        </section>

        <section class="local-radar-workspace">
          <div class="local-radar-workspace-head">
            <div><strong>Radar</strong><small>Mesma ferramenta GBP da LEME, agora dentro do sistema.</small></div>
            <span>${esc(client.nome_cliente || '')}</span>
          </div>
          <div class="local-radar-frame-wrap">
            <iframe
              id="local_radar_frame"
              title="Local Radar GBP LEME"
              src="${attr(embedUrl)}"
              loading="eager"
              referrerpolicy="strict-origin-when-cross-origin"
              allow="geolocation; clipboard-read; clipboard-write; fullscreen"
              allowfullscreen></iframe>
          </div>
        </section>
      </main>`;
  }
  window.renderLocalRadarPage = renderLocalRadarPage;

  window.selectLocalRadarClient = function(clientId) {
    state.localRadarClientId = String(clientId || '');
    render({ skipAutoSync: true });
  };

  window.editLocalRadarClientInfo = function(clientId) {
    state.clientTab = 'infos';
    if (typeof openClient === 'function') {
      openClient(String(clientId || ''), { preserveTab: true });
      return;
    }
    state.selectedClientId = String(clientId || '');
    go('cliente');
  };

  window.openLocalRadarForClient = function(clientId) {
    state.localRadarClientId = String(clientId || '');
    go('local-radar');
  };

  window.reloadLocalRadarFrame = function() {
    const frame = document.getElementById('local_radar_frame');
    if (!frame) return;
    const src = frame.src;
    frame.src = 'about:blank';
    requestAnimationFrame(() => { frame.src = src; });
  };

  window.saveLocalRadarClientConfig = async function(clientId) {
    const id = String(clientId || '');
    const clients = getClients();
    const index = clients.findIndex(client => radarClientId(client) === id);
    if (index < 0) return toast('Cliente não encontrado.');

    const gridKm = String(document.getElementById('local_radar_grid_km')?.value || '').trim();
    const gridNumber = Number(gridKm);
    const gridPoints = document.getElementById('local_radar_grid_points')?.value === '7' ? '7' : '5';
    const address = String(document.getElementById('local_radar_endereco')?.value || '').trim();
    const local = String(document.getElementById('local_radar_local')?.value || '').trim();

    if (!address) return toast('Informe o endereço do ponto central.');
    if (!Number.isFinite(gridNumber) || gridNumber < 0.2 || gridNumber > 50) return toast('O tamanho do grid deve ficar entre 0,2 km e 50 km.');

    const before = { ...clients[index] };
    const now = new Date().toISOString();
    const updated = {
      ...before,
      local_radar_local: local,
      local_radar_endereco: address,
      local_radar_grid_km: gridKm,
      local_radar_grid_points: gridPoints,
      updated_at: now
    };
    clients[index] = updated;
    setClients(clients);
    state.localRadarClientId = id;
    render({ skipAutoSync: true });
    toast('Salvando configuração do Local Radar...');

    try {
      const result = await maybeWebhook('updateClient', {
        action: 'update_client',
        source: 'sistema_leme_local_radar',
        triggered_at: now,
        client: updated
      });
      if (!result?.ok) throw new Error(result?.error || 'Não foi possível salvar o cliente.');
      toast('Configuração do Local Radar salva.');
      render({ skipAutoSync: true });
    } catch (error) {
      const rollback = getClients();
      const rollbackIndex = rollback.findIndex(client => radarClientId(client) === id);
      if (rollbackIndex >= 0) {
        rollback[rollbackIndex] = before;
        setClients(rollback);
      }
      render({ skipAutoSync: true });
      toast(error.message || 'Não foi possível salvar a configuração do Local Radar.');
    }
  };

  // 3) Render próprio para a nova rota interna, sem abrir nova aba/página.
  if (typeof render === 'function') {
    const previousRender = render;
    render = function(options = {}) {
      if (state.view !== 'local-radar') return previousRender(options);

      try { saveActiveWorkspaceState?.(); } catch {}
      const root = document.getElementById('app');
      if (!root) return;
      root.innerHTML = appShell(renderLocalRadarPage()) + renderModal() + renderCalendarPostContextMenu();
      try { applyTheme(); } catch {}
      try { initAutoGrowTextareas(); } catch {}
      try { initializeLemeArtCanvases(); } catch {}
      try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch { window.scrollTo(0, 0); }
    };
    window.render = render;
  }

  const style = document.createElement('style');
  style.id = 'leme-local-radar-v11216-style';
  style.textContent = `
    .sidebar-gbp-link.local-radar-sidebar-button{width:100%;border:0;cursor:pointer;text-align:left;font:inherit}
    .sidebar-gbp-link.local-radar-sidebar-button.active{background:linear-gradient(135deg,rgba(82,164,213,.22),rgba(82,164,213,.08));border-color:rgba(82,164,213,.55);box-shadow:inset 3px 0 0 #52a4d5}
    .local-radar-page{display:grid;gap:18px;min-width:0}
    .local-radar-page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
    .local-radar-page-head h1{margin:3px 0 5px;font-size:clamp(28px,3vw,42px);line-height:1.05}
    .local-radar-page-head p{margin:0;color:var(--muted,#93a7b5)}
    .local-radar-kicker{display:inline-flex;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#52a4d5}
    .local-radar-head-actions{display:flex;gap:10px;flex-wrap:wrap}
    .local-radar-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .local-radar-stats article{padding:16px 18px;border:1px solid rgba(118,150,171,.18);border-radius:16px;background:linear-gradient(145deg,rgba(15,34,49,.92),rgba(20,45,63,.78));display:grid;gap:3px}
    .local-radar-stats span,.local-radar-stats small{color:#91a7b6}.local-radar-stats strong{font-size:28px;color:#f4f7f9}
    .local-radar-config-card{display:grid;gap:14px}
    .local-radar-config-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .local-radar-config-head>div{min-width:min(100%,340px);display:grid;gap:7px}
    .local-radar-status{border:1px solid;padding:8px 11px;border-radius:999px;font-size:12px;font-weight:700}.local-radar-status.ready{color:#85e6b6;border-color:rgba(60,190,120,.36);background:rgba(28,132,84,.12)}.local-radar-status.pending{color:#f5c96f;border-color:rgba(234,176,66,.34);background:rgba(176,120,25,.12)}
    .local-radar-config-grid{display:grid;grid-template-columns:1fr 1.5fr .7fr .65fr auto;gap:12px;align-items:end}.local-radar-config-grid label{display:grid;gap:7px}.local-radar-config-grid .wide{min-width:0}.local-radar-save{height:44px;white-space:nowrap}
    .local-radar-config-foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:12px;border-top:1px solid rgba(140,166,185,.13);font-size:12px;color:#93a7b5}
    .local-radar-workspace{overflow:hidden;border:1px solid rgba(82,164,213,.23);border-radius:20px;background:#091925;box-shadow:0 18px 50px rgba(0,0,0,.22)}
    .local-radar-workspace-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid rgba(140,166,185,.14);background:#0d2231}.local-radar-workspace-head>div{display:flex;align-items:baseline;gap:10px}.local-radar-workspace-head small,.local-radar-workspace-head>span{color:#91a7b6;font-size:12px}
    .local-radar-frame-wrap{height:clamp(720px,calc(100vh - 230px),1100px);background:#0b1e2b}.local-radar-frame-wrap iframe{display:block;width:100%;height:100%;border:0;background:#0b1e2b}
    .local-radar-client-note{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:12px;padding:12px 14px;border-radius:13px;background:rgba(82,164,213,.06);border:1px solid rgba(82,164,213,.13);font-size:12px;color:#93a7b5}
    .local-radar-empty{display:flex;align-items:center;justify-content:space-between;gap:15px}
    @media(max-width:1200px){.local-radar-config-grid{grid-template-columns:1fr 1fr}.local-radar-config-grid .wide{grid-column:span 2}.local-radar-save{width:100%}}
    @media(max-width:760px){.local-radar-stats{grid-template-columns:1fr}.local-radar-config-grid{grid-template-columns:1fr}.local-radar-config-grid .wide{grid-column:auto}.local-radar-frame-wrap{height:75vh;min-height:620px}.local-radar-workspace-head{align-items:flex-start;flex-direction:column}.local-radar-workspace-head>div{display:grid;gap:3px}}
  `;
  document.head.appendChild(style);

  window.__LEME_LOCAL_RADAR_VERSION__ = VERSION;
})();
