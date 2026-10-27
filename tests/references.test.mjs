import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceSections, referenceCount, validateReadings, referenceName } from '../assets/references.mjs';
import { createNavigation } from '../assets/navigation.mjs';
import { fixture } from './reader-fixture.mjs';

test('reading-only and mixed spread references stay separate and discoverable',()=>{
 const readings=[{page:7,type:'external',reading:true,label:'参考・小話',description:'日本語の紹介',url:'https://example.org/reading'}];
 const links=[{page:6,type:'internal',target:96,marker:'S1',label:'S1の出典：96ページへ',rect:[.1,.8,.1,.02]}];
 const groups=referenceSections([6,7],links,readings);
 assert.equal(referenceCount(groups),2);
 assert.equal(groups[0].links.length,1);assert.equal(groups[0].readings.length,0);
 assert.equal(groups[1].links.length,0);assert.equal(groups[1].readings.length,1);
 assert.equal(readings[0].rect,undefined);
 assert.equal(referenceCount(referenceSections([8],links,readings)),0);
 assert.deepEqual(referenceSections([7],links)[0].readings,[]);
});

test('reading records require safe external URLs and never masquerade as source hotspots',()=>{
 assert.deepEqual(validateReadings(undefined,107),[]);
 const r={page:58,type:'external',reading:true,label:'参考',description:'説明',url:'https://www.imaj.or.jp/study/'};
 assert.equal(validateReadings([r],107)[0],r);
 for(const patch of [{url:'javascript:alert(1)'},{url:'https://user:secret@example.org/'},{page:108},{rect:[0,0,1,1]},{description:''}])
  assert.throws(()=>validateReadings([{...r,...patch}],107));
 assert.equal(referenceName(r,()=>''),'参考');
 assert.equal(referenceName({type:'internal',target:96,marker:'S1',label:'S1の出典：96ページへ'},()=>''),'S1の出典：96ページへ');
 assert.equal(referenceName({type:'internal',target:76},n=>`${n}ページ`),'76ページへ');
});

test('source-entry offsets are preserved in navigation history, back and resume',()=>{
 const pushed=[],saved=[];let moved,position={page:66,offset:.02};
 const nav=createNavigation({totalPages:107,readPosition:()=>position,moveTo:(p,settled)=>{moved=p;position=p;settled();},push:p=>pushed.push(p),replace:()=>{},save:p=>saved.push(p),onChange:()=>{}});
 nav.start(position);nav.go(104,.61);
 assert.deepEqual(moved,{page:104,offset:.61});assert.deepEqual(pushed.at(-1),moved);assert.deepEqual(saved.at(-1),moved);
 nav.restore('#p=104',{page:104,offset:.61});assert.deepEqual(moved,{page:104,offset:.61});
 nav.go(105);assert.deepEqual(moved,{page:105,offset:0});
 nav.go(104,Infinity);assert.equal(moved.offset,0);
 nav.go(104,-1);assert.equal(moved.offset,0);
});

test('the actual presentation exposes a reading-only page and separates mixed references',()=>{
 const pages=Array.from({length:107},(_,i)=>({number:i+1,label:String(i+1),width:1200,height:1698}));
 const reading={page:86,type:'external',reading:true,label:'参考',description:'説明',url:'https://example.org/reading'};
 const f=fixture(390,[],{totalPages:107,pages,links:[],readings:[reading]});
 f.ui.changed({page:86,offset:0});
 assert.equal(f.nodes.get('open-references').hidden,false);
 assert.equal(f.nodes.get('open-references').disabled,false);
 const walk=n=>[n,...n.children.flatMap(walk)];
 assert.ok(walk(f.nodes.get('reference-content')).some(n=>n.textContent==='理解を助ける参考・小話'));
});
