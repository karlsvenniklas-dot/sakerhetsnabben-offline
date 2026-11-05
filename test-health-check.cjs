const assert=require('node:assert/strict');
const health=require('./health-check.js');
const f={id:'f1',namn:'Testobjekt'};
const ok={
 facilities:JSON.stringify([f]),
 workorders:JSON.stringify([{id:'o1',facilityId:'f1'}]),
 'history-index':'[]',
 'docs:f1':JSON.stringify([{id:'doc1'}]),
 'docfile:doc1':JSON.stringify('data:application/pdf;base64,JVBERg=='),
 'detectors:f1':JSON.stringify({devices:[{id:'d1'}],events:[{id:'e1',deviceId:'d1',kind:'test'}]}),
 'fieldwork:f1':JSON.stringify({pins:[{id:'p1',docId:'doc1',deviceId:'d1'}],plans:[],visits:[],materials:[]})
};
const good=health.inspect(ok);
assert.equal(good.totals.errors,0);
assert.equal(good.totals.warnings,0);
assert.deepEqual(good.counts,{objects:1,orders:1,detectors:1,tests:1,documents:1,drawings:1});
const bad={...ok,workorders:JSON.stringify([{id:'o1',facilityId:'gone'}]),'docfile:doc1':undefined,'fieldwork:f1':JSON.stringify({pins:[{id:'p1',docId:'missing',deviceId:'gone'}],plans:[],visits:[],materials:[]})};
delete bad['docfile:doc1'];
const findings=health.inspect(bad);
assert.ok(findings.totals.errors>=2);
assert.ok(findings.totals.warnings>=2);
assert.ok(findings.findings.some(x=>x.description.includes('Dokument saknar')));
assert.ok(findings.findings.some(x=>x.description.includes('detektorkoppling')));
assert.equal(health.inspect({...ok,'detectors:f1':'not JSON'}).totals.errors,1);
assert.equal(health.inspect({}).totals.errors,0);
assert.throws(()=>health.inspect(null));
console.log('PASS: valid local data, references, malformed registers, missing documents, read-only checks.');
