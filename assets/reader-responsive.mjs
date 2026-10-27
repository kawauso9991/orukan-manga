// Normal-reader layout only. The caller retains fullscreen state and logical page.
export function resolveNormalReaderLayout({width,height,manualMode}={}) {
  if(width<768)return {mode:'vertical',compact:false};
  const portrait=height>width;
  const mode=['single','spread','vertical'].includes(manualMode)?manualMode:portrait?'single':'spread';
  return {mode,compact:portrait||width<=1366};
}

export function swipeDirection({dx=0,dy=0,minDistance=48}={}) {
  return Number.isFinite(dx)&&Number.isFinite(dy)&&Math.abs(dx)>=minDistance&&Math.abs(dx)>Math.abs(dy)*1.5?(dx>0?1:-1):0;
}

export function createReaderSwipeController({element,getState,onTurn,now=()=>performance.now()}={}) {
  const doc=element?.ownerDocument;
  if(!doc?.addEventListener)return {destroy(){}};
  const pointers=new Set();let candidate=null,suppressClickUntil=0;
  const excluded=target=>Boolean((target?.closest?target:target?.parentElement)?.closest?.('a,button,input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),#reference-panel,.desktop-source-tab,.desktop-controls-sidebar,.desktop-controls-corner,.desktop-display-panel,dialog'));
  const enabled=()=>{const state=getState?.()??{};return state.normal&&state.width>=768&&['single','spread'].includes(state.mode)&&!state.pannable&&!state.zoomed&&!(Number(state.scale)>1)&&!(Number(state.nativePinchScale)>1);};
  function down(event) {
    if(event.pointerType!=='touch')return;
    pointers.add(event.pointerId);
    if(pointers.size!==1||event.isPrimary===false){candidate=null;return;}
    candidate=enabled()&&element.contains(event.target)&&!excluded(event.target)?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;
  }
  function move(event) {
    if(!candidate||event.pointerId!==candidate.id)return;
    const dx=event.clientX-candidate.x,dy=event.clientY-candidate.y;
    if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx))candidate=null;
  }
  function up(event) {
    if(event.pointerType!=='touch')return;
    pointers.delete(event.pointerId);
    const start=candidate;if(!start||start.id!==event.pointerId)return;
    candidate=null;
    if(pointers.size||!enabled()||!element.contains(event.target)||excluded(event.target))return;
    const direction=swipeDirection({dx:event.clientX-start.x,dy:event.clientY-start.y});
    if(direction){event.preventDefault();suppressClickUntil=now()+400;onTurn(direction);}
  }
  function cancel(event){pointers.delete(event.pointerId);candidate=null;}
  function click(event){if(now()<suppressClickUntil&&event.detail!==0&&!excluded(event.target)){event.preventDefault();event.stopImmediatePropagation();}}
  doc.addEventListener('pointerdown',down,{capture:true,passive:true});
  doc.addEventListener('pointermove',move,{capture:true,passive:true});
  doc.addEventListener('pointerup',up,{capture:true,passive:false});
  doc.addEventListener('pointercancel',cancel,true);element.addEventListener('click',click,true);
  return {destroy(){pointers.clear();candidate=null;doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',cancel,true);element.removeEventListener('click',click,true);}};
}
