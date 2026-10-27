// A normal-PC adapter only. Existing navigation/display nodes keep their handlers;
// restoring their original parents leaves fullscreen and mobile to their owner.
export function createDesktopControls({shell,navigationHome,progressTrack,displayControls,book,getPage,onLayout=()=>{}}={}) {
  const doc=shell?.ownerDocument??globalThis.document;
  if(!doc?.createElement||!navigationHome||!displayControls||typeof shell?.insertBefore!=='function')return {sync(){},destroy(){}};
  const make=(tag,id,className)=>{const node=doc.createElement(tag);node.id=id;if(className)node.className=className;return node;};
  const sidebar=make('aside','desktop-controls-sidebar','desktop-controls desktop-controls-sidebar');
  sidebar.setAttribute('aria-label','読書操作');
  const body=make('div','desktop-controls-body','desktop-controls-body');
  const toggle=make('button','desktop-controls-toggle','desktop-controls-toggle');toggle.type='button';toggle.hidden=true;toggle.setAttribute('aria-controls','desktop-controls-body');
  const strip=make('div','desktop-controls-strip','desktop-controls-strip');strip.hidden=true;
  const initial=make('span','desktop-controls-initial','desktop-controls-initial'),pageNumber=make('span','desktop-controls-page','desktop-controls-page');strip.append(initial,pageNumber);
  const chapterPosition=make('small','desktop-chapter-position','desktop-chapter-position');
  const nextChapter=make('a','desktop-next-chapter','desktop-next-chapter');
  const corner=make('div','desktop-controls-corner','fullscreen-affordance desktop-controls-corner');
  const operations=make('button','desktop-operations-button','desktop-operations-button');
  operations.type='button';operations.textContent='操作';operations.setAttribute('aria-controls','desktop-display-panel');operations.setAttribute('aria-expanded','false');
  const panel=make('div','desktop-display-panel','desktop-display-panel');
  panel.hidden=true;panel.tabIndex=-1;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','表示設定');
  const fullscreen=doc.getElementById('toggle-fullscreen');
  sidebar.append(toggle,strip,body);corner.append(operations);
  let active=false,destroyed=false,snapshots=[],signature='',requestedCompact=false,expanded=false;

  function compactState(value) {
    if(value!==requestedCompact){requestedCompact=value;expanded=false;}
    const compact=requestedCompact&&!expanded;
    for(const [name,on] of [['desktop-controls-responsive',requestedCompact],['desktop-controls-compact',compact]])shell.classList[on?'add':'remove'](name);
    body.hidden=compact;strip.hidden=!compact;toggle.hidden=!requestedCompact;
    toggle.textContent=compact?'>':'<';toggle.setAttribute('aria-expanded',String(!compact));toggle.setAttribute('aria-label',compact?'操作欄を開く':'操作欄を閉じる');
  }

  function closePanel(restoreFocus=false) {
    if(panel.hidden)return;
    panel.hidden=true;operations.setAttribute('aria-expanded','false');
    if(restoreFocus)operations.focus({preventScroll:true});
  }
  function updateDisplay(notify=true) {
    if(!active)return;
    const value=Number(doc.getElementById('size-slider')?.value)/100;
    const scale=Number.isFinite(value)&&value>0?value:1;
    const fit=doc.getElementById('fit-mode')?.value==='width'?'width':'height';
    const next=`${fit}:${scale}`;
    shell.style.setProperty('--desktop-scale',String(scale));shell.dataset.desktopFit=fit;
    if(next!==signature){signature=next;if(notify)onLayout();}
  }
  function updateChapter() {
    const page=Math.max(1,Number(getPage?.())||1),chapters=book?.chapters??[];
    const index=chapters.findLastIndex(chapter=>chapter.page<=page),chapter=chapters[index],next=chapters[index+1];
    const start=chapter?.page??1,end=next?next.page-1:book?.totalPages??page;
    const title=book?.title??'本';initial.textContent=Array.from(title.replace(/^[『「\s]+/,''))[0]??'本';pageNumber.textContent=String(page);strip.setAttribute('aria-label',`${title} ${page}ページ`);
    chapterPosition.textContent=`${page-start+1} / ${Math.max(1,end-start+1)}`;
    chapterPosition.setAttribute('aria-label',`章内 ${chapterPosition.textContent} ページ`);
    const status=doc.getElementById('reading-status');
    if(status&&!status.contains(chapterPosition))status.append(chapterPosition);
    nextChapter.hidden=!next;
    if(next){nextChapter.textContent=`次章：${next.title}`;nextChapter.setAttribute('href',`#p=${next.page}`);nextChapter.dataset.page=String(next.page);}
  }
  function mount() {
    if(navigationHome.parentNode!==body)body.append(navigationHome);
    if(progressTrack&&progressTrack.parentNode!==body)body.append(progressTrack);
    if(nextChapter.parentNode!==body)body.append(nextChapter);
    if(displayControls.parentNode!==panel)panel.append(displayControls);
    // The existing presentation adapter may have put this button back during
    // layoutRails. Reuse it rather than introducing a second fullscreen action.
    if(fullscreen&&fullscreen.parentNode!==corner)corner.append(fullscreen);
  }
  function enter() {
    snapshots=[navigationHome,progressTrack,displayControls,fullscreen].filter(node=>node?.parentNode).map(node=>({node,parent:node.parentNode,next:node.nextSibling,index:[...node.parentNode.childNodes].indexOf(node)}));
    active=true;signature='';shell.classList.add('desktop-controls-active');
    shell.insertBefore(sidebar,shell.firstChild);shell.append(corner,panel);mount();updateChapter();updateDisplay(false);
  }
  function leave() {
    if(!active)return;
    active=false;closePanel();chapterPosition.remove();
    // Reverse sibling order makes saved nextSibling anchors available again.
    for(const {node,parent,next} of [...snapshots].sort((a,b)=>b.index-a.index))parent.insertBefore(node,next?.parentNode===parent?next:null);
    snapshots=[];sidebar.remove();corner.remove();panel.remove();
    shell.classList.remove('desktop-controls-active');shell.style.removeProperty('--desktop-scale');delete shell.dataset.desktopFit;
    shell.classList.remove('desktop-controls-responsive');shell.classList.remove('desktop-controls-compact');requestedCompact=false;expanded=false;
  }
  function togglePanel() {
    if(!active)return;
    if(!panel.hidden){closePanel(true);return;}
    panel.hidden=false;operations.setAttribute('aria-expanded','true');
    (displayControls.querySelector('select,button,input')??panel).focus({preventScroll:true});
  }
  const outside=event=>{if(active&&!panel.hidden&&!panel.contains(event.target)&&!operations.contains(event.target))closePanel();};
  const keydown=event=>{if(active&&!panel.hidden&&event.key==='Escape'){event.preventDefault();closePanel(true);}};
  const displayChanged=()=>updateDisplay();
  const toggleCompact=()=>{if(active&&requestedCompact){expanded=!expanded;compactState(requestedCompact);onLayout();}};
  toggle.addEventListener('click',toggleCompact);
  operations.addEventListener('click',togglePanel);doc.addEventListener('pointerdown',outside);doc.addEventListener('keydown',keydown);
  displayControls.addEventListener('input',displayChanged);displayControls.addEventListener('change',displayChanged);
  return {
    sync({normal,compact=false}){if(destroyed)return;if(normal){if(!active)enter();else{mount();updateChapter();updateDisplay();}compactState(Boolean(compact));}else leave();},
    destroy(){if(destroyed)return;leave();destroyed=true;toggle.removeEventListener('click',toggleCompact);operations.removeEventListener('click',togglePanel);doc.removeEventListener('pointerdown',outside);doc.removeEventListener('keydown',keydown);displayControls.removeEventListener('input',displayChanged);displayControls.removeEventListener('change',displayChanged);}
  };
}
