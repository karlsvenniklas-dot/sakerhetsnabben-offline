(() => {
'use strict';
const core=window.drawingAIData,el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn)=>{const b=el('button',text);b.type='button';b.className='secondary';b.onclick=fn;return b;};
let connection={endpoint:window.drawingAIConfig?.endpoint||'',token:''};
function field(parent,label,value='',type='text'){const l=el('label',label),n=el(type==='select'?'select':'input');if(type!=='select')n.type=type;n.value=value;l.append(n);parent.append(l);return n;}
function mount(ctx){
 const {drawings,canvas,stage,facility,db,getDocument,getPage,getDevices}=ctx;
 const panel=el('details');panel.className='settings-card drawing-ai';panel.append(el('summary','AI · Analysera ritning'));
 const notice=el('p',connection.endpoint?'AI-förslag måste granskas. Endast den visade sidan skickas till analystjänsten och OpenAI. Analysen kräver internet; sparade markeringar fungerar offline.':'AI-analys är förberedd men inte ansluten. Anslut en analystjänst nedan för att aktivera knappen. Ingen ritning skickas innan du startar analysen.');
 const settings=el('details');settings.append(el('summary','Anslut analystjänst'));const endpoint=field(settings,'Analystjänstens HTTPS-adress',connection.endpoint,'url'),token=field(settings,'Åtkomstkod till analystjänsten (inte OpenAI-nyckeln)','','password');token.autocomplete='off';token.value=connection.token;settings.append(el('p','Adressen och åtkomstkoden används bara under denna öppning av appen. OpenAI-nyckeln ska finnas på servern.'));
 const status=el('p');status.setAttribute('role','status');const review=el('div'),layer=el('div');layer.className='drawing-overlay ai-overlay';stage.append(layer);
 let rows=[],selected=null,snapshot=null,source=null,controller=null,disposed=false;
 const consentLabel=el('label'),consent=el('input');consent.type='checkbox';consentLabel.append(consent,document.createTextNode('Skicka den visade ritningssidan till analystjänsten och OpenAI för analys.'));
 const analyze=button('Analysera ritning',run),cancel=button('Avbryt analys',()=>controller?.abort());cancel.hidden=true;
 const add=button('Lägg till missad detektor',()=>{if(!source){status.textContent='Analysera sidan först.';return;}selected='new';status.textContent='Tryck på den missade detektorn på ritningen.';});add.hidden=true;
 const save=button('Spara granskade markeringar',commit);save.hidden=true;
 panel.append(notice,settings,consentLabel,analyze,cancel,status,add,review,save);drawings.insertBefore(panel,drawings.querySelector('.drawing-scroll'));
 function ready(){analyze.disabled=!endpoint.value.trim()||!token.value.trim()||!consent.checked||stage.hidden||!!controller;}
 endpoint.oninput=ready;token.oninput=ready;consent.onchange=ready;ready();
 function current(){return source&&source.doc===getDocument()&&source.page===getPage();}
 function clear(){ctx.reviewing(false);rows=[];source=null;snapshot=null;selected=null;review.replaceChildren();layer.replaceChildren();save.hidden=true;add.hidden=true;}
 function paint(){layer.replaceChildren();if(!current())return;rows.forEach((r,i)=>{const b=button(String(i+1),e=>{e.stopPropagation();review.children[i]?.scrollIntoView({block:'center'});});b.className='drawing-pin ai-pin'+(r.approved?' reviewed':'');b.style.left=r.x*100+'%';b.style.top=r.y*100+'%';b.setAttribute('aria-label','AI-förslag '+(i+1)+(r.approved?' granskat':' behöver granskas'));layer.append(b);});}
 function render(){
  ctx.reviewing(true);review.replaceChildren();rows.forEach((r,i)=>{
   const card=el('article');card.className='job-card';card.append(el('h4','Förslag '+(i+1)),el('p','AI-bedömning: '+({low:'osäker',medium:'viss osäkerhet',high:'hög säkerhet'}[r.confidence])+' – kontrollera alltid symbol och uppgifter.'),el('p',r.reason));
   const link=field(card,'Koppla till befintlig detektor','','select');const fresh=el('option','Skapa ny detektor');fresh.value='';link.append(fresh);for(const d of getDevices()){const o=el('option',window.detectorData.label(d,facility.central)+' · '+d.placering);o.value=d.id;link.append(o);}link.value=r.existingId;
   const grid=el('div');grid.className='import-grid';const inputs=[];for(const [key,label]of window.detectorData.fields){const f=field(grid,label,r[key]||'');f.maxLength=300;inputs.push(f);f.disabled=!!r.existingId;f.oninput=()=>{r[key]=f.value;r.approved=false;approved.checked=false;paint();};}card.append(grid);
   const l=el('label'),approved=el('input');approved.type='checkbox';approved.checked=r.approved;l.append(approved,document.createTextNode('Jag har granskat position, typ och beteckning – ta med förslaget'));approved.onchange=()=>{r.approved=approved.checked;paint();};card.append(l);
   link.onchange=()=>{r.existingId=link.value;r.approved=false;approved.checked=false;inputs.forEach(n=>n.disabled=!!link.value);paint();};
   card.append(button('Flytta förslag '+(i+1),()=>{selected=r.id;status.textContent='Tryck på rätt symbolposition på ritningen.';}),button('Ta bort förslag '+(i+1),()=>{rows=rows.filter(x=>x!==r);render();}));review.append(card);
  });save.hidden=!rows.length;add.hidden=!source;paint();
 }
 async function run(){
  if(controller)return;
  try{
   if(stage.hidden||!getDocument())throw Error('Välj en ritning och vänta tills sidan visas.');
   if(!navigator.onLine)throw Error('Analysen kräver internet. Sparad provning fungerar fortfarande offline.');
   if(!consent.checked)throw Error('Bekräfta att sidan får skickas för analys.');
   const url=new URL(endpoint.value.trim());if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Ange en HTTPS-adress utan lösenord eller frågeparametrar.');
   if(!token.value.trim())throw Error('Ange åtkomstkod till analystjänsten.');
   if(rows.length&&!confirm('Ersätta osparade analysförslag med en ny analys?'))return;
   clear();source={doc:getDocument(),page:getPage()};const requestedSource=source;controller=new AbortController();ready();const image=canvas.toDataURL('image/jpeg',.92);snapshot=await db.snapshot();if(disposed||source!==requestedSource||controller.signal.aborted)return;connection={endpoint:url.href,token:token.value.trim()};
   // Capture only the rendered source canvas. Overlay markers are not sent.
   if(image.length>6*1024*1024-1024)throw Error('Sidan är för stor för analys.');
   cancel.hidden=false;ready();status.textContent='Analyserar sidan … Inga detektorer eller provningar har sparats.';
   const timeout=setTimeout(()=>controller?.abort(),105000);
   let response;try{response=await fetch(url.href,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+connection.token},body:JSON.stringify({image}),signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});}finally{clearTimeout(timeout);}
   if(disposed||!current())return;
   const text=await response.text();if(text.length>500000)throw Error('Analyssvaret är för stort.');let body;try{body=JSON.parse(text);}catch{throw Error('Analystjänsten gav ett ogiltigt svar.');}if(!response.ok)throw Error(typeof body.error==='string'?body.error.slice(0,400):'Analysen misslyckades.');
   const result=core.validate(body);rows=result.candidates;status.textContent=(rows.length?rows.length+' förslag att granska.':'Inga säkra förslag hittades. Du kan lägga till markeringar manuellt.')+' '+result.warnings.join(' ')+' AI kan missa detektorer; kontrollera hela sidan.';render();
  }catch(e){if(!disposed){status.textContent=e.name==='AbortError'?'Analysen avbröts. Inga förslag sparades.':e.message;}}finally{controller=null;cancel.hidden=true;ready();}
 }
 async function commit(){
  save.disabled=true;try{
   if(!current()||!snapshot)throw Error('Ritningssidan har ändrats. Analysera rätt sida igen.');
   const changes=core.writes(snapshot,facility.id,source.doc,source.page,rows,facility.central,window.detectorData);
   ctx.beforeSave();await db.commitRecords(snapshot,changes);const n=rows.filter(r=>r.approved).length;clear();ctx.saved(n+' granskade markeringar sparades. Ingen detektor har markerats som provad.');
  }catch(e){status.textContent=e.message+' Vid ändrade uppgifter: analysera sidan igen.';ctx.afterError();}finally{save.disabled=false;}
 }
 return {
  drawChanged(){controller?.abort();if(rows.length)status.textContent='Ritningen ändrades. Osparade förslag har tagits bort.';clear();ready();},
  drawn(){ready();},
  place(event){if(!selected||!current())return false;const rect=stage.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;if(selected==='new'){rows.push({id:crypto.randomUUID(),x,y,confidence:'low',reason:'Tillagd manuellt vid granskning.',approved:false,existingId:'',central:'',slinga:'',sektion:'',adress:'',lokalId:'',typ:'',placering:''});}else{const row=rows.find(r=>r.id===selected);if(row){row.x=x;row.y=y;row.approved=false;}}selected=null;render();status.textContent='Positionen ändrad. Granska och välj förslaget innan du sparar.';return true;},
  dispose(){ctx.reviewing(false);disposed=true;controller?.abort();layer.remove();}
 };
}
window.drawingAI={mount};
})();
