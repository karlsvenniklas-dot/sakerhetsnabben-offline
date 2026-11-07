/* Offline drawing/onsite discrepancies. They are independent of test events and faults. */
(function(root){
 'use strict';
 const TYPES=[
  'Detektor saknas på plats',
  'Fel adress på ritning',
  'Detektor flyttad',
  'Detektor finns men saknas på ritning',
  'Fel sektion på ritning',
  'Annan ritningsavvikelse'
 ];
 const STATES=['Öppen','Åtgärdad','Kontrollerad'];
 const transitions={'Öppen':['Åtgärdad'],'Åtgärdad':['Öppen','Kontrollerad'],'Kontrollerad':['Öppen']};
 const trimmed=v=>String(v??'').trim();
 const requireText=(value,name)=>{const text=trimmed(value);if(!text)throw Error('Ange '+name+'.');return text;};
 const normalizePosition=(raw)=>{
  const x=raw.x,y=raw.y;
  if((x===null||x===undefined)&&(y===null||y===undefined))return {x:null,y:null};
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)
   throw Error('Ritningspositionen måste ligga inom sidan.');
  return {x,y};
 };
 function make(raw,{id,now}={}){
  if(!TYPES.includes(raw.type))throw Error('Välj en typ av ritningsavvikelse.');
  const description=requireText(raw.description,'beskrivning');
  const technician=requireText(raw.reportedBy,'tekniker');
  const docId=trimmed(raw.docId),deviceId=trimmed(raw.deviceId),orderId=trimmed(raw.orderId);
  const page=docId?(Number(raw.page)||1):null;
  if(docId&&(!Number.isInteger(page)||page<1||page>10000))throw Error('Ogiltigt ritningssidnummer.');
  const position=normalizePosition(raw);
  if(position.x!==null&&!docId)throw Error('Välj en ritning innan en position markeras.');
  const at=now||new Date().toISOString();
  const record={id:id||crypto.randomUUID(),type:raw.type,deviceId,docId,page,...position,
   description,reportedBy:technician,orderId,createdAt:at,status:'Öppen',
   history:[{status:'Öppen',at,technician,note:description}]};
  validate(record);
  return record;
 }
 function validate(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.id!=='string'||!v.id||!TYPES.includes(v.type))
   throw Error('En ritningsavvikelse har ogiltigt ID eller typ.');
  for(const k of ['deviceId','docId','reportedBy','orderId','description','createdAt'])
   if(typeof v[k]!=='string')throw Error('En ritningsavvikelse har ett ogiltigt fält: '+k+'.');
  if(!trimmed(v.description)||!trimmed(v.reportedBy))throw Error('Beskrivning och tekniker krävs.');
  if(!STATES.includes(v.status))throw Error('En ritningsavvikelse har ogiltig status.');
  if(v.docId&&(!Number.isInteger(v.page)||v.page<1||v.page>10000))throw Error('En ritningsavvikelse har ogiltigt sidnummer.');
  if(!v.docId&&v.page!==null)throw Error('Ritning saknas men sidnummer finns.');
  const position=normalizePosition(v);
  if(position.x!==null&&!v.docId)throw Error('Ritningsmarkering saknar ritning.');
  if(!Array.isArray(v.history)||!v.history.length)throw Error('Avvikelsens historik saknas.');
  if(v.history.some(h=>!h||!STATES.includes(h.status)||typeof h.at!=='string'||!h.at||
   typeof h.technician!=='string'||!trimmed(h.technician)||typeof h.note!=='string'||!trimmed(h.note)))
   throw Error('Avvikelsens historik är ogiltig.');
  if(v.history[0].status!=='Öppen'||v.history.at(-1).status!==v.status)
   throw Error('Avvikelsens status stämmer inte med historiken.');
  return v;
 }
 function validateMany(rows){
  if(rows===undefined)return [];
  if(!Array.isArray(rows))throw Error('Listan över ritningsavvikelser är ogiltig.');
  const ids=new Set();
  for(const v of rows){validate(v);if(ids.has(v.id))throw Error('Dubbla avvikelse-ID.');ids.add(v.id);}
  return rows;
 }
 function change(record,next,{technician,note,at}={}){
  validate(record);
  if(!transitions[record.status].includes(next))throw Error('Statusbyte måste följa Öppen → Åtgärdad → Kontrollerad. Återöppning kräver en kommentar.');
  const user=requireText(technician,'tekniker'),reason=requireText(note,'kommentar om åtgärd eller kontroll');
  const updated={...record,status:next,history:[...record.history,{status:next,at:at||new Date().toISOString(),technician:user,note:reason}]};
  return validate(updated);
 }
 function stats(rows){validateMany(rows);return {total:rows.length,open:rows.filter(x=>x.status==='Öppen').length,actioned:rows.filter(x=>x.status==='Åtgärdad').length,checked:rows.filter(x=>x.status==='Kontrollerad').length};}
 function csv(rows,{facility='',orderLabel=()=>'',deviceLabel=()=>'',docLabel=()=>''}={}){
  validateMany(rows);
  const header=['Objekt','ID','Avvikelsetyp','Status','Rapporterad','Tekniker','Detektor','Ritning','Sida','Position X','Position Y','Arbetsorder','Beskrivning','Senaste händelse','Senaste kommentar','Senaste tekniker'];
  const values=[header,...rows.map(v=>{const last=v.history.at(-1);return [facility,v.id,v.type,v.status,v.createdAt,v.reportedBy,deviceLabel(v.deviceId),docLabel(v.docId),v.page??'',v.x??'',v.y??'',orderLabel(v.orderId),v.description,last.at,last.note,last.technician];})];
  const escape=value=>{
   let s=String(value??'');
   if(/^[\s\uFEFF]*[=+@-]/.test(s))s="'"+s; // Excel/Calc formula injection guard
   return '"'+s.replace(/"/g,'""')+'"';
  };
  return '\ufeff'+values.map(row=>row.map(escape).join(';')).join('\r\n')+'\r\n';
 }
 const api={TYPES,STATES,transitions,make,validate,validateMany,change,stats,csv};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.drawingDiscrepancies=api;
})(typeof window==='object'?window:globalThis);
