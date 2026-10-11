/* Shared validation. AI suggestions never create test events. */
(function(root){
'use strict';
const MAX=200,strings=['central','slinga','sektion','adress','lokalId','typ','placering','reason'];
function validate(value){
 if(!value||!Array.isArray(value.candidates)||value.candidates.length>MAX||!Array.isArray(value.warnings)||value.warnings.length>20)throw Error('Analysen har fel format eller för många förslag.');
 const warnings=value.warnings.map(s=>{if(typeof s!=='string'||s.length>500)throw Error('Ogiltig analysvarning.');return s;});
 const candidates=value.candidates.map((c,i)=>{if(!c||![c.x,c.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)||!['low','medium','high'].includes(c.confidence))throw Error('En föreslagen position är ogiltig.');const out={id:'candidate-'+i,x:c.x,y:c.y,confidence:c.confidence,approved:false,existingId:''};for(const k of strings){if(typeof c[k]!=='string'||c[k].length>300)throw Error('Ogiltig uppgift i analysen.');out[k]=c[k].trim();}return out;});return {candidates,warnings};
}
function writes(data,facilityId,docId,page,rows,model,detectorApi){
 if(!Number.isInteger(page)||page<1)throw Error('Ogiltig ritningssida.');
 const parse=(key,fallback)=>JSON.parse(data[key]??JSON.stringify(fallback));
 if(!parse('facilities',[]).some(f=>f.id===facilityId)||!parse('docs:'+facilityId,[]).some(d=>d.id===docId)||!data['docfile:'+docId])throw Error('Objektet eller ritningen saknas.');
 const register=parse('detectors:'+facilityId,{devices:[],events:[]}),field=parse('fieldwork:'+facilityId,{visits:[],materials:[],plans:[],pins:[],prep:''}),chosen=rows.filter(r=>r.approved),seen=new Set();
 if(!chosen.length)throw Error('Granska och välj minst ett förslag.');
 for(const row of chosen){
  if(![row.x,row.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Markeringen ligger utanför ritningen.');
  let device;if(row.existingId){device=register.devices.find(d=>d.id===row.existingId);if(!device)throw Error('Den valda detektorn saknas.');}
  else{const values=Object.fromEntries(strings.filter(k=>k!=='reason').map(k=>[k,String(row[k]||'').trim()]));device=detectorApi.validateDevice(detectorApi.splitAddress(values,model));if(!device.typ)throw Error('Ange detektortyp för varje nytt förslag.');if(register.devices.some(d=>detectorApi.identity(d)===detectorApi.identity(device)))throw Error('Detektorn finns redan. Välj Koppla till befintlig detektor.');device={...device,id:crypto.randomUUID(),generation:1};register.devices.push(device);}
  if(seen.has(device.id))throw Error('Samma detektor har valts två gånger på sidan.');seen.add(device.id);
  if(field.pins.some(p=>p.docId===docId&&p.page===page&&p.deviceId===device.id))throw Error('Detektorn har redan en markering på sidan. Flytta den befintliga markeringen i stället.');
  field.pins.push({id:crypto.randomUUID(),docId,page,deviceId:device.id,x:row.x,y:row.y,source:'reviewed-ai',reviewedAt:new Date().toISOString()});
 }
 return {['detectors:'+facilityId]:JSON.stringify(register),['fieldwork:'+facilityId]:JSON.stringify(field)};
}
const api={validate,writes,MAX};if(typeof module==='object'&&module.exports)module.exports=api;else root.drawingAIData=api;
})(typeof window==='object'?window:globalThis);
