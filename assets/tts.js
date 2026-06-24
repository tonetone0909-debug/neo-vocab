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
    "en-gb": ["google uk", "uk english", "daniel", "arthur", "kate", "serena", "martha", "oliver", "(uk", "british", "en-gb"],
    "en-us": ["google us", "us english", "samantha", "aaron", "nicky", "fred", "alex", "(us", "en-us"]
  };

  // Pick a voice that truly matches the requested accent. No generic "en" fallback
  // (that would make US and UK pick the same voice). Returns null if none.
  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    const want = lang.toLowerCase();
    // 1) exact lang code
    let v = voices.find(x => x.lang && x.lang.toLowerCase().replace("_", "-") === want);
    if (v) return v;
    // 2) by known accent voice name (restricted to English voices)
    const hints = NAMES[want] || [];
    v = voices.find(x => {
      const nm = (x.name || "").toLowerCase();
      const lg = (x.lang || "").toLowerCase();
      return lg.indexOf("en") === 0 && hints.some(h => nm.indexOf(h) !== -1);
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
