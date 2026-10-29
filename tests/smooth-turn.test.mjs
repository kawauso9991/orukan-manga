import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './reader-fixture.mjs';
import {createPrefetcher} from '../assets/prefetch.mjs';
import {createImagePreloader} from '../assets/prefetch-image.mjs';

test('changing the actual quality selector rebuilds speculation without a page turn',()=>{
 let f;const timers=[],started=[];
 const p=createPrefetcher({isReady:()=>true,defer:fn=>{timers.push(fn);return()=>{};},start:url=>{started.push(url);return()=>{};}});
 f=fixture(1600,[],null,{onQualityChange:()=>p.update({current:[86,87],urls:Array.from({length:107},(_,i)=>`${f.ui.quality}-${i+1}`)})});
 f.nodes.get('image-quality').value='high';f.nodes.get('image-quality').dispatch('change');
 timers.shift()?.();assert.deepEqual(started,['high-88']);assert.deepEqual(f.turns,[]);
});

test('forward two spreads precede a small backward preparation band',()=>{
 const timers=[],started=[],done=[];
 const p=createPrefetcher({isReady:()=>true,defer:fn=>{timers.push(fn);return()=>{};},start:(url,cb,options)=>{started.push({page:Number(url),decode:options.decode});done.push(cb);return()=>{};}});
 p.update({current:[50,51],urls:Array.from({length:107},(_,i)=>String(i+1)),decodeNext:true,decodeAhead:4,decodeBehind:2,aheadFirst:4});
 for(let i=0;i<7;i++){timers.shift()();done.shift()(true);}
 assert.deepEqual(started.map(x=>x.page),[52,53,54,55,49,48,56]);
 assert.deepEqual(started.map(x=>x.decode),[true,true,true,true,true,true,false]);
});

test('normal preparation retains the chosen forward/back band and discards an obsolete band',async()=>{
 const made=[];const loader=createImagePreloader({maxImages:6,maxBytes:96*1024*1024,
  makeImage:()=>{const image={naturalWidth:1600,naturalHeight:2264,decode:async()=>{},removeAttribute(){}};made.push(image);return image;},
  setTimer:()=>1,clearTimer(){}});
 for(let i=0;i<6;i++){loader.start(String(i),()=>{},{decode:true});await made.at(-1).onload();}
 assert.equal(loader.isPrimed('0'),true);assert.equal(loader.isPrimed('5'),true);
 assert.equal(typeof loader.setRetention,'function');loader.setRetention(['4','5','6','7']);
 assert.equal(loader.isPrimed('0'),false);assert.equal(loader.isPrimed('4'),true);
});

test('already fetched next-spread decode promotion does not incur the network pacing delay',()=>{
 const timers=[],callbacks=[];
 const p=createPrefetcher({isReady:()=>true,isFetched:()=>true,isPrimed:()=>false,
  defer:(fn,delay)=>{timers.push({fn,delay});return()=>{};},start:(url,done)=>{callbacks.push(done);return()=>{};}});
 p.update({current:[2,3],urls:['1','2','3','4','5'],decodeNext:true,decodeAhead:4,aheadFirst:4});
 assert.equal(timers[0].delay,0);
});

const module=await import('../assets/spread-transition.mjs').catch(()=>({}));
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function harness(){
 assert.equal(typeof module.createPageCommitter,'function','atomic spread committer is required');
 const waits=new Map(),frames=[],commits=[];
 const controller=module.createPageCommitter({waitForImage:image=>new Promise(resolve=>waits.set(image,resolve)),
  requestFrame:fn=>{frames.push(fn);return frames.length;},cancelFrame(){},commit:images=>commits.push(images.map(i=>i.src))});
 const image=src=>({src,getAttribute:()=>src});
 return {controller,waits,frames,commits,image};
}
test('one ready side cannot reveal half a new spread',async()=>{
 const h=harness(),left=h.image('2'),right=h.image('3');h.controller.update([left,right]);
 h.waits.get(left)();await flush();assert.equal(h.frames.length,0);assert.deepEqual(h.commits,[]);
 h.waits.get(right)();await flush();assert.equal(h.frames.length,1);h.frames.shift()();assert.deepEqual(h.commits,[['2','3']]);
});
test('rapid forward and reverse completion commits only the last input',async()=>{
 const h=harness(),a=h.image('4'),b=h.image('5'),c=h.image('2'),d=h.image('3');
 h.controller.update([a,b]);h.controller.update([c,d]);h.waits.get(a)();h.waits.get(b)();await flush();assert.equal(h.frames.length,0);
 h.waits.get(c)();h.waits.get(d)();await flush();h.frames.shift()();assert.deepEqual(h.commits,[['2','3']]);
});

test('rapid inputs cannot enqueue unbounded simultaneous foreground decodes',async()=>{
 const h=harness(),a=h.image('4'),b=h.image('5'),c=h.image('6'),d=h.image('7');
 h.controller.update([a,b]);h.controller.update([c,d]);assert.equal(h.waits.size,2);
 h.waits.get(a)();h.waits.get(b)();await flush();assert.equal(h.waits.size,4);
});
test('a changed image source cannot commit a stale decode completion',async()=>{
 const h=harness(),a={src:'normal',getAttribute(){return this.src;}};h.controller.update([a]);a.src='high';h.waits.get(a)();await flush();
 h.frames.shift()?.();assert.deepEqual(h.commits,[]);
});
test('cancelled prepared frame cannot clear a later pending spread',async()=>{
 const h=harness(),a=h.image('4');h.controller.update([a]);h.waits.get(a)();await flush();h.controller.cancel();h.frames.shift()();assert.deepEqual(h.commits,[]);
});

test('an input superseded before its decode task starts does not spend CPU decoding the old page',async()=>{
 const image=new EventTarget();Object.assign(image,{complete:true,naturalWidth:1200,decodeCalls:0,decode(){this.decodeCalls++;return Promise.resolve();}});
 const abort=new AbortController(),pending=module.waitForPageImage(image,abort.signal);abort.abort();await pending;await flush();assert.equal(image.decodeCalls,0);
});

test('a started native decode keeps its bounded slot until it actually finishes after cancellation',async()=>{
 let finishDecode,settled=false;const image=new EventTarget();Object.assign(image,{complete:true,naturalWidth:1200,decode:()=>new Promise(resolve=>finishDecode=resolve)});
 const abort=new AbortController(),pending=module.waitForPageImage(image,abort.signal).then(()=>settled=true);await flush();abort.abort();await flush();assert.equal(settled,false);finishDecode();await pending;assert.equal(settled,true);
});

test('image load errors release the readiness wait and leave ordinary error rendering available',async()=>{
 const image=new EventTarget();Object.assign(image,{complete:false,naturalWidth:0});
 const pending=module.waitForPageImage(image,new AbortController().signal);image.dispatchEvent(new Event('error'));await pending;
});

test('holding a spread does not change the scrollport or trigger scrollbar resize feedback',()=>{
 globalThis.cancelAnimationFrame=()=>{};
 const host={children:[],append(node){this.children.push(node);},getBoundingClientRect:()=>({left:0,top:0})};
 const context={scale(){},fillRect(){},save(){},beginPath(){},rect(){},clip(){},drawImage(){},restore(){}};
 const canvas={style:{},dataset:{},setAttribute(){},getContext:()=>context};
 const rect={left:10,top:10,width:100,height:140,right:110,bottom:150};
 const stage={parentElement:host,children:[],clientWidth:200,clientHeight:150,scrollLeft:0,scrollTop:0,
  addEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:200,height:150,right:200,bottom:150}),ownerDocument:{createElement:()=>canvas},append(node){this.children.push(node);}};
 const figure={hidden:false,dataset:{page:'2'},querySelector:()=>null};
 const image={complete:true,naturalWidth:100,naturalHeight:140,getBoundingClientRect:()=>rect,parentElement:{getBoundingClientRect:()=>rect}};
 window.getComputedStyle=()=>({backgroundColor:'#0d1014'});
 module.createSpreadTransition({stage,deck:{style:{}},figures:[figure],images:[image]}).capture();
 assert.equal(host.children.length,1);assert.equal(stage.children.length,0);
});
