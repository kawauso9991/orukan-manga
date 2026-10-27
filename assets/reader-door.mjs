// P1 presentation only. This adapter never saves progress or changes core DOM parents.
export function createReaderDoor({shell,book,getPage,getResume,getFullscreen,coverURL,portraitCoverURL,getTouch,onNavigate=()=>{},onContents=()=>{},now=()=>performance.now()}={}) {
  const doc=shell?.ownerDocument??globalThis.document,view=doc?.defaultView??globalThis.window;
  if(!shell||!doc?.createElement)return {sync(){},destroy(){},get active(){return false;},get hasCover(){return false;}};
  const make=(tag,id,className)=>{const node=doc.createElement(tag);node.id=id;if(className)node.className=className;return node;};
  const door=make('section','reader-door','reader-door');door.hidden=true;door.setAttribute('aria-label','作品の扉');
  const heading=make('h1','reader-door-title','sr-only');heading.textContent=book?.title??'';
  const cover=make('button','reader-door-cover','reader-door-cover');cover.type='button';cover.setAttribute('aria-label','表紙から読み始める');
  const image=make('img','reader-door-image','reader-door-image');image.alt=book?.title??'表紙';image.decoding='async';image.draggable=false;cover.append(image);
  const actions=make('div','reader-door-actions','reader-door-actions');
  const description=make('p','reader-door-resume','reader-door-resume');
  const primary=make('button','reader-door-primary','reader-door-primary');primary.type='button';
  const start=make('button','reader-door-start','reader-door-start');start.type='button';start.textContent='最初から読む';
  const links=make('div','reader-door-links','reader-door-links');
  const contents=make('button','reader-door-contents','reader-door-link');contents.type='button';contents.textContent='目次から選ぶ';
  const pdf=make('a','reader-door-pdf','reader-door-link'),download=book?.download;
  if(download?.url&&Number.isFinite(download.bytes)&&download.bytes>0){pdf.setAttribute('href',download.url);pdf.setAttribute('download',download.filename??'');pdf.textContent=`PDF（約${(download.bytes/1e6).toFixed(1)}MB）`;}else pdf.hidden=true;
  links.append(contents,pdf);actions.append(description,primary,start,links);door.append(heading,cover,actions);shell.append(door);
  let active=false,destroyed=false,resume=null,hasOverride=false,override,selectedURL=null,candidate=null,suppressUntil=0;
  const touches=new Set();
  const control=target=>(target?.closest?target:target?.parentElement)?.closest?.('a,button,input,select,textarea,summary,[contenteditable],dialog,#desktop-display-panel,#reference-panel,.desktop-controls-corner,.fullscreen-affordance');
  const blocked=()=>Number(view?.visualViewport?.scale??1)>1||Boolean(doc.querySelector?.('dialog[open],#desktop-display-panel:not([hidden])'));
  function savedPosition() {
    let value;try{value=hasOverride?override:getResume?.();}catch{return null;}
    const page=typeof value==='number'?value:value?.page;
    if(!Number.isInteger(page)||page<2||page>(book?.totalPages??107))return null;
    const offset=Number(value?.offset);return {page,offset:Number.isFinite(offset)&&offset>=0&&offset<=1?offset:0};
  }
  function layout() {
    const width=view?.innerWidth??1440,height=view?.innerHeight??900;
    const touch=getTouch?Boolean(getTouch()):Boolean(view?.matchMedia?.('(pointer:coarse)').matches);
    return width<600?'phone':touch?(height>width?'touch-portrait':'touch-landscape'):'desktop';
  }
  function sync(options={}) {
    if(destroyed)return;
    if(Object.hasOwn(options,'resume')){hasOverride=true;override=options.resume;}
    active=Number(getPage?.())===1&&!Boolean(getFullscreen?getFullscreen():doc.fullscreenElement);
    door.hidden=!active;shell.classList[active?'add':'remove']('door-open');
    if(!active){delete shell.dataset.doorLayout;candidate=null;touches.clear();return;}
    const kind=layout();door.dataset.layout=kind;shell.dataset.doorLayout=kind;
    selectedURL=['phone','touch-portrait'].includes(kind)?portraitCoverURL:coverURL;
    selectedURL=typeof selectedURL==='string'&&selectedURL.trim()?selectedURL:null;
    cover.hidden=!selectedURL;image.hidden=!selectedURL;
    if(selectedURL){if(image.getAttribute('src')!==selectedURL)image.setAttribute('src',selectedURL);}else image.removeAttribute('src');
    resume=savedPosition();description.hidden=true;description.textContent='';start.hidden=!resume;
    const chapter=resume?book?.chapters?.findLast(item=>item.page<=resume.page):null;
    primary.textContent=resume?`続きから読む（${resume.page}ページ${chapter?`・${chapter.title}`:''}） →`:'読み始める →';
  }
  function begin(){if(active)onNavigate(2,0);}
  function continueReading(){if(active)onNavigate(resume?.page??2,resume?.offset??0);}
  function chooseContents(){if(active)onContents();}
  function keydown(event) {
    if(!active||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||blocked())return;
    const targetControl=control(event.target);
    if(targetControl&&(targetControl!==cover||event.key==='Enter'))return;
    if(['ArrowLeft','ArrowDown','PageDown','Enter'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();begin();}
  }
  function down(event) {
    if(event.pointerType!=='touch')return;
    touches.add(event.pointerId);
    if(touches.size!==1||event.isPrimary===false){candidate=null;return;}
    const targetControl=control(event.target);
    candidate=active&&!blocked()&&door.contains(event.target)&&(!targetControl||targetControl===cover)?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;
  }
  function up(event) {
    if(event.pointerType!=='touch')return;
    touches.delete(event.pointerId);const start=candidate;
    if(!start||start.id!==event.pointerId)return;candidate=null;
    const targetControl=control(event.target),dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(!active||touches.size||blocked()||!door.contains(event.target)||targetControl&&targetControl!==cover)return;
    if(dx>=48&&dx>Math.abs(dy)*1.5){event.preventDefault();event.stopImmediatePropagation();suppressUntil=now()+450;begin();}
  }
  function move(event){if(candidate&&event.pointerId===candidate.id){const dx=event.clientX-candidate.x,dy=event.clientY-candidate.y;if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx))candidate=null;}}
  function cancel(event){touches.delete(event.pointerId);candidate=null;}
  function click(event){if(now()<suppressUntil&&event.detail!==0&&(!control(event.target)||cover.contains(event.target))){suppressUntil=0;event.preventDefault();event.stopImmediatePropagation();}}
  const resized=()=>sync();
  cover.addEventListener('click',begin);primary.addEventListener('click',continueReading);start.addEventListener('click',begin);contents.addEventListener('click',chooseContents);
  doc.addEventListener('keydown',keydown,true);doc.addEventListener('pointerdown',down,{capture:true,passive:true});doc.addEventListener('pointermove',move,{capture:true,passive:true});doc.addEventListener('pointerup',up,{capture:true,passive:false});doc.addEventListener('pointercancel',cancel,true);doc.addEventListener('click',click,true);view?.addEventListener?.('resize',resized);
  return {sync,get active(){return active;},get hasCover(){return Boolean(selectedURL);},destroy(){if(destroyed)return;destroyed=true;active=false;touches.clear();door.remove();shell.classList.remove('door-open');delete shell.dataset.doorLayout;cover.removeEventListener('click',begin);primary.removeEventListener('click',continueReading);start.removeEventListener('click',begin);contents.removeEventListener('click',chooseContents);doc.removeEventListener('keydown',keydown,true);doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',cancel,true);doc.removeEventListener('click',click,true);view?.removeEventListener?.('resize',resized);}};
}
