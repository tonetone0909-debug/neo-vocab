/* shell.js — 공용 셸: 탭 간 스와이프. 전 페이지 <head>에서 로드.
 * config/auth 다음, 본문 스크립트 전에 둠. */
(function () {
  // 이전 버전 다크모드 흔적 정리(다크모드 기능 제거됨)
  try { document.documentElement.removeAttribute("data-theme"); localStorage.removeItem("neo_theme"); } catch (e) {}

  // ---------- 탭 간 스와이프 ----------
  var TABS = ["index.html", "study.html", "quiz.html", "progress.html"];
  var URLS = ["index.html", "study.html?deck=practical", "quiz.html", "progress.html"];
  function currentTabIndex() {
    var f = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (f === "" ) f = "index.html";
    if (f === "blanks.html" || f === "study.html") return 1;        // 어휘
    if (f === "ctest.html" || f === "quiz.html") return 2;          // 퀴즈
    if (f === "mylist.html" || f === "progress.html") return 3;     // 성취
    if (f === "index.html") return 0;
    return -1;                                                      // login/admin 등 → 스와이프 없음
  }

  var sx = 0, sy = 0, tracking = false;
  function onStart(x, y, target) {
    tracking = false;
    if (target && target.closest && (target.closest("[data-swipe-card]") || target.closest(".no-tabswipe") || target.closest("input,textarea,[contenteditable]"))) return;
    if (currentTabIndex() < 0) return;
    sx = x; sy = y; tracking = true;
  }
  function onEnd(x, y) {
    if (!tracking) return; tracking = false;
    var dx = x - sx, dy = y - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 1.8 * Math.abs(dy)) return;
    var i = currentTabIndex(); if (i < 0) return;
    var ni = dx < 0 ? i + 1 : i - 1;                               // 좌=다음, 우=이전
    if (ni < 0 || ni >= TABS.length || ni === i) return;
    location.href = URLS[ni];
  }

  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    var t = e.changedTouches && e.changedTouches[0]; if (t) onEnd(t.clientX, t.clientY);
  }, { passive: true });
  // 데스크톱(마우스 드래그)도 지원
  var md = false;
  document.addEventListener("mousedown", function (e) { md = true; onStart(e.clientX, e.clientY, e.target); });
  document.addEventListener("mouseup", function (e) { if (md) { md = false; onEnd(e.clientX, e.clientY); } });
})();
