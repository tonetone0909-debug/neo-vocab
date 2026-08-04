/* render-s.js — Speaking 렌더러 2종. 화면이 **자동으로** 넘어간다.
 *
 * 레이아웃 근거: NEW TOEFL OVERVIEW.pdf p18(Listen and Repeat) · p19(Take an Interview).
 *   상단 중앙에 지시문, 가운데 그림/영상, 하단에 RESPONSE TIME 바 + 마이크 + 카운트다운.
 *
 * Task 1 Listen and Repeat (7문항, 문항마다 개별 화면)
 *   회색 장면 그림에서 그 문장이 가리키는 대상만 컬러로 칠해진 그림이 뜬다
 *   (문항마다 다른 파일). 음원 자동재생 -> 1.5초 뒤 beep -> 녹음
 *   -> 8초(1·2번) / 10초(3~5번) / 12초(6·7번) 카운트다운 -> 저장 -> 다음 문항.
 *
 * Task 2 Take an Interview (4문항)
 *   면접관 영상과 함께 질문 재생 -> 1초 뒤 beep -> 45초 녹음 -> 저장 -> 다음 문항.
 *
 * beep 은 파일 없이 Web Audio 로 만든다. 자산이 하나 줄고 지연도 없다.
 */
(function () {
  "use strict";

  window.NEO_RENDER = window.NEO_RENDER || {};

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }

  var HEAD = {
    repeat: "Listen and repeat only once.",
    interview: "Please answer the interviewer's questions."
  };

  /* 현재 Speaking 문항 흐름의 리소스. 화면이 바뀌기 전(engine 이 draw 전 stopAudio 호출)
   * 오디오·녹음·타이머를 전부 끊어 누수/겹침을 막는다. render-l 의 stopAudio 는 리스닝
   * 것만 알아서, Speaking 은 그 위에 자기 teardown 을 얹는다(로드 순서상 render-l 먼저). */
  var sLive = null;
  function newLive() { sLive = { timeouts: [] }; return sLive; }
  function sTimeout(fn, ms) {
    var id = setTimeout(fn, ms);
    if (sLive) sLive.timeouts.push(id);
    return id;
  }
  var prevStop = window.NEO_RENDER.stopAudio;
  window.NEO_RENDER.stopAudio = function () {
    if (prevStop) { try { prevStop(); } catch (e) {} }   // 리스닝 오디오 정지
    var s = sLive;
    sLive = null;                    // 이후 finish/onstop 은 s!==sLive 라 자동진행 안 함
    if (!s) return;
    try { if (s.dirAu) s.dirAu.pause(); } catch (e) {}
    try { if (s.au) s.au.pause(); } catch (e) {}
    try { if (s.rec && s.rec.state === "recording") s.rec.stop(); } catch (e) {}
    if (s.timer) { try { clearInterval(s.timer); } catch (e) {} }
    (s.timeouts || []).forEach(function (id) { try { clearTimeout(id); } catch (e) {} });
    try { if (s.stream) s.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  };

  /* 짧은 삐 소리. 사용자 제스처 뒤에 호출되므로 재생이 막히지 않는다. */
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ac = window.__neoAC || (window.__neoAC = new Ctx());
      if (ac.state === "suspended") ac.resume();
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.28);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + 0.3);
    } catch (e) { /* 소리가 안 나도 진행은 막지 않는다 */ }
  }

  function mmss(sec) {
    var s = Math.max(0, sec);
    return "00:" + String(Math.floor(s / 60)).padStart(2, "0") +
           ":" + String(s % 60).padStart(2, "0");
  }

  function itemId(g, it) { return g.src + "_" + it.n; }

  function render(host, ctx) {
    newLive();                       // 이 문항 흐름의 리소스 추적 시작(이전 것은 stopAudio 가 이미 정리)
    var g = ctx.group;
    var i = ctx.qi >= 0 ? ctx.qi : 0;
    var it = g.items[i];
    // 태스크 첫 문항 앞: 지시 화면(지시문 + 이미지 + TTS 낭독)을 한 번 보여주고 Q1 로 넘어간다.
    if (i === 0 && !ctx.recs[itemId(g, it)]) {
      directionScreen(host, g, function () { renderQ(host, ctx); });
      return;
    }
    renderQ(host, ctx);
  }

  /* 지시 화면 — 지시문 + 이미지(Task2 면접관 초상 / Task1 흑백 장면) + 여성·US TTS 낭독.
   * 낭독이 끝나야 Next 버튼이 켜지고(그 전엔 회색), Next 를 눌러야 1번 문항으로 넘어간다
   * (자동 전환 시 1번 음원이 잘리던 문제 해결). */
  function directionScreen(host, g, done) {
    host.innerHTML = "";
    var box = el("div", "single speak-single sp-direction");
    box.appendChild(el("div", "sp-head", HEAD[g.t]));
    box.appendChild(el("div", "sp-instr sp-dir-instr", g.instr));
    // Task2 면접관 초상은 g.img, Task1 은 전체 흑백 장면(g.scene). 없으면 텍스트만.
    var dirImg = g.t === "interview" ? (g.img || "") : (g.scene || "");
    if (dirImg) {
      var media = el("div", "sp-media");
      var im = new Image(); im.className = "sp-img"; im.alt = "";
      im.addEventListener("error", function () { im.remove(); });
      im.src = dirImg;
      media.appendChild(im);
      box.appendChild(media);
    }
    var note = el("div", "sp-note", "Listen to the directions.");
    box.appendChild(note);
    var nextWrap = el("div", "sp-dir-next");
    var nextBtn = el("button", "sp-next-btn", "Next →");
    nextBtn.type = "button";
    nextBtn.disabled = true;                 // 안내문 재생 끝나기 전엔 회색(비활성)
    nextWrap.appendChild(nextBtn);
    box.appendChild(nextWrap);
    host.appendChild(box);

    var moved = false;
    function proceed() { if (moved || nextBtn.disabled) return; moved = true; sTimeout(done, 200); }
    nextBtn.addEventListener("click", proceed);
    function ready() {                        // 안내문 낭독 끝 → Next 활성화
      nextBtn.disabled = false;
      note.textContent = "When you are ready, press Next to begin.";
    }
    // 지시문 음원(질문 음원처럼 미리 생성한 여성·US mp3)을 재생. 아직 없으면 브라우저 TTS 폴백.
    if (g.dir_audio) {
      var au = new Audio(g.dir_audio);
      if (sLive) sLive.dirAu = au;
      if (window.NEO_VOL) NEO_VOL.apply(au);
      au.addEventListener("ended", ready);
      au.addEventListener("error", function () { speakTTS(g.instr, ready); });
      var p = au.play();
      if (p && p.catch) p.catch(function () { speakTTS(g.instr, ready); });
    } else {
      speakTTS(g.instr, ready);
    }
  }

  /* 실제 문항 화면 — 매체 + RESPONSE TIME 패널 + 재생/녹음 흐름. */
  function renderQ(host, ctx) {
    var g = ctx.group;
    var i = ctx.qi >= 0 ? ctx.qi : 0;
    var it = g.items[i];
    var last = i === g.items.length - 1;

    var box = el("div", "single speak-single");
    box.appendChild(el("div", "sp-head", HEAD[g.t]));

    var stageBox = el("div", "sp-media");
    box.appendChild(stageBox);

    var panel = el("div", "sp-panel");
    var label = el("div", "sp-panel-label", "RESPONSE TIME");
    var row = el("div", "sp-panel-row");
    var mic = el("span", "sp-mic");
    var clock = el("span", "sp-clock", mmss(it.sec));
    row.appendChild(mic); row.appendChild(clock);
    panel.appendChild(label); panel.appendChild(row);
    box.appendChild(panel);

    var note = el("div", "sp-note", "");
    box.appendChild(note);
    host.appendChild(box);

    /* ---- 매체 ----
     * Task1 은 문항마다 장면 그림이 바뀌고(대상만 컬러), Task2 는 세트당 면접관
     * 스틸 1장을 4문항 내내 그대로 쓴다. 둘 다 정지 이미지라 처리가 같다. */
    var src = g.t === "repeat" ? it.img : (g.img || it.img || "");
    var im = new Image();
    im.className = "sp-img";
    im.alt = "";
    im.addEventListener("error", function () {
      im.remove();
      stageBox.appendChild(el("div", "sp-missing", "Image unavailable"));
    });
    im.src = src;
    stageBox.appendChild(im);

    // 이미 응답한 문항이면 다시 녹음하지 않는다 (되돌아온 경우).
    // free-mode(강사 미리보기)에선 다시 재생·이동할 수 있게 이 조기 return 을 건너뛴다.
    if (ctx.recs[itemId(g, it)] && !ctx.free) {
      note.textContent = "You have already answered this question.";
      panel.classList.add("done");
      clock.textContent = mmss(0);
      return;
    }
    run(ctx, g, it, last, { note: note, panel: panel, clock: clock, mic: mic });
  }

  /* 지시문 TTS — 여성·US 고정. 미지원·실패·onend 누락에도 흐름을 막지 않는다. */
  function pickVoice() {
    try {
      var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
      var us = vs.filter(function (v) { return /en[-_]US/i.test(v.lang); });
      var fem = us.filter(function (v) {
        return /female|samantha|zira|susan|allison|joanna|salli|kendra|aria|jenny|michelle|google us english/i.test(v.name);
      });
      return fem[0] || us[0] || vs[0] || null;
    } catch (e) { return null; }
  }
  function speakTTS(text, onend) {
    var done = false;
    function fin() { if (done) return; done = true; onend(); }
    try {
      var synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance || !text) return fin();
      synth.cancel();
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang = "en-US"; u.rate = 0.95; u.pitch = 1.02;
      var v = pickVoice(); if (v) u.voice = v;
      u.onend = fin; u.onerror = fin;
      synth.speak(u);
      setTimeout(fin, Math.max(4000, String(text).length * 85));   // onend 누락 대비 안전 타임아웃
    } catch (e) { fin(); }
  }

  /* 재생 -> beep -> 녹음 -> 저장 -> 다음. 전 과정이 자동이다. */
  function run(ctx, g, it, last, ui) {
    var mime = window.NEO_MOCK_MIME || "";
    var stream = null;

    function fail(msg) {
      ui.note.textContent = msg;
    }

    var ready = (mime && navigator.mediaDevices)
      ? navigator.mediaDevices.getUserMedia({ audio: true })
          .then(function (s) { stream = s; })
          .catch(function () { fail("Microphone unavailable. The question will play without recording."); })
      : Promise.resolve(fail("Recording is not supported in this browser."));

    ready.then(function () { playQuestion(ctx, g, it, last, ui, stream); });
  }

  function playQuestion(ctx, g, it, last, ui, stream) {
    ui.note.textContent = "Listen to the question.";
    ui.panel.classList.add("waiting");

    var au = new Audio(it.audio);
    if (sLive) sLive.au = au;
    if (window.NEO_VOL) NEO_VOL.apply(au);
    var moved = false;
    function afterAudio() {
      if (moved) return;
      moved = true;
      // 음원이 끝나고 잠깐 뒤 beep — 그 소리가 녹음 시작 신호다
      ui.note.textContent = "Get ready.";
      sTimeout(function () {
        beep();
        startRecording(ctx, g, it, last, ui, stream);
      }, g.beep || 1000);
    }
    au.addEventListener("ended", afterAudio);
    au.addEventListener("error", function () {
      ui.note.textContent = "Audio unavailable. Moving to your response.";
      setTimeout(afterAudio, 400);
    });
    var p = au.play();
    if (p && p.catch) p.catch(function () { setTimeout(afterAudio, 400); });
  }

  function startRecording(ctx, g, it, last, ui, stream) {
    var id = itemId(g, it);
    var rec = null, chunks = [];
    var myLive = sLive;              // 이 흐름을 고정 — 화면 전환되면 sLive 가 바뀌어 자동진행 차단
    if (myLive) myLive.stream = stream;

    if (stream && window.MediaRecorder) {
      try {
        rec = new MediaRecorder(stream, { mimeType: window.NEO_MOCK_MIME });
        if (myLive) myLive.rec = rec;
        rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          var blob = new Blob(chunks, { type: window.NEO_MOCK_MIME });
          NEO_EXAMDB.putRec(ctx.code, ctx.setId, id, blob, window.NEO_MOCK_MIME)
            .then(function () { ctx.mark("recs", id); })
            .catch(function () { ctx.mark("recs", id); })
            .then(function () { finish(); });
        };
        rec.start();
      } catch (e) { rec = null; }
    }

    ui.panel.classList.remove("waiting");
    ui.panel.classList.add("rec");
    ui.note.textContent = "Speak now.";

    // 응답 시간은 절대 시각 기준. 탭이 백그라운드로 가도 어긋나지 않는다.
    var until = Date.now() + it.sec * 1000;
    var done = false;
    var t = setInterval(function () {
      if (sLive !== myLive) { clearInterval(t); return; }   // 화면 전환됨 — 타이머 중단
      var left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      ui.clock.textContent = mmss(left);
      if (left > 0 || done) return;
      done = true;
      clearInterval(t);
      ui.panel.classList.remove("rec");
      ui.panel.classList.add("done");
      if (rec && rec.state === "recording") {
        rec.stop();               // onstop 에서 저장 후 finish()
      } else {
        ctx.mark("recs", id);
        finish();
      }
    }, 200);
    if (myLive) myLive.timer = t;

    function finish() {
      if (sLive !== myLive) return;   // 이미 다른 화면으로 전환(teardown) — 중복 진행/자동이동 방지
      if (stream) stream.getTracks().forEach(function (x) { x.stop(); });
      // free-mode(강사): 자동으로 넘기지 않고 Next 로 진행 — 자동/수동 충돌·오디오 겹침 방지.
      if (ctx.free) { ui.note.textContent = "녹음 완료 — Next 로 넘어가세요."; return; }
      ui.note.textContent = last ? "Speaking section complete." : "Moving to the next question.";
      sTimeout(function () { if (ctx.next) ctx.next(); }, 700);
    }
  }

  window.NEO_RENDER.repeat = render;
  window.NEO_RENDER.interview = render;
})();
