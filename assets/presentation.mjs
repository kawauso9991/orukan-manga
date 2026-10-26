import { clampPage, assetURL } from './state.mjs';

export function visiblePages(page, mode, total) {
  page = clampPage(page, total);
  if (mode !== 'spread' || page === 1) return [page];
  const right = page - page % 2;
  return right + 1 <= total ? [right, right + 1] : [right];
}
export function effectiveMode(preferred, width) { return width >= 1024 ? preferred : 'vertical'; }
export function stepPage(page, direction, mode, total) {
  const pages = visiblePages(page, mode, total);
  if (direction > 0 && pages.at(-1) === total || direction < 0 && pages[0] === 1) return page;
  return clampPage(direction > 0 ? pages.at(-1) + 1 : mode === 'spread' ? Math.max(1, pages[0] - 2) : page - 1, total);
}
const defaults = () => ({ mode: 'spread', fit: 'height', scale: 1 });
const key = 'orukan-manga:display:v1';
function valid(value) {
  return value && ['spread','single','vertical'].includes(value.mode) && ['height','width'].includes(value.fit) &&
    typeof value.scale === 'number' && Number.isFinite(value.scale) && value.scale >= .5 && value.scale <= 3;
}
export function readPreferences(getStorage) {
  try { const value = JSON.parse(getStorage()?.getItem(key) ?? 'null'); return valid(value) ? {mode:value.mode,fit:value.fit,scale:value.scale} : defaults(); }
  catch { return defaults(); }
}
export function writePreferences(getStorage, value) {
  try { if (!valid(value)) return false; const storage = getStorage(); if (!storage) return false;
    storage.setItem(key, JSON.stringify({mode:value.mode,fit:value.fit,scale:value.scale})); return true;
  } catch { return false; }
}
export function createWheelIntent({ threshold = 64, quiet = 220 } = {}) {
  let last = -Infinity, sum = 0, fired = false;
  return {
    reset() { last = -Infinity; sum = 0; fired = false; },
    consume({deltaY, deltaMode = 0, time, pageHeight = 800, eligible = true}) {
      if (!Number.isFinite(deltaY) || !Number.isFinite(time)) return 0;
      if (time - last >= quiet) { sum = 0; fired = false; }
      last = time;
      // Rejected samples still belong to this gesture. Discard partial intent,
      // but preserve its consumed latch until every sample has gone quiet.
      if (!eligible) { sum = 0; return 0; }
      if (fired) return 0;
      const value = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1);
      if (Math.sign(value) !== Math.sign(sum)) sum = 0;
      sum += value;
      if (Math.abs(sum) < threshold) return 0;
      fired = true; return Math.sign(sum);
    }
  };
}
export function canTurnWheel({desktop,mode,ctrlKey,metaKey,excluded,pannable,deltaX=0,deltaY=0}) {
  return Boolean(desktop && mode !== 'vertical' && !ctrlKey && !metaKey && !excluded && !pannable && Math.abs(deltaY) > Math.abs(deltaX));
}
export function keyDirection(key) { return ({ArrowLeft:1,ArrowRight:-1,PageDown:1,PageUp:-1})[key] ?? 0; }
export function pageSizes(pages, width, height, fit, scale) {
  const ratioSum = pages.reduce((sum,page)=>sum + page.width / page.height,0);
  const fittedHeight = Math.max(1, fit === 'width' ? width / ratioSum : Math.min(height, width / ratioSum)) * scale;
  return pages.map(page=>({width:fittedHeight * page.width / page.height,height:fittedHeight}));
}
// Measure art against the entire stage. Rails may occupy only what is left,
// never a width subtracted before fitting the art.
export function presentationGeometry(pages, width, height, {fullscreen=false,fit='height',scale=1}={}) {
  const padding=fullscreen?2:12, gap=fullscreen?4:12;
  const sizes=pageSizes(pages,Math.max(1,width-padding*2-gap*(pages.length-1)),Math.max(1,height-(fullscreen?4:66)),fit,scale);
  const artWidth=sizes.reduce((sum,size)=>sum+size.width,0)+gap*(pages.length-1);
  const room=Math.floor((width-artWidth)/2-8);
  return {sizes,artWidth,railWidth:room>=180?Math.min(280,room):0};
}
export function referenceGroups(pages, links) { return pages.map(page=>({page,links:links.filter(link=>link.page===page)})); }
export function createFullscreenController({element,getElement,request,exit,onChange,onError}) {
  return { element,
    changed() { onChange(getElement() === element); },
    async toggle() { try { if (getElement() === element) await exit(); else await request(); } catch (error) { onError(error); } }
  };
}
export function downloadOptions(book) {
  const high=book.highQualityDownload;
  let safe=false;
  try {
    const url=new URL(high?.url);
    safe=typeof high.url==='string' && url.href===high.url && !url.search && !url.hash &&
      /^https:\/\/github\.com\/kawauso9991\/orukan-manga\/releases\/download\/[A-Za-z0-9._-]+\/orukan-v8-high-quality\.pdf$/.test(high.url) &&
      high.filename==='orukan-v8-high-quality.pdf' && Number.isSafeInteger(high.bytes) && high.bytes>0 &&
      /^[a-f0-9]{64}$/i.test(high.sha256) && high.pages===107;
  } catch { /* A missing or invalid optional asset leaves the existing download available. */ }
  return safe?{primary:high,highQuality:true,secondary:book.download}:{primary:book.download,highQuality:false,secondary:null};
}
export function renderDownloadLinks(book,{primary,secondary,size},documentURL) {
  const downloads=downloadOptions(book);
  primary.href=downloads.highQuality?downloads.primary.url:assetURL(downloads.primary.url,documentURL);
  primary.download=downloads.primary.filename;
  size.textContent=`（約${(downloads.primary.bytes/1e6).toFixed(1)} MB）`;
  primary.replaceChildren(`${downloads.highQuality?'高画質':'軽量'}PDFをダウンロード `,size);
  secondary.hidden=!downloads.highQuality;
  if(downloads.secondary) {
    secondary.href=assetURL(downloads.secondary.url,documentURL);
    secondary.download=downloads.secondary.filename;
    secondary.textContent=`軽量PDF（約${(downloads.secondary.bytes/1e6).toFixed(1)} MB）`;
  }
}
