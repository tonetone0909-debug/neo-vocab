/* auth.js — 코드 로그인 게이트. 모든 보호 페이지 <head>에서 config.js 다음에 로드.
 * URL 미설정이면 통과. 코드 없으면 login으로. 이번 실행 미검증이면 온라인 재검증.
 * 오프라인(검증 실패)이면 사용 차단(login?offline). */
(function () {
  var cfg = window.NEO_AUTH || {};
  var url = (cfg.url || "").trim();
  if (!url) return;                                   // 인증 미설정 → 통과
  var page = location.pathname.split("/").pop() || "index.html";
  if (page === "login.html" || page === "admin.html") return; // 자체 게이트
  // 세션 코드 우선. localStorage 코드는 "로그인 유지(neo_keep)" 플래그가 있을 때만 사용.
  var code = sessionStorage.getItem("neo_code");
  if (!code && localStorage.getItem("neo_keep") === "1") code = localStorage.getItem("neo_code");
  if (!code) { location.replace("login.html"); return; }
  if (sessionStorage.getItem("neo_auth_ok") === "1") return;  // 이번 실행 검증 완료
  var de = document.documentElement;
  de.style.visibility = "hidden";                     // 검증 전 렌더 숨김
  fetch(url + "?action=validate&code=" + encodeURIComponent(code))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.ok) {
        sessionStorage.setItem("neo_auth_ok", "1");
        if (d.role) sessionStorage.setItem("neo_role", d.role);
        de.style.visibility = "";
      } else {
        // 코드가 삭제됨 → 자동 로그아웃
        localStorage.removeItem("neo_code");
        localStorage.removeItem("neo_keep");
        sessionStorage.removeItem("neo_code");
        sessionStorage.removeItem("neo_auth_ok");
        location.replace("login.html?invalid=1");
      }
    })
    .catch(function () { location.replace("login.html?offline=1"); });
})();
