/* auth.js — 코드 로그인 게이트. 모든 보호 페이지 <head>에서 config.js 다음에 로드.
 * URL 미설정이면 통과. 코드 없으면 login으로. 이번 실행 미검증이면 온라인 재검증.
 * 오프라인(검증 실패)이면 사용 차단(login?offline).
 * 앱이 하위 폴더(vocab/ · writing/)에 있으므로 login.html 은 상대경로로 찾으면 안 된다
 * (/vocab/login.html → 404). 자기 <script src> 위치에서 앱 루트를 도출해 절대 URL로 이동한다. */
(function () {
  var cfg = window.NEO_AUTH || {};
  var url = (cfg.url || "").trim();
  if (!url) return;                                   // 인증 미설정 → 통과
  var page = location.pathname.split("/").pop() || "index.html";
  if (page === "login.html" || page === "admin.html") return; // 자체 게이트
  // .../assets/auth.js → .../  (GitHub Pages 서브패스·중첩 깊이 무관)
  var me = (document.currentScript && document.currentScript.src) || "";
  var ROOT = me.replace(/assets\/auth\.js.*$/, "");
  // 세션 코드 우선. localStorage 코드는 "로그인 유지(neo_keep)" 플래그가 있을 때만 사용.
  var code = sessionStorage.getItem("neo_code");
  if (!code && localStorage.getItem("neo_keep") === "1") code = localStorage.getItem("neo_code");
  if (!code) { location.replace(ROOT + "login.html"); return; }
  var de = document.documentElement;
  var authed = sessionStorage.getItem("neo_auth_ok") === "1";

  function logout(reason) {       // 코드 삭제/무효 → 즉시 로그아웃
    localStorage.removeItem("neo_code");
    localStorage.removeItem("neo_keep");
    sessionStorage.removeItem("neo_code");
    sessionStorage.removeItem("neo_auth_ok");
    sessionStorage.removeItem("neo_role");
    location.replace(ROOT + "login.html?" + reason + "=1");
  }
  // blocking=true: 첫 검증(검증 끝날 때까지 화면 숨김). false: 백그라운드 재검증(화면 그대로).
  function check(blocking) {
    return fetch(url + "?action=validate&code=" + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          sessionStorage.setItem("neo_auth_ok", "1");
          if (d.role) sessionStorage.setItem("neo_role", d.role);
          if (blocking) de.style.visibility = "";
          // "로그인 유지"로 앱을 바로 열면 스토어의 초기 동기화가 이 비동기 검증보다
          // 먼저 끝나 건너뛸 수 있으므로, 검증 직후 한 번 더 당겨온다(syncPull 내부 2초 dedupe).
          // 앱마다 스토어가 다르므로(vocab=NEO_STORE, writing=NEO_W1_STORE) 있는 것만 깨운다.
          [window.NEO_STORE, window.NEO_W1_STORE].forEach(function (s) {
            if (s && s.syncPull) s.syncPull();
          });
        } else {
          logout("invalid");                 // 코드가 삭제됨 → 로그아웃
        }
      })
      .catch(function () { if (blocking) logout("offline"); });   // 백그라운드 재검증은 오프라인이어도 유지
  }

  if (authed) {
    check(false);                            // 이미 검증된 세션 → 화면 바로 + 백그라운드 재검증(삭제 즉시 반영)
  } else {
    de.style.visibility = "hidden";          // 첫 검증 전 렌더 숨김
    check(true);
  }
  // 앱을 다시 포그라운드로 가져올 때마다 재검증 → 삭제된 코드면 바로 로그아웃 (15초 쓰로틀)
  var lastCheck = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || sessionStorage.getItem("neo_auth_ok") !== "1") return;
    var now = Date.now();
    if (now - lastCheck < 15000) return;
    lastCheck = now;
    check(false);
  });
})();
