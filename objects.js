/* Shared offline object schema and list import. No external dependencies. */
(() => {
  'use strict';
  const fields=[['ordernummer','Ordernummer'],['uppdragstyp','SK/KV/SB'],['anlNr','Objektnummer / anläggningsnummer'],['namn','Anläggningsnamn'],['adress','Gatuadress'],['central','Centralapparat'],['planeradTill','Planerad till'],['agare','Anläggningsägare'],['avtalNr','Avtalsnummer'],['kontakt','Kontaktperson'],['tele','Telefon kontaktperson'],['epost','E-post kontaktperson'],['skotare1','Anläggningsskötare 1'],['skotare1Tele','Telefon skötare 1'],['skotare1Epost','E-post skötare 1'],['skotare2','Anläggningsskötare 2'],['skotare2Tele','Telefon skötare 2'],['skotare2Epost','E-post skötare 2'],['undercentral','Undercentral'],['tablaBrandforsvar','Brandförsvarstablå'],['tablaLarmlagring','Larmlagringstablå'],['larmsandare','Larmsändare'],['larmcentral','Larmcentral'],['larmsandarNr','Larmsändarnummer'],['sektionerTotalt','Antal sektioner'],['systemInbrott','Inbrottssystem'],['larmsandarIdInbrott','Larmsändar-ID inbrott'],['detektorerInbrott','Antal detektorer'],['ovrigInfo','Övrig information']];
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const aliases={objektnummer:'anlNr',objektnr:'anlNr',anlaggningsnummer:'anlNr',anlaggningsnr:'anlNr',adress:'adress',modell:'central',modeller:'central',typ:'uppdragstyp',ordertyp:'uppdragstyp',telefon:'tele',telefonnummer:'tele',planeradtill:'planeradTill',anlaggningsnamn:'namn',namn:'namn'};
  for(const [key,label] of fields){aliases[normalize(key)]=key;aliases[normalize(label)]=key;}
  function parse(text,separator){
    text=String(text).replace(/^\uFEFF/,'');
    if(text.length>5*1024*1024)throw Error('Listan är för stor. Dela upp den i mindre filer.');
    if(!separator){const first=text.split(/\r?\n/)[0];separator=['\t',';',','].sort((a,b)=>first.split(b).length-first.split(a).length)[0];}
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=c;}else if(c===separator&&!quoted){row.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
    if(quoted)throw Error('Ett citattecken saknar avslut i listan.');
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);
    if(rows.length<2)throw Error('Ange en rubrikrad och minst ett objekt.');
    if(rows.length>5001)throw Error('Importera högst 5 000 objekt åt gången.');
    const headers=rows.shift();if(rows.some(r=>r.length!==headers.length))throw Error('Raderna har olika antal kolumner. Kontrollera avgränsare och citattecken.');
    return {headers,rows,mapping:headers.map(h=>aliases[normalize(h)]||'')};
  }
  function date(value){if(!value)return '';const m=value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);if(!m)throw Error('Planerad till ska vara ett datum, ÅÅÅÅ-MM-DD.');const iso=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;const d=new Date(iso+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==iso)throw Error('Planerad till innehåller ett ogiltigt datum.');return iso;}
  function plan(rows,mapping,existing){
    const keys=mapping.filter(Boolean);if(new Set(keys).size!==keys.length)throw Error('Samma målfält har valts för flera kolumner.');
    if(keys.some(k=>!fields.some(f=>f[0]===k)))throw Error('Okänt importfält.');
    if(!keys.includes('anlNr'))throw Error('Koppla en kolumn till objektnummer / anläggningsnummer.');
    const seen=new Set();return rows.map((row,index)=>{try{
      const values={};mapping.forEach((key,i)=>{if(key&&row[i]?.trim())values[key]=row[i].trim();});
      if(!values.anlNr)throw Error('Objektnummer saknas.');
      const number=values.anlNr.toLocaleLowerCase('sv');if(seen.has(number))throw Error('Objektnumret förekommer flera gånger i listan. Använd en rad per objekt.');seen.add(number);
      const matches=existing.filter(o=>String(o.anlNr||'').trim().toLocaleLowerCase('sv')===number);if(matches.length>1)throw Error('Flera sparade objekt har detta nummer. Rätta dem före import.');
      if(values.uppdragstyp){values.uppdragstyp=values.uppdragstyp.toUpperCase();if(!['SK','KV','SB'].includes(values.uppdragstyp))throw Error('Typ måste vara SK, KV eller SB.');}
      if(values.planeradTill)values.planeradTill=date(values.planeradTill);
      for(const key of ['sektionerTotalt','detektorerInbrott'])if(values[key]&&!/^\d+$/.test(values[key]))throw Error('Antal ska vara ett heltal utan decimaler.');
      const old=matches[0];const item={...Object.fromEntries(fields.map(([k])=>[k,''])),larmsandare:'Contal Cat12Ce',...old,...values};
      if(!item.namn)item.namn=item.adress||`Objekt ${item.anlNr}`;
      return {item,action:old?'Uppdateras':'Nytt'};
    }catch(error){throw Error(`Rad ${index+2}: ${error.message}`);}});
  }
  function merge(existing,entries){const next=existing.map(o=>({...o}));for(const {item} of entries){const i=next.findIndex(o=>o.id&&o.id===item.id);if(i>=0)next[i]=item;else{const id=crypto.randomUUID();next.push({...item,id:'import-'+id,qr:'SN-'+id,editable:false});}}return next;}
  window.objectLists={fields,parse,plan,merge};
})();
