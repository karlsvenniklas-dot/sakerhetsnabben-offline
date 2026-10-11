import assert from 'node:assert/strict';import {createServer} from './server.mjs';
const config={key:'test-only-key',token:'test-only-token-with-at-least-32-characters',origin:'https://example.test',model:'test-model'};
let calls=0,mode='ok';const server=createServer(config,async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const req=JSON.parse(options.body);assert.equal(req.store,false);assert.equal(req.text.format.strict,true);assert.equal(req.input[0].content[1].type,'input_image');if(mode==='incomplete')return Response.json({status:'incomplete',output:[]});return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({candidates:[],warnings:['Osäker ritning']})}]}]});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/analyze';
try{const headers={Origin:config.origin,Authorization:'Bearer '+config.token,'Content-Type':'application/json'};
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://other.test'},body:'{}'})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Authorization:'Bearer wrong'},body:'{}'})).status,401);assert.equal(calls,0);
 assert.equal((await fetch(url,{method:'OPTIONS',headers:{Origin:config.origin}})).status,204);
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({image:'https://example.test/remote.jpg'})})).status,400);assert.equal(calls,0);
 const body=JSON.stringify({image:'data:image/jpeg;base64,/9j/2Q=='}),r=await fetch(url,{method:'POST',headers,body});assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),config.origin);assert.equal((await r.json()).warnings[0],'Osäker ritning');assert.equal(calls,1);
 mode='incomplete';assert.equal((await fetch(url,{method:'POST',headers,body})).status,502);
 console.log('PASS: authentication, CORS, no remote URLs, structured request, validated response, incomplete result rejected. No live API calls.');
}finally{await new Promise(resolve=>server.close(resolve));}
