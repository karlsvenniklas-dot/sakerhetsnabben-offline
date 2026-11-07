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

const fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{drawingDiscrepancies:api}};
vm.runInNewContext(fs.readFileSync(__dirname+'/field-core.js','utf8'),sandbox);
const fields=sandbox.window.fieldData;
assert.doesNotThrow(()=>fields.validateField({visits:[],materials:[],plans:[],pins:[],prep:''}));
const record=fields.empty();record.deviations.push(example);
assert.doesNotThrow(()=>fields.validateField(record));
const payload={
 facilities:JSON.stringify([{id:'f',namn:'Demoobjekt'}]),
 workorders:'[]','history-index':'[]',
 'fieldwork:f':JSON.stringify(record)
};
const pkg=fields.packageObject(payload,'f');
assert.equal(JSON.parse(pkg.data['fieldwork:f']).deviations.length,1,'the object export includes discrepancies');
fields.validatePackage(pkg);
assert.match(fs.readFileSync(__dirname+'/field-ui.js','utf8'),/discrepancyUI\?\.place\(e\)/);
assert.match(fs.readFileSync(__dirname+'/field-ui.js','utf8'),/RITNINGSAVVIKELSER ATT FÖLJA UPP/);
console.log('PASS: fieldwork compatibility, object-package export and on-drawing integration.');
