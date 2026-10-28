import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPrefetcher} from '../assets/prefetch.mjs';

function harness() {
  let ready = false;
  const timers = [], requests = [], fetched = new Set(), delays = [];
  const prefetch = createPrefetcher({
    isReady: () => ready,
    isFetched: url => fetched.has(url),
    defer: (fn,delay) => { delays.push(delay);timers.push(fn); return () => { const i=timers.indexOf(fn); if(i>=0)timers.splice(i,1); }; },
    start: (url, done, options) => {
      const request={url,done,options,cancelled:false};
      requests.push(request);
      return () => {request.cancelled=true;};
    }
  });
  return {prefetch,requests,fetched,delays, setReady(value){ready=value; if(value)prefetch.wake();},
    tick(){const task=timers.shift(); if(task)task();}, pending(){return timers.length;}};
}

test('after nearby pages the single request queue reaches every remaining page without distant decodes',()=>{
  const h=harness(), urls=Array.from({length:107},(_,i)=>`normal-${i+1}`);
  h.setReady(true); h.prefetch.update({current:[53,54],urls,decodeNext:true});
  for(let i=0;i<105;i++) {
    h.tick();
    assert.equal(h.requests.length,i+1);
    h.requests[i].done(true);
  }
  assert.equal(h.pending(),0);
  assert.deepEqual(h.requests.slice(0,4).map(r=>r.url),['normal-55','normal-52','normal-56','normal-51']);
  assert.equal(new Set(h.requests.map(r=>r.url)).size,105);
  assert.ok(h.requests.some(r=>r.url==='normal-1'));
  assert.ok(h.requests.some(r=>r.url==='normal-107'));
  assert.deepEqual(h.requests.filter(r=>r.options.decode).map(r=>r.url),['normal-55','normal-56']);
});

test('a new visible spread cancels old work and blocks background until its images are ready',()=>{
  const h=harness(),urls=Array.from({length:20},(_,i)=>`p${i+1}`);
  h.setReady(true); h.prefetch.update({current:[2,3],urls}); h.tick();
  const previous=h.requests[0];
  h.setReady(false);h.prefetch.update({current:[10,11],urls});
  assert.equal(previous.cancelled,true);previous.done(true);h.tick();
  assert.equal(h.requests.length,1);
  h.setReady(true);h.tick();assert.equal(h.requests[1].url,'p12');
});

test('completed and newly visible URLs are skipped when reprioritizing',()=>{
  const h=harness(),urls=['one','two','three','four','five','six','seven'];
  h.setReady(true);h.prefetch.update({current:[2,3],urls});h.tick();
  h.requests[0].done(true);h.tick();assert.equal(h.requests[1].url,'one');
  h.prefetch.update({current:[5,6],urls});h.fetched.add('seven');h.tick();
  assert.equal(h.requests[1].cancelled,true);
  assert.equal(h.requests[2].url,'three');
  h.requests[2].done(true);h.tick();
  assert.notEqual(h.requests[3].url,'four');
});

test('quality switch cancels current speculation and traverses only selected quality',()=>{
  const h=harness(),normal=Array.from({length:9},(_,i)=>`normal-${i+1}`),hq=normal.map((_,i)=>`hq-${i+1}`);
  h.setReady(true);h.prefetch.update({current:[4,5],urls:normal,decodeNext:true});h.tick();
  const prior=h.requests[0];h.prefetch.update({current:[4,5],urls:hq,decodeNext:false});
  assert.equal(prior.cancelled,true);prior.done(true);
  for(let i=0;i<7;i++){h.tick();h.requests.at(-1).done(true);}
  assert.equal(h.requests.length,8);
  assert.ok(h.requests.slice(1).every(r=>r.url.startsWith('hq-')&&!r.options.decode));
});

test('a transient failure is retried after other pages without waiting for navigation',()=>{
  const h=harness();h.setReady(true);h.prefetch.update({current:[1],urls:['1','2','3','4']});
  h.tick();assert.equal(h.requests[0].url,'2');h.requests[0].done(false);
  h.tick();assert.equal(h.requests[1].url,'3');h.requests[1].done(true);
  h.tick();assert.equal(h.requests[2].url,'4');h.requests[2].done(true);
  h.tick();assert.equal(h.requests[3]?.url,'2');h.requests[3].done(true);
  h.tick();assert.equal(h.requests.length,4);
});

test('a permanently failing page is attempted at most three times in one generation',()=>{
  const h=harness();h.setReady(true);h.prefetch.update({current:[1],urls:['1','2']});
  for(let i=0;i<3;i++){h.tick();assert.equal(h.requests.length,i+1);h.requests[i].done(false);}
  h.tick();assert.equal(h.requests.length,3);assert.equal(h.pending(),0);
  assert.deepEqual(h.delays,[300,2000,4000]);
});

test('readiness restriction prevents speculative work even after a timer was scheduled',()=>{
  const h=harness();h.setReady(true);h.prefetch.update({current:[1],urls:['1','2','3']});
  h.setReady(false);h.tick();assert.equal(h.requests.length,0);
  h.setReady(true);h.tick();assert.equal(h.requests[0].url,'2');
});

test('reader allows background tabs while still respecting data saver and visible image readiness',()=>{
  const source=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const prefetch=createPrefetcher(');
  const end=source.indexOf('\n});',start)+4;
  assert.ok(start>=0&&end>start);
  let options,imagesReady=true;
  const ctx={createPrefetcher:o=>(options=o,{}),book:{totalPages:2},presentation:{mode:'spread'},
    document:{hidden:false},navigator:{connection:{saveData:false}},currentPage:1,door:null,images:[],
    visiblePages:()=>[1,2],areCurrentImagesReady:()=>imagesReady,
    imagePreloader:{start(){},isPrimed(){}},setTimeout,clearTimeout};
  vm.runInNewContext(source.slice(start,end),ctx);
  assert.equal(options.isReady(),true);
  ctx.navigator.connection.saveData=true;assert.equal(options.isReady(),false);
  ctx.navigator.connection.saveData=false;ctx.document.hidden=true;assert.equal(options.isReady(),true);
  ctx.document.hidden=false;imagesReady=false;assert.equal(options.isReady(),false);
});
