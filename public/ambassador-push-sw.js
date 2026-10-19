/* Extra listeners imported by existing Workbox-generated Boss service worker.
 * Do not install a second SW: that could break offline attendance and PWA updates.
 */
self.addEventListener('push', function(event) {
  event.waitUntil((async function() {
    let message={};
    try {message=event.data ? event.data.json():{};} catch {return;}
    const title=String(message.title||'AGN Campus Hub').slice(0,100);
    const body=String(message.body||'You have an AGN update').slice(0,220);
    const requested=String(message.url||'/ambassadors');
    const pathname=requested==='/ambassadors'||requested==='/?hub=campus' ? requested : '/ambassadors';
    await self.registration.showNotification(title,{
      body,icon:'/pwa-192x192.png',badge:'/pwa-192x192.png',
      tag:String(message.tag||'agn-update').slice(0,100),data:{url:pathname}
    });
  })());
});
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil((async function() {
    const dest=event.notification.data?.url==='/?hub=campus'?'/?hub=campus':'/ambassadors';
    const url=new URL(dest,self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const win of windows){if(new URL(win.url).origin===self.location.origin){
      await win.focus();if('navigate' in win)await win.navigate(url);return;
    }}
    await self.clients.openWindow(url);
  })());
});
