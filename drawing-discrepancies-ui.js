/* Offline field UI for differences between the drawing and observed installation. */
(() => {
 'use strict';
 function mount(ctx){
  const core=window.drawingDiscrepancies, el=(tag,text,cls)=>{
   const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;
  };
  const btn=(text,fn,cls='secondary')=>{
   const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;
  };
  const field=(parent,text,input)=>{
   const label=el('label',text);label.append(input);parent.append(label);return input;
  };
  const options=(parent,text,values,value)=>{
   const s=el('select');
   for(const [v,label] of values){const opt=el('option',label);opt.value=v;s.append(opt);}
   if(value!==undefined)s.value=value;
   field(parent,text,s);return s;
  };
  const input=(parent,text,type='text',value='')=>{
   const n=el(type==='textarea'?'textarea':'input');if(type==='textarea')n.rows=3;else n.type=type;
   n.value=value;field(parent,text,n);return n;
  };
  const entries=core.validateMany(ctx.state.deviations||[]);
  const details=el('details',undefined,'settings-card drawing-discrepancies');
  details.dataset.panel='deviations';details.open=!!ctx.open;
  details.append(el('summary','2a · Avvikelser mellan ritning och verklighet'));
  details.append(el('p','Registrera det som skiljer ritningen från anläggningen. Detta ändrar inte detektorregistret och räknas inte som provning. Avvikelser sparas lokalt på objektet.'));
  const summary=el('p',undefined,'dq-detail'),feedback=el('p');
  feedback.setAttribute('role','status');details.append(summary,feedback);
  const form=el('form',undefined,'import-grid');
  const type=options(form,'Typ av avvikelse',[['','Välj avvikelse'],...core.TYPES.map(t=>[t,t])],'');
  type.required=true;
  const device=options(form,'Detektor (valfri)',[['','Ingen vald / finns inte i registret'],
    ...ctx.register.devices.map(d=>[d.id,window.detectorData.label(d,ctx.facility.central)+' · '+(d.placering||'')])]);
  const order=options(form,'Arbetsorder (valfri)',[['','Utan arbetsorder'],...ctx.orders.map(o=>[o.id,o.ordernummer||'Order'])],
    ctx.orderSelect.value||'');
  const technician=input(form,'Tekniker','text',ctx.technician.value||'');
  technician.required=true;
  const description=input(form,'Vad skiljer sig från ritningen?','textarea');
  description.required=true;
  const actions=el('div',undefined,'button-row'),
   savePlain=el('button','Spara avvikelse utan ritningsmarkering','primary');
  savePlain.type='submit';
  let placing=false;
  const mark=btn('Markera plats på ritningen',()=>{
   try{
    if(!ctx.getDocument()||ctx.stage.hidden)throw Error('Välj och öppna en ritning innan du markerar.');
    if(!type.value||!description.value.trim()||!technician.value.trim())
      throw Error('Ange avvikelsetyp, tekniker och beskrivning först.');
    placing=true;mark.textContent='Markering aktiv: tryck på ritningen';
    feedback.textContent='Tryck på positionen på den aktuella ritningssidan. Tryck Avbryt för att lämna markeringsläget.';
    ctx.scroller.scrollIntoView({block:'center'});
   }catch(e){feedback.textContent=e.message;}
  });
  const cancel=btn('Avbryt markering',()=>{
   placing=false;mark.textContent='Markera plats på ritningen';feedback.textContent='Markering avbruten.';
  });
  actions.append(savePlain,mark,cancel);form.append(actions);details.append(form);
  const count=core.stats(entries);
  summary.textContent=count.open+' öppna · '+count.actioned+' åtgärdade och väntar på kontroll · '+count.checked+' kontrollerade.';
  const toolbar=el('div',undefined,'button-row');
  const filter=options(toolbar,'Visa avvikelser',[['active','Öppna och åtgärdade'],['all','Alla'],['Öppen','Endast öppna'],['Åtgärdad','Väntar på kontroll'],['Kontrollerad','Kontrollerade']],'active');
  const filename=()=>{
   const id=String(ctx.facility.anlNr||ctx.facility.namn||'objekt').replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g,'_');
   return 'ritningsavvikelser_'+id;
  };
  function download(name,content,mime){
   const url=URL.createObjectURL(new Blob([content],{type:mime}));
   const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  toolbar.append(
   btn('Exportera avvikelser CSV',()=>{
    try{
     const rows=core.csv(entries,{
      facility:[ctx.facility.anlNr,ctx.facility.namn].filter(Boolean).join(' · '),
      deviceLabel:id=>ctx.register.devices.find(d=>d.id===id)?window.detectorData.label(ctx.register.devices.find(d=>d.id===id),ctx.facility.central):id,
      docLabel:id=>ctx.docs.find(d=>d.id===id)?.description||ctx.docs.find(d=>d.id===id)?.namn||id,
      orderLabel:id=>ctx.orders.find(o=>o.id===id)?.ordernummer||id
     });
     download(filename()+'.csv',rows,'text/csv;charset=utf-8');
    }catch(e){feedback.textContent=e.message;}
   }),
   btn('Exportera med full historik (JSON)',()=>{
    download(filename()+'.json',JSON.stringify({
     app:'SäkerhetSnabben ritningsavvikelser',version:1,exportedAt:new Date().toISOString(),
     facilityId:ctx.facility.id,facilityName:ctx.facility.namn,entries
    },null,2),'application/json');
   })
  );
  details.append(toolbar);
  const list=el('div',undefined,'drawing-discrepancies-list');details.append(list);
  function show(){
   list.replaceChildren();
   const shown=entries.filter(d=>filter.value==='all'||(filter.value==='active'?d.status!=='Kontrollerad':d.status===filter.value))
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
   if(!shown.length){list.append(el('p','Inga avvikelser i den valda kategorin.'));return;}
   for(const d of shown){
    const item=el('article',undefined,'job-card'),h=el('h4',d.type+' · '+d.status);
    item.id='deviation-'+d.id;
    const doc=ctx.docs.find(x=>x.id===d.docId),dev=ctx.register.devices.find(x=>x.id===d.deviceId);
    item.append(h,el('p',[dev?window.detectorData.label(dev,ctx.facility.central):d.deviceId||'Ingen vald detektor',
      doc?.description||doc?.namn||'Ingen ritning',d.page?'sida '+d.page:'',
      d.orderId?ctx.orders.find(x=>x.id===d.orderId)?.ordernummer||'Order saknas':''].filter(Boolean).join(' · ')),
      el('p',d.description),el('p','Rapporterad '+new Date(d.createdAt).toLocaleString('sv-SE')+' · '+d.reportedBy));
    if(d.docId&&ctx.docs.some(x=>x.id===d.docId))
     item.append(btn('Visa på ritningen',()=>{ctx.navigate(d.docId,d.page);ctx.drawings.open=true;ctx.scroller.scrollIntoView({block:'center'});}));
    const history=el('details');history.append(el('summary','Händelsehistorik ('+d.history.length+')'));
    for(const h of d.history)history.append(el('p',new Date(h.at).toLocaleString('sv-SE')+' · '+h.status+' · '+h.technician+' · '+h.note));
    item.append(history);
    const choices=core.transitions[d.status];
    if(choices.length){
     const changeForm=el('form',undefined,'import-grid'),
      next=options(changeForm,'Nästa status',choices.map(s=>[s,s])),
      tech=input(changeForm,'Ansvarig tekniker','text',ctx.technician.value||d.reportedBy),
      note=input(changeForm,'Åtgärd, kontroll eller skäl till återöppning','textarea'),
      submit=el('button','Spara statusändring','primary');
     tech.required=true;note.required=true;changeForm.append(submit);
     changeForm.onsubmit=async event=>{
      event.preventDefault();submit.disabled=true;
      try{
       await ctx.saveField(s=>{
        const row=(s.deviations||[]).findIndex(x=>x.id===d.id);
        if(row<0)throw Error('Avvikelsen har ändrats, öppna objektet igen.');
        s.deviations[row]=core.change(s.deviations[row],next.value,{technician:tech.value,note:note.value});
       });
      }catch(e){feedback.textContent=e.message;submit.disabled=false;}
     };
     item.append(changeForm);
    }
    list.append(item);
   }
  }
  filter.onchange=show;
  form.onsubmit=async event=>{
   event.preventDefault();savePlain.disabled=true;
   try{await create(null);}catch(e){feedback.textContent=e.message;savePlain.disabled=false;}
  };
  async function create(position){
   const record=core.make({
    type:type.value,deviceId:device.value,orderId:order.value,reportedBy:technician.value,
    description:description.value,docId:ctx.getDocument(),page:ctx.getPage(),
    x:position?.x??null,y:position?.y??null
   });
   await ctx.saveField(s=>{s.deviations??=[];s.deviations.unshift(record);});
   placing=false;
  }
  const layer=el('div',undefined,'drawing-overlay drawing-discrepancy-overlay');
  ctx.stage.append(layer);
  function drawn(){
   layer.replaceChildren();
   const currentDoc=ctx.getDocument(),currentPage=ctx.getPage();
   for(const d of entries.filter(d=>d.docId===currentDoc&&d.page===currentPage&&d.x!==null&&d.y!==null)){
    const b=btn('!',event=>{
     event.stopPropagation();details.open=true;
     filter.value='all';show();
     document.getElementById('deviation-'+d.id)?.scrollIntoView({block:'center'});
    },'drawing-pin drawing-discrepancy-pin');
    b.classList.add(d.status==='Kontrollerad'?'deviation-checked':d.status==='Åtgärdad'?'deviation-actioned':'deviation-open');
    b.style.left=d.x*100+'%';b.style.top=d.y*100+'%';
    b.setAttribute('aria-label','Ritningsavvikelse: '+d.type+' · '+d.status);
    b.title=d.type+' · '+d.status;
    layer.append(b);
   }
  }
  function place(event){
   if(!placing)return false;
   if(event.target.closest?.('.drawing-pin'))return false;
   if(!ctx.getDocument()||ctx.stage.hidden){feedback.textContent='Ritningen är inte tillgänglig.';return true;}
   const position=window.drawingView.point(ctx.stage,event);
   if(!Number.isFinite(position.x)||!Number.isFinite(position.y)||position.x<0||position.y<0||position.x>1||position.y>1){
    feedback.textContent='Tryck innanför ritningen.';return true;
   }
   placing=false;mark.textContent='Markera plats på ritningen';feedback.textContent='Sparar markeringen…';
   create(position).catch(e=>{feedback.textContent=e.message;});
   return true;
  }
  const shortcut=btn('Registrera ritningsavvikelse',()=>{
   ctx.drawings.open=true;details.open=true;details.scrollIntoView({block:'start'});
  });
  ctx.drawings.insertBefore(shortcut,ctx.scroller);
  ctx.drawings.append(details);
  show();drawn();
  return {drawn,place,dispose(){layer.remove();shortcut.remove();}};
 }
 window.drawingDiscrepanciesUI={mount};
})();
