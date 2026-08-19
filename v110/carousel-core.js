var LEME_ART_CAROUSEL_MAX_SLIDES = 20;
var lemeArtPageMode = 'static';
var lemeArtCarouselRuntime = {page:{recordKey:'page-carousel',activeSlideId:'',slides:[]},modal:{recordKey:'',activeSlideId:'',slides:[]}};
function createLemeArtDraft(data = {}, defaults = {}) {
  const source = data && typeof data === 'object' ? data : {};
  return {
    id: String(source.id || defaults.id || uid()),
    recordKey: String(source.recordKey || defaults.recordKey || ''),
    template: normalizeLemeArtTemplate(source.template || defaults.template || 'twitter-text'),
    format: normalizeLemeArtFormat(source.format || defaults.format || 'feed'),
    fontScale: normalizeLemeArtFontScale(source.fontScale ?? source.escala_fonte ?? defaults.fontScale),
    text: String(source.text ?? source.texto ?? defaults.text ?? ''),
    textCustomized: Boolean(source.textCustomized ?? defaults.textCustomized),
    imageDataUrl: String(source.imageDataUrl || ''),
    imageName: String(source.imageName || ''),
    imageElement: source.imageElement || null,
    image2DataUrl: String(source.image2DataUrl || ''),
    image2Name: String(source.image2Name || ''),
    image2Element: source.image2Element || null
  };
}

function isLemeArtCarouselScope(scope = '') {
  return String(scope || '').endsWith('-carousel');
}

function getLemeArtScopeKey(scope = 'page') {
  return String(scope || '').startsWith('modal') ? 'modal' : 'page';
}

function parseLemeArtSlides(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeLemeArtSlides(value, defaults = {}) {
  return parseLemeArtSlides(value)
    .slice(0, LEME_ART_CAROUSEL_MAX_SLIDES)
    .map((slide, index) => createLemeArtDraft(slide, {
      text: index === 0 ? String(defaults.text || '') : '',
      textCustomized: Boolean(slide?.text || slide?.texto)
    }));
}

function getLemeArtCarousel(scope = 'page-carousel') {
  const key = getLemeArtScopeKey(scope);
  const runtime = lemeArtCarouselRuntime[key];

  if (!runtime.slides.length) {
    const firstText = key === 'page' ? LEME_ART_DEFAULT_TEXT : '';
    const first = createLemeArtDraft({}, { text: firstText, recordKey: `${key}-slide-1` });
    runtime.slides = [first];
    runtime.activeSlideId = first.id;
  }

  if (!runtime.slides.some(slide => slide.id === runtime.activeSlideId)) {
    runtime.activeSlideId = runtime.slides[0].id;
  }

  return runtime;
}

function getLemeArtDraft(scope = 'page') {
  if (isLemeArtCarouselScope(scope)) {
    const carousel = getLemeArtCarousel(scope);
    const slide = carousel.slides.find(item => item.id === carousel.activeSlideId) || carousel.slides[0];
    slide.template = normalizeLemeArtTemplate(slide.template);
    slide.format = normalizeLemeArtFormat(slide.format);
    slide.fontScale = normalizeLemeArtFontScale(slide.fontScale);
    return slide;
  }

  const key = getLemeArtScopeKey(scope);
  if (!lemeArtRuntime[key]) {
    lemeArtRuntime[key] = createLemeArtDraft({}, { id: key, recordKey: key });
  }
  lemeArtRuntime[key].template = normalizeLemeArtTemplate(lemeArtRuntime[key].template);
  lemeArtRuntime[key].format = normalizeLemeArtFormat(lemeArtRuntime[key].format);
  lemeArtRuntime[key].fontScale = normalizeLemeArtFontScale(lemeArtRuntime[key].fontScale);
  return lemeArtRuntime[key];
}

function prepareLemeArtModalDraft(post = null) {
  const recordKey = post
    ? String(post.registro_id || post.id || '')
    : 'nova-publicacao';
  const current = getLemeArtDraft('modal');

  if (current.recordKey === recordKey && lemeArtCarouselRuntime.modal.recordKey === recordKey) return current;

  const savedText = String(post?.arte_texto || '').trim();
  lemeArtRuntime.modal = {
    recordKey,
    template: normalizeLemeArtTemplate(post?.arte_modelo || 'twitter-text'),
    format: normalizeLemeArtFormat(post?.arte_formato || 'feed'),
    fontScale: normalizeLemeArtFontScale(post?.arte_escala_fonte),
    text: savedText || String(post?.titulo || ''),
    textCustomized: Boolean(savedText && savedText !== String(post?.titulo || '').trim()),
    imageDataUrl: '',
    imageName: '',
    imageElement: null,
    image2DataUrl: '',
    image2Name: '',
    image2Element: null
  };

  const savedSlides = normalizeLemeArtSlides(post?.arte_slides, {
    text: String(post?.titulo || '')
  });
  const firstSlide = savedSlides[0] || createLemeArtDraft({}, {
    text: String(post?.titulo || ''),
    textCustomized: false,
    recordKey: `${recordKey}-slide-1`
  });
  lemeArtCarouselRuntime.modal = {
    recordKey,
    activeSlideId: firstSlide.id,
    slides: savedSlides.length ? savedSlides : [firstSlide]
  };

  return lemeArtRuntime.modal;
}

function resetLemeArtModalDraft() {
  lemeArtRuntime.modal = {
    recordKey: '',
    template: 'twitter-text',
    format: 'feed',
    fontScale: LEME_ART_FONT_SCALE.default,
    text: '',
    textCustomized: false,
    imageDataUrl: '',
    imageName: '',
    imageElement: null,
    image2DataUrl: '',
    image2Name: '',
    image2Element: null
  };
  lemeArtCarouselRuntime.modal = {
    recordKey: '',
    activeSlideId: '',
    slides: []
  };
}

function serializeLemeArtCarouselSlides(scope = 'modal-carousel') {
  return getLemeArtCarousel(scope).slides.map(slide => ({
    id: String(slide.id || uid()),
    template: normalizeLemeArtTemplate(slide.template),
    format: normalizeLemeArtFormat(slide.format),
    fontScale: normalizeLemeArtFontScale(slide.fontScale),
    text: normalizeLemeArtText(slide.text)
  }));
}
