function renderLemeArtModeSwitch(selected = 'static') {
  const mode = selected === 'carousel' ? 'carousel' : 'static';
  return `
    <div class="leme-art-mode-switch" role="group" aria-label="Tipo de criação">
      <button
        type="button"
        class="${mode === 'static' ? 'active' : ''}"
        aria-pressed="${mode === 'static' ? 'true' : 'false'}"
        onclick="setLemeArtPageMode('static')">
        <strong>Feed estático</strong>
        <small>Uma arte por vez</small>
      </button>
      <button
        type="button"
        class="${mode === 'carousel' ? 'active' : ''}"
        aria-pressed="${mode === 'carousel' ? 'true' : 'false'}"
        onclick="setLemeArtPageMode('carousel')">
        <strong>Carrossel</strong>
        <small>Slides independentes</small>
      </button>
    </div>
  `;
}

function getLemeArtSlideSummary(slide) {
  const text = normalizeLemeArtText(slide?.text || '');
  return text || 'Slide ainda sem texto';
}

function renderLemeArtCarousel(scope = 'page-carousel', options = {}) {
  const carousel = getLemeArtCarousel(scope);
  const compact = Boolean(options.compact);
  const activeIndex = Math.max(0, carousel.slides.findIndex(slide => slide.id === carousel.activeSlideId));
  const activeSlide = carousel.slides[activeIndex] || carousel.slides[0];
  const prefix = `leme_art_${scope}`;

  return `
    <div class="leme-art-carousel ${compact ? 'is-compact' : ''}" id="${prefix}_workspace">
      <div class="leme-art-carousel-header">
        <div>
          <strong>Slides do carrossel</strong>
          <small>Cada slide tem modelo, texto, fonte e imagens próprios.</small>
        </div>
        <div class="leme-art-carousel-header-actions">
          <span>${carousel.slides.length}/${LEME_ART_CAROUSEL_MAX_SLIDES} slides</span>
          <button class="btn secondary small" type="button" onclick="addLemeArtCarouselSlide('${escapeAttr(scope)}')">＋ Novo slide</button>
          <button class="btn small" id="${prefix}_export_all" type="button" onclick="exportLemeArtCarousel('${escapeAttr(scope)}')">Exportar carrossel</button>
        </div>
      </div>

      <div class="leme-art-carousel-strip" role="tablist" aria-label="Slides do carrossel">
        ${carousel.slides.map((slide, index) => `
          <button
            type="button"
            role="tab"
            aria-selected="${slide.id === activeSlide.id ? 'true' : 'false'}"
            class="leme-art-slide-tab ${slide.id === activeSlide.id ? 'active' : ''}"
            onclick="selectLemeArtCarouselSlide('${escapeAttr(scope)}', '${escapeAttr(slide.id)}')">
            <span>${String(index + 1).padStart(2, '0')}</span>
            <span>
              <strong>${escapeHtml(LEME_ART_TEMPLATES[normalizeLemeArtTemplate(slide.template)])}</strong>
              <small>${escapeHtml(getLemeArtSlideSummary(slide))}</small>
            </span>
          </button>
        `).join('')}
      </div>

      <div class="leme-art-slide-toolbar">
        <div>
          <strong>Editando slide ${activeIndex + 1}</strong>
          <small>As alterações abaixo afetam somente este slide.</small>
        </div>
        <div>
          <button type="button" class="btn secondary small" ${activeIndex === 0 ? 'disabled' : ''} onclick="moveLemeArtCarouselSlide('${escapeAttr(scope)}', -1)" title="Mover slide para a esquerda">←</button>
          <button type="button" class="btn secondary small" ${activeIndex === carousel.slides.length - 1 ? 'disabled' : ''} onclick="moveLemeArtCarouselSlide('${escapeAttr(scope)}', 1)" title="Mover slide para a direita">→</button>
          <button type="button" class="btn secondary small" onclick="duplicateLemeArtCarouselSlide('${escapeAttr(scope)}')">Duplicar</button>
          <button type="button" class="btn danger small" ${carousel.slides.length === 1 ? 'disabled' : ''} onclick="removeLemeArtCarouselSlide('${escapeAttr(scope)}')">Excluir slide</button>
        </div>
      </div>

      ${renderLemeArtEditor(scope, { compact, carousel: true })}

      <div class="leme-art-carousel-export-note">
        <strong>Exportação completa</strong>
        <span>Um único ZIP com todos os slides em <b>Feed 1080 × 1350</b> e <b>Story 1080 × 1920</b>, numerados na ordem acima. As fotos ficam somente nesta sessão do navegador e não são gravadas no banco.</span>
      </div>
    </div>
  `;
}

function renderLemeArtPageWorkspace() {
  return `
    <div id="leme_art_page_workspace">
      ${renderLemeArtModeSwitch(lemeArtPageMode)}
      ${lemeArtPageMode === 'carousel'
        ? renderLemeArtCarousel('page-carousel')
        : renderLemeArtEditor('page')}
    </div>
  `;
}

function setLemeArtPageMode(mode) {
  lemeArtPageMode = mode === 'carousel' ? 'carousel' : 'static';
  const workspace = document.getElementById('leme_art_page_workspace');
  if (!workspace) return;
  workspace.outerHTML = renderLemeArtPageWorkspace();
  initializeLemeArtCanvases();
}

function refreshLemeArtCarousel(scope) {
  const workspace = document.getElementById(`leme_art_${scope}_workspace`);
  if (!workspace) return;
  const compact = workspace.classList.contains('is-compact');
  workspace.outerHTML = renderLemeArtCarousel(scope, { compact });
  initializeLemeArtCanvases();
}

function selectLemeArtCarouselSlide(scope, slideId) {
  const carousel = getLemeArtCarousel(scope);
  if (!carousel.slides.some(slide => slide.id === slideId)) return;
  carousel.activeSlideId = slideId;
  refreshLemeArtCarousel(scope);
}

function addLemeArtCarouselSlide(scope) {
  const carousel = getLemeArtCarousel(scope);
  if (carousel.slides.length >= LEME_ART_CAROUSEL_MAX_SLIDES) {
    toast(`O carrossel aceita até ${LEME_ART_CAROUSEL_MAX_SLIDES} slides.`);
    return;
  }
  const slide = createLemeArtDraft({}, { text: '', textCustomized: true });
  carousel.slides.push(slide);
  carousel.activeSlideId = slide.id;
  refreshLemeArtCarousel(scope);
}

function duplicateLemeArtCarouselSlide(scope) {
  const carousel = getLemeArtCarousel(scope);
  if (carousel.slides.length >= LEME_ART_CAROUSEL_MAX_SLIDES) {
    toast(`O carrossel aceita até ${LEME_ART_CAROUSEL_MAX_SLIDES} slides.`);
    return;
  }
  const index = carousel.slides.findIndex(slide => slide.id === carousel.activeSlideId);
  const source = carousel.slides[index] || carousel.slides[0];
  const copy = createLemeArtDraft({ ...source, id: uid(), textCustomized: true });
  carousel.slides.splice(index + 1, 0, copy);
  carousel.activeSlideId = copy.id;
  refreshLemeArtCarousel(scope);
  toast('Slide duplicado.');
}

function removeLemeArtCarouselSlide(scope) {
  const carousel = getLemeArtCarousel(scope);
  if (carousel.slides.length <= 1) {
    toast('O carrossel precisa ter pelo menos um slide.');
    return;
  }
  const index = carousel.slides.findIndex(slide => slide.id === carousel.activeSlideId);
  carousel.slides.splice(Math.max(0, index), 1);
  carousel.activeSlideId = carousel.slides[Math.min(Math.max(0, index), carousel.slides.length - 1)].id;
  refreshLemeArtCarousel(scope);
}

function moveLemeArtCarouselSlide(scope, direction) {
  const carousel = getLemeArtCarousel(scope);
  const from = carousel.slides.findIndex(slide => slide.id === carousel.activeSlideId);
  const to = from + (Number(direction) < 0 ? -1 : 1);
  if (from < 0 || to < 0 || to >= carousel.slides.length) return;
  const [slide] = carousel.slides.splice(from, 1);
  carousel.slides.splice(to, 0, slide);
  refreshLemeArtCarousel(scope);
}

function renderLemeArtPage() {
  return `
    <section class="card leme-art-page">
      <div class="section-title leme-art-page-title">
        <div>
          <p class="eyebrow">Estúdio interno</p>
          <h2>Artes da LEME</h2>
          <small>Crie artes prontas para Feed (1080 × 1350) e Story (1080 × 1920).</small>
        </div>
        <span class="badge">Exclusivo LEME</span>
      </div>

      <div class="leme-art-template-guide" aria-label="Modelos disponíveis">
        <article>
          <span>01</span>
          <div><strong>Twitter Texto</strong><small>Tag compacta à esquerda e frase em Poppins Light.</small></div>
        </article>
        <article>
          <span>02</span>
          <div><strong>Twitter Texto + imagem</strong><small>Poppins Light com foto de cantos arredondados.</small></div>
        </article>
        <article>
          <span>03</span>
          <div><strong>Twitter Texto + 2 imagens</strong><small>Duas fotos alinhadas lado a lado, com margens e cantos arredondados.</small></div>
        </article>
        <article>
          <span>04</span>
          <div><strong>Texto manuscrito</strong><small>Frase centralizada com a fonte Elegant Bloom.</small></div>
        </article>
      </div>

      ${renderLemeArtPageWorkspace()}
    </section>
  `;
}

function renderLemePostArtGenerator(postFormat = '') {
  const isCarousel = String(postFormat || '').toLowerCase() === 'carrossel';
  return `
    <section class="full leme-post-art-card" id="leme_post_art_generator">
      <div class="leme-post-art-title">
        <div>
          <strong>${isCarousel ? 'Criar carrossel da LEME' : 'Criar arte da LEME'}</strong>
          <small>${isCarousel
            ? 'Edite cada slide separadamente e exporte o conjunto inteiro em Feed e Story.'
            : 'O texto começa com o título da publicação e pode ser ajustado antes de baixar.'}</small>
        </div>
        <span>${isCarousel ? 'Slides independentes' : 'Feed + Story'}</span>
      </div>
      ${isCarousel
        ? renderLemeArtCarousel('modal-carousel', { compact: true })
        : renderLemeArtEditor('modal', { compact: true })}
    </section>
  `;
}

function syncLemeArtTextFromPostTitle(value) {
  if (String(val('p_cliente_id') || '') !== LEME_CLIENT_ID) return;
  const nextText = String(value || '');
  const staticDraft = getLemeArtDraft('modal');
  if (!staticDraft.textCustomized) {
    staticDraft.text = nextText;
    const input = document.getElementById('leme_art_modal_text');
    if (input) input.value = staticDraft.text;
    const count = document.getElementById('leme_art_modal_count');
    if (count) count.textContent = `${staticDraft.text.length}/900`;
    if (document.getElementById('leme_art_modal_canvas')) scheduleLemeArtPreview('modal');
  }

  const carousel = getLemeArtCarousel('modal-carousel');
  const firstSlide = carousel.slides[0];
  if (carousel.slides.length === 1 && firstSlide && !firstSlide.textCustomized) {
    firstSlide.text = nextText;
    const input = document.getElementById('leme_art_modal-carousel_text');
    if (input) input.value = firstSlide.text;
    const count = document.getElementById('leme_art_modal-carousel_count');
    if (count) count.textContent = `${firstSlide.text.length}/900`;
    if (document.getElementById('leme_art_modal-carousel_canvas')) scheduleLemeArtPreview('modal-carousel');
  }
}

function handleLemeArtTextInput(scope, value) {
  const draft = getLemeArtDraft(scope);
  draft.text = String(value || '');
  if (getLemeArtScopeKey(scope) === 'modal') draft.textCustomized = true;

  const count = document.getElementById(`leme_art_${scope}_count`);
  if (count) count.textContent = `${draft.text.length}/900`;
  scheduleLemeArtPreview(scope);
}

function setLemeArtTemplate(scope, value) {
  const draft = getLemeArtDraft(scope);
  draft.template = normalizeLemeArtTemplate(value);

  const select = document.getElementById(`leme_art_${scope}_template`);
  if (select && select.value !== draft.template) select.value = draft.template;

  syncLemeArtFontControls(scope);
  syncLemeArtImageControls(scope);
  scheduleLemeArtPreview(scope);
}
