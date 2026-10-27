import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as presentation from '../assets/presentation.mjs';
import {assetURL,externalURL,parsePageHash} from '../assets/state.mjs';
import {validateReadings} from '../assets/references.mjs';

const documentURL='https://kawauso9991.github.io/orukan-manga/read.html';
const release={url:'https://github.com/kawauso9991/orukan-manga/releases/download/v12/orukan-v12.pdf',filename:'orukan-v12.pdf',bytes:112326235,sha256:'29ad2877759713648cfc7d53dcd4ec37fff4ebbcfa3bc1f0c6d823a20f69a549',pages:107};
const resolve=record=>{assert.equal(typeof presentation.lightDownloadURL,'function');return presentation.lightDownloadURL(record,documentURL);};

test('legacy same-origin light PDF paths remain supported',()=>{
  assert.equal(resolve({url:'downloads/orukan-v11.1.pdf'}),'https://kawauso9991.github.io/orukan-manga/downloads/orukan-v11.1.pdf');
});

test('a canonical repository Release PDF requires matching version, filename and complete metadata',()=>{
  assert.equal(resolve(release),release.url);
  const point={...release,url:release.url.replaceAll('v12','v12.1'),filename:'orukan-v12.1.pdf'};
  assert.equal(resolve(point),point.url);
  for(const change of [{filename:'orukan-v11.pdf'},{bytes:0},{bytes:1.5},{bytes:Number.MAX_SAFE_INTEGER+1},{sha256:'bad'},{pages:106},{sha256:undefined},{pages:undefined}])assert.equal(resolve({...release,...change}),null);
});

test('remote light PDF checks reject foreign destinations and noncanonical URL forms',()=>{
  for(const url of [release.url.replace('github.com','github.com.evil.test'),release.url.replace('github.com','evil.test'),release.url.replace('kawauso9991','someone'),release.url.replace('orukan-manga/releases','other-repo/releases'),release.url.replace('https:','http:'),release.url.replace('https:','javascript:'),release.url.replace('github.com','user:password@github.com'),release.url+'?download=1',release.url+'#fragment',release.url+' ',release.url.replace('https://','https:\\\\'),release.url.replace('/v12/','/v11/'),release.url.replace('/v12/','/v012/'),release.url.replace('/v12/','/v12/../v12/'),release.url.replace('orukan-v12.pdf','orukan-v12-high-quality.pdf')])assert.equal(resolve({...release,url}),null,url);
});

test('the real book validator accepts Release light PDFs without widening image asset URLs',()=>{
  const source=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
  const start=source.indexOf('function validateBook('),end=source.indexOf('\nfunction ',start+1);
  const context={assetURL,externalURL,parsePageHash,validateReadings,lightDownloadURL:presentation.lightDownloadURL,documentURL};
  vm.runInNewContext(source.slice(start,end)+'\nthis.check=validateBook;',context);
  const book=JSON.parse(fs.readFileSync(new URL('../data/book.json',import.meta.url),'utf8'));book.download=release;
  assert.equal(context.check(book),book);
  const foreign=structuredClone(book);foreign.pages[0].src=release.url;
  assert.throws(()=>context.check(foreign),/Invalid page/);
  assert.equal(assetURL(release.url,documentURL),null);
  assert.equal(assetURL('../outside.webp',documentURL),null);
});

test('rendering keeps exact HQ and light Release URLs, including light fallback when HQ is invalid',()=>{
  const high={...release,url:release.url.replace('.pdf','-high-quality.pdf'),filename:'orukan-v12-high-quality.pdf'};
  const nodes=()=>({primary:{replaceChildren(){}},secondary:{},size:{}});
  let n=nodes();presentation.renderDownloadLinks({download:release,highQualityDownload:high},n,documentURL);
  assert.equal(n.primary.href,high.url);assert.equal(n.secondary.href,release.url);assert.equal(n.secondary.hidden,false);
  for(const invalid of [undefined,{...high,url:'https://evil.test/file.pdf'}]){
    n=nodes();presentation.renderDownloadLinks({download:release,highQualityDownload:invalid},n,documentURL);
    assert.equal(n.primary.href,release.url);assert.equal(n.primary.download,release.filename);assert.equal(n.secondary.hidden,true);
  }
});
