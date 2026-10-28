import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigation} from '../assets/navigation.mjs';
const module=await import('../assets/reader-door.mjs').catch(()=>null);

function fixture({width=1440,height=900,touch=false,resume=null,portraitCoverURL='assets/a4.webp',coverURL='assets/square.webp'}={}){
  assert.equal(typeof module?.createReaderDoor,'function');
  class Node {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.hidden=false;this.attrs={};this.events={};this.dataset={};this.textContent='';this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c)};}
    append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}}
    remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}}
    contains(n){return n===this||this.children.some(c=>c.contains(n));}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k]??null;}
    removeAttribute(k){delete this.attrs[k];}
    addEventListener(t,f){(this.events[t]??=[]).push(f);}
    removeEventListener(t,f){this.events[t]=(this.events[t]??[]).filter(x=>x!==f);}
    dispatch(t,p={}){const e={target:this,detail:1,pointerType:'touch',pointerId:1,isPrimary:true,clientX:0,clientY:0,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...p};for(const fn of this.events[t]??[])fn(e);return e;}
    closest(selectors){return selectors.split(',').some(s=>s.trim()===this.tagName.toLowerCase()||s.trim()==='#'+this.id)?this:this.parentElement?.closest(selectors)??null;}
    focus(){doc.activeElement=this;}
    all(){return this.children.flatMap(n=>[n,...n.all()]);}
  }
  const doc=new Node('document'),view={innerWidth:width,innerHeight:height,matchMedia:()=>({matches:touch}),addEventListener(){},removeEventListener(){}};doc.defaultView=view;doc.createElement=tag=>{const n=new Node(tag);n.ownerDocument=doc;return n;};doc.querySelector=()=>null;doc.getElementById=id=>doc.all().find(n=>n.id===id)??null;
  const shell=doc.createElement('section'),original=doc.createElement('main');doc.append(shell);shell.append(original);
  let page=1,fullscreen=false,navigations=[],contents=0;
  const book={title:'オルカンに勝てん！',totalPages:107,download:{url:'downloads/current.pdf',bytes:111991201},chapters:[{page:1,title:'表紙'},{page:2,title:'序章'},{page:52,title:'第6章 来月、このお金がいる'},{page:61,title:'終章'}]};
  const door=module.createReaderDoor({shell,book,getPage:()=>page,getResume:()=>resume,getFullscreen:()=>fullscreen,coverURL,portraitCoverURL,onNavigate:(p,o)=>navigations.push([p,o]),onContents:()=>contents++,now:()=>100});
  return {doc,view,shell,original,door,book,navigations,contents:()=>contents,setPage:p=>page=p,setFullscreen:v=>fullscreen=v,get:id=>doc.getElementById(id)};
}
test('P1 door mounts without moving core DOM or navigating, including fullscreen, and disables on P2',()=>{
  const f=fixture();f.door.sync();assert.equal(f.door.active,true);assert.equal(f.shell.classList.contains('door-open'),true);assert.equal(f.original.parentElement,f.shell);assert.equal(f.get('reader-door-image').getAttribute('src'),'assets/square.webp');assert.deepEqual(f.navigations,[]);
  f.setFullscreen(true);f.door.sync();assert.equal(f.door.active,true);assert.equal(f.shell.classList.contains('door-open'),true);
  f.setFullscreen(false);f.setPage(2);f.door.sync();assert.equal(f.door.active,false);f.door.destroy();assert.equal(f.original.parentElement,f.shell);
});
test('repeated returns to P1 restore the door in either fullscreen state without navigating',()=>{
  const f=fixture();
  for(const fullscreen of [false,true,false,true]) {
    f.setFullscreen(fullscreen);f.setPage(2);f.door.sync();assert.equal(f.door.active,false);
    f.setPage(1);f.door.sync();assert.equal(f.door.active,true);assert.equal(f.get('reader-door-image').getAttribute('src'),'assets/square.webp');
  }
  assert.deepEqual(f.navigations,[]);
});
test('fullscreen rapid navigation and history restores keep the latest page and its door state',()=>{
  const f=fixture();f.setFullscreen(true);let page=1;const settled=[],history=[];
  const nav=createNavigation({totalPages:107,readPosition:()=>({page,offset:0}),
    push:position=>history.push(position.page),replace(){},save(){},
    onChange:position=>{page=position.page;f.setPage(page);f.door.sync();},
    moveTo:(position,done)=>settled.push(done)});
  nav.start({page:1,offset:0});nav.go(2);nav.go(1);nav.go(4);nav.go(1);
  assert.deepEqual(history,[2,1,4,1]);assert.equal(page,1);assert.equal(f.door.active,true);
  for(const done of settled)done();
  assert.equal(page,1);assert.equal(f.door.active,true);
  nav.restore('#p=2');assert.equal(page,2);assert.equal(f.door.active,false);
  nav.restore('#p=1');assert.equal(page,1);assert.equal(f.door.active,true);
  assert.deepEqual(f.navigations,[]);
});
test('resume button preserves saved offset and chapter while start/image/key always begin P2',()=>{
  const f=fixture({resume:{page:53,offset:.27}});f.door.sync();
  assert.match(f.get('reader-door-primary').textContent,/続き.*53.*第6章/);
  f.doc.dispatch('keydown',{key:'Enter',target:f.get('reader-door-primary')});assert.equal(f.navigations.length,0);
  f.get('reader-door-primary').dispatch('click');assert.deepEqual(f.navigations,[[53,.27]]);
  f.get('reader-door-start').dispatch('click');f.get('reader-door-cover').dispatch('click');
  f.doc.dispatch('keydown',{key:'ArrowLeft',target:f.original});f.doc.dispatch('keydown',{key:'Enter',target:f.original});
  assert.deepEqual(f.navigations,[[53,.27],[2,0],[2,0],[2,0],[2,0]]);
  const before=f.navigations.length;f.doc.dispatch('keydown',{key:'Enter',target:f.get('reader-door-contents')});assert.equal(f.navigations.length,before);f.get('reader-door-contents').dispatch('click');assert.equal(f.contents(),1);
  const input=f.doc.createElement('input');f.original.append(input);f.doc.dispatch('keydown',{key:'Enter',target:input});assert.equal(f.navigations.length,before);
  f.door.sync({resume:{page:61,offset:.4}});assert.match(f.get('reader-door-primary').textContent,/61.*終章/);assert.equal(f.get('reader-door-resume').hidden,true);
  assert.equal(f.get('reader-door-pdf').getAttribute('href'),'downloads/current.pdf');assert.match(f.get('reader-door-pdf').textContent,/112/);
});
test('native viewport pinch zoom blocks starting or completing a door swipe',()=>{
  const f=fixture({width:390,height:844});f.door.sync();const image=f.get('reader-door-image');
  f.view.visualViewport={scale:2};f.doc.dispatch('pointerdown',{target:image});f.doc.dispatch('pointerup',{target:image,clientX:100});assert.equal(f.navigations.length,0);
  f.view.visualViewport.scale=1;f.doc.dispatch('pointerdown',{target:image});f.view.visualViewport.scale=2;f.doc.dispatch('pointerup',{target:image,clientX:100});assert.equal(f.navigations.length,0);
});
test('phone and coarse portrait choose explicit A4, coarse landscape and desktop choose square',()=>{
  for(const [width,height,touch,layout,url] of [[390,844,true,'phone','assets/a4.webp'],[800,1200,true,'touch-portrait','assets/a4.webp'],[1000,700,true,'touch-landscape','assets/square.webp'],[1440,900,false,'desktop','assets/square.webp']]){
    const f=fixture({width,height,touch});f.door.sync();assert.equal(f.shell.dataset.doorLayout,layout);assert.equal(f.get('reader-door-image').getAttribute('src'),url);
  }
  const f=fixture({width:390,height:844,portraitCoverURL:null});f.door.sync();assert.equal(f.get('reader-door-image').getAttribute('src'),null);assert.equal(f.door.hasCover,false);
});
test('right swipe advances once, while vertical/multiple touches and links do not',()=>{
  const f=fixture({width:390,height:844});f.door.sync();const image=f.get('reader-door-image');
  f.doc.dispatch('pointerdown',{target:image,clientX:10});f.doc.dispatch('pointerup',{target:image,clientX:100});assert.deepEqual(f.navigations,[[2,0]]);
  const click=f.doc.dispatch('click',{target:image});assert.equal(click.prevented,true);
  f.doc.dispatch('pointerdown',{target:image});f.doc.dispatch('pointerdown',{target:image,pointerId:2,isPrimary:false});f.doc.dispatch('pointerup',{target:image,clientX:100});f.doc.dispatch('pointerup',{target:image,pointerId:2});
  f.doc.dispatch('pointerdown',{target:image});f.doc.dispatch('pointermove',{target:image,clientX:10,clientY:40});f.doc.dispatch('pointerup',{target:image,clientX:100,clientY:40});
  f.doc.dispatch('pointerdown',{target:f.get('reader-door-pdf')});f.doc.dispatch('pointerup',{target:f.get('reader-door-pdf'),clientX:100});assert.equal(f.navigations.length,1);
});
