import { externalURL } from './state.mjs';
import { referenceGroups } from './presentation.mjs';

export function validateReadings(readings,totalPages) {
  if(readings===undefined)return [];
  if(!Array.isArray(readings))throw Error('Invalid readings');
  for(const item of readings) {
    let url;
    try {url=new URL(item.url);}catch {throw Error('Invalid reading URL');}
    if(!Number.isSafeInteger(item.page)||item.page<1||item.page>totalPages||item.type!=='external'||item.reading!==true||
       typeof item.label!=='string'||!item.label.trim()||typeof item.description!=='string'||!item.description.trim()||
       item.rect!==undefined||!externalURL(item.url)||url.protocol!=='https:'||url.username||url.password)throw Error('Invalid reading');
  }
  return readings;
}

export function referenceSections(pages,links,readings=[]) {
  return referenceGroups(pages,links).map(group=>({...group,readings:readings.filter(item=>item.page===group.page)}));
}

export function referenceCount(groups) {return groups.reduce((sum,group)=>sum+group.links.length+group.readings.length,0);}

export function referenceName(link,pageLabel) {
  if(link.reading||link.marker||link.guide)return link.label;
  return link.type==='internal'?`${pageLabel(link.target)}へ`:`出典を開く：${new URL(link.url).hostname}`;
}
