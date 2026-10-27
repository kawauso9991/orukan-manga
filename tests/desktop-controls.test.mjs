import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopControls} from '../assets/desktop-controls.mjs';

function fixture({directFullscreen=true,missingProgress=false}={}){
  class Node {
    constructor(tag='div',doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.childNodes=[];this.parentNode=null;this.attributes={};this.dataset={};this.hidden=false;this.listeners={};this._text='';this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c)};this.style={values:{},setProperty(k,v){this.values[k]=v;},removeProperty(k){delete this.values[k];},getPropertyValue(k){return this.values[k]??'';}};}
    get children(){return this.childNodes;}
    get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]??null;}
    get firstChild(){return this.childNodes[0]??null;}
    get parentElement(){return this.parentNode;}
    get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('');}
    set textContent(v){this._text=String(v);this.childNodes=[];}
    append(...nodes){for(const n of nodes)this.insertBefore(n,null);}
    insertBefore(n,before){n.remove();const i=before?this.childNodes.indexOf(before):this.childNodes.length;this.childNodes.splice(i,0,n);n.parentNode=this;}
    remove(){if(this.parentNode){this.parentNode.childNodes=this.parentNode.childNodes.filter(n=>n!==this);this.parentNode=null;}}
    setAttribute(k,v){this.attributes[k]=String(v);}
    getAttribute(k){return this.attributes[k]??null;}
    removeAttribute(k){delete this.attributes[k];}
    contains(n){return n===this||this.childNodes.some(c=>c.contains(n));}
    addEventListener(t,f){(this.listeners[t]??=[]).push(f);}
    removeEventListener(t,f){this.listeners[t]=(this.listeners[t]??[]).filter(x=>x!==f);}
    dispatch(t,props={}){const e={target:this,preventDefault(){this.defaultPrevented=true;},...props};for(let n=this;n;n=n.parentNode)for(const f of n.listeners[t]??[])f(e);return e;}
    focus(){this.ownerDocument.activeElement=this;}
    querySelector(sel){return this.childNodes.flatMap(n=>[n,...n.all()]).find(n=>sel[0]==='#'?n.id===sel.slice(1):sel[0]==='.'?n.className===sel.slice(1):false)??null;}
    all(){return this.childNodes.flatMap(n=>[n,...n.all()]);}
  }
  const doc=new Node('document');doc.ownerDocument=doc;doc.createElement=t=>new Node(t,doc);doc.getElementById=id=>doc.all().find(n=>n.id===id)??null;
  const make=(id,tag='div')=>{const n=doc.createElement(tag);n.id=id;return n;};
  const shell=make('reader-shell'),toolbar=make('reader-toolbar'),inner=make('toolbar-inner'),home=make('toolbar-navigation-home'),progress=make('progress-track'),display=make('presentation-controls'),message=make('reader-message'),body=make('reading-body');
  doc.append(shell);shell.append(toolbar,body);toolbar.append(inner);inner.append(home,display,message,progress);
  const status=make('reading-status'),position=make('current-position'),chapter=make('current-chapter'),nav=make('navigation-controls');home.append(status,nav);position.textContent='53 / 107';chapter.textContent='Sixth';status.append(position,chapter);
  const fit=make('fit-mode','select'),slider=make('size-slider','input'),group=directFullscreen?display:make('fullscreen-control-group'),source=make('open-references','button'),fullscreen=make('toggle-fullscreen','button');fit.value='height';slider.value='100';display.append(fit,slider);if(!directFullscreen)display.append(group);group.append(source,fullscreen);
  let page=53,layouts=0;const originals=[...inner.children],originalGroup=[...group.children];
  const ui=createDesktopControls({shell,navigationHome:home,progressTrack:missingProgress?undefined:progress,displayControls:display,book:{title:'オルカンに勝てん！',totalPages:107,chapters:[{page:1,title:'Intro'},{page:45,title:'Fifth'},{page:52,title:'Sixth'},{page:61,title:'Final'}]},getPage:()=>page,onLayout:()=>layouts++});
  return {doc,shell,home,progress,display,inner,group,fullscreen,fit,slider,ui,originals,originalGroup,get:id=>doc.getElementById(id),page:n=>page=n,layouts:()=>layouts};
}

test('normal sidebar moves existing blocks and restores their exact original order on exit',()=>{
  const f=fixture();f.ui.sync({normal:true});
  assert.equal(f.shell.classList.contains('desktop-controls-active'),true);
  assert.equal(f.home.parentNode.id,'desktop-controls-body');
  assert.equal(f.fullscreen.parentNode.id,'desktop-controls-corner');
  assert.equal(f.get('desktop-operations-button').textContent,'操作');
  assert.equal(f.get('desktop-chapter-position').textContent,'2 / 9');
  assert.equal(f.get('desktop-next-chapter').getAttribute('href'),'#p=61');
  assert.equal(f.layouts(),0);f.ui.sync({normal:true});assert.equal(f.layouts(),0);
  f.page(107);f.ui.sync({normal:true});assert.equal(f.get('desktop-next-chapter').hidden,true);
  f.ui.sync({normal:false});assert.deepEqual(f.inner.children,f.originals);assert.deepEqual(f.group.children,f.originalGroup);
  assert.equal(f.get('desktop-controls-sidebar'),null);assert.equal(f.shell.classList.contains('desktop-controls-active'),false);
});
test('partial fixture DOM and absent progress are harmless, and grouped fullscreen restores too',()=>{
  assert.doesNotThrow(()=>{const ui=createDesktopControls({shell:{},navigationHome:{},displayControls:{}});ui.sync({normal:true});ui.destroy();});
  const f=fixture({directFullscreen:false,missingProgress:true});f.ui.sync({normal:true});
  assert.equal(f.fullscreen.parentNode.id,'desktop-controls-corner');f.ui.sync({normal:false});
  assert.ok(f.inner.children.every((node,i)=>node===f.originals[i]));assert.ok(f.group.children.every((node,i)=>node===f.originalGroup[i]));
});
test('operations are an overlay that closes outside or with Escape and preserves existing handlers',()=>{
  const f=fixture();let changes=0;f.slider.addEventListener('input',()=>changes++);f.ui.sync({normal:true});
  const button=f.get('desktop-operations-button'),panel=f.get('desktop-display-panel');
  button.dispatch('click');assert.equal(panel.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
  f.doc.dispatch('keydown',{key:'Escape'});assert.equal(panel.hidden,true);assert.equal(f.doc.activeElement,button);
  button.dispatch('click');f.doc.dispatch('pointerdown',{target:f.shell});assert.equal(panel.hidden,true);
  f.slider.value='125';f.slider.dispatch('input');assert.equal(changes,1);assert.equal(f.shell.style.getPropertyValue('--desktop-scale'),'1.25');
  f.fit.value='width';f.fit.dispatch('change');assert.equal(f.shell.dataset.desktopFit,'width');
  f.ui.destroy();assert.deepEqual(f.inner.children,f.originals);assert.equal(f.shell.style.getPropertyValue('--desktop-scale'),'');
});
test('responsive compact sidebar is a44px-band state with an explicit temporary expand and close action',()=>{
  const f=fixture();f.ui.sync({normal:true,compact:true});
  assert.equal(f.shell.classList.contains('desktop-controls-compact'),true);
  assert.equal(f.get('desktop-controls-body').hidden,true);assert.equal(f.get('desktop-controls-strip').hidden,false);
  assert.equal(f.get('desktop-controls-initial').textContent,'オ');assert.equal(f.get('desktop-controls-page').textContent,'53');
  const toggle=f.get('desktop-controls-toggle');assert.equal(toggle.textContent,'>');assert.equal(f.layouts(),0);
  toggle.dispatch('click');assert.equal(f.shell.classList.contains('desktop-controls-compact'),false);assert.equal(toggle.textContent,'<');assert.equal(f.layouts(),1);
  f.page(54);f.ui.sync({normal:true,compact:true});assert.equal(f.get('desktop-controls-page').textContent,'54');assert.equal(f.get('desktop-controls-body').hidden,false);
  toggle.dispatch('click');assert.equal(f.get('desktop-controls-body').hidden,true);assert.equal(f.layouts(),2);
  f.ui.sync({normal:true,compact:false});assert.equal(toggle.hidden,true);assert.equal(f.get('desktop-controls-body').hidden,false);
  f.ui.sync({normal:false});assert.equal(f.shell.classList.contains('desktop-controls-compact'),false);
});
