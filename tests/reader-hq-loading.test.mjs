import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prefersHQ} from '../assets/reader-wide.mjs';
const source=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
const start=source.indexOf('function loadPage('),end=source.indexOf('\nfunction ',start+1),method=source.slice(start,end);
test('first source obeys selected quality even at4K, highDPI or small display widths',()=>{
  for(const [quality,width,dpr] of [['normal',1470,1],['normal',710,2],['high',600,1],['high',710,2]]){
    const assigned=[],attrs={},image={dataset:{},parentElement:{classList:{add(){}}},hasAttribute:k=>k in attrs,getAttribute:k=>attrs[k]??null,set src(value){attrs.src=value;assigned.push(value);}};
    const context={images:[image],book:{pages:[{src:'normal.webp',zoom:'hq.webp'}]},window:{devicePixelRatio:dpr},presentation:{quality,desiredPageWidth:()=>width},prefersHQ,assetURL:path=>path,documentURL:'https://example.test/read.html'};
    vm.runInNewContext(method+'\nloadPage(1);',context);
    assert.deepEqual(assigned,[quality==='high'?'hq.webp':'normal.webp']);
  }
});

test('normal-high-normal updates existing images and repeated layout does not override the manual selection',()=>{
  const assigned=[],attrs={},image={dataset:{},parentElement:{classList:{add(){}}},width:1200,height:1698,hasAttribute:k=>k in attrs,getAttribute:k=>attrs[k]??null,set src(value){attrs.src=value;assigned.push(value);}};
  const presentation={quality:'normal',desiredPageWidth:()=>1500};
  const context={images:[image],book:{pages:[{src:'normal.webp',zoom:'hq.webp'}]},presentation,prefersHQ,assetURL:path=>path,documentURL:'https://example.test/read.html'};
  vm.runInNewContext(method,context);context.loadPage(1);presentation.quality='high';context.loadPage(1);presentation.quality='normal';context.loadPage(1);context.loadPage(1);
  assert.deepEqual(assigned,['normal.webp','hq.webp','normal.webp']);assert.equal(image.dataset.quality,'normal');assert.equal(image.dataset.hq,undefined);
  assert.equal(image.width,1200);assert.equal(image.height,1698);
});

test('prefetch uses the displayed normal resolution decision and keeps selected HQ',()=>{
  const start=source.indexOf('function schedulePrefetch('),end=source.indexOf('\nfunction ',start+1),calls=[];
  const context={currentPage:2,presentation:{mode:'spread',quality:'normal',desiredPageWidth:()=>2000},door:{active:false},wideNeeded:false,window:{devicePixelRatio:1},book:{totalPages:3,pages:[{src:'n1',zoom:'h1'},{src:'n2',srcWide:'w2',zoom:'h2'},{src:'n3',srcWide:'invalid',zoom:'h3'}]},visiblePages:()=>[2,3],assetURL:x=>x==='invalid'?null:x??null,documentURL:'https://example.test/',prefetch:{update:x=>calls.push(x)}};
  vm.runInNewContext(source.slice(start,end),context);context.schedulePrefetch();assert.equal(calls.at(-1).urls[1],'n2');
  context.wideNeeded=true;context.schedulePrefetch();assert.equal(calls.at(-1).urls[1],'w2');assert.equal(calls.at(-1).urls[0],'n1');assert.equal(calls.at(-1).urls[2],'n3');
  context.presentation.quality='high';context.schedulePrefetch();assert.equal(calls.at(-1).urls[1],'h2');assert.equal(calls.at(-1).decodeNext,false);
});
