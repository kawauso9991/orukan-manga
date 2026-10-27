import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './reader-fixture.mjs';
import * as desktop from '../assets/desktop-reference-ui.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
const sections=f=>walk(f.nodes.get('reference-content')).filter(n=>n.tagName==='SECTION');

test('normal desktop reserves the source region even for an empty spread without empty page headings',()=>{
  const f=fixture(1366);f.ui.changed({page:86,offset:0});
  assert.equal(f.panel.hidden,false);assert.equal(f.panel.getAttribute('role'),'region');
  assert.equal(sections(f).length,0);
  assert.equal(f.nodes.get('open-references').hidden,true);
});
test('normal desktop references use short domains with full accessible names and omit the empty partner page',()=>{
  const link={page:86,type:'external',label:'A full source description',url:'https://www.example.org/report?q=1',rect:[.1,.1,.1,.1]};
  const f=fixture(1920,[link]);f.ui.changed({page:86,offset:0});
  const groups=sections(f);
  assert.equal(groups.length,1);
  assert.ok(walk(groups[0]).some(n=>n.textContent==='example.org'));
  assert.ok(walk(groups[0]).some(n=>n.getAttribute('aria-label')===link.label));
  assert.equal(typeof desktop.desktopReferenceName,'function');
});
test('fullscreen and mobile retain the original reference headings and empty-page descriptions',async()=>{
  const f=fixture(1366);f.ui.changed({page:86,offset:0});await f.enter();
  assert.equal(f.shell.classList.contains('desktop-windowed'),false);
  assert.equal(sections(f).length,2);
  f.window.innerWidth=390;f.ui.resize();f.ui.changed({page:86,offset:0});
  assert.equal(sections(f).length,1);
});
test('normal source focus transfers to a visible mobile control when its automatic pane disappears',()=>{
  const f=fixture(1366,[{page:86,type:'external',url:'https://example.org/report',rect:[.1,.1,.1,.1]}]);
  f.ui.changed({page:86,offset:0});f.nodes.get('reference-content').querySelectorAll()[0].focus();
  f.window.innerWidth=390;f.ui.resize();
  assert.equal(f.panel.hidden,true);assert.equal(f.doc.activeElement.id,'mobile-menu-toggle');
});
test('compact source tab opens as a separate drawer, closes outside or Escape and stays plain at zero',()=>{
  const f=fixture(1279);let count=3;
  f.panel.querySelector=()=>null;f.panel.prepend=node=>{f.panel.append(node);f.panel.children.unshift(f.panel.children.pop());};
  const ui=desktop.createDesktopReferences({shell:f.shell,panel:f.panel,getCount:()=>count});
  ui.sync({normal:true});const tab=f.panel.children[0];
  assert.equal(tab.textContent,'出典');assert.equal(tab.hidden,false);
  tab.dispatch('click');assert.equal(f.shell.classList.contains('desktop-sources-open'),true);
  f.stage.dispatch('pointerdown');assert.equal(f.shell.classList.contains('desktop-sources-open'),false);
  tab.dispatch('click');tab.dispatch('keydown',{key:'Escape'});assert.equal(f.shell.classList.contains('desktop-sources-open'),false);
  count=0;ui.sync({normal:true});assert.equal(tab.disabled,true);assert.equal(tab.textContent,'出典');
  f.window.innerWidth=1280;ui.sync({normal:true});assert.equal(tab.hidden,true);
  ui.sync({normal:false});assert.equal(f.shell.classList.contains('desktop-sources-open'),false);
});
