/* Read-only integrity checks for local object data. No customer records leave the device. */
(function(root){
'use strict';
function inspect(data) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Lokal data har fel format.');
  const findings=[],totals={errors:0,warnings:0},counts={objects:0,orders:0,detectors:0,tests:0,documents:0,drawings:0};
  const own=(key)=>Object.prototype.hasOwnProperty.call(data,key);
  function flag(level,description,object='') {
    if(level==='error')totals.errors++;else totals.warnings++;
    if(findings.length<100)findings.push({level,description,object:String(object).slice(0,100)});
  }
  function parse(key,fallback) {
    if(!own(key))return fallback;
    if(typeof data[key]!=='string'){flag('error','Posten '+key+' är inte läsbar.');return null;}
    try{return JSON.parse(data[key]);}catch{flag('error','Posten '+key+' innehåller ogiltig JSON.');return null;}
  }
  function rows(key) {
    const value=parse(key,[]);
    if(value===null)return [];
    if(!Array.isArray(value)){flag('error','Posten '+key+' är inte en lista.');return [];}
    return value;
  }
  function unique(items,label,object) {
    const ids=new Set();
    for(const item of items) {
      if(!item||typeof item.id!=='string'||!item.id){flag('error',label+' saknar giltigt ID.',object);continue;}
      if(ids.has(item.id))flag('error','Dubbelt ID i '+label+': '+item.id,object);
      ids.add(item.id);
    }
    return ids;
  }
  const facilities=rows('facilities'),facilityIds=unique(facilities,'objektregistret','');
  counts.objects=facilities.length;
  const orders=rows('workorders');unique(orders,'arbetsorder','');counts.orders=orders.length;
  for(const o of orders)if(o&&o.facilityId&&!facilityIds.has(o.facilityId))flag('error','Arbetsorder pekar på ett objekt som saknas.',o.ordernummer||o.id);
  const history=rows('history-index');unique(history,'protokollhistoriken','');
  for(const r of history)if(r&&r.facilityId&&!facilityIds.has(r.facilityId))flag('warning','Protokollhistorik pekar på ett objekt som saknas.',r.id);
  const usedFiles=new Set();
  for(const f of facilities) {
    if(!f||typeof f.id!=='string'||!f.id)continue;
    const label=String(f.namn||f.anlNr||f.id).slice(0,100);
    const docs=rows('docs:'+f.id);unique(docs,'dokumentlistan',label);counts.documents+=docs.length;
    const docIds=new Set();
    for(const doc of docs) {
      if(!doc||typeof doc.id!=='string'||!doc.id)continue;
      if(usedFiles.has(doc.id))flag('error','Samma dokument-ID används på flera objekt.',label);
      usedFiles.add(doc.id);docIds.add(doc.id);
      const key='docfile:'+doc.id;
      if(!own(key))flag('error','Dokument saknar tillhörande fil: '+doc.id,label);
      else if(typeof data[key]!=='string'||!/^"data:(?:application\/pdf|image\/(?:jpeg|png|webp));base64,/.test(data[key]))
        flag('warning','Dokumentfilens format bör kontrolleras: '+doc.id,label);
    }
    const reg=parse('detectors:'+f.id,{devices:[],events:[]});
    let deviceIds=new Set();
    if(reg!==null&&(!Array.isArray(reg.devices)||!Array.isArray(reg.events)))
      flag('error','Detektorregistret har fel format.',label);
    else if(reg!==null) {
      deviceIds=unique(reg.devices,'detektorregistret',label);
      unique(reg.events,'provningshistoriken',label);
      counts.detectors+=reg.devices.length;
      counts.tests+=reg.events.filter(e=>e&&e.kind==='test').length;
      for(const e of reg.events)if(e&&typeof e.deviceId==='string'&&!deviceIds.has(e.deviceId))
        flag('warning','En historisk provning saknar nuvarande detektor. Kontrollera om den har tagits bort.',label);
    }
    const field=parse('fieldwork:'+f.id,{pins:[],plans:[],visits:[],materials:[]});
    if(field!==null&&(!Array.isArray(field.pins)||!Array.isArray(field.plans)||!Array.isArray(field.visits)||!Array.isArray(field.materials)))
      flag('error','Fältregistret har fel format.',label);
    else if(field!==null) {
      counts.drawings+=field.pins.length;
      unique(field.pins,'ritningsmarkeringarna',label);
      for(const pin of field.pins) {
        if(!pin)continue;
        if(!docIds.has(pin.docId))flag('warning','Ritningsmarkering saknar dokumentkoppling.',label);
        if(!deviceIds.has(pin.deviceId))flag('warning','Ritningsmarkering saknar detektorkoppling.',label);
      }
      for(const plan of field.plans)if(plan&&Array.isArray(plan.devices))
        for(const device of plan.devices)if(device&&device.id&&!deviceIds.has(device.id))
          flag('warning','Sparad provningsplan innehåller en detektor som inte längre finns.',label);
    }
    for(const prefix of ['issues:','service-reports:']) {
      const entries=rows(prefix+f.id);
      unique(entries,prefix==='issues:'?'felregistret':'servicerapporterna',label);
    }
  }
  for(const key of Object.keys(data))if(key.startsWith('docfile:')&&!usedFiles.has(key.slice(8)))
    flag('warning','En dokumentfil saknar koppling till ett objekt. Ingen fil raderas.');
  return {counts,totals,findings,truncated:totals.errors+totals.warnings>findings.length};
}
const api={inspect};
if(typeof module==='object'&&module.exports)module.exports=api;else root.healthData=api;
})(typeof window==='object'?window:globalThis);
