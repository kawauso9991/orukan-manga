import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPresentationUI} from '../assets/presentation-ui.mjs';
import {keyDirection, visiblePages, stepPage} from '../assets/presentation.mjs';

// Browser layout/fullscreen are supplied here; the real presentation UI owns
// all event handlers, page decisions, toolbar visibility and focus behavior.
function fixture(width=1600,links=[]) {
  const nodes=new Map();
  class Node {
    constructor(id='',tag='div'){this.id=id;this.tagName=tag.toUpperCase();this.children=[];this.hidden=false;this.inert=false;this.open=false;this.dataset={};this.attributes={};this.listeners={};this.scrollLeft=0;this.scrollTop=0;this.clientWidth=1600;this.clientHeight=900;this.scrollWidth=1600;this.scrollHeight=900;this.style={setProperty(){}};this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name)};}
    append(...children){for(const child of children){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(n=>n!==child);child.parentElement=this;this.children.push(child);}}
    replaceChildren(...children){this.children=[];this.append(...children);}
    contains(node){for(;node;node=node.parentElement)if(node===this)return true;return false;}
    get firstElementChild(){return this.children[0];}
    setAttribute(name,value){this.attributes[name]=String(value);}
    removeAttribute(name){delete this.attributes[name];}
    getAttribute(name){return this.attributes[name]??null;}
    getBoundingClientRect(){return {left:0,right:1600,top:0,bottom:80,width:1600,height:this.id==='reader-toolbar'?80:48};}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    dispatch(type,props={}){const event={type,target:this,bubbles:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};for(let node=this;node;node=event.bubbles?node.parentElement:null){for(const fn of node.listeners[type]??[]){fn(event);if(event.stopped)break;}}return event;}
    closest(selectors){for(let n=this;n;n=n.parentElement)if(selectors.split(',').some(s=>s.trim().startsWith('#')?n.id===s.trim().slice(1):s.trim().startsWith('[contenteditable]')?n.contentEditable==='true':n.tagName===s.trim().toUpperCase()))return n;return null;}
    querySelectorAll(){return this.children.flatMap(child=>[child,...child.querySelectorAll()]).filter(n=>n.tagName==='BUTTON'||n.tagName==='A');}
    focus(){const previous=doc.activeElement;doc.activeElement=this;if(previous!==this){previous?.dispatch('focusout',{relatedTarget:this});this.dispatch('focusin',{relatedTarget:previous});}}
    matches(selector){return selector===':hover'?false:false;}
    scrollBy({left=0,top=0}){this.scrollLeft+=left;this.scrollTop+=top;}
  }
  const node=(id,tag)=>{const n=new Node(id,tag);nodes.set(id,n);return n;};
  const doc=new Node('document');doc.body=node('body','body');doc.append(doc.body);doc.documentElement=node('html','html');doc.activeElement=doc.body;doc.URL='https://example.test/read.html';doc.getElementById=id=>nodes.get(id);doc.createElement=tag=>new Node('',tag);doc.createDocumentFragment=()=>new Node();doc.querySelector=()=>[...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)??null;
  const shell=node('reader-shell');doc.body.append(shell);
  const toolbar=node('reader-toolbar','nav'),body=node('reading-body'),rail=node('navigation-rail','nav'),stage=node('reading-stage'),deck=node('reader'),panel=node('reference-panel','aside'),home=node('toolbar-navigation-home'),presentation=node('presentation-controls'),affordance=node('fullscreen-affordance'),mobile=node('mobile-navigation','nav'),actions=node('mobile-menu-actions');
  shell.append(toolbar,body,affordance,mobile);toolbar.append(home,presentation);body.append(rail,stage,panel);stage.append(deck);mobile.append(actions);panel.hidden=true;
  presentation.append(node('fullscreen-control-group'));
  const ids=['reading-status','navigation-controls','toolbar-contents','open-references','toggle-fullscreen','reveal-controls','mobile-menu-toggle','previous','next','page-number','display-mode','fit-mode','size-slider','size-level','size-out','size-in','size-controls','zoom-show-references','close-references','reference-content','contents-dialog','zoom-dialog','reader-message'];
  for(const id of ids)node(id,id.endsWith('dialog')?'dialog':id==='page-number'?'input':/mode$/.test(id)?'select':/controls$|content$|status$|level$/.test(id)?'div':'button');
  home.append(nodes.get('reading-status'),nodes.get('navigation-controls'));nodes.get('navigation-controls').append(nodes.get('previous'),nodes.get('page-number'),nodes.get('next'),nodes.get('toolbar-contents'));presentation.append(...['open-references','toggle-fullscreen','display-mode','fit-mode','size-slider','size-out','size-in','size-controls','size-level'].map(id=>nodes.get(id)));affordance.append(nodes.get('reveal-controls'));panel.append(nodes.get('close-references'),nodes.get('reference-content'));shell.append(nodes.get('contents-dialog'),nodes.get('zoom-dialog'));
  const win={innerWidth:width,getComputedStyle:()=>({fontSize:'16px',overflowY:'visible',overflowX:'visible'}),scrollTo(){},scrollY:0};
  Object.assign(globalThis,{window:win,document:doc,requestAnimationFrame:()=>0,Image:class{}});
  shell.requestFullscreen=async()=>{doc.fullscreenElement=shell;doc.dispatch('fullscreenchange');};doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.dispatch('fullscreenchange');};
  let page=86;const turns=[];const figures=[],images=[];
  const book={totalPages:107,pages:Array.from({length:107},(_,i)=>({number:i+1,label:String(i+1),width:1200,height:1698})),links};
  for(const item of book.pages){const figure=new Node(`page-${item.number}`),caption=new Node(),art=new Node(),image=new Node();figure.append(caption,art);art.append(image);deck.append(figure);figures.push(figure);images.push(image);}
  let ui;ui=createPresentationUI({book,figures,images,getPage:()=>page,getStorage:()=>null,go:next=>{page=next;turns.push(next);ui.changed({page,offset:0});},makeLink:()=>new Node('', 'a'),reflow(){},persist(){},loadPage(){},observeScroll(){}});
  return {nodes,doc,window:win,shell,toolbar,stage,panel,ui,turns,page:()=>page,enter:async()=>{nodes.get('toggle-fullscreen').dispatch('click');await Promise.resolve();},hidden:()=>shell.classList.contains('chrome-hidden')};
}

test('all four arrows follow manga navigation without reversing spread order',()=>{
  assert.deepEqual(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].map(keyDirection),[1,1,-1,-1]);
  assert.deepEqual(visiblePages(87,'spread',107),[86,87]);
  assert.equal(stepPage(86,1,'spread',107),88);
  assert.equal(stepPage(88,-1,'spread',107),86);
});

test('manual hide survives repeated page navigation, wheel and incidental pointer/focus movement',async()=>{
  const f=fixture();await f.enter();
  f.nodes.get('reveal-controls').dispatch('click'); // initial toolbar may be visible
  if(!f.hidden())f.nodes.get('reveal-controls').dispatch('click');
  assert.equal(f.hidden(),true);
  for(const key of ['ArrowLeft','ArrowDown','ArrowRight','ArrowUp']){f.stage.dispatch('keydown',{key});assert.equal(f.hidden(),true, key);}
  f.stage.dispatch('wheel',{deltaY:120,deltaX:0,deltaMode:0});assert.equal(f.hidden(),true,'wheel');
  f.stage.dispatch('pointermove',{pointerType:'mouse',clientX:800,clientY:400});assert.equal(f.hidden(),true,'incidental pointer');
  f.nodes.get('next').focus();f.nodes.get('next').dispatch('click');assert.equal(f.hidden(),true,'sidebar focus');
});

test('upper edge reveals controls, leaving hides them, intentional Tab still reveals',async()=>{
  const f=fixture();await f.enter();
  if(!f.hidden())f.nodes.get('reveal-controls').dispatch('click');
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

test('desktop fullscreen places operation buttons in the upper toolbar and pins sources separately',async()=>{
  const f=fixture();await f.enter();
  assert.equal(f.toolbar.contains(f.nodes.get('navigation-controls')),true);
  for(const id of ['reveal-controls','toggle-fullscreen'])assert.equal(f.toolbar.contains(f.nodes.get(id)),true,id);
  const group=f.nodes.get('fullscreen-control-group');assert.equal(group.children[0],f.nodes.get('open-references'));assert.equal(group.children[1],f.nodes.get('toggle-fullscreen'));
  assert.equal(f.nodes.get('fullscreen-affordance').hidden,true);
  assert.equal(f.panel.hidden,false);assert.equal(f.panel.getAttribute('role'),'region');
  assert.equal(f.nodes.get('close-references').hidden,true);
});

test('normal reader hides zero sources and counts both visible pages before updating on page turns',()=>{
  const links=[86,87].map(page=>({page,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}));
  const f=fixture(1600,links);f.ui.changed({page:86,offset:0});
  assert.equal(f.nodes.get('open-references').hidden,false);assert.equal(f.nodes.get('open-references').textContent,'出典・参照 (2)');
  f.nodes.get('open-references').dispatch('click');assert.equal(f.panel.hidden,false);
  f.ui.turn(1);assert.equal(f.page(),88);assert.equal(f.nodes.get('open-references').hidden,true);assert.equal(f.panel.hidden,true);
});

test('normal desktop automatic sources do not become a blocking mobile drawer on resize',()=>{
  const f=fixture(1600,[{page:86,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}]);
  f.ui.changed({page:86,offset:0});assert.equal(f.panel.hidden,false);
  f.window.innerWidth=390;f.ui.resize();assert.equal(f.panel.hidden,true);assert.equal(f.nodes.get('mobile-navigation').inert,false);
});
test('a mobile drawer close button transfers focus to the source region when desktop pins it',()=>{
  const f=fixture(390,[{page:86,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}]);
  f.ui.changed({page:86,offset:0});f.nodes.get('open-references').dispatch('click');assert.equal(f.doc.activeElement.id,'close-references');
  f.window.innerWidth=1600;f.ui.resize();assert.equal(f.doc.activeElement.id,'reference-panel');
});
test('focused automatic desktop sources return focus to the visible mobile menu when hidden',()=>{
  const f=fixture(1600,[{page:86,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]}]);
  f.ui.changed({page:86,offset:0});f.nodes.get('open-references').dispatch('click');assert.equal(f.doc.activeElement.id,'reference-panel');
  f.window.innerWidth=390;f.ui.resize();assert.equal(f.doc.activeElement.id,'mobile-menu-toggle');
});

test('changing a sourced spread returns removed source-link focus to the visible source region',()=>{
  const f=fixture(1600,[86,88].map(page=>({page,type:'external',url:'https://example.test/source',rect:[.1,.1,.1,.1]})));
  f.ui.changed({page:86,offset:0});f.nodes.get('reference-content').querySelectorAll()[0].focus();f.ui.turn(1);
  assert.equal(f.doc.activeElement.id,'reference-panel');assert.equal(f.nodes.get('close-references').hidden,true);
});

test('chapter labels cover both actual spread chapters without duplicates',async()=>{
  const {chapterLabel}=await import('../assets/presentation.mjs');assert.equal(typeof chapterLabel,'function');
  const chapters=[{page:42,title:'第5章 先生にも、後悔がある'},{page:53,title:'第6章 来月、このお金がいる'}];
  assert.equal(chapterLabel([52,53],chapters),'第5章 先生にも、後悔がある → 第6章 来月、このお金がいる');
  assert.equal(chapterLabel([54,55],chapters),'第6章 来月、このお金がいる');
});

test('fullscreen source rail allocation leaves a separate fitted artwork area at narrow PC widths',async()=>{
  const {fullscreenReferenceWidth,presentationGeometry}=await import('../assets/presentation.mjs');assert.equal(typeof fullscreenReferenceWidth,'function');
  for(const width of [1024,1280,1600,1920,2560])for(const font of [16,32]) {
    const refs=fullscreenReferenceWidth(width,font),artArea=width-refs;
    const geometry=presentationGeometry([{width:1200,height:1698},{width:1200,height:1698}],artArea,800,{fullscreen:true,rootFontSize:font});
    assert.ok(refs>=180&&refs<=width*.4);assert.ok(geometry.artWidth<=artArea);
    assert.ok(geometry.sizes.every(page=>page.height<=796));
  }
});

test('persistent sources survive toolbar hiding, repeated page turns and attempted closing',async()=>{
  const f=fixture();await f.enter();
  f.stage.dispatch('keydown',{key:'Tab'});assert.equal(f.hidden(),false);
  f.nodes.get('reveal-controls').dispatch('click',{detail:1});assert.equal(f.hidden(),true);
  for(const key of ['ArrowLeft','ArrowDown','ArrowUp','ArrowRight']){
    f.stage.dispatch('keydown',{key});assert.equal(f.panel.hidden,false,key);assert.equal(f.hidden(),true,key);
  }
  f.nodes.get('close-references').dispatch('click');assert.equal(f.panel.hidden,false);
});

test('fullscreen resize retains sources on PC and restores mobile bottom controls without forcing a drawer',async()=>{
  const f=fixture();await f.enter();f.window.innerWidth=1024;f.ui.resize();
  assert.equal(f.panel.hidden,false);assert.equal(f.panel.getAttribute('role'),'region');
  f.window.innerWidth=390;f.ui.resize();
  assert.equal(f.panel.hidden,true);assert.equal(f.nodes.get('navigation-controls').parentElement.id,'mobile-navigation');
  assert.equal(f.nodes.get('toggle-fullscreen').parentElement.id,'fullscreen-affordance');
  f.window.innerWidth=1600;f.ui.resize();assert.equal(f.panel.hidden,false);
});

test('Escape exits desktop fullscreen while sources remain pinned, restoring windowed source visibility',async()=>{
  const f=fixture();await f.enter();
  assert.equal(f.panel.hidden,false);f.stage.dispatch('keydown',{key:'Escape'});await Promise.resolve();
  assert.equal(f.ui.fullscreen,false);assert.equal(f.panel.hidden,true);
});

const readerSource=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
function method(name){const start=readerSource.indexOf(`function ${name}(`),end=readerSource.indexOf('\nfunction ',start+1);return readerSource.slice(start,end);}
test('desktop artwork replaces visible page captions with Enter and Space enlargement on the image',()=>{
  const f=fixture(),figures=[],images=[],opened=[];f.nodes.get('reader').replaceChildren();
  const context={document:f.doc,window:f.window,book:{title:'作品',links:[],pages:[{number:1,label:'1',width:1200,height:1698}]},pageLinks:new Map(),reader:f.nodes.get('reader'),figures,images,pageLabel:()=> '1ページ',openZoom:(page,opener)=>opened.push({page,opener}),loadPage(){}};
  vm.runInNewContext(method('element')+'\n'+method('renderPages')+'\nrenderPages();',context);
  assert.equal(figures[0].children.some(node=>node.tagName==='FIGCAPTION'),false);
  const enter=images[0].dispatch('keydown',{key:'Enter'}),space=images[0].dispatch('keydown',{key:' '});
  assert.equal(enter.defaultPrevented,true);assert.equal(space.defaultPrevented,true);assert.equal(opened.length,2);assert.equal(opened[0].opener,images[0]);
  f.window.innerWidth=390;images[0].dispatch('keydown',{key:'Enter'});assert.equal(opened.length,2);
});
test('enlargement uses all viewport width at original ratio with natural vertical overflow',()=>{
  const zoomCanvas={style:{},getBoundingClientRect:()=>({width:480})};
  const context={zoomPage:1,zoomCanvas,zoomViewport:{clientWidth:960,clientHeight:500,scrollLeft:0,scrollTop:0},book:{pages:[{width:1200,height:1698}]}};
  vm.runInNewContext(method('zoomLayout')+'\nzoomLayout();',context);
  assert.equal(zoomCanvas.style.width,'960px');assert.equal(zoomCanvas.style.height,'1358.4px');assert.equal(context.zoomViewport.scrollTop,0);
});
test('normal desktop and fullscreen keep distinct fixed-sidebar and hover-toolbar modes',async()=>{
  const f=fixture();assert.equal(f.shell.classList.contains('desktop-windowed'),true);
  await f.enter();assert.equal(f.shell.classList.contains('desktop-windowed'),false);assert.equal(f.shell.classList.contains('desktop-fullscreen'),true);assert.equal(f.hidden(),true);
});
