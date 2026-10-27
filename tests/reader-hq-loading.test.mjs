import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prefersHQ} from '../assets/reader-wide.mjs';
const source=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
const start=source.indexOf('function loadPage('),end=source.indexOf('\nfunction ',start+1),method=source.slice(start,end);
test('the first source assigned is HQ only when that individual page is wider than1200 CSS pixels',()=>{
  for(const width of [1199,1200,1200.1,1470]){
    const assigned=[],image={dataset:{},hasAttribute:()=>false,set src(value){assigned.push(value);}};
    const context={images:[image],book:{pages:[{src:'normal.webp',zoom:'hq.webp'}]},presentation:{desiredPageWidth:()=>width},prefersHQ,assetURL:path=>path,documentURL:'https://example.test/read.html'};
    vm.runInNewContext(method+'\nloadPage(1);',context);
    assert.deepEqual(assigned,[width>1200?'hq.webp':'normal.webp']);
  }
});
