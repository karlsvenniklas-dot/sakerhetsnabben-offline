const assert=require('node:assert/strict'),api=require('./offline-drawing-scan.js');
const W=320,H=220,data=new Uint8ClampedArray(W*H*4).fill(255);
for(const [ox,oy] of [[25,24],[150,90],[244,160]])for(let y=0;y<22;y++)for(let x=0;x<22;x++){
 const ring=Math.abs((x-10.5)**2+(y-10.5)**2-70)<24,middle=(x===10&&y>=7&&y<=14)||(y===10&&x>=7&&x<=14);
 if(ring||middle){const p=((oy+y)*W+(ox+x))*4;data[p]=data[p+1]=data[p+2]=30;}
}
const found=api.scan({width:W,height:H,data},{x0:24/W,y0:23/H,x1:48/W,y1:47/H});
assert.ok(found.matches.length>=3,'Three repeated symbols are found');
assert.ok(found.matches.some(m=>Math.abs(m.x-36/W)<.025&&Math.abs(m.y-35/H)<.025));
assert.throws(()=>api.scan({width:W,height:H,data},{x0:0,y0:0,x1:3/W,y1:3/H}),/minst 12/);
assert.throws(()=>api.scan({width:W,height:H,data},{x0:0,y0:0,x1:W/W,y1:H/H}),/en enda/);
console.log('PASS: offline template scanning, repeated symbols, coordinates, oversized and undersized selections.');
