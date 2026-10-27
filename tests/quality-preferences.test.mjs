import test from 'node:test';
import assert from 'node:assert/strict';
import {readPreferences,writePreferences} from '../assets/presentation.mjs';

const key='orukan-manga:display:v1';
const view={mode:'single',fit:'width',scale:1.5};
function storage(initial=null) {
  const values=new Map(initial===null?[]:[[key,initial]]);
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};
}

test('new and inaccessible display storage default to normal quality',()=>{
  const expected={mode:'spread',fit:'height',scale:1,quality:'normal'};
  assert.deepEqual(readPreferences(()=>null),expected);
  assert.deepEqual(readPreferences(()=>{throw Error('denied');}),expected);
  assert.deepEqual(readPreferences(()=>storage('{bad json')),expected);
});

test('legacy preferences retain mode, fit and scale while gaining normal quality',()=>{
  const old=storage(JSON.stringify(view));
  assert.deepEqual(readPreferences(()=>old),{...view,quality:'normal'});
  assert.equal(old.values.get(key),JSON.stringify(view),'reading does not rewrite stored state');
});

test('normal and high quality round-trip alongside existing display settings',()=>{
  for(const quality of ['normal','high']) {
    const store=storage(),value={...view,quality};
    assert.equal(writePreferences(()=>store,value),true);
    assert.deepEqual(JSON.parse(store.values.get(key)),value);
    assert.deepEqual(readPreferences(()=>store),value);
  }
});

test('legacy callers save normal and invalid or old auto writes cannot overwrite a valid choice',()=>{
  const store=storage();assert.equal(writePreferences(()=>store,view),true);
  assert.deepEqual(readPreferences(()=>store),{...view,quality:'normal'});
  const saved=store.values.get(key);
  for(const quality of ['auto','ultra','',null,1])assert.equal(writePreferences(()=>store,{...view,quality}),false);
  assert.equal(store.values.get(key),saved);
});

test('unknown and old auto stored quality falls back to normal without losing valid display settings',()=>{
  for(const quality of ['auto','unknown','',null,1])
    assert.deepEqual(readPreferences(()=>storage(JSON.stringify({...view,quality}))),{...view,quality:'normal'});
});

test('quality persistence keeps existing malformed-value and storage-error guards',()=>{
  assert.equal(writePreferences(()=>({setItem(){throw Error('denied');}}),{...view,quality:'high'}),false);
  assert.equal(writePreferences(()=>null,{...view,quality:'high'}),false);
  for(const invalid of [{...view,mode:'bad'},{...view,fit:'bad'},{...view,scale:0},{...view,scale:Infinity}])
    assert.equal(writePreferences(()=>storage(),{...invalid,quality:'high'}),false);
});
