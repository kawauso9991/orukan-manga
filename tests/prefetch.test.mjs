import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrefetcher,areCurrentImagesReady} from '../assets/prefetch.mjs';

function fixture({fetched=new Set(),primed=new Set()}={}) {
  const requests=[], pending=[]; let ready=false;
  const prefetch=createPrefetcher({
    isReady:()=>ready,isFetched:url=>fetched.has(url),isPrimed:url=>primed.has(url),
    start:(url,done,options)=>{const request={url,done,options,cancelled:false};requests.push(request);pending.push(request);return ()=>{request.cancelled=true;};},
    defer:fn=>{pending.push(fn);return ()=>{const i=pending.indexOf(fn);if(i>=0)pending.splice(i,1);};}
  });
  return {prefetch,requests,pending,ready(){ready=true;prefetch.wake();},tick(){const i=pending.findIndex(x=>typeof x==='function');if(i>=0)pending.splice(i,1)[0]();}};
}

test('a visible door cover takes priority over background requests',()=>{
  const page={complete:true,getAttribute:()=>'/p1.webp'},door={complete:false,hidden:false,getAttribute:()=>'/cover.webp'};
  assert.equal(areCurrentImagesReady({images:[page],current:[1],doorImage:door}),false);
  door.complete=true;assert.equal(areCurrentImagesReady({images:[page],current:[1],doorImage:door}),true);
  page.complete=false;assert.equal(areCurrentImagesReady({images:[page],current:[1],doorImage:door}),false);
});

test('waits for current pages, then fetches nearest pages one at a time',()=>{
  const f=fixture();f.prefetch.update({current:[4,5],urls:['1','2','3','4','5','6','7','8']});f.tick();assert.equal(f.requests.length,0);
  f.ready();f.tick();assert.deepEqual(f.requests.map(x=>x.url),['6']);
  f.requests[0].done(true);f.tick();assert.deepEqual(f.requests.map(x=>x.url),['6','3']);
  f.requests[1].done(true);f.tick();assert.deepEqual(f.requests.map(x=>x.url),['6','3','7']);
});

test('navigation cancels stale work and ignores its completion, reprioritizing the new location',()=>{
  const f=fixture();f.ready();f.prefetch.update({current:[2,3],urls:['1','2','3','4','5','6','7','8']});f.tick();const old=f.requests[0];
  f.prefetch.update({current:[6,7],urls:['1','2','3','4','5','6','7','8']});assert.equal(old.cancelled,true);old.done(true);f.tick();assert.deepEqual(f.requests.map(x=>x.url),['4','8']);
});

test('failed background loads do not stop later pages',()=>{
  const f=fixture();f.ready();f.prefetch.update({current:[2],urls:['1','2','3','4']});f.tick();f.requests[0].done(false);f.tick();assert.deepEqual(f.requests.map(x=>x.url),['3','1']);
});

test('a quality change cancels the old URL and requests the selected quality',()=>{
  const f=fixture();f.ready();f.prefetch.update({current:[2],urls:['n1','n2','n3']});f.tick();const old=f.requests[0];
  f.prefetch.update({current:[2],urls:['h1','h2','h3']});old.done(true);f.tick();assert.equal(old.cancelled,true);assert.deepEqual(f.requests.map(x=>x.url),['n3','h3']);
});

test('repeated updates do not duplicate a pending request',()=>{
  const f=fixture();f.ready();const state={current:[2],urls:['1','2','3']};f.prefetch.update(state);f.tick();f.prefetch.update(state);f.tick();assert.equal(f.requests.length,1);assert.equal(f.requests[0].cancelled,false);
});

test('only the next two pages are selected for decoding',()=>{
  const f=fixture();f.ready();f.prefetch.update({current:[4,5],urls:['1','2','3','4','5','6','7','8'],decodeNext:true});f.tick();
  assert.deepEqual([f.requests[0].url,f.requests[0].options.decode],['6',true]);f.requests[0].done(true);f.tick();
  assert.deepEqual([f.requests[1].url,f.requests[1].options.decode],['3',false]);f.requests[1].done(true);f.tick();
  assert.deepEqual([f.requests[2].url,f.requests[2].options.decode],['7',true]);f.requests[2].done(true);f.tick();
  assert.deepEqual([f.requests[3].url,f.requests[3].options.decode],['2',false]);
});

test('when moving, an already fetched next page is promoted for decoding but a primed one is skipped',()=>{
  const f=fixture({fetched:new Set(['6','7']),primed:new Set(['6'])});f.ready();
  f.prefetch.update({current:[4,5],urls:['1','2','3','4','5','6','7','8'],decodeNext:true});f.tick();
  assert.equal(f.requests[0].url,'3');f.requests[0].done(true);f.tick();assert.equal(f.requests[1].url,'7');assert.equal(f.requests[1].options.decode,true);
});

test('skips a queued page if foreground loading finishes before background starts',()=>{
  const fetched=new Set(),f=fixture({fetched});f.ready();f.prefetch.update({current:[2],urls:['1','2','3','4']});
  fetched.add('3');f.tick();assert.deepEqual(f.requests.map(x=>x.url),['1']);
});
