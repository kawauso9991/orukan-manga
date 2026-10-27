export function desktopReferenceName(link) {
  return link.type==='external'?new URL(link.url).hostname.replace(/^www\./,''):`${link.target}ページ`;
}

export function compactDesktopReference(anchor,link) {
  const doc=anchor.ownerDocument??document;
  const full=anchor.textContent||link.label||link.url||`${link.target}ページ`;
  anchor.setAttribute('aria-label',full);anchor.title=full;
  const label=doc.createElement('span');label.textContent=desktopReferenceName(link);
  const icon=doc.createElement('span');icon.textContent=link.type==='external'?'↗':'';icon.setAttribute('aria-hidden','true');
  anchor.replaceChildren(label,icon);return anchor;
}

// PC normal mode only. The existing fullscreen and mobile panel stay owned by
// the presentation controller; this tab changes no stage dimensions.
export function createDesktopReferences({shell,panel,getCount}) {
  if(!panel?.querySelector)return {sync(){}};
  const tab=document.createElement('button');tab.type='button';tab.className='desktop-source-tab';
  tab.textContent='出典';tab.setAttribute('aria-controls','reference-content');panel.prepend(tab);
  let normal=false,compact=false,open=false;
  function close(restore=false){open=false;sync({normal,compact});if(restore)tab.focus({preventScroll:true});}
  function sync(state){
    normal=state.normal;compact=state.compact??window.innerWidth<1280;
    if(!normal||!compact||getCount()===0)open=false;
    shell.classList.toggle('desktop-sources-open',normal&&open);
    tab.hidden=!normal||!compact;tab.disabled=getCount()===0;
    tab.setAttribute('aria-expanded',String(normal&&open));
  }
  tab.addEventListener('click',()=>{if(normal&&getCount()){open=!open;sync({normal,compact});}});
  document.addEventListener('pointerdown',event=>{if(normal&&open&&!panel.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(normal&&open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);}},true);
  return {sync};
}
