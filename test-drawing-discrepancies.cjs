const assert=require('node:assert/strict');
const api=require('./drawing-discrepancies.js');
const example=api.make({
 type:'Detektor flyttad',deviceId:'a',docId:'drawing',page:2,x:.35,y:.62,
 reportedBy:'Övning',orderId:'o1',description:'Sitter på annan vägg'
},{id:'x',now:'2026-11-07T10:00:00.000Z'});
assert.equal(example.status,'Öppen');
assert.equal(api.stats([example]).open,1);
assert.throws(()=>api.make({...example,type:'Annan feltyp'}),/Välj/);
assert.throws(()=>api.make({...example,x:5}),/positionen/);
assert.throws(()=>api.make({...example,reportedBy:''}),/tekniker/);
assert.equal(api.validateMany([]).length,0,'older fieldwork without discrepancies is valid');
assert.throws(()=>api.validateMany([example,example]),/Dubbla/);
const actioned=api.change(example,'Åtgärdad',{technician:'Montör',note:'Flyttad i ritning',at:'2026-11-07T11:00:00Z'});
const checked=api.change(actioned,'Kontrollerad',{technician:'Kontrollant',note:'Verifierad i verkligheten',at:'2026-11-07T12:00:00Z'});
assert.deepEqual(checked.history.map(x=>x.status),['Öppen','Åtgärdad','Kontrollerad']);
assert.equal(example.history.length,1,'history is immutable');
assert.throws(()=>api.change(example,'Kontrollerad',{technician:'X',note:'Fel'}),/Statusbyte/);
assert.throws(()=>api.change(actioned,'Kontrollerad',{technician:'X',note:''}),/kommentar/);
const reopened=api.change(checked,'Öppen',{technician:'X',note:'Kvarstår'});
assert.equal(reopened.history.length,4);
const file=api.csv([example],{facility:'Test;Objekt',deviceLabel:()=>'=SUM(1,1)',docLabel:()=>'+formel',orderLabel:()=>'-risk'});
assert.match(file,/Detektor flyttad/);
assert.match(file,/"'=SUM/);
assert.match(file,/"'\+formel"/);
assert.match(file,/"'-risk"/);
assert.match(file,/"Test;Objekt"/);
console.log('PASS: discrepancy data, immutable follow-up, transitions, CSV and formula injection defense.');
