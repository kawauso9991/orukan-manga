import { referenceSections, referenceCount as countReferences } from './references.mjs';
import {createDesktopControls} from './desktop-controls.mjs';
import {createDesktopReferences,compactDesktopReference} from './desktop-reference-ui.mjs';
import {resolveNormalReaderLayout,createReaderSwipeController} from './reader-responsive.mjs?v=pc-normal-3';
import {wideReaderGeometry,prefersHQ} from './reader-wide.mjs';
import { visiblePages, stepPage, effectiveMode, readPreferences, writePreferences, createWheelIntent, canTurnWheel, keyDirection, presentationGeometry, referenceGroups, createFullscreenController } from './presentation.mjs';

// Presentation never owns the active logical page; navigation/history do.
export function createPresentationUI({book,figures,images,getPage,getStorage,go,makeLink,reflow,persist,loadPage,observeScroll}) {
  const $ = id => document.getElementById(id);
  const shell=$('reader-shell'), stage=$('reading-stage'), deck=$('reader'), panel=$('reference-panel');
  const preferences=readPreferences(getStorage), wheel=createWheelIntent();
  let mode=effectiveMode(preferences.mode,window.innerWidth), displayed='', referenceKey='', opener, pendingAnchor=null, offset=0, dragging=null, lastAnchor=null;
  let modalActive=false;
  let fullscreenActive=false, fullscreenPreferences=null, windowedAnchor=null, transitionPending=false, transitionGeneration=0;
  let railWidth=0, referenceChoice=null, autoReferences=false, chromeVisible=true, chromeTimer=null, suppressTouchClickUntil=0, relocatedFocus=null;
  let chromeHiddenByUser=false, topEdgeHover=false, toolbarHover=false, keyboardChrome=false;
  const toolbar=$('reader-toolbar'), rail=$('navigation-rail');
  let referenceCount=0;
  let manualMode=null,responsive={mode:'spread',compact:false},wideGeometry=null;
  const originalReferenceButton={hidden:$('open-references').hidden,disabled:$('open-references').disabled};
  const normalDesktop=()=>window.innerWidth>=(getPage()===1?600:768)&&!fullscreenActive;
  const phoneMode=()=>window.innerWidth<(fullscreenActive?1024:getPage()===1?600:768);
  const normalSources=()=>normalDesktop()&&panel.parentElement===$('reading-body');
  const desktopControls=createDesktopControls({shell,navigationHome:$('toolbar-navigation-home'),progressTrack:$('reading-progress')?.parentElement,displayControls:$('presentation-controls'),book,getPage,onLayout:()=>{resize();reflow();}});
  const desktopReferences=createDesktopReferences({shell,panel,getCount:()=>referenceCount});
  let normalPanelState=null;
  function syncDesktopMode() {
    const normal=normalDesktop();
    if(normal&&!normalPanelState)normalPanelState={hidden:panel.hidden,autoReferences};
    if(!normal&&normalPanelState){
      if(normalPanelState.hidden&&panel.contains(document.activeElement))relocatedFocus=phoneMode()?$('mobile-menu-toggle'):$('toggle-fullscreen');
      panel.hidden=normalPanelState.hidden;autoReferences=normalPanelState.autoReferences;normalPanelState=null;
    }
    shell.classList.toggle('desktop-windowed',normal);
    shell.classList.toggle('desktop-responsive-compact',normal&&responsive.compact);
    desktopControls.sync({normal,compact:responsive.compact});
    if(normalSources())panel.hidden=false;
    desktopReferences.sync({normal:normalSources(),compact:responsive.compact});
  }
  function syncReferenceButton() {
    const button=$('open-references');
    if(fullscreenActive){button.hidden=false;button.disabled=referenceCount===0;}
    else if(normalSources()){button.hidden=true;button.disabled=referenceCount===0;}
    else if(!fullscreenActive&&phoneMode()){button.hidden=referenceCount===0;button.disabled=referenceCount===0;}
    else {button.hidden=originalReferenceButton.hidden;button.disabled=originalReferenceButton.disabled;}
  }
  const view=()=>fullscreenPreferences??preferences;
  const transitioning=()=>transitionPending||(document.fullscreenElement===shell)!==fullscreenActive;
  const backgroundInert=new Map();
  const paginated=()=>mode!=='vertical';
  const pages=()=>visiblePages(getPage(),mode,book.totalPages);
  const dimensions=numbers=>numbers.map(number=>{const item=book.pages[number-1];return number===1?{...item,width:item.width*1144/1200}:item;});
  const normalContentWidth=()=>document.documentElement.getBoundingClientRect().width||document.documentElement.clientWidth||window.innerWidth;
  function normalGeometry(number=getPage()) {
    const numbers=visiblePages(number,mode,book.totalPages),items=dimensions(numbers);
    if(normalDesktop()&&!responsive.compact&&paginated()&&view().fit==='height'&&view().scale<=1)
      return wideReaderGeometry(items,normalContentWidth(),Math.max(1,(window.innerHeight??stage.clientHeight)-60),{...view(),padding:9,gap:12});
    return presentationGeometry(items,stage.clientWidth,stage.clientHeight,{...view(),fullscreen:fullscreenActive,captionHeight:0});
  }
  function updateWideGeometry() {
    const active=normalDesktop()&&!responsive.compact&&paginated()&&view().fit==='height'&&view().scale<=1;
    shell.classList.toggle('desktop-wide-layout',active);
    wideGeometry=active?normalGeometry():null;
    if(wideGeometry){
      shell.style.setProperty('--desktop-group-width',`${wideGeometry.left.width+wideGeometry.artWidth+wideGeometry.right.width}px`);
      shell.style.setProperty('--desktop-group-left',`${wideGeometry.outer.left}px`);
      shell.style.setProperty('--desktop-wide-stage-width',`${wideGeometry.artWidth}px`);
      shell.style.setProperty('--desktop-viewport-width',`${normalContentWidth()}px`);
      pages().forEach((number,index)=>figures[number-1].style.setProperty('--desktop-wide-page-width',`${wideGeometry.sizes[index].width}px`));
    }
  }
  function desiredPageWidth(number) {
    if(!normalDesktop()||!paginated())return 0;
    const numbers=visiblePages(number,mode,book.totalPages),geometry=normalGeometry(number);
    return geometry.sizes[numbers.indexOf(number)]?.width??0;
  }
  function panAnchor() {
    return {x:(stage.scrollLeft+stage.clientWidth/2)/Math.max(1,deck.scrollWidth), y:(stage.scrollTop+stage.clientHeight/2)/Math.max(1,deck.scrollHeight)};
  }
  function applyAnchor(anchor) {
    stage.scrollLeft=anchor.x*deck.scrollWidth-stage.clientWidth/2;
    stage.scrollTop=anchor.y*deck.scrollHeight-stage.clientHeight/2;
  }
  function pannable() { return paginated() && (stage.scrollWidth>stage.clientWidth+2 || stage.scrollHeight>stage.clientHeight+2); }
  function docked() { return normalSources() || railWidth>0 && paginated() && panel.parentElement=== $('reading-body'); }
  function panelModal() { return !panel.hidden && !docked(); }
  function layoutRails() {
    const available=!normalDesktop()&&paginated()&&railWidth>0;
    const mobile=phoneMode();
    const focused=document.activeElement;
    shell.style.setProperty('--rail-width',`${railWidth}px`);
    rail.hidden=!available;
    const home=available?rail:$('toolbar-navigation-home');
    const destinations=[['reading-status',mobile?$('mobile-menu-actions'):home],
      ['navigation-controls',mobile?$('mobile-navigation'):home],
      ['toolbar-contents',mobile?$('mobile-menu-actions'):$('navigation-controls')],
      ['open-references',fullscreenActive?$('fullscreen-affordance'):mobile?$('mobile-menu-actions'):$('presentation-controls')]];
    for(const [id,target] of destinations) if($(id).parentElement!==target) {
      if($(id).contains(focused)) relocatedFocus=focused;
      target.append($(id));
    }
    $('mobile-navigation').hidden=!mobile;
    toolbar.hidden=mobile;
    $('toggle-fullscreen').hidden=mobile&&!fullscreenActive;
    $('reveal-controls').hidden=!fullscreenActive;
    if(fullscreenActive)$('fullscreen-affordance').append($('toggle-fullscreen'));
    syncReferenceButton();
    $('previous').textContent=mobile?'←':'← 前へ';
    $('next').textContent=mobile?'→':'次へ →';
    if(!mobile&&focused===$('mobile-menu-toggle'))relocatedFocus=$('page-number');
    document.documentElement.style.setProperty('--mobile-nav-height',mobile?`${$('mobile-navigation').getBoundingClientRect().height}px`:'0px');
    if(fullscreenActive&&docked()&&referenceChoice===null&&panel.hidden) {
      panel.hidden=false;autoReferences=true;
    }
    $('open-references').setAttribute('aria-expanded',String(!panel.hidden));
    if(normalSources())panel.hidden=false;
    desktopControls.sync({normal:normalDesktop(),compact:responsive.compact});
    desktopReferences.sync({normal:normalSources(),compact:responsive.compact});
  }
  function layoutPanel({opening=false}={}) {
    shell.classList.toggle('references-open',!panel.hidden && docked());
    const modal=panelModal(), focused=relocatedFocus??document.activeElement;
    panel.setAttribute('role',modal?'dialog':'region');
    if(modal) panel.setAttribute('aria-modal','true'); else panel.removeAttribute('aria-modal');
    if(modal&&!modalActive&&!opening&&!panel.contains(focused)) opener=focused;
    if(normalSources()&&document.activeElement===$('close-references'))panel.focus({preventScroll:true});
    for(const [node,inert] of backgroundInert) node.inert=inert;
    backgroundInert.clear();
    if(modal) {
      // Only sibling branches are inert: the panel and all its ancestors stay
      // usable, whether it is mounted in the reading body or zoom dialog.
      for(let branch=panel;branch!==document.body&&branch.parentElement;branch=branch.parentElement) {
        for(const sibling of branch.parentElement.children) if(sibling!==branch) {
          backgroundInert.set(sibling,sibling.inert);sibling.inert=true;
        }
      }
      if(!panel.contains(document.activeElement)) $('close-references').focus({preventScroll:true});
    }
    if(!modal&&relocatedFocus) {
      if(!fullscreenActive||keyboardChrome||(!chromeHiddenByUser&&chromeVisible)) setChrome(true);
      relocatedFocus.focus({preventScroll:true});
    }
    relocatedFocus=null;
    modalActive=modal;
    toolbar.inert=modal||(fullscreenActive&&!chromeVisible);
  }
  function resize({opening=false}={}) {
    if(paginated() && displayed && !pendingAnchor) pendingAnchor=lastAnchor??panAnchor();
    responsive=resolveNormalReaderLayout({width:window.innerWidth,height:window.innerHeight??stage.clientHeight,manualMode});
    mode=fullscreenActive?effectiveMode(view().mode,window.innerWidth):responsive.mode;
    shell.dataset.mode=mode;
    syncDesktopMode();
    renderPages(true);layoutPanel({opening});
    $('display-mode').value=normalDesktop()?mode:view().mode;
    $('display-mode').disabled=phoneMode();
    $('display-mode').title=window.innerWidth<1024?'この画面幅では縦読みで表示します':'';
    $('fit-mode').value=view().fit;
    $('size-slider').value=String(Math.round(view().scale*100));
    $('size-level').textContent=`${Math.round(view().scale*100)}%`;
    $('size-out').disabled=view().scale<=.5;
    $('size-in').disabled=view().scale>=3;
    $('size-controls').hidden=!paginated();
    if(normalDesktop())$('display-mode').title='';
    if(!paginated()) pendingAnchor=null;
    document.documentElement.style.setProperty('--toolbar-height',normalDesktop()?'0px':`${$('reader-toolbar').getBoundingClientRect().height}px`);
    desktopControls.sync({normal:normalDesktop(),compact:responsive.compact});
  }
  function renderPages(force=false) {
    const selected=pages(), key=`${mode}:${selected.join(',')}`;
    shell.dataset.page=String(getPage());
    for(let i=0;i<figures.length;i++) {
      figures[i].classList.toggle('active-page',i+1===getPage());
      if(i+1===getPage()) figures[i].setAttribute('aria-current','page'); else figures[i].removeAttribute('aria-current');
    }
    if(!force && displayed===key) return;
    displayed=key;
    for(let i=0;i<figures.length;i++) {
      const figure=figures[i];
      figure.hidden=paginated()&&!selected.includes(i+1);
      figure.style.width=''; figure.style.flexBasis='';
      images[i].style.height='';
    }
    if(paginated()) {
      updateWideGeometry();
      railWidth=Infinity;
      // Mask only the cover's verified blank columns (28/1200 per side).
      const displayPages=selected.map(number=>{
        const item=book.pages[number-1];
        return number===1?{...item,width:item.width*1144/1200}:item;
      });
      // Moving the single navigation block can change the windowed toolbar's
      // height. Settle that layout in bounded passes; don't oscillate a rail at
      // the threshold by lending it the space created by hiding itself.
      const captionHeight=()=>0;
      for(let pass=0;pass<3;pass++) {
        const width=stage.clientWidth,height=stage.clientHeight;
        const rootFontSize=parseFloat(window.getComputedStyle(document.documentElement).fontSize)||16;
        const caption=captionHeight();
        const geometry=presentationGeometry(displayPages,width,height,{...view(),fullscreen:fullscreenActive,rootFontSize,captionHeight:caption});
        railWidth=Math.min(railWidth,geometry.railWidth);
        selected.forEach((number,index)=>{
          const figure=figures[number-1], size=geometry.sizes[index];
          figure.style.width=`${size.width}px`;figure.style.flexBasis=`${size.width}px`;
        });
        layoutRails();
        if(width===stage.clientWidth&&height===stage.clientHeight&&(fullscreenActive||caption===captionHeight()))break;
      }
      selected.forEach(number=>{
        loadPage(number,{preferHQ:prefersHQ(desiredPageWidth(number))});
        // Existing normal images also need HQ after a large viewport resize.
        if(view().scale>1 || view().fit==='width' || prefersHQ(desiredPageWidth(number)))
          upgrade(number);
      });
    } else {railWidth=0;updateWideGeometry();}
    layoutRails();
    stage.classList.toggle('can-pan',pannable());
  }
  function upgrade(number) {
    const image=images[number-1], item=book.pages[number-1];
    if(image.dataset.hq==='ready'||image.dataset.hq==='loading') return;
    image.dataset.hq='loading';
    const high=new Image(); high.decoding='async';
    high.onload=()=>{ image.dataset.hq='ready';image.src=high.src; };
    high.onerror=()=>{ delete image.dataset.hq; };
    high.src=new URL(item.zoom,document.URL).href;
  }
  function visibleReferencePages() {
    if(zoomPage!==null) return [zoomPage];
    // Canonical navigation survives reflow; old DOM coordinates do not.
    return pages();
  }
  let zoomPage=null;
  function references() {
    const numbers=visibleReferencePages();
    const groups=referenceSections(numbers,book.links,book.readings), count=countReferences(groups);
    referenceCount=count;syncReferenceButton();desktopReferences.sync({normal:normalSources(),compact:responsive.compact});
    $('open-references').textContent=`出典・参照 (${count})`;
    const compact=normalSources();
    const key=`${compact?'desktop':'original'}:${numbers.join(',')}`; if(referenceKey===key) return;
    referenceKey=key;
    const content=$('reference-content'), focused=document.activeElement;
    const focusWasLink=content.contains(focused);
    const fragment=document.createDocumentFragment();
    for(const group of groups) {
      if(compact&&!group.links.length&&!group.readings.length)continue;
      const section=document.createElement('section'), heading=document.createElement('h3'), list=document.createElement('ol');
      const item=book.pages[group.page-1];
      heading.textContent=`${group.page}ページ${item.label===String(group.page)?'':`（補遺 ${item.label}）`} · ${group.links.length+group.readings.length}件`;
      section.append(heading);
      if(compact)heading.textContent=`${group.page}ページ`;
      if(!group.links.length&&!group.readings.length) {const empty=document.createElement('p');empty.textContent='このページには出典・参照リンクはありません。';section.append(empty);}
      if(group.links.length&&group.readings.length){const label=document.createElement('h4');label.textContent='本書の出典・参照';section.append(label);}
      for(const link of group.links){const row=document.createElement('li'),anchor=makeLink(link);row.append(compact?compactDesktopReference(anchor,link):anchor);list.append(row);}
      if(group.links.length)section.append(list);
      if(group.readings.length){
        const label=document.createElement('h4'),readings=document.createElement('ol');label.textContent='理解を助ける参考・小話';
        for(const link of group.readings){const row=document.createElement('li'),anchor=makeLink(link);row.append(compact?compactDesktopReference(anchor,link):anchor);readings.append(row);}
        section.append(label,readings);
      }
      fragment.append(section);
    }
    content.replaceChildren(fragment);
    // Updating a spread must never unexpectedly focus the panel.
    if(focusWasLink) (compact?panel:$('close-references')).focus({preventScroll:true});
  }
  function setPanel(open,trigger,{intentional=true}={}) {
    if(normalSources()&&!open)return;
    if(intentional) {referenceChoice=open;autoReferences=false;}
    if(open===!panel.hidden) return;
    if(paginated()) pendingAnchor=panAnchor();
    panel.hidden=!open;
    $('open-references').setAttribute('aria-expanded',String(open));
    if(open) opener=trigger??document.activeElement;
    resize({opening:open}); reflow(); references();
    if(open) $('close-references').focus({preventScroll:true});
    else (opener??$('open-references')).focus({preventScroll:true});
  }
  function changePreference(change) {
    if(normalDesktop()&&change.mode)manualMode=change.mode;
    persist();
    if(paginated()) pendingAnchor=panAnchor();
    Object.assign(view(),change);
    if(!fullscreenActive) writePreferences(getStorage,preferences);
    wheel.reset();resize();reflow();
  }
  function turn(direction) {const next=stepPage(getPage(),direction,mode,book.totalPages);if(next!==getPage()) go(next);}
  const excluded=target=>Boolean(target.closest('input,select,textarea,button,a,summary,[contenteditable]:not([contenteditable="false"]),#reference-panel,dialog'));
  $('display-mode').addEventListener('change',event=>changePreference({mode:event.target.value}));
  $('fit-mode').addEventListener('change',event=>changePreference({fit:event.target.value}));
  $('size-out').addEventListener('click',()=>changePreference({scale:Math.max(.5,Math.round((view().scale-.25)*100)/100)}));
  $('size-in').addEventListener('click',()=>changePreference({scale:Math.min(3,Math.round((view().scale+.25)*100)/100)}));
  $('size-slider').addEventListener('input',event=>changePreference({scale:Number(event.target.value)/100}));
  $('open-references').addEventListener('click',event=>setPanel(panel.hidden,event.currentTarget));
  $('close-references').addEventListener('click',()=>setPanel(false));
  function setChrome(visible) {
    const editing=Boolean(document.activeElement?.matches?.('input,select,textarea,[contenteditable]:not([contenteditable="false"])'));
    if(!visible&&((toolbar.contains(document.activeElement)&&(keyboardChrome||editing))||panelModal()||document.querySelector('dialog[open]'))) return;
    chromeVisible=visible;
    shell.classList.toggle('chrome-hidden',fullscreenActive&&!visible);
    toolbar.inert=panelModal()||(fullscreenActive&&!visible);
    $('reveal-controls').setAttribute('aria-expanded',String(visible));
  }
  function hideChromeSoon(delay=200) {
    clearTimeout(chromeTimer);
    if(!fullscreenActive||topEdgeHover||toolbarHover) return;
    chromeTimer=setTimeout(()=>setChrome(false),delay);
  }
  function revealChrome(temporary=false) {
    if(!fullscreenActive) return;
    clearTimeout(chromeTimer);setChrome(true);
    if(temporary) hideChromeSoon(2600);
  }
  $('reveal-controls').addEventListener('click',event=>{
    chromeHiddenByUser=false;revealChrome(true);
  });
  shell.addEventListener('pointermove',event=>{
    if(!fullscreenActive||event.pointerType!=='mouse') return;
    const top=shell.getBoundingClientRect().top;
    const hover=event.clientY>=top&&event.clientY<top+12;
    if(hover===topEdgeHover) return;
    topEdgeHover=hover;
    if(hover) revealChrome(); else hideChromeSoon();
  },{passive:true});
  toolbar.addEventListener('pointerenter',event=>{
    if(event.pointerType!=='mouse') return;
    toolbarHover=true;revealChrome();
  });
  toolbar.addEventListener('pointerleave',event=>{
    if(event.pointerType!=='mouse') return;
    toolbarHover=false;hideChromeSoon();
  });
  shell.addEventListener('pointerleave',()=>{topEdgeHover=false;toolbarHover=false;hideChromeSoon();});
  shell.addEventListener('pointerdown',event=>{
    keyboardChrome=false;
    if(event.pointerType==='mouse') hideChromeSoon();
  },{passive:true});
  shell.addEventListener('focusin',event=>{
    if(keyboardChrome&&toolbar.contains(event.target)) revealChrome(); else hideChromeSoon();
  });
  shell.addEventListener('focusout',()=>hideChromeSoon());
  document.addEventListener('keydown',event=>{
    if(event.key==='Tab'&&fullscreenActive&&!panelModal()&&!document.querySelector('dialog[open]')) {
      keyboardChrome=true;revealChrome();
    }
    if(event.key==='Escape'&&!panel.hidden&&!$('contents-dialog').open) {event.preventDefault();setPanel(false);return;}
    if(event.key==='Escape'&&!event.defaultPrevented&&panel.hidden&&document.fullscreenElement===shell&&!document.querySelector('dialog[open]')) {
      event.preventDefault();fullscreen.toggle();return;
    }
    if(event.key==='Tab'&&panelModal()) {
      const focusable=[...panel.querySelectorAll('button,a[href]')]; const first=focusable[0],last=focusable.at(-1);
      if(!panel.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      return;
    }
    if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||excluded(event.target)||panelModal()||document.querySelector('dialog[open]')||!paginated()) return;
    if(pannable()) {
      const delta=({ArrowLeft:[-80,0],ArrowRight:[80,0],ArrowUp:[0,-80],ArrowDown:[0,80],PageDown:[0,stage.clientHeight*.85],PageUp:[0,-stage.clientHeight*.85]})[event.key];
      if(delta){event.preventDefault();stage.scrollBy({left:delta[0],top:delta[1],behavior:'instant'});}
      return;
    }
    const direction=keyDirection(event.key);if(direction){event.preventDefault();turn(direction);}
  });
  stage.addEventListener('wheel',event=>{
    const eligible=canTurnWheel({desktop:normalDesktop()||window.innerWidth>=1024,mode,ctrlKey:event.ctrlKey,metaKey:event.metaKey,excluded:excluded(event.target)||panelModal()||Boolean(document.querySelector('dialog[open]')),pannable:pannable(),deltaX:event.deltaX,deltaY:event.deltaY});
    const direction=wheel.consume({deltaY:event.deltaY,deltaMode:event.deltaMode,time:performance.now(),pageHeight:stage.clientHeight,eligible});
    if(!eligible) return;
    event.preventDefault();
    if(direction) turn(direction);
  },{passive:false});
  stage.addEventListener('scroll',()=>{
    if(transitioning()) return;
    if(!paginated()){if(document.fullscreenElement===shell) observeScroll();return;}
    offset=Math.max(0,Math.min(1,stage.scrollTop/Math.max(1,images[getPage()-1].getBoundingClientRect().height)));
    lastAnchor=panAnchor();
    observeScroll();
  },{passive:true});
  stage.addEventListener('pointerdown',event=>{
    suppressTouchClickUntil=0;
    if(event.pointerType==='touch'&&fullscreenActive&&!chromeVisible&&!excluded(event.target)&&event.clientY<=shell.getBoundingClientRect().top+44) {
      suppressTouchClickUntil=performance.now()+1000;revealChrome(true);
    }
    if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('a,button')||!pannable())return;
    dragging={x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop,moved:false};
    stage.setPointerCapture(event.pointerId);stage.classList.add('dragging');event.preventDefault();
  });
  stage.addEventListener('pointermove',event=>{
    if(!dragging)return;
    if(Math.abs(event.clientX-dragging.x)+Math.abs(event.clientY-dragging.y)>4)dragging.moved=true;
    stage.scrollLeft=dragging.left-event.clientX+dragging.x;stage.scrollTop=dragging.top-event.clientY+dragging.y;
  });
  stage.addEventListener('click',event=>{
    if(dragging?.moved||suppressTouchClickUntil>performance.now()) {suppressTouchClickUntil=0;event.preventDefault();event.stopImmediatePropagation();}
  },true);
  function endDrag(){stage.classList.remove('dragging');setTimeout(()=>{dragging=null;},0);}
  stage.addEventListener('pointerup',endDrag);stage.addEventListener('pointercancel',endDrag);stage.addEventListener('lostpointercapture',endDrag);
  function settleFullscreen(generation) {
    // Fullscreen can allocate its inner scrollbar or adjust native scrolling
    // after fullscreenchange. Keep the canonical navigation position locked
    // until both geometry and the restored page anchor survive two frames.
    const signature=()=>{
      const figure=figures[getPage()-1].getBoundingClientRect(),image=images[getPage()-1].getBoundingClientRect();
      return [stage.clientWidth,stage.clientHeight,stage.getBoundingClientRect().top,
        figure.top,image.height,toolbar.getBoundingClientRect().height].join(':');
    };
    let previous=signature(),stable=0;
    function frame() {
      if(generation!==transitionGeneration) return;
      if(signature()!==previous) {
        resize();reflow();references();previous=signature();stable=0;
      } else stable++;
      if(stable>=2) {transitionPending=false;return;}
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  const fullscreen=createFullscreenController({element:shell,getElement:()=>document.fullscreenElement,
    request:()=>{persist();windowedAnchor=paginated()?panAnchor():null;transitionPending=true;if(!shell.requestFullscreen)throw Error('unsupported');return shell.requestFullscreen();},
    exit:()=>{transitionPending=true;return document.exitFullscreen();},
    onChange:active=>{
      transitionPending=true;
      const generation=++transitionGeneration;
      const recoverFocus=document.activeElement===$('toggle-fullscreen')||(!active&&autoReferences&&panel.contains(document.activeElement));
      if(active&&!fullscreenActive) {
        windowedAnchor??=paginated()?panAnchor():null;
        fullscreenPreferences={...preferences,fit:'height',scale:1};
        pendingAnchor={x:.5,y:.5};lastAnchor=null;
      } else if(!active&&fullscreenActive) {
        fullscreenPreferences=null;pendingAnchor=windowedAnchor;lastAnchor=windowedAnchor;windowedAnchor=null;
        if(autoReferences) {panel.hidden=true;autoReferences=false;}
      }
      fullscreenActive=active;
      syncDesktopMode();
      $('toggle-fullscreen').textContent=active?'全画面を終了':'全画面';$('toggle-fullscreen').setAttribute('aria-pressed',String(active));
      (active?$('fullscreen-affordance'):$('presentation-controls')).append($('toggle-fullscreen'));
      (active?shell:$('fullscreen-affordance')).append($('reveal-controls'));
      $('fullscreen-affordance').hidden=!active;
      topEdgeHover=false;toolbarHover=false;clearTimeout(chromeTimer);setChrome(!active);
      resize();reflow();references();
      if(recoverFocus&&!panelModal()) $('toggle-fullscreen').focus({preventScroll:true});
      settleFullscreen(generation);
    },
    onError:()=>{transitionPending=false;pendingAnchor=null;$('reader-message').textContent='全画面表示を変更できませんでした。このままお読みいただけます。';}});
  $('toggle-fullscreen').addEventListener('click',()=>fullscreen.toggle());
  createReaderSwipeController({element:stage,getState:()=>({normal:normalDesktop(),width:window.innerWidth,mode,scale:view().scale,nativePinchScale:window.visualViewport?.scale??1,pannable:pannable(),zoomed:Boolean($('zoom-dialog')?.open)}),onTurn:turn});
  document.addEventListener('fullscreenchange',()=>fullscreen.changed());
  document.addEventListener('fullscreenerror',()=>{$('reader-message').textContent='全画面表示を変更できませんでした。このままお読みいただけます。';});
  resize();
  return {
    get mode(){return mode;},get fullscreen(){return fullscreenActive;},get transitioning(){return transitioning();}, turn, resize,desiredPageWidth,
    readPosition(){return paginated()?{page:getPage(),offset}:null;},
    changed(position){offset=position.offset;renderPages();layoutPanel();references();},
    moveTo(position){
      if(!paginated()) {
        if(document.fullscreenElement!==shell)return false;
        const figure=figures[position.page-1],image=images[position.page-1];
        stage.scrollTop+=figure.getBoundingClientRect().top-stage.getBoundingClientRect().top+image.getBoundingClientRect().height*position.offset-(window.innerWidth<1024?0:16);
        return true;
      }
      renderPages();
      if(pendingAnchor){applyAnchor(pendingAnchor);pendingAnchor=null;}
      else {stage.scrollLeft=0;stage.scrollTop=position.offset*images[position.page-1].getBoundingClientRect().height;}
      lastAnchor=panAnchor();
      offset=position.offset;
      window.scrollTo({top:window.scrollY+shell.getBoundingClientRect().top,behavior:'instant'});
      return true;
    },
    zoomReferences(page){zoomPage=page;referenceKey='';references();},
    openZoomPanel(parent){parent.append(panel);if(!panel.hidden)setPanel(false,undefined,{intentional:false});resize();reflow();},
    closeZoomPanel(){setPanel(false,undefined,{intentional:false});$('reading-body').append(panel);zoomPage=null;referenceKey='';resize();reflow();references();}
  };
}
