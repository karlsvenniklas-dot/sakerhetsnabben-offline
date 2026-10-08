const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto;
const ctx={window:{},crypto};vm.runInNewContext(fs.readFileSync(__dirname+'/detectors.js','utf8'),ctx);const a=ctx.window.detectorData;
const d={id:'a',generation:1,central:'A',slinga:'1',sektion:'1',adress:'23',typ:'Rök'},b={id:'b',generation:1,central:'A',sektion:'2',adress:'',lokalId:'Detektor 1',typ:'Rök'};
assert.equal(a.label(b,''),'Sektion 2 · Detektor 1');assert.notEqual(a.identity(b),a.identity({...b,lokalId:'Detektor 2'}));assert.throws(()=>a.validateDevice({...b,lokalId:''}));a.validateDevice(b);
const event=(dev,date,status='Provad – OK',orderId='o')=>a.event(dev,{date,status,technician:'Test',orderId,note:status!=='Provad – OK'?'Fel':''});
const r={devices:[d,b],events:[event(d,'2026-01-08'),event(d,'2026-02-01'),event(b,'2026-04-01','Ej åtkomlig'),event(b,'2026-10-08','Provad – anmärkning')]};

let c=a.coverage(r,2026,4);assert.equal(c.year.devices,2);assert.equal(c.year.sections,2);assert.equal(c.quarter.devices,1);assert.equal(a.coverage(r,2026,2).quarter.devices,0);assert.equal(a.coverage(r,2027,1).year.devices,0);assert.equal(r.events.length,4);
assert.equal(a.protocolEvents(r,'o','2026-10-08','')[0].deviceId,'b');assert.equal(a.protocolEvents(r,'other','2026-10-08','').length,0);
r.events.push(event(b,'2026-10-08'));assert.equal(a.protocolEvents(r,'o','2026-10-08','').length,1);
b.generation=2;assert.equal(a.coverage(r,2026,4).year.devices,1);
const imported=a.plan([['2','Detektor 1'],['2','Detektor 2']],['sektion','lokalId'],[]);assert.equal(imported.length,2);assert.equal(imported[0].device.adress,'');
console.log('PASS: conventional identity, required local labels, quarter/year separation, unique coverage, annual reset without history deletion, replacements, and protocol order/date mapping.');
const e1=event(d,'2026-10-08'),e2=event(b,'2026-10-08');const initial={sektioner:[{sek:'9',adr:['Manuellt','','']}],tekniker:''};const filled=a.protocolState(initial,[e1,e2],'');assert.equal(filled.sektioner.length,3);assert.equal(filled.sektioner[1].adr[0],'A · 01.023');assert.equal(filled.sektioner[2].adr[0],'A · Detektor 1');assert.equal(filled.tekniker,'Test');assert.equal(a.protocolState(filled,[e1,e2],'').sektioner.length,3);assert.equal(a.protocolState(filled,[],'').sektioner.length,1);assert.equal(a.protocolState(initial,[event(b,'2026-10-08','Ej åtkomlig')],'').sektioner.length,1);console.log('PASS: automatic section appendix, conventional label, preserved manual rows, idempotent refresh and exclusion of inaccessible devices.');

assert.equal(a.protocolState({sektioner:[{sek:'001',adr:['','','']}]},[],'').sektioner.length,1);
