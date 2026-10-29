import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chooseStart} from '../assets/state.mjs';
const source=fs.readFileSync(new URL('../assets/reader.mjs',import.meta.url),'utf8');
const method=source.slice(source.indexOf('async function start('),source.indexOf('\nstart();'));

test('saved fit controls cannot reflow navigation before presentation initialization has completed',async()=>{
  const nodes=new Map(),starts=[],alerts=[];let earlyReflows=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,style:{setProperty(){}},replaceChildren(){},setAttribute(k,v){if(v==='alert')alerts.push(id);}});return nodes.get(id);};
  const location={hash:'#p=73',href:'https://example.test/read.html#p=73'};
  const context={scheduleSpread(){},document:{documentElement:node('html'),createTextNode:x=>x},toolbar:node('reader-toolbar'),window:{scrollY:0,scrollTo(){}},history:{},location,$:node,
    documentURL:location.href,storageKey:'reading',getStorage:()=>null,presentation:undefined,savedResume:null,currentPage:1,figures:[],images:[],
    fetch:async()=>({ok:true,json:async()=>({title:'Book',version:'v8',totalPages:107})}),validateBook:x=>x,assetURL:x=>x,readProgress:()=>({page:73,offset:.2}),chooseStart,
    renderPages(){},renderContents(){},renderDownloadLinks(){},positionAtScroll(){},moveTo(){},historyWrite(){},saveReadingPosition(){},updatePosition(){},go(){},openContents(){},installEvents(){},loadPage(){},makeLink(){},
    createNavigation:()=>({reflow(){earlyReflows++;location.hash='#p=1';},start:p=>starts.push(p)}),createLayoutRestorer:()=>({}),
    // Restoring a75% fit can ask for a layout pass during construction.
    createPresentationUI:options=>{options.reflow();return{quality:'high'};},createReaderDoor:()=>({sync(){}})};
  vm.runInNewContext(method.replace('  } catch {','  } catch(error) {throw error;'),context);await context.start();
  assert.deepEqual(alerts,[]);assert.equal(earlyReflows,0);assert.equal(starts[0].page,73);
});
