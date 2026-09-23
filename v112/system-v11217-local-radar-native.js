(() => {
  const VERSION = '112.22';
  const cache = {
    clients: [],
    clientsLoaded: false,
    loadingClients: false,
    configs: new Map(),
    scans: new Map(),
    reports: new Map(),
    loadingInfo: new Set(),
    selectedClientId: '',
    activeTab: 'clients',
    currentScan: null,
    quickPlaces: [],
    clientPlaces: new Map(),
    maps: new Map(),
    mapLibPromise: null,
    scanProgress: null,
    busy: false
  };

  const e = (v='') => typeof escapeHtml === 'function' ? escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const a = (v='') => typeof escapeAttr === 'function' ? escapeAttr(String(v ?? '')) : e(v);
  const clientIdOf = c => String(c?.registro_id || c?.id || '');
  const fmtDate = value => {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }); } catch { return String(value); }
  };
  const rankClass = pos => !pos ? 'nf' : pos <= 3 ? 'top3' : pos <= 10 ? 'top10' : 'low';

  async function api(path, options = {}) {
    if (typeof fetchApiJson === 'function') return fetchApiJson(path, options);
    const response = await fetch(path, { credentials:'same-origin', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Erro no Local Radar.');
    return data;
  }

  function notify(message) {
    if (typeof toast === 'function') toast(message);
    else console.log(message);
  }


  function mapNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  async function loadRadarMapLibrary() {
    if (window.maplibregl?.Map) return window.maplibregl;
    if (cache.mapLibPromise) return cache.mapLibPromise;

    cache.mapLibPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-leme-maplibre="1"]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
        css.dataset.lemeMaplibre = '1';
        document.head.appendChild(css);
      }

      const existing = document.querySelector('script[data-leme-maplibre="1"]');
      if (existing) {
        if (window.maplibregl?.Map) return resolve(window.maplibregl);
        existing.addEventListener('load', () => resolve(window.maplibregl), { once:true });
        existing.addEventListener('error', () => reject(new Error('Não foi possível carregar a biblioteca do mapa.')), { once:true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.dataset.lemeMaplibre = '1';
      script.async = true;
      script.onload = () => {
        if (window.maplibregl?.Map) resolve(window.maplibregl);
        else reject(new Error('A biblioteca do mapa não inicializou corretamente.'));
      };
      script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca do mapa.'));
      document.head.appendChild(script);
    });

    try {
      return await cache.mapLibPromise;
    } catch (error) {
      cache.mapLibPromise = null;
      throw error;
    }
  }

  function previewGridPoints(centerLat, centerLng, gridSize, radiusKm) {
    const grid = [3,5,7].includes(Number(gridSize)) ? Number(gridSize) : 5;
    const radius = Math.min(50, Math.max(0.2, Number(String(radiusKm || 3).replace(',', '.')) || 3));
    const centerIndex = Math.floor(grid / 2);
    const stepKm = grid === 1 ? 0 : (radius * 2) / (grid - 1);
    const points = [];
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        const northKm = (centerIndex - row) * stepKm;
        const eastKm = (col - centerIndex) * stepKm;
        const lat = centerLat + (northKm / 111.32);
        const lng = centerLng + (eastKm / (111.32 * Math.cos(centerLat * Math.PI / 180)));
        points.push({ row, col, lat, lng });
      }
    }
    return points;
  }

  function mapStyle() {
    // V112.21: usa o serviço público oficial do OpenFreeMap.
    // Não acessa mais tile.openstreetmap.org diretamente, evitando bloqueios
    // da política dos servidores comunitários do OpenStreetMap.
    return 'https://tiles.openfreemap.org/styles/liberty';
  }

  function markerElement(className, inner = '') {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = inner;
    return el;
  }

  function destroyRadarMaps() {
    for (const mapState of cache.maps.values()) {
      try { mapState.centerMarker?.remove(); } catch {}
      try { mapState.profileMarker?.remove(); } catch {}
      try { mapState.map?.remove(); } catch {}
    }
    cache.maps.clear();
  }

  function gridGeoJson(points, gridSize) {
    const lineFeatures = [];
    for (let row = 0; row < gridSize; row++) {
      lineFeatures.push({
        type:'Feature',
        properties:{},
        geometry:{ type:'LineString', coordinates:points.filter(p=>p.row===row).map(p=>[p.lng,p.lat]) }
      });
    }
    for (let col = 0; col < gridSize; col++) {
      lineFeatures.push({
        type:'Feature',
        properties:{},
        geometry:{ type:'LineString', coordinates:points.filter(p=>p.col===col).map(p=>[p.lng,p.lat]) }
      });
    }
    return {
      lines:{ type:'FeatureCollection', features:lineFeatures },
      points:{
        type:'FeatureCollection',
        features:points.map(p=>({ type:'Feature',properties:{row:p.row,col:p.col},geometry:{type:'Point',coordinates:[p.lng,p.lat]} }))
      }
    };
  }

  function refreshRadarMapGrid(mapState, fit = false) {
    if (!mapState?.map || !window.maplibregl) return;

    const latInput = document.getElementById(mapState.latId);
    const lngInput = document.getElementById(mapState.lngId);
    const radiusInput = document.getElementById(mapState.radiusId);
    const gridInput = document.getElementById(mapState.gridId);
    const profileLatInput = document.getElementById(mapState.profileLatId);
    const profileLngInput = document.getElementById(mapState.profileLngId);
    const lat = mapNumber(latInput?.value);
    const lng = mapNumber(lngInput?.value);
    if (lat === null || lng === null) return;

    const gridSize = Number(gridInput?.value || 5);
    const radiusKm = Number(String(radiusInput?.value || 3).replace(',', '.')) || 3;
    const points = previewGridPoints(lat, lng, gridSize, radiusKm);
    const geo = gridGeoJson(points, gridSize);

    mapState.centerMarker.setLngLat([lng,lat]);

    const pLat = mapNumber(profileLatInput?.value);
    const pLng = mapNumber(profileLngInput?.value);
    if (pLat !== null && pLng !== null) {
      if (!mapState.profileMarker) {
        mapState.profileMarker = new maplibregl.Marker({
          element: markerElement('lr-map-profile-marker')
        }).setLngLat([pLng,pLat]).setPopup(new maplibregl.Popup({offset:14}).setText('Local real do perfil do Google')).addTo(mapState.map);
      } else {
        mapState.profileMarker.setLngLat([pLng,pLat]);
      }
    } else if (mapState.profileMarker) {
      mapState.profileMarker.remove();
      mapState.profileMarker = null;
    }

    const applySources = () => {
      const lineSource = mapState.map.getSource('leme-grid-lines');
      const pointSource = mapState.map.getSource('leme-grid-points');
      if (lineSource && pointSource) {
        lineSource.setData(geo.lines);
        pointSource.setData(geo.points);
        return true;
      }
      if (!mapState.map.isStyleLoaded()) return false;

      mapState.map.addSource('leme-grid-lines',{ type:'geojson', data:geo.lines });
      mapState.map.addLayer({
        id:'leme-grid-lines-layer',
        type:'line',
        source:'leme-grid-lines',
        paint:{ 'line-color':'#4ba3d3','line-width':2,'line-opacity':0.68 }
      });
      mapState.map.addSource('leme-grid-points',{ type:'geojson', data:geo.points });
      mapState.map.addLayer({
        id:'leme-grid-points-layer',
        type:'circle',
        source:'leme-grid-points',
        paint:{
          'circle-radius':7,
          'circle-color':'#718999',
          'circle-opacity':0.96,
          'circle-stroke-color':'#ffffff',
          'circle-stroke-width':2
        }
      });
      return true;
    };

    if (!applySources()) {
      mapState.map.once('load', () => {
        try { applySources(); } catch (error) { console.error('Local Radar grid:', error); }
      });
    }

    const label = document.getElementById(mapState.labelId);
    if (label) label.textContent = lat.toFixed(6) + ', ' + lng.toFixed(6) + ' · ' + gridSize + '×' + gridSize + ' · ' + radiusKm + ' km';

    if (fit && points.length) {
      const bounds = new maplibregl.LngLatBounds();
      points.forEach(point => bounds.extend([point.lng,point.lat]));
      if (pLat !== null && pLng !== null) bounds.extend([pLng,pLat]);
      if (!bounds.isEmpty()) {
        mapState.map.fitBounds(bounds,{ padding:70,maxZoom:15,duration:0 });
      }
    }
  }

  async function initAdjustMap(options) {
    const host = document.getElementById(options.mapId);
    if (!host) return;

    const lat = mapNumber(document.getElementById(options.latId)?.value);
    const lng = mapNumber(document.getElementById(options.lngId)?.value);
    if (lat === null || lng === null) {
      host.innerHTML = '<div class="lr-map-message"><strong>Localize o endereço primeiro</strong><span>Depois o mapa aparecerá aqui para você posicionar o grid visualmente.</span></div>';
      return;
    }

    try {
      await loadRadarMapLibrary();
      if (!document.body.contains(host)) return;

      const previous = cache.maps.get(options.key);
      if (previous) {
        try { previous.centerMarker?.remove(); } catch {}
        try { previous.profileMarker?.remove(); } catch {}
        try { previous.map?.remove(); } catch {}
        cache.maps.delete(options.key);
      }

      host.innerHTML = '';

      const map = new maplibregl.Map({
        container:host,
        style:mapStyle(),
        center:[lng,lat],
        zoom:13,
        attributionControl:true
      });
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');

      const centerEl = markerElement('lr-map-center-marker','<span>+</span>');
      const centerMarker = new maplibregl.Marker({ element:centerEl, draggable:true })
        .setLngLat([lng,lat])
        .setPopup(new maplibregl.Popup({offset:18}).setText('Centro do grid — arraste para ajustar'))
        .addTo(map);

      const mapState = {
        key:options.key,
        map,
        centerMarker,
        profileMarker:null,
        latId:options.latId,
        lngId:options.lngId,
        radiusId:options.radiusId,
        gridId:options.gridId,
        profileLatId:options.profileLatId,
        profileLngId:options.profileLngId,
        labelId:options.labelId
      };
      cache.maps.set(options.key,mapState);

      function setCenter(nextLat,nextLng,fit=false) {
        const latEl=document.getElementById(options.latId);
        const lngEl=document.getElementById(options.lngId);
        if(latEl) latEl.value=Number(nextLat).toFixed(7);
        if(lngEl) lngEl.value=Number(nextLng).toFixed(7);
        refreshRadarMapGrid(mapState,fit);
      }

      centerMarker.on('drag', () => {
        const pos=centerMarker.getLngLat();
        setCenter(pos.lat,pos.lng,false);
      });

      centerMarker.on('dragend', () => {
        const pos=centerMarker.getLngLat();
        setCenter(pos.lat,pos.lng,false);
        notify('Centro ajustado no mapa. Clique em salvar para manter essa posição.');
      });

      map.on('click', event => {
        setCenter(event.lngLat.lat,event.lngLat.lng,false);
        notify('Centro movido para o ponto clicado. Clique em salvar para manter essa posição.');
      });

      const radiusEl=document.getElementById(options.radiusId);
      const gridEl=document.getElementById(options.gridId);
      radiusEl?.addEventListener('input',()=>refreshRadarMapGrid(mapState,true));
      gridEl?.addEventListener('change',()=>refreshRadarMapGrid(mapState,true));

      map.on('load',()=>refreshRadarMapGrid(mapState,true));
      setTimeout(()=>{ try { map.resize(); } catch {} },120);
    } catch (err) {
      console.error('Local Radar map:',err);
      host.innerHTML = '<div class="lr-map-message"><strong>Mapa indisponível</strong><span>'+e(err.message || 'Não foi possível carregar o mapa.')+'</span></div>';
    }
  }

  function initVisibleRadarMaps() {
    if (state.view === 'local-radar' && cache.activeTab === 'clients') {
      initAdjustMap({
        key:'main', mapId:'lr_main_map', latId:'lr_lat', lngId:'lr_lng', radiusId:'lr_radius', gridId:'lr_grid',
        profileLatId:'lr_profile_lat', profileLngId:'lr_profile_lng', labelId:'lr_main_map_label'
      });
    }
    if (state.view === 'cliente' && state.clientTab === 'infos') {
      initAdjustMap({
        key:'info', mapId:'lr_info_map', latId:'lr_info_lat', lngId:'lr_info_lng', radiusId:'lr_info_radius', gridId:'lr_info_grid',
        profileLatId:'lr_info_profile_lat', profileLngId:'lr_info_profile_lng', labelId:'lr_info_map_label'
      });
    }
  }

  function refreshVisibleRadarMaps() {
    destroyRadarMaps();
    setTimeout(initVisibleRadarMaps, 40);
  }

  async function loadClients(force = false) {
    if (cache.loadingClients || (cache.clientsLoaded && !force)) return cache.clients;
    cache.loadingClients = true;
    try {
      const data = await api('/api/local-radar/clients');
      cache.clients = data.clients || [];
      cache.clientsLoaded = true;
      if (!cache.selectedClientId && cache.clients.length) {
        cache.selectedClientId = (cache.clients.find(c => c.configured) || cache.clients[0]).id;
      }
      return cache.clients;
    } finally {
      cache.loadingClients = false;
    }
  }

  async function loadClientBundle(clientId, force = false) {
    const id = String(clientId || '');
    if (!id) return null;
    if (!force && cache.configs.has(id) && cache.scans.has(id) && cache.reports.has(id)) {
      return { config: cache.configs.get(id), scans: cache.scans.get(id), reports: cache.reports.get(id) };
    }
    const [cfg, scans, reports] = await Promise.all([
      api('/api/local-radar/config/' + encodeURIComponent(id)),
      api('/api/local-radar/scans?client_id=' + encodeURIComponent(id)),
      api('/api/local-radar/reports?client_id=' + encodeURIComponent(id))
    ]);
    cache.configs.set(id, cfg.config || {});
    cache.scans.set(id, scans.scans || []);
    cache.reports.set(id, reports.reports || []);
    return { config: cfg.config || {}, scans: scans.scans || [], reports: reports.reports || [] };
  }

  function scheduleInfoLoad(clientId) {
    const id = String(clientId || '');
    if (!id || cache.loadingInfo.has(id) || cache.configs.has(id)) return;
    cache.loadingInfo.add(id);
    setTimeout(async () => {
      try {
        await loadClientBundle(id);
        if (state.view === 'cliente' && String(state.selectedClientId || '') === id && state.clientTab === 'infos') {
          render({ skipAutoSync:true });
        }
      } catch (err) {
        console.error(err);
      } finally {
        cache.loadingInfo.delete(id);
      }
    }, 0);
  }

  function summaryCards(scan) {
    const s = scan?.summary || {};
    return `
      <div class="lr-summary">
        <article><span>Posição média</span><strong>${s.averagePosition ?? '—'}</strong><small>nos pontos encontrados</small></article>
        <article><span>Top 3</span><strong>${s.top3Percent ?? 0}%</strong><small>${s.foundPoints ?? 0} pontos encontrados</small></article>
        <article><span>Top 10</span><strong>${s.top10Percent ?? 0}%</strong><small>presença dentro da 1ª página</small></article>
        <article><span>Melhor posição</span><strong>${s.bestPosition ?? '—'}</strong><small>pior: ${s.worstPosition ?? '—'}</small></article>
      </div>`;
  }

  function radarGrid(scan) {
    const points = Array.isArray(scan?.points) ? scan.points : [];
    const size = Number(scan?.grid_size || scan?.gridSize || Math.sqrt(points.length) || 5);
    if (!points.length) return '<div class="lr-empty">Nenhuma rodada carregada.</div>';
    return `
      <div class="lr-visual">
        <div class="lr-grid" style="grid-template-columns:repeat(${size}, minmax(0,1fr))">
          ${points.map(p => `
            <button class="lr-dot ${rankClass(p.position)}" title="Lat ${p.lat}, Lng ${p.lng} · ${p.position ? 'posição '+p.position : 'não encontrado'}">
              <strong>${p.position || '20+'}</strong>
              <small>${Number(p.distanceFromCenterKm || 0).toFixed(1)} km</small>
            </button>`).join('')}
        </div>
        <div class="lr-legend">
          <span><i class="top3"></i> Top 3</span><span><i class="top10"></i> 4–10</span><span><i class="low"></i> 11+</span><span><i class="nf"></i> Não encontrado</span>
        </div>
      </div>`;
  }

  function scanProgressPanel(job) {
    if (!job || job.status !== 'running') return '';
    const size = Number(job.grid_size || 5);
    const total = Number(job.total || size*size);
    const completed = Number(job.completed || 0);
    const pct = Math.max(0, Math.min(100, Math.round((completed / Math.max(total,1)) * 100)));
    const byCell = new Map((job.points || []).map(p => [String(p.row)+':'+String(p.col), p]));
    const cells = [];
    for (let row=0; row<size; row++) {
      for (let col=0; col<size; col++) {
        const p = byCell.get(String(row)+':'+String(col));
        if (!p) {
          cells.push('<div class="lr-progress-dot waiting"><span>…</span></div>');
        } else {
          const label = p.position || (Number(p.checkedResults||0) >= 60 ? '60+' : '—');
          cells.push('<div class="lr-progress-dot '+rankClass(p.position)+'"><strong>'+e(label)+'</strong></div>');
        }
      }
    }
    return `
      <section class="lr-result-card lr-live-scan" id="lr_live_scan_progress">
        <div class="lr-result-head">
          <div>
            <span class="lr-eyebrow">Análise em andamento</span>
            <h3>Consultando os pontos do grid</h3>
            <p>${e(job.keyword || '')} · ${size}×${size} · ${job.radius_km || 3} km</p>
          </div>
          <strong class="lr-progress-count">${completed}/${total}</strong>
        </div>
        <div class="lr-progress-track"><span style="width:${pct}%"></span></div>
        <div class="lr-progress-grid" style="grid-template-columns:repeat(${size},minmax(0,1fr))">${cells.join('')}</div>
        <p class="lr-progress-note">Os pontos aparecem assim que cada consulta termina.</p>
      </section>`;
  }

  function updateLiveScanProgress(job) {
    cache.scanProgress = job || null;
    const node = document.getElementById('lr_live_scan_progress');
    if (!node) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = scanProgressPanel(job);
    const replacement = wrap.firstElementChild;
    if (replacement) node.replaceWith(replacement);
  }

  function competitorsTable(scan) {
    const items = Array.isArray(scan?.competitors) ? scan.competitors : [];
    if (!items.length) return '';
    return `
      <div class="lr-table-wrap">
        <table class="lr-table">
          <thead><tr><th>Perfil</th><th>Média</th><th>Melhor</th><th>Presença</th><th>Top 10</th></tr></thead>
          <tbody>${items.slice(0,15).map(item => `
            <tr class="${item.isTarget ? 'target' : ''}">
              <td>${item.isTarget ? '<span class="lr-target-badge">cliente</span> ' : ''}${e(item.name || 'Perfil')}</td>
              <td>${item.averagePosition ?? '—'}</td><td>${item.bestPosition ?? '—'}</td>
              <td>${item.appearancesPercent ?? 0}%</td><td>${item.top10Percent ?? 0}%</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function scanPanel(scan, opts = {}) {
    if (!scan) return '<div class="lr-empty large"><strong>Nenhuma rodada selecionada</strong><span>Rode uma análise para visualizar o grid e os concorrentes.</span></div>';
    const date = scan.created_at || scan.createdAt;
    return `
      <section class="lr-result-card">
        <div class="lr-result-head">
          <div>
            <span class="lr-eyebrow">Rodada Local Radar</span>
            <h3>${e(scan.target_name || scan.client_name || 'Análise')}</h3>
            <p>${e(scan.keyword || '')} · ${scan.grid_size || scan.gridSize}×${scan.grid_size || scan.gridSize} · ${scan.radius_km || scan.radiusKm} km · ${fmtDate(date)}</p>
          </div>
          ${opts.clientId ? `<button class="btn secondary small" onclick="localRadarGenerateReport('${a(opts.clientId)}','${a(scan.id)}')">Gerar relatório</button>` : ''}
        </div>
        ${summaryCards(scan)}
        <div class="lr-result-layout">
          <div>${radarGrid(scan)}</div>
          <div class="lr-result-aside">
            <div class="lr-context"><span>Centro do grid</span><strong>${Number(scan.center?.lat ?? scan.center_lat ?? 0).toFixed(5)}, ${Number(scan.center?.lng ?? scan.center_lng ?? 0).toFixed(5)}</strong></div>
            <div class="lr-context"><span>Perfil analisado</span><strong>${e(scan.target_name || 'Cliente')}</strong></div>
            <div class="lr-context"><span>Palavra-chave</span><strong>${e(scan.keyword || '')}</strong></div>
            <div class="lr-context"><span>Interpretação</span><strong>${(scan.summary?.top3Percent || 0) >= 70 ? 'Presença forte no Top 3' : (scan.summary?.top10Percent || 0) >= 70 ? 'Boa presença no Top 10' : 'Há espaço para ampliar a presença local'}</strong></div>
          </div>
        </div>
        ${competitorsTable(scan)}
      </section>`;
  }

  function clientInfoSection(client) {
    const id = clientIdOf(client);
    scheduleInfoLoad(id);
    const cfg = cache.configs.get(id);
    const scans = cache.scans.get(id) || [];
    const last = scans[0];

    if (!cfg) {
      return `
        <div class="client-section lr-client-info">
          <div class="client-section-title"><span>Local Radar GBP</span><small>Carregando configuração do radar...</small></div>
          <div class="lr-skeleton"></div>
        </div>`;
    }

    return `
      <div class="client-section lr-client-info">
        <div class="client-section-title">
          <span>Local Radar GBP</span>
          <small>Perfil, localização, raio, palavra-chave e rotina mensal deste cliente.</small>
        </div>

        <div class="lr-client-info-top">
          <div class="lr-client-info-status ${cfg.place_id && cfg.keyword ? 'ready' : 'pending'}">
            <strong>${cfg.place_id && cfg.keyword ? 'Pronto para rodar' : 'Configuração pendente'}</strong>
            <span>${last ? 'Última rodada: '+fmtDate(last.created_at) : 'Ainda não existe rodada salva.'}</span>
          </div>
          <div class="lr-inline-actions">
            ${last ? `<button class="btn secondary small" onclick="openLocalRadarForClient('${a(id)}', '${a(last.id)}')">Visualizar última rodada</button>` : ''}
            <button class="btn small" onclick="openLocalRadarForClient('${a(id)}')">Abrir Local Radar</button>
          </div>
        </div>

        <div class="client-section-grid lr-info-grid">
          <label class="full">Perfil do Google / Place ID
            <div class="lr-input-action"><input class="input" id="lr_info_place_id" value="${a(cfg.place_id || '')}" placeholder="ID do perfil no Google"><button class="btn secondary small" type="button" onclick="localRadarFindProfileFromInfo('${a(id)}')">Localizar perfil</button></div>
          </label>
          <label class="full">Endereço do ponto central
            <div class="lr-input-action"><input class="input" id="lr_info_address" value="${a(cfg.address || '')}" placeholder="Rua, número, bairro, cidade - UF"><button class="btn secondary small" type="button" onclick="localRadarResolveInfoAddress('${a(id)}')">Localizar</button></div>
          </label>
          <label>Cidade <input class="input" id="lr_info_city" value="${a(cfg.city || '')}"></label>
          <label>Palavra-chave principal <input class="input" id="lr_info_keyword" value="${a(cfg.keyword || '')}" placeholder="Ex: cardiologista"></label>
          <label>Raio do radar (km) <input class="input" id="lr_info_radius" type="number" min="0.2" max="50" step="0.1" value="${a(cfg.radius_km || 3)}"></label>
          <label>Grid
            <select class="select" id="lr_info_grid">
              ${[3,5,7].map(n => `<option value="${n}" ${Number(cfg.grid_size)===n?'selected':''}>${n} × ${n}</option>`).join('')}
            </select>
          </label>
          <label>Latitude do centro <input class="input" id="lr_info_lat" value="${a(cfg.grid_center_lat ?? cfg.profile_lat ?? '')}" placeholder="-18.000000"></label>
          <label>Longitude do centro <input class="input" id="lr_info_lng" value="${a(cfg.grid_center_lng ?? cfg.profile_lng ?? '')}" placeholder="-48.000000"></label>
          <input type="hidden" id="lr_info_profile_lat" value="${a(cfg.profile_lat ?? '')}">
          <input type="hidden" id="lr_info_profile_lng" value="${a(cfg.profile_lng ?? '')}">
          <label class="lr-check-card"><input type="checkbox" id="lr_info_monthly" ${cfg.monthly_enabled?'checked':''}><span><strong>Rodar automaticamente todo mês</strong><small>Gera uma nova rodada e relatório mensal.</small></span></label>
          <label>Dia da rodada mensal <input class="input" id="lr_info_monthly_day" type="number" min="1" max="28" value="${a(cfg.monthly_day || 5)}"></label>
        </div>
        <div id="lr_info_places_${a(id)}"></div>
        <div class="lr-map-card">
          <div class="lr-map-head">
            <div><strong>Ajustar área no mapa</strong><small>Arraste o marcador azul ou clique no mapa para posicionar o centro do grid exatamente onde você quer analisar.</small></div>
            <span id="lr_info_map_label">Centro do grid</span>
          </div>
          <div id="lr_info_map" class="lr-adjust-map"></div>
          <div class="lr-map-foot"><span><i class="profile"></i> Perfil do Google</span><span><i class="center"></i> Centro ajustável</span><span><i class="grid"></i> Pontos do grid</span><button class="btn secondary small" type="button" onclick="localRadarSaveInfo('${a(id)}')">Salvar posição do mapa</button></div>
        </div>
        <div class="actions lr-info-actions">
          <button class="btn secondary" onclick="localRadarRunClientFromInfo('${a(id)}')">Rodar análise agora</button>
          <button class="btn" onclick="localRadarSaveInfo('${a(id)}')">Salvar Local Radar</button>
        </div>
      </div>`;
  }

  if (typeof renderClientInfos === 'function') {
    const baseClientInfos = renderClientInfos;
    renderClientInfos = function(client, posts) {
      let html = baseClientInfos(client, posts);
      // Remove a seção provisória da V112.16, caso exista em cache antigo.
      html = html.replace(/<div class="client-section local-radar-client-section">[\s\S]*?<\/div>\s*<div class="actions">/i, '<div class="actions">');
      const section = clientInfoSection(client);
      const marker = '<div class="actions">';
      const idx = html.lastIndexOf(marker);
      return idx >= 0 ? html.slice(0, idx) + section + html.slice(idx) : html + section;
    };
    window.renderClientInfos = renderClientInfos;
  }

  async function saveInfo(clientId, runAfter = false) {
    const cfg = {
      place_id: val('lr_info_place_id'),
      address: val('lr_info_address'),
      city: val('lr_info_city'),
      keyword: val('lr_info_keyword'),
      radius_km: val('lr_info_radius'),
      grid_size: document.getElementById('lr_info_grid')?.value || 5,
      grid_center_lat: val('lr_info_lat'),
      grid_center_lng: val('lr_info_lng'),
      profile_lat: val('lr_info_profile_lat') || val('lr_info_lat'),
      profile_lng: val('lr_info_profile_lng') || val('lr_info_lng'),
      monthly_enabled: !!document.getElementById('lr_info_monthly')?.checked,
      monthly_day: val('lr_info_monthly_day') || 5
    };
    const data = await api('/api/local-radar/config/' + encodeURIComponent(clientId), { method:'PUT', body:JSON.stringify(cfg) });
    cache.configs.set(String(clientId), data.config || cfg);
    cache.clientsLoaded = false;
    notify('Configuração do Local Radar salva.');
    if (runAfter) return runClientScan(clientId);
    render({ skipAutoSync:true });
  }
  window.localRadarSaveInfo = id => saveInfo(String(id), false);
  window.localRadarRunClientFromInfo = id => saveInfo(String(id), true);

  window.localRadarResolveInfoAddress = async function(clientId) {
    try {
      const address = val('lr_info_address'), city = val('lr_info_city');
      if (!address) return notify('Informe o endereço.');
      notify('Localizando endereço...');
      const data = await api('/api/local-radar/resolve-location', { method:'POST', body:JSON.stringify({address,city}) });
      const loc = data.location || {};
      const lat = document.getElementById('lr_info_lat'), lng = document.getElementById('lr_info_lng'), addr = document.getElementById('lr_info_address');
      if (lat) lat.value = loc.lat ?? '';
      if (lng) lng.value = loc.lng ?? '';
      if (addr && loc.formattedAddress) addr.value = loc.formattedAddress;
      refreshVisibleRadarMaps();
      notify('Localização encontrada. Agora ajuste o centro visualmente no mapa.');
    } catch (err) { notify(err.message); }
  };

  function placeOptions(containerId, places, chooseFnName) {
    const node = document.getElementById(containerId);
    if (!node) return;
    node.innerHTML = `<div class="lr-place-results">${places.length ? places.map((p,i)=>`
      <button type="button" onclick="${chooseFnName}(${i})">
        <span><strong>${e(p.name)}</strong><small>${e(p.address)}</small></span><em>Selecionar</em>
      </button>`).join('') : '<p>Nenhum perfil encontrado. Ajuste o nome/endereço e tente novamente.</p>'}</div>`;
  }

  window.localRadarFindProfileFromInfo = async function(clientId) {
    try {
      const client = (typeof getClients === 'function' ? getClients() : []).find(c => clientIdOf(c) === String(clientId));
      const queryText = [client?.nome_cliente || '', val('lr_info_address'), val('lr_info_city')].filter(Boolean).join(' ');
      const data = await api('/api/local-radar/find-place', { method:'POST', body:JSON.stringify({query:queryText,lat:val('lr_info_lat'),lng:val('lr_info_lng')}) });
      cache.clientPlaces.set(String(clientId), data.places || []);
      window.__lrInfoClient = String(clientId);
      placeOptions('lr_info_places_'+String(clientId), data.places || [], 'localRadarChooseInfoPlace');
    } catch (err) { notify(err.message); }
  };
  window.localRadarChooseInfoPlace = function(index) {
    const id = window.__lrInfoClient || '';
    const p = (cache.clientPlaces.get(id) || [])[Number(index)];
    if (!p) return;
    const pid = document.getElementById('lr_info_place_id'), addr = document.getElementById('lr_info_address'), lat=document.getElementById('lr_info_lat'),lng=document.getElementById('lr_info_lng');
    if (pid) pid.value = p.place_id || '';
    if (addr && p.address) addr.value = p.address;
    const profileLat = document.getElementById('lr_info_profile_lat'), profileLng = document.getElementById('lr_info_profile_lng');
    if (profileLat && p.lat != null) profileLat.value = p.lat;
    if (profileLng && p.lng != null) profileLng.value = p.lng;
    if (lat && p.lat != null) lat.value = p.lat;
    if (lng && p.lng != null) lng.value = p.lng;
    const box = document.getElementById('lr_info_places_'+id); if (box) box.innerHTML = '';
    refreshVisibleRadarMaps();
    notify('Perfil selecionado. O mapa foi centralizado no perfil; agora você pode mover o grid livremente.');
  };

  async function waitForScanJob(jobId) {
    while (true) {
      const data = await api('/api/local-radar/scan/jobs/' + encodeURIComponent(jobId));
      const job = data.job || {};
      cache.scanProgress = job;
      updateLiveScanProgress(job);
      if (job.status === 'done') return job.scan;
      if (job.status === 'error') throw new Error(job.error || 'Não foi possível concluir a análise.');
      await new Promise(resolve => setTimeout(resolve, 650));
    }
  }

  async function startScanJob(payload, clientId = '') {
    const started = await api('/api/local-radar/scan/start', { method:'POST', body:JSON.stringify(payload) });
    const job = started.job || {};
    cache.scanProgress = job;
    cache.busy = true;
    if (clientId) {
      cache.selectedClientId = String(clientId);
      cache.activeTab = 'clients';
    }
    state.view = 'local-radar';
    render({ skipAutoSync:true });
    notify('Análise iniciada. Os pontos serão preenchidos conforme o Google responder.');
    return waitForScanJob(job.id);
  }

  async function runClientScan(clientId) {
    const id = String(clientId || '');
    try {
      const scan = await startScanJob({client_id:id}, id);
      cache.currentScan = scan;
      cache.scanProgress = null;
      await loadClientBundle(id, true);
      render({ skipAutoSync:true });
      notify('Rodada concluída. Posições atualizadas.');
      return scan;
    } catch (err) {
      cache.scanProgress = null;
      notify(err.message);
      render({ skipAutoSync:true });
      throw err;
    } finally {
      cache.busy = false;
    }
  }

  function clientList() {
    if (!cache.clientsLoaded) return '<div class="lr-empty">Carregando clientes...</div>';
    if (!cache.clients.length) return '<div class="lr-empty">Nenhum cliente encontrado.</div>';
    return `<div class="lr-client-list">${cache.clients.map(c => `
      <button class="${String(cache.selectedClientId)===String(c.id)?'active':''}" onclick="localRadarSelectClient('${a(c.id)}')">
        <span class="lr-client-avatar">${e((c.name||'?').trim().charAt(0).toUpperCase())}</span>
        <span><strong>${e(c.name)}</strong><small>${e(c.specialty || c.city || 'Cliente LEME')}</small></span>
        <i class="${c.configured?'ready':'pending'}"></i>
      </button>`).join('')}</div>`;
  }

  function configForm(cfg, client) {
    if (!cfg) return '<div class="lr-empty">Selecione um cliente.</div>';
    return `
      <section class="lr-config-panel">
        <div class="lr-section-head"><div><span class="lr-eyebrow">Configuração do cliente</span><h3>${e(cfg.client_name || client?.name || '')}</h3></div><span class="lr-status ${cfg.place_id&&cfg.keyword?'ready':'pending'}">${cfg.place_id&&cfg.keyword?'Pronto':'Pendente'}</span></div>
        <div class="lr-form-grid">
          <label class="wide">Perfil do Google / Place ID
            <div class="lr-input-action"><input class="input" id="lr_place_id" value="${a(cfg.place_id||'')}" placeholder="Selecione o perfil do Google"><button class="btn secondary small" onclick="localRadarFindProfileMain()">Localizar perfil</button></div>
          </label>
          <label class="wide">Endereço / centro do radar
            <div class="lr-input-action"><input class="input" id="lr_address" value="${a(cfg.address||'')}" placeholder="Rua, número, bairro, cidade - UF"><button class="btn secondary small" onclick="localRadarResolveMainAddress()">Localizar</button></div>
          </label>
          <label>Cidade <input class="input" id="lr_city" value="${a(cfg.city||'')}"></label>
          <label>Palavra-chave <input class="input" id="lr_keyword" value="${a(cfg.keyword||'')}" placeholder="Ex: oftalmologista"></label>
          <label>Raio (km) <input class="input" id="lr_radius" type="number" min="0.2" max="50" step="0.1" value="${a(cfg.radius_km||3)}"></label>
          <label>Grid <select class="select" id="lr_grid">${[3,5,7].map(n=>`<option value="${n}" ${Number(cfg.grid_size)===n?'selected':''}>${n} × ${n}</option>`).join('')}</select></label>
          <label>Latitude do centro <input class="input" id="lr_lat" value="${a(cfg.grid_center_lat ?? cfg.profile_lat ?? '')}"></label>
          <label>Longitude do centro <input class="input" id="lr_lng" value="${a(cfg.grid_center_lng ?? cfg.profile_lng ?? '')}"></label>
          <input type="hidden" id="lr_profile_lat" value="${a(cfg.profile_lat ?? '')}">
          <input type="hidden" id="lr_profile_lng" value="${a(cfg.profile_lng ?? '')}">
        </div>
        <div id="lr_main_places"></div>
        <div class="lr-map-card">
          <div class="lr-map-head">
            <div><strong>Ajuste visual do grid</strong><small>Veja a cidade no mapa e mova o centro até o grid ocupar exatamente a região desejada. Essa posição ficará salva para todas as próximas rodadas.</small></div>
            <span id="lr_main_map_label">Centro do grid</span>
          </div>
          <div id="lr_main_map" class="lr-adjust-map large"></div>
          <div class="lr-map-foot"><span><i class="profile"></i> Perfil do Google</span><span><i class="center"></i> Centro ajustável</span><span><i class="grid"></i> Pontos do grid</span><button class="btn secondary small" type="button" onclick="localRadarSaveMain()">Salvar posição do mapa</button></div>
        </div>
        <div class="lr-auto-row">
          <label class="lr-switch"><input type="checkbox" id="lr_monthly" ${cfg.monthly_enabled?'checked':''}><span></span></label>
          <div><strong>Rodada mensal automática</strong><small>O sistema roda o radar e gera um relatório todo mês.</small></div>
          <label class="lr-day">Dia <input class="input" id="lr_monthly_day" type="number" min="1" max="28" value="${a(cfg.monthly_day||5)}"></label>
        </div>
        <div class="lr-panel-actions">
          <button class="btn secondary" onclick="localRadarSaveMain()">Salvar configuração</button>
          <button class="btn" onclick="localRadarRunMain()" ${cache.busy?'disabled':''}>${cache.busy?'Rodando análise...':'Rodar análise agora'}</button>
        </div>
      </section>`;
  }

  function historyPanel(clientId) {
    const scans = cache.scans.get(String(clientId)) || [];
    const reports = cache.reports.get(String(clientId)) || [];
    return `
      <section class="lr-history">
        <div class="lr-history-col">
          <div class="lr-section-head compact"><div><span class="lr-eyebrow">Histórico</span><h3>Rodadas anteriores</h3></div></div>
          <div class="lr-history-list">${scans.length ? scans.map(s=>`
            <button onclick="localRadarOpenScan('${a(s.id)}')">
              <span><strong>${e(s.keyword)}</strong><small>${fmtDate(s.created_at)} · ${s.grid_size}×${s.grid_size} · ${s.radius_km} km</small></span>
              <em>média ${s.summary?.averagePosition ?? '—'}</em>
            </button>`).join('') : '<div class="lr-empty">Nenhuma rodada ainda.</div>'}</div>
        </div>
        <div class="lr-history-col">
          <div class="lr-section-head compact"><div><span class="lr-eyebrow">Relatórios</span><h3>Mensais e manuais</h3></div></div>
          <div class="lr-history-list">${reports.length ? reports.map(r=>`
            <button onclick="localRadarOpenReport('${a(r.id)}')">
              <span><strong>${e(r.title || 'Relatório Local Radar')}</strong><small>${r.month_key ? 'Competência '+e(r.month_key) : 'Manual'} · ${fmtDate(r.created_at)}</small></span>
              <em>abrir</em>
            </button>`).join('') : '<div class="lr-empty">Nenhum relatório gerado.</div>'}</div>
        </div>
      </section>`;
  }

  function selectedClientContent() {
    const id = String(cache.selectedClientId || '');
    const client = cache.clients.find(c => String(c.id)===id);
    const cfg = cache.configs.get(id);
    const scans = cache.scans.get(id) || [];
    const current = cache.currentScan?.client_id === id ? cache.currentScan : scans[0];

    if (!id) return '<div class="lr-empty large">Selecione um cliente.</div>';
    if (!cfg) {
      setTimeout(() => localRadarSelectClient(id, true), 0);
      return '<div class="lr-empty large">Carregando dados do cliente...</div>';
    }

    return `
      ${configForm(cfg, client)}
      ${cache.scanProgress?.status === 'running' && String(cache.scanProgress.client_id || '') === id ? scanProgressPanel(cache.scanProgress) : ''}
      ${scanPanel(current, {clientId:id})}
      ${historyPanel(id)}
    `;
  }

  function quickPage() {
    return `
      <div class="lr-quick-layout">
        <section class="lr-config-panel">
          <div class="lr-section-head"><div><span class="lr-eyebrow">Análise rápida</span><h3>Consultar qualquer perfil</h3><p>Não precisa cadastrar como cliente. Ideal para diagnóstico, lead ou reunião.</p></div></div>
          <div class="lr-form-grid">
            <label class="wide">Nome do perfil / empresa <input class="input" id="lr_q_name" placeholder="Ex: Dr. Nome Sobrenome"></label>
            <label class="wide">Endereço / cidade <input class="input" id="lr_q_address" placeholder="Rua, cidade - UF"></label>
            <label>Palavra-chave <input class="input" id="lr_q_keyword" placeholder="Ex: cardiologista"></label>
            <label>Raio (km) <input class="input" id="lr_q_radius" type="number" min="0.2" max="50" step="0.1" value="3"></label>
            <label>Grid <select class="select" id="lr_q_grid"><option>3</option><option selected>5</option><option>7</option></select></label>
            <label>Latitude <input class="input" id="lr_q_lat" placeholder="preenchida automaticamente"></label>
            <label>Longitude <input class="input" id="lr_q_lng" placeholder="preenchida automaticamente"></label>
            <label>Place ID <input class="input" id="lr_q_place" placeholder="selecione abaixo"></label>
          </div>
          <div class="lr-panel-actions"><button class="btn secondary" onclick="localRadarQuickFind()">1. Localizar perfil</button><button class="btn" onclick="localRadarQuickRun()" ${cache.busy?'disabled':''}>2. Rodar análise</button></div>
          <div id="lr_quick_places"></div>
        </section>
        ${cache.scanProgress?.status === 'running' && cache.scanProgress.source === 'quick' ? scanProgressPanel(cache.scanProgress) : ''}
        ${scanPanel(cache.currentScan?.source === 'quick' ? cache.currentScan : null)}
      </div>`;
  }

  function renderPage() {
    if (!cache.clientsLoaded && !cache.loadingClients) {
      setTimeout(async () => { try { await loadClients(); if(state.view==='local-radar') render({skipAutoSync:true}); } catch(err){notify(err.message);} },0);
    }
    return `
      <main class="lr-page">
        <div class="lr-page-head">
          <div><span class="lr-eyebrow">GBP LEME</span><h1>Local Radar</h1><p>Posicionamento local, histórico e relatórios mensais dentro do Sistema LEME.</p></div>
          <div class="lr-page-tabs">
            <button class="${cache.activeTab==='clients'?'active':''}" onclick="localRadarSetTab('clients')">Carteira de clientes</button>
            <button class="${cache.activeTab==='quick'?'active':''}" onclick="localRadarSetTab('quick')">Análise rápida</button>
          </div>
        </div>
        ${cache.activeTab==='quick' ? quickPage() : `
          <div class="lr-shell">
            <aside class="lr-sidebar">
              <div class="lr-sidebar-title"><strong>Clientes LEME</strong><small>${cache.clients.filter(c=>c.configured).length} configurados de ${cache.clients.length}</small></div>
              ${clientList()}
            </aside>
            <div class="lr-main">${selectedClientContent()}</div>
          </div>`}
      </main>`;
  }
  window.renderLocalRadarPage = renderPage;

  // Mantém o botão GBP no mesmo lugar, mas abre o módulo nativo.
  if (typeof appShell === 'function') {
    const previousShell = appShell;
    appShell = function(content) {
      let html = previousShell(content);
      html = html.replace(/<a\s+class="sidebar-gbp-link"[\s\S]*?<strong>GBP LEME<\/strong>[\s\S]*?<\/a>/i,
        '<button type="button" class="sidebar-gbp-link local-radar-native-link '+(state.view==='local-radar'?'active':'')+'" onclick="go(\'local-radar\')"><span>📍</span><strong>GBP LEME</strong></button>');
      html = html.replace(/<button\s+type="button"\s+class="sidebar-gbp-link local-radar-sidebar-button[\s\S]*?<strong>GBP LEME<\/strong>\s*<\/button>/i,
        '<button type="button" class="sidebar-gbp-link local-radar-native-link '+(state.view==='local-radar'?'active':'')+'" onclick="go(\'local-radar\')"><span>📍</span><strong>GBP LEME</strong></button>');
      return html;
    };
    window.appShell = appShell;
  }

  if (typeof render === 'function') {
    const previousRender = render;
    render = function(options = {}) {
      destroyRadarMaps();
      if (state.view !== 'local-radar') {
        const result = previousRender(options);
        if (state.view === 'cliente' && state.clientTab === 'infos') setTimeout(initVisibleRadarMaps, 60);
        return result;
      }
      const root = document.getElementById('app');
      if (!root) return;
      root.innerHTML = appShell(renderPage()) + renderModal() + renderCalendarPostContextMenu();
      try { applyTheme(); } catch {}
      try { initAutoGrowTextareas(); } catch {}
      setTimeout(initVisibleRadarMaps, 60);
    };
    window.render = render;
  }

  window.openLocalRadarForClient = async function(clientId, scanId = '') {
    cache.activeTab = 'clients';
    cache.selectedClientId = String(clientId || '');
    state.view = 'local-radar';
    render({skipAutoSync:true});
    try {
      await loadClients();
      await loadClientBundle(cache.selectedClientId, true);
      if (scanId) await localRadarOpenScan(scanId, false);
      render({skipAutoSync:true});
    } catch(err){notify(err.message);}
  };
  window.localRadarSetTab = function(tab){ cache.activeTab = tab === 'quick' ? 'quick' : 'clients'; render({skipAutoSync:true}); };
  window.localRadarSelectClient = async function(clientId, silent = false) {
    cache.selectedClientId = String(clientId || '');
    cache.currentScan = null;
    render({skipAutoSync:true});
    try { await loadClientBundle(cache.selectedClientId, true); render({skipAutoSync:true}); }
    catch(err){ if(!silent) notify(err.message); }
  };

  function readMainConfig() {
    return {
      place_id: val('lr_place_id'), address: val('lr_address'), city: val('lr_city'), keyword: val('lr_keyword'),
      radius_km: val('lr_radius'), grid_size: document.getElementById('lr_grid')?.value || 5,
      grid_center_lat: val('lr_lat'), grid_center_lng: val('lr_lng'),
      profile_lat: val('lr_profile_lat') || val('lr_lat'), profile_lng: val('lr_profile_lng') || val('lr_lng'),
      monthly_enabled: !!document.getElementById('lr_monthly')?.checked,
      monthly_day: val('lr_monthly_day') || 5
    };
  }
  window.localRadarSaveMain = async function() {
    try {
      const id = String(cache.selectedClientId || '');
      const data = await api('/api/local-radar/config/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(readMainConfig())});
      cache.configs.set(id,data.config||readMainConfig()); cache.clientsLoaded=false; await loadClients(true);
      notify('Configuração salva.'); render({skipAutoSync:true});
    } catch(err){notify(err.message);}
  };
  window.localRadarRunMain = async function() {
    try { await localRadarSaveMain(); await runClientScan(cache.selectedClientId); }
    catch(err){console.error(err);}
  };
  window.localRadarResolveMainAddress = async function() {
    try {
      const data=await api('/api/local-radar/resolve-location',{method:'POST',body:JSON.stringify({address:val('lr_address'),city:val('lr_city')})}),loc=data.location||{};
      if(document.getElementById('lr_lat'))document.getElementById('lr_lat').value=loc.lat??'';
      if(document.getElementById('lr_lng'))document.getElementById('lr_lng').value=loc.lng??'';
      if(document.getElementById('lr_address')&&loc.formattedAddress)document.getElementById('lr_address').value=loc.formattedAddress;
      refreshVisibleRadarMaps();
      notify('Centro localizado. Agora ajuste visualmente no mapa.');
    }catch(err){notify(err.message);}
  };
  window.localRadarFindProfileMain = async function() {
    try {
      const c=cache.clients.find(x=>String(x.id)===String(cache.selectedClientId));
      const data=await api('/api/local-radar/find-place',{method:'POST',body:JSON.stringify({query:[c?.name||'',val('lr_address'),val('lr_city')].filter(Boolean).join(' '),lat:val('lr_lat'),lng:val('lr_lng')})});
      cache.clientPlaces.set(String(cache.selectedClientId),data.places||[]);
      placeOptions('lr_main_places',data.places||[],'localRadarChooseMainPlace');
    }catch(err){notify(err.message);}
  };
  window.localRadarChooseMainPlace = function(index) {
    const p=(cache.clientPlaces.get(String(cache.selectedClientId))||[])[Number(index)];if(!p)return;
    document.getElementById('lr_place_id').value=p.place_id||'';
    if(p.address)document.getElementById('lr_address').value=p.address;
    if(p.lat!=null){document.getElementById('lr_profile_lat').value=p.lat;document.getElementById('lr_lat').value=p.lat;}
    if(p.lng!=null){document.getElementById('lr_profile_lng').value=p.lng;document.getElementById('lr_lng').value=p.lng;}
    document.getElementById('lr_main_places').innerHTML='';
    refreshVisibleRadarMaps();
    notify('Perfil selecionado. O grid começa no perfil e pode ser movido para qualquer área da cidade.');
  };

  window.localRadarOpenScan = async function(scanId, shouldRender = true) {
    try {
      const data=await api('/api/local-radar/scans/'+encodeURIComponent(scanId)); cache.currentScan=data.scan;
      if(shouldRender)render({skipAutoSync:true});
    }catch(err){notify(err.message);}
  };

  window.localRadarGenerateReport = async function(clientId, scanId) {
    try {
      const key='manual-'+Date.now();
      await api('/api/local-radar/reports',{method:'POST',body:JSON.stringify({client_id:clientId,scan_id:scanId,month_key:key})});
      await loadClientBundle(String(clientId),true); notify('Relatório gerado e anexado ao histórico do cliente.'); render({skipAutoSync:true});
    }catch(err){notify(err.message);}
  };

  function reportHtml(report) {
    const data=report?.data||{},scan=data.scan||{},s=scan.summary||{},client=data.client||{};
    const points=Array.isArray(scan.points)?scan.points:[];
    const size=Number(scan.grid_size||5);
    const cells=points.map(p=>'<div class="p '+rankClass(p.position)+'"><b>'+(p.position||'20+')+'</b></div>').join('');
    return '<!doctype html><html><head><meta charset="utf-8"><title>'+e(report.title||'Relatório Local Radar')+'</title><style>body{font-family:Arial,sans-serif;background:#f5f7f8;color:#173244;margin:0;padding:36px}.page{max-width:950px;margin:auto;background:white;padding:40px;border-radius:20px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #dce5ea;padding-bottom:24px}.head h1{margin:4px 0}.k{font-size:11px;letter-spacing:.14em;color:#5586a3;font-weight:700}.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:25px 0}.sum div{background:#f0f5f7;padding:16px;border-radius:14px}.sum b{font-size:27px;display:block;margin-top:6px}.grid{display:grid;gap:10px;grid-template-columns:repeat('+size+',1fr);max-width:620px;margin:25px auto}.p{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;color:white;font-size:17px}.top3{background:#2ca66f}.top10{background:#d6a52c}.low{background:#d96658}.nf{background:#80919c}.footer{margin-top:30px;font-size:12px;color:#687e8b}@media print{body{background:white;padding:0}.page{box-shadow:none;padding:10px}}</style></head><body><div class="page"><div class="head"><div><span class="k">LEME · LOCAL RADAR</span><h1>'+e(client.name||'Cliente')+'</h1><p>'+e(scan.keyword||'')+' · '+size+'×'+size+' · '+e(scan.radius_km||'')+' km</p></div><div>'+fmtDate(report.created_at)+'</div></div><div class="sum"><div>Posição média<b>'+(s.averagePosition??'—')+'</b></div><div>Top 3<b>'+(s.top3Percent??0)+'%</b></div><div>Top 10<b>'+(s.top10Percent??0)+'%</b></div><div>Melhor posição<b>'+(s.bestPosition??'—')+'</b></div></div><div class="grid">'+cells+'</div><h2>Leitura estratégica</h2><p>'+e(data.interpretation?.visibility||'Análise local concluída.')+'</p><div class="footer">Relatório Local Radar LEME · fotografia do posicionamento no momento da rodada.</div></div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>';
  }
  window.localRadarOpenReport = function(reportId) {
    const reports=cache.reports.get(String(cache.selectedClientId))||[],report=reports.find(r=>String(r.id)===String(reportId));
    if(!report)return notify('Relatório não encontrado.');
    const w=window.open('','_blank'); if(!w)return notify('Permita pop-ups para abrir o relatório.');
    w.document.open(); w.document.write(reportHtml(report)); w.document.close();
  };

  window.localRadarQuickFind = async function() {
    try {
      const address=val('lr_q_address'),name=val('lr_q_name');
      if(!address)return notify('Informe o endereço/cidade.');
      const geo=await api('/api/local-radar/resolve-location',{method:'POST',body:JSON.stringify({address})}),loc=geo.location||{};
      document.getElementById('lr_q_lat').value=loc.lat??''; document.getElementById('lr_q_lng').value=loc.lng??'';
      const data=await api('/api/local-radar/find-place',{method:'POST',body:JSON.stringify({query:[name,address].filter(Boolean).join(' '),lat:loc.lat,lng:loc.lng})});
      cache.quickPlaces=data.places||[]; placeOptions('lr_quick_places',cache.quickPlaces,'localRadarQuickChoose');
    }catch(err){notify(err.message);}
  };
  window.localRadarQuickChoose = function(index) {
    const p=cache.quickPlaces[Number(index)];if(!p)return;
    document.getElementById('lr_q_name').value=p.name||val('lr_q_name');
    document.getElementById('lr_q_place').value=p.place_id||'';
    if(p.address)document.getElementById('lr_q_address').value=p.address;
    if(p.lat!=null)document.getElementById('lr_q_lat').value=p.lat;
    if(p.lng!=null)document.getElementById('lr_q_lng').value=p.lng;
    document.getElementById('lr_quick_places').innerHTML=''; notify('Perfil selecionado.');
  };
  window.localRadarQuickRun = async function() {
    if(cache.busy)return;
    try {
      const payload={target_name:val('lr_q_name'),place_id:val('lr_q_place'),keyword:val('lr_q_keyword'),radius_km:val('lr_q_radius'),grid_size:document.getElementById('lr_q_grid')?.value||5,center_lat:val('lr_q_lat'),center_lng:val('lr_q_lng')};
      cache.activeTab='quick';
      const scan=await startScanJob(payload,'');
      cache.currentScan=scan;
      cache.scanProgress=null;
      notify('Análise rápida concluída.');
    }catch(err){
      cache.scanProgress=null;
      notify(err.message);
    }finally{
      cache.busy=false;
      render({skipAutoSync:true});
    }
  };

  const style=document.createElement('style');
  style.id='local-radar-native-v11217';
  style.textContent=`
    .local-radar-native-link{width:100%;border:0;cursor:pointer;text-align:left;font:inherit}.local-radar-native-link.active{background:rgba(82,164,213,.14)!important;box-shadow:inset 3px 0 #52a4d5}
    .lr-page{display:grid;gap:20px;min-width:0}.lr-page-head{display:flex;align-items:end;justify-content:space-between;gap:18px;flex-wrap:wrap}.lr-page-head h1{font-size:40px;line-height:1;margin:4px 0 6px}.lr-page-head p,.lr-section-head p{margin:0;color:var(--muted,#8fa3b1)}.lr-eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#52a4d5}
    .lr-page-tabs{display:flex;gap:5px;background:rgba(9,25,37,.7);padding:5px;border-radius:13px;border:1px solid rgba(130,160,180,.14)}.lr-page-tabs button{border:0;background:transparent;color:#91a7b5;padding:10px 14px;border-radius:9px;font-weight:700;cursor:pointer}.lr-page-tabs button.active{background:#17384e;color:white}
    .lr-shell{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start}.lr-sidebar{position:sticky;top:14px;background:rgba(9,25,37,.6);border:1px solid rgba(130,160,180,.14);border-radius:18px;padding:12px;max-height:calc(100vh - 120px);overflow:auto}.lr-sidebar-title{display:grid;gap:3px;padding:8px 8px 13px}.lr-sidebar-title small{color:#8197a6}.lr-client-list{display:grid;gap:6px}.lr-client-list button{width:100%;display:grid;grid-template-columns:36px 1fr 8px;gap:10px;align-items:center;text-align:left;border:1px solid transparent;background:transparent;color:inherit;padding:9px;border-radius:12px;cursor:pointer}.lr-client-list button:hover,.lr-client-list button.active{background:rgba(82,164,213,.09);border-color:rgba(82,164,213,.18)}.lr-client-list button span:nth-child(2){display:grid}.lr-client-list small{color:#8197a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lr-client-avatar{width:36px;height:36px;border-radius:10px;background:#173b52;display:grid;place-items:center;font-weight:800;color:#b8d8e9}.lr-client-list i{width:7px;height:7px;border-radius:50%}.lr-client-list i.ready{background:#40c27d}.lr-client-list i.pending{background:#d6a52c}.lr-main{display:grid;gap:16px;min-width:0}
    .lr-config-panel,.lr-result-card,.lr-history-col{border:1px solid rgba(130,160,180,.14);border-radius:18px;background:linear-gradient(145deg,rgba(12,31,44,.92),rgba(14,38,54,.7));padding:18px}.lr-section-head,.lr-result-head{display:flex;justify-content:space-between;gap:14px;align-items:start;margin-bottom:15px}.lr-section-head.compact{margin-bottom:10px}.lr-section-head h3,.lr-result-head h3{font-size:20px;margin:3px 0 0}.lr-result-head p{margin:4px 0 0;color:#8499a8;font-size:12px}.lr-status{font-size:11px;font-weight:800;padding:7px 10px;border-radius:999px}.lr-status.ready{background:rgba(45,183,110,.12);color:#72daa3}.lr-status.pending{background:rgba(214,165,44,.12);color:#efc35c}
    .lr-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.lr-form-grid label{display:grid;gap:6px;font-size:11px;color:#8fa3b1}.lr-form-grid .wide{grid-column:span 2}.lr-input-action{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.lr-auto-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;margin-top:14px;padding:13px;border-radius:13px;background:rgba(82,164,213,.06);border:1px solid rgba(82,164,213,.12)}.lr-auto-row>div{display:grid}.lr-auto-row small{color:#8096a5}.lr-day{display:flex;align-items:center;gap:7px;font-size:11px;color:#8fa3b1}.lr-day input{width:75px}.lr-switch input{display:none}.lr-switch span{display:block;width:42px;height:24px;background:#334b59;border-radius:20px;position:relative;cursor:pointer}.lr-switch span:after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:white;top:3px;left:3px;transition:.18s}.lr-switch input:checked+span{background:#2c9c68}.lr-switch input:checked+span:after{left:21px}.lr-panel-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
    .lr-place-results{display:grid;gap:6px;margin-top:10px;padding:8px;border-radius:12px;background:rgba(0,0,0,.15)}.lr-place-results button{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;padding:10px 12px;border:1px solid rgba(130,160,180,.13);background:rgba(15,42,58,.65);color:inherit;border-radius:10px;cursor:pointer}.lr-place-results button span{display:grid}.lr-place-results small{color:#8297a5}.lr-place-results em{font-size:11px;color:#6bbbe9;font-style:normal;font-weight:700}
    .lr-live-scan{border-color:rgba(82,164,213,.38);background:linear-gradient(145deg,rgba(10,35,51,.96),rgba(15,49,67,.82))}.lr-progress-count{font-size:18px;color:#74c5ef}.lr-progress-track{height:7px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-bottom:14px}.lr-progress-track span{display:block;height:100%;background:#52a4d5;border-radius:inherit;transition:width .25s ease}.lr-progress-grid{display:grid;gap:8px;max-width:620px;margin:0 auto}.lr-progress-dot{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;color:white;font-size:13px;font-weight:800;border:2px solid rgba(255,255,255,.72)}.lr-progress-dot.waiting{background:rgba(255,255,255,.07);color:#718795;border-color:rgba(255,255,255,.12);animation:lrPulse 1.2s infinite}.lr-progress-dot.top3{background:#2ca66f}.lr-progress-dot.top10{background:#d6a52c}.lr-progress-dot.low{background:#d96658}.lr-progress-dot.nf{background:#687c88}.lr-progress-note{text-align:center;color:#8197a5;font-size:11px;margin:12px 0 0}
    .lr-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:15px}.lr-summary article{padding:13px 14px;border-radius:13px;background:rgba(4,18,27,.44);border:1px solid rgba(130,160,180,.1);display:grid;gap:2px}.lr-summary span,.lr-summary small{font-size:10px;color:#8197a5}.lr-summary strong{font-size:26px}.lr-result-layout{display:grid;grid-template-columns:minmax(340px,1.4fr) minmax(210px,.6fr);gap:14px}.lr-visual{padding:14px;border-radius:16px;background:radial-gradient(circle at center,rgba(82,164,213,.10),rgba(6,21,31,.35));border:1px solid rgba(130,160,180,.11)}.lr-grid{display:grid;gap:10px;max-width:640px;margin:auto}.lr-dot{aspect-ratio:1;border:0;border-radius:50%;color:white;display:grid;place-items:center;align-content:center;gap:1px;box-shadow:0 6px 14px rgba(0,0,0,.2);cursor:default}.lr-dot strong{font-size:16px}.lr-dot small{font-size:8px;opacity:.78}.lr-dot.top3,.lr-legend i.top3{background:#2ca66f}.lr-dot.top10,.lr-legend i.top10{background:#d6a52c}.lr-dot.low,.lr-legend i.low{background:#d96658}.lr-dot.nf,.lr-legend i.nf{background:#687c88}.lr-legend{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:12px;font-size:10px;color:#8ba0ae}.lr-legend span{display:flex;align-items:center;gap:5px}.lr-legend i{width:7px;height:7px;border-radius:50%}.lr-result-aside{display:grid;gap:8px;align-content:start}.lr-context{padding:12px;border-radius:12px;background:rgba(5,19,28,.45);display:grid;gap:4px}.lr-context span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#718a9a}.lr-context strong{font-size:12px}.lr-table-wrap{overflow:auto;margin-top:15px}.lr-table{width:100%;border-collapse:collapse;font-size:11px}.lr-table th,.lr-table td{padding:9px;border-bottom:1px solid rgba(130,160,180,.1);text-align:left}.lr-table th{color:#7e95a4;font-size:9px;text-transform:uppercase;letter-spacing:.07em}.lr-table tr.target{background:rgba(82,164,213,.07)}.lr-target-badge{font-size:8px;background:#2c789e;color:white;padding:3px 5px;border-radius:5px;text-transform:uppercase}
    .lr-history{display:grid;grid-template-columns:1fr 1fr;gap:14px}.lr-history-list{display:grid;gap:5px}.lr-history-list button{display:flex;justify-content:space-between;align-items:center;gap:10px;border:0;background:rgba(4,18,27,.35);color:inherit;padding:10px;border-radius:10px;text-align:left;cursor:pointer}.lr-history-list button span{display:grid}.lr-history-list small{color:#7d94a3}.lr-history-list em{font-style:normal;font-size:10px;color:#75bde6}.lr-empty{padding:18px;text-align:center;color:#8096a4}.lr-empty.large{min-height:180px;display:grid;place-items:center;align-content:center;gap:5px}.lr-quick-layout{display:grid;gap:16px}.lr-page .btn:disabled{opacity:.55;cursor:not-allowed}
    .lr-map-card{margin-top:14px;border:1px solid rgba(82,164,213,.17);border-radius:15px;background:rgba(4,18,27,.34);overflow:hidden}.lr-map-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;padding:13px 14px;border-bottom:1px solid rgba(130,160,180,.1)}.lr-map-head>div{display:grid;gap:3px}.lr-map-head small{color:#8197a5;max-width:680px}.lr-map-head>span{font-size:10px;color:#83a3b6;white-space:nowrap}.lr-adjust-map{height:330px;background:#0a1c28;position:relative}.lr-adjust-map.large{height:430px}.lr-map-message{height:100%;min-height:260px;display:grid;place-items:center;align-content:center;text-align:center;gap:5px;padding:20px;color:#8da2b0}.lr-map-message strong{color:#dce7ed}.lr-map-foot{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 13px;font-size:10px;color:#8ca1af}.lr-map-foot span{display:flex;align-items:center;gap:5px}.lr-map-foot i{width:9px;height:9px;border-radius:50%}.lr-map-foot i.profile{background:#24b7b1}.lr-map-foot i.center{background:#2c8fbd}.lr-map-foot i.grid{background:#718999}.lr-map-foot .btn{margin-left:auto}.lr-map-center-marker{width:38px;height:38px;border-radius:50%;background:#217fae;border:4px solid white;box-shadow:0 6px 18px rgba(0,0,0,.3);display:grid;place-items:center;color:white;font-size:24px;font-weight:800;cursor:grab}.lr-map-center-marker:active{cursor:grabbing}.lr-map-profile-marker{width:18px;height:18px;border-radius:50%;background:#24b7b1;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,.25)}.maplibregl-map{font-family:Poppins,Arial,sans-serif}.maplibregl-ctrl-attrib{font-size:9px!important}
    .lr-client-info{margin-top:18px}.lr-client-info-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:13px}.lr-client-info-status{display:grid;gap:2px;padding-left:10px;border-left:3px solid #d6a52c}.lr-client-info-status.ready{border-color:#2ca66f}.lr-client-info-status span{font-size:11px;color:#8197a5}.lr-inline-actions{display:flex;gap:7px}.lr-info-grid .full{grid-column:1/-1}.lr-check-card{display:flex!important;gap:10px!important;align-items:center!important;padding:10px;border-radius:10px;background:rgba(82,164,213,.05)}.lr-check-card span{display:grid}.lr-check-card small{color:#7f95a4}.lr-info-actions{justify-content:flex-end}.lr-skeleton{height:80px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,255,255,.07),rgba(255,255,255,.03));animation:lrPulse 1.2s infinite}@keyframes lrPulse{50%{opacity:.55}}
    @media(max-width:1100px){.lr-shell{grid-template-columns:1fr}.lr-sidebar{position:relative;top:auto;max-height:none}.lr-client-list{grid-template-columns:repeat(2,minmax(0,1fr))}.lr-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lr-result-layout{grid-template-columns:1fr}}
    @media(max-width:700px){.lr-page-head h1{font-size:32px}.lr-page-tabs{width:100%}.lr-page-tabs button{flex:1}.lr-client-list,.lr-form-grid,.lr-summary,.lr-history{grid-template-columns:1fr}.lr-form-grid .wide{grid-column:auto}.lr-input-action{grid-template-columns:1fr}.lr-auto-row{grid-template-columns:auto 1fr}.lr-day{grid-column:1/-1}.lr-panel-actions{flex-direction:column}.lr-result-layout{display:block}.lr-result-aside{margin-top:12px}}
  `;
  document.head.appendChild(style);

  window.__LEME_LOCAL_RADAR_VERSION__ = VERSION;
  setTimeout(initVisibleRadarMaps, 80);
})();