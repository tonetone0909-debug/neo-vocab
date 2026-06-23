// sw.js — app-shell cache for offline use. Bump CACHE on every data rebuild.
const CACHE = "neo-vocab-v24";
const SHELL = [
  "./",
  "./index.html",
  "./study.html",
  "./blanks.html",
  "./ctest.html",
  "./quiz.html",
  "./progress.html",
  "./mylist.html",
  "./login.html",
  "./admin.html",
  "./manifest.webmanifest",
  "./assets/colors_and_type.css",
  "./assets/app.css",
  "./assets/tts.js",
  "./assets/store.js",
  "./assets/deck.js",
  "./assets/config.js",
  "./assets/auth.js",
  "./assets/ui.js",
  "./assets/mascot-grinder.svg",
  "./assets/mark.svg",
  "./data/meta.js",
  "./data/vocab.js",
  "./data/blanks.js",
  "./data/ctest.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        // runtime-cache same-origin + google fonts (stale-while-revalidate-ish)
        const url = new URL(req.url);
        if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => {
        // offline navigation fallback
        if (req.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
