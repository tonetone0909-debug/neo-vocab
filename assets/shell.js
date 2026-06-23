/* shell.js — 공용 셸: 다크모드 토글 + 탭 간 스와이프. 전 페이지 <head>에서 로드.
 * config/auth 다음, 본문 스크립트 전에 둠. */
(function () {
  // ---------- 1) 다크모드 (페인트 전 즉시 적용) ----------
  var de = document.documentElement;
  try { if (localStorage.getItem("neo_theme") === "dark") de.setAttribute("data-theme", "dark"); } catch (e) {}

  function applyTheme(dark) {
    if (dark) de.setAttribute("data-theme", "dark"); else de.removeAttribute("data-theme");
    try { localStorage.setItem("neo_theme", dark ? "dark" : "light"); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#15150F" : "#0A0A0A");
    var btn = document.querySelector(".theme-toggle");
    if (btn) btn.textContent = dark ? "☀️" : "🌙";
  }

  function injectToggle() {
    var bar = document.querySelector(".topbar");
    if (!bar || bar.querySelector(".theme-toggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "다크모드 전환");
    btn.textContent = de.getAttribute("data-theme") === "dark" ? "☀️" : "🌙";
    btn.addEventListener("click", function () {
      applyTheme(de.getAttribute("data-theme") !== "dark");
    });
    bar.appendChild(btn);
  }

  // ---------- 2) 탭 간 스와이프 ----------
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectToggle);
  else injectToggle();
})();
