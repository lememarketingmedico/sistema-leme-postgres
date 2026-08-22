(() => {
  const VERSION = '112.0';
  const STORAGE_KEY = 'leme_art_editor_v112';
  const HAND_MEDIA = 'handwritten-media';
  const REELS = 'reels-box';
  const FONT_POPPINS = 'poppins';
  const FONT_ELEGANT = 'elegant';
  let activeDraft = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  const fontDefault = template => String(template || '').includes('handwritten') || template === HAND_MEDIA ? FONT_ELEGANT : FONT_POPPINS;
  const normalizeFont = (value, template = '') => String(value || '').toLowerCase().includes('elegant') ? FONT_ELEGANT : (String(value || '').toLowerCase() === 'poppins' ? FONT_POPPINS : fontDefault(template));
  const handMode = value => String(value || '').toLowerCase() === 'two' ? 'two' : 'single';
  const isReels = draft => String(draft?.template || '') === REELS;

  LEME_ART_TEMPLATES[HAND_MEDIA] = 'Manuscrito + imagem(ns)';
  LEME_ART_BASE_FONT_SIZES[HAND_MEDIA] = 84;

  function enhance(draft, source = {}, fallback = {}) {
    if (!draft || typeof draft !== 'object') return draft;
    const template = String(draft.template || source.template || fallback.template || 'twitter-text');
    const storedFont = source.textFont ?? source.arte_fonte_texto ?? fallback.textFont;
    draft.textFont = normalizeFont(draft.textFont ?? storedFont, template);
    draft.textFontCustomized = Boolean(draft.textFontCustomized ?? source.textFontCustomized ?? fallback.textFontCustomized ?? storedFont);
    draft.textOffsetX = clamp(draft.textOffsetX ?? source.textOffsetX ?? source.arte_texto_offset_x ?? fallback.textOffsetX ?? 50, 0, 100);
    draft.textOffsetY = clamp(draft.textOffsetY ?? source.textOffsetY ?? source.arte_texto_offset_y ?? fallback.textOffsetY ?? 50, 0, 100);
    draft.textPositionCustomized = Boolean(draft.textPositionCustomized ?? source.textPositionCustomized ?? fallback.textPositionCustomized ?? (source.textOffsetX !== undefined || source.textOffsetY !== undefined || source.arte_texto_offset_x !== undefined || source.arte_texto_offset_y !== undefined));
    draft.handwrittenMediaMode = handMode(draft.handwrittenMediaMode ?? source.handwrittenMediaMode ?? source.arte_manuscrito_midia ?? fallback.handwrittenMediaMode);
    if (isReels(draft)) {
      draft.reelsTextY = clamp(draft.reelsTextY ?? source.reelsTextY ?? source.arte_reels_text_y ?? 60, 10, 90);
      draft.reelsFontFamily = 'poppins';
    }
    return draft;
  }

  const create0 = createLemeArtDraft;
  createLemeArtDraft = function(data = {}, defaults = {}) { return enhance(create0(data, defaults), data, defaults); };
  const get0 = getLemeArtDraft;
  getLemeArtDraft = function(scope = 'page') { return enhance(get0(scope)); };
  const prep0 = prepareLemeArtModalDraft;
  prepareLemeArtModalDraft = function(post = null) {
    const draft = enhance(prep0(post), post || {});
    if (post) {
      draft.textFont = normalizeFont(post.arte_fonte_texto || post.textFont, draft.template);
      draft.textFontCustomized = Boolean(post.arte_fonte_texto || post.textFont);
      draft.textOffsetX = clamp(post.arte_texto_offset_x ?? post.textOffsetX ?? 50, 0, 100);
      draft.textOffsetY = clamp(post.arte_texto_offset_y ?? post.textOffsetY ?? 50, 0, 100);
      draft.handwrittenMediaMode = handMode(post.arte_manuscrito_midia || post.handwrittenMediaMode);
    }
    return draft;
  };
  const serialize0 = serializeLemeArtCarouselSlides;
  serializeLemeArtCarouselSlides = function(scope = 'modal-carousel') {
    const source = getLemeArtCarousel(scope)?.slides || [];
    return serialize0(scope).map((item, index) => {
      const draft = enhance(source[index] || {}, item || {});
      return { ...item, textFont:draft.textFont, textFontCustomized:!!draft.textFontCustomized, textOffsetX:draft.textOffsetX, textOffsetY:draft.textOffsetY, textPositionCustomized:!!draft.textPositionCustomized, handwrittenMediaMode:draft.handwrittenMediaMode };
    });
  };
  const collect0 = collectPost;
  collectPost = function() {
    const record = collect0();
    if (String(record?.cliente_id || '') !== String(LEME_CLIENT_ID || 'leme-interno')) return record;
    const draft = enhance(getLemeArtDraft('modal'));
    return { ...record, arte_fonte_texto:draft.textFont, arte_texto_offset_x:draft.textOffsetX, arte_texto_offset_y:draft.textOffsetY, arte_manuscrito_midia:draft.handwrittenMediaMode, arte_slides:serializeLemeArtCarouselSlides('modal-carousel') };
  };

  function snapshot(draft) { draft=enhance(draft); return {textFont:draft.textFont,textFontCustomized:!!draft.textFontCustomized,textOffsetX:draft.textOffsetX,textOffsetY:draft.textOffsetY,textPositionCustomized:!!draft.textPositionCustomized,handwrittenMediaMode:draft.handwrittenMediaMode}; }
  function saveState() {
    try {
      const carousel = getLemeArtCarousel('page-carousel');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({page:snapshot(getLemeArtDraft('page')),slides:Object.fromEntries((carousel?.slides||[]).map(slide=>[String(slide.id||''),snapshot(slide)]))}));
    } catch (error) { console.warn('V112: não foi possível salvar as opções.', error); }
  }
  function restoreState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
      if (stored.page && lemeArtRuntime?.page) Object.assign(lemeArtRuntime.page, stored.page);
      (lemeArtCarouselRuntime?.page?.slides || []).forEach(slide => { const saved=stored.slides?.[String(slide.id||'')]; if(saved) Object.assign(slide,saved); });
    } catch (error) { console.warn('V112: não foi possível restaurar as opções.', error); }
  }
  const saveIfPage = scope => { if (String(scope || '').startsWith('page')) saveState(); };

  function positionY(draft) { return isReels(draft) ? clamp(draft.reelsTextY ?? 60,10,90) : clamp(draft.textOffsetY ?? 50,0,100); }
  function controls(scope) {
    const d=enhance(getLemeArtDraft(scope)), p=`leme_art_${scope}_v112`, reels=isReels(d), hand=d.template===HAND_MEDIA;
    return `<div class="leme-v112-controls" id="${p}_controls">
      <div class="leme-v112-control-grid">
        <label>Fonte do texto<select class="select" id="${p}_font" onchange="setLemeArtTextFontV112('${escapeAttr(scope)}',this.value)"><option value="poppins" ${d.textFont===FONT_POPPINS?'selected':''}>Poppins</option><option value="elegant" ${d.textFont===FONT_ELEGANT?'selected':''}>Elegant Bloom</option></select></label>
        <label id="${p}_hand_mode_field" class="${hand?'':'hidden'}">Quantidade de imagens<select class="select" id="${p}_hand_mode" onchange="setLemeHandwrittenMediaModeV112('${escapeAttr(scope)}',this.value)"><option value="single" ${d.handwrittenMediaMode==='single'?'selected':''}>1 imagem</option><option value="two" ${d.handwrittenMediaMode==='two'?'selected':''}>2 imagens</option></select></label>
      </div>
      <div class="leme-v112-text-position"><div class="leme-v112-text-position-heading"><div><strong>Posicionar bloco de texto</strong><small>${reels?'Ajuste a altura do bloco completo, incluindo a caixa.':'Mova o texto a partir da posição original do modelo.'}</small></div><button class="btn secondary small" type="button" onclick="resetLemeArtTextPositionV112('${escapeAttr(scope)}')">Padrão</button></div>
        <div class="leme-v112-position-grid ${reels?'is-reels':''}">
          <label class="${reels?'hidden':''}">Horizontal <span id="${p}_x_value">${Math.round(d.textOffsetX)}%</span><input id="${p}_x" type="range" min="0" max="100" step="1" value="${d.textOffsetX}" oninput="setLemeArtTextPositionV112('${escapeAttr(scope)}','x',this.value)"></label>
          <label>Vertical <span id="${p}_y_value">${Math.round(positionY(d))}%</span><input id="${p}_y" type="range" min="${reels?10:0}" max="${reels?90:100}" step="1" value="${positionY(d)}" oninput="setLemeArtTextPositionV112('${escapeAttr(scope)}','y',this.value)"></label>
        </div>
      </div></div>`;
  }

  function carouselNav(scope) {
    const c=getLemeArtCarousel(scope), i=Math.max(0,c.slides.findIndex(s=>s.id===c.activeSlideId)), n=c.slides.length;
    return `<div class="leme-v112-carousel-preview-nav"><button type="button" ${i<=0?'disabled':''} onclick="navigateLemeArtCarouselV112('${escapeAttr(scope)}',-1)" title="Slide anterior">←</button><strong>Slide ${i+1}<span> de ${n}</span></strong><button type="button" class="is-icon" onclick="duplicateLemeArtCarouselSlide('${escapeAttr(scope)}')" title="Duplicar slide">⧉</button><button type="button" class="is-icon is-add" onclick="addLemeArtCarouselSlide('${escapeAttr(scope)}')" title="Novo slide">＋</button><button type="button" ${i>=n-1?'disabled':''} onclick="navigateLemeArtCarouselV112('${escapeAttr(scope)}',1)" title="Próximo slide">→</button></div>`;
  }

  const editor0=renderLemeArtEditor;
  renderLemeArtEditor=function(scope='page',options={}) {
    let html=editor0(scope,options);
    html=html.replace('<div class="leme-art-actions">',`${controls(scope)}<div class="leme-art-actions">`);
    if(options.carousel){const needle='aria-label="Pré-visualização da arte da LEME"></canvas>\n        </div>';if(html.includes(needle))html=html.replace(needle,`aria-label="Pré-visualização da arte da LEME"></canvas>\n        </div>${carouselNav(scope)}`);}
    return html;
  };
  window.renderLemeArtEditor=renderLemeArtEditor;

  function syncHandGroups(scope){const d=enhance(getLemeArtDraft(scope));if(d.template!==HAND_MEDIA)return;document.getElementById(`leme_art_${scope}_image_group`)?.classList.toggle('hidden',d.handwrittenMediaMode!=='single');document.getElementById(`leme_art_${scope}_two_image_group`)?.classList.toggle('hidden',d.handwrittenMediaMode!=='two');}
  function syncUi(scope){const d=enhance(getLemeArtDraft(scope)),p=`leme_art_${scope}_v112`;const f=document.getElementById(`${p}_font`),mf=document.getElementById(`${p}_hand_mode_field`),m=document.getElementById(`${p}_hand_mode`),x=document.getElementById(`${p}_x`),y=document.getElementById(`${p}_y`),xv=document.getElementById(`${p}_x_value`),yv=document.getElementById(`${p}_y_value`);if(f)f.value=d.textFont;if(mf)mf.classList.toggle('hidden',d.template!==HAND_MEDIA);if(m)m.value=d.handwrittenMediaMode;if(x)x.value=String(d.textOffsetX);if(y)y.value=String(positionY(d));if(xv)xv.textContent=`${Math.round(d.textOffsetX)}%`;if(yv)yv.textContent=`${Math.round(positionY(d))}%`;syncHandGroups(scope);}

  window.setLemeArtTextFontV112=function(scope,value){const d=enhance(getLemeArtDraft(scope));d.textFont=normalizeFont(value,d.template);d.textFontCustomized=true;if(isReels(d))d.reelsFontFamily='poppins';saveIfPage(scope);syncUi(scope);scheduleLemeArtPreview(scope);};
  window.setLemeArtTextPositionV112=function(scope,axis,value){const d=enhance(getLemeArtDraft(scope));if(axis==='y'&&isReels(d)){d.reelsTextY=clamp(value,10,90);d.textOffsetY=d.reelsTextY;}else if(axis==='y')d.textOffsetY=clamp(value,0,100);else d.textOffsetX=clamp(value,0,100);d.textPositionCustomized=true;saveIfPage(scope);syncUi(scope);scheduleLemeArtPreview(scope);};
  window.resetLemeArtTextPositionV112=function(scope){const d=enhance(getLemeArtDraft(scope));d.textOffsetX=50;d.textOffsetY=50;if(isReels(d))d.reelsTextY=60;d.textPositionCustomized=false;saveIfPage(scope);syncUi(scope);scheduleLemeArtPreview(scope);};
  window.setLemeHandwrittenMediaModeV112=function(scope,value){const d=enhance(getLemeArtDraft(scope));d.handwrittenMediaMode=handMode(value);saveIfPage(scope);try{syncLemeArtImageControls(scope)}catch{}syncUi(scope);scheduleLemeArtPreview(scope);};
  window.navigateLemeArtCarouselV112=function(scope,direction){const c=getLemeArtCarousel(scope),i=Math.max(0,c.slides.findIndex(s=>s.id===c.activeSlideId)),n=clamp(i+(Number(direction)<0?-1:1),0,c.slides.length-1);if(n===i)return;c.activeSlideId=c.slides[n].id;refreshLemeArtCarousel(scope);};

  const template0=setLemeArtTemplate;
  setLemeArtTemplate=function(scope,value){const before=enhance(getLemeArtDraft(scope)),fc=!!before.textFontCustomized;const result=template0(scope,value),d=enhance(getLemeArtDraft(scope));if(!fc)d.textFont=fontDefault(d.template);if(isReels(d)){d.reelsFontFamily='poppins';if(!d.textPositionCustomized)d.reelsTextY=60;}saveIfPage(scope);requestAnimationFrame(()=>{syncUi(scope);try{syncLemeArtImageControls(scope)}catch{}scheduleLemeArtPreview(scope);});return result;};
  window.setLemeArtTemplate=setLemeArtTemplate;
  const syncImages0=window.syncLemeArtImageControls||syncLemeArtImageControls;
  window.syncLemeArtImageControls=function(scope='page'){const r=syncImages0(scope);requestAnimationFrame(()=>syncUi(scope));return r;};syncLemeArtImageControls=window.syncLemeArtImageControls;
  const read0=window.readLemeArtImageFile||readLemeArtImageFile;
  readLemeArtImageFile=function(file,scope,slot='primary',template='twitter-image'){const d=enhance(getLemeArtDraft(scope));if(d.template===HAND_MEDIA){if(String(file?.type||'').toLowerCase().startsWith('video/'))return toast('O modelo Manuscrito + imagem(ns) aceita somente imagens.');template=HAND_MEDIA;}return read0(file,scope,slot,template);};window.readLemeArtImageFile=readLemeArtImageFile;

  const fit0=fitLemeArtText;
  fitLemeArtText=function(ctx,text,options={}){const d=activeDraft&&typeof activeDraft==='object'?enhance(activeDraft):null;if(!d)return fit0(ctx,text,options);const elegant=d.textFont===FONT_ELEGANT;return fit0(ctx,text,{...options,fontFamily:elegant?'"Elegant Bloom", "Segoe Print", cursive':'Poppins, Arial, sans-serif',fontWeight:elegant?'400':options.fontWeight,lineHeightRatio:elegant?Math.max(1.24,Number(options.lineHeightRatio||1.28)):options.lineHeightRatio});};
  window.fitLemeArtText=fitLemeArtText;

  const drawText0=drawLemeArtText;
  drawLemeArtText=function(ctx,layout,x,y,options={}){const d=activeDraft&&typeof activeDraft==='object'?enhance(activeDraft):null;if(!d||isReels(d))return drawText0(ctx,layout,x,y,options);const align=options.align||'left',dx=((d.textOffsetX-50)/50)*(ctx.canvas.width*.24),dy=((d.textOffsetY-50)/50)*(ctx.canvas.height*.24);let nx=x+dx,ny=y+dy;const width=Math.max(1,Number(layout.widest||0)),margin=Math.max(26,Math.round(ctx.canvas.width*.025));if(align==='center')nx=clamp(nx,margin+width/2,ctx.canvas.width-margin-width/2);else if(align==='right')nx=clamp(nx,margin+width,ctx.canvas.width-margin);else nx=clamp(nx,margin,ctx.canvas.width-margin-width);ny=clamp(ny,margin,ctx.canvas.height-margin-Math.max(1,Number(layout.height||0)));return drawText0(ctx,layout,nx,ny,options);};
  window.drawLemeArtText=drawLemeArtText;

  async function renderHandMedia(draft,formatValue,targetCanvas=null){draft=enhance(draft);const format=getLemeArtFormatConfig(formatValue),canvas=targetCanvas||document.createElement('canvas');canvas.width=format.width;canvas.height=format.height;const ctx=canvas.getContext('2d');if(!ctx)return null;paintLemeArtBackground(ctx,format);const safeX=Math.max(104,format.safeMarginX),safeY=Math.max(104,format.safeMarginY),contentWidth=format.width-safeX*2,logoReserve=110,imageHeight=Math.min(format.key==='story'?610:470,Math.max(250,format.height*.38)),imageY=format.height-safeY-logoReserve-imageHeight,textBottom=imageY-42,text=normalizeLemeArtText(draft.text)||'Digite a frase que será transformada em arte.',layout=fitLemeArtText(ctx,text,{fontFamily:'Poppins, Arial, sans-serif',fontWeight:'400',maxWidth:contentWidth,maxHeight:Math.max(180,textBottom-safeY),maxFontSize:getLemeArtMaxFontSize(HAND_MEDIA,draft.fontScale),lineHeightRatio:1.30});drawLemeArtText(ctx,layout,format.width/2,safeY+Math.max(0,(textBottom-safeY-layout.height)/2),{color:'#272a2c',align:'center',circleColor:draft.highlightColor||'#52a4d5',highlightColor:draft.highlightColor||'#52a4d5',underlineColor:'#272a2c'});const mode=handMode(draft.handwrittenMediaMode),imgs=await Promise.all([getLemeArtUserImage(draft,'primary').catch(()=>null),mode==='two'?getLemeArtUserImage(draft,'secondary').catch(()=>null):Promise.resolve(null)]);if(mode==='two'){const gap=26,lw=Math.floor((contentWidth-gap)/2),rw=contentWidth-gap-lw;if(imgs[0])drawLemeArtImageCover(ctx,imgs[0],safeX,imageY,lw,imageHeight,30);else drawLemeArtImagePlaceholder(ctx,safeX,imageY,lw,imageHeight,30,'Imagem da esquerda');if(imgs[1])drawLemeArtImageCover(ctx,imgs[1],safeX+lw+gap,imageY,rw,imageHeight,30);else drawLemeArtImagePlaceholder(ctx,safeX+lw+gap,imageY,rw,imageHeight,30,'Imagem da direita');}else if(imgs[0])drawLemeArtImageCover(ctx,imgs[0],safeX,imageY,contentWidth,imageHeight,34);else drawLemeArtImagePlaceholder(ctx,safeX,imageY,contentWidth,imageHeight,34,'Imagem da publicação');try{const logo=await loadLemeHandwrittenLogo();drawLemeHandwrittenLogo(ctx,logo,format);}catch(error){console.warn(error)}return canvas;}

  const render0=renderLemeArtDraftCanvas;
  renderLemeArtDraftCanvas=async function(draft,formatValue=draft?.format,targetCanvas=null){activeDraft=enhance(draft||{});if(activeDraft.template===HAND_MEDIA)return renderHandMedia(activeDraft,formatValue,targetCanvas);const result=await render0(activeDraft,formatValue,targetCanvas);activeDraft=enhance(draft||{});return result;};
  window.renderLemeArtDraftCanvas=renderLemeArtDraftCanvas;

  const validate0=validateLemeArtDraft;
  validateLemeArtDraft=function(draft,slideNumber=null){draft=enhance(draft||{});if(draft.template===HAND_MEDIA){const label=slideNumber?`O slide ${slideNumber}`:'A arte';if(!normalizeLemeArtText(draft.text))return`${label} está sem texto.`;if(!draft.imageDataUrl)return`${label} precisa de uma imagem.`;if(draft.handwrittenMediaMode==='two'&&!draft.image2DataUrl)return`${label} precisa das duas imagens.`;return'';}return validate0(draft,slideNumber);};window.validateLemeArtDraft=validateLemeArtDraft;

  const generate0=generateAndDownloadLemeArt;
  generateAndDownloadLemeArt=function(scope='page'){activeDraft=enhance(getLemeArtDraft(scope));return generate0(scope);};window.generateAndDownloadLemeArt=generateAndDownloadLemeArt;
  const exportCarousel0=exportLemeArtCarousel;
  exportLemeArtCarousel=async function(scope='page-carousel'){const c=getLemeArtCarousel(scope);activeDraft=enhance(c.slides.find(s=>s.id===c.activeSlideId)||c.slides[0]||{});return exportCarousel0(scope);};window.exportLemeArtCarousel=exportLemeArtCarousel;

  const init0=initializeLemeArtCanvases;
  initializeLemeArtCanvases=function(){const r=init0();document.querySelectorAll('[data-leme-art-editor]').forEach(editor=>syncUi(editor.dataset.lemeArtEditor||'page'));return r;};window.initializeLemeArtCanvases=initializeLemeArtCanvases;

  restoreState();
  window.__LEME_ART_EDITOR_VERSION__=VERSION;
})();
