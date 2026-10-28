export function areCurrentImagesReady({images,current,doorImage}) {
  if(doorImage&&!doorImage.hidden&&doorImage.getAttribute('src')&&!doorImage.complete)return false;
  return current.every(number=>images[number-1]?.getAttribute('src')&&images[number-1].complete);
}
// Keep only one low-priority speculative request alive, with no retained images.
export function createPrefetcher({isReady,start,defer,isFetched=()=>false,isPrimed=()=>false}) {
  let key='', queue=[], cancelTimer=null, cancelRequest=null, generation=0;
  const completed=new Set();
  function wake() {
    if(cancelTimer||cancelRequest||!queue.length||!isReady())return;
    const version=generation;
    cancelTimer=defer(()=>{
      cancelTimer=null;
      if(version!==generation||!isReady())return;
      let item;
      while(queue.length) {
        item=queue.shift();
        if(!(completed.has(item.url)||isFetched(item.url,item.page))||(item.decode&&!isPrimed(item.url)))break;
        item=null;
      }
      if(!item)return;
      cancelRequest=start(item.url,success=>{
        if(version!==generation)return;
        cancelRequest=null;
        if(success)completed.add(item.url);
        wake();
      },{decode:item.decode});
    });
  }
  return {
    update({current,urls,decodeNext=false}) {
      const nextKey=JSON.stringify([current,urls,decodeNext]);
      if(nextKey===key){wake();return;}
      key=nextKey;generation++;
      cancelTimer?.();cancelTimer=null;cancelRequest?.();cancelRequest=null;
      const low=Math.min(...current),high=Math.max(...current);
      queue=urls.map((url,index)=>({url,page:index+1,decode:decodeNext&&index+1>high&&index+1<=high+2}))
        .filter(x=>x.url&&!current.includes(x.page)&&(!(completed.has(x.url)||isFetched(x.url,x.page))||(x.decode&&!isPrimed(x.url))))
        .sort((a,b)=>{
          const distance=x=>x.page>high?x.page-high:low-x.page;
          return distance(a)-distance(b)||b.page-a.page;
        });
      wake();
    },
    wake
  };
}
