import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture} from './reader-fixture.mjs';
import {pageAlignment,verifiedCover} from '../assets/alignment.mjs';
import {keyDirection, visiblePages, stepPage} from '../assets/presentation.mjs';


test('all four arrows follow manga navigation without reversing spread order',()=>{
  assert.deepEqual(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].map(keyDirection),[1,1,-1,-1]);
  assert.deepEqual(visiblePages(87,'spread',107),[86,87]);
  assert.equal(stepPage(86,1,'spread',107),88);
  assert.equal(stepPage(88,-1,'spread',107),86);
});

test('hidden fullscreen settings survive repeated page navigation, wheel and incidental pointer/focus movement',async()=>{
  const f=fixture();await f.enter();
  assert.equal(f.hidden(),true);
  for(const key of ['ArrowLeft','ArrowDown','ArrowRight','ArrowUp']){f.stage.dispatch('keydown',{key});assert.equal(f.hidden(),true, key);}
  f.stage.dispatch('wheel',{deltaY:120,deltaX:0,deltaMode:0});assert.equal(f.hidden(),true,'wheel');
  f.stage.dispatch('pointermove',{pointerType:'mouse',clientX:800,clientY:400});assert.equal(f.hidden(),true,'incidental pointer');
  f.nodes.get('next').focus();f.nodes.get('next').dispatch('click');assert.equal(f.hidden(),true,'sidebar focus');
});

test('upper edge reveals controls, leaving hides them, intentional Tab still reveals',async()=>{
  const f=fixture();await f.enter();
  f.shell.dispatch('pointermove',{pointerType:'mouse',clientX:800,clientY:2});assert.equal(f.hidden(),false);
  f.stage.dispatch('pointermove',{pointerType:'mouse',clientX:800,clientY:400});
  await new Promise(resolve=>setTimeout(resolve,220));assert.equal(f.hidden(),true);
  f.stage.dispatch('keydown',{key:'Tab'});assert.equal(f.hidden(),false);
  f.nodes.get('display-mode').focus();f.stage.dispatch('pointermove',{pointerType:'mouse',clientX:800,clientY:400});assert.equal(f.hidden(),false,'focused toolbar retained');
});

test('editable controls, references and dialogs retain their own arrow keys',async()=>{
  const f=fixture();await f.enter();
  for(const id of ['page-number','display-mode','reference-panel']){
    const event=f.nodes.get(id).dispatch('keydown',{key:'ArrowDown'});assert.equal(f.page(),86,id);assert.equal(event.defaultPrevented,false,id);
  }
  f.nodes.get('contents-dialog').open=true;f.stage.dispatch('keydown',{key:'ArrowLeft'});assert.equal(f.page(),86);
  f.nodes.get('contents-dialog').open=false;f.nodes.get('zoom-dialog').open=true;f.stage.dispatch('keydown',{key:'ArrowLeft'});assert.equal(f.page(),86);
});

test('zoomed artwork pans rather than changing pages',()=>{
  const f=fixture();f.stage.scrollHeight=1500;
  const event=f.stage.dispatch('keydown',{key:'ArrowDown'});assert.equal(f.page(),86);assert.equal(f.stage.scrollTop,80);assert.equal(event.defaultPrevented,true);
});

test('mobile retains bottom navigation and has no page-turn keyboard interception',()=>{
  const f=fixture(390);assert.equal(f.ui.mode,'vertical');assert.equal(f.toolbar.hidden,true);assert.equal(f.nodes.get('navigation-controls').parentElement.id,'mobile-navigation');assert.equal(f.nodes.get('toggle-fullscreen').hidden,true);
  const event=f.stage.dispatch('keydown',{key:'ArrowDown'});assert.equal(f.page(),86);assert.equal(event.defaultPrevented,false);
});

test('fullscreen retains the existing source button above exit independently of hidden top controls',async()=>{
  const f=fixture(1600,[{page:86,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}]);await f.enter();
  assert.equal(f.nodes.get('toggle-fullscreen').parentElement.id,'fullscreen-affordance');
  assert.equal(f.nodes.get('reveal-controls').parentElement.id,'reader-shell');
  assert.equal(f.nodes.get('fullscreen-affordance').hidden,false);
  assert.equal(f.panel.hidden,true);assert.equal(f.nodes.get('navigation-rail').hidden,true);
  const source=f.nodes.get('open-references'),corner=f.nodes.get('fullscreen-affordance');
  assert.equal(source.parentElement,corner);assert.equal(source.hidden,false);assert.equal(source.disabled,false);
  assert.deepEqual(corner.children.map(n=>n.id),['open-references','toggle-fullscreen']);
  const sizes=f.figures.map(n=>n.style.width);
  source.dispatch('click');assert.equal(f.panel.hidden,false);assert.deepEqual(f.figures.map(n=>n.style.width),sizes);
  f.nodes.get('close-references').dispatch('click');f.stage.focus();
  f.ui.turn(1);assert.equal(source.hidden,false);assert.equal(source.disabled,true);assert.equal(f.hidden(),true);
  f.nodes.get('toggle-fullscreen').dispatch('click');await Promise.resolve();
  assert.equal(source.hidden,true);assert.equal(source.parentElement.id,'presentation-controls');
});

test('fullscreen touch reveals controls only from the upper edge and keeps a keyboard route',async()=>{
  const f=fixture();await f.enter();
  f.stage.dispatch('pointerdown',{pointerType:'touch',clientY:300});assert.equal(f.hidden(),true);
  f.stage.dispatch('pointerdown',{pointerType:'touch',clientY:20});assert.equal(f.hidden(),false);
});

test('normal desktop keeps its reserved source region while empty spreads omit headings and entry buttons',()=>{
  const links=[86,87].map(page=>({page,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}));
  const f=fixture(1600,links);f.ui.changed({page:86,offset:0});
  assert.equal(f.nodes.get('open-references').hidden,true);assert.equal(f.panel.hidden,false);
  assert.equal(f.panel.getAttribute('role'),'region');
  const walk=n=>[n,...n.children.flatMap(walk)];
  assert.equal(walk(f.nodes.get('reference-content')).filter(n=>n.tagName==='H3').length,2);
  f.ui.turn(1);assert.equal(f.page(),88);assert.equal(f.nodes.get('open-references').hidden,true);
  assert.equal(f.panel.hidden,false);assert.equal(f.panel.getAttribute('role'),'region');
  assert.equal(walk(f.nodes.get('reference-content')).filter(n=>n.tagName==='H3').length,0);
});

test('normal desktop reserved sources restore the original closed mobile drawer on resize',()=>{
  const f=fixture(1600,[{page:86,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}]);
  f.ui.changed({page:86,offset:0});assert.equal(f.panel.hidden,false);
  f.window.innerWidth=390;f.ui.resize();assert.equal(f.panel.hidden,true);assert.equal(f.nodes.get('mobile-navigation').inert,false);
});

test('focused mobile drawer becomes the normal desktop source region without retaining hidden close focus',()=>{
  const f=fixture(390,[{page:86,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}]);
  f.ui.changed({page:86,offset:0});f.nodes.get('open-references').dispatch('click');assert.equal(f.doc.activeElement.id,'close-references');
  f.window.innerWidth=1600;f.ui.resize();assert.equal(f.doc.activeElement.id,'reference-panel');
  assert.equal(f.panel.hidden,false);assert.equal(f.panel.getAttribute('role'),'region');
});

test('focused normal desktop sources return focus to the visible mobile menu when the drawer restores closed',()=>{
  const f=fixture(1600,[{page:86,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}]);
  f.ui.changed({page:86,offset:0});f.panel.focus();
  f.window.innerWidth=390;f.ui.resize();assert.equal(f.panel.hidden,true);
  assert.equal(f.doc.activeElement.id,'mobile-menu-toggle');
});

test('changing a normal sourced spread returns replaced source-link focus to its visible region',()=>{
  const f=fixture(1600,[86,88].map(page=>({page,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]})));
  f.ui.changed({page:86,offset:0});f.nodes.get('reference-content').querySelectorAll()[0].focus();f.ui.turn(1);
  assert.equal(f.doc.activeElement.id,'reference-panel');assert.equal(f.panel.getAttribute('role'),'region');
});

test('chapter labels cover both actual spread chapters without duplicates',async()=>{
  const {chapterLabel}=await import('../assets/presentation.mjs');assert.equal(typeof chapterLabel,'function');
  const chapters=[{page:42,title:'第5章 先生にも、後悔がある'},{page:53,title:'第6章 来月、このお金がいる'}];
  assert.equal(chapterLabel([52,53],chapters),'第5章 先生にも、後悔がある → 第6章 来月、このお金がいる');
  assert.equal(chapterLabel([54,55],chapters),'第6章 来月、このお金がいる');
});

test('restored fullscreen uses spare rail room only when the complete book already fits',async()=>{
  const {presentationGeometry}=await import('../assets/presentation.mjs');
  const pages=[{width:1200,height:1698},{width:1200,height:1698}];
  const narrow=presentationGeometry(pages,1024,900,{fullscreen:true,captionHeight:0});
  const wide=presentationGeometry(pages,2400,900,{fullscreen:true,captionHeight:0});
  assert.equal(narrow.railWidth,0);assert.ok(wide.railWidth>=180);
  for(const [width,g] of [[1024,narrow],[2400,wide]]){assert.ok(g.artWidth<=width);assert.ok(g.sizes.every(p=>p.height<=896));}
});

test('wide fullscreen auto-docks sources in spare room and honors intentional closing through page turns',async()=>{
  const f=fixture();f.stage.clientWidth=2400;f.stage.scrollWidth=2400;await f.enter();
  assert.equal(f.panel.hidden,false);assert.equal(f.panel.getAttribute('role'),'region');
  f.stage.dispatch('keydown',{key:'Tab'});assert.equal(f.hidden(),false);
  f.stage.focus();f.stage.dispatch('pointerdown',{pointerType:'mouse'});
  await new Promise(resolve=>setTimeout(resolve,220));assert.equal(f.hidden(),true);
  f.nodes.get('close-references').dispatch('click');assert.equal(f.panel.hidden,true);
  f.stage.focus();
  for(const key of ['ArrowLeft','ArrowDown','ArrowUp','ArrowRight']){
    f.stage.dispatch('keydown',{key});assert.equal(f.panel.hidden,true,key);assert.equal(f.hidden(),true,key);
  }
});

test('narrow fullscreen preserves closed sources and mobile bottom navigation across resize',async()=>{
  const f=fixture();await f.enter();f.window.innerWidth=1024;f.ui.resize();assert.equal(f.panel.hidden,true);
  f.window.innerWidth=390;f.ui.resize();
  assert.equal(f.panel.hidden,true);assert.equal(f.nodes.get('navigation-controls').parentElement.id,'mobile-navigation');
  assert.equal(f.nodes.get('toggle-fullscreen').parentElement.id,'fullscreen-affordance');
  f.window.innerWidth=1600;f.ui.resize();assert.equal(f.panel.hidden,true);
});

test('Escape exits restored closed-source fullscreen and the normal source region returns',async()=>{
  const f=fixture();await f.enter();
  assert.equal(f.panel.hidden,true);f.stage.dispatch('keydown',{key:'Escape'});await Promise.resolve();
  assert.equal(f.ui.fullscreen,false);assert.equal(f.panel.hidden,false);assert.equal(f.panel.getAttribute('role'),'region');
});

const readerSource=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
function method(name){const start=readerSource.indexOf(`function ${name}(`),end=readerSource.indexOf('\nfunction ',start+1);return readerSource.slice(start,end);}
test('desktop artwork replaces visible page captions with Enter and Space enlargement on the image',()=>{
  const f=fixture(),figures=[],images=[],opened=[];f.nodes.get('reader').replaceChildren();
  const context={document:f.doc,window:f.window,pageAlignment,verifiedCover,book:{title:'作品',links:[],pages:[{number:1,label:'1',width:1200,height:1698}]},pageLinks:new Map(),reader:f.nodes.get('reader'),figures,images,pageLabel:()=> '1ページ',openZoom:(page,opener)=>opened.push({page,opener}),loadPage(){}};
  vm.runInNewContext(method('element')+'\n'+method('renderPages')+'\nrenderPages();',context);
  assert.equal(figures[0].children.some(node=>node.tagName==='FIGCAPTION'),false);
  const enter=images[0].dispatch('keydown',{key:'Enter'}),space=images[0].dispatch('keydown',{key:' '});
  assert.equal(enter.defaultPrevented,true);assert.equal(space.defaultPrevented,true);assert.equal(opened.length,2);assert.equal(opened[0].opener,images[0]);
  f.window.innerWidth=390;images[0].dispatch('keydown',{key:'Enter'});assert.equal(opened.length,2);
});
test('loading page uses a neutral placeholder until the current image completes',()=>{
  const f=fixture(),figures=[],images=[];f.nodes.get('reader').replaceChildren();
  const context={document:f.doc,window:f.window,pageAlignment,verifiedCover,book:{title:'Book',links:[],pages:[{number:1,label:'1',width:1200,height:1698,src:'page.webp'}]},pageLinks:new Map(),reader:f.nodes.get('reader'),figures,images,pageLabel:()=> '1',openZoom(){},presentation:{quality:'normal'},assetURL:x=>x??null,documentURL:'https://example.test/read.html',wantsWide:()=>false,prefetch:{wake(){}}};
  vm.runInNewContext(method('element')+'\n'+method('renderPages')+'\n'+method('loadPage')+'\nrenderPages();loadPage(1);',context);
  const image=images[0],art=image.parentElement;assert.equal(art.classList.contains('page-loading'),true);
  image.currentSrc='obsolete.webp';image.dispatch('load');assert.equal(art.classList.contains('page-loading'),true);
  image.currentSrc=image.src;image.dispatch('load');assert.equal(art.classList.contains('page-loading'),false);
  const css=fs.readFileSync(new URL('../assets/reader.css',import.meta.url),'utf8');assert.match(css,/\.page-art\.page-loading\s*\{\s*background:\s*var\(--paper\)/);
});
test('door does not eagerly request its neighboring page ahead of the cover',()=>{
  const loads=[],context={door:{active:true},book:{totalPages:107},loadPage:page=>loads.push(page)};
  vm.runInNewContext(method('loadNeighborhood'),context);context.loadNeighborhood(1);assert.deepEqual(loads,[1]);
  loads.length=0;context.door.active=false;context.loadNeighborhood(2);assert.deepEqual(loads,[2,3,1]);
});
test('enlargement uses all viewport width at original ratio with natural vertical overflow',()=>{
  const zoomCanvas={style:{},getBoundingClientRect:()=>({width:480})};
  const context={zoomPage:1,zoomCanvas,zoomImage:{getAttribute:()=>null},presentation:{quality:'normal'},zoomViewport:{clientWidth:960,clientHeight:500,scrollLeft:0,scrollTop:0},book:{pages:[{width:1200,height:1698}]}};
  vm.runInNewContext(method('zoomLayout')+'\nzoomLayout();',context);
  assert.equal(zoomCanvas.style.width,'960px');assert.equal(zoomCanvas.style.height,'1358.4px');assert.equal(context.zoomViewport.scrollTop,0);
});
test('right click closes only an open enlargement artwork area without intercepting sources or normal reading',()=>{
  let closed=0;const canvas={contains:target=>target.art};
  const context={zoomDialog:{open:true,close(){closed++;}},zoomCanvas:canvas};
  vm.runInNewContext(method('closeZoomFromContextMenu'),context);
  const event=(art,link=false)=>({target:{art,closest:()=>link?{}:null},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}});
  for(const e of [event(false),event(true,true)]){context.closeZoomFromContextMenu(e);assert.equal(e.defaultPrevented,false);}
  const e=event(true);context.closeZoomFromContextMenu(e);assert.equal(e.defaultPrevented,true);assert.equal(closed,1);
  context.zoomDialog.open=false;context.closeZoomFromContextMenu(event(true));assert.equal(closed,1);
});
test('visiting P1 never overwrites saved progress while actual reading remains saved',()=>{
  const writes=[],context={savedResume:{page:73,offset:.4},getStorage:()=>null,storageKey:'progress',book:{version:'test',totalPages:107},writeProgress:(...args)=>{writes.push(args[3]);return true;}};
  vm.runInNewContext(method('saveReadingPosition'),context);
  assert.equal(context.saveReadingPosition({page:1,offset:0}),false);assert.equal(writes.length,0);assert.equal(context.savedResume.page,73);
  assert.equal(context.saveReadingPosition({page:2,offset:0}),true);assert.equal(writes.length,1);assert.equal(context.savedResume.page,2);
});
test('door reflow aligns the shell rather than the hidden vertical comic at600–767px',()=>{
  const window={scrollY:100,scrollTo({top}){this.scrollY=top;}};let settled=false;
  const context={door:{active:true},window,$:()=>({getBoundingClientRect:()=>({top:250})}),scrollWork:{cancel(){}},loadNeighborhood(){},presentation:{moveTo(){throw Error('hidden artwork must not determine door scroll');}},requestAnimationFrame:fn=>fn()};
  vm.runInNewContext(method('moveTo'),context);context.moveTo({page:1,offset:0},()=>settled=true);
  assert.equal(window.scrollY,350);assert.equal(settled,true);
});
test('normal desktop enhancement leaves the original fullscreen corner and hover state intact',async()=>{
  const f=fixture();assert.equal(f.shell.classList.contains('desktop-windowed'),true);
  await f.enter();assert.equal(f.shell.classList.contains('desktop-windowed'),false);
  assert.equal(f.nodes.get('toggle-fullscreen').parentElement.id,'fullscreen-affordance');assert.equal(f.hidden(),true);
});

test('manual quality changes only image requests and survives fullscreen, resize and scale changes',async()=>{
  const f=fixture(3840);f.window.innerHeight=2160;f.window.devicePixelRatio=2;f.ui.resize();
  assert.equal(f.ui.quality,'normal');assert.ok(f.loads.every(x=>x.preferHQ===false));
  f.stage.scrollTop=37;f.stage.scrollLeft=19;const before=f.figures.map(x=>x.style.width),mode=f.ui.mode,page=f.page();
  const quality=f.nodes.get('image-quality');quality.value='high';quality.dispatch('change');
  assert.equal(f.ui.quality,'high');assert.equal(f.page(),page);assert.equal(f.ui.mode,mode);assert.equal(f.stage.scrollTop,37);assert.equal(f.stage.scrollLeft,19);assert.deepEqual(f.figures.map(x=>x.style.width),before);
  assert.ok(f.loads.slice(-2).every(x=>x.preferHQ));await f.enter();assert.equal(f.ui.quality,'high');
  f.nodes.get('toggle-fullscreen').dispatch('click');await Promise.resolve();assert.equal(f.ui.quality,'high');
  quality.value='normal';quality.dispatch('change');const start=f.loads.length;
  f.nodes.get('size-slider').value='200';f.nodes.get('size-slider').dispatch('input');f.ui.resize();
  assert.equal(f.ui.quality,'normal');assert.ok(f.loads.slice(start).every(x=>x.preferHQ===false));
});

test('phone quality is in the existing menu without moving bottom navigation or changing vertical reading',()=>{
  const f=fixture(390);assert.equal(f.nodes.get('image-quality-control').parentElement.id,'mobile-menu-actions');
  const quality=f.nodes.get('image-quality');quality.value='high';quality.dispatch('change');assert.equal(f.ui.quality,'high');
  assert.equal(f.ui.mode,'vertical');assert.equal(f.nodes.get('navigation-controls').parentElement.id,'mobile-navigation');assert.equal(f.page(),86);
});
