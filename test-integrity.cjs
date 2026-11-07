const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const fieldContext={window:{},crypto:webcrypto};
vm.runInNewContext(fs.readFileSync(__dirname+'/field-core.js','utf8'),fieldContext);
const api=fieldContext.window.fieldData;
const data={
 facilities:JSON.stringify([{id:'f',namn:'Test'}]),workorders:'[]','history-index':'[]',
 'docs:f':JSON.stringify([{id:'doc'}]),
 'docfile:doc':JSON.stringify('data:application/pdf;base64,JVBERg=='),
 'drawing-view:doc':JSON.stringify({pages:{'1':{rotation:90,manual:true}}})
};
const pkg=api.packageObject(data,'f');
assert.ok(pkg.data['drawing-view:doc'],'view information follows object export');
api.validatePackage(pkg);
assert.throws(()=>api.validatePackage({...pkg,data:{...pkg.data,'drawing-view:doc':'{"pages":{"1":{"rotation":77}}}'}}),/visning/);
const storageText=fs.readFileSync(__dirname+'/storage.js','utf8');
assert.match(storageText,/service-reports:\.\+\|drawing-view:\.\+/,'full-backup restore must accept drawing-view records');

const state={
 'detectors:f':JSON.stringify({devices:[{id:'d',generation:1}],events:[{id:'test',kind:'test',deviceId:'d',generation:1}]}),
 'issues:f':JSON.stringify([{id:'issue',status:'Öppen',sources:['det:test'],timeline:[{status:'Öppen'}]}])
};
const window={localData:{
 async snapshot(){return {...state}},
 async commitRecords(before,writes){for(const [key,value]of Object.entries(writes))state[key]=value;}
},detectorData:{}};
const c={window,crypto:webcrypto};
vm.runInNewContext(fs.readFileSync(__dirname+'/service-core.js','utf8'),c);
(async()=>{
 await window.serviceData.undoTest('f','test');
 assert.equal(JSON.parse(state['detectors:f']).events.length,0);
 assert.equal(JSON.parse(state['issues:f']).length,0);
 state['detectors:f']=JSON.stringify({devices:[],events:[{id:'test2',kind:'test'}]});
 state['issues:f']=JSON.stringify([{id:'edited',status:'Åtgärdad',sources:['det:test2'],timeline:[{status:'Öppen'},{status:'Åtgärdad'}]}]);
 await assert.rejects(()=>window.serviceData.undoTest('f','test2'),/stoppades/);
 assert.equal(JSON.parse(state['detectors:f']).events.length,1,'edited issues must block undo');
 // A repeat fault on an open issue can be undone; only that registration is removed.
 const repeat={id:'rep',status:'Öppen',group:'det:d:1',sources:['det:a','det:b'],timeline:[{status:'Öppen'},{status:'Öppen',note:'Ny registrering: x',source:'det:b'}]};
 state['detectors:f']=JSON.stringify({devices:[],events:[{id:'a',kind:'test'},{id:'b',kind:'test'}]});
 state['issues:f']=JSON.stringify([repeat]);
 await window.serviceData.undoTest('f','b');
 assert.deepEqual(JSON.parse(state['issues:f'])[0].sources,['det:a'],'repeat registration retracted');
 assert.equal(JSON.parse(state['issues:f'])[0].timeline.length,1);
 assert.equal(JSON.parse(state['detectors:f']).events.length,1);
 // Older registrations without a source tag are recognised by their note.
 state['detectors:f']=JSON.stringify({devices:[],events:[{id:'a',kind:'test'},{id:'b',kind:'test'}]});
 state['issues:f']=JSON.stringify([{...repeat,timeline:[{status:'Öppen'},{status:'Öppen',note:'Ny registrering: x'}]}]);
 await window.serviceData.undoTest('f','b');
 assert.deepEqual(JSON.parse(state['issues:f'])[0].sources,['det:a']);
 // A status change after the repeat, or undoing the first source, is blocked.
 state['detectors:f']=JSON.stringify({devices:[],events:[{id:'a',kind:'test'},{id:'b',kind:'test'}]});
 state['issues:f']=JSON.stringify([{...repeat,status:'Åtgärdad',timeline:[...repeat.timeline,{status:'Åtgärdad'}]}]);
 await assert.rejects(()=>window.serviceData.undoTest('f','b'),/stoppades/);
 state['issues:f']=JSON.stringify([repeat]);
 await assert.rejects(()=>window.serviceData.undoTest('f','a'),/stoppades/);
 assert.equal(JSON.parse(state['detectors:f']).events.length,2);
 // A fault test without a device copy (older/demo data) must not crash the fault register.
 window.detectorData.label=d=>d.slinga+'.'+d.adress;
 window.localData.updateRecord=async(k,def,fn)=>{const v=fn(JSON.parse(state[k]||JSON.stringify(def)));state[k]=JSON.stringify(v);return v;};
 state['detectors:g']=JSON.stringify({devices:[{id:'x',slinga:'01',adress:'002',generation:1}],events:[{id:'n',kind:'test',deviceId:'x',generation:1,status:'Provad – anmärkning',note:'Fel',date:'2026-11-07'}]});
 const synced=await window.serviceData.syncIssues('g');
 assert.equal(synced[0].title,'01.002');
 console.log('PASS: drawing view export, safety backup allowance, atomic undo and history protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
