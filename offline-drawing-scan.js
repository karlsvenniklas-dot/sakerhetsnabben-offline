/* Offline symbol template matching. No network and no recording of test results. */
(function(root){
'use strict';
function scan(image,region,options={}){
 const {width,height,data}=image||{};
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||!data||data.length!==width*height*4)throw Error('Ritningsbilden kunde inte läsas.');
 const x0=Math.max(0,Math.floor(Math.min(region?.x0,region?.x1)*width)),y0=Math.max(0,Math.floor(Math.min(region?.y0,region?.y1)*height));
 const x1=Math.min(width,Math.ceil(Math.max(region?.x0,region?.x1)*width)),y1=Math.min(height,Math.ceil(Math.max(region?.y0,region?.y1)*height));
 const w=x1-x0,h=y1-y0;
 if(![x0,y0,x1,y1].every(Number.isFinite)||w<12||h<12)throw Error('Markera hela symbolen i en ruta som är minst 12 pixlar bred och hög.');
 if(w>180||h>180)throw Error('Markera en enda liten symbol, inte ett helt rum eller ett stort ritningsområde.');
 const grays=new Uint8Array(width*height);let lo=255,hi=0;
 for(let p=0,k=0;p<grays.length;p++,k+=4){
  const a=data[k+3]/255,v=Math.round((data[k]*.2126+data[k+1]*.7152+data[k+2]*.0722)*a+255*(1-a));grays[p]=v;
  if(p%31===0){lo=Math.min(lo,v);hi=Math.max(hi,v);}
 }
 if(hi-lo<35)throw Error('Ritningen har för låg kontrast för säker symbolmatchning.');
 const threshold=Math.min(210,Math.max(105,(lo+hi)/2));
 const ink=new Uint8Array(width*height);for(let p=0;p<ink.length;p++)ink[p]=grays[p]<threshold?1:0;
 const features=[];let darkCount=0;
 for(let j=0;j<11;j++)for(let i=0;i<11;i++){
  const dx=Math.min(w-1,Math.floor((i+.5)*w/11)),dy=Math.min(h-1,Math.floor((j+.5)*h/11));
  const dark=ink[(y0+dy)*width+(x0+dx)]===1;features.push({dx,dy,dark});if(dark)darkCount++;
 }
 const brightCount=features.length-darkCount;
 if(darkCount<7||brightCount<12)throw Error('Symbolrutan innehåller för lite tydligt mönster. Zooma eller välj en annan symbol.');
 const stride=Math.max(2,Math.round(Math.min(w,h)/10)),limit=Math.max(1,Math.min(200,Number(options.maxResults)||120)),found=[];
 function nearbyInk(x,y){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(ink[(y+dy)*width+x+dx])return true;return false;}
 function candidate(x,y){
  let darkOk=0,brightOk=0;
  for(const feat of features){
   const px=x+feat.dx,py=y+feat.dy;
   if(feat.dark){if(px>0&&py>0&&px<width-1&&py<height-1&&nearbyInk(px,py))darkOk++;}
   else if(!ink[py*width+px])brightOk++;
  }
  const d=darkOk/darkCount,b=brightOk/brightCount;
  if(d<.83||b<.88)return;
  const score=.7*d+.3*b;if(score<.89)return;
  found.push({x:(x+w/2)/width,y:(y+h/2)/height,score});
 }
 for(let y=0;y<=height-h;y+=stride)for(let x=0;x<=width-w;x+=stride)candidate(x,y);
 candidate(x0,y0);found.sort((a,b)=>b.score-a.score);
 const matches=[];
 for(const hit of found){
  if(matches.some(m=>Math.abs((m.x-hit.x)*width)<w*.65&&Math.abs((m.y-hit.y)*height)<h*.65))continue;
  matches.push(hit);if(matches.length>=limit)break;
 }
 return {matches,scannedAtScale:{width,height},template:{width:w,height:h},possiblyTruncated:matches.length>=limit};
}
const api={scan};if(typeof module==='object'&&module.exports)module.exports=api;else root.offlineDrawingScan=api;
})(typeof window==='object'?window:globalThis);
