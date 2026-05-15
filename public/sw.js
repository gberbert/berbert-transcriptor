const CACHE_NAME = 'plaubert-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/history.html',
  '/resumos.html',
  '/login.html',
  '/style.css',
  '/app.js',
  '/history.js',
  '/resumos.js',
  '/auth.js',
  '/auth-helper.js',
  '/version.js',
  '/icon.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepta as requisições para evitar a tela 503 do Render
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Ignora chamadas de API, pois a própria aplicação lidará com os erros ou estado offline
  if (url.pathname.startsWith('/reunioes') || 
      url.pathname.startsWith('/ping') || 
      url.pathname.startsWith('/user') || 
      url.pathname.startsWith('/transcrever') || 
      url.pathname.startsWith('/salvar-reuniao') || 
      url.pathname.startsWith('/gerar-resumo') ||
      url.pathname.startsWith('/auth')) {
    return;
  }

  // Estratégia Stale-While-Revalidate para os arquivos do App (HTML, CSS, JS)
  // Serve do cache IMEDIATAMENTE (mesmo se o Render estiver exibindo a tela preta), 
  // mas busca a versão mais nova no fundo.
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Só atualiza o cache local se o Render devolveu um status de SUCESSO.
        // Se devolver 503 (Service Unavailable - "Welcome to Render"), não estraga nosso cache!
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(err => {
        // Em caso de erro absoluto de rede (Offline), falha silenciosamente no fundo.
      });

      // Retorna o que tem no cache (App Shell protegido) OU espera a rede
      return cachedResponse || fetchPromise;
    })
  );
});
