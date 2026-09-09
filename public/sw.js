// Cache only a generic offline page. Never cache authenticated pages or history.
const offlineCache='herdr-offline-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(offlineCache).then(cache=>cache.add('/offline.html'))));
self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate'&&new URL(event.request.url).origin===self.location.origin)event.respondWith((async()=>{
    try { const response=await fetch(event.request);if(response.status<500)return response; } catch {}
    return await caches.match('/offline.html')||new Response('Shep connection unavailable. Check your PC and Tailscale, then reload.',{status:503});
  })());
});
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data;try{data=event.data.json();}catch{return;}
  event.waitUntil(self.registration.showNotification(data.title||'Shep',{body:data.body||'Session update',icon:'/assets/herdr-icon-192.png?v=shep-flock-1',badge:'/assets/herdr-icon-32.png?v=shep-flock-1',tag:data.tag,data:{paneId:data.paneId,machineId:data.machineId}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const paneId=event.notification.data?.paneId;
  if(typeof paneId!=='string')return;
  event.waitUntil((async()=>{const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});const machineId=event.notification.data?.machineId||'local';const tab=tabs.find(t=>new URL(t.url).origin===self.location.origin&&(new URL(t.url).searchParams.get('machine')||'local')===machineId);if(tab){await tab.focus();tab.postMessage({paneId});}else await self.clients.openWindow('/?open=terminal'+(machineId==='local'?'':'&machine='+encodeURIComponent(machineId))+'#pane='+encodeURIComponent(paneId));})());
});
