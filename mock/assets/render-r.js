/* render-r.js — Reading 렌더러.
 *
 * 규칙 근거: 1. context/모의고사 지문·문항 렌더링 규칙.md
 *   §1 Complete the Words — 접두 볼드 없음 / 번호 없음 / 빈칸 자간 1.6px
 *   §2 Daily Life — 장르별 실용문 레이아웃 (내용 왜곡 없이 겉모습만)
 *   §3 음영 — 해당 문항으로 이동했을 때만 보인다
 *   §4 신유형 — insertion 마커 볼드 / identification 문장 클릭
 *
 * 레지스트리 window.NEO_RENDER 에 그룹 타입별로 등록한다. 엔진이 여기서 꺼내 쓴다.
 *   ctx = {group, gid, qi, answers, flags, set(qid,val), flag(qid)}
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

  function pane(host) {
    var p = el("div", "pane");
    var a = el("div", "passage-side");
    var b = el("div", "q-side");
    p.appendChild(a); p.appendChild(b);
    host.appendChild(p);
    return { left: a, right: b };
  }

  /* ---- 음영 (§3) --------------------------------------------------
   * 텍스트 노드를 훑어 target 첫 등장만 <mark>로 감싼다.
   * 지문에 같은 단어가 여러 번 나와도 첫 번째만 칠하는 게 원형이다. */
  function markFirst(root, target) {
    if (!target) return false;
    var want = target.toLowerCase();
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var i = node.nodeValue.toLowerCase().indexOf(want);
      if (i < 0) continue;
      var after = node.splitText(i);
      after.splitText(target.length);
      var m = el("mark", "hl");
      m.textContent = after.nodeValue;
      after.parentNode.replaceChild(m, after);
      return true;
    }
    return false;
  }

  /* ---- 객관식 문항 ------------------------------------------------- */
  function question(side, ctx, q, label, passageRoot, hideOpt) {
    side.appendChild(el("div", "q-kicker", label));

    var stem = el("div", "q-stem", q.stem);
    side.appendChild(stem);
    // 문항과 지문 양쪽에 음영. 이 화면(=이 문항)에서만 칠해지므로 자동으로
    // '해당 문제로 이동했을 때만 보인다' 가 지켜진다.
    (q.hl || []).forEach(function (h) {
      markFirst(stem, h.q);
      if (h.p && passageRoot) markFirst(passageRoot, h.p);
    });

    // 삽입·식별은 지문 안의 마커/문장을 직접 클릭해 답한다 → 우측 A~D 보기는 렌더하지 않는다.
    if (hideOpt) return;

    var wrap = el("div", "choices");
    // 리뷰 화면이 이 문항의 선택지를 찾아 정답/오답 색을 입힌다(review.js).
    wrap.setAttribute("data-qid", q.id);
    q.opt.forEach(function (text, i) {
      var c = el("label", "choice");
      if (ctx.answers[q.id] === i) c.className += " picked";
      c.appendChild(el("span", "letter", "ABCD"[i]));
      c.appendChild(el("span", "ctext", text));
      c.addEventListener("click", function () {
        ctx.set(q.id, i);
        wrap.querySelectorAll(".choice").forEach(function (x) {
          x.classList.remove("picked");
        });
        c.classList.add("picked");
      });
      wrap.appendChild(c);
    });
    side.appendChild(wrap);

  }

  /* ---- A. Complete the Words (§1) ---------------------------------
   * 빈칸 하나 = 빠진 글자 수만큼의 **한 글자짜리 칸**. 앞칸부터 순서대로 채운다.
   * 한 칸을 채우면 다음 칸으로, 그 단어를 다 채우면 다음 단어의 첫 칸으로 자동 이동. */
  window.NEO_RENDER.ctw = function (host, ctx) {
    var g = ctx.group;
    var box = el("div", "single ctw-single");
    box.appendChild(el("div", "ctw-help", "Fill in the missing letters."));

    var meta = {};
    g.blanks.forEach(function (b) { meta[b.n] = b; });

    var cells = [];          // 전 빈칸의 칸을 한 줄로 이어붙인 목록 (자동 이동용)
    var p = el("div", "passage ctw-body");

    g.text.split(/(\[\[\d+\]\])/).forEach(function (seg) {
      var m = seg.match(/^\[\[(\d+)\]\]$/);
      if (!m) {
        if (seg) p.appendChild(document.createTextNode(seg));
        return;
      }
      var n = parseInt(m[1], 10);
      var b = meta[n] || { stem: "", miss: 4 };
      var qid = ctx.gid + "_b" + n;
      var slot = el("span", "blank");
      // 리뷰 화면이 빈칸별로 정답을 병기할 수 있게 표시해 둔다(review.js).
      slot.setAttribute("data-qid", qid);
      // 접두는 볼드 없이, 음영 없이 본문 그대로 (§1)
      slot.appendChild(el("span", "bstem", b.stem));

      var saved = ctx.answers[qid] || "";
      var tail = saved.toLowerCase().indexOf(b.stem.toLowerCase()) === 0
        ? saved.slice(b.stem.length) : "";

      var box2 = el("span", "bcells");
      var mine = [];
      for (var i = 0; i < b.miss; i++) {
        var c = el("input", "bcell");
        c.type = "text";
        c.autocomplete = "off";
        c.spellcheck = false;
        c.maxLength = 1;
        c.value = tail[i] || "";
        c.setAttribute("aria-label", "Blank " + n + " " + (i + 1) + "/" + b.miss);
        box2.appendChild(c);
        mine.push(c);
        cells.push(c);
      }
      slot.appendChild(box2);
      p.appendChild(slot);

      // 이 빈칸의 칸들을 모아 답으로 저장한다
      function commit() {
        var v = mine.map(function (x) { return x.value; }).join("").trim();
        ctx.set(qid, v ? b.stem + v : "");
      }
      mine.forEach(function (c, i) {
        c.addEventListener("input", function () {
          c.value = c.value.replace(/[^A-Za-z'-]/g, "").slice(0, 1);
          commit();
          if (c.value) focusNext(c);
        });
        c.addEventListener("keydown", function (e) {
          if (e.key === "Backspace" && !c.value) { e.preventDefault(); focusPrev(c); }
          else if (e.key === "ArrowRight") { e.preventDefault(); focusNext(c); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); focusPrev(c); }
        });
        c.addEventListener("focus", function () { c.select(); });
      });
    });

    function focusNext(c) {
      var i = cells.indexOf(c);
      if (i >= 0 && i + 1 < cells.length) cells[i + 1].focus();
    }
    function focusPrev(c) {
      var i = cells.indexOf(c);
      if (i > 0) { cells[i - 1].focus(); }
    }

    box.appendChild(p);
    host.appendChild(box);
  };

  /* ---- B. Read in Daily Life (§2) ---------------------------------
   * 원본 docx 의 표·레이아웃이 md 변환에서 뭉개졌다. 장르별로 실제 문서처럼 되살린다.
   * 텍스트는 원본 그대로 — 레이아웃만 입힌다(내용 누락·왜곡 금지). */

  function kvHead(rows) {
    var h = el("div", "doc-head");
    rows.forEach(function (b) {
      var row = el("div", "kv");
      row.appendChild(el("span", "kv-k", b.k));
      row.appendChild(el("span", "kv-v", b.v));
      h.appendChild(row);
    });
    return h;
  }

  /* 블록 배열을 [{kv:[...]}, {t:'p'|'h'|'li'|'turn'}...] 형태로 묶는다 */
  function group(blocks) {
    var out = [], kv = null;
    blocks.forEach(function (b) {
      if (b.t === "kv") {
        if (!kv) { kv = []; out.push({ kind: "kv", rows: kv }); }
        kv.push(b);
      } else {
        kv = null;
        out.push({ kind: b.t, b: b });
      }
    });
    return out;
  }

  /* 장르별 렌더. 반환된 노드가 지문 영역에 들어간다. */
  function buildDoc(g) {
    var comp = g.comp, genre = g.genre;
    var wrap = el("div", "doc doc-" + comp + " g-" + genre);
    var items = group(g.blocks);
    var list = null;

    // 채팅: 오른쪽 말풍선은 **분량이 가장 많은 화자 한 명**으로 고정, 나머지는 전부 왼쪽.
    var rightWho = null, vol = {};
    g.blocks.forEach(function (b) {
      if (b.t === "turn") vol[b.who] = (vol[b.who] || 0) + String(b.text || "").length;
    });
    Object.keys(vol).forEach(function (w) {
      if (rightWho === null || vol[w] > vol[rightWho]) rightWho = w;
    });

    items.forEach(function (it, idx) {
      if (it.kind === "kv") {
        wrap.appendChild(kvHead(it.rows));
        list = null;
        return;
      }
      var b = it.b;
      if (it.kind === "turn") {
        // 채팅 — 최다 분량 화자만 오른쪽(turn-right), 나머지는 왼쪽
        var t = el("div", "turn" + (b.who === rightWho ? " turn-right" : ""));
        var meta = el("div", "turn-meta");
        meta.appendChild(el("span", "turn-who", b.who));
        if (b.at) meta.appendChild(el("span", "turn-at", b.at));
        t.appendChild(meta);
        t.appendChild(el("div", "turn-text", b.text));
        wrap.appendChild(t);
        list = null;
        return;
      }
      if (it.kind === "li") {
        if (!list) { list = el("ul", "doc-list"); wrap.appendChild(list); }
        list.appendChild(el("li", null, b.text));
        return;
      }
      list = null;
      if (it.kind === "h") {
        wrap.appendChild(el("h3", "doc-h", b.text));
        return;
      }
      if (it.kind === "h2") {
        wrap.appendChild(el("h4", "doc-h2", b.text));
        return;
      }
      // 본문 문단. 영수증은 '항목 금액' 줄이 많아 우측 정렬로 갈라준다.
      if (genre === "receipt") {
        var m = b.text.match(/^(.{1,44}?)\s{2,}([^\s]{1,16})$/) ||
                b.text.match(/^(.+?)\s+([€$₩£]\s?[\d,.]+)$/);
        if (m) {
          var row = el("div", "rc-line");
          row.appendChild(el("span", null, m[1]));
          row.appendChild(el("span", "rc-amt", m[2]));
          wrap.appendChild(row);
          return;
        }
      }
      wrap.appendChild(el("p", null, b.text));
    });

    // 장르별 머리 장식 — 실제 문서처럼 보이게 하는 최소한의 크롬
    if (comp === "email") wrap.insertBefore(el("div", "doc-tag", "MESSAGE"), wrap.firstChild);
    if (genre === "notice" || genre === "announcement") {
      wrap.insertBefore(el("div", "doc-tag", "NOTICE"), wrap.firstChild);
    }
    if (genre === "receipt") wrap.insertBefore(el("div", "doc-tag", "RECEIPT"), wrap.firstChild);
    return wrap;
  }

  window.NEO_RENDER.daily = function (host, ctx) {
    var g = ctx.group, s = pane(host);
    // 헤더 = 장르 라벨("Read an email." 등, genre_label). 없으면 장르명으로.
    var head = (g.label || ("Read a " + g.genre)).replace(/\.\s*$/, "").toUpperCase();
    s.left.appendChild(el("div", "passage-sub", head));
    var doc = buildDoc(g);
    s.left.appendChild(doc);
    question(s.right, ctx, g.q[ctx.qi], head, doc);
  };

  /* ---- C. Read an Academic Passage -------------------------------- */

  /* 문장 단위로 쪼갠다 (Sentence Identification 용). 약어의 마침표에 걸리지 않게
   * 뒤에 공백+대문자가 오는 경우만 경계로 본다. */
  function sentences(text) {
    var out = [], buf = "";
    var parts = text.split(/(?<=[.!?])\s+(?=[A-Z"'\[])/);
    parts.forEach(function (p) { if (p.trim()) out.push(p); });
    return out.length ? out : [text];
  }

  window.NEO_RENDER.academic = function (host, ctx) {
    var g = ctx.group, s = pane(host);
    var q = g.q[ctx.qi];
    var qt = q.qt || "";

    s.left.appendChild(el("div", "passage-sub", "READ AN ACADEMIC PASSAGE"));
    s.left.appendChild(el("h2", "passage-title", g.title));

    var p = el("div", "passage");
    g.para.forEach(function (t, i) {
      var par = el("p");

      if (qt === "identify" && q.para && i !== (q.para - 1)) {
        // 지정 문단이 아니면 평문 — 그 문단 문장만 클릭 가능해야 한다.
        par.appendChild(document.createTextNode(t));
      } else if (qt === "identify") {
        // 문장을 직접 클릭해 고른다. 고른 문장은 볼드 (§4). q.para 있으면 그 문단만 여기 옴.
        sentences(t).forEach(function (sen, k) {
          var sid = i + "." + k;
          var sp = el("span", "sen", sen);
          if (ctx.answers[q.id] === sid) sp.className += " picked-sen";
          sp.addEventListener("click", function () {
            var cur = ctx.answers[q.id];
            ctx.set(q.id, cur === sid ? null : sid);
            p.querySelectorAll(".sen").forEach(function (x) {
              x.classList.remove("picked-sen");
            });
            if (cur !== sid) sp.classList.add("picked-sen");
          });
          par.appendChild(sp);
          par.appendChild(document.createTextNode(" "));
        });
      } else if (/\[[A-D]\]/.test(t)) {
        // 삽입 위치 마커. 해당 문항일 때만 볼드로 뜬다 (§4)
        var seg = t.split(/(\[[A-D]\])/);
        seg.forEach(function (x) {
          var mm = x.match(/^\[([A-D])\]$/);
          if (!mm) { par.appendChild(document.createTextNode(x)); return; }
          var mk = el("span", "ins-mark" + (qt === "insert" ? " on" : ""), x);
          if (qt === "insert") {
            if (ctx.answers[q.id] === mm[1]) mk.className += " picked-mark";
            mk.addEventListener("click", function () {
              ctx.set(q.id, mm[1]);
              p.querySelectorAll(".ins-mark").forEach(function (y) {
                y.classList.remove("picked-mark");
              });
              mk.classList.add("picked-mark");
            });
          }
          par.appendChild(mk);
        });
      } else {
        par.appendChild(document.createTextNode(t));
      }
      p.appendChild(par);
    });
    s.left.appendChild(p);

    question(s.right, ctx, q, "ACADEMIC PASSAGE", p, qt === "insert" || qt === "identify");

    // Sentence Simplification 은 대상 문장 전체에 음영 (§3).
    // hl 로 못 잡은 경우를 대비해 'highlighted sentence' 문구가 있으면 안내를 띄운다.
    if (qt === "simplify" && !p.querySelector("mark.hl")) {
      s.right.insertBefore(
        el("div", "q-note", "Look at the highlighted sentence in the passage."),
        s.right.querySelector(".choices"));
    }
  };
})();
