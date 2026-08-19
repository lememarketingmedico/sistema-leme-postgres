(() => {
  const LEME_CALENDAR_N8N_URL = 'https://n8n.adati.app.br/webhook/criar-calendario-leme';
  const LEME_DRIVE_STORAGE_KEY = 'lemeflow_leme_drive_v1';

  function readLemeDrive() {
    try {
      const profile = typeof getLemeProfile === 'function' ? getLemeProfile() : null;
      return String(profile?.drive_url || profile?.drive || localStorage.getItem(LEME_DRIVE_STORAGE_KEY) || '').trim();
    } catch {
      return String(localStorage.getItem(LEME_DRIVE_STORAGE_KEY) || '').trim();
    }
  }

  function persistLemeDrive(value) {
    const drive = String(value || '').trim();
    try { localStorage.setItem(LEME_DRIVE_STORAGE_KEY, drive); } catch {}
    try {
      const profile = typeof getLemeProfile === 'function' ? getLemeProfile() : null;
      if (profile && typeof profile === 'object') profile.drive_url = drive;
    } catch {}
    return drive;
  }

  // Campo "Drive da LEME" dentro das informações da própria LEME.
  if (typeof renderLemeInformation === 'function') {
    const previousRenderLemeInformation = renderLemeInformation;
    renderLemeInformation = function() {
      let html = previousRenderLemeInformation();
      const drive = readLemeDrive();
      if (!html.includes('id="leme_drive_url"')) {
        const field = `
          <label class="full">Drive da LEME
            <input class="input" id="leme_drive_url" type="url" value="${escapeAttr(drive)}" placeholder="https://drive.google.com/drive/folders/...">
            <small>Pasta principal usada pelo fluxo exclusivo de criação do calendário mensal da LEME.</small>
          </label>`;
        const saveMarker = '<button class="btn" type="button" onclick="saveLemeInformation()">Salvar informações da LEME</button>';
        if (html.includes(saveMarker)) html = html.replace(saveMarker, `${field}${saveMarker}`);
        else html += field;
      }

      const saveMarker = '<button class="btn" type="button" onclick="saveLemeInformation()">Salvar informações da LEME</button>';
      if (html.includes(saveMarker) && !html.includes('triggerLemeMonthlyCalendar')) {
        html = html.replace(saveMarker, `${saveMarker}<button class="btn secondary" type="button" onclick="triggerLemeMonthlyCalendar(this)">Criar calendário mensal da LEME</button>`);
      }
      return html;
    };
  }

  if (typeof saveLemeInformation === 'function') {
    const previousSaveLemeInformation = saveLemeInformation;
    saveLemeInformation = function(...args) {
      persistLemeDrive(document.getElementById('leme_drive_url')?.value || readLemeDrive());
      return previousSaveLemeInformation.apply(this, args);
    };
    window.saveLemeInformation = saveLemeInformation;
  }

  // Webhook exclusivo da LEME. Não reaproveita nem altera o fluxo mensal dos clientes.
  window.triggerLemeMonthlyCalendar = async function(button = null) {
    const driveUrl = persistLemeDrive(document.getElementById('leme_drive_url')?.value || readLemeDrive());
    if (!driveUrl) {
      toast('Preencha e salve o campo “Drive da LEME” antes de criar o calendário.');
      return;
    }

    const original = button?.textContent || 'Criar calendário mensal da LEME';
    if (button) {
      button.disabled = true;
      button.textContent = 'Enviando para o n8n...';
    }

    let profile = {};
    try { profile = getLemeProfile() || {}; } catch {}
    const now = new Date();
    const payload = {
      action: 'create_leme_monthly_calendar',
      source: 'sistema_leme_postgres',
      triggered_at: now.toISOString(),
      cliente_id: LEME_CLIENT_ID,
      calendar_scope: 'leme_only',
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      drive_url: driveUrl,
      leme: {
        id: LEME_CLIENT_ID,
        nome: profile?.nome || 'LEME',
        drive_url: driveUrl
      },
      publication_target: {
        cliente_id: LEME_CLIENT_ID,
        calendar: 'LEME'
      },
      instruction: 'Fluxo EXCLUSIVO da LEME. Criar apenas cards no calendário da LEME usando cliente_id=leme-interno. Não alterar, recriar ou disparar calendários de clientes.'
    };

    try {
      const response = await fetch(LEME_CALENDAR_N8N_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || result?.message || `n8n respondeu ${response.status}`);
      }
      toast('Fluxo mensal da LEME acionado com sucesso.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível acionar o fluxo mensal da LEME.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  };
})();
