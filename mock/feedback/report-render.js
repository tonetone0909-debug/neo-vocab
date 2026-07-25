/* NEO TOEFL — AI 첨삭 리포트 렌더러 v2.
   window.NEO_FB.render(data) → HTML 문자열. data = fb_schema.json report_data.
   task ∈ {email, disc, repeat, interview}. NEO v2.2 토큰(report.html의 CSS)에 의존. */
(function () {
  "use strict";
  var TASKNUM = { email: 2, disc: 3, repeat: 1, interview: 2 };
  var VER = { good: "v-good", fair: "v-fair", bad: "v-bad" };
  var VTXT = { good: "GOOD", fair: "FAIR", bad: "FIX" };
  var UPCOL = ["up-a", "up-b", "up-c", "up-d"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function attr(s) { return esc(s).replace(/'/g, "&#39;"); }
  function txt(s) { return esc(s).replace(/\n/g, "<br>"); }   /* 줄바꿈 보존 */

  /* 하이라이트 세그먼트 → span (plain은 줄바꿈 보존) */
  function segs(list) {
    return (list || []).map(function (s) {
      var t = s.type || "plain";
      if (t === "plain") return txt(s.text);
      var cls = { red: "hl-red", yellow: "hl-yellow", blue: "hl-blue" }[t] || "";
      var tip = s.tip_ko ? " data-tip='" + attr(s.tip_ko) + "'" : "";
      return "<span class='" + cls + "'" + tip + ">" + esc(s.text) + "</span>";
    }).join("");
  }

  /* ── 1~5 점수 위치 스케일 (색상별 레벨 + 마커) ── */
  function scoreScale(score, label) {
    var s = Math.max(0, Math.min(5, Number(score) || 0));
    var cells = "";
    for (var i = 1; i <= 5; i++) cells += "<div class='fb-sc-seg s" + i + (s >= i - 0.5 ? " on" : "") + "'>" + i + "</div>";
    return "<div class='fb-sc'>" + (label ? "<div class='fb-sc-l'>" + esc(label) + " <b>" + s.toFixed(1) + "/5</b></div>" : "") +
      "<div class='fb-sc-track'>" + cells + "<div class='fb-sc-mark' style='left:" + (s / 5 * 100) + "%'></div></div></div>";
  }

  /* ── 네이티브 오디오(학생 녹음본) ── */
  function recPlayer(src, label) {
    if (src) return "<div class='fb-rec'><span class='fb-rec-l'>🎙 " + esc(label || "내 녹음") + "</span>" +
      "<audio controls preload='metadata' src='" + attr(src) + "'></audio></div>";
    return "<div class='fb-rec fb-rec-none'><span class='fb-rec-l'>🎙 " + esc(label || "내 녹음") + "</span>" +
      "<span class='fb-rec-x'>앱에서 재생돼요</span></div>";
  }

  function scoreStamp(sc) { return "<div class='fb-stamp'>SCORE<b>" + (Number(sc).toFixed(1)) + "</b><span>/5</span></div>"; }
  function header(d, subtitle) {
    return "<div class='fb-hd'><div class='fb-brand'><span class='fb-wm'>NEO TOEFL</span>" +
      "<span class='fb-sub'>" + esc(subtitle) + "</span></div><span class='fb-chip'>" + esc(d.student || "Student") + "</span></div>";
  }
  function overall(d) {
    return "<div class='fb-say'><div class='fb-say-h'>💬 Task " + (TASKNUM[d.task] || "") + " 총평</div><p>" + txt(d.overall_ko) + "</p></div>";
  }
  /* 항목별 평가 rows (Writing Why Score & Speaking 루브릭 공용): label + 색상 verdict 칩 + 설명 */
  function whyRows(list) {
    return "<ul class='fb-why'>" + (list || []).map(function (r) {
      return "<li><b>" + esc(r.label_ko) + (r.label_en ? " <span class='fb-en'>(" + esc(r.label_en) + ")</span>" : "") +
        "</b> <span class='fb-verd " + (VER[r.verdict] || "v-fair") + "'>" + esc(r.verdict_text || VTXT[r.verdict] || "") +
        "</span><br><span class='fb-det'>" + txt(r.detail_ko || r.note_ko) + "</span></li>";
    }).join("") + "</ul>";
  }
  function whyScore(d) {
    if (!d.why_score || !d.why_score.length) return "";
    return sect("Why score " + Number(d.score_0_5).toFixed(1) + "?", whyRows(d.why_score) + tipBox(d));
  }
  /* 점수 색상 칩 (그래프 대신) */
  function scoreChip(score) {
    var s = Number(score) || 0, v = s >= 3.5 ? "good" : (s >= 2.5 ? "fair" : "bad");
    return "<span class='fb-verd " + VER[v] + "'>" + s.toFixed(1) + "/5</span>";
  }
  function tipBox(d) {
    if (!d.tip_ko) return "";
    return "<div class='fb-tip'><div class='fb-tip-h'>🎯 " + esc(d.tip_ko.headline_ko) + "</div><div class='fb-tip-b'>" + (d.tip_ko.body_ko || "") + "</div></div>";
  }
  function clinic(list) {
    if (!list || !list.length) return "";
    var cards = list.map(function (c) {
      var sv = c.severity === "yellow" ? "cl-y" : "cl-r";
      return "<div class='fb-clcard " + sv + "'><div class='fb-cl-t'>" + esc(c.title_ko) + "</div>" +
        "<p class='fb-en fb-strike'>" + esc(c.wrong) + "</p><p class='fb-cl-x'>" + esc(c.explain_ko) +
        "</p><p class='fb-en fb-fix'>→ " + esc(c.fix) + "</p></div>";
    }).join("");
    return cards;
  }
  function upgrades(list) {
    if (!list || !list.length) return "";
    var cards = list.map(function (c, i) {
      var fixes = (c.fixes || []).map(function (f) { return "<p class='fb-en fb-fix'>→ " + esc(f) + "</p>"; }).join("");
      return "<div class='fb-upcard " + UPCOL[i % UPCOL.length] + "'><div class='fb-up-t'>" + esc(c.title_ko) + "</div>" +
        "<p class='fb-en fb-strike'>" + esc(c.wrong) + "</p><p class='fb-cl-x'>" + esc(c.explain_ko) + "</p>" + fixes + "</div>";
    }).join("");
    return cards;
  }
  function modelAnswer(d, label) {
    if (!d.model_answer) return "";
    var body = "<div class='fb-model'><div class='fb-model-h'>Model answer</div><p class='fb-model-b'>" + brStrong(d.model_answer) + "</p>" +
      ttsBtn() + "</div>";
    if (d.review_note_ko) body += "<p class='fb-review'>✍️ " + esc(d.review_note_ko) + "</p>";
    if (d.encourage_en) body += "<div class='fb-enc'>" + esc(d.encourage_en) + "</div>";
    return sect(label || "Model response", body);
  }
  /* model_answer: <strong> 유지 + 줄바꿈 <br> + 나머지 escape */
  function brStrong(s) {
    var parts = String(s).split(/(<\/?strong>)/);
    return parts.map(function (p) { return (p === "<strong>" || p === "</strong>") ? p : txt(p); }).join("");
  }
  function ttsBtn() {
    return "<div class='fb-tts-mini'><button class='fb-tts-btn' onclick='NEO_FB.toggleTTS(this)'>🔊 모범답안 듣기</button>" +
      "<span class='fb-tts-st'></span></div>";
  }
  function penaltyBanner(d) {
    var p = d.length_penalty;
    if (!p || !p.applied) return "";
    return "<div class='fb-pen'>⚠️ 분량 감점 −" + p.amount + " · <b>" + esc(p.note_ko) + "</b></div>";
  }
  function sect(title, inner) { return "<section class='fb-sec'><h2 class='fb-sec-t'>" + esc(title) + "</h2>" + inner + "</section>"; }
  function origBox(d, label) {
    return sect(label, "<div class='fb-orig'><span class='fb-orig-tag'>Original</span><p class='fb-en fb-orig-b'>" +
      segs(d.original_segments || d.transcript_segments) + "</p></div>" + penaltyBanner(d) + overall(d));
  }

  /* ── Writing ── */
  function renderEmail(d) {
    return header(d, "Writing Task 2 · Email" + (d.recipient_formality ? " (" + d.recipient_formality + ")" : "")) + scoreStamp(d.score_0_5) +
      "<div class='fb-topic'>" + esc(d.topic || "") + (d.word_count ? " · " + d.word_count + " words" : "") + "</div>" +
      origBox(d, "Your email") + whyScore(d) +
      section2(d.grammar_clinic && d.grammar_clinic.length ? sect("Grammar clinic", clinic(d.grammar_clinic)) : "") +
      section2(d.upgrades && d.upgrades.length ? sect("Upgrade your expressions", upgrades(d.upgrades)) : "") +
      modelAnswer(d);
  }
  function renderDisc(d) {
    var out = header(d, "Writing Task 3 · Academic Discussion") + scoreStamp(d.score_0_5) +
      "<div class='fb-topic'>" + esc(d.topic || "") + (d.word_count ? " · " + d.word_count + " words" : "") + "</div>" +
      origBox(d, "Your response") + whyScore(d);
    if (d.grammar_clinic && d.grammar_clinic.length) out += sect("Grammar clinic", clinic(d.grammar_clinic));
    if (d.deep_dive && d.deep_dive.length) {
      var dd = d.deep_dive.map(function (x) {
        return "<div class='fb-dd " + (x.kind === "strategy" ? "dd-s" : "dd-l") + "'><div class='fb-dd-t'>" + esc(x.title_ko) + "</div>" +
          (x.problem_en ? "<p class='fb-en fb-strike'>" + esc(x.problem_en) + "</p>" : "") +
          "<p class='fb-cl-x'>" + txt(x.analysis_ko) + "</p>" + (x.fix_en ? "<p class='fb-en fb-fix'>→ " + esc(x.fix_en) + "</p>" : "") +
          (x.note_ko ? "<p class='fb-cl-x'>" + txt(x.note_ko) + "</p>" : "") + "</div>";
      }).join("");
      out += sect("Deep dive", dd);
    }
    if (d.upgrades && d.upgrades.length) out += sect("Upgrade your expressions", upgrades(d.upgrades));
    return out + modelAnswer(d);
  }
  function section2(x) { return x || ""; }

  /* ── Speaking Task 1 (Repeat) ── */
  function renderRepeat(d) {
    var cards = (d.sentences || []).map(function (s) {
      var vb = { ok: "✅", minor: "⚠️", bad: "❌" }[s.verdict] || "⚠️";
      return "<div class='fb-sent'><div class='fb-sent-h'><span class='fb-sent-n'>" + s.n + "</span>" + vb + "</div>" +
        "<p class='fb-en fb-sent-o'>원문: " + esc(s.orig) + "</p>" +
        "<p class='fb-en fb-sent-s'>발화: " + segs(s.segments) + "</p>" +
        (s.note_ko ? "<p class='fb-cl-x'>" + esc(s.note_ko) + "</p>" : "") +
        recPlayer(s.audio, "문장 " + s.n + " 내 녹음") + "</div>";
    }).join("");
    var errs = (d.error_patterns || []).map(function (e) {
      var lv = { good: "v-good", fair: "v-fair", bad: "v-bad" }[e.level] || "v-fair";
      return "<div class='fb-errrow'><span class='fb-err-l'>" + esc(e.label_ko) + "</span>" +
        "<span class='fb-verd " + lv + "'>" + (e.count != null ? e.count + "/" + (e.of || 7) + "회" : "") + "</span>" +
        "<p class='fb-cl-x'>" + esc(e.meaning_ko || "") + "</p></div>";
    }).join("");
    var strat = (d.strategies || []).map(function (s) {
      return "<div class='fb-upcard up-b'><div class='fb-up-t'>" + esc(s.title_ko) + "</div><p class='fb-cl-x'>" + txt(s.body_ko) + "</p></div>";
    }).join("");
    return header(d, "Speaking Task 1 · Listen & Repeat") + scoreStamp(d.score_0_5) +
      "<div class='fb-topic'>" + esc(d.topic || "") + "</div>" + overall(d) +
      sect("Sentence accuracy (7)", "<p class='fb-note'>각 문장의 <b>원문</b> vs <b>내 발화</b>를 비교하고, 문장별 내 녹음을 다시 들어볼 수 있어요.</p>" + cards) +
      (errs ? sect("반복된 오류 — 무엇을 고칠까", "<p class='fb-note'>7문장에서 같은 실수가 몇 번 나왔는지, 무엇을 의미하는지 정리했어요.</p>" + errs) : "") +
      (strat ? sect("Strategy", strat) : "");
  }

  /* ── Speaking Task 2 (Interview) — 4문항 + 종합 ── */
  function renderInterview(d) {
    var comp = d.composite_0_5 != null ? d.composite_0_5 : d.score_0_5;
    var qs = (d.questions || []).map(function (q, i) {
      var lf = q.logic_flow ? "<div class='fb-lf'>" +
        lfRow("입장", q.logic_flow.position_ko, q.logic_flow.position_v) +
        lfRow("근거", q.logic_flow.reasoning_ko, q.logic_flow.reasoning_v) +
        lfRow("결론", q.logic_flow.conclusion_ko, q.logic_flow.conclusion_v) + "</div>" : "";
      var mdl = q.model_answer ? "<div class='fb-model'><div class='fb-model-h'>Model answer</div><p class='fb-model-b fb-en'>" + txt(q.model_answer) + "</p>" + ttsBtn() + "</div>" : "";
      return "<div class='fb-qcard'><div class='fb-qhd'><span class='fb-qn'>Q" + (q.n || i + 1) + "</span>" +
        scoreChip(q.score_0_5) + "<span class='fb-qt'>" + esc(q.question || "") + "</span></div>" +
        recPlayer(q.audio, "Q" + (q.n || i + 1) + " 내 녹음") +
        "<div class='fb-orig' style='margin-top:10px'><span class='fb-orig-tag'>Transcript</span><p class='fb-en fb-orig-b'>" + segs(q.transcript_segments) + "</p></div>" +
        (q.note_ko ? "<p class='fb-cl-x' style='margin-top:8px'>" + txt(q.note_ko) + "</p>" : "") +
        lf + clinic(q.grammar_clinic) + upgrades(q.upgrades) + mdl + "</div>";
    }).join("");
    var half = (Math.round(comp * 2) / 2).toFixed(1);   /* 종합은 0.5 단위 */
    return header(d, "Speaking Task 2 · Take an Interview") + scoreStamp(half) +
      "<div class='fb-topic'>" + esc(d.topic || "") + "</div>" + overall(d) +
      (d.rubric_bars ? sect("Why score " + half + "?",
        "<p class='fb-note'>네 문항 점수의 평균을 <b>0.5점 단위</b>로 반올림한 " + half + "/5가 종합 점수예요. 종합 5점 만점이 총점 6점 중 <b>4점</b>에 반영돼요.</p>" +
        whyRows(d.rubric_bars)) : "") +
      sect("문항별 첨삭 (4)", qs);
  }
  function lfRow(k, v, verd) {
    var vb = { good: "✅", fair: "⚠️", bad: "❌" }[verd] || "⚠️";
    return "<div class='fb-lf-r'><span class='fb-lf-k'>" + esc(k) + " " + vb + "</span><span class='fb-cl-x'>" + esc(v) + "</span></div>";
  }

  var MAP = { email: renderEmail, disc: renderDisc, repeat: renderRepeat, interview: renderInterview };

  window.NEO_FB = {
    render: function (d) {
      var fn = MAP[d && d.task];
      if (!fn) return "<article class='fb-paper'><p style='padding:40px'>알 수 없는 task: " + esc(d && d.task) + "</p></article>";
      return "<article class='fb-paper'>" + fn(d) + "</article>";
    },
    /* 모범답안 speechSynthesis 재생 */
    toggleTTS: function (btn) {
      var box = btn.closest(".fb-model");
      var text = box.querySelector(".fb-model-b").innerText.trim();
      var st = btn.parentNode.querySelector(".fb-tts-st");
      if (window._neoTTS && window._neoTTS.playing && window._neoTTS.btn === btn) window._neoTTS.stop();
      else window._neoTTS && window._neoTTS.play(btn, st, text);
    }
  };
})();
