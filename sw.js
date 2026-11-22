'use strict';

const CACHE_NAME = 'mashinki3d-offline-v1';
const BASE_URL = new URL('./', self.location.href);

const PRECACHE_URLS = [
  './',
  './index.html',
  './sw.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js',
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Russo+One&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // The local app shell is required for a successful installation.
    await cache.add(new Request(new URL('./index.html', BASE_URL), { cache: 'reload' }));
    await cache.add(new Request(new URL('./sw.js', BASE_URL), { cache: 'reload' }));

    // Pre-cache external scripts and font stylesheets. Opaque classic-script
    // responses are cacheable and can be replayed while offline.
    await Promise.all(PRECACHE_URLS.slice(3).map(async url => {
      try {
        const req = new Request(url, { mode: 'no-cors', cache: 'reload' });
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) await cache.put(req, res);
      } catch (err) {
        // A temporary CDN outage must not prevent the game shell being installed.
        console.warn('Pre-cache skipped:', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('mashinki3d-offline-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackRequest) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // If the browser already knows it is offline, use the cache immediately.
    if (self.navigator && self.navigator.onLine === false) throw new Error('Offline');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(request, response.clone());
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const cached = await cache.match(request) ||
      (fallbackRequest ? await cache.match(fallbackRequest) : null);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const gameCDN = [
    'cdnjs.cloudflare.com', 'cdn.jsdelivr.net',
    'fonts.googleapis.com', 'fonts.gstatic.com'
  ].includes(url.hostname);
  if (!sameOrigin && !gameCDN) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(
      req,
      new Request(new URL('./index.html', BASE_URL), { method: 'GET' })
    ));
  } else {
    event.respondWith(networkFirst(req));
  }
});
