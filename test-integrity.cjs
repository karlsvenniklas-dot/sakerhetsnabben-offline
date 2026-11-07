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
 console.log('PASS: drawing view export, safety backup allowance, atomic undo and history protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
