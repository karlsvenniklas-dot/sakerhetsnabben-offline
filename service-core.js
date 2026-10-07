/* Shared device-local service records. No network requests. */
(() => {
 'use strict';
 const states=['Öppen','Åtgärdad','Kontrollerad'];
 const stamp=()=>new Date().toISOString();
 const missing=f=>[['anlNr','Objektnummer'],['adress','Adress'],['central','Centralapparat'],['larmsandare','Larmsändare'],['kontakt','Kontaktperson'],['tele','Kontakttelefon'],['skotare1','Anläggningsskötare 1'],['skotare2','Anläggningsskötare 2']].filter(([k])=>!String(f[k]||'').trim()).map(([,label])=>label);
 async function syncIssues(id){
  const data=await window.localData.snapshot(),sources=[];
  const register=JSON.parse(data['detectors:'+id]||'{"events":[]}');
  for(const e of register.events||[])if(e.kind==='test'&&e.status==='Provad – anmärkning')sources.push({sourceId:'det:'+e.id,group:'det:'+e.deviceId+':'+e.generation,title:e.label||window.detectorData.label(e.device,''),note:e.note||'',photo:e.photo||'',date:e.date,technician:e.technician||''});
  for(const meta of JSON.parse(data['history-index']||'[]').filter(r=>r.facilityId===id))for(const [index,a]of (meta.anms||[]).entries())sources.push({sourceId:'report:'+meta.id+':'+index,group:'report:'+meta.id+':'+index,title:meta.proto+' · '+(a.pos||'Anmärkning'),note:a.text||a.anm||'',date:meta.datum||'',technician:meta.technician||''});
  const existing=JSON.parse(data['issues:'+id]||'[]');
  if(!sources.some(s=>!existing.some(i=>i.sources?.includes(s.sourceId))))return existing;
  return window.localData.updateRecord('issues:'+id,[],items=>{
   for(const s of sources.sort((a,b)=>a.date.localeCompare(b.date))){if(items.some(i=>i.sources?.includes(s.sourceId)))continue;
    const old=items.find(i=>i.group===s.group&&i.status!=='Kontrollerad');
    if(old){old.sources.push(s.sourceId);old.timeline.push({at:stamp(),status:old.status,note:'Ny registrering: '+s.note,technician:s.technician});}
    else items.push({id:crypto.randomUUID(),group:s.group,sources:[s.sourceId],title:s.title,note:s.note,photo:s.photo||'',status:'Öppen',createdAt:stamp(),timeline:[{at:stamp(),status:'Öppen',note:s.note,technician:s.technician}]});
   }return items;
  });
 }
 function transition(issue,next,note,technician){
  if(!states.includes(next)||!states.includes(issue.status))throw Error('Ogiltig status.');
  if(next===issue.status)throw Error('Välj en annan status.');
  if(next==='Kontrollerad'&&issue.status!=='Åtgärdad')throw Error('Markera först felet som åtgärdat.');
  if(!note.trim()||!technician.trim())throw Error('Ange tekniker och beskriv åtgärden eller kontrollen.');
  return {...issue,status:next,timeline:[...issue.timeline,{at:stamp(),status:next,note:note.trim(),technician:technician.trim()}]};
 }
 function duplicates(item,facilities){const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');return facilities.filter(f=>f.anlNr!==item.anlNr&&((clean(item.namn)&&clean(f.namn)===clean(item.namn))||(clean(item.adress)&&clean(f.adress)===clean(item.adress))));}
 async function pdf(report){
  const {PDFDocument,StandardFonts,rgb}=window.PDFLib,doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  let page,y;const margin=44,width=507;
  const clean=value=>Array.from(String(value??'')).map(c=>{if(c==='\n'||c==='\r')return c;try{font.encodeText(c);return c;}catch{return '-';}}).join('');
  function addPage(){page=doc.addPage([595,842]);y=794;page.drawText('SäkerhetSnabben · Servicerapport',{x:margin,y,size:10,font:bold,color:rgb(.06,.27,.3)});y-=26;}
  function line(text,{size=10,strong=false}={}){const f=strong?bold:font;for(const paragraph of clean(text).split(/\r?\n/)){let row='';const chunks=paragraph.split(/\s+/);for(const chunk of chunks){for(const part of chunk.match(/.{1,65}/g)||['']){if(row&&f.widthOfTextAtSize(row+' '+part,size)>width){draw(row);row=part;}else row+=(row?' ':'')+part;}}draw(row);}function draw(s){if(y<65)addPage();page.drawText(s,{x:margin,y,size,font:f,color:rgb(.08,.13,.17)});y-=size+5;}}
  function heading(text){y-=10;line(text,{size:13,strong:true});}
  async function photo(data,caption){if(!data)return;try{let image;if(data.startsWith('data:image/png;'))image=await doc.embedPng(data);else if(data.startsWith('data:image/jpeg;'))image=await doc.embedJpg(data);else if(data.startsWith('data:image/webp;')){const img=new Image();img.src=data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);image=await doc.embedJpg(canvas.toDataURL('image/jpeg',.85));}else return;const size=image.scaleToFit(width,230);if(y-size.height<65)addPage();page.drawImage(image,{x:margin,y:y-size.height,width:size.width,height:size.height});y-=size.height+12;if(caption)line(caption);}catch{line('Bilden kunde inte läsas: '+(caption||''));}}
  addPage();line(report.facility.namn,{size:18,strong:true});line('Objektnummer: '+(report.facility.anlNr||'Ej angivet'));line('Adress: '+(report.facility.adress||'Ej angivet'));line('Datum: '+report.date+' · Tekniker: '+report.technician);line('Arbetsorder: '+(report.orderNumber||'Utan arbetsorder'));
  heading('Utfört arbete');line(report.summary);
  heading('Anläggningsuppgifter');for(const [key,label]of window.objectLists.fields.filter(([k])=>!['namn','anlNr','adress','ordernummer','uppdragstyp','planeradTill'].includes(k)))if(report.facility[key])line(label+': '+report.facility[key]);
  heading('Detektorprovning');if(!report.tests.length)line('Ingen registrerad detektorprovning för detta datum och urval.');
  for(const e of report.tests){line(e.label+' · '+e.status,{strong:true});line([e.device?.typ,e.device?.placering,e.technician].filter(Boolean).join(' · '));if(e.note)line(e.note);await photo(e.photo,'Foto från provningen');}
  heading('Fel och åtgärder – status vid rapportens skapande');if(!report.issues.length)line('Inga registrerade fel i objektets felregister.');for(const issue of report.issues){line(issue.title+' · '+issue.status,{strong:true});line(issue.note);for(const t of issue.timeline||[])line(t.at.slice(0,10)+' · '+t.status+' · '+t.technician+': '+t.note);await photo(issue.photo,'Felbild');}
  if(report.photos.length){heading('Bilder från objektet');for(const p of report.photos)await photo(p.data,p.description||p.name);}
  heading('Dokument på objektet');for(const d of report.documents)line(d.namn+(d.description?' – '+d.description:''));if(!report.documents.length)line('Inga lokala dokument registrerade.');
  y-=10;line('Rapporten sammanställer registrerat arbete. Separata kontrollprotokoll och bifogade ritningar ingår inte som fullständiga dokument.');
  const pages=doc.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:500,y:25,size:9,font}));return new Blob([await doc.save()],{type:'application/pdf'});
 }
 window.serviceData={states,missing,syncIssues,transition,duplicates,pdf};
})();
