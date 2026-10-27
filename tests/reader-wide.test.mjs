import test from 'node:test';
import assert from 'node:assert/strict';

const module=await import('../assets/reader-wide.mjs').catch(()=>null);
const pages=[{width:1200,height:1698},{width:1200,height:1698}];
function geometry(...args){assert.equal(typeof module?.wideReaderGeometry,'function');return module.wideReaderGeometry(...args);}

test('ultrawide height fitting centers intact comic pages in the viewport with adjacent fixed rails',()=>{
  for(const [width,height] of [[2560,1080],[3440,1440]]) {
    const g=geometry(pages,width,height,{leftWidth:220,rightWidth:234});
    assert.equal(g.comic.centerX,width/2);assert.equal(g.comic.centerY,height/2);
    assert.equal(g.left.right,g.comic.left);assert.equal(g.right.left,g.comic.right);
    assert.equal(g.left.width,220);assert.equal(g.right.width,234);assert.equal(g.fullVisible,true);
    assert.ok(g.outer.left>0&&g.outer.right>0);
    for(const [i,size] of g.sizes.entries()) {
      assert.ok(Math.abs(size.width/size.height-pages[i].width/pages[i].height)<1e-12);
      assert.equal(size.height,height-24);
    }
  }
});

test('wide layouts cap side rails at280 without stretching the art or shifting its viewport center',()=>{
  for(const [leftWidth,rightWidth] of [[400,900],[220,280],[280,220]]) {
    const g=geometry(pages,2560,1080,{leftWidth,rightWidth});
    assert.equal(g.left.width,Math.min(leftWidth,280));assert.equal(g.right.width,Math.min(rightWidth,280));
    assert.equal(g.comic.centerX,1280);assert.equal(g.fullVisible,true);
    assert.ok(g.left.left>=0&&g.right.right<=2560);
    assert.ok(Math.abs(g.artWidth-(g.sizes[0].width+g.sizes[1].width+12))<1e-9);
  }
});

test('narrower desktop and single pages remain centered and completely visible at default height fit',()=>{
  for(const pair of [pages,[pages[0]],[{width:1142,height:1698}]])for(const width of [1024,1366,1920]) {
    const g=geometry(pair,width,768,{leftWidth:220,rightWidth:234});
    assert.equal(g.comic.centerX,width/2);assert.equal(g.fullVisible,true);
    assert.ok(g.comic.top>=12-1e-8&&g.comic.bottom<=756+1e-8);
    assert.ok(g.left.left>=12-1e-8&&g.right.right<=width-12+1e-8);
  }
});

test('explicit width fit and zoom preserve page proportions and report intentional overflow',()=>{
  const g=geometry(pages,3440,1440,{fit:'width',scale:1.5});
  assert.equal(g.comic.centerX,1720);assert.equal(g.fullVisible,false);
  assert.ok(g.sizes[0].width>1200);
  assert.ok(Math.abs(g.sizes[0].width/g.sizes[0].height-1200/1698)<1e-12);
});

test('HQ threshold uses only each page CSS width, strictly above1200, without DPR multiplication',()=>{
  assert.equal(typeof module?.prefersHQ,'function');
  for(const dpr of [1,1.25,2,3]) {
    for(const width of [0,600,1199.9,1200])assert.equal(module.prefersHQ(width,dpr),false);
    for(const width of [1200.01,1500,2400])assert.equal(module.prefersHQ(width,dpr),true);
  }
  for(const width of [undefined,null,NaN,Infinity,'1500'])assert.equal(module.prefersHQ(width),false);
  const spread=geometry(pages,3440,1440);
  assert.ok(spread.artWidth>1200);
  assert.ok(spread.sizes.every(size=>!module.prefersHQ(size.width)),'spread total width is never the per-page threshold');
});
