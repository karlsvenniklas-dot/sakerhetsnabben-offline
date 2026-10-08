'use strict';
const CACHE='sn-offline-shell-v9';
const FILES=['./','./index.html','./workspace.html','./engine.js','./engine.css','./workspace.css','./storage.js','./objects.js','./orders.js','./detectors.js','./detectors-ui.js','./orders-ui.js','./import-ui.js','./shell.js','./shell.css','./manifest.webmanifest','./icon-192.png','./icon-512.png','./service-core.js','./service-ui.js','./service.css','./pdf-lib.min.js'];
const urls=FILES.map(file=>new URL(file,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const responses=await Promise.all(urls.map(async url=>{
    const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),20000);
    let response;
    try{response=await fetch(url,{cache:'reload',credentials:'same-origin',redirect:'follow',signal:abort.signal});}finally{clearTimeout(timer);}
    const name=new URL(url).pathname;
    if(!response.ok||response.type==='opaque')throw new Error(`FIL_HTTP_${response.status}: ${name}`);
    if(response.url&&new URL(response.url).origin!==self.location.origin)throw new Error(`INLOGGNING_ELLER_EXTERN_OMDIRIGERING: ${name}`);
    const pathname=new URL(url).pathname;
    if(pathname.endsWith('/')||pathname.endsWith('.html')){
      if(!(await response.clone().text()).includes('<meta name="sn-offline-app" content="v1">'))throw new Error(`INLOGGNING_ELLER_FELSIDA: ${name}`);
    }
    if(pathname.endsWith('.js')&&!/javascript/.test(response.headers.get('content-type')||''))throw new Error(`FEL_FILFORMAT: ${name}`);
    // Validated same-origin static redirects (e.g. /index.html -> /) are allowed.
    // Store a non-redirected response so offline navigations are safe too.
    return [url,new Response(await response.arrayBuffer(),{status:response.status,statusText:response.statusText,headers:response.headers})];
  }));
  const cache=await caches.open(CACHE);
  await Promise.all(responses.map(([url,response])=>cache.put(url,response)));
})().catch(async error=>{
  const clients=await self.clients.matchAll?.({type:'window',includeUncontrolled:true})||[];
  for(const client of clients)client.postMessage({type:'OFFLINE_INSTALL_ERROR',message:error.message});
  throw error;
})));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();if(event.data?.type==='OFFLINE_VERSION')event.ports?.[0]?.postMessage({cache:CACHE});});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const clean=url.origin+url.pathname;
  if(!urls.includes(clean))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);return(await cache.match(clean))||fetch(event.request);})());
});
