import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture} from './reader-fixture.mjs';
import {pageAlignment,verifiedCover} from '../assets/alignment.mjs';

const book=JSON.parse(fs.readFileSync(new URL('../data/book.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
function method(name){const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);}

test('actual presentation writes aligned flow geometry with a common mobile first-frame baseline',()=>{
  const f=fixture(390,[],structuredClone(book)),width=358.8;
  for(const page of [1,2,3,6,7,12,13,33,42,43,52,53,60,61,73,91]) {
    const frame=f.images[page-1].parentElement.parentElement;
    assert.equal(frame.classList.contains('aligned-frame'),true);
    const [w,h]=frame.style['--alignment-frame-ratio'].split('/').map(Number);
    const frameHeight=width*h/w,top=frameHeight*parseFloat(frame.style['--alignment-top'])/100;
    const a=pageAlignment(book,page,'vertical',false);
    assert.ok(Math.abs(top+a.anchorY*width/1200-41.86)<1e-8);
    assert.ok(Math.abs(frameHeight-top-width*1698/1200)<1e-8,'no added bottom spacer');
  }
  assert.equal(f.images[92].parentElement.parentElement.classList.contains('aligned-frame'),false);
  assert.equal(f.images[52].parentElement.parentElement.classList.contains('aligned-frame'),true);
});

test('actual renderer wraps complete artwork and keeps the document exceptions on their original structure',()=>{
  const f=fixture(),figures=[],images=[],data=structuredClone(book);data.links=[];f.nodes.get('reader').replaceChildren();
  const context={document:f.doc,window:f.window,book:data,pageAlignment,verifiedCover,pageLinks:new Map(),reader:f.nodes.get('reader'),figures,images,pageLabel:page=>`${page}ページ`,openZoom(){},loadPage(){}};
  vm.runInNewContext(method('element')+'\n'+method('renderPages')+'\nrenderPages();',context);
  assert.equal(images[1].parentElement.parentElement.dataset.alignmentFrame,'true');
  assert.equal(images[1].parentElement.parentElement.parentElement,figures[1]);
  assert.equal(images[92].parentElement.parentElement,figures[92]);
  assert.equal(images[52].parentElement.parentElement.dataset.alignmentFrame,'true','finalized chapter art uses the aligned artwork wrapper');
});

test('positive resume fractions use original image pixels and zero retains the aligned page start',()=>{
  const window={innerWidth:390,scrollY:300,scrollTo({top}){this.scrollY=top;}};
  let figureWorld=1000,imageWorld=1040,height=200;
  const figures=Array.from({length:107},(_,i)=>({getBoundingClientRect:()=>({top:(i<72?0:i===72?figureWorld:2000)-window.scrollY})}));
  const images=Array.from({length:107},()=>({getBoundingClientRect:()=>({top:imageWorld-window.scrollY,height})}));
  const context={window,book,pageAlignment,figures,images,scrollWork:{cancel(){}},loadNeighborhood(){},presentation:{moveTo:()=>false,readPosition:()=>null},requestAnimationFrame:fn=>fn()};
  vm.runInNewContext(method('headerOffset')+'\n'+method('positionAtScroll')+'\n'+method('moveTo')+'\nmoveTo({page:73,offset:.37},()=>{});',context);
  assert.equal(window.scrollY,1114);
  const position=vm.runInNewContext('positionAtScroll();',context);assert.equal(position.page,73);assert.equal(position.offset,.37);
  vm.runInNewContext('moveTo({page:73,offset:0},()=>{});',context);assert.equal(window.scrollY,1000);
  figureWorld=1200;imageWorld=1280;height=400;
  vm.runInNewContext('moveTo({page:73,offset:.37},()=>{});',context);assert.equal(window.scrollY,1428);
});
