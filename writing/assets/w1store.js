// w1store.js — Writing Task 1 진도(세트별 결과) + 기기간 동기화.
// vocab/assets/store.js 의 동기화 구조를 그대로 미러링(디바운스 push · sendBeacon flush · 로드 시 pull).
// 서버는 같은 Apps Script 백엔드를 쓰되 ns=w1 로 별도 시트("progress_w1")에 저장한다.
// (vocab 진도와 한 셀에 합치면 시트 셀 49,000자 한도를 넘김)
(function () {
  "use strict";
  const KEY = "neo_w1_results";

  // 진도는 코드별로 분리 저장 → 새 코드로 로그인하면 빈 상태(다른 학생 진도와 절대 안 섞임).
  // 인증 OFF(코드 없음)면 기존 단일 키 사용(하위호환 · 로컬 개발).
  function authUrl() { return ((window.NEO_AUTH || {}).url || "").trim(); }
  function getCode() { try { return sessionStorage.getItem("neo_code") || localStorage.getItem("neo_code") || ""; } catch (e) { return ""; } }
  function storeKey() { var c = getCode(); return c ? KEY + ":" + c : KEY; }

  function load() {
    try { return JSON.parse(localStorage.getItem(storeKey())) || {}; }
    catch (e) { return {}; }
  }
  function save(db, skipPush) {
    try { localStorage.setItem(storeKey(), JSON.stringify(db)); } catch (e) {}
    if (!skipPush) syncPush();
  }

  // ---------- 쓰기 (기존 writing.html 정책 유지: 최고점만 남김, 동점이면 덮어씀) ----------
  function attemptOf(cn, s) { return load()["c" + cn + "s" + s]; }
  function examOf(n) { return load()["mock" + n]; }
  function put(key, rec) {
    var r = load(), prev = r[key];
    if (!prev || rec.correct >= prev.correct) { r[key] = rec; save(r); }
  }
  function saveResult(cn, s, rec) { put("c" + cn + "s" + s, rec); }
  function saveExam(n, rec) { put("mock" + n, rec); }

  // ---------- 서버 전송용 축약 ----------
  // marks[10]·ids[10] 은 로컬에만 두고 서버로 올리지 않는다:
  //  · 읽는 곳이 없다(mypage·w1-mock·writing 전부 correct/total/time/ts/concept_n/set_id/exam_id 만 사용)
  //  · 그대로 올리면 210세트에 약 46,000자 → 시트 셀 49,000자 한도에 걸림. 빼면 약 17,000자.
  function slim(db) {
    var o = {};
    for (var k in db) {
      var v = db[k]; if (!v) continue;
      var e = { correct: v.correct || 0, total: v.total || 0, time: v.time || 0, ts: v.ts || 0 };
      if (v.exam_id != null) e.exam_id = v.exam_id;
      if (v.concept_n != null) { e.concept_n = v.concept_n; e.set_id = v.set_id; }
      o[k] = e;
    }
    return o;
  }

  // ---------- push ----------
  let pushTimer = null;
  function syncPush() {
    const url = authUrl(), code = getCode();
    if (!url || !code) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      const data = JSON.stringify(slim(load()));
      fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "setprog", ns: "w1", code: code, data: data }) }).catch(function () {});
    }, 2500);
  }
  // 즉시 전송 — 제출 직후 곧바로 앱을 떠날 때 디바운스 푸시가 유실되지 않게
  function syncFlush() {
    const url = authUrl(), code = getCode();
    if (!url || !code) return;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    const body = JSON.stringify({ action: "setprog", ns: "w1", code: code, data: JSON.stringify(slim(load())) });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain;charset=utf-8" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  // ---------- 병합: 로컬 쓰기 정책과 동일하게 "최고점 우선, 동점이면 최신 ts" ----------
  function mergeEntry(l, s) {
    if (!l) return s; if (!s) return l;
    if ((s.correct || 0) > (l.correct || 0)) return s;
    if ((l.correct || 0) > (s.correct || 0)) return l;
    return (s.ts || 0) > (l.ts || 0) ? s : l;
  }
  function canonEntry(o) {
    if (!o) return "";
    return [o.correct || 0, o.total || 0, o.time || 0, o.ts || 0].join(",");
  }

  let lastPullAt = 0;   // 같은 페이지 로드 내 중복 pull 방지(initSync + auth.js 동시호출 dedupe)
  function pull(force) {
    const url = authUrl(), code = getCode();
    if (!url || !code) return Promise.resolve(null);
    var now = Date.now();
    if (!force && now - lastPullAt < 2000) return Promise.resolve(null);
    lastPullAt = now;
    return fetch(url + "?action=getprog&ns=w1&code=" + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return null;
        var server = {};
        if (d.data) { try { server = JSON.parse(d.data) || {}; } catch (e) { server = {}; } }
        var local = load(), merged = Object.assign({}, local), changed = false;
        for (var k in server) {
          var m = mergeEntry(local[k], server[k]);
          merged[k] = m;
          if (canonEntry(m) !== canonEntry(local[k])) changed = true;   // 다른 기기서 새 진도가 들어옴
        }
        if (changed) save(merged, true);
        syncFlush();                        // 로컬(병합본)을 서버에 즉시 반영 — 서버가 비어 있어도 시드됨
        return { changed: changed, serverItems: Object.keys(server).length, totalItems: Object.keys(merged).length, code: code };
      }).catch(function () { return null; });
  }
  function syncPull() {
    return pull(false).then(function (res) {
      // 받아온 진도를 화면에 반영(페이지가 동기화 전에 렌더됐으므로).
      // 단 작업 중이면 reload 금지:
      //  · #play  = 문제 푸는 중 → 타이머·배치가 날아감
      //  · #result = 채점/리뷰 보는 중 → items·state 가 라이브 변수라 리뷰가 통째로 날아감
      var busy = document.querySelector("#play:not(.hidden)") || document.querySelector("#result:not(.hidden)");
      if (res && res.changed && !busy) location.reload();
    });
  }
  // 수동 동기화 — pull+push 후 요약 반환. reload 안 함(호출측이 다시 그림).
  function forceSync() {
    if (!authUrl()) return Promise.resolve({ ok: false, error: "no_url" });
    if (!getCode()) return Promise.resolve({ ok: false, error: "no_code" });
    return pull(true).then(function (res) {
      return res ? Object.assign({ ok: true }, res) : { ok: false, error: "network" };
    });
  }

  // 매 페이지 로드마다 서버 진도 가져오기(2초 dedupe 내장)
  (function initSync() {
    try {
      if (authUrl() && getCode() && sessionStorage.getItem("neo_auth_ok") === "1") syncPull();
    } catch (e) {}
  })();

  // 앱으로 다시 돌아올 때 재동기화 + 나갈 때 밀린 진도 즉시 푸시
  (function liveSync() {
    var lastPull = 0;
    document.addEventListener("visibilitychange", function () {
      try {
        if (!authUrl() || !getCode() || sessionStorage.getItem("neo_auth_ok") !== "1") return;
        if (document.hidden) { syncFlush(); return; }     // 앱 나갈 때 밀린 진도 즉시 서버로
        var now = Date.now();
        if (now - lastPull < 10000) return;               // 10초 쓰로틀
        lastPull = now;
        syncPull();
      } catch (e) {}
    });
  })();

  window.NEO_W1_STORE = { load, saveResult, saveExam, attemptOf, examOf, slim, syncPull, syncPush, syncFlush, forceSync };
})();
