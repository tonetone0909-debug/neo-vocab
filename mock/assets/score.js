/* score.js — 채점 + Band 변환. 순수 함수만 노출한다(부수효과 없음).
 *
 * 순수하게 유지하는 이유: Band 기준은 운영하며 조정하게 된다. 조정할 때마다
 * 회귀 검증이 쉬워야 하고, 나중에 admin 에서 재채점 배치를 돌릴 때 같은 함수를
 * 그대로 재사용할 수 있어야 한다.
 * 파이썬 회귀 테스트(build/mock/test_score.py)가 아래 표를 그대로 옮겨 대조한다 —
 * 표를 고치면 그쪽도 같이 고칠 것.
 */
(function () {
  "use strict";

  /* ── Band 기준 ────────────────────────────────────────────────────
   * 사용자 확정: 120점 만점 환산표 하나를 총점·영역 양쪽에 쓴다.
   * 영역별 만점이 다르므로(R 35 · L 35 · W 20 · S 55) 영역은 **비율**로 본다.
   * 컷을 백분율로 바로 적지 않고 120점 값을 나누는 이유는, 사용자가 준 표와
   * 코드가 한눈에 대조되게 하기 위해서다(전사 오류 방지).
   */
  var MAX120 = 120;
  var BAND_120 = [
    [118, 6.0], [110, 5.5], [100, 5.0], [90, 4.5], [80, 4.0],
    [65, 3.5], [51, 3.0], [39, 2.5], [29, 2.0], [18, 1.5], [6, 1.0]
  ];

  /* 총점 = 4개 영역 Band 의 **합**(최대 24) -> 총점 Band. */
  var BAND_SUM = [
    [23, 6.0], [21, 5.5], [19, 5.0], [17, 4.5], [15, 4.0],
    [13, 3.5], [11, 3.0], [9, 2.5], [7, 2.0], [5, 1.5]
  ];

  /* MST 경로 보정 (R·L 한정).
   * lower Stage2 에는 Academic Passage(R)/Academic Talk(L)가 0문항이다.
   * 최고난도를 한 번도 안 풀고 최상위 Band 를 줄 근거가 없어 상한을 막는다.
   * 반대로 upper 는 Stage1 을 이미 통과했으므로 하한을 받친다. */
  var PATH_CAP = { lower: 4.5, upper: null };
  var PATH_FLOOR = { lower: null, upper: 3.5 };

  /* 비율 -> Band. 표는 높은 순이므로 처음 만족하는 칸이 답이다. */
  function bandFromPct(pct) {
    for (var i = 0; i < BAND_120.length; i++) {
      if (pct >= BAND_120[i][0] / MAX120) return BAND_120[i][1];
    }
    return 1.0;
  }

  /* raw/max -> Band. path 가 주어지면 MST 보정을 적용한다. */
  function toBand(raw, max, path) {
    if (raw === null || raw === undefined || !max) return null;
    var b = bandFromPct(raw / max);
    var cap = PATH_CAP[path], floor = PATH_FLOOR[path];
    if (cap !== null && cap !== undefined && b > cap) b = cap;
    if (floor !== null && floor !== undefined && b < floor) b = floor;
    return b;
  }

  /* Band -> 120점 환산. 총점에만 쓴다(영역별로는 표시하지 않기로 했다). */
  function toScore120(band) {
    if (band === null || band === undefined) return null;
    for (var i = 0; i < BAND_120.length; i++) {
      if (BAND_120[i][1] === band) return BAND_120[i][0];
    }
    return null;
  }

  /* ── 문항 채점 ──────────────────────────────────────────────────── */

  function markQ(given, want) {
    return given !== null && given !== undefined && given === want;
  }

  function markBlank(given, want) {
    if (given === null || given === undefined) return false;
    return String(given).trim().toLowerCase() === String(want).trim().toLowerCase();
  }

  /* 한 모듈(router/lower/upper)을 채점한다.
   * 반환 {raw, marks, ids} — marks 는 "1"/"0" 문자열.
   * 문항 순서는 groups 배열 순서 -> 그룹 내 문항 순서로 고정된다.
   * **리포트가 이 순서로 문항 번호를 매기므로 절대 흔들리면 안 된다.** */
  function scoreModule(groupIds, exam, key, answers) {
    var raw = 0, marks = [], ids = [];
    groupIds.forEach(function (gid) {
      var g = exam.groups[gid], k = key.g[gid];
      if (g.t === "ctw") {
        g.blanks.forEach(function (b) {
          var id = gid + "_b" + b.n;
          var ok = markBlank(answers[id], k.blanks[String(b.n)]);
          raw += ok ? 1 : 0; marks.push(ok ? "1" : "0"); ids.push(id);
        });
      } else if (g.q) {
        g.q.forEach(function (q) {
          var ok = markQ(answers[q.id], k.q[q.id].a);
          raw += ok ? 1 : 0; marks.push(ok ? "1" : "0"); ids.push(q.id);
        });
      }
    });
    return { raw: raw, marks: marks.join(""), ids: ids };
  }

  /* Reading/Listening 한 섹션 전체(router + 확정된 경로). 만점은 항상 35. */
  function scoreSection(sec, path, exam, key, answers) {
    var m = exam.sections[sec].modules;
    var r1 = scoreModule(m.router.groups, exam, key, answers);
    var r2 = scoreModule(m[path].groups, exam, key, answers);
    var raw = r1.raw + r2.raw;
    var max = m.router.scored + m[path].scored;
    return {
      raw: raw, max: max, path: path,
      band: toBand(raw, max, path),
      marks: r1.marks + r2.marks,
      ids: r1.ids.concat(r2.ids),
      routerRaw: r1.raw,
      routerMarks: r1.marks,          // 리포트가 Stage 경계를 그릴 때 쓴다
      routerIds: r1.ids
    };
  }

  /* Stage1 성적으로 경로를 판정한다.
   * 판정 결과는 호출부에서 즉시 확정 저장하고 이후 절대 재계산하지 않는다 —
   * 복구 시 재계산하면 답안이 바뀌어 경로가 달라질 수 있다. */
  function route(sec, exam, key, answers) {
    var m = exam.sections[sec].modules;
    var r = scoreModule(m.router.groups, exam, key, answers);
    var th = exam.sections[sec].route.threshold;
    return { path: r.raw >= th ? "upper" : "lower", raw: r.raw, threshold: th };
  }

  /* ── Writing / Speaking ────────────────────────────────────────────
   * 자동채점되는 건 Writing Task1(Build a Sentence) 뿐이다.
   * Task2·3 과 Speaking 전체는 AI 첨삭 결과를 나중에 주입한다.
   *   ai = { gid: 점수 }  — 없으면 그 그룹은 pending.
   * pending 이 남아 있으면 band 를 null 로 둔다. 일부만 채점된 점수로 Band 를
   * 내면 학생이 그걸 확정 점수로 읽는다.
   */
  function injected(ai, gid) {
    if (!ai) return null;
    var v = ai[gid];
    return (v === null || v === undefined) ? null : v;
  }

  function scoreWriting(exam, key, answers, ai) {
    var raw = 0, marks = [], pending = [], max = 0;
    exam.sections.W.groups.forEach(function (gid) {
      var g = exam.groups[gid], k = key.g[gid];
      max += g.scored;
      if (g.t === "bas") {
        // 자동채점: 정답 문항 수 → 그룹 가중점수(scored)로 스케일.
        // (문항 10개인데 W Task1 가중은 2점 → 정답비율 × scored)
        var correct = 0;
        g.items.forEach(function (it, i) {
          var want = k.items[i].solution.join("");
          var got = (answers[it.id] || []).join("");
          var ok = want === got;
          correct += ok ? 1 : 0; marks.push(ok ? "1" : "0");
        });
        raw += g.items.length ? (correct / g.items.length) * g.scored : 0;
      } else {
        var got2 = injected(ai, gid);
        if (got2 === null) pending.push(gid);
        else raw += got2;
      }
    });
    return {
      raw: raw, max: max, marks: marks.join(""),
      band: pending.length ? null : toBand(raw, max, null),
      pending: pending, provisional: pending.length > 0
    };
  }

  function scoreSpeaking(exam, ai) {
    var raw = 0, pending = [], max = 0;
    exam.sections.S.groups.forEach(function (gid) {
      max += exam.groups[gid].scored;
      var got = injected(ai, gid);
      if (got === null) pending.push(gid);
      else raw += got;
    });
    return {
      raw: pending.length ? null : raw, max: max, marks: "",
      band: pending.length ? null : toBand(raw, max, null),
      pending: pending, provisional: pending.length > 0
    };
  }

  /* ── 총점 ──────────────────────────────────────────────────────────
   * 4개 영역 Band 의 합으로 낸다(사용자 확정). 한 영역이라도 미채점이면
   * 합 자체가 성립하지 않으므로 null 을 돌려주고 무엇이 빠졌는지 알린다.
   * 남은 영역만으로 억지 총점을 만들면 거짓 점수가 된다.
   */
  function total(bands) {
    var sum = 0, missing = [];
    ["R", "L", "W", "S"].forEach(function (k) {
      if (bands[k] === null || bands[k] === undefined) missing.push(k);
      else sum += bands[k];
    });
    if (missing.length) {
      return { band: null, score120: null, sum: sum,
               provisional: true, missing: missing };
    }
    var band = 1.0;
    for (var i = 0; i < BAND_SUM.length; i++) {
      if (sum >= BAND_SUM[i][0]) { band = BAND_SUM[i][1]; break; }
    }
    return { band: band, score120: toScore120(band), sum: sum,
             provisional: false, missing: [] };
  }

  window.NEO_SCORE = {
    bandFromPct: bandFromPct, toBand: toBand, toScore120: toScore120,
    scoreModule: scoreModule, scoreSection: scoreSection, route: route,
    scoreWriting: scoreWriting, scoreSpeaking: scoreSpeaking,
    total: total,
    BAND_120: BAND_120, BAND_SUM: BAND_SUM,
    PATH_CAP: PATH_CAP, PATH_FLOOR: PATH_FLOOR
  };
})();
