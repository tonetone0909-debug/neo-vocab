// tts.js — Web Speech API wrapper. US (en-US) + UK (en-GB) playback.
// Picks a DISTINCT voice per accent so US and UK don't sound identical.
// Handles voices populating async (voiceschanged) on iOS/Android standalone.
(function () {
  "use strict";
  let voices = [];
  function loadVoices() {
    try { voices = window.speechSynthesis ? (speechSynthesis.getVoices() || []) : []; }
    catch (e) { voices = []; }
  }
  if (window.speechSynthesis) {
    loadVoices();
    try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (e) {}
    try { speechSynthesis.onvoiceschanged = loadVoices; } catch (e) {}
  }

  // accent-specific voice name hints (Android: "Google US/UK English"; Win/macOS/iOS names)
  const NAMES = {
    "en-gb": ["google uk", "uk english", "united kingdom", "kingdom", "daniel", "arthur", "kate", "serena", "martha", "oliver", "(uk", "british", "en-gb"],
    "en-us": ["google us", "us english", "united states", "samantha", "aaron", "nicky", "fred", "alex", "(us", "en-us"]
  };

  function region(v) { return (v && v.lang ? v.lang : "").toLowerCase().replace("_", "-"); }

  // Pick a voice that truly matches the requested accent. No generic "en" fallback
  // (that would make US and UK pick the same voice). Returns null if none.
  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    const want = lang.toLowerCase();              // "en-us" | "en-gb"
    // 1) lang code by PREFIX — 안드로이드 UK 보이스는 "en-gb-x-gbb-local"처럼 접미사가 붙어
    //    정확 일치로는 안 잡힘. 접두 일치로 en-GB / en-US 변형을 모두 포착(이게 US≠UK 핵심).
    let v = voices.find(x => region(x).indexOf(want) === 0);
    if (v) return v;
    // 2) by known accent voice name (예: "English (United Kingdom)"는 lang으로 못 잡힐 때 이름으로)
    const hints = NAMES[want] || [];
    v = voices.find(x => {
      const nm = (x.name || "").toLowerCase();
      return region(x).indexOf("en") === 0 && hints.some(h => nm.indexOf(h) !== -1);
    });
    return v || null;
  }

  function speak(text, lang) {
    if (!window.speechSynthesis || !text) return;   // no return value (defensive)
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.95;
      const v = pickVoice(lang);
      if (v) { u.voice = v; u.lang = v.lang; }       // distinct accent voice
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function supported() { return !!window.speechSynthesis; }

  window.NEO_TTS = { speak, supported, pickVoice };
})();
