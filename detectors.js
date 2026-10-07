(() => {
 'use strict';
 const fields=[['central','Central'],['slinga','Slinga'],['sektion','Sektion'],['adress','Adress'],['typ','Typ'],['placering','Placering']];
 const statuses=['Provad – OK','Provad – anmärkning','Ej åtkomlig','Inte provad'];
 const norm=s=>String(s||'').trim().toLocaleLowerCase('sv');
 const numeric=s=>/^\d+$/.test(norm(s))?String(Number(s)):norm(s);
 const identity=d=>JSON.stringify([norm(d.central),numeric(d.slinga),numeric(d.adress)]);
 function plan(rows,mapping,devices){
  const keys=mapping.filter(Boolean);if(new Set(keys).size!==keys.length)throw Error('Samma fält är valt för flera kolumner.');if(!keys.includes('adress'))throw Error('Koppla kolumnen Adress.');
  const seen=new Set();return rows.map((row,i)=>{const values={};mapping.forEach((key,col)=>{if(key&&fields.some(f=>f[0]===key)&&row[col]?.trim())values[key]=row[col].trim();});if(!values.adress)throw Error(`Rad ${i+2}: adress saknas.`);const key=identity(values);if(seen.has(key))throw Error(`Rad ${i+2}: samma central, slinga och adress förekommer flera gånger.`);seen.add(key);const matches=devices.filter(d=>identity(d)===key);if(matches.length>1)throw Error('Flera befintliga detektorer har samma identitet.');const old=matches[0];return {action:old?'Uppdatera':'Ny',device:{...Object.fromEntries(fields.map(([k])=>[k,''])),...old,...values,id:old?.id||crypto.randomUUID(),generation:old?.generation||1}};});
 }
 function latest(device,events){return events.filter(e=>e.deviceId===device.id&&e.generation===device.generation&&e.kind==='test').sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt))[0];}
 function tested(device,events,from,to){return events.some(e=>e.deviceId===device.id&&e.generation===device.generation&&e.kind==='test'&&e.date>=from&&e.date<=to&&statuses.slice(0,2).includes(e.status));}
 function event(device,input){if(!statuses.includes(input.status))throw Error('Välj ett provningsresultat.');if(!input.technician?.trim())throw Error('Ange tekniker.');if(!input.orderId)throw Error('Välj en arbetsorder.');if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(+new Date(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date)throw Error('Ange ett giltigt datum.');if(['Provad – anmärkning','Ej åtkomlig'].includes(input.status)&&!input.note?.trim())throw Error('Beskriv anmärkningen.');return {...input,id:crypto.randomUUID(),kind:'test',deviceId:device.id,generation:device.generation,device:{...device},recordedAt:new Date().toISOString()};}
 function csv(rows){return '\uFEFF'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(';')).join('\r\n');}
 function compact(model){return /(?:ID\s*-?\s*3000?)(?!\d)/i.test(model||'');}
 function address(d,model){const loop=String(d.slinga||'').trim(),addr=String(d.adress||'').trim();if(!loop)return addr;if(!/^\d+$/.test(loop)||!/^\d+$/.test(addr))return `${loop}.${addr}`;return compact(model)?`${Number(loop)}${addr.padStart(2,'0')}`:`${loop.padStart(2,'0')}.${addr.padStart(3,'0')}`;}
 function label(d,model){return `Sektion ${d.sektion||'–'} · ${address(d,model)}`;}
 function splitAddress(d,model){const next={...d},a=String(d.adress||'').trim();let match=a.match(/^(\d+)\.(\d+)$/);if(!match&&!d.slinga&&compact(model))match=a.match(/^(\d)(\d{2})$/);if(match){if(d.slinga&&Number(d.slinga)!==Number(match[1]))throw Error('Slinga och adressbeteckning stämmer inte överens.');next.slinga=match[1];next.adress=match[2];}if(compact(model)&&next.slinga&&(!/^[1-9]$/.test(String(Number(next.slinga)))||!/^\d{1,2}$/.test(next.adress)))throw Error('ID300/ID3000: ange en siffra för slingan och två för adressen, exempelvis 223.');return next;}
 function protocolEvents(register,orderId,date,model){const latestByDevice=new Map();for(const e of register.events||[]){if(e.kind!=='test'||e.date!==date||(orderId&&e.orderId!==orderId))continue;const key=e.deviceId+':'+e.generation;const old=latestByDevice.get(key);if(!old||e.recordedAt>old.recordedAt)latestByDevice.set(key,e);}return [...latestByDevice.values()].map(e=>({...e,label:e.label||label(e.device,model)})).sort((a,b)=>a.label.localeCompare(b.label,'sv',{numeric:true}));}
 window.detectorData={fields,statuses,identity,plan,latest,tested,event,csv,compact,address,label,splitAddress,protocolEvents};
})();
