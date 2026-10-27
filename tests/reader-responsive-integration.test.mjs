import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './reader-fixture.mjs';

test('normal reader follows the requested screen shapes without changing the logical page',()=>{
  const f=fixture(1920);
  for(const [width,height,mode,compact] of [[390,844,'vertical',false],[820,1180,'single',true],[1080,1920,'single',true],[1180,820,'spread',true],[1366,768,'spread',true],[1920,1080,'spread',false],[2560,1080,'spread',false],[3440,1440,'spread',false],[3840,2160,'spread',false]]){
    f.window.innerWidth=width;f.window.innerHeight=height;f.doc.documentElement.clientWidth=width;f.ui.resize();
    assert.equal(f.ui.mode,mode);assert.equal(f.shell.classList.contains('desktop-responsive-compact'),compact);assert.equal(f.page(),86);
  }
});
test('an explicit operation-mode choice wins over later orientation changes',()=>{
  const f=fixture(820);f.window.innerHeight=1180;f.ui.resize();assert.equal(f.ui.mode,'single');
  f.nodes.get('display-mode').value='spread';f.nodes.get('display-mode').dispatch('change');assert.equal(f.ui.mode,'spread');
  f.window.innerWidth=1080;f.window.innerHeight=1920;f.ui.resize();assert.equal(f.ui.mode,'spread');assert.equal(f.page(),86);
  f.window.innerWidth=390;f.window.innerHeight=844;f.ui.resize();assert.equal(f.ui.mode,'vertical');
});
test('normal HQ prediction uses each page width and returns no normal override inside fullscreen',async()=>{
  const f=fixture(3840);f.window.innerHeight=2160;f.doc.documentElement.clientWidth=3840;f.ui.resize();assert.ok(f.ui.desiredPageWidth(86)>1200);
  f.window.innerWidth=1920;f.window.innerHeight=1080;f.doc.documentElement.clientWidth=1920;f.ui.resize();assert.ok(f.ui.desiredPageWidth(86)<1200);
  await f.enter();assert.equal(f.ui.desiredPageWidth(86),0);
});

test('resizing an already loaded normal page beyond 1200 CSS pixels requests HQ',()=>{
  const f=fixture(1920);f.window.innerHeight=1080;f.doc.documentElement.clientWidth=1920;f.ui.resize();
  assert.equal(f.images[85].dataset.hq,undefined);
  f.window.innerWidth=3840;f.window.innerHeight=2160;f.doc.documentElement.clientWidth=3840;f.ui.resize();
  assert.ok(f.ui.desiredPageWidth(86)>1200);
  assert.equal(f.images[85].dataset.hq,'loading');
  assert.equal(f.images[86].dataset.hq,'loading');
});

test('wide background uses fractional content width rather than rounded clientWidth',()=>{
  const f=fixture(1920);f.window.innerHeight=1080;f.doc.documentElement.clientWidth=1905;
  f.doc.documentElement.getBoundingClientRect=()=>({width:1904.8});f.ui.resize();
  assert.equal(f.shell.style['--desktop-viewport-width'],'1904.8px');
});
test('the actual presentation passes visualViewport scale into its touch-swipe controller',()=>{
  const f=fixture(820);f.window.innerHeight=1180;f.window.visualViewport={scale:2};f.ui.resize();
  const art=f.images[85],touch={target:art,pointerType:'touch',pointerId:1,isPrimary:true,clientY:100};
  f.doc.dispatch('pointerdown',{...touch,clientX:100});f.doc.dispatch('pointerup',{...touch,clientX:200});
  assert.deepEqual(f.turns,[]);assert.equal(f.page(),86);
  f.window.visualViewport.scale=1;
  f.doc.dispatch('pointerdown',{...touch,clientX:100});f.doc.dispatch('pointerup',{...touch,clientX:200});
  assert.deepEqual(f.turns,[87]);
});
