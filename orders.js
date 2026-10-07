(() => {
 'use strict';
 const statuses=['Planerat','Påbörjat','Klart'];
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const make=(facility,values={})=>({id:'order-'+crypto.randomUUID(),facilityId:facility.id,ordernummer:'',uppdragstyp:'',planeradTill:'',status:'Planerat',notes:'',createdAt:new Date().toISOString(),...values});
 function completion(order,facility,drafts,reports){
  const issues=[];if(!facility)issues.push('Kundobjektet saknas.');
  if(!order.ordernummer?.trim())issues.push('Ordernummer saknas.');
  if(!order.uppdragstyp)issues.push('Välj SK, KV eller SB.');
  if(!facility?.namn||!facility?.anlNr)issues.push('Anläggningsnamn eller anläggningsnummer saknas.');
  const attached=reports.filter(r=>r.workOrderId===order.id);
  const pending=drafts.filter(d=>d.facility?.workOrderId===order.id);
  if(!attached.length)issues.push('Inget arkiverat protokoll är kopplat till arbetsordern.');
  for(const d of pending){const checks=Object.values(d.state?.checks||{});const missing=checks.filter(c=>c.status==null||c.status==='').length;issues.push(missing?`${d.proto}: ${missing} obesvarade kontrollpunkter i utkastet.`:`${d.proto}: utkastet är inte arkiverat.`);}
  for(const r of attached){if(!r.technician)issues.push(`${r.proto}: tekniker saknas i det arkiverade protokollet.`);if(r.unanswered>0)issues.push(`${r.proto}: ${r.unanswered} obesvarade kontrollpunkter.`);}
  return [...new Set(issues)];
 }
 function migrate(facilities,orders){const next=orders.slice();for(const f of facilities){if(!(f.ordernummer||f.uppdragstyp||f.planeradTill))continue;const id='legacy-order-'+f.id;if(!next.some(o=>o.id===id))next.push(make(f,{id,ordernummer:f.ordernummer||'',uppdragstyp:f.uppdragstyp||'',planeradTill:f.planeradTill||''}));}return next;}
 function prepareImport(rows,mapping,existing,orders,decisions=[]){
  let facilities=existing.map(o=>({...o})),workorders=orders.map(o=>({...o}));const review=[],seenOrders=new Set();
  rows.forEach((source,index)=>{const decision=decisions[index]||{};if(decision.action==='skip'){review.push({index,action:'Hoppas över',changes:[]});return;}
   try{const row=source.slice();if(decision.action==='new'){if(!decision.number?.trim())throw Error('Ange ett nytt unikt objektnummer.');const col=mapping.indexOf('anlNr');if(col<0)throw Error('Koppla objektnummer först.');if(facilities.some(f=>String(f.anlNr).toLowerCase()===decision.number.trim().toLowerCase()))throw Error('Det nya objektnumret används redan.');row[col]=decision.number.trim();}
    const entry=window.objectLists.plan([row],mapping,facilities)[0],old=facilities.find(f=>f.id===entry.item.id);const raw={};mapping.forEach((key,i)=>{if(key&&row[i]?.trim())raw[key]=row[i].trim();});
    const changes=[];for(const [key,label]of window.objectLists.fields){if(['ordernummer','uppdragstyp','planeradTill'].includes(key))continue;if(String(old?.[key]||'')!==String(entry.item[key]||''))changes.push({label,before:old?.[key]||'',after:entry.item[key]||''});}
    let master={...entry.item};delete master.ordernummer;delete master.uppdragstyp;delete master.planeradTill;
    facilities=window.objectLists.merge(facilities,[{item:master}]);master=facilities.find(f=>f.anlNr===master.anlNr);
    let job=null;if(raw.ordernummer){const pair=master.id+'|'+raw.ordernummer;if(seenOrders.has(pair))throw Error('Samma ordernummer förekommer flera gånger för objektet.');seenOrders.add(pair);job=workorders.find(o=>o.facilityId===master.id&&o.ordernummer===raw.ordernummer);const patch={ordernummer:raw.ordernummer};if(raw.uppdragstyp)patch.uppdragstyp=entry.item.uppdragstyp;if(raw.planeradTill)patch.planeradTill=entry.item.planeradTill;for(const [key,label]of [['ordernummer','Ordernummer'],['uppdragstyp','Ordertyp'],['planeradTill','Planerad till']])if(patch[key]!==undefined&&patch[key]!==job?.[key])changes.push({label,before:job?.[key]||'',after:patch[key]});if(job){job={...job,...patch};workorders=workorders.map(o=>o.id===job.id?job:o);}else{job=make(master,patch);workorders.push(job);}}
    else if(raw.uppdragstyp||raw.planeradTill)throw Error('Ordernummer krävs när typ eller planeringsdatum anges.');
    review.push({index,action:old?'Uppdatera':'Nytt objekt',item:master,job,changes});
   }catch(error){throw Error(`Rad ${index+2}: ${error.message.replace(/^Rad 2: /,'')}`);}
  });return {facilities,workorders,review};
 }
 window.orderData={statuses,today,make,completion,migrate,prepareImport};
})();
