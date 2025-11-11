const CACHE_NAME = 'cartoonmaker-cache-v3';
const ASSETS = [
  'index.html',
  'style.css',
  'main.js',
  'manifest.json',
  'privacy.html',
  'icons/icon-192.svg',
  'icons/icon-512.svg',
  'icons/maskable-512.svg',
  // Vendor FFmpeg for offline MP4 export
  'vendor/ffmpeg/ffmpeg.min.js',
  'vendor/ffmpeg/ffmpeg-core.js',
  'vendor/ffmpeg/ffmpeg-core.wasm'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
