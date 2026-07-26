/* NEO TOEFL — AI 첨삭 리포트 렌더러 v2.
   window.NEO_FB.render(data) → HTML 문자열. data = fb_schema.json report_data.
   task ∈ {email, disc, repeat, interview}. NEO v2.2 토큰(report.html의 CSS)에 의존. */
(function () {
  "use strict";
  var TASKNUM = { email: 2, disc: 3, repeat: 1, interview: 2 };
  var VER = { good: "v-good", fair: "v-fair", bad: "v-bad", critical: "v-bad", minor: "v-fair", ok: "v-good" };
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
      var t = s.type || s.color || "plain";   // grader 가 color 로 주기도 한다
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
    return "<div class='fb-say'><div class='fb-say-h'>💬 Task " + (TASKNUM[taskKey(d.task)] || "") + " 총평</div><p>" + txt(d.overall_ko) + "</p></div>";
  }
  /* 항목별 평가 rows (Writing Why Score & Speaking 루브릭 공용): label + 색상 verdict 칩 + 설명 */
  /* why_score/rubric_bars 는 grader 버전에 따라 형태가 다르다:
     - 문자열(근거 한 줄)  - {label_ko, verdict, verdict_text, detail_ko/note_ko}  - {label_ko, score} */
  function whyRows(list) {
    return "<ul class='fb-why'>" + (list || []).map(function (r) {
      if (typeof r === "string") return "<li><span class='fb-det'>" + txt(r) + "</span></li>";
      var label = r.label_ko || r.category || r.label || "";
      var lab = label ? "<b>" + esc(label) + (r.label_en ? " <span class='fb-en'>(" + esc(r.label_en) + ")</span>" : "") + "</b> " : "";
      var badge = "";
      if (r.verdict) badge = "<span class='fb-verd " + (VER[r.verdict] || "v-fair") + "'>" + esc(r.verdict_text || VTXT[r.verdict] || "") + "</span>";
      else if (r.score != null) { var sv = Number(r.score) >= 3.5 ? "v-good" : (Number(r.score) >= 2.5 ? "v-fair" : "v-bad"); badge = "<span class='fb-verd " + sv + "'>" + Number(r.score).toFixed(1) + "/5</span>"; }
      var det = txt(r.detail_ko || r.note_ko || r.meaning_ko || r.comment || "");
      return "<li>" + lab + badge + (det ? "<br><span class='fb-det'>" + det + "</span>" : "") + "</li>";
    }).join("") + "</ul>";
  }
  function whyScore(d) {
    var list = (d.why_score && d.why_score.length) ? d.why_score : d.rubric_bars;
    if (!list || !list.length) return "";
    return sect("Why score " + Number(d.score_0_5).toFixed(1) + "?", whyRows(list) + tipBox(d));
  }
  /* 점수 색상 칩 (그래프 대신) */
  function scoreChip(score) {
    var s = Number(score) || 0, v = s >= 3.5 ? "good" : (s >= 2.5 ? "fair" : "bad");
    return "<span class='fb-verd " + VER[v] + "'>" + s.toFixed(1) + "/5</span>";
  }
  function tipBox(d) {
    var t = d.tip_ko;
    if (!t) return "";
    if (typeof t === "string") return "<div class='fb-tip'><div class='fb-tip-h'>🎯 팁</div><div class='fb-tip-b'>" + esc(t) + "</div></div>";
    if (t.headline_ko) return "<div class='fb-tip'><div class='fb-tip-h'>🎯 " + esc(t.headline_ko) + "</div><div class='fb-tip-b'>" + esc(t.body_ko || "") + "</div></div>";
    // {article_usage, reason_consequence, ...} 처럼 키:값 → 각 값을 한 줄씩
    var lines = Object.keys(t).map(function (k) { return t[k] ? "<div class='fb-tip-b'>• " + esc(t[k]) + "</div>" : ""; }).join("");
    return lines ? "<div class='fb-tip'><div class='fb-tip-h'>🎯 팁</div>" + lines + "</div>" : "";
  }
  function clinic(list) {
    if (!list || !list.length) return "";
    var cards = list.map(function (c) {
      var sv = c.severity === "yellow" ? "cl-y" : "cl-r";
      var wrong = c.wrong || c.error || "", explain = c.explain_ko || c.explain || c.note_ko || "", fix = c.fix || c.fix_en || "";
      return "<div class='fb-clcard " + sv + "'>" + (c.title_ko ? "<div class='fb-cl-t'>" + esc(c.title_ko) + "</div>" : "") +
        (wrong ? "<p class='fb-en fb-strike'>" + esc(wrong) + "</p>" : "") + (explain ? "<p class='fb-cl-x'>" + esc(explain) + "</p>" : "") +
        (fix ? "<p class='fb-en fb-fix'>→ " + esc(fix) + "</p>" : "") + "</div>";
    }).join("");
    return cards;
  }
  function upgrades(list) {
    if (!list || !list.length) return "";
    var cards = list.map(function (c, i) {
      var fx = c.fixes || (c.after ? [c.after] : []);
      var fixes = fx.map(function (f) { return "<p class='fb-en fb-fix'>→ " + esc(f) + "</p>"; }).join("");
      var wrong = c.wrong || c.before || "", explain = c.explain_ko || c.tip || c.note_ko || "";
      return "<div class='fb-upcard " + UPCOL[i % UPCOL.length] + "'>" + (c.title_ko ? "<div class='fb-up-t'>" + esc(c.title_ko) + "</div>" : "") +
        (wrong ? "<p class='fb-en fb-strike'>" + esc(wrong) + "</p>" : "") + (explain ? "<p class='fb-cl-x'>" + esc(explain) + "</p>" : "") + fixes + "</div>";
    }).join("");
    return cards;
  }
  function modelAnswer(d, label) {
    if (!d.model_answer) return "";
    var body = "<div class='fb-model'><div class='fb-model-h'>Model answer</div><p class='fb-model-b'>" + modelBody(d.model_answer, collectFixes(d)) + "</p></div>";
    if (d.review_note_ko) body += "<p class='fb-review'>✍️ " + esc(d.review_note_ko) + "</p>";
    if (d.encourage_en) body += "<div class='fb-enc'>" + esc(d.encourage_en) + "</div>";
    return sect(label || "Model response", body);
  }
  /* 교정된 표현(clinic.fix / upgrade.after)을 모아 모범답안에서 볼드 처리한다. */
  function collectFixes(d) {
    var f = [];
    (d.grammar_clinic || []).forEach(function (c) { var x = c.fix || c.fix_en; if (x) f.push(x); });
    (d.upgrades || []).forEach(function (c) { if (c.after) f.push(c.after); (c.fixes || []).forEach(function (x) { f.push(x); }); });
    return f;
  }
  /* model_answer 렌더: 리터럴/실제 \n → <br>, escape, 교정 표현 <strong> 볼드 */
  function modelBody(model, fixes) {
    var s = txt(String(model).replace(/\\n/g, "\n"));
    (fixes || []).filter(Boolean).map(function (f) { return esc(String(f).replace(/\\n/g, " ").replace(/\s+/g, " ").trim()); })
      .filter(function (f) { return f.length > 3; }).sort(function (a, b) { return b.length - a.length; })
      .forEach(function (ef) {
        if (s.indexOf(ef) >= 0 && s.indexOf("<strong>" + ef + "</strong>") < 0) s = s.split(ef).join("<strong>" + ef + "</strong>");
      });
    return s;
  }
  function ttsBtn() { return ""; }   /* 모범답안 듣기 버튼 제거(사용자 요청) */
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
        var title = x.title_ko || x.reason || x.point || "";
        var analysis = x.analysis_ko || x.consequence_check || x.note_ko || "";
        var vb = x.verdict ? " <span class='fb-verd v-fair'>" + esc(x.verdict) + "</span>" : "";
        return "<div class='fb-dd " + (x.kind === "strategy" ? "dd-s" : "dd-l") + "'>" + (title ? "<div class='fb-dd-t'>" + esc(title) + vb + "</div>" : "") +
          (x.problem_en ? "<p class='fb-en fb-strike'>" + esc(x.problem_en) + "</p>" : "") +
          (analysis ? "<p class='fb-cl-x'>" + txt(analysis) + "</p>" : "") + (x.fix_en ? "<p class='fb-en fb-fix'>→ " + esc(x.fix_en) + "</p>" : "") +
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
      var lv = VER[e.level] || "v-fair";
      return "<div class='fb-errrow'><span class='fb-err-l'>" + esc(e.label_ko) + "</span>" +
        "<span class='fb-verd " + lv + "'>" + (e.count != null ? e.count + "/" + (e.of || 7) + "회" : "") + "</span>" +
        "<p class='fb-cl-x'>" + esc(e.meaning_ko || "") + "</p></div>";
    }).join("");
    var strat = (d.strategies || []).map(function (s) {
      if (typeof s === "string") return "<div class='fb-upcard up-b'><p class='fb-cl-x'>" + txt(s) + "</p></div>";
      return "<div class='fb-upcard up-b'>" + (s.title_ko ? "<div class='fb-up-t'>" + esc(s.title_ko) + "</div>" : "") + "<p class='fb-cl-x'>" + txt(s.body_ko || "") + "</p></div>";
    }).join("");
    // 일부 grader 는 문장별 sentences 대신 transcript_segments(전체 전사)만 준다.
    var transcript = (!cards && d.transcript_segments && d.transcript_segments.length) ?
      "<div class='fb-orig'><span class='fb-orig-tag'>Transcript</span><p class='fb-en fb-orig-b'>" + segs(d.transcript_segments) + "</p></div>" + recPlayer(d.audio, "내 녹음") : "";
    return header(d, "Speaking Task 1 · Listen & Repeat") + scoreStamp(d.score_0_5) +
      "<div class='fb-topic'>" + esc(d.topic || "") + "</div>" + overall(d) +
      (d.rubric_bars && d.rubric_bars.length ? sect("Why score " + Number(d.score_0_5).toFixed(1) + "?", whyRows(d.rubric_bars)) : "") +
      (cards ? sect("Sentence accuracy (7)", "<p class='fb-note'>각 문장의 <b>원문</b> vs <b>내 발화</b>를 비교하고, 문장별 내 녹음을 다시 들어볼 수 있어요.</p>" + cards) :
        (transcript ? sect("내 발화 (전사)", "<p class='fb-note'>녹음된 발화를 전사한 내용이에요.</p>" + transcript) : "")) +
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
      var mdl = q.model_answer ? "<div class='fb-model'><div class='fb-model-h'>Model answer</div><p class='fb-model-b fb-en'>" + modelBody(q.model_answer, collectFixes(q)) + "</p></div>" : "";
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

  // 채점 모델이 task 를 "Academic Discussion" 같은 라벨로 채우기도 한다 →
  // 렌더 분기용 키(email/disc/repeat/interview)로 정규화한다.
  function taskKey(t) {
    t = String(t || "").toLowerCase();
    if (t.indexOf("disc") >= 0) return "disc";
    if (t.indexOf("email") >= 0) return "email";
    if (t.indexOf("repeat") >= 0) return "repeat";
    if (t.indexOf("interview") >= 0) return "interview";
    return t;
  }

  window.NEO_FB = {
    render: function (d) {
      var fn = MAP[taskKey(d && d.task)];
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
