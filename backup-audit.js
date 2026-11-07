/* Local backup integrity check. SHA-256 detects accidental corruption, not malicious tampering. */
(function(root){
  'use strict';
  const validDoc=/^data:(?:image\/(?:jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/;
  function inspect(payload){
    if(!payload||payload.app!=='SäkerhetSnabben'||!payload.data||typeof payload.data!=='object'||Array.isArray(payload.data))
      throw Error('Filen är inte en SäkerhetSnabben-säkerhetskopia.');
    const data=payload.data, errors=[], parsed={};
    for(const [k,v] of Object.entries(data)){
      if(typeof v!=='string'){errors.push('Ogiltig post: '+k);continue;}
      try{parsed[k]=JSON.parse(v);}catch{errors.push('Skadad JSON-post: '+k);}
    }
    const objs=parsed.facilities||[],history=parsed['history-index']||[],documents=[];
    for(const [k,v] of Object.entries(parsed))if(k.startsWith('docs:')){
      if(!Array.isArray(v)){errors.push('Ogiltig dokumentlista: '+k);continue;}
      for(const d of v){
        if(!d||typeof d.id!=='string'){errors.push('Dokument utan ID: '+k);continue;}
        documents.push(d.id);
        const file=parsed['docfile:'+d.id];
        if(typeof file!=='string'||!validDoc.test(file))errors.push('Dokumentfil saknas eller har fel format: '+d.id);
      }
    }
    if(!Array.isArray(objs))errors.push('Objektlistan har fel format');
    if(!Array.isArray(history))errors.push('Protokollhistoriken har fel format');
    if(Array.isArray(history))for(const h of history)if(!h?.id||!parsed['report:'+h.id])errors.push('Protokoll saknas: '+(h?.id||'?'));
    const devices=Object.entries(parsed).filter(([k])=>k.startsWith('detectors:')).reduce((n,[,r])=>n+(Array.isArray(r?.devices)?r.devices.length:0),0);
    const tests=Object.entries(parsed).filter(([k])=>k.startsWith('detectors:')).reduce((n,[,r])=>n+(Array.isArray(r?.events)?r.events.filter(e=>e.kind==='test').length:0),0);
    const summary={objects:Array.isArray(objs)?objs.length:0,documents:documents.length,reports:Array.isArray(history)?history.length:0,detectors:devices,tests,entries:Object.keys(data).length};
    if(!Object.keys(data).length)errors.push('Säkerhetskopian är tom');
    return {summary,errors,ok:errors.length===0};
  }
  async function fingerprint(data){
    if(!root.crypto?.subtle)throw Error('Säker anslutning krävs för kontrollsumma.');
    const bytes=new TextEncoder().encode(JSON.stringify(data));
    const hash=await root.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function seal(backup){
    const result=inspect(backup);
    if(!result.ok)throw Error('Säkerhetskopian är ofullständig: '+result.errors.slice(0,2).join('; '));
    return {...backup,integrity:{algorithm:'SHA-256',hash:await fingerprint(backup.data),counts:result.summary}};
  }
  async function verify(backup){
    const report=inspect(backup);
    if(backup.integrity){
      if(backup.integrity.algorithm!=='SHA-256')report.errors.push('Okänd kontrollsummealgoritm');
      else if(await fingerprint(backup.data)!==backup.integrity.hash)report.errors.push('Kontrollsumman matchar inte. Filen kan ha skadats.');
      for(const [key,value] of Object.entries(backup.integrity.counts||{}))
        if(report.summary[key]!==value)report.errors.push('Antal '+key+' skiljer sig från exporten');
    }
    report.ok=report.errors.length===0;
    return {...report,hasChecksum:!!backup.integrity};
  }
  const api={inspect,seal,verify};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.backupAudit=api;
})(typeof window==='object'?window:globalThis);
