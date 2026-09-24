(() => {
  'use strict';

  const VERSION = '112.29-safe';
  const BUTTON_CLASS = 'lr-whatsapp-send-test';

  function notify(message) {
    try {
      if (typeof window.toast === 'function') window.toast(message);
      else console.log('[Local Radar]', message);
    } catch {}
  }

  function selectedClientId() {
    if (window.__LEME_RADAR_SELECTED_CLIENT_ID__) {
      return String(window.__LEME_RADAR_SELECTED_CLIENT_ID__);
    }
    const active = document.querySelector('.lr-client-list button.active');
    const source = active?.getAttribute('onclick') || '';
    const match = source.match(/localRadarSelectClient\(['"]([^'"]+)['"]/);
    return match ? String(match[1]) : '';
  }

  async function requestJson(url, options = {}) {
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    };
    const finalHeaders = typeof window.lemeAuthHeaders === 'function'
      ? window.lemeAuthHeaders(headers)
      : headers;

    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: finalHeaders
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || data?.message || ('Erro HTTP ' + response.status));
    }
    return data;
  }

  async function waitForScan(jobId) {
    const startedAt = Date.now();
    while (true) {
      const data = await requestJson('/api/local-radar/scan/jobs/' + encodeURIComponent(jobId));
      const job = data.job || {};
      if (job.status === 'done' && job.scan) return job.scan;
      if (job.status === 'error') {
        throw new Error(job.error || 'A análise não pôde ser concluída.');
      }
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        throw new Error('A análise ultrapassou 15 minutos.');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async function runAndSend() {
    if (window.__LEME_RADAR_WA_BUSY__) return;

    const clientId = selectedClientId();
    if (!clientId) {
      notify('Selecione um cliente antes de enviar.');
      return;
    }

    window.__LEME_RADAR_WA_BUSY__ = true;
    syncButtonState();

    try {
      if (typeof window.localRadarSaveMain === 'function') {
        await window.localRadarSaveMain();
      }

      notify('Rodando uma nova análise para enviar ao WhatsApp...');
      const started = await requestJson('/api/local-radar/scan/start', {
        method: 'POST',
        body: JSON.stringify({ client_id: clientId })
      });

      const jobId = started?.job?.id;
      if (!jobId) throw new Error('O servidor não iniciou a análise.');

      const scan = await waitForScan(jobId);
      if (!scan?.id) throw new Error('A análise terminou sem gerar uma rodada.');

      notify('Gerando o relatório e enviando pelo n8n...');
      const reportData = await requestJson('/api/local-radar/reports', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          scan_id: scan.id,
          month_key: 'manual-whatsapp-' + Date.now()
        })
      });

      const report = reportData?.report;
      if (!report?.id) throw new Error('O relatório não foi criado.');

      const sent = await requestJson(
        '/api/local-radar/reports/' + encodeURIComponent(report.id) + '/send-whatsapp',
        { method: 'POST', body: JSON.stringify({}) }
      );

      if (sent?.delivery?.ok === false) {
        throw new Error(sent.delivery.error || 'O n8n não confirmou o envio.');
      }

      notify('Relatório enviado para o grupo da LEME.');

      try {
        if (typeof window.localRadarSelectClient === 'function') {
          await window.localRadarSelectClient(clientId, true);
        }
        if (typeof window.localRadarOpenScan === 'function') {
          await window.localRadarOpenScan(scan.id);
        }
      } catch {}
    } catch (error) {
      console.error('Local Radar WhatsApp:', error);
      notify(error?.message || 'Não foi possível enviar o relatório.');
    } finally {
      window.__LEME_RADAR_WA_BUSY__ = false;
      syncButtonState();
    }
  }

  function syncButtonState() {
    document.querySelectorAll('.' + BUTTON_CLASS).forEach(button => {
      const busy = Boolean(window.__LEME_RADAR_WA_BUSY__);
      button.disabled = busy;
      button.textContent = busy ? 'Rodando e enviando...' : 'Rodar e enviar no WhatsApp';
    });
  }

  function ensureButton() {
    const monthly = document.getElementById('lr_monthly');
    const row = monthly?.closest('.lr-auto-row');
    if (!row || row.querySelector('.' + BUTTON_CLASS)) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary small ' + BUTTON_CLASS;
    button.textContent = 'Rodar e enviar no WhatsApp';
    button.addEventListener('click', runAndSend);
    row.appendChild(button);
    syncButtonState();
  }

  function wrapClientSelection() {
    if (window.__LEME_RADAR_SELECT_WRAPPED__) return;
    if (typeof window.localRadarSelectClient !== 'function') return;

    const original = window.localRadarSelectClient;
    window.localRadarSelectClient = async function(clientId, ...args) {
      window.__LEME_RADAR_SELECTED_CLIENT_ID__ = String(clientId || '');
      const result = await original.call(this, clientId, ...args);
      setTimeout(ensureButton, 0);
      return result;
    };
    window.__LEME_RADAR_SELECT_WRAPPED__ = true;
  }

  const style = document.createElement('style');
  style.id = 'local-radar-whatsapp-safe-v11229';
  style.textContent = `
    .lr-auto-row .${BUTTON_CLASS}{
      margin-left:auto;
      white-space:nowrap;
    }
    @media(max-width:900px){
      .lr-auto-row .${BUTTON_CLASS}{
        width:100%;
        margin-left:0;
      }
    }
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(() => {
    wrapClientSelection();
    ensureButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  wrapClientSelection();
  ensureButton();

  window.localRadarRunAndSendWhatsAppSafe = runAndSend;
  window.__LEME_LOCAL_RADAR_SAFE_PATCH_VERSION__ = VERSION;
})();
