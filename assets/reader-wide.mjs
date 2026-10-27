// Pure PC-normal geometry. The caller owns DOM, mode boundaries and loading.
// Rails sit beside the centered comic; surplus viewport width stays outside.
export function wideReaderGeometry(pages,viewportWidth,viewportHeight,{
  leftWidth=220,rightWidth=234,fit='height',scale=1,padding=12,gap=12
}={}) {
  if(!Array.isArray(pages)||!pages.length||pages.some(page=>!Number.isFinite(page.width)||page.width<=0||!Number.isFinite(page.height)||page.height<=0))
    throw new TypeError('Expected positive page dimensions');
  if(![viewportWidth,viewportHeight,scale].every(value=>Number.isFinite(value)&&value>0)||!['height','width'].includes(fit))
    throw new RangeError('Expected a positive viewport, scale and supported fit');
  const railWidth=value=>Math.min(280,Math.max(0,Number.isFinite(value)?value:0));
  const left=railWidth(leftWidth),right=railWidth(rightWidth);
  const inset=Math.max(0,Number.isFinite(padding)?padding:0),pageGap=Math.max(0,Number.isFinite(gap)?gap:0);
  const availableWidth=viewportWidth-2*(Math.max(left,right)+inset);
  const availableHeight=viewportHeight-2*inset,totalGap=pageGap*(pages.length-1);
  if(availableWidth<=totalGap||availableHeight<=0)throw new RangeError('Viewport cannot contain the requested rails and gaps');
  const ratioSum=pages.reduce((sum,page)=>sum+page.width/page.height,0);
  const widthFitHeight=(availableWidth-totalGap)/ratioSum;
  const artHeight=(fit==='width'?widthFitHeight:Math.min(availableHeight,widthFitHeight))*scale;
  const sizes=pages.map(page=>({width:artHeight*page.width/page.height,height:artHeight}));
  const artWidth=sizes.reduce((sum,size)=>sum+size.width,0)+totalGap;
  const comicLeft=(viewportWidth-artWidth)/2,comicTop=(viewportHeight-artHeight)/2;
  const rect=(x,y,width,height)=>({left:x,top:y,width,height,right:x+width,bottom:y+height});
  const comic={...rect(comicLeft,comicTop,artWidth,artHeight),centerX:viewportWidth/2,centerY:viewportHeight/2};
  const leftRail=rect(comic.left-left,inset,left,availableHeight);
  const rightRail=rect(comic.right,inset,right,availableHeight);
  const epsilon=1e-8;
  const fullVisible=[comic,leftRail,rightRail].every(box=>box.left>=-epsilon&&box.right<=viewportWidth+epsilon&&box.top>=-epsilon&&box.bottom<=viewportHeight+epsilon);
  return {sizes,artWidth,artHeight,comic,left:leftRail,right:rightRail,
    outer:{left:leftRail.left,right:viewportWidth-rightRail.right},
    available:{width:availableWidth,height:availableHeight},fullVisible};
}

// Use the measured width of ONE page in CSS pixels. DPR is QA metadata only;
// multiplying by it here would request HQ too early on dense displays.
export function prefersHQ(renderedPageWidth) {
  return Number.isFinite(renderedPageWidth)&&renderedPageWidth>1200;
}
