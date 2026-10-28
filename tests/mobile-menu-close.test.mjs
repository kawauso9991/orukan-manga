import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './reader-fixture.mjs';

test('mobile menu close button closes native details and returns focus without changing reading state',()=>{
  const html=fs.readFileSync(new URL('../read.html',import.meta.url),'utf8');
  assert.match(html, /<button\s+id="mobile-menu-close"\s+type="button">閉じる<\/button>/);
  const f=fixture(390), menu=f.nodes.get('mobile-menu'), close=f.nodes.get('mobile-menu-close');
  menu.open=true;close.focus();close.dispatch('click');
  assert.equal(menu.open,false);
  assert.equal(f.doc.activeElement,f.nodes.get('mobile-menu-toggle'));
  assert.equal(f.page(),86);assert.equal(f.ui.mode,'vertical');assert.equal(f.ui.quality,'normal');
});

test('mobile close stays inside the hidden mobile navigation on desktop',()=>{
  const f=fixture(1280);
  assert.equal(f.nodes.get('mobile-navigation').hidden,true);
  assert.equal(f.nodes.get('mobile-navigation').contains(f.nodes.get('mobile-menu-close')),true);
  assert.equal(f.ui.mode,'spread');
});

test('mobile layout keeps focused close button in place during resize',()=>{
  const f=fixture(390), close=f.nodes.get('mobile-menu-close');
  f.nodes.get('mobile-menu').open=true;close.focus();f.ui.resize();
  assert.equal(f.doc.activeElement,close);
  assert.equal(f.nodes.get('mobile-menu-actions').lastElementChild,close);
  f.window.innerWidth=1280;f.ui.resize();
  assert.equal(f.doc.activeElement,f.nodes.get('page-number'));
});
