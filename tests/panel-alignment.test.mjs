import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pageAlignment,verifiedCover} from '../assets/alignment.mjs';
import {presentationGeometry} from '../assets/presentation.mjs';

const book=JSON.parse(fs.readFileSync(new URL('../data/book.json',import.meta.url),'utf8'));
test('every page keeps its original outer bounds with no per-page display shift',()=>{
  for(const mode of ['spread','single','vertical'])for(const desktop of [false,true])for(const page of book.pages)
    assert.equal(pageAlignment(book,page.number,mode,desktop),null);
});
test('chapter pairs and document pairs have equal full-page tops and bottoms at fitted desktop sizes',()=>{
  for(const fullscreen of [false,true])for(const [width,height] of [[600,400],[1000,900],[1600,1080]])for(const right of [2,12,16,22,36,52,60,72,92,106]) {
    const pair=book.pages.slice(right-1,right+1);
    const g=presentationGeometry(pair,width,height,{fullscreen,captionHeight:0});
    assert.equal(g.sizes[0].height,g.sizes[1].height);
    assert.ok(g.sizes[0].height<=height);
    pair.forEach((p,i)=>assert.ok(Math.abs(g.sizes[i].width/g.sizes[i].height-p.width/p.height)<1e-10));
  }
});
test('the original cover blank-edge mask retains its normal and HQ identity guard',()=>{
  assert.equal(verifiedCover(book),true);
  for(const key of ['bytes','zoomBytes']) {
    const changed=structuredClone(book);changed.pages[0][key]++;
    assert.equal(verifiedCover(changed),false);
  }
});
