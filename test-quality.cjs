const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
global.crypto=webcrypto;
const review=require('./drawing-review-core.js'),backup=require('./backup-audit.js');
const good={id:'a',page:1,slinga:'01',adress:'023',sektion:'1',typ:'Rökdetektor',fromCover:true,ocr:true,conf:95,approved:false};
assert.equal(review.canQuickSelect(good,[good],true),true);
assert.equal(review.canQuickSelect(good,[good],false),false);
assert.equal(review.canQuickSelect({...good,conf:60},[good],true),false);
assert.equal(review.canQuickSelect({...good,typ:''},[good],true),false);
const dup={...good,id:'b',page:2};
assert.match(review.reasons(good,[good,dup]).join(','),/flera/);
assert.equal(review.summary([good,dup]).conflicts,2);
const data={
 facilities:JSON.stringify([{id:'f',namn:'Demo'}]),
 'history-index':'[]','docs:f':JSON.stringify([{id:'doc'}]),
 'docfile:doc':JSON.stringify('data:application/pdf;base64,JVBERg==')
};
(async()=>{
 const payload=await backup.seal({app:'SäkerhetSnabben',version:4,edition:'offline',data});
 assert.equal((await backup.verify(JSON.parse(JSON.stringify(payload)))).ok,true);
 assert.equal((await backup.verify({...payload,data:{...data,facilities:JSON.stringify([{id:'different'}])}})).ok,false);
 assert.equal(backup.inspect({...payload,data:{...data,'docfile:doc':undefined}}).ok,false);
 // Incomplete data is still backed up (with warnings); only damaged files fail.
 const gap={...data,'history-index':JSON.stringify([{id:'r1',proto:'BL401'}]),'docs:f':JSON.stringify([{id:'doc'},{id:'lost',namn:'Plan 2'}])};
 const partial=await backup.seal({app:'SäkerhetSnabben',version:4,edition:'offline',data:gap});
 assert.equal(partial.integrity.warnings.length,2);
 const partialCheck=await backup.verify(JSON.parse(JSON.stringify(partial)));
 assert.equal(partialCheck.ok,true);assert.match(partialCheck.warnings.join(),/Plan 2/);assert.match(partialCheck.warnings.join(),/BL401/);
 await assert.rejects(()=>backup.seal({app:'SäkerhetSnabben',data:{...data,facilities:'{trasig'}}),/kunde inte läsas/);
 const legacy=await backup.verify({app:'SäkerhetSnabben',data});
 assert.equal(legacy.ok,true);assert.equal(legacy.hasChecksum,false);
 console.log('PASS: review risks, safe bulk selection and backup integrity / missing documents.');
})().catch(e=>{console.error(e);process.exitCode=1;});
