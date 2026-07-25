/* volume.js — 시험 전체에서 쓰는 볼륨 조절.
 *
 * 브라우저는 기기 볼륨을 못 만진다. 대신 재생하는 모든 Audio 의 volume 을
 * 한 값으로 맞춘다. 사운드 체크에서 맞춘 값이 Listening·Speaking 에 그대로
 * 적용돼야 하므로, 값은 localStorage 에 남겨 새로고침·이탈에도 유지한다.
 *
 * 슬라이더는 <input type="range"> 를 쓰지 않는다.
 *   1) 실제 조작에 반응하지 않는 경우가 있었다(드래그·키보드 모두 값이 안 변함).
 *   2) OS 기본 모양이라 디자인 시스템과 따로 논다.
 * 그래서 pointer 이벤트로 직접 만든다 — 트랙을 누르면 그 위치로 점프하고,
 * 끌면 따라오며, 좌우 키로도 조절된다.
 *
 * 사용
 *   NEO_VOL.apply(audioEl)   재생 직전에 호출 (volume 적용 + 이후 변경 추적)
 *   NEO_VOL.mount(host)      스피커 아이콘 + 슬라이더를 붙인다
 */
(function () {
  "use strict";

  var KEY = "neo_mock_vol";
  var STEP = 0.05;
  var value = 0.8;
  try {
    var saved = parseFloat(localStorage.getItem(KEY));
    if (!isNaN(saved) && saved >= 0 && saved <= 1) value = saved;
  } catch (e) {}

  // 재생 중인 오디오들. 슬라이더를 움직이면 즉시 반영해야 해서 들고 있는다.
  var tracked = [];

  function apply(au) {
    if (!au) return au;
    au.volume = value;
    if (tracked.indexOf(au) < 0) tracked.push(au);
    au.addEventListener("ended", function () {
      var i = tracked.indexOf(au);
      if (i >= 0) tracked.splice(i, 1);
    });
    return au;
  }

  function set(v) {
    // 0.05 배수로 스냅. 부동소수점 노이즈(0.15000000000000002)를 없애려고
    // 소수 둘째 자리에서 끊는다.
    value = Math.round(Math.max(0, Math.min(1, v)) / STEP) * STEP;
    value = Math.round(value * 100) / 100;
    try { localStorage.setItem(KEY, String(value)); } catch (e) {}
    tracked.forEach(function (au) {
      try { au.volume = value; } catch (e) {}
    });
    render();
  }

  function icon(level) {
    var waves = "";
    if (level >= 1) waves += '<path d="M14 9a5 5 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    if (level >= 2) waves += '<path d="M17 6a9 9 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<path d="M4 9h3l4-3.5v13L7 15H4z" fill="currentColor"/>' +
      (level === 0
        ? '<path d="M15 9l5 6M20 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        : waves) +
      '</svg>';
  }

  var mounts = [];

  function render() {
    var lvl = value === 0 ? 0 : (value < 0.5 ? 1 : 2);
    var pctText = Math.round(value * 100) + "%";
    mounts.forEach(function (m) {
      m.btn.innerHTML = icon(lvl);
      m.fill.style.width = (value * 100) + "%";
      m.knob.style.left = (value * 100) + "%";
      m.pct.textContent = pctText;
      m.track.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    });
  }

  function mount(host) {
    var wrap = document.createElement("div");
    wrap.className = "vol";

    var btn = document.createElement("button");
    btn.className = "vol-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Volume");

    var pop = document.createElement("div");
    pop.className = "vol-pop";        // .open 이 붙어야 보인다

    var track = document.createElement("div");
    track.className = "vol-track";
    track.tabIndex = 0;
    track.setAttribute("role", "slider");
    track.setAttribute("aria-label", "Volume");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");

    var fill = document.createElement("div");
    fill.className = "vol-fill";
    var knob = document.createElement("div");
    knob.className = "vol-knob";
    track.appendChild(fill);
    track.appendChild(knob);

    var pct = document.createElement("span");
    pct.className = "vol-pct";

    pop.appendChild(track);
    pop.appendChild(pct);
    wrap.appendChild(btn);
    wrap.appendChild(pop);
    host.appendChild(wrap);

    /* 트랙 위 좌표 -> 값. 누른 자리로 바로 점프하고, 끌면 따라온다. */
    function fromX(clientX) {
      var r = track.getBoundingClientRect();
      if (!r.width) return;
      set((clientX - r.left) / r.width);
    }
    // 드래그 상태를 직접 들고 간다. hasPointerCapture 로 판정하면 캡처가
    // 안 잡히는 환경에서 끌기가 통째로 죽는다(실제로 그랬다).
    var dragging = false;
    track.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      dragging = true;
      if (track.setPointerCapture) {
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
      }
      fromX(e.clientX);
    });
    track.addEventListener("pointermove", function (e) {
      if (dragging) fromX(e.clientX);
    });
    ["pointerup", "pointercancel"].forEach(function (t) {
      track.addEventListener(t, function () { dragging = false; });
    });
    // 트랙 밖에서 손을 떼도 풀린다
    window.addEventListener("pointerup", function () { dragging = false; });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(value + STEP); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(value - STEP); }
      else if (e.key === "Home") { e.preventDefault(); set(0); }
      else if (e.key === "End") { e.preventDefault(); set(1); }
    });

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      pop.classList.toggle("open");
      if (pop.classList.contains("open")) track.focus();
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) pop.classList.remove("open");
    });

    mounts.push({ btn: btn, track: track, fill: fill, knob: knob, pct: pct });
    render();
    return wrap;
  }

  window.NEO_VOL = {
    apply: apply, mount: mount,
    get: function () { return value; },
    set: set
  };
})();
