(() => {
  const TEMPLATE = 'gradient-photo';
  const DEFAULT_COLOR = '#52a4d5';
  const STORAGE_KEY = 'leme_art_v1104_colors';
  const WHITE_LOGO = 'logo-horizontal-white.png?v=110.4';
  let logoPromise = null;

  LEME_ART_TEMPLATES[TEMPLATE] = 'Foto + gradiente';
  LEME_ART_BASE_FONT_SIZES[TEMPLATE] = 132;

  const normColor = (v, fb = DEFAULT_COLOR) => {
    const s = String(v || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toLowerCase()}`;
    return fb;
  };
  const clamp = v => Math.max(0, Math.min(100, Number.isFinite(Number(v)) ? Number(v) : 50));

  function enhance(d) {
    if (!d || typeof d !== 'object') return d;
    d.highlightColor = normColor(d.highlightColor || d.cor_destaque || DEFAULT_COLOR);
    d.imagePositionX = clamp(d.imagePositionX);
    d.imagePositionY = clamp(d.imagePositionY);
    return d;
  }

  const oldCreate = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) {
    const d = oldCreate(data, defaults);
    d.highlightColor = normColor(data.highlightColor ?? data.cor_destaque ?? defaults.highlightColor ?? DEFAULT_COLOR);
    return enhance(d);
  };

  const oldGet = getLemeArtDraft;
  getLemeArtDraft = scope => enhance(oldGet(scope));

  const oldPrepare = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    const d = oldPrepare(post);
    if (post) d.highlightColor = normColor(post.arte_cor_destaque || post.highlightColor || DEFAULT_COLOR);
    return enhance(d);
  };

  const oldSerialize = serializeLemeArtCarouselSlides;
  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    const c = getLemeArtCarousel(scope);
    return oldSerialize(scope).map((s, i) => ({ ...s, highlightColor: normColor(c.slides[i]?.highlightColor || DEFAULT_COLOR) }));
  };

  const oldCollect = collectPost;
  collectPost = function() {
    const r = oldCollect();
    if (String(r.cliente_id || '') !== LEME_CLIENT_ID) return r;
    const d = getLemeArtDraft('modal');
    return { ...r, arte_cor_destaque: normColor(d.highlightColor), arte_slides: serializeLemeArtCarouselSlides('modal-carousel') };
  };

  function readColorState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
  }
  function saveColor(scope) {
    if (!String(scope || '').startsWith('page')) return;
    const state = readColorState();
    if (scope === 'page') state.page = getLemeArtDraft(scope).highlightColor;
    else {
      const c = getLemeArtCarousel(scope);
      state.slides = Object.fromEntries(c.slides.map(s => [s.id, normColor(s.highlightColor)]));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  try {
    const state = readColorState();
    if (state.page) getLemeArtDraft('page').highlightColor = normColor(state.page);
    if (state.slides) getLemeArtCarousel('page-carousel').slides.forEach(s => { if (state.slides[s.id]) s.highlightColor = normColor(state.slides[s.id]); });
  } catch {}

  window.setLemeArtHighlightColor = function(scope, value) {
    const d = getLemeArtDraft(scope);
    d.highlightColor = normColor(value, d.highlightColor);
    const p = document.getElementById(`leme_art_${scope}_highlight_color`);
    const h = document.getElementById(`leme_art_${scope}_highlight_hex`);
    if (p) p.value = d.highlightColor;
    if (h) h.value = d.highlightColor.toUpperCase();
    saveColor(scope);
    scheduleLemeArtPreview(scope);
  };
  window.commitLemeArtHighlightHex = function(scope, input) {
    const d = getLemeArtDraft(scope);
    const c = normColor(input?.value, d.highlightColor);
    if (input) input.value = c.toUpperCase();
    setLemeArtHighlightColor(scope, c);
  };

  function colorControl(scope, d) {
    const c = normColor(d.highlightColor);
    return `<div class="leme-art-v1104-color-control"><div><span>Cor destacada</span><small>Use <code>[texto]</code> para aplicar esta cor.</small></div><div class="leme-art-v1104-color-picker"><input id="leme_art_${scope}_highlight_color" class="leme-art-v1104-color-swatch" type="color" value="${c}" oninput="setLemeArtHighlightColor('${escapeAttr(scope)}',this.value)"><input id="leme_art_${scope}_highlight_hex" class="input leme-art-v1104-color-hex" value="${c.toUpperCase()}" maxlength="7" onchange="commitLemeArtHighlightHex('${escapeAttr(scope)}',this)"></div></div>`;
  }

  function gradientControls(scope) {
    const d = getLemeArtDraft(scope);
    const show = d.template === TEMPLATE;
    return `<div id="leme_art_${scope}_gradient_group" class="leme-art-v1104-gradient-group ${show ? '' : 'hidden'}"><div class="leme-art-v1104-gradient-heading"><strong>Imagem de fundo</strong><small>A foto ocupa a arte inteira e recebe o gradiente preto automaticamente.</small></div>${renderLemeArtImageDropzone(scope,'gradient','primary','Imagem de fundo',TEMPLATE,d)}<div class="leme-art-position-card"><div class="leme-art-position-title"><strong>Posicionar imagem de fundo</strong><button class="btn secondary small" type="button" onclick="centerLemeArtImage('${escapeAttr(scope)}','primary')">Centralizar</button></div><label>Horizontal <span>${Math.round(d.imagePositionX)}%</span><input type="range" min="0" max="100" step="1" value="${d.imagePositionX}" oninput="setLemeArtImagePosition('${escapeAttr(scope)}','primary','x',this.value);this.previousElementSibling.textContent=Math.round(this.value)+'%'"></label><label>Vertical <span>${Math.round(d.imagePositionY)}%</span><input type="range" min="0" max="100" step="1" value="${d.imagePositionY}" oninput="setLemeArtImagePosition('${escapeAttr(scope)}','primary','y',this.value);this.previousElementSibling.textContent=Math.round(this.value)+'%'"></label><small>Mova a foto até o enquadramento ficar como você quer.</small></div></div>`;
  }
  function refreshGradient(scope) {
    const old = document.getElementById(`leme_art_${scope}_gradient_group`);
    if (!old) return;
    const box = document.createElement('div'); box.innerHTML = gradientControls(scope); old.replaceWith(box.firstElementChild);
  }

  const oldEditor = renderLemeArtEditor;
  renderLemeArtEditor = function(scope = 'page', options = {}) {
    const d = getLemeArtDraft(scope);
    let html = oldEditor(scope, options);
    html = html.replace('<label>Texto da arte', `${colorControl(scope,d)}<label>Texto da arte`);
    html = html.replace('<div class="leme-art-actions">', `${gradientControls(scope)}<div class="leme-art-actions">`);
    html = html.replace('<span><code>/texto/</code> itálico</span>', '<span><code>/texto/</code> itálico</span><span><code>[texto]</code> cor destacada</span>');
    html = html.replace('placeholder="Use *texto*, _texto_, --texto--, +texto+ ou /texto/"','placeholder="Use *texto*, _texto_, --texto--, +texto+, /texto/ ou [texto]"');
    return html;
  };

  const oldSetTemplate = setLemeArtTemplate;
  setLemeArtTemplate = function(scope, value) { const r = oldSetTemplate(scope, value); refreshGradient(scope); return r; };
  window.setLemeArtTemplate = setLemeArtTemplate;

  const oldSyncImages = syncLemeArtImageControls;
  syncLemeArtImageControls = function(scope='page') { const r = oldSyncImages(scope); refreshGradient(scope); return r; };

  parseLemeArtMarkup = function(value) {
    const source = normalizeLemeArtText(value), plain = [], decorations = [], styles = [];
    const active = { circle:null, underline:null, highlight:null, bold:null, italic:null, color:null };
    const close = (type, kind) => { if (active[type] !== null && plain.length > active[type]) (kind==='decoration'?decorations:styles).push({type,start:active[type],end:plain.length}); active[type]=null; };
    for (let i=0;i<source.length;) {
      if (source.startsWith('--',i)) { if (active.highlight!==null) close('highlight','decoration'); else if (source.indexOf('--',i+2)!==-1) active.highlight=plain.length; else plain.push('-','-'); i+=2; continue; }
      const ch=source[i], map={'*':['circle','decoration'],'_':['underline','decoration'],'+':['bold','style'],'/':['italic','style']};
      if (map[ch]) { const [type,kind]=map[ch]; if(active[type]!==null) close(type,kind); else if(source.indexOf(ch,i+1)!==-1) active[type]=plain.length; else plain.push(ch); i++; continue; }
      if (ch==='[' && active.color===null && source.indexOf(']',i+1)!==-1) { active.color=plain.length; i++; continue; }
      if (ch===']' && active.color!==null) { close('color','style'); i++; continue; }
      plain.push(ch); i++;
    }
    return { source, plainText:plain.join(''), decorations, styles };
  };

  const oldDrawText = drawLemeArtText;
  drawLemeArtText = function(ctx, layout, x, y, options={}) {
    const colorStyles = (layout.styles || []).filter(s => s.type === 'color');
    if (!colorStyles.length) return oldDrawText(ctx, layout, x, y, options);
    const base = options.color || LEME_ART_CONFIG.textColor;
    const hi = normColor(window.__lemeV1104Color || DEFAULT_COLOR);
    const align = options.align || 'left';
    ctx.save(); ctx.textAlign='left'; ctx.textBaseline='top';
    drawLemeArtDecorations(ctx,layout,x,y,{...options,decorationType:'highlight'});
    drawLemeArtDecorations(ctx,layout,x,y,{...options,decorationType:'circle'});
    layout.lines.forEach((line,li)=>{
      if(!line.text) return;
      ctx.font=`${layout.fontWeight} ${layout.size}px ${layout.fontFamily}`;
      const lineWidth=ctx.measureText(line.text).width;
      let cursor=align==='center'?x-lineWidth/2:align==='right'?x-lineWidth:x;
      let start=line.start;
      const stateAt = idx => ({ color:colorStyles.some(s=>idx>=s.start&&idx<s.end), bold:(layout.styles||[]).some(s=>s.type==='bold'&&idx>=s.start&&idx<s.end), italic:(layout.styles||[]).some(s=>s.type==='italic'&&idx>=s.start&&idx<s.end) });
      let st=stateAt(start);
      const flush=end=>{ if(end<=start)return; const frag=layout.plainText.slice(start,end); ctx.font=`${st.italic?'italic ':''}${st.bold?'700':layout.fontWeight} ${layout.size}px ${layout.fontFamily}`; ctx.fillStyle=st.color?hi:base; ctx.fillText(frag,cursor,y+li*layout.lineHeight); cursor+=ctx.measureText(frag).width; start=end; };
      for(let j=line.start+1;j<line.end;j++){ const n=stateAt(j); if(n.color!==st.color||n.bold!==st.bold||n.italic!==st.italic){flush(j);st=n;} } flush(line.end);
    });
    drawLemeArtDecorations(ctx,layout,x,y,{...options,decorationType:'underline'}); ctx.restore();
  };

  function loadWhiteLogo() { if(!logoPromise) logoPromise=loadLemeArtImageSource(WHITE_LOGO).catch(e=>{logoPromise=null;throw e;}); return logoPromise; }
  async function renderGradient(draft, formatValue, targetCanvas=null) {
    const canvas=targetCanvas||document.createElement('canvas'), format=getLemeArtFormatConfig(formatValue); canvas.width=format.width; canvas.height=format.height;
    const ctx=canvas.getContext('2d'); if(!ctx)return null;
    ctx.fillStyle='#222';ctx.fillRect(0,0,format.width,format.height);
    let img=null; try{img=await getLemeArtUserImage(draft,'primary');}catch{}
    if(img) drawLemeArtImageCover(ctx,img,0,0,format.width,format.height,0);
    const g=ctx.createLinearGradient(0,format.height*.34,0,format.height); g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.38,'rgba(0,0,0,.12)');g.addColorStop(.62,'rgba(0,0,0,.62)');g.addColorStop(.82,'rgba(0,0,0,.9)');g.addColorStop(1,'rgba(0,0,0,1)');ctx.fillStyle=g;ctx.fillRect(0,0,format.width,format.height);
    try{await Promise.race([document.fonts.load('132px Anton'),new Promise(r=>setTimeout(r,1500))]);}catch{}
    let logo=null;try{logo=await loadWhiteLogo();}catch{}
    const lw=246, lh=logo?Math.round(lw*(logo.naturalHeight||logo.height)/(logo.naturalWidth||logo.width)):34, ly=format.height-64-lh;
    if(logo)ctx.drawImage(logo,(format.width-lw)/2,ly,lw,lh);
    const text=normalizeLemeArtText(draft.text)||'Digite o texto da arte.';
    const layout=fitLemeArtText(ctx,text,{fontFamily:'Anton, Impact, sans-serif',fontWeight:'400',maxWidth:format.width-170,maxHeight:format.key==='story'?650:450,maxFontSize:getLemeArtMaxFontSize(TEMPLATE,draft.fontScale),lineHeightRatio:.98});
    window.__lemeV1104Color=normColor(draft.highlightColor); const ty=Math.max(format.height*.46,ly-54-layout.height); drawLemeArtText(ctx,layout,format.width/2,ty,{color:'#fff',align:'center',circleColor:draft.highlightColor,highlightColor:draft.highlightColor,underlineColor:'#fff'}); window.__lemeV1104Color=null;
    return canvas;
  }

  const oldRenderDraft = renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas = async function(draft, formatValue=draft?.format, targetCanvas=null) {
    enhance(draft);
    if(draft?.template===TEMPLATE) return renderGradient(draft,formatValue,targetCanvas);
    const prev=window.__lemeV1104Color; window.__lemeV1104Color=draft?.highlightColor||DEFAULT_COLOR; try{return await oldRenderDraft(draft,formatValue,targetCanvas);}finally{window.__lemeV1104Color=prev;}
  };

  const oldValidate=validateLemeArtDraft;
  validateLemeArtDraft=function(draft,slideNumber=null){ if(draft?.template===TEMPLATE&&!draft.imageDataUrl)return `${slideNumber?`O slide ${slideNumber}`:'A arte'} precisa de uma imagem de fundo.`; return oldValidate(draft,slideNumber); };

  const oldDownload=generateAndDownloadLemeArt;
  generateAndDownloadLemeArt=function(scope='page'){const d=getLemeArtDraft(scope);if(d.template===TEMPLATE&&!d.imageDataUrl){toast('Adicione uma imagem de fundo para usar o modelo Foto + gradiente.');return;}return oldDownload(scope);};
  window.generateAndDownloadLemeArt=generateAndDownloadLemeArt;

  const oldPage=renderLemeArtPage;
  renderLemeArtPage=function(){let html=oldPage(); const marker='</div>\n\n      <div id="leme_art_page_workspace">'; if(html.includes(marker))html=html.replace(marker,'<article><span>05</span><div><strong>Foto + gradiente</strong><small>Imagem de fundo, gradiente preto, Anton, logo branco e destaque de cor configurável.</small></div></article></div>\n\n      <div id="leme_art_page_workspace">'); return html;};
})();
