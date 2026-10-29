// A newer input owns the commit; neither a late decode nor a queued frame may
// reveal an older spread. Current images are never replaced by this module.
export function createPageCommitter({waitForImage,commit,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}) {
  let generation=0,frame=null,abort=null,active=0;
  const waiting=[];
  function pump(){
    while(active<2&&waiting.length){const job=waiting.shift();
      if(job.signal.aborted){job.resolve();continue;}
      active++;
      Promise.resolve(waitForImage(job.image,job.signal)).catch(()=>{}).then(()=>{active--;job.resolve();pump();});
    }
  }
  function cancel(){generation++;abort?.abort();abort=null;if(frame!==null)cancelFrame(frame);frame=null;}
  return {cancel,update(images){
    cancel();const version=generation,urls=images.map(image=>image.getAttribute('src')||image.src);
    abort=new AbortController();
    const signal=abort.signal;
    const prepared=images.map(image=>new Promise(resolve=>waiting.push({image,signal,resolve})));
    pump();
    Promise.all(prepared).then(()=>{
      if(version!==generation)return;
      frame=requestFrame(()=>{frame=null;
        if(version!==generation||images.some((image,index)=>(image.getAttribute('src')||image.src)!==urls[index]))return;
        commit(images);
      });
    });
  }};
}

export function waitForPageImage(image,signal) {
  return new Promise(resolve=>{
    let settled=false,decoding=false;
    const cleanup=()=>{image.removeEventListener('load',loaded);image.removeEventListener('error',failed);signal?.removeEventListener('abort',aborted);};
    const finish=()=>{if(settled)return;settled=true;cleanup();resolve();};
    const failed=()=>finish();
    const aborted=()=>{cleanup();if(!decoding)finish();};
    const loaded=()=>{
      if(signal?.aborted){finish();return;}
      // A browser may reject speculative decode under pressure; leave its
      // ordinary image/error rendering available instead of freezing controls.
      decoding=true;
      Promise.resolve().then(()=>!signal?.aborted&&image.naturalWidth>0?image.decode?.():undefined).catch(()=>{}).then(()=>{decoding=false;finish();});
    };
    image.addEventListener('load',loaded);image.addEventListener('error',failed);signal?.addEventListener('abort',aborted,{once:true});
    if(signal?.aborted)finish();else if(image.complete)loaded();
  });
}

// One painted, bounded snapshot bridges page/source replacement. It is not an
// all-book raster cache, and it cannot introduce a second set of live links.
export function createSpreadTransition({stage,deck,figures,images,maxSnapshotBytes=32*1024*1024,onCommit=()=>{}}) {
  let canvas=null,pendingKey='',readyKey='';
  const host=stage.parentElement;
  const align=()=>{if(canvas){const a=stage.getBoundingClientRect(),b=host.getBoundingClientRect();canvas.style.left=`${a.left-b.left}px`;canvas.style.top=`${a.top-b.top}px`;}};
  const release=()=>{canvas?.remove();canvas=null;deck.style.visibility='';stage.removeAttribute('aria-busy');pendingKey='';};
  const committer=createPageCommitter({waitForImage:waitForPageImage,commit:()=>{readyKey=pendingKey;release();onCommit();}});
  function clear(){committer.cancel();readyKey='';release();}
  function capture(){
    if(canvas||deck.style.visibility==='hidden')return;
    const bounds=stage.getBoundingClientRect(),width=stage.clientWidth,height=stage.clientHeight;
    if(width<=0||height<=0)return;
    const selected=figures.flatMap((figure,index)=>{
      if(figure.hidden)return [];
      const image=images[index],rect=image.getBoundingClientRect();
      return rect.width>0&&rect.height>0&&rect.right>bounds.left&&rect.left<bounds.right&&rect.bottom>bounds.top&&rect.top<bounds.bottom?[{figure,image,rect}]:[];
    });
    if(!selected.length||selected.length>2||selected.some(({image})=>!image.complete||!image.naturalWidth))return;
    const next=stage.ownerDocument.createElement('canvas'),scale=Math.min(window.devicePixelRatio||1,Math.sqrt(maxSnapshotBytes/(width*height*4)));
    next.width=Math.max(1,Math.floor(width*scale));next.height=Math.max(1,Math.floor(height*scale));
    const context=next.getContext('2d');if(!context)return;
    context.scale(scale,scale);
    context.fillStyle=window.getComputedStyle(stage).backgroundColor||'#0d1014';context.fillRect(0,0,width,height);
    for(const {figure,image,rect} of selected){
      const art=image.parentElement,clip=art.getBoundingClientRect();
      context.save();context.beginPath();context.rect(clip.left-bounds.left,clip.top-bounds.top,clip.width,clip.height);context.clip();
      const fit=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight),w=image.naturalWidth*fit,h=image.naturalHeight*fit;
      context.drawImage(image,rect.left-bounds.left+(rect.width-w)/2,rect.top-bounds.top+(rect.height-h)/2,w,h);context.restore();
      const label=figure.querySelector('.page-label');if(label){const lr=label.getBoundingClientRect(),style=window.getComputedStyle(label);context.font=style.font;context.fillStyle=style.color;context.textBaseline='top';context.fillText(label.textContent,lr.left-bounds.left,lr.top-bounds.top);}
    }
    next.className='spread-hold';next.setAttribute('aria-hidden','true');next.dataset.pages=selected.map(({figure})=>figure.dataset.page).join(',');
    next.style.cssText=`position:absolute;z-index:4;width:${width}px;height:${height}px;pointer-events:auto;`;
    // Only append after every old page has been drawn; an empty canvas would
    // otherwise expose transparent/black pixels for one compositor frame.
    canvas=next;align();host.append(next);
  }
  return {capture,clear,get pending(){return Boolean(pendingKey);},prepare(selected,{enabled=true}={}){
    if(!enabled){clear();return;}
    const key=selected.map(image=>image.getAttribute('src')||'').join('|');
    if(key===pendingKey||(!canvas&&key===readyKey))return;
    pendingKey=key;deck.style.visibility='hidden';stage.setAttribute('aria-busy','true');align();
    committer.update(selected);
  }};
}
