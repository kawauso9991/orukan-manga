import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture} from './reader-fixture.mjs';
import {pageAlignment,verifiedCover} from '../assets/alignment.mjs';

const book=JSON.parse(fs.readFileSync(new URL('../data/book.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
function method(name){const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);}
test('presentation adds no per-page inset or artificial frame in any reading mode',async()=>{
  for(const width of [390,1280]) {
    const f=fixture(width,[],structuredClone(book));
    for(const frame of f.images.map(i=>i.parentElement.parentElement)) {
      assert.equal(frame.classList.contains('aligned-frame'),false);
      assert.equal(frame.style['--alignment-top'],undefined);
    }
    if(width>=1024){await f.enter();for(const figure of f.figures)assert.equal(figure.classList.contains('aligned-page'),false);}
  }
});
test('renderer keeps complete images and source hotspots together without alignment wrappers',()=>{
  const f=fixture(),figures=[],images=[],data=structuredClone(book);data.links=[];f.nodes.get('reader').replaceChildren();
  const context={document:f.doc,window:f.window,book:data,pageAlignment,verifiedCover,pageLinks:new Map(),reader:f.nodes.get('reader'),figures,images,pageLabel:page=>String(page),openZoom(){},loadPage(){}};
  vm.runInNewContext(method('element')+'\n'+method('renderPages')+'\nrenderPages();',context);
  images.forEach((image,i)=>assert.ok(image.parentElement.parentElement===figures[i]));
});
test('resume fractions still reference the full image when page and image origins coincide',()=>{
  const window={innerWidth:390,scrollY:300,scrollTo({top}){this.scrollY=top;}};
  let imageWorld=1000,height=200;
  const figures=Array.from({length:107},(_,i)=>({getBoundingClientRect:()=>({top:(i<72?0:i===72?imageWorld:2000)-window.scrollY})}));
  const images=Array.from({length:107},()=>({getBoundingClientRect:()=>({top:imageWorld-window.scrollY,height})}));
  const context={window,book,pageAlignment,figures,images,scrollWork:{cancel(){}},loadNeighborhood(){},presentation:{moveTo:()=>false,readPosition:()=>null},requestAnimationFrame:fn=>fn()};
  vm.runInNewContext(method('headerOffset')+'\n'+method('positionAtScroll')+'\n'+method('moveTo')+'\nmoveTo({page:73,offset:.37},()=>{});',context);
  assert.equal(window.scrollY,1074);
  const position=vm.runInNewContext('positionAtScroll();',context);assert.equal(position.page,73);assert.equal(position.offset,.37);
  vm.runInNewContext('moveTo({page:73,offset:0},()=>{});',context);assert.equal(window.scrollY,1000);
});
