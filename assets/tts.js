// tts.js — Web Speech API wrapper. US (en-US) + UK (en-GB) playback.
// Handles iOS Safari quirks: voices populate async via onvoiceschanged, and
// speech must be triggered from a user gesture.
(function () {
  "use strict";
  let voices = [];
  function loadVoices() {
    try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
    catch (e) { voices = []; }
  }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  // pick the best voice for a BCP-47 lang, with graceful fallback
  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    const want = lang.toLowerCase();
    // exact
    let v = voices.find(v => v.lang && v.lang.toLowerCase() === want);
    if (v) return v;
    // same primary language (en-*)
    const primary = want.split("-")[0];
    v = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(primary + "-"));
    if (v) return v;
    v = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(primary));
    return v || null;
  }

  // returns the accent actually used: 'US' | 'UK' | 'EN' (fallback) | null
  function speak(text, lang) {
    if (!window.speechSynthesis || !text) return null;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.92;
      const v = pickVoice(lang);
      if (v) { u.voice = v; u.lang = v.lang; }
      speechSynthesis.speak(u);
      if (!v) return "EN";
      const vl = v.lang.toLowerCase();
      if (vl === "en-us") return "US";
      if (vl === "en-gb") return "UK";
      return "EN";
    } catch (e) { return null; }
  }

  function supported() { return !!window.speechSynthesis; }

  window.NEO_TTS = { speak, supported, pickVoice };
})();
