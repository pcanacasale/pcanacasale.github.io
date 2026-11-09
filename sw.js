const CACHE = 'pcana-v57';
const ASSETS = ['/area-riservata.html', '/area-riservata.js', '/aggiornamento-dati.js', '/ottimizza-immagine.js', '/informativa-testo.js', '/modulo-cartaceo.js', '/verifica-piattaforme-core.js', '/verifica-piattaforme.js', '/estrai-pia.js', '/scheda-volontario.js', '/archivio-volontario.js', '/allerta-home.js', '/editor-pdf.js', '/formazione.js', '/convocazioni.js', '/eventi.js', '/eventi-polo.js', '/gestione-accessi.js', '/bot-telegram.js', '/accesso.js', '/manifest.json'];

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
  if (url.includes('/aggiorna.html') || url.includes('/firma.html') || url.includes('/guida/') || // pagine pubbliche: mai gestite dal service worker
      url.includes('supabase.co') ||
      url.includes('teable.ai') ||
      url.includes('fonts.googleapis') ||
      url.includes('fonts.gstatic') ||
      url.includes('cdnjs.cloudflare')) {
    return; // Non intercettare — lascia andare direttamente
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
