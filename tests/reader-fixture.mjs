import {createPresentationUI} from '../assets/presentation-ui.mjs';
// Browser layout/fullscreen are supplied here; the real presentation UI owns
// all event handlers, page decisions, toolbar visibility and focus behavior.
export function fixture(width=1600,links=[],providedBook=null) {
  const nodes=new Map();
  class Node {
    constructor(id='',tag='div'){this.id=id;this.tagName=tag.toUpperCase();this.children=[];this.hidden=false;this.disabled=false;this.inert=false;this.open=false;this.dataset={};this.attributes={};this.listeners={};this.scrollLeft=0;this.scrollTop=0;this.clientWidth=1600;this.clientHeight=900;this.scrollWidth=1600;this.scrollHeight=900;this.style={setProperty(name,value){this[name]=value;}};this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name)};}
    append(...children){for(const child of children){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(n=>n!==child);child.parentElement=this;this.children.push(child);}}
    replaceChildren(...children){this.children=[];this.append(...children);}
    contains(node){for(;node;node=node.parentElement)if(node===this)return true;return false;}
    get firstElementChild(){return this.children[0];}
    setAttribute(name,value){this.attributes[name]=String(value);}
    removeAttribute(name){delete this.attributes[name];}
    getAttribute(name){return this.attributes[name]??null;}
    getBoundingClientRect(){return {left:0,right:1600,top:0,bottom:80,width:1600,height:this.id==='reader-toolbar'?80:48};}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    dispatch(type,props={}){const event={type,target:this,bubbles:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};for(let node=this;node;node=event.bubbles?node.parentElement:null){for(const fn of node.listeners[type]??[]){event.currentTarget=node;fn(event);if(event.stopped)break;}}return event;}
    closest(selectors){for(let n=this;n;n=n.parentElement)if(selectors.split(',').some(s=>s.trim().startsWith('#')?n.id===s.trim().slice(1):s.trim().startsWith('[contenteditable]')?n.contentEditable==='true':n.tagName===s.trim().toUpperCase()))return n;return null;}
    querySelectorAll(){return this.children.flatMap(child=>[child,...child.querySelectorAll()]).filter(n=>n.tagName==='BUTTON'||n.tagName==='A');}
    focus(){const previous=doc.activeElement;doc.activeElement=this;if(previous!==this){previous?.dispatch('focusout',{relatedTarget:this});this.dispatch('focusin',{relatedTarget:previous});}}
    matches(selector){return selector===':hover'?false:false;}
    scrollBy({left=0,top=0}){this.scrollLeft+=left;this.scrollTop+=top;}
  }
  const node=(id,tag)=>{const n=new Node(id,tag);nodes.set(id,n);return n;};
  const doc=new Node('document');doc.body=node('body','body');doc.append(doc.body);doc.documentElement=node('html','html');doc.activeElement=doc.body;doc.URL='https://example.test/read.html';doc.getElementById=id=>nodes.get(id);doc.createElement=tag=>new Node('',tag);doc.createDocumentFragment=()=>new Node();doc.querySelector=()=>[...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)??null;
  doc.documentElement.getBoundingClientRect=()=>({width:doc.documentElement.clientWidth});
  const shell=node('reader-shell');doc.body.append(shell);
  const toolbar=node('reader-toolbar','nav'),body=node('reading-body'),rail=node('navigation-rail','nav'),stage=node('reading-stage'),deck=node('reader'),panel=node('reference-panel','aside'),home=node('toolbar-navigation-home'),presentation=node('presentation-controls'),affordance=node('fullscreen-affordance'),mobile=node('mobile-navigation','nav'),actions=node('mobile-menu-actions');
  stage.ownerDocument=doc;
  shell.append(toolbar,body,affordance,mobile);toolbar.append(home,presentation);body.append(rail,stage,panel);stage.append(deck);mobile.append(actions);panel.hidden=true;
  presentation.append(node('fullscreen-control-group'));
  const ids=['reading-status','navigation-controls','toolbar-contents','open-references','toggle-fullscreen','reveal-controls','mobile-menu-toggle','previous','next','page-number','display-mode','fit-mode','image-quality','image-quality-control','size-slider','size-level','size-out','size-in','size-controls','zoom-show-references','close-references','reference-content','contents-dialog','zoom-dialog','reader-message'];
  for(const id of ids)node(id,id.endsWith('dialog')?'dialog':id==='page-number'?'input':/mode$/.test(id)||id==='image-quality'?'select':/controls$|content$|status$|level$/.test(id)?'div':'button');
  presentation.append(nodes.get('image-quality-control'));nodes.get('image-quality-control').append(nodes.get('image-quality'));
  home.append(nodes.get('reading-status'),nodes.get('navigation-controls'));nodes.get('navigation-controls').append(nodes.get('previous'),nodes.get('page-number'),nodes.get('next'),nodes.get('toolbar-contents'));presentation.append(...['open-references','toggle-fullscreen','display-mode','fit-mode','size-slider','size-out','size-in','size-controls','size-level'].map(id=>nodes.get(id)));affordance.append(nodes.get('reveal-controls'));panel.append(nodes.get('close-references'),nodes.get('reference-content'));shell.append(nodes.get('contents-dialog'),nodes.get('zoom-dialog'));
  const win={innerWidth:width,getComputedStyle:()=>({fontSize:'16px',overflowY:'visible',overflowX:'visible'}),scrollTo(){},scrollY:0};
  Object.assign(globalThis,{window:win,document:doc,requestAnimationFrame:()=>0,Image:class{}});
  shell.requestFullscreen=async()=>{doc.fullscreenElement=shell;doc.dispatch('fullscreenchange');};doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.dispatch('fullscreenchange');};
  let page=86;const turns=[],loads=[];const figures=[],images=[];
  const book=providedBook??{totalPages:107,pages:Array.from({length:107},(_,i)=>({number:i+1,label:String(i+1),width:1200,height:1698})),links};
  for(const item of book.pages){const figure=new Node(`page-${item.number}`),caption=new Node(),art=new Node(),image=new Node();const frame=new Node();frame.dataset.alignmentFrame='true';figure.append(frame);frame.append(art);art.append(image);deck.append(figure);figures.push(figure);images.push(image);}
  let ui;ui=createPresentationUI({book,figures,images,getPage:()=>page,getStorage:()=>null,go:next=>{page=next;turns.push(next);ui.changed({page,offset:0});},makeLink:()=>new Node('', 'a'),reflow(){},persist(){},loadPage:(number,options)=>loads.push({number,...options}),observeScroll(){}});
  return {nodes,doc,window:win,figures,images,book,shell,toolbar,stage,panel,ui,turns,loads,page:()=>page,enter:async()=>{nodes.get('toggle-fullscreen').dispatch('click');await Promise.resolve();},hidden:()=>shell.classList.contains('chrome-hidden')};
}

