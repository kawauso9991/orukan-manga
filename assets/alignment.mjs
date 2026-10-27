import { verifiedPanelAnchors } from './panel-anchors.mjs';

const anchors=new Map(verifiedPanelAnchors.map(([page,src,bytes,zoom,zoomBytes,anchorY])=>[page,{src,bytes,zoom,zoomBytes,anchorY}]));
const baseline=140;

function inspected(book,page) {
  const item=book.pages[page-1],record=anchors.get(page);
  return item&&record&&item.src===record.src&&item.bytes===record.bytes&&item.zoom===record.zoom&&item.zoomBytes===record.zoomBytes&&item.width===1200&&item.height===1698?record:null;
}

export function verifiedCover(book) {return Boolean(inspected(book,1));}

export function pageAlignment() {
  // Internal panel spacing belongs to the images. Keep every complete page
  // on its original outer bounds instead of translating it to a panel anchor.
  return null;
}

export function alignmentBaseline(width,height,{mode='spread',fullscreen=false,fit='height',scale=1}={}) {
  const count=mode==='single'?1:2,padding=fullscreen?2:12,gap=fullscreen?4:12;
  const widthScale=Math.max(1,width-padding*2-gap*(count-1))/(1200*count);
  const heightScale=Math.max(1,height-(fullscreen?4:18))/1838;
  return baseline*(fit==='width'?widthScale:Math.min(widthScale,heightScale))*scale;
}

export function renderedAlignment(alignment,width,baselineY) {
  const scale=width/alignment.width,top=Math.max(0,baselineY-alignment.anchorY*scale);
  return {scale,top,height:top+alignment.sourceHeight*scale,firstPanelY:top+alignment.anchorY*scale};
}
