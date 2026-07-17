// sw.js — NEO TOEFL 통합 앱(허브 + vocab + writing) 단일 서비스워커. 루트에 있어 scope 는 전체.
// 앱 셸(HTML/JS/CSS)은 network-first(온라인이면 항상 최신), 큰 데이터 파일과 폰트만 cache-first.
// ★ 캐시 무효화 손잡이는 이 CACHE 이름 하나뿐 — 코드/데이터 바꾸면 반드시 올릴 것.
//   (HTML 의 ?v= 쿼리 방식은 프리캐시 키와 어긋나 히트하지 않으므로 쓰지 않는다.)
const CACHE = "neo-toefl-v3";
const SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./admin.html",
  "./install-guide.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  // 공용 assets
  "./assets/colors_and_type.css",
  "./assets/app.css",
  "./assets/config.js",
  "./assets/auth.js",
  "./assets/ui.js",
  "./assets/shell.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-32.png",
  // vocab 앱
  "./vocab/index.html",
  "./vocab/study.html",
  "./vocab/blanks.html",
  "./vocab/ctest.html",
  "./vocab/quiz.html",
  "./vocab/progress.html",
  "./vocab/care.html",
  "./vocab/mylist.html",
  "./vocab/guide.html",
  "./vocab/voice-setup.html",
  "./vocab/assets/tts.js",
  "./vocab/assets/store.js",
  "./vocab/assets/deck.js",
  "./vocab/assets/swipe.js",
  "./vocab/assets/mascot-grinder.svg",
  "./vocab/assets/mark.svg",
  "./vocab/data/meta.js",
  "./vocab/data/vocab.js",
  "./vocab/data/blanks.js",
  "./vocab/data/ctest.js",
  // writing 앱
  "./writing/index.html",
  "./writing/concepts.html",
  "./writing/w1-learn.html",
  "./writing/writing.html",
  "./writing/w1-mock.html",
  "./writing/mypage.html",
  "./writing/guide.html",
  "./writing/assets/app.css",
  "./writing/assets/w1store.js",
  "./writing/data/w1.js",
  "./writing/data/w1_learn.js",
  "./writing/data/w1_mock.js",
  "./writing/data/w1_meta.js",
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
  const isData = sameOrigin && url.pathname.includes("/data/");      // 큰 어휘·문항 데이터
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

  // 데이터 파일 + 폰트 → cache-first(빠름, CACHE 버전 올릴 때만 갱신)
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
