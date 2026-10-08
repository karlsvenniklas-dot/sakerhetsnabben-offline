(() => {
 'use strict';
 const fields=[['central','Central'],['slinga','Slinga'],['sektion','Sektion'],['adress','Adress'],['typ','Typ'],['placering','Placering'],['lokalId','Lokal beteckning (utan adress)']];
 const statuses=['Provad – OK','Provad – anmärkning','Ej åtkomlig','Inte provad'];
 const norm=s=>String(s||'').trim().toLocaleLowerCase('sv');
 const numeric=s=>/^\d+$/.test(norm(s))?String(Number(s)):norm(s);
 const identity=d=>JSON.stringify(d.adress?[norm(d.central),numeric(d.slinga),numeric(d.adress)]:[norm(d.central),'lokal',numeric(d.sektion),norm(d.lokalId)]);
 function validateDevice(d){if(!String(d.adress||'').trim()&&(!String(d.sektion||'').trim()||!String(d.lokalId||'').trim()))throw Error('Utan adress: ange sektion och en unik lokal beteckning, exempelvis Detektor 4.');return d;}
 function plan(rows,mapping,devices){
  const keys=mapping.filter(Boolean);if(new Set(keys).size!==keys.length)throw Error('Samma fält är valt för flera kolumner.');if(!keys.includes('adress')&&!keys.includes('lokalId'))throw Error('Koppla Adress eller Lokal beteckning.');
  const seen=new Set();return rows.map((row,i)=>{const values={};mapping.forEach((key,col)=>{if(key&&fields.some(f=>f[0]===key)&&row[col]?.trim())values[key]=row[col].trim();});validateDevice(values);const key=identity(values);if(seen.has(key))throw Error(`Rad ${i+2}: samma central, slinga och adress förekommer flera gånger.`);seen.add(key);const matches=devices.filter(d=>identity(d)===key);if(matches.length>1)throw Error('Flera befintliga detektorer har samma identitet.');const old=matches[0];return {action:old?'Uppdatera':'Ny',device:{...Object.fromEntries(fields.map(([k])=>[k,''])),...old,...values,id:old?.id||crypto.randomUUID(),generation:old?.generation||1}};});
 }
 function latest(device,events){return events.filter(e=>e.deviceId===device.id&&e.generation===device.generation&&e.kind==='test').sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt))[0];}
 function tested(device,events,from,to){return events.some(e=>e.deviceId===device.id&&e.generation===device.generation&&e.kind==='test'&&e.date>=from&&e.date<=to&&statuses.slice(0,2).includes(e.status));}
 function event(device,input){if(!statuses.includes(input.status))throw Error('Välj ett provningsresultat.');if(!input.technician?.trim())throw Error('Ange tekniker.');if(!input.orderId)throw Error('Välj en arbetsorder.');if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(+new Date(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date)throw Error('Ange ett giltigt datum.');if(['Provad – anmärkning','Ej åtkomlig'].includes(input.status)&&!input.note?.trim())throw Error('Beskriv anmärkningen.');return {...input,id:crypto.randomUUID(),kind:'test',deviceId:device.id,generation:device.generation,device:{...device},recordedAt:new Date().toISOString()};}
 function csv(rows){return '\uFEFF'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(';')).join('\r\n');}
 function compact(model){return /(?:ID\s*-?\s*3000?)(?!\d)/i.test(model||'');}
 function address(d,model){if(!d.adress)return d.lokalId||'Utan adress';const loop=String(d.slinga||'').trim(),addr=String(d.adress||'').trim();if(!loop)return addr;if(!/^\d+$/.test(loop)||!/^\d+$/.test(addr))return `${loop}.${addr}`;return compact(model)?`${Number(loop)}${addr.padStart(2,'0')}`:`${loop.padStart(2,'0')}.${addr.padStart(3,'0')}`;}
 function label(d,model){return `Sektion ${d.sektion||'–'} · ${address(d,model)}`;}
 function splitAddress(d,model){const next={...d},a=String(d.adress||'').trim();let match=a.match(/^(\d+)\.(\d+)$/);if(!match&&!d.slinga&&compact(model))match=a.match(/^(\d)(\d{2})$/);if(match){if(d.slinga&&Number(d.slinga)!==Number(match[1]))throw Error('Slinga och adressbeteckning stämmer inte överens.');next.slinga=match[1];next.adress=match[2];}if(compact(model)&&next.adress&&next.slinga&&(!/^[1-9]$/.test(String(Number(next.slinga)))||!/^\d{1,2}$/.test(next.adress)))throw Error('ID300/ID3000: ange en siffra för slingan och två för adressen, exempelvis 223.');return next;}
 function protocolEvents(register,orderId,date,model){const latestByDevice=new Map();for(const e of register.events||[]){if(e.kind!=='test'||e.date!==date||(orderId&&e.orderId!==orderId))continue;const key=e.deviceId+':'+e.generation;const old=latestByDevice.get(key);if(!old||e.recordedAt>old.recordedAt)latestByDevice.set(key,e);}return [...latestByDevice.values()].map(e=>({...e,label:e.label||label(e.device,model)})).sort((a,b)=>a.label.localeCompare(b.label,'sv',{numeric:true}));}
 function protocolState(state,events,model){
  const manual=(state.sektioner||[]).filter(r=>!r.fromDetector&&!(r.sek==='001'&&r.adr.every(a=>!a)));
  const groups=new Map();for(const e of events){if(!statuses.slice(0,2).includes(e.status))continue;const d=e.device||{},section=d.sektion||'Ej angiven',key=JSON.stringify([d.central||'',section]);if(!groups.has(key))groups.set(key,{sek:section,addresses:[]});const group=groups.get(key),addr=(d.central?d.central+' · ':'')+address(d,model);if(!group.addresses.includes(addr))group.addresses.push(addr);}
  const auto=[];for(const g of groups.values())for(let i=0;i<g.addresses.length;i+=3){const adr=g.addresses.slice(i,i+3);while(adr.length<3)adr.push('');auto.push({sek:g.sek,adr,fromDetector:true});}
  return {...state,detectorTests:events,sektioner:[...manual,...auto],tekniker:state.tekniker||[...new Set(events.map(e=>e.technician).filter(Boolean))].join(', ')};
 }
 function coverage(register,year,quarter){
  const y=Number(year),q=Number(quarter);if(!Number.isInteger(y)||y<2000||y>2200||!Number.isInteger(q)||q<1||q>4)throw Error('Välj år och kvartal.');
  const from=`${y}-${String((q-1)*3+1).padStart(2,'0')}-01`,to=new Date(Date.UTC(y,q*3,0)).toISOString().slice(0,10);
  const sections=new Set(register.devices.filter(d=>d.sektion).map(d=>JSON.stringify([norm(d.central),numeric(d.sektion)])));
  function count(a,b){const ds=register.devices.filter(d=>tested(d,register.events,a,b));return {devices:ds.length,sections:new Set(ds.filter(d=>d.sektion).map(d=>JSON.stringify([norm(d.central),numeric(d.sektion)]))).size};}
  return {totalDevices:register.devices.length,totalSections:sections.size,missingSections:register.devices.filter(d=>!d.sektion).length,year:count(`${y}-01-01`,`${y}-12-31`),quarter:count(from,to),from,to};
 }
 window.detectorData={fields,statuses,identity,validateDevice,coverage,protocolState,plan,latest,tested,event,csv,compact,address,label,splitAddress,protocolEvents};
})();
