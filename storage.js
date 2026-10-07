/* Device-local storage only. No records or uploaded documents leave this origin. */
(() => {
  'use strict';
  const DB_NAME = 'sakerhetsnabben-offline-v1';
  let db;
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(DB_NAME) : null;
  function signal(detail) {
    window.dispatchEvent(new CustomEvent('local-storage-state', {detail}));
    if (window.parent !== window) window.parent.postMessage({type:'storage-state', ...detail}, location.origin);
    channel?.postMessage(detail);
  }
  channel?.addEventListener('message', event => window.dispatchEvent(new CustomEvent('local-storage-state', {detail:event.data})));
  window.localReady = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('records');
    open.onsuccess = () => {
      db = open.result;
      db.onversionchange = () => { db.close(); signal({state:'error', message:'Ladda om appen för att fortsätta spara.'}); };
      resolve();
    };
    open.onerror = () => { signal({state:'error', message:'Lokal lagring kunde inte öppnas. Använd inte privat surfning.'}); reject(open.error); };
    open.onblocked = () => signal({state:'error', message:'Stäng andra öppna flikar med appen och försök igen.'});
  });
  async function transact(mode, run) {
    await window.localReady;
    if (mode === 'readwrite') signal({state:'saving'});
    return new Promise((resolve,reject) => {
      const tx = db.transaction('records', mode);
      const store = tx.objectStore('records');
      let result;
      try { result = run(store); } catch(error) { tx.abort(); reject(error); return; }
      tx.oncomplete = () => {
        if (mode === 'readwrite') signal({state:'saved', time:Date.now()});
        resolve(typeof result === 'function' ? result() : result?.result);
      };
      tx.onabort = tx.onerror = () => {
        signal({state:'error', message:'Kunde inte spara. Behåll sidan öppen och frigör utrymme på telefonen.'});
        reject(tx.error || new Error('Lagringen avbröts'));
      };
    });
  }
  window.storage = {
    async get(key) { const value = await transact('readonly', store=>store.get(key)); return value === undefined ? null : {key,value,shared:false}; },
    async set(key,value) { await transact('readwrite', store=>store.put(value,key)); return {key,value,shared:false}; },
    async delete(key) { await transact('readwrite',store=>store.delete(key)); return {key,deleted:true}; },
    async list(prefix='') { const keys = await transact('readonly',store=>store.getAllKeys()); return {keys:keys.filter(key=>key.startsWith(prefix))}; }
  };
  window.localData = {
    async updateRecord(key, fallback, update) {
      let failure;
      try { return await transact('readwrite', store=>{
        const request=store.get(key);let value;
        request.onsuccess=()=>{try{value=update(request.result===undefined?structuredClone(fallback):JSON.parse(request.result));store.put(JSON.stringify(value),key);}catch(error){failure=error;store.transaction.abort();}};
        return ()=>value;
      }); } catch(error) { throw failure||error; }
    },
    async read(key, fallback=null) { const item=await window.storage.get(key); return item ? JSON.parse(item.value) : fallback; },
    async snapshot() {
      return transact('readonly', store => {
        const keys=store.getAllKeys(), values=store.getAll();
        return ()=>Object.fromEntries(keys.result.map((key,index)=>[key,values.result[index]]));
      });
    },
    async exportBackup() {
      const data = await this.snapshot();
      return {app:'SäkerhetSnabben',version:4,edition:'offline',exportedAt:new Date().toISOString(),data};
    },
    async restore(backup) {
      if (!backup || backup.app !== 'SäkerhetSnabben' || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) throw new Error('Det här är inte en säkerhetskopia från SäkerhetSnabben.');
      const entries=Object.entries(backup.data);
      const allowed=/^(facilities|workorders|history-index|seed-v\d+|test-mode|facility-overrides|draft:.+|docs:.+|docfile:.+|materiel:.+|report:.+|detectors:.+)$/;
      for(const [key,value] of entries) {
        if(!allowed.test(key)||typeof value!=='string') throw new Error('Säkerhetskopian innehåller en okänd post.');
        const parsed=JSON.parse(value);
        if((key==='facilities'||key==='workorders'||key==='history-index'||key.startsWith('docs:')||key.startsWith('materiel:'))&&!Array.isArray(parsed)) throw new Error('Ett register i säkerhetskopian har fel format.');
        if(key==='facilities'&&parsed.some(v=>!v||typeof v.id!=='string'||typeof v.namn!=='string')) throw new Error('Ett objekt saknar giltigt namn eller ID.');
        if(key==='workorders'&&parsed.some(v=>!v||typeof v.id!=='string'||typeof v.facilityId!=='string'||!['Planerat','Påbörjat','Klart'].includes(v.status))) throw new Error('En arbetsorder är ogiltig.');
        if(key.startsWith('detectors:')&&(!parsed||!Array.isArray(parsed.devices)||!Array.isArray(parsed.events)||parsed.devices.some(d=>!d||typeof d.id!=='string'||typeof d.adress!=='string'||!Number.isInteger(d.generation)||d.generation<1)||parsed.events.some(e=>!e||typeof e.id!=='string'||typeof e.deviceId!=='string'||!['test','replacement'].includes(e.kind)))) throw new Error('Ett detektorregister är ogiltigt.');
        if(key==='history-index'&&parsed.some(v=>!v||typeof v.id!=='string'||typeof v.proto!=='string')) throw new Error('Historiken innehåller en ogiltig post.');
      }
      if (!entries.length) throw new Error('Säkerhetskopian är tom.');
      // One transaction: all imported keys succeed together, or none change.
      await transact('readwrite', store=>{for(const [key,value] of entries) store.put(value,key);});
      return entries.length;
    }
  };
  window.restoreSafetyBackup = async backup => {
    if(!confirm('Importera säkerhetskopian? Poster med samma ID ersätts. Spara först en kopia av nuvarande data om du vill kunna återgå.')) throw new Error('Importen avbröts.');
    return window.localData.restore(backup);
  };
})();
