// store.js — progress + Leitner SRS in localStorage. Shared by all modes.
// Key per item: `${skill}:${deck}:${lemma}` so practical vs academic track apart.
(function () {
  "use strict";
  const KEY = "neo_vocab_progress_v1";
  const OWNER = "neo_prog_owner";       // 현재 로컬 진도가 '어느 코드'의 것인지 표시(코드 바뀌면 교체용)
  const BOX_DAYS = [0, 1, 2, 4, 7, 14];  // box 1..5 review intervals (days)
  const DAY = 86400000;

  // today as integer day-number (UTC) — avoids time-of-day drift
  function todayNum() { return Math.floor(Date.now() / DAY); }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(db, skipPush) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
    try { var c = getCode(); if (c) localStorage.setItem(OWNER, c); } catch (e) {}   // 이 진도의 소유 코드 표시
    if (!skipPush) syncPush();
  }

  // ---------- 기기간 진도 동기화 (Apps Script 백엔드) ----------
  function authUrl() { return ((window.NEO_AUTH || {}).url || "").trim(); }
  function getCode() { try { return sessionStorage.getItem("neo_code") || localStorage.getItem("neo_code") || ""; } catch (e) { return ""; } }
  function studiedOnly(db) { const o = {}; for (const k in db) { const v = db[k]; if (v && ((v.box || 0) > 0 || v.status || v.viewed)) o[k] = v; } return o; }

  let pushTimer = null;
  function syncPush() {
    const url = authUrl(), code = getCode();
    if (!url || !code) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      const data = JSON.stringify(studiedOnly(load()));
      fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "setprog", code: code, data: data }) }).catch(function () {});
    }, 2500);
  }
  // 즉시 전송 — 초기화 후 곧바로 페이지를 떠날 때 디바운스 푸시가 유실되지 않게(서버 반영 보장)
  function syncFlush() {
    const url = authUrl(), code = getCode();
    if (!url || !code) return;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    const body = JSON.stringify({ action: "setprog", code: code, data: JSON.stringify(studiedOnly(load())) });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain;charset=utf-8" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }
  function mergeEntry(l, s) {
    if (!l) return s; if (!s) return l;
    const newer = (l.lastDay || 0) >= (s.lastDay || 0) ? l : s;
    const older = newer === l ? s : l;
    const m = {
      box: Math.max(l.box || 0, s.box || 0),
      seen: Math.max(l.seen || 0, s.seen || 0),
      correct: Math.max(l.correct || 0, s.correct || 0),
      dueDay: newer.dueDay || older.dueDay || 0,
      lastDay: Math.max(l.lastDay || 0, s.lastDay || 0),
    };
    const st = newer.status || older.status; if (st) m.status = st;
    if (l.viewed || s.viewed) m.viewed = true;
    return m;
  }
  // 한 항목의 의미 있는 값만 직렬화(속성 순서 차이로 인한 헛 reload 방지)
  function canonEntry(o) {
    if (!o) return "";
    return [o.box || 0, o.seen || 0, o.correct || 0, o.dueDay || 0, o.lastDay || 0, o.status || "", o.viewed ? 1 : 0].join(",");
  }
  function canonAll(db) {     // 전체 진도를 순서 무관 정규화(변경 감지용)
    var ks = Object.keys(db || {}).sort();
    return ks.map(function (k) { return k + "=" + canonEntry(db[k]); }).join("|");
  }
  function syncPull() {
    const url = authUrl(), code = getCode();
    if (!url || !code) return Promise.resolve();
    var owner = ""; try { owner = localStorage.getItem(OWNER) || ""; } catch (e) {}   // 비동기 전에 캡처(레이스 방지)
    return fetch(url + "?action=getprog&code=" + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        var server = {};
        if (d.data) { try { server = JSON.parse(d.data) || {}; } catch (e) { server = {}; } }
        var local = load();

        // 로컬 진도가 '다른 코드'의 것이면 합치지 않고 이 코드의 서버 진도로 교체.
        // (코드를 바꿔 로그인했을 때 이전 진도가 새 코드로 새어드는 것 방지 → 같은 코드면 어느 기기서나 동일)
        if (owner && owner !== code) {
          var changedA = canonAll(server) !== canonAll(local);
          save(server, true);              // 로컬을 서버 그대로 교체(save가 OWNER를 현재 code로 갱신)
          syncFlush();
          if (changedA) location.reload();
          return;
        }

        // 같은 코드(또는 소유 코드 미설정) → 합치기(진도 손실 방지)
        var merged = Object.assign({}, local), changed = false;
        for (var k in server) {
          var m = mergeEntry(local[k], server[k]);
          merged[k] = m;
          if (canonEntry(m) !== canonEntry(local[k])) changed = true;   // 다른 기기서 새 진도가 들어옴
        }
        if (changed) save(merged, true);
        else { try { if (code) localStorage.setItem(OWNER, code); } catch (e) {} }   // 변화 없어도 소유 코드는 확정
        syncFlush();                       // 로컬(병합본)을 서버에 즉시 반영 — 서버가 비어 있어도 시드됨
        if (changed) location.reload();     // 받아온 진도를 화면에 반영(페이지가 동기화 전에 렌더됐으므로)
      }).catch(function () {});
  }
  // 앱 실행(로그인 세션)당 1회 서버 진도 가져오기
  (function initSync() {
    try {
      if (authUrl() && getCode() && sessionStorage.getItem("neo_auth_ok") === "1" && !sessionStorage.getItem("neo_synced")) {
        sessionStorage.setItem("neo_synced", "1");
        syncPull();
      }
    } catch (e) {}
  })();

  // 앱으로 다시 돌아올 때마다 재동기화(다른 기기 변경 반영) + 나갈 때 밀린 진도 즉시 푸시
  // → 두 기기를 동시에 띄워놔도 전환하면 최신으로 맞춰짐("실시간처럼")
  (function liveSync() {
    var lastPull = 0;
    document.addEventListener("visibilitychange", function () {
      try {
        if (!authUrl() || !getCode() || sessionStorage.getItem("neo_auth_ok") !== "1") return;
        if (document.hidden) { syncFlush(); return; }     // 앱 나갈 때 밀린 진도 즉시 서버로
        var now = Date.now();
        if (now - lastPull < 10000) return;               // 10초 쓰로틀(과도한 호출 방지)
        lastPull = now;
        syncPull();                                       // 돌아올 때 최신 받아오기(변경 있으면 화면 갱신)
      } catch (e) {}
    });
  })();

  function keyOf(skill, deck, lemma) { return `${skill}:${deck}:${lemma}`; }

  function get(skill, deck, lemma) {
    const db = load();
    return db[keyOf(skill, deck, lemma)] || null;
  }

  // record a review result. correct → box+1, wrong → box 1.
  function record(skill, deck, lemma, correct) {
    const db = load();
    const k = keyOf(skill, deck, lemma);
    const cur = db[k] || { box: 0, seen: 0, correct: 0, due: 0 };
    cur.seen += 1;
    if (correct) { cur.correct += 1; cur.box = Math.min(5, (cur.box || 0) + 1); }
    else { cur.box = 1; }
    cur.dueDay = todayNum() + BOX_DAYS[cur.box];
    cur.lastDay = todayNum();
    db[k] = cur;
    save(db);
    return cur;
  }

  // is this item due for review today?
  function isDue(skill, deck, lemma) {
    const p = get(skill, deck, lemma);
    if (!p || !p.box) return true;          // never studied → due
    return (p.dueDay || 0) <= todayNum();
  }

  // deck-level stats over an array of items having {skill,deck,lemma}
  function deckStats(items) {
    const db = load();
    let studied = 0, mastered = 0, due = 0;
    for (const it of items) {
      const p = db[keyOf(it.skill, it.deck, it.lemma)];
      if (p && p.box) {
        studied++;
        if (p.box >= 5) mastered++;
        if ((p.dueDay || 0) <= todayNum()) due++;
      } else {
        due++; // unseen counts as due
      }
    }
    return { total: items.length, studied, mastered, due };
  }

  // self-curated status: 'known' (학습완료) | 'learning' (학습중) | null
  function setStatus(skill, deck, lemma, status) {
    const db = load();
    const k = keyOf(skill, deck, lemma);
    const cur = db[k] || { box: 0, seen: 0, correct: 0, due: 0 };
    if (status) cur.status = status; else delete cur.status;
    db[k] = cur; save(db);
    return cur;
  }
  // mark a word as merely viewed (확인한 단어) — does not set a status
  function markViewed(skill, deck, lemma) {
    const db = load();
    const k = keyOf(skill, deck, lemma);
    const cur = db[k] || { box: 0, seen: 0, correct: 0, due: 0 };
    cur.viewed = true;
    db[k] = cur; save(db);
    return cur;
  }
  // all entries matching a list → [{skill,deck,lemma}]
  // status: 'learning' | 'known' | 'viewed' (viewed = 확인했지만 분류 안 함)
  function allByStatus(status) {
    const db = load(); const out = [];
    for (const k in db) {
      const v = db[k]; if (!v) continue;
      const match = status === "viewed" ? (v.viewed && !v.status) : (v.status === status);
      if (match) { const [skill, deck, ...rest] = k.split(":"); out.push({ skill, deck, lemma: rest.join(":") }); }
    }
    return out;
  }
  function statusCounts() {
    const db = load(); let learning = 0, known = 0, viewed = 0;
    for (const k in db) { const v = db[k]; if (!v) continue;
      if (v.status === "learning") learning++; else if (v.status === "known") known++;
      else if (v.viewed) viewed++; }
    return { learning, known, viewed };
  }
  // reset progress for a set of items [{skill,deck,lemma}] — 기록 통째 삭제
  function resetItems(items) {
    const db = load();
    for (const it of items) delete db[keyOf(it.skill, it.deck, it.lemma)];
    save(db);
  }
  // 리스트 초기화: '확인한/헷갈리는/외운' 수동 분류만 해제(학습 진도 box는 유지).
  // 분류·진도가 모두 비면 기록 자체를 삭제.
  function clearStatusItems(items) {
    const db = load();
    for (const it of items) {
      const k = keyOf(it.skill, it.deck, it.lemma);
      const v = db[k]; if (!v) continue;
      delete v.status; delete v.viewed;
      if (!(v.box > 0) && !(v.seen > 0)) delete db[k]; else db[k] = v;
    }
    save(db);
  }
  // 덱/Day 진도 초기화: SRS 학습 진도(box·복습일)만 0으로(수동 분류 viewed/status는 유지).
  // 분류·진도가 모두 비면 기록 자체를 삭제.
  function clearProgressItems(items) {
    const db = load();
    for (const it of items) {
      const k = keyOf(it.skill, it.deck, it.lemma);
      const v = db[k]; if (!v) continue;
      delete v.box; delete v.seen; delete v.correct; delete v.dueDay; delete v.lastDay; delete v.due;
      if (!v.status && !v.viewed) delete db[k]; else db[k] = v;
    }
    save(db);
  }

  function reset() { save({}); }

  // 오늘 복습 대상 — 이미 학습했고(box>=1) 복습 시점이 도래한 항목만 (미학습 신규 제외)
  function dueReview() {
    const db = load(); const t = todayNum(); const out = [];
    for (const k in db) {
      const v = db[k]; if (!v || !v.box) continue;
      if ((v.dueDay || 0) <= t) {
        const [skill, deck, ...rest] = k.split(":");
        out.push({ skill, deck, lemma: rest.join(":") });
      }
    }
    return out;
  }

  window.NEO_STORE = { get, record, isDue, deckStats, setStatus, markViewed, allByStatus, statusCounts, resetItems, clearStatusItems, clearProgressItems, reset, todayNum, dueReview, syncPull, syncPush, syncFlush };
})();
