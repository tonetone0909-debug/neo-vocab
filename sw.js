// sw.js — app-shell cache. 앱 셸(HTML/JS/CSS)은 network-first(온라인이면 항상 최신),
// 큰 데이터 파일과 폰트만 cache-first. Bump CACHE on every change.
const CACHE = "neo-vocab-v34";
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
  "./install-guide.html",
  "./manifest.webmanifest",
  "./assets/colors_and_type.css",
  "./assets/app.css",
  "./assets/tts.js",
  "./assets/store.js",
  "./assets/deck.js",
  "./assets/config.js",
  "./assets/auth.js",
  "./assets/ui.js",
  "./assets/shell.js",
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
  "./assets/icons/icon-32.png",
  "./favicon.ico",
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
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isData = sameOrigin && url.pathname.includes("/data/");      // 큰 단어 데이터
  const isFont = /fonts\.(googleapis|gstatic)\.com/.test(url.host);

  // 앱 셸(HTML/JS/CSS 등 same-origin, data 제외) → network-first: 온라인이면 항상 최신
  if (sameOrigin && !isData) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() =>
        caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
      )
    );
    return;
  }

  // 데이터 파일 + 폰트 → cache-first(빠름, 버전 올릴 때만 갱신)
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (isData || isFont) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      });
    })
  );
});
