(() => {
 'use strict';
 const fields=[['central','Central'],['slinga','Slinga'],['sektion','Sektion'],['adress','Adress'],['typ','Typ'],['placering','Placering']];
 const statuses=['Provad – OK','Provad – anmärkning','Ej åtkomlig','Inte provad'];
 const norm=s=>String(s||'').trim().toLocaleLowerCase('sv');
 const identity=d=>JSON.stringify([norm(d.central),norm(d.slinga),norm(d.adress)]);
 function plan(rows,mapping,devices){
  const keys=mapping.filter(Boolean);if(new Set(keys).size!==keys.length)throw Error('Samma fält är valt för flera kolumner.');if(!keys.includes('adress'))throw Error('Koppla kolumnen Adress.');
  const seen=new Set();return rows.map((row,i)=>{const values={};mapping.forEach((key,col)=>{if(key&&fields.some(f=>f[0]===key)&&row[col]?.trim())values[key]=row[col].trim();});if(!values.adress)throw Error(`Rad ${i+2}: adress saknas.`);const key=identity(values);if(seen.has(key))throw Error(`Rad ${i+2}: samma central, slinga och adress förekommer flera gånger.`);seen.add(key);const matches=devices.filter(d=>identity(d)===key);if(matches.length>1)throw Error('Flera befintliga detektorer har samma identitet.');const old=matches[0];return {action:old?'Uppdatera':'Ny',device:{...Object.fromEntries(fields.map(([k])=>[k,''])),...old,...values,id:old?.id||crypto.randomUUID(),generation:old?.generation||1}};});
 }
 function latest(device,events){return events.filter(e=>e.deviceId===device.id&&e.generation===device.generation&&e.kind==='test').sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt))[0];}
 function tested(device,events,from,to){return events.some(e=>e.deviceId===device.id&&e.generation===device.generation&&e.kind==='test'&&e.date>=from&&e.date<=to&&statuses.slice(0,2).includes(e.status));}
 function event(device,input){if(!statuses.includes(input.status))throw Error('Välj ett provningsresultat.');if(!input.technician?.trim())throw Error('Ange tekniker.');if(!input.orderId)throw Error('Välj en arbetsorder.');if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(+new Date(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date)throw Error('Ange ett giltigt datum.');if(input.status==='Provad – anmärkning'&&!input.note?.trim())throw Error('Beskriv anmärkningen.');return {...input,id:crypto.randomUUID(),kind:'test',deviceId:device.id,generation:device.generation,device:{...device},recordedAt:new Date().toISOString()};}
 function csv(rows){return '\uFEFF'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(';')).join('\r\n');}
 window.detectorData={fields,statuses,identity,plan,latest,tested,event,csv};
})();
