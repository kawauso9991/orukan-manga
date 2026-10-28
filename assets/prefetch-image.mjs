// Retain at most two decoded normal-quality images, capped at 32 MiB RGBA.
export function createImagePreloader({makeImage=()=>new Image(),maxBytes=32*1024*1024,
  timeoutMs=60000,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const retained=new Map();let retainedBytes=0;
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
      if(decode&&typeof image.decode==='function'&&bytes>0&&bytes<=maxBytes) {
        while(retained.size>=2||retainedBytes+bytes>maxBytes)discardOldest();
        try {
          await image.decode();
          if(cancelled)return;
          retained.set(url,{image,bytes});retainedBytes+=bytes;
        } catch { /* Keep foreground loading independent of speculative decode. */ }
      }
      finish(true);
    };
    image.onerror=()=>{image.onload=image.onerror=null;finish(false);};
    image.src=url;
    return ()=>{cancelled=true;clearTimer(timer);image.onload=image.onerror=null;image.removeAttribute('src');};
  }
  return {start,isPrimed:url=>retained.has(url)};
}
