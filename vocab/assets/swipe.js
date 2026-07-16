/* swipe.js — vocab 앱 전용: 탭 간 스와이프. vocab 페이지 <head>에서만 로드.
 * 다른 앱(writing 등)은 자기 탭 구성이 달라 이 파일을 로드하지 않는다.
 * (index.html 같은 파일명이 앱마다 겹치므로 파일명만으로 탭을 판정하면 안 됨 → 폴더로 가드) */
(function () {
  if (location.pathname.indexOf("/vocab/") < 0) return;   // vocab 폴더 밖이면 비활성

  var TABS = ["index.html", "study.html", "quiz.html", "progress.html"];
  var URLS = ["index.html", "study.html?deck=practical", "quiz.html", "progress.html"];
  function currentTabIndex() {
    var f = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (f === "" ) f = "index.html";
    if (f === "blanks.html" || f === "study.html") return 1;        // 어휘
    if (f === "ctest.html" || f === "quiz.html") return 2;          // 퀴즈
    if (f === "mylist.html" || f === "progress.html") return 3;     // 성취
    if (f === "index.html") return 0;
    return -1;                                                      // guide 등 → 스와이프 없음
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
