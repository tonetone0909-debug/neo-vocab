/* render-w.js — Writing 렌더러 3종.
 *   bas    Build a Sentence  (타일 조립 10문항이 한 화면)
 *   email  Write an Email
 *   disc   Write for an Academic Discussion
 *
 * 레이아웃은 실제 ETS 화면을 따른다 (NEW TOEFL OVERVIEW.pdf p14 · p16):
 *   Email      좌 = 상황+지시 / 우 = "Your Response:" + To·Subject + 도구모음 + 입력창
 *   Discussion 좌 = 지시 + 교수(아바타·이름·질문) / 우 = 학생 답글 + 도구모음 + 입력창
 *   도구모음  Cut · Paste · Undo · Redo · 단어수 토글 · 카운트
 *
 * 주의 (Writing Task1 규칙 v2 §10 — 과거 버그 재발 방지)
 *   - 상태 클래스에 `.empty` 같은 범용 이름 금지. 전역 유틸과 충돌해 빈칸이
 *     부풀었다 붕괴하는 버그가 있었다. `.state-empty` 로 스코프한다.
 *   - 빈칸은 비었을 때와 채웠을 때 **높이가 같아야** 한다.
 *   - 타일 뱅크는 렌더할 때 한 번 더 섞는다.
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

  function words(s) {
    return (s || "").trim() ? (s.trim().match(/[^\s]+/g) || []).length : 0;
  }

  /* 렌더 시 재셔플. 시드가 문항 id 라 새로고침해도 순서가 흔들리지 않는다 —
     매번 바뀌면 학생이 하던 작업 위치를 잃는다. */
  function shuffled(tiles, seed) {
    var out = tiles.slice(), h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 131 + seed.charCodeAt(i)) & 0x7fffffff;
    for (var j = out.length - 1; j > 0; j--) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      var k = h % (j + 1);
      var t = out[j]; out[j] = out[k]; out[k] = t;
    }
    return out;
  }

  /* ---- A. Build a Sentence ---------------------------------------- */
  /* ---- Build a Sentence -------------------------------------------
   * 구조·클래스는 writing/writing.html 과 맞춘다(.frame / .slot / .tile-bank
   * / .tile / .drag-ghost). 두 앱에서 같은 조작을 배우게 하려면 화면도 같아야 한다.
   *
   * 조작 규칙 (사용자 확정)
   *   넣기 = **드래그만**. 타일을 눌러도 들어가지 않는다.
   *   빼기 = **클릭만**. 채워진 칸을 누르면 빠진다(드래그로 빼도 된다).
   * 클릭으로 넣게 두면 순서를 생각하지 않고 앞에서부터 채우게 되어
   * 문장을 조립하는 연습이 되지 않는다.
   */
  function basItem(host, ctx, item, idx) {
    var placed = (ctx.answers[item.id] || []).slice();
    while (placed.length < item.slots) placed.push(null);

    var wrap = el("div", "bas-item");
    var av = basAvatars(item.id);

    // 프롬프트 화자 — 초상화(원형) + 대사. 라벨·회색박스 없음.
    var prow = el("div", "prompt-row");
    prow.appendChild(avatar("", av.a));
    prow.appendChild(el("div", "prompt-text", item.prompt || ""));
    wrap.appendChild(prow);

    // 답하는 화자 — 초상화 + 빈칸 프레임.
    var arow = el("div", "answer-row");
    arow.appendChild(avatar("", av.b));
    var frame = el("div", "frame");
    arow.appendChild(frame);
    wrap.appendChild(arow);

    var bank = el("div", "tile-bank");
    wrap.appendChild(bank);
    host.appendChild(wrap);

    var parts = String(item.frame || "").split("____");

    function repaint() {
      frame.innerHTML = "";
      parts.forEach(function (txt, i) {
        if (txt) frame.appendChild(document.createTextNode(txt));
        if (i >= item.slots) return;
        var s = el("span", "slot");
        s.dataset.slot = String(i);
        if (placed[i] === null || placed[i] === undefined) {
          s.className += " empty";
        } else {
          s.className += " filled";
          s.textContent = placed[i];
        }
        frame.appendChild(s);
      });

      bank.innerHTML = "";
      var order = shuffled(item.tiles, item.id);
      order.forEach(function (t) {
        var b = el("span", "tile", t);
        b.dataset.tile = t;
        // 이미 놓인 타일은 자리를 유지한 채 숨긴다 — 사라지면 뱅크가 들썩인다
        if (placed.indexOf(t) >= 0) b.className += " used";
        bank.appendChild(b);
      });
    }

    function commit() {
      var any = placed.some(function (p) { return p !== null && p !== undefined; });
      ctx.set(item.id, any ? placed.slice() : null);
      repaint();
    }

    /* ---- 드래그 (pointer 이벤트) ----
     * HTML5 drag&drop 대신 pointer 를 쓴다. 터치에서 동작이 일정하고,
     * 6px 임계로 '탭' 과 '드래그' 를 확실히 갈라낼 수 있다. */
    var TH = 6, drag = null;

    function slotEls() { return frame.querySelectorAll(".slot"); }

    function source(target) {
      var tile = target.closest && target.closest(".tile");
      if (tile && bank.contains(tile) && !tile.classList.contains("used")) {
        return { kind: "bank", val: tile.dataset.tile, el: tile };
      }
      var slot = target.closest && target.closest(".slot");
      if (slot && frame.contains(slot)) {
        var i = +slot.dataset.slot;
        if (placed[i] !== null && placed[i] !== undefined) {
          return { kind: "slot", sl: i, val: placed[i], el: slot };
        }
      }
      return null;
    }

    function under(x, y) {
      var list = slotEls();
      for (var i = 0; i < list.length; i++) {
        var r = list[i].getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return { kind: "slot", sl: +list[i].dataset.slot };
        }
      }
      var br = bank.getBoundingClientRect();
      if (x >= br.left && x <= br.right && y >= br.top && y <= br.bottom) {
        return { kind: "bank" };
      }
      return null;
    }

    function clearHover() {
      slotEls().forEach(function (s) { s.classList.remove("drop-hover"); });
      bank.classList.remove("drop-hover");
    }

    function hover(x, y) {
      clearHover();
      var t = under(x, y);
      if (t && t.kind === "slot") slotEls()[t.sl].classList.add("drop-hover");
      else if (t && t.kind === "bank") bank.classList.add("drop-hover");
    }

    wrap.addEventListener("pointerdown", function (e) {
      if (typeof e.button === "number" && e.button !== 0) return;
      var src = source(e.target);
      if (!src) return;
      e.preventDefault();
      drag = { src: src, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    function onMove(e) {
      if (!drag) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved && Math.sqrt(dx * dx + dy * dy) > TH) {
        drag.moved = true;
        var gh = el("div", "drag-ghost", drag.src.val);
        document.body.appendChild(gh);
        drag.ghost = gh;
        drag.src.el.classList.add("dragging");
      }
      if (drag.moved) {
        drag.ghost.style.left = e.clientX + "px";
        drag.ghost.style.top = e.clientY + "px";
        hover(e.clientX, e.clientY);
      }
    }

    function onUp(e) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!drag) return;
      var d = drag;
      drag = null;
      clearHover();
      if (d.ghost) d.ghost.remove();
      d.src.el.classList.remove("dragging");

      if (!d.moved) {
        // 탭: 채워진 칸만 빼기. 뱅크 탭은 무시한다 — 넣기는 드래그 전용.
        if (d.src.kind === "slot") { placed[d.src.sl] = null; commit(); }
        return;
      }

      var t = under(e.clientX, e.clientY);
      if (t && t.kind === "slot") {
        var occ = placed[t.sl];
        if (d.src.kind === "bank") {
          placed[t.sl] = d.src.val;
        } else if (d.src.sl !== t.sl) {
          // 칸끼리 옮기면 자리를 맞바꾼다(빈 칸이면 그냥 이동)
          placed[d.src.sl] = occ === undefined ? null : occ;
          placed[t.sl] = d.src.val;
        }
        commit();
      } else if (t && t.kind === "bank") {
        if (d.src.kind === "slot") { placed[d.src.sl] = null; commit(); }
      }
    }

    repaint();
  }

  window.NEO_RENDER.bas = function (host, ctx) {
    var g = ctx.group;
    var i = ctx.qi >= 0 ? ctx.qi : 0;
    var box = el("div", "single write-single bas-single");
    box.appendChild(el("div", "q-kicker",
      "BUILD A SENTENCE · " + (i + 1) + " / " + g.items.length));
    box.appendChild(el("div", "w-help",
      "Drag the words into the blanks. Click a word in a blank to remove it."));

    // 이 태스크 안에서 어디까지 왔는지 — 채운 문항은 칠해 준다
    var segs = el("div", "bas-segs");
    g.items.forEach(function (it, k) {
      var d = el("div", "bas-seg" + (k === i ? " cur" : ""));
      var a = ctx.answers[it.id];
      if (k !== i && a && a.some(function (x) { return x; })) d.className += " on";
      segs.appendChild(d);
    });
    box.appendChild(segs);

    var list = el("div", "bas-list");
    basItem(list, ctx, g.items[i], i);
    box.appendChild(list);
    host.appendChild(box);
  };

  /* ---- 작문 공통: 도구모음 + 입력창 --------------------------------
   * ETS 화면에 있는 Cut / Paste / Undo / Redo 와 단어수 토글을 그대로 둔다.
   * 실제 시험에서 쓰던 조작을 여기서도 쓸 수 있어야 체감이 맞다. */
  function composer(side, ctx, qid, minw) {
    var wrap = el("div", "compose");

    var bar = el("div", "w-bar");
    var btns = el("div", "w-tools");
    var ta = el("textarea", "w-input");
    ta.value = ctx.answers[qid] || "";
    ta.spellcheck = false;

    // 되돌리기 스택은 직접 관리한다. textarea 기본 undo 는 프로그램적 변경을 못 따라간다.
    var undo = [ta.value], redo = [];

    function push(v) {
      if (undo[undo.length - 1] === v) return;
      undo.push(v);
      redo.length = 0;
    }
    function apply(v) {
      ta.value = v;
      ctx.set(qid, v);
      paint();
    }

    [["Cut", function () {
      var s = ta.selectionStart, e = ta.selectionEnd;
      if (s === e) return;
      var cut = ta.value.slice(s, e);
      if (navigator.clipboard) navigator.clipboard.writeText(cut).catch(function () {});
      var v = ta.value.slice(0, s) + ta.value.slice(e);
      push(ta.value); apply(v);
      ta.setSelectionRange(s, s); ta.focus();
    }], ["Paste", function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) return;
      navigator.clipboard.readText().then(function (txt) {
        var s = ta.selectionStart, e = ta.selectionEnd;
        var v = ta.value.slice(0, s) + txt + ta.value.slice(e);
        push(ta.value); apply(v);
        ta.setSelectionRange(s + txt.length, s + txt.length); ta.focus();
      }).catch(function () {});
    }], ["Undo", function () {
      if (undo.length < 2) return;
      redo.push(undo.pop());
      apply(undo[undo.length - 1]);
      ta.focus();
    }], ["Redo", function () {
      if (!redo.length) return;
      var v = redo.pop();
      undo.push(v);
      apply(v);
      ta.focus();
    }]].forEach(function (p) {
      var b = el("button", "w-tool", p[0]);
      b.addEventListener("click", p[1]);
      btns.appendChild(b);
    });

    // 단어 수는 항상 보인다. 숨기기 토글은 두지 않는다 —
    // 글자 수를 맞춰야 하는 과제라 계속 보이는 편이 낫다.
    var meter = el("div", "w-meter");
    var right = el("div", "w-bar-right");
    right.appendChild(meter);
    bar.appendChild(btns);
    bar.appendChild(right);

    function paint() {
      // 목표치(/100)는 붙이지 않는다. 순수 단어 수만 보여준다.
      meter.textContent = "Word Count: " + words(ta.value);
    }

    var timer = null;
    ta.addEventListener("input", function () {
      ctx.set(qid, ta.value);
      paint();
      // 타이핑마다 스택에 쌓으면 Undo 가 한 글자씩 되돌아간다. 잠깐 멈출 때만 스냅샷.
      clearTimeout(timer);
      timer = setTimeout(function () { push(ta.value); }, 600);
    });

    paint();
    wrap.appendChild(bar);
    wrap.appendChild(ta);
    side.appendChild(wrap);
  }

  /* 원형 아바타. 반신 인물 사진을 동그랗게 잘라 쓴다.
   * 사진이 아직 없거나 로드에 실패하면 이름 첫 글자로 되돌아간다 — 자산이
   * 하나 빠졌다고 화면이 깨지면 안 된다. */
  function avatar(name, src) {
    var d = el("div", "av", (name || "?").trim().charAt(0).toUpperCase());
    if (!src) return d;
    var im = new Image();
    im.alt = "";
    im.onload = function () { d.textContent = ""; d.appendChild(im); };
    im.src = src;
    return d;
  }

  /* Build-a-Sentence 두 화자의 초상화(반신 컷)를 문항 id 로 결정론 배정.
   * 맥락상 아무 조합이나 되므로(남남/여여 포함) 성별은 자유롭게 고른다. */
  function basAvatars(id) {
    var s = String(id || ""), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    function pic(x) {
      var n = (x % 10) + 1;
      return "img/" + (((x >> 4) & 1) ? "man" : "woman") + (n < 10 ? "0" + n : n) + ".png";
    }
    return { a: pic(h), b: pic((h ^ 0x9e3779b9) >>> 0) };
  }

  /* ---- B. Write an Email ------------------------------------------ */
  window.NEO_RENDER.email = function (host, ctx) {
    var g = ctx.group;
    var p = el("div", "pane");
    var left = el("div", "passage-side");
    var right = el("div", "q-side");
    p.appendChild(left); p.appendChild(right);
    host.appendChild(p);

    left.appendChild(el("div", "passage-sub", "WRITE AN EMAIL"));
    left.appendChild(el("p", "w-situation", g.situation));
    left.appendChild(el("p", "w-do",
      "Write an email to " + g.to + ". In your email, do the following."));
    var ul = el("ul", "w-list");
    g.directions.forEach(function (d) { ul.appendChild(el("li", null, d)); });
    left.appendChild(ul);
    left.appendChild(el("p", "w-note",
      "Write as much as you can and in complete sentences."));

    right.appendChild(el("div", "w-resp", "Your Response:"));
    var head = el("div", "mail-head");
    [["To:", g.to], ["Subject:", g.subject]].forEach(function (r) {
      var row = el("div", "mail-row");
      row.appendChild(el("span", "mail-k", r[0]));
      row.appendChild(el("span", "mail-v", r[1]));
      head.appendChild(row);
    });
    right.appendChild(head);
    composer(right, ctx, g.src + "_email", 0);
  };

  /* ---- C. Write for an Academic Discussion -------------------------
   * ETS 는 교수를 좌측(지시문 아래), 학생 답글을 우측(입력창 위)에 둔다. */
  window.NEO_RENDER.disc = function (host, ctx) {
    var g = ctx.group;
    var p = el("div", "pane");
    var left = el("div", "passage-side");
    var right = el("div", "q-side");
    p.appendChild(left); p.appendChild(right);
    host.appendChild(p);

    left.appendChild(el("div", "passage-sub", "WRITE FOR AN ACADEMIC DISCUSSION"));
    left.appendChild(el("p", "w-situation",
      "Your professor is teaching a class. Write a post responding to the professor's question."));
    left.appendChild(el("p", "w-do", "In your response, you should do the following."));
    var ul = el("ul", "w-list");
    ["Express and support your opinion.",
     "Make a contribution to the discussion in your own words."
    ].forEach(function (d) { ul.appendChild(el("li", null, d)); });
    left.appendChild(ul);
    left.appendChild(el("p", "w-note",
      "An effective response will contain at least " + (g.minw || 100) + " words."));

    var prof = el("div", "prof");
    prof.appendChild(avatar(g.prof.name, g.prof.img));
    prof.appendChild(el("div", "prof-name", g.prof.name));
    left.appendChild(prof);
    left.appendChild(el("p", "prof-q", g.prof.text));

    g.posts.forEach(function (s) {
      var d = el("div", "post");
      var who = el("div", "post-who");
      who.appendChild(avatar(s.name, s.img));
      who.appendChild(el("div", "post-name", s.name));
      d.appendChild(who);
      d.appendChild(el("div", "post-text", s.text));
      right.appendChild(d);
    });

    composer(right, ctx, g.src + "_disc", g.minw || 100);
  };
})();
