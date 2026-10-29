export function areCurrentImagesReady({images,current,doorImage}) {
  if(doorImage&&!doorImage.hidden&&doorImage.getAttribute('src')&&!doorImage.complete)return false;
  return current.every(number=>images[number-1]?.getAttribute('src')&&images[number-1].complete);
}
// Keep only one low-priority speculative request alive.
export function createPrefetcher({isReady,start,defer,isFetched=()=>false,isPrimed=()=>false}) {
  let key='', queue=[], cancelTimer=null, cancelRequest=null, generation=0;
  const completed=new Set();
  function wake() {
    if(cancelTimer||cancelRequest||!queue.length||!isReady())return;
    const version=generation;
    const first=queue[0],promote=first?.decode&&(completed.has(first.url)||isFetched(first.url,first.page));
    const delay=first?.attempt?2000*2**(first.attempt-1):promote?0:300;
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
        else if(item.attempt<2)queue.push({...item,attempt:item.attempt+1});
        wake();
      },{decode:item.decode});
    },delay);
  }
  return {
    update({current,urls,decodeNext=false,decodeAhead=2,decodeBehind=0,aheadFirst=0}) {
      const nextKey=JSON.stringify([current,urls,decodeNext,decodeAhead,decodeBehind,aheadFirst]);
      if(nextKey===key){wake();return;}
      key=nextKey;generation++;
      cancelTimer?.();cancelTimer=null;cancelRequest?.();cancelRequest=null;
      const low=Math.min(...current),high=Math.max(...current);
      queue=urls.map((url,index)=>({url,page:index+1,decode:decodeNext&&((index+1>high&&index+1<=high+decodeAhead)||(index+1<low&&index+1>=low-decodeBehind)),attempt:0}))
        .filter(x=>x.url&&!current.includes(x.page)&&(!(completed.has(x.url)||isFetched(x.url,x.page))||(x.decode&&!isPrimed(x.url))))
        .sort((a,b)=>{
          const distance=x=>{const forward=x.page>high,d=forward?x.page-high:low-x.page;
            if(!aheadFirst)return d;
            if(forward&&d<=aheadFirst)return d-1;
            if(!forward&&d<=decodeBehind)return aheadFirst+d-1;
            return aheadFirst+decodeBehind+(forward?d-aheadFirst-1:(d-decodeBehind-1)*3+2);};
          return distance(a)-distance(b)||b.page-a.page;
        });
      wake();
    },
    wake
  };
}
