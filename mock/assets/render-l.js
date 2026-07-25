/* render-l.js — Listening 렌더러 4종.
 *   resp     Listen and Choose a Response
 *   convo    Listen to a Conversation
 *   announce Listen to an Announcement
 *   talk     Listen to an Academic Talk
 *
 * 레이아웃은 실제 ETS 화면을 따른다 (NEW TOEFL OVERVIEW.pdf p9~13).
 *
 * 화면이 두 단계다.
 *   1) 듣기 단계  제목 + 그림만 있는 **넓은 화면**. 음원이 자동 재생된다.
 *                 (Task 1 은 이 단계에서 보기를 미리 보여주되 고를 수는 없다)
 *   2) 문항 단계  좌측 그림 · 우측 문항 하나. 음원이 끝나면 넘어간다.
 *
 * 재생 정책: 실제 시험처럼 **한 번만**. 재생 여부를 엔진 상태에 남겨
 * 새로고침으로 다시 듣지 못하게 한다.
 *
 * 화면에 한국어 안내를 두지 않는다. 실제 시험 화면에 없고, 지시는 음원이 준다.
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

  var LABEL = {
    resp: "Listen and choose a response.",
    convo: "Listen to a conversation.",
    announce: "Listen to an announcement.",
    talk: "Listen to a talk."
  };

  /* 화자 도형 — 이미지가 없을 때의 폴백.
   * 라벨(MAN/WOMAN)은 붙이지 않는다. 실제 시험 화면에 없고, 대화 그림은
   * 좌우 배치만으로 누가 누구인지 충분히 읽힌다. */
  function figure(sex) {
    var f = el("div", "fig");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 80 120");
    svg.setAttribute("class", "fig-svg");
    svg.innerHTML =
      '<circle cx="40" cy="28" r="19" fill="none" stroke="currentColor" stroke-width="4"/>' +
      (sex === "W"
        ? '<path d="M40 50 L18 112 h44 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>'
        : '<path d="M22 112 v-40 a18 18 0 0 1 36 0 v40" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>');
    f.appendChild(svg);
    return f;
  }

  function speakerPane(host, g, big) {
    var stage = el("div", "fig-stage" + (big ? " fig-big" : ""));

    function fallback() {
      stage.innerHTML = "";
      var list = (g.t === "convo" && g.speakers && g.speakers.length)
        ? g.speakers : [g.sex || "M"];
      list.forEach(function (s) { stage.appendChild(figure(s)); });
    }

    if (g.img) {
      var im = new Image();
      im.className = "fig-img";
      im.alt = "";
      im.addEventListener("error", fallback);
      im.src = g.img;
      stage.appendChild(im);
    } else {
      fallback();
    }
    host.appendChild(stage);
    return stage;
  }

  /* 보기 목록. Reading 과 같은 A·B·C·D 글자 마커를 쓴다.
   * 타원 라디오는 hover 마다 배경이 다시 칠해져 깜빡였고, 두 섹션의 조작감도
   * 달라졌다. 마커를 통일하면 둘 다 해결된다. */
  function choices(q, ctx, locked) {
    var wrap = el("div", "choices" + (locked ? " locked" : ""));
    wrap.setAttribute("data-qid", q.id);   // 리뷰 화면이 정오 색을 입힐 때 쓴다
    q.opt.forEach(function (text, i) {
      var c = el("label", "choice");
      if (ctx.answers[q.id] === i) c.className += " picked";
      c.appendChild(el("span", "letter", "ABCD"[i]));
      c.appendChild(el("span", "ctext", text));
      c.addEventListener("click", function () {
        if (wrap.classList.contains("locked")) return;
        ctx.set(q.id, i);
        wrap.querySelectorAll(".choice").forEach(function (x) {
          x.classList.remove("picked");
        });
        c.classList.add("picked");
      });
      wrap.appendChild(c);
    });
    return wrap;
  }

  /* 지금 재생 중인 음원. 화면을 벗어나면 반드시 끊어야 한다 —
   * Audio 객체는 DOM 밖에 있어서 host 를 비워도 계속 재생된다.
   * (Next 를 눌렀는데 이전 문항 음원이 계속 들리는 사고가 난다) */
  var playing = null;

  window.NEO_RENDER.stopAudio = function () {
    if (!playing) return;
    try { playing.au.pause(); } catch (e) {}
    // 중간에 끊었어도 '들은 것' 으로 남긴다. 안 그러면 다음 화면에서 처음부터
    // 다시 재생된다 — 음원은 한 번만 듣는 것이 규칙이다.
    if (playing.ctx && playing.ctx.mark) playing.ctx.mark("played", playing.gid);
    playing = null;
  };

  /* 음원 자동 재생.
   * 브라우저 자동재생 정책 때문에 실패할 수 있다(사용자 제스처 없이 시작한 경우).
   * 그때만 재생 버튼을 내놓는다 — 평소엔 버튼 없이 바로 시작한다. */
  function play(g, ctx, onDone, host, fill) {
    window.NEO_RENDER.stopAudio();      // 앞 화면 음원이 남아 있으면 끊는다
    var au = new Audio(g.audio);
    au.preload = "auto";
    if (window.NEO_VOL) NEO_VOL.apply(au);
    var done = false;
    playing = { au: au, ctx: ctx, gid: ctx.gid };

    function finish() {
      if (done) return;
      done = true;
      playing = null;
      ctx.mark("played", ctx.gid);
      onDone();
    }

    au.addEventListener("timeupdate", function () {
      if (au.duration && fill) {
        fill.style.width = (au.currentTime / au.duration * 100) + "%";
      }
    });
    au.addEventListener("ended", finish);
    // 음원이 없거나 로드에 실패해도 시험이 멈추면 안 된다.
    au.addEventListener("error", finish);

    var p = au.play();
    if (p && p.catch) {
      p.catch(function () {
        var btn = el("button", "btn btn-next aud-play", "▶");
        btn.setAttribute("aria-label", "Play");
        btn.addEventListener("click", function () {
          btn.remove();
          var p2 = au.play();
          if (p2 && p2.catch) p2.catch(finish);
        });
        if (host) host.appendChild(btn);
      });
    }
    return au;
  }

  /* 안내 나레이션. 끝나면(또는 못 틀면) done() 으로 넘어간다.
   * 이 음원은 '한 번만 재생' 규칙의 대상이 아니다 — 안내일 뿐이라
   * played 에 기록하지 않는다. */
  var NARR_GAP = 1500;   // 나레이션이 끝나고 본 음원까지의 텀

  function narrate(src, done) {
    if (!src) return done();
    var au = new Audio(src);
    if (window.NEO_VOL) NEO_VOL.apply(au);
    var moved = false;
    // 정상 종료면 텀을 두고, 재생 실패면 기다리지 않는다 —
    // 소리가 안 난 채로 1.5초 멈춰 있으면 화면이 멈춘 것처럼 보인다.
    function go(wait) {
      if (moved) return;
      moved = true;
      if (wait) setTimeout(done, NARR_GAP); else done();
    }
    au.addEventListener("ended", function () { go(true); });
    au.addEventListener("error", function () { go(false); });
    var p = au.play();
    if (p && p.catch) p.catch(function () { go(false); });
  }

  function render(host, ctx) {
    var g = ctx.group, q = g.q[ctx.qi];
    var heard = !!ctx.played[ctx.gid];

    /* ---- 문항 화면: 좌측 그림 · 우측 문항 하나 ----
     * locked=true 면 보기를 보여주되 고르지는 못한다. */
    function questionView(locked) {
      host.textContent = "";
      var pane = el("div", "pane listen-pane");
      var left = el("div", "passage-side fig-side");
      var right = el("div", "q-side");
      pane.appendChild(left); pane.appendChild(right);
      host.appendChild(pane);

      speakerPane(left, g);
      right.appendChild(el("div", "q-stem", q.stem || LABEL.resp));
      var ch = choices(q, ctx, locked);
      right.appendChild(ch);
      return { left: left, choices: ch };
    }

    /* ---- Task 1 (Choose a Response) ----
     * 문항 화면을 그대로 두고 음원만 자동 재생한다. 듣는 동안 보기를 읽을 수
     * 있어야 하고(실제 시험이 그렇다), 다만 재생이 끝나기 전에는 못 고른다. */
    function respFlow() {
      var v = questionView(true);
      var bar = el("div", "aud-bar");
      var fill = el("div", "aud-fill");
      bar.appendChild(fill);
      v.left.appendChild(bar);

      play(g, ctx, function () {
        bar.remove();
        v.choices.classList.remove("locked");
        if (ctx.arm) ctx.arm();      // 여기서부터 답변 시간이 돈다
      }, v.left, fill);
    }

    /* ---- Task 2~4 ----
     * 듣는 동안에는 문항을 아예 감춘다. 제목 + 그림만 있는 넓은 화면에서
     * 음원이 자동 재생되고, 끝나면 문항 화면으로 넘어간다. */
    function listenFlow() {
      host.textContent = "";
      var box = el("div", "listen-stage");
      box.appendChild(el("h2", "listen-title", g.label || LABEL[g.t] || ""));
      speakerPane(box, g, true);

      var bar = el("div", "aud-bar");
      var fill = el("div", "aud-fill");
      bar.appendChild(fill);
      box.appendChild(bar);
      host.appendChild(box);

      function main() {
        play(g, ctx, function () {
          if (ctx.arm) ctx.arm();
          questionView(false);
        }, box, fill);
      }
      // 제목을 소리로 먼저 읽어준다(실제 시험이 그렇다). 파일이 없거나
      // 재생이 막히면 곧장 본 음원으로 넘어간다 — 시험이 멈추면 안 된다.
      narrate(g.narr, main);
    }

    if (heard) questionView(false);
    else if (g.t === "resp") respFlow();
    else listenFlow();
  }

  ["resp", "convo", "announce", "talk"].forEach(function (t) {
    window.NEO_RENDER[t] = render;
  });
})();
