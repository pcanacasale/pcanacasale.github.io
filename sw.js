const CACHE = 'pcana-v4';
const ASSETS = ['/area-riservata.html', '/area-riservata.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Lascia passare tutto tranne i file statici locali
  if (url.includes('supabase.co') ||
      url.includes('teable.ai') ||
      url.includes('fonts.googleapis') ||
      url.includes('fonts.gstatic') ||
      url.includes('cdnjs.cloudflare')) {
    return; // Non intercettare — lascia andare direttamente
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
