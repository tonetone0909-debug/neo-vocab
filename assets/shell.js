/* shell.js — 앱 공용 셸: 우측 상단 사용자 이름 칩 + 우클릭 차단. 전 페이지 <head>에서 로드.
 * config/auth 다음, 본문 스크립트 전에 둠.
 * vocab 전용 탭 스와이프는 vocab/assets/swipe.js 로 분리(앱마다 탭 구성이 다르고,
 * index.html 같은 파일명이 앱마다 겹쳐 파일명만으로 탭을 판정하면 오작동함). */
(function () {
  // 이전 버전 다크모드 흔적 정리(다크모드 기능 제거됨)
  try { document.documentElement.removeAttribute("data-theme"); localStorage.removeItem("neo_theme"); } catch (e) {}

  var page = (location.pathname.split("/").pop() || "").toLowerCase();

  // ---------- 우측 상단 사용자 이름(전 앱 공통, 항상 표시) ----------
  function showUserName() {
    try {
      if (!((window.NEO_AUTH || {}).url || "").trim()) return;        // 인증 OFF → 표시 안 함
      if (sessionStorage.getItem("neo_role") === "admin") return;
      if (page === "login.html" || page === "admin.html") return;
      var code = sessionStorage.getItem("neo_code") || (localStorage.getItem("neo_keep") === "1" ? localStorage.getItem("neo_code") : "") || "";
      if (!code) return;
      var name = code.replace(/\s*\d{4}$/, "").trim() || code;        // 박태환4355 → 박태환
      // vocab 은 .topbar, writing/허브는 .app-topbar 를 쓴다.
      var bar = document.querySelector(".topbar, .app-topbar");
      if (!bar || bar.querySelector(".user-name")) return;
      var crumb = bar.querySelector(".crumb"); if (crumb) crumb.style.display = "none";  // 우측 자리 양보
      var el = document.createElement("span");
      el.className = "user-name";
      el.textContent = name + " 님";
      bar.appendChild(el);
    } catch (e) {}
  }
  if (document.readyState !== "loading") showUserName();
  else document.addEventListener("DOMContentLoaded", showUserName);

  // ---------- 우클릭(컨텍스트 메뉴) 차단 ----------
  // 학습 앱이라 우클릭 메뉴가 쓸 일이 없고, 모바일 길게누르기 팝업이 드래그를 방해한다.
  // 단 ① 입력칸(퀴즈 타이핑·코드 입력)에서는 붙여넣기가 필요하니 허용
  //    ② 관리자 페이지는 운영자용이라 통째로 예외(코드 복사/붙여넣기).
  (function blockContextMenu() {
    if (page === "admin.html") return;
    document.addEventListener("contextmenu", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
    });
  })();
})();
