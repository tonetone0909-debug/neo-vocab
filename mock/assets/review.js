/* review.js — 리포트·리뷰 화면이 공유하는 조회/조립 로직.
 *
 * 조회와 DOM 조립만 한다. 답안을 쓰지 않고, 타이머·오디오·녹음을 만들지 않는다.
 * (리뷰 중에 답이 바뀌면 채점 결과와 화면이 어긋난다.)
 */
(function () {
  "use strict";

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null) n.textContent = txt;
    return n;
  }

  function code() {
    try {
      return sessionStorage.getItem("neo_code") ||
             localStorage.getItem("neo_code") || "";
    } catch (e) { return ""; }
  }

  function qparam(k) {
    var m = new RegExp("[?&]" + k + "=([^&]*)").exec(location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  /* 제출 확정된 상세를 읽는다. 없으면 null (아직 응시 안 함). */
  function loadDetail(setId) {
    if (!window.NEO_EXAMDB || !NEO_EXAMDB.supported()) return Promise.resolve(null);
    return NEO_EXAMDB.getDetail(code(), setId).catch(function () { return null; });
  }

  /* ── 문항 목록 ──────────────────────────────────────────────────
   * result.ids[i] 와 result.marks[i] 는 채점 당시의 순서다(score.js 가 고정).
   * 리포트의 문항 번호는 **이 순서**로 매긴다. 다시 계산하지 않는다 —
   * 다시 계산하면 채점 결과와 번호가 어긋날 수 있다.
   */
  function sectionRows(sec, result, exam) {
    var r = result && result[sec];
    if (!r || !r.ids) return [];
    var routerN = (r.routerIds || []).length;
    return r.ids.map(function (qid, i) {
      return {
        n: i + 1,
        qid: qid,
        gid: gidOf(qid, exam),
        ok: r.marks.charAt(i) === "1",
        module: (sec === "R" || sec === "L")
          ? (i < routerN ? "router" : (r.path || "lower"))
          : "all"
      };
    });
  }

  /* qid -> gid. ctw 는 `${gid}_b${n}`, 나머지는 `${gid}_${i}` 라
   * 뒤에서부터 잘라 실제로 존재하는 그룹을 찾는다. */
  function gidOf(qid, exam) {
    var i = qid.lastIndexOf("_");
    while (i > 0) {
      var cand = qid.slice(0, i);
      if (exam.groups[cand]) return cand;
      i = qid.lastIndexOf("_", i - 1);
    }
    return qid;
  }

  /* 그룹 안에서 이 문항이 몇 번째인지 (렌더러의 ctx.qi). */
  function indexInGroup(qid, gid, exam) {
    var g = exam.groups[gid];
    if (!g) return 0;
    if (g.t === "ctw") return 0;              // ctw 는 그룹 전체가 한 화면
    if (g.q) {
      for (var i = 0; i < g.q.length; i++) if (g.q[i].id === qid) return i;
    }
    if (g.items) {
      for (var j = 0; j < g.items.length; j++) if (g.items[j].id === qid) return j;
    }
    return 0;
  }

  /* ── 읽기 전용 ctx ──────────────────────────────────────────────
   * 렌더러는 모드 개념이 없어 항상 리스너를 단다. set/flag 를 no-op 으로 주면
   * 눌러도 아무 일이 안 일어나고, 화면 잠금은 CSS(.reviewing)가 맡는다.
   *
   * played[gid] = true 가 핵심이다. render-l.js 는 이 값이 있으면 재생 패널을
   * 통째로 제거하고 문제를 바로 연다 — 오디오 엘리먼트를 아예 안 만든다.
   * (안 넣으면 리뷰 화면에서 mp3 를 다시 받아 재생한다.)
   */
  function reviewCtx(gid, qi, exam, detail) {
    var played = {}, recs = {};
    played[gid] = true;
    Object.keys(exam.groups).forEach(function (k) { played[k] = true; });
    return {
      group: exam.groups[gid], gid: gid, qi: qi,
      answers: detail.answers || {}, flags: {},
      played: played, recs: recs,
      set: function () {}, flag: function () {},
      mark: function () {}, arm: function () {}, next: function () {},
      code: code(), setId: detail.set_id
    };
  }

  /* ── 정오 표시 ──────────────────────────────────────────────────
   * 렌더가 끝난 host 를 훑어 색을 입힌다.
   *   ans-correct  학생이 고른 정답 (초록)
   *   ans-wrong    학생이 고른 오답 (빨강)
   *   ans-miss     학생이 안 고른 정답 (초록 테두리)
   */
  function paintAnswers(host, gid, detail, key, exam) {
    var g = exam.groups[gid], k = key.g[gid];
    if (!g || !k) return;
    var ans = detail.answers || {};

    if (g.t === "ctw") {
      host.querySelectorAll(".blank[data-qid]").forEach(function (slot) {
        var qid = slot.getAttribute("data-qid");
        var n = qid.slice(qid.lastIndexOf("_b") + 2);
        var want = k.blanks[String(n)];
        var got = ans[qid] || "";
        var ok = String(got).trim().toLowerCase() === String(want).trim().toLowerCase();
        slot.classList.add(ok ? "ans-correct" : "ans-wrong");
        slot.querySelectorAll("input.bcell").forEach(function (c) {
          c.disabled = true;
        });
        if (!ok) {
          // 오답일 때만 정답을 병기한다. 맞은 칸에까지 붙이면 지문이 읽히지 않는다.
          slot.appendChild(el("span", "ans-fix", want));
        }
      });
      return;
    }

    host.querySelectorAll(".choices[data-qid]").forEach(function (wrap) {
      var qid = wrap.getAttribute("data-qid");
      var want = k.q[qid] && k.q[qid].a;
      var got = ans[qid];
      wrap.querySelectorAll(".choice").forEach(function (c, i) {
        if (i === want && i === got) c.classList.add("ans-correct");
        else if (i === got) c.classList.add("ans-wrong");
        else if (i === want) c.classList.add("ans-miss");
      });
      if (got === undefined || got === null) {
        wrap.parentNode.insertBefore(el("div", "ans-note", "답을 고르지 않았어요"), wrap);
      }
    });
  }

  /* ── 접히는 블록 ────────────────────────────────────────────────
   * 해석·해설은 **눌러야 열린다**(사용자 확정). 문제를 다시 풀어보기 전에
   * 답이 먼저 눈에 들어오면 리뷰의 의미가 없다.
   * <details> 를 쓰면 상태 관리 없이 브라우저가 알아서 처리한다. */
  function foldable(label, build) {
    var d = el("details", "rv-fold");
    d.appendChild(el("summary", null, label));
    var body = el("div", "rv-fold-body");
    d.appendChild(body);
    var built = false;
    d.addEventListener("toggle", function () {
      if (d.open && !built) { built = true; build(body); }
    });
    return d;
  }

  /* 해설 — 정답 근거만 (오답 이유는 만들지 않기로 했다).
   * 값이 없으면 null 을 돌려 버튼 자체를 안 만든다. 빈 상자를 띄우면
   * "해설이 없다"가 아니라 "해설이 깨졌다"로 읽힌다. */
  function explainBlock(gid, qid, key) {
    var k = key.g[gid], q = k && k.q && k.q[qid];
    if (!q || !q.why || !String(q.why).trim()) return null;
    return foldable("해설 보기", function (body) {
      body.appendChild(el("p", "rv-body", q.why));
    });
  }

  /* 한국어 해석 — 지문/스크립트 + 이 문항의 문항·선택지 번역.
   * 문항 단위로 연다. 지문 전체 번역만 띄우면 선택지가 왜 오답인지 안 보인다. */
  function transBlock(gid, qid, key, exam, detail) {
    var k = key.g[gid] || {};
    var kr = k.kr || {};
    var q = (k.q || {})[qid] || {};
    var qkr = q.kr;
    var hasBody = (kr.passage && kr.passage.length) || (kr.script || "").trim();
    if (!hasBody && !qkr) return null;

    return foldable("한국어 해석 보기", function (body) {
      if (kr.passage && kr.passage.length) {
        body.appendChild(el("div", "rv-k", "지문 해석"));
        kr.passage.forEach(function (p) {
          if (String(p || "").trim()) body.appendChild(el("p", "rv-body", p));
        });
      }
      if ((kr.script || "").trim()) {
        body.appendChild(el("div", "rv-k", "스크립트 해석"));
        body.appendChild(el("p", "rv-body", kr.script));
      }
      if (qkr) {
        body.appendChild(el("div", "rv-k", "문항 해석"));
        if (qkr.stem) body.appendChild(el("p", "rv-body", qkr.stem));
        var want = ((key.g[gid].q || {})[qid] || {}).a;
        var got = (detail.answers || {})[qid];
        var ul = el("ul", "rv-optkr");
        (qkr.opt || []).forEach(function (o, i) {
          var li = el("li", null, "ABCD"[i] + ". " + o);
          if (i === want) li.className = "kr-correct";
          else if (i === got) li.className = "kr-wrong";
          ul.appendChild(li);
        });
        body.appendChild(ul);
      }
    });
  }

  /* 스크립트 원문(Listening) — 해석과 별개로 영어 원문도 볼 수 있게 둔다.
   * 화자 라벨을 붙여 그린다: [{sp:"M"|"W", text}, ...]. 옛 문자열 형식도 받아준다. */
  function scriptBlock(gid, key) {
    var s = key.g[gid] && key.g[gid].script;
    if (!s || (typeof s === "string" && !s.trim()) ||
        (Array.isArray(s) && !s.length)) return null;
    return foldable("영어 스크립트 보기", function (body) {
      if (typeof s === "string") { body.appendChild(el("p", "rv-body", s)); return; }
      s.forEach(function (line) {
        var row = el("p", "rv-line");
        row.appendChild(el("span", "rv-sp rv-sp-" + line.sp,
                           line.sp === "W" ? "W" : "M"));
        row.appendChild(document.createTextNode(" " + line.text));
        body.appendChild(row);
      });
    });
  }

  window.NEO_REVIEW = {
    el: el, code: code, qparam: qparam,
    loadDetail: loadDetail,
    sectionRows: sectionRows, gidOf: gidOf, indexInGroup: indexInGroup,
    reviewCtx: reviewCtx, paintAnswers: paintAnswers,
    explainBlock: explainBlock, transBlock: transBlock, scriptBlock: scriptBlock
  };
})();
