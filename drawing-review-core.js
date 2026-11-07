/* Local, deterministic review of drawing scan proposals. No customer data is transmitted. */
(function(root){
  'use strict';
  const idOf=r=>[String(r.slinga||'').replace(/^0+/,'')||'0',String(r.adress||'').replace(/^0+/,'')||'0'].join('.');
  function reasons(row,rows=[]){
    const out=[];
    if(!row.sektion)out.push('Saknar sektion');
    if(!row.typ)out.push('Okänd detektortyp');
    if(!row.fromCover)out.push('Inte bekräftad av sektionsförteckningen');
    if(row.inList)out.push('Endast förklaringslista eller tätt placerade etiketter');
    if(row.ocr&&(!Number.isFinite(Number(row.conf))||Number(row.conf)<85))out.push('Osäker OCR-tolkning');
    if(rows.some(r=>r!==row&&idOf(r)===idOf(row)&&r.page!==row.page))
      out.push('Samma adress på flera ritningssidor');
    if(row.flag&&/dubbel|konflikt/i.test(row.flag))out.push('Möjlig konflikt i ritningen');
    return [...new Set(out)];
  }
  function summary(rows){
    const items=(rows||[]).map(r=>({id:r.id,address:String(r.slinga||'')+'.'+String(r.adress||''),page:r.page,selected:!!r.approved,existing:!!r.existingId,problems:reasons(r,rows||[])}));
    return {
      total:items.length,
      selected:items.filter(i=>i.selected).length,
      newDevices:items.filter(i=>i.selected&&!i.existing).length,
      conflicts:items.filter(i=>i.problems.length).length,
      selectedConflicts:items.filter(i=>i.selected&&i.problems.length).length,
      items
    };
  }
  function canQuickSelect(row,rows,sectionVerified){
    return !!sectionVerified && !!row.fromCover && !row.inList && !row.manual &&
      !reasons(row,rows).length && !!row.typ && !!row.sektion;
  }
  const api={reasons,summary,canQuickSelect,idOf};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.drawingReview=api;
})(typeof window==='object'?window:globalThis);
