// deck.js — data access + filtering helpers shared across modes.
(function () {
  "use strict";

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // VOCAB ------------------------------------------------------------
  // vocab(skill, deck): both optional. vocab() = all, vocab("reading") = skill,
  // vocab("reading","practical") = skill+deck.
  function vocab(skill, deck) {
    let all = window.NEO_VOCAB || [];
    if (skill) all = all.filter(e => e.skill === skill);
    if (deck) all = all.filter(e => e.deck === deck);
    return all;
  }

  // global lemma → entry index (priority reading > listening; practical > academic)
  let _index = null;
  function buildIndex() {
    const order = { reading: 0, listening: 1, writing: 2, speaking: 3 };
    const deckOrder = { practical: 0, academic: 1 };
    const m = new Map();
    for (const e of window.NEO_VOCAB || []) {
      const k = e.lemma;
      if (!m.has(k)) { m.set(k, e); continue; }
      const cur = m.get(k);
      const better = (order[e.skill] - order[cur.skill]) || (deckOrder[e.deck] - deckOrder[cur.deck]);
      if (better < 0) m.set(k, e);
    }
    return m;
  }
  function byLemma(lemma) {
    if (!_index) _index = buildIndex();
    return _index.get((lemma || "").toLowerCase().trim()) || null;
  }

  // DAYS -------------------------------------------------------------
  // day summary for a vocab deck (practical|academic): [{day,theme,themeLabel,count,studied}]
  function days(deck) {
    const items = vocab(null, deck);
    const m = new Map();
    for (const e of items) {
      if (!m.has(e.day)) m.set(e.day, { day: e.day, count: 0, studied: 0, stars: { 3: 0, 2: 0, 1: 0 } });
      const d = m.get(e.day); d.count++;
      if (e.stars) d.stars[e.stars]++;
      const p = window.NEO_STORE && NEO_STORE.get(e.skill, e.deck, e.lemma);
      if (p && p.box) d.studied++;
    }
    return [...m.values()].sort((a, z) => a.day - z.day);
  }
  // vocab entries for one day of a deck
  function dayWords(deck, day) { return vocab(null, deck).filter(e => e.day === day); }

  // day summary for ctest: count = distinct words; drills grouped by word's day
  function ctestDays() {
    const items = ctest();
    const m = new Map();
    const seen = new Set();
    for (const c of items) {
      if (!m.has(c.day)) m.set(c.day, { day: c.day, theme: c.theme, themeLabel: c.themeLabel, count: 0, drills: 0, studied: 0 });
      const d = m.get(c.day); d.drills++;
      const key = c.day + ":" + c.lemma;
      if (!seen.has(key)) { seen.add(key); d.count++;
        const p = window.NEO_STORE && NEO_STORE.get(c.skill, c.deck, c.lemma);
        if (p && p.box) d.studied++;
      }
    }
    return [...m.values()].sort((a, z) => a.day - z.day);
  }
  function ctestDayDrills(day) { return ctest().filter(c => c.day === day); }

  // BLANKS (card deck) ----------------------------------------------
  function blanks() { return window.NEO_BLANKS || []; }
  function blanksDays() {
    const m = new Map();
    for (const card of blanks()) {
      if (!m.has(card.day)) m.set(card.day, { day: card.day, cards: 0, count: 0, studied: 0 });
      const d = m.get(card.day); d.cards++; d.count += card.words.length;
      for (const w of card.words) {
        const p = window.NEO_STORE && NEO_STORE.get("reading", "ctest", w.lemma);
        if (p && p.box) d.studied++;
      }
    }
    return [...m.values()].sort((a, z) => a.day - z.day);
  }
  function blanksDayCards(day) { return blanks().filter(c => c.day === day); }

  // resolve a stored status key (skill,deck,lemma) → a displayable entry
  let _bkLemma = null;
  function blanksByLemma(lemma) {
    if (!_bkLemma) { _bkLemma = new Map(); for (const c of blanks()) for (const w of c.words) if (!_bkLemma.has(w.lemma)) _bkLemma.set(w.lemma, w); }
    return _bkLemma.get((lemma||"").toLowerCase().trim()) || null;
  }
  function findEntry(skill, deck, lemma) {
    if (deck === "ctest") { const w = blanksByLemma(lemma); return w ? { term: w.answer, meaning: w.meaning, pos: w.pos, skill, deck, lemma } : null; }
    const e = byLemma(lemma);
    return e ? { term: e.term, meaning: e.meaning, pos: e.pos, skill: e.skill, deck: e.deck, lemma: e.lemma } : null;
  }

  // QUIZ -------------------------------------------------------------
  function quiz(deck) {
    const all = window.NEO_QUIZ || [];
    return deck ? all.filter(q => q.deck === deck) : all;
  }

  // C-TEST -----------------------------------------------------------
  function ctest() {
    return (window.NEO_CTEST || []).map(c => ({ ...c, skill: "reading", deck: "ctest" }));
  }

  function meta() { return window.NEO_VOCAB_META || { counts: {} }; }

  window.NEO_DECK = { shuffle, vocab, byLemma, days, dayWords, ctest, ctestDays, ctestDayDrills, blanks, blanksDays, blanksDayCards, blanksByLemma, findEntry, quiz, meta };
})();
