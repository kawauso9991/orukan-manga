import test from 'node:test';
import assert from 'node:assert/strict';
const responsive=await import('../assets/reader-responsive.mjs').catch(()=>null);

test('normal responsive layout follows phone, portrait, and landscape thresholds without changing the input',()=>{
  assert.equal(typeof responsive?.resolveNormalReaderLayout,'function');
  for(const [width,height,mode,compact] of [[767,1000,'vertical',false],[768,1024,'single',true],[1024,768,'spread',true],[1366,768,'spread',true],[1367,768,'spread',false]]) {
    const input={width,height,page:53},before=structuredClone(input);
    assert.deepEqual(responsive.resolveNormalReaderLayout(input),{mode,compact});assert.deepEqual(input,before);
  }
  assert.deepEqual(responsive.resolveNormalReaderLayout({width:1600,height:900,manualMode:'single'}),{mode:'single',compact:false});
  assert.deepEqual(responsive.resolveNormalReaderLayout({width:800,height:1200,manualMode:'vertical'}),{mode:'vertical',compact:true});
  assert.deepEqual(responsive.resolveNormalReaderLayout({width:600,height:900,manualMode:'spread'}),{mode:'vertical',compact:false});
});
test('RTL swipe direction rejects short or vertical drags',()=>{
  assert.equal(responsive.swipeDirection({dx:70,dy:10}),1);
  assert.equal(responsive.swipeDirection({dx:-70,dy:10}),-1);
  assert.equal(responsive.swipeDirection({dx:20,dy:0}),0);
  assert.equal(responsive.swipeDirection({dx:80,dy:100}),0);
});
function fixture(){
  class Target {constructor(){this.events={};}addEventListener(t,f){(this.events[t]??=[]).push(f);}removeEventListener(t,f){this.events[t]=(this.events[t]??[]).filter(v=>v!==f);}dispatch(t,p={}){const e={target:this,pointerType:'touch',pointerId:1,isPrimary:true,clientX:0,clientY:0,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...p};for(const f of this.events[t]??[])f(e);return e;}}
  const doc=new Target(),element=new Target(),art={closest:()=>null},ui={closest:()=>({})};element.ownerDocument=doc;element.contains=t=>t===element||t===art||t===ui;
  let state={normal:true,width:1000,mode:'spread',scale:1,pannable:false,zoomed:false},clock=100,turns=[];
  const controller=responsive.createReaderSwipeController({element,getState:()=>state,onTurn:d=>turns.push(d),now:()=>clock});
  const down=(p={})=>doc.dispatch('pointerdown',{target:art,...p}),move=(p={})=>doc.dispatch('pointermove',{target:art,...p}),up=(p={})=>doc.dispatch('pointerup',{target:art,...p});
  return {doc,element,art,ui,controller,turns,down,move,up,state:p=>state={...state,...p},time:n=>clock=n};
}
test('single touch swipes turn RTL once and suppress the resulting artwork click',()=>{
  const f=fixture();f.down({clientX:100,clientY:100});f.move({clientX:180,clientY:105});f.up({clientX:180,clientY:105});
  assert.deepEqual(f.turns,[1]);assert.equal(f.element.dispatch('click',{target:f.art,detail:1}).prevented,true);
  f.time(1000);assert.equal(f.element.dispatch('click',{target:f.art,detail:1}).prevented,undefined);
  f.down({clientX:180});f.up({clientX:100});assert.deepEqual(f.turns,[1,-1]);f.controller.destroy();
  f.down({clientX:100});f.up({clientX:200});assert.deepEqual(f.turns,[1,-1]);
});
test('second finger, pinch cancellation, vertical drag, and interactive targets never turn pages',()=>{
  const f=fixture();f.down();f.down({pointerId:2,isPrimary:false,target:f.ui});f.up({clientX:100});f.up({pointerId:2});
  f.down();f.doc.dispatch('pointercancel',{pointerId:1});f.up({clientX:100});
  f.down();f.move({clientX:10,clientY:40});f.up({clientX:100,clientY:40});
  f.down({target:f.ui});f.up({clientX:100,target:f.ui});assert.deepEqual(f.turns,[]);
});
test('phone, fullscreen, vertical mode, zoom, panning, and mouse input remain untouched',()=>{
  for(const patch of [{width:767},{normal:false},{mode:'vertical'},{scale:1.25},{pannable:true},{zoomed:true}]){
    const f=fixture();f.state(patch);f.down();f.up({clientX:100});assert.deepEqual(f.turns,[]);
  }
  const f=fixture();f.down({pointerType:'mouse'});f.up({pointerType:'mouse',clientX:100});assert.deepEqual(f.turns,[]);
});
test('native pinch zoom remains protected after the second finger has been released',()=>{
  const f=fixture();f.state({width:820,nativePinchScale:2});
  f.down({clientX:100});const end=f.up({clientX:200});
  assert.deepEqual(f.turns,[]);assert.equal(end.prevented,undefined);
  f.state({nativePinchScale:1});f.down({clientX:100});f.up({clientX:200});assert.deepEqual(f.turns,[1]);
});
test('native zoom that begins during a swipe prevents the pointer-up page turn',()=>{
  const f=fixture();f.state({nativePinchScale:1});f.down({clientX:100});f.state({nativePinchScale:2});
  const end=f.up({clientX:200});assert.deepEqual(f.turns,[]);assert.equal(end.prevented,undefined);
});
