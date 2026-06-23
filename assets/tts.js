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

  // pick a voice EXACTLY matching the requested accent (en-US / en-GB).
  // No primary-language fallback — a wrong-accent fallback would make US and UK
  // sound identical. If none, return null and let the OS apply u.lang.
  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    const want = lang.toLowerCase();
    return voices.find(v => v.lang && v.lang.toLowerCase().replace("_", "-") === want) || null;
  }

  function speak(text, lang) {
    if (!window.speechSynthesis || !text) return null;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;            // keep requested accent so the OS can apply it
      u.rate = 0.95;
      const v = pickVoice(lang);
      if (v) u.voice = v;       // only assign an exact-accent voice; never override u.lang
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return null; }
  }

  function supported() { return !!window.speechSynthesis; }

  window.NEO_TTS = { speak, supported, pickVoice };
})();
