import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {presentationGeometry} from '../assets/presentation.mjs';

const book=JSON.parse(fs.readFileSync(new URL('../data/book.json',import.meta.url),'utf8'));
const checkedAnchors=new Map([[2,112],[3,84],[12,84],[13,80],[42,68],[43,24],[52,38],[53,84],[60,84],[61,38],[73,112]]);
const module=await import('../assets/alignment.mjs').catch(()=>null);
function alignment(...args){assert.ok(module,'verified panel alignment is available');return module.pageAlignment(...args);}

test('all45 inspected comic pairs put their first frame on source baseline140 without cutting the image',()=>{
  for(let right=2;right<=90;right+=2)for(const page of [right,right+1]) {
    const a=alignment(book,page,'spread');
    if(checkedAnchors.has(page))assert.equal(a.anchorY,checkedAnchors.get(page));assert.equal(a.inset+a.anchorY,140);
    assert.equal(a.frameHeight,1838);assert.ok(a.inset>=0);assert.ok(a.inset+1698<=a.frameHeight);
  }
});
test('finalized v10 chapter artwork enables all three pairs with new anchors and rejects stale source identities',()=>{
  for(const page of [12,53,60]) {
    const item=book.pages[page-1],a=alignment(book,page,'spread'),partner=page%2?page-1:page+1;
    assert.equal(item.src,`pages/normal/p${String(page).padStart(3,'0')}-v10.webp`);
    assert.equal(a.anchorY,84);assert.equal(a.inset,56);assert.ok(alignment(book,partner,'spread'));
    for(const key of ['bytes','zoomBytes']) {
      const stale=structuredClone(book);stale.pages[page-1][key]++;
      assert.equal(alignment(stale,page,'spread'),null);assert.equal(alignment(stale,partner,'spread'),null);
    }
  }
});
test('cover image top shares the comic baseline and never uses separate vertical centering',()=>{
  const a=alignment(book,1,'spread');assert.equal(a.anchorY,0);assert.equal(a.inset,140);assert.equal(a.width,1142);
  const mobile=alignment(book,1,'vertical',false);assert.equal(mobile.width,1200);assert.equal(mobile.frameHeight,1838);
});
test('all eight mixed/document spreads keep their existing display geometry',()=>{
  for(let page=92;page<=107;page++)assert.equal(alignment(book,page,'spread'),null);
});
test('changing either inspected asset disables that entire spread rather than using stale panel guesses',()=>{
  const changed=structuredClone(book);changed.pages[72].bytes++;assert.equal(alignment(changed,72,'spread'),null);assert.equal(alignment(changed,73,'spread'),null);
  const cover=structuredClone(book);cover.pages[0].src='pages/normal/new-cover.webp';assert.equal(alignment(cover,1,'spread'),null);
});
test('HQ-only replacements disable both spread anchors and the cover mask',()=>{
  const changed=structuredClone(book);changed.pages[72].zoomBytes++;
  assert.equal(alignment(changed,72,'spread'),null);assert.equal(alignment(changed,73,'spread'),null);
  const cover=structuredClone(book);cover.pages[0].zoom='pages/hq/replaced-cover.webp';assert.equal(module.verifiedCover(cover),false);
});

test('narrow desktop cover and every spread share an absolute baseline despite a changing source rail',()=>{
  assert.equal(typeof module.alignmentBaseline,'function');assert.equal(typeof module.renderedAlignment,'function');
  for(const fullscreen of [false,true])for(const bodyWidth of [768,1024,2000]) {
    const maxWidth=fullscreen?bodyWidth-220:bodyWidth;
    const baseline=module.alignmentBaseline(maxWidth,900,{fullscreen,mode:'spread'});
    for(const stageWidth of fullscreen?[maxWidth]:[bodyWidth,bodyWidth-220])for(const pages of [[1],[2,3],[12,13],[42,43],[52,53],[60,61],[72,73]]) {
      const as=pages.map(page=>alignment(book,page,'spread'));
      const g=presentationGeometry(as.map(a=>({width:a.width,height:a.envelopeHeight})),stageWidth,900,{fullscreen,captionHeight:0});
      as.forEach((a,i)=>{
        const rendered=module.renderedAlignment(a,g.sizes[i].width,baseline);
        assert.ok(Math.abs(rendered.firstPanelY-baseline)<1e-8);assert.ok(rendered.top>=0);
        assert.ok(rendered.height<=900-(fullscreen?4:18)+1e-8,'all image pixels fit');
        assert.ok(Math.abs(rendered.height-rendered.top-1698*rendered.scale)<1e-8);
      });
    }
  }
});
test('portrait and landscape mobile preserve the full image, shared baseline and bottom-control space',()=>{
  for(const [availableWidth,availableHeight] of [[358.8,787.2],[328.8,680],[812.8,333.2],[992,540]]) {
    const scale=Math.min(availableWidth/1200,availableHeight/1838);
    for(let page=1;page<=91;page++) {
      const a=alignment(book,page,'vertical',false);if(!a)continue;const top=a.inset*scale;
      assert.ok(Math.abs(top+a.anchorY*scale-140*scale)<1e-8);
      assert.ok(top+1698*scale<=availableHeight+1e-8);assert.ok(1200*scale<=availableWidth+1e-8);
      assert.equal(a.frameHeight,1698+a.inset,'continuous reading adds no unused bottom spacer');
    }
  }
});
test('representative desktop spreads fit full envelopes with matching first-panel Y and unchanged image proportions',()=>{
  for(const [width,height,fullscreen] of [[600,700,false],[1000,900,false],[1300,800,true],[2100,1080,true]]) {
    for(const pair of [[2,3],[6,7],[12,13],[42,43],[48,49],[52,53],[60,61],[72,73]]) {
      const anchors=pair.map(page=>alignment(book,page,'spread'));
      const g=presentationGeometry(anchors.map(a=>({width:a.width,height:a.frameHeight})),width,height,{fullscreen,captionHeight:0});
      const starts=anchors.map((a,i)=>(a.inset+a.anchorY)*g.sizes[i].width/a.width);
      assert.ok(Math.abs(starts[0]-starts[1])<1e-8);assert.ok(g.artWidth<=width);
      g.sizes.forEach((size,i)=>{const a=anchors[i],scale=size.width/a.width;assert.ok(a.inset*scale+1698*scale<=size.height+1e-8);assert.ok(size.height<=height);});
    }
  }
});
