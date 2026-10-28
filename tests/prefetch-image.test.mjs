import test from 'node:test';
import assert from 'node:assert/strict';
import {createImagePreloader} from '../assets/prefetch-image.mjs';

function fixture(width=1600,height=2264) {
  const images=[];
  const loader=createImagePreloader({makeImage:()=>{const image={naturalWidth:width,naturalHeight:height,decodeCalls:0,async decode(){this.decodeCalls++;},removeAttribute(){this.src='';}};images.push(image);return image;}});
  return {loader,images};
}

test('decodes only requested images and retains no more than two normal-sized pages',async()=>{
  const f=fixture(),done=[];
  for(const url of ['a','b','c']){f.loader.start(url,ok=>done.push(ok),{decode:true});await f.images.at(-1).onload();}
  assert.deepEqual(done,[true,true,true]);assert.equal(f.loader.isPrimed('a'),false);assert.equal(f.loader.isPrimed('b'),true);assert.equal(f.loader.isPrimed('c'),true);
  f.loader.start('d',()=>{}, {decode:false});await f.images.at(-1).onload();assert.equal(f.images.at(-1).decodeCalls,0);
});

test('oversized high quality image is fetched without decoded retention',async()=>{
  const f=fixture(2800,3962);let success=false;f.loader.start('hq',ok=>success=ok,{decode:true});await f.images[0].onload();
  assert.equal(success,true);assert.equal(f.images[0].decodeCalls,0);assert.equal(f.loader.isPrimed('hq'),false);
});

test('cancelled decode cannot retain a stale image or complete a newer task',async()=>{
  let resolve;const f=fixture();let completed=0;
  const cancel=f.loader.start('old',()=>completed++,{decode:true});const image=f.images[0];image.decode=()=>new Promise(done=>resolve=done);
  const pending=image.onload();cancel();resolve();await pending;
  assert.equal(completed,0);assert.equal(f.loader.isPrimed('old'),false);
});

test('decode failure does not prevent later foreground loading',async()=>{
  const f=fixture();let success=false;f.loader.start('broken-decode',ok=>success=ok,{decode:true});f.images[0].decode=()=>Promise.reject(Error('decode failed'));
  await f.images[0].onload();assert.equal(success,true);assert.equal(f.loader.isPrimed('broken-decode'),false);
});

test('a stalled request times out, releases its image, and reports failure once',async()=>{
  let timer,cleared=false; const image={removeAttribute(name){if(name==='src')this.src='';}};
  const loader=createImagePreloader({makeImage:()=>image,
    setTimer:(fn,delay)=>{assert.equal(delay,60000);timer=fn;return 1;},clearTimer:()=>{cleared=true;}});
  const results=[];loader.start('stalled',ok=>results.push(ok));
  const oldLoad=image.onload;assert.equal(typeof timer,'function');timer();
  assert.deepEqual(results,[false]);assert.equal(image.src,'');
  await oldLoad();assert.deepEqual(results,[false]);assert.equal(cleared,true);
});

test('the decoded byte limit evicts an older page even below the two-image limit',async()=>{
  const images=[],loader=createImagePreloader({maxBytes:20*1024*1024,makeImage:()=>{
    const image={naturalWidth:1600,naturalHeight:2264,async decode(){},removeAttribute(){}};
    images.push(image);return image;
  }});
  for(const url of ['a','b']){loader.start(url,()=>{},{decode:true});await images.at(-1).onload();}
  assert.equal(loader.isPrimed('a'),false);assert.equal(loader.isPrimed('b'),true);
});
