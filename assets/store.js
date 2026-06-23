// store.js — progress + Leitner SRS in localStorage. Shared by all modes.
// Key per item: `${skill}:${deck}:${lemma}` so practical vs academic track apart.
(function () {
  "use strict";
  const KEY = "neo_vocab_progress_v1";
  const BOX_DAYS = [0, 1, 2, 4, 7, 14];  // box 1..5 review intervals (days)
  const DAY = 86400000;

  // today as integer day-number (UTC) — avoids time-of-day drift
  function todayNum() { return Math.floor(Date.now() / DAY); }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }

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
  // reset progress for a set of items [{skill,deck,lemma}]
  function resetItems(items) {
    const db = load();
    for (const it of items) delete db[keyOf(it.skill, it.deck, it.lemma)];
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

  window.NEO_STORE = { get, record, isDue, deckStats, setStatus, markViewed, allByStatus, statusCounts, resetItems, reset, todayNum, dueReview };
})();
