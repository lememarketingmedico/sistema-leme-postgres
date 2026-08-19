(() => {
  const LEME_CALENDAR_N8N_URL = 'https://n8n.adati.app.br/webhook/criar-calendario-leme';

  // ---------- Referências em publicações ----------
  const oldCollectPostV1105 = collectPost;
  collectPost = function() {
    const record = oldCollectPostV1105();
    const field = document.getElementById('p_referencias');
    return {
      ...record,
      referencias: field ? String(field.value || '').trim() : String(record.referencias || '')
    };
  };

  function referenceFieldHtml(post = null) {
    return `
      <label class="full leme-reference-field">Referências
        <textarea class="textarea" id="p_referencias" rows="4" placeholder="Cole links, inspirações, posts, sites ou observações de referência. Um por linha.">${escapeHtml(post?.referencias || '')}</textarea>
        <small>Esse campo fica salvo junto da publicação e pode ser consultado depois.</small>
      </label>`;
  }

  function injectReferenceField(postId = '') {
    if (document.getElementById('p_referencias')) return;
    const post = getPosts().find(item => String(item.registro_id || item.id || '') === String(postId || '')) || null;
    const modals = [...document.querySelectorAll('.modal')];
    const modal = modals.reverse().find(node => node.querySelector('#p_titulo, #p_cliente_id, #p_legenda'));
    if (!modal) return;
    const anchor = modal.querySelector('#p_legenda')?.closest('label') || modal.querySelector('#p_tema')?.closest('label') || modal.querySelector('.form-grid');
    if (!anchor) return;
    const holder = document.createElement('div');
    holder.innerHTML = referenceFieldHtml(post);
    const field = holder.firstElementChild;
    if (anchor.matches?.('.form-grid')) anchor.appendChild(field);
    else anchor.insertAdjacentElement('afterend', field);
  }

  if (typeof openPostModal === 'function') {
    const oldOpenPostModalV1105 = openPostModal;
    openPostModal = function(clientId = null, postId = null, date = null) {
      const result = oldOpenPostModalV1105(clientId, postId, date);
      requestAnimationFrame(() => injectReferenceField(postId));
      setTimeout(() => injectReferenceField(postId), 60);
      return result;
    };
    window.openPostModal = openPostModal;
  }

  // ---------- Calendário exclusivo da LEME ----------
  window.triggerLemeMonthlyCalendar = async function(button = null) {
    const profile = getLemeProfile();
    const driveUrl = String(profile?.drive_url || val('leme_drive_url') || '').trim();
    if (!driveUrl) {
      toast('Preencha e salve o campo “Drive da LEME” antes de criar o calendário.');
      return;
    }

    const original = button?.textContent || 'Criar calendário da LEME';
    if (button) {
      button.disabled = true;
      button.textContent = 'Enviando para o n8n...';
    }

    const payload = {
      action: 'create_leme_monthly_calendar',
      source: 'sistema_leme_postgres',
      triggered_at: new Date().toISOString(),
      cliente_id: LEME_CLIENT_ID,
      leme: {
        id: LEME_CLIENT_ID,
        nome: profile?.nome || 'LEME',
        drive_url: driveUrl
      },
      drive_url: driveUrl,
      instruction: 'Fluxo EXCLUSIVO da LEME. Criar o calendário editorial mensal da agência e, para cada publicação, usar o endpoint normal de criação de publicação com cliente_id=leme-interno. Não alterar calendários dos clientes.'
    };

    try {
      const response = await fetch(LEME_CALENDAR_N8N_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) throw new Error(result?.error || result?.message || `n8n respondeu ${response.status}`);
      toast('Fluxo do calendário da LEME acionado.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Não foi possível acionar o fluxo da LEME.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  };

  if (typeof renderLemeInformation === 'function') {
    const oldRenderLemeInformationV1105 = renderLemeInformation;
    renderLemeInformation = function() {
      let html = oldRenderLemeInformationV1105();
      const marker = '<button class="btn" type="button" onclick="saveLemeInformation()">Salvar informações da LEME</button>';
      if (html.includes(marker)) {
        html = html.replace(marker, `${marker}<button class="btn secondary" type="button" onclick="triggerLemeMonthlyCalendar(this)">Criar calendário da LEME</button>`);
      }
      return html;
    };
  }

  // ---------- == Palavra => bullet point ----------
  const oldParseMarkupV1105 = parseLemeArtMarkup;
  parseLemeArtMarkup = function(value) {
    const source = String(value || '')
      .replace(/(^|\n)\s*==\s*/g, '$1• ');
    return oldParseMarkupV1105(source);
  };

  if (typeof renderLemeArtEditor === 'function') {
    const oldRenderLemeArtEditorV1105 = renderLemeArtEditor;
    renderLemeArtEditor = function(scope = 'page', options = {}) {
      let html = oldRenderLemeArtEditorV1105(scope, options);
      const helpEnd = '</div>\n\n        <div id="leme_art_';
      const bullet = '<span><code>== Palavra</code> cria um bullet point</span>';
      const firstHelp = html.indexOf('class="leme-art-markup-help"');
      if (firstHelp !== -1) {
        const closing = html.indexOf('</div>', firstHelp);
        if (closing !== -1) html = html.slice(0, closing) + bullet + html.slice(closing);
      }
      return html;
    };
  }
})();
