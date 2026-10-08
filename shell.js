(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const frame=$('workspace');
  let facilities=[],drafts=[],pending=null,engineReady=false,registration,cacheReady=false,toastTimer,refreshTimer;
  const files=['./','./index.html','./workspace.html','./engine.js','./engine.css','./workspace.css','./storage.js','./objects.js','./orders.js','./detectors.js','./detectors-ui.js','./orders-ui.js','./import-ui.js','./shell.js','./shell.css','./manifest.webmanifest','./icon-192.png','./icon-512.png','./service-core.js','./service-ui.js','./service.css','./pdf-lib.min.js','./field-core.js','./field-ui.js','./field.css','./pdf.min.mjs','./pdf.worker.min.mjs'];
  const cacheName='sn-offline-shell-v11';
  let offlineError='',installing=false;
  function showOfflineError(message){offlineError=message;$('offline-error').hidden=false;$('offline-error').style.overflowWrap='anywhere';$('offline-error').textContent=`Orsak: ${message}`;}
  async function workerVersion(){
    if(!navigator.serviceWorker?.controller)return null;
    return new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(null);},2000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data?.cache);};navigator.serviceWorker.controller.postMessage({type:'OFFLINE_VERSION'},[channel.port2]);});
  }
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
  function navigate(page){
    for(const id of ['home','work','settings']) $(id).hidden=id!==page;
    if(page!=='work'&&engineReady)frame.contentWindow.postMessage({type:'offline-navigate',target:'PAUSE'},location.origin);
    for(const button of document.querySelectorAll('[data-nav]')){if(button.dataset.nav===page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
    if(page==='home')refresh();if(page==='settings')updateStorage();window.scrollTo(0,0);
  }
  function send(){if(engineReady&&pending){frame.contentWindow.postMessage({type:'offline-navigate',...pending},location.origin);pending=null;}else if(pending){frame.contentWindow.postMessage({type:'offline-navigate',target:'PING'},location.origin);}}
  function openWork(target,extra={}){navigate('work');$('work-title').textContent=target==='SNABB'?'Snabbprotokoll':target==='UPPFOLJ'?'Uppföljning':'Objekt & protokoll';pending={target,...extra};send();for(const button of document.querySelectorAll('[data-nav]'))if(button.dataset.nav===(target==='SNABB'?'protocols':'objects'))button.setAttribute('aria-current','page');}
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(event.data?.type==='service-card'){navigate('home');window.dispatchEvent(new CustomEvent('show-customer',{detail:{id:event.data.id}}));}if(event.data?.type==='engine-ready'){engineReady=true;send();}
  });
  function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  function empty(container,title,text,action){container.replaceChildren();const box=element('div',undefined,'empty');box.append(element('strong',title),element('p',text));if(action){const b=element('button',action.label,'secondary');b.onclick=action.run;box.append(b);}container.append(box);}
  function renderObjects(){
    const q=$('search').value.trim().toLocaleLowerCase('sv');
    const rows=facilities.filter(item=>[item.namn,item.adress,item.central,item.qr,item.anlNr,item.ordernummer,item.uppdragstyp,item.planeradTill].join(' ').toLocaleLowerCase('sv').includes(q));
    rows.sort((a,b)=>String(a[$('object-sort').value]||'').localeCompare(String(b[$('object-sort').value]||''),'sv',{numeric:true}));
    $('objects').replaceChildren();
    if(!rows.length){empty($('objects'),q?'Inga träffar':'Här börjar din objektlista',q?'Prova ett annat namn, en adress eller en modell.':'Skapa ditt första objekt eller importera en säkerhetskopia från den tidigare versionen.',q?null:{label:'Lägg till objekt',run:()=>openWork('NEW_OBJECT')});return;}
    for(const item of rows){const b=element('button',undefined,'object-row');b.type='button';const info=element('span',undefined,'object-info');info.append(element('strong',item.namn||'Namnlöst objekt'),element('small',[item.ordernummer,item.uppdragstyp,item.anlNr,item.adress,item.central,item.planeradTill].filter(Boolean).join(' · ')||'Öppna objekt och protokoll'));b.append(element('span','▤','object-icon'),info,element('span','›','chevron'));b.onclick=()=>window.dispatchEvent(new CustomEvent('show-customer',{detail:{id:item.id}}));$('objects').append(b);}
  }
  async function refresh(){
    try{
      const data=await window.localData.snapshot();
      facilities=JSON.parse(data.facilities||'[]');const history=JSON.parse(data['history-index']||'[]');
      drafts=Object.entries(data).filter(([key])=>key.startsWith('draft:')).map(([key,value])=>({key,...JSON.parse(value)})).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
      $('object-count').textContent=facilities.length;$('draft-count').textContent=drafts.length;$('report-count').textContent=history.length;renderObjects();$('drafts').replaceChildren();
      if(!drafts.length)empty($('drafts'),'Inga pågående utkast','När du börjar fylla i ett protokoll sparas det här automatiskt.');
      for(const draft of drafts.slice(0,5)){const proto=draft.key.split(':').at(-1);const b=element('button',undefined,'object-row');const info=element('span',undefined,'object-info');info.append(element('strong',draft.facility?.namn||'Snabbprotokoll'),element('small',`${proto} · ${new Date(draft.savedAt).toLocaleString('sv-SE',{dateStyle:'short',timeStyle:'short'})}`));b.append(element('span','☑','object-icon'),info,element('span','›','chevron'));b.onclick=()=>openWork('DRAFT',{id:draft.facility?.id,proto,order:draft.facility?.workOrderId?{id:draft.facility.workOrderId,ordernummer:draft.facility.ordernummer,uppdragstyp:draft.facility.uppdragstyp,planeradTill:draft.facility.planeradTill}:null});$('drafts').append(b);}
    }catch(error){$('save-error').hidden=false;$('save-error').textContent='Lokala uppgifter kunde inte läsas. Importera inte över dem innan du har sparat en säkerhetskopia.';}
  }
  window.addEventListener('local-storage-state',event=>{
    const state=event.detail;
    if(state.state==='error'){$('save-error').hidden=false;$('save-error').textContent=state.message;$('save-state').textContent='Kunde inte spara';}
    else if(state.state==='saving')$('save-state').textContent='Sparar…';
    else if(state.state==='saved'){$('save-state').textContent='Sparat på telefonen';clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,200);}
  });
  function download(name,content){const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  async function backup(){try{const data=await window.localData.exportBackup();download(`SakerhetSnabben_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2));try{localStorage.setItem('offline-backup-export',data.exportedAt);}catch{}updateBackupDate();window.dispatchEvent(new Event('backup-exported'));toast('Säkerhetskopian är exporterad. Kontrollera att filen sparades i Filer.');}catch{toast('Kunde inte skapa säkerhetskopian. Ingenting har raderats.');}}
  function updateBackupDate(){let date;try{date=localStorage.getItem('offline-backup-export');}catch{}$('backup-date').textContent=date?`Senast exporterad: ${new Date(date).toLocaleString('sv-SE')}. Kontrollera att filen finns kvar.`:'Ingen säkerhetskopia exporterad på den här enheten ännu.';}
  async function updateStorage(){try{const estimate=await navigator.storage?.estimate?.();$('storage-usage').textContent=estimate?`Appens webbplats använder cirka ${((estimate.usage||0)/1048576).toFixed(1)} MB, inklusive offlinefiler. Tillgänglig kvot: cirka ${((estimate.quota||0)/1048576).toFixed(0)} MB.`:'Telefonen visar inte lagringsutrymme för den här appen.';if(await navigator.storage?.persisted?.())$('persist-state').textContent='Beständig lagring är beviljad. Fortsätt ändå att ta säkerhetskopior.';}catch{$('storage-usage').textContent='Lagringsuppgifter är inte tillgängliga.';}}
  async function verifyCache(){
    let count=0;
    try{const cache=await caches.open(cacheName);const present=await Promise.all(files.map(file=>cache.match(new URL(file,location.href).href)));count=present.filter(Boolean).length;cacheReady=present.every(Boolean)&&(await workerVersion())===cacheName;}catch{cacheReady=false;}
    $('connection').dataset.ready=String(cacheReady);
    $('connection').textContent=cacheReady?(navigator.onLine?'Offline redo':'Offline · redo'):'Offline ej redo';
    $('offline-state').textContent=cacheReady?'Offline redo':'Inte verifierad';
    $('offline-description').textContent=cacheReady?'Appens filer finns sparade på den här enheten. Prova att stänga och öppna appen i flygplansläge innan första uppdraget.':'Appen behöver öppnas med internet tills alla filer har sparats. Om detta kvarstår kan inloggningen eller webbläsaren hindra offlineinstallationen.';
    $('offline-progress').textContent=`${count} av ${files.length} filer sparade · Version 1.7 · ${navigator.serviceWorker?.controller?'Offlinefunktion aktiv':'Offlinefunktion inte aktiv'}`;
    if(cacheReady){offlineError='';$('offline-error').hidden=true;}
  }
  async function initOffline(){
    if(installing)return;installing=true;$('retry-offline').disabled=true;
    offlineError='';$('offline-error').hidden=true;
    try{
      if(!window.isSecureContext)throw new Error('HTTPS_KRÄVS: Öppna den säkra app-länken direkt i Safari.');
      if(!('serviceWorker'in navigator))throw new Error('WEBBLÄSAREN_STÖDS_INTE: Öppna länken i Safari, utanför ChatGPT-appen.');
      if(!navigator.onLine)throw new Error('INGET_NÄT: Slå på internet under installationen.');
      $('offline-description').textContent='Kontrollerar installationsfilen…';
      const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),15000);let response;
      try{response=await fetch('./sw.js',{cache:'no-store',credentials:'same-origin',signal:abort.signal});}finally{clearTimeout(timeout);}
      if(!response.ok)throw new Error(`INSTALLATIONSFIL_HTTP_${response.status}: Kontrollera att GitHub Pages är publicerad och öppna länken direkt i Safari.`);
      if(!/javascript/.test(response.headers.get('content-type')||''))throw new Error('INSTALLATIONSFIL_FEL_FORMAT: Värdtjänsten skickar inte installationsfilen som JavaScript.');
      registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      const watch=worker=>{if(!worker)return;worker.addEventListener('statechange',()=>{verifyCache();if(registration.waiting)$('apply-update').hidden=false;if(worker.state==='redundant'&&!offlineError)showOfflineError('INSTALLATION_AVBRUTEN: En offlinefil gick inte att spara. Tryck på Försök installera igen.');});};
      watch(registration.installing);registration.addEventListener('updatefound',()=>watch(registration.installing));
      if(registration.waiting){$('apply-update').hidden=false;showOfflineError('UPPDATERING_VÄNTAR: Tryck på Aktivera uppdatering.');}
      await verifyCache();
      let timer;try{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('INSTALLATION_TIMEOUT: Offlinefunktionen blev inte aktiv. Se eventuell felkod nedan och försök igen.')),30000);})]);}finally{clearTimeout(timer);}
      await verifyCache();
    }catch(error){if(!offlineError)showOfflineError(`${error.name||'Fel'}: ${error.message||'Okänd installationsorsak'}`);await verifyCache();toast('Offlineinstallationen är inte klar. Orsaken visas under Offline & backup.');}
    finally{installing=false;$('retry-offline').disabled=false;}
  }
  navigator.serviceWorker?.addEventListener('controllerchange',verifyCache);
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='OFFLINE_INSTALL_ERROR'){showOfflineError(event.data.message);verifyCache();}});
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{const target=b.dataset.nav;if(target==='objects')openWork('OBJEKT');else if(target==='protocols')openWork('SNABB');else navigate(target);});
  $('connection').onclick=()=>navigate('settings');$('choose-object').onclick=()=>openWork('OBJEKT');$('manage-objects').onclick=()=>openWork('OBJEKT');$('quick-protocol').onclick=()=>openWork('SNABB');$('back-home').onclick=()=>navigate('home');document.querySelector('.brand').onclick=event=>{event.preventDefault();navigate('home');};$('search').oninput=renderObjects;$('object-sort').onchange=renderObjects;window.addEventListener('objects-imported',()=>{engineReady=false;frame.src='./workspace.html';refresh();});
  $('home-backup').onclick=backup;$('export-backup').onclick=backup;$('import-backup').onclick=()=>$('backup-file').click();
  $('backup-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>150*1048576)throw new Error('Filen är för stor för säker import på telefonen.');const data=JSON.parse(await file.text());if(!confirm('Importera säkerhetskopian? Poster med samma ID ersätts. Spara först en säkerhetskopia av nuvarande data.'))return;const count=await window.localData.restore(data);engineReady=false;frame.src='./workspace.html';await refresh();window.dispatchEvent(new Event('objects-imported'));toast(`${count} poster importerade.`);}catch(error){toast(error.message||'Importen misslyckades.');}finally{event.target.value='';}};
  $('persist').onclick=async()=>{try{const granted=await navigator.storage?.persist?.();$('persist-state').textContent=granted?'Beständig lagring är beviljad. Ta fortfarande säkerhetskopior.':'Telefonen beviljade inte beständig lagring. Spara regelbundet en säkerhetskopia till Filer.';}catch{toast('Begäran stöds inte här. Ta regelbundna säkerhetskopior.');}};
  $('retry-offline').onclick=initOffline;
  $('check-update').onclick=async()=>{if(!registration||!registration.active){await initOffline();return;}try{await registration.update();await verifyCache();toast(registration.waiting?'En uppdatering är redo.':'Kontrollen är klar.');if(registration.waiting)$('apply-update').hidden=false;}catch(error){showOfflineError(error.message||'Kunde inte kontrollera uppdatering.');toast('Ingen kontakt. Prova igen med internet.');}};
  $('apply-update').onclick=()=>{if(!confirm('Aktivera uppdateringen och ladda om appen? Kontrollera att protokollet visar Sparat på telefonen.'))return;const worker=registration?.waiting;if(worker){navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});worker.postMessage({type:'ACTIVATE'});}};
  window.addEventListener('online',verifyCache);window.addEventListener('offline',verifyCache);
  $('today').textContent=new Date().toLocaleDateString('sv-SE',{weekday:'long',day:'numeric',month:'long'}).toLocaleUpperCase('sv');
  updateBackupDate();window.localReady.then(refresh).catch(()=>{});initOffline();
  window.addEventListener('open-order',event=>openWork('ORDER',event.detail));window.addEventListener('open-customer',event=>openWork('OBJECT',event.detail));window.addEventListener('open-report',event=>openWork('REPORT',event.detail));
  const tools=document.modelContext;
  if(tools?.registerTool){const abort=new AbortController();window.addEventListener('pagehide',()=>abort.abort(),{once:true});try{Promise.resolve(tools.registerTool({name:'read_local_work_summary',title:'Läs lokal arbetsöversikt',description:'Läser antal lokala objekt, utkast och protokoll utan att ändra uppgifter.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Inga argument tillåtna');const data=await window.localData.snapshot();return{objects:JSON.parse(data.facilities||'[]').length,drafts:Object.keys(data).filter(k=>k.startsWith('draft:')).length,reports:JSON.parse(data['history-index']||'[]').length};}},{signal:abort.signal})).catch(()=>{});}catch{}}
})();
