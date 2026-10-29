// Decoded retention is bounded by both the caller's count and RGBA byte budget.
export function createImagePreloader({makeImage=()=>new Image(),maxBytes=32*1024*1024,maxImages=2,
  timeoutMs=60000,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const retained=new Map();let retainedBytes=0,desired=null;
  function discard(key){const item=retained.get(key);if(item){retainedBytes-=item.bytes;retained.delete(key);}}
  function discardOldest(){const key=retained.keys().next().value;retainedBytes-=retained.get(key).bytes;retained.delete(key);}
  function start(url,done,{decode=false}={}) {
    const image=makeImage();let cancelled=false;
    const timer=setTimer(()=>{if(cancelled)return;cancelled=true;clearTimer(timer);
      image.onload=image.onerror=null;image.removeAttribute('src');done(false);},timeoutMs);
    function finish(success){if(cancelled)return;cancelled=true;clearTimer(timer);done(success);}
    image.fetchPriority='low';image.decoding='async';
    image.onload=async()=>{
      image.onload=image.onerror=null;
      const bytes=image.naturalWidth*image.naturalHeight*4;
      if(decode&&(!desired||desired.has(url))&&typeof image.decode==='function'&&bytes>0&&bytes<=maxBytes) {
        discard(url);
        while(retained.size>=maxImages||retainedBytes+bytes>maxBytes)discardOldest();
        try {
          await image.decode();
          if(cancelled)return;
          if(!desired||desired.has(url)){retained.set(url,{image,bytes});retainedBytes+=bytes;}
        } catch { /* Keep foreground loading independent of speculative decode. */ }
      }
      finish(true);
    };
    image.onerror=()=>{image.onload=image.onerror=null;finish(false);};
    image.src=url;
    return ()=>{cancelled=true;clearTimer(timer);image.onload=image.onerror=null;image.removeAttribute('src');};
  }
  return {start,isPrimed:url=>retained.has(url),setRetention(urls){desired=new Set(urls);for(const url of retained.keys())if(!desired.has(url))discard(url);}};
}
