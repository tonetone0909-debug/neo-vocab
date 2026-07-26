/* feedback-io.js — mock 앱 ↔ AI 첨삭(grade.py) 연결.
 * 1) exportBundle: 학생 W텍스트 + S문항별 녹음(base64) → 채점 번들 다운로드
 * 2) aiMaps: feedback JSON({gid:{task,weighted_pts,report_data}}) → {W:{gid:pts}, S:{gid:pts}} (score.js 주입용)
 * 3) openReport: 그룹별 NEO 첨삭 리포트를 앱 내 오버레이(iframe+돌아가기)에 렌더(문항 녹음 주입) — build/mock/feedback/ 재사용
 */
(function () {
  "use strict";
  var FBDIR = "feedback/";   // mock/ 기준 — 배포되는 위치(mock/feedback/). build/ 는 gitignore라 Pages에 없음.

  function blobToB64(blob) {
    return new Promise(function (res) {
      if (!blob) return res(null);
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { res(null); };
      r.readAsDataURL(blob);
    });
  }
  function download(name, obj) {
    var b = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function ktext(key, gid, n) {
    var k = key.g[gid]; if (!k || !k.items) return "";
    for (var i = 0; i < k.items.length; i++) if (k.items[i].n === n) return k.items[i].text;
    return "";
  }

  /* 채점 번들 생성(메모리): [{gid, task, question, answer_text}] (W) + {gid, task, instr, originals?, items:[{n, question, audio_b64}]} (S)
   * which: "W" | "S" | "all"(기본). Writing 은 Speaking 하는 동안 먼저 채점하려고 분리 호출한다. */
  function buildBundle(exam, key, detail, code, setId, which) {
    var items = [], proms = [], ans = detail.answers || {};
    if (which !== "S") exam.sections.W.groups.forEach(function (gid) {
      var g = exam.groups[gid];
      if (g.t === "bas") return;                       // Task1 자동채점 — 첨삭 대상 아님
      var akey = g.src + "_" + (g.t === "email" ? "email" : "disc");
      items.push({
        gid: gid, task: g.t, student: "",
        question: g.t === "email"
          ? ("To " + (g.to || "") + " · " + (g.subject || "") + "\n" + (g.situation || "") + "\nDirections: " + ((g.directions || []).join(" / ")))
          : (g.prof ? g.prof.text : ""),
        answer_text: ans[akey] || ""
      });
    });
    if (which !== "W") exam.sections.S.groups.forEach(function (gid) {
      var g = exam.groups[gid];
      var node = { gid: gid, task: g.t, student: "", instr: g.instr || "", items: [] };
      if (g.t === "repeat") node.originals = (g.items || []).map(function (x) { return ktext(key, gid, x.n); });
      (g.items || []).forEach(function (x) {
        var e = { n: x.n, question: ktext(key, gid, x.n) };
        node.items.push(e);
        proms.push(NEO_EXAMDB.getRec(code, setId, g.src + "_" + x.n)
          .then(function (rec) { return blobToB64(rec && rec.blob); })
          .then(function (b64) { e.audio_b64 = b64; })
          .catch(function () { e.audio_b64 = null; }));
      });
      items.push(node);
    });
    return Promise.all(proms).then(function () { return items; });
  }

  /* 번들을 파일로 다운로드(수동 채점용) */
  function exportBundle(exam, key, detail, code, setId) {
    return buildBundle(exam, key, detail, code, setId).then(function (items) {
      download("bundle_" + code + "_set" + setId + ".json", items);
      return items;
    });
  }

  /* 채점 서버(Render/로컬 serve.py)로 자동 채점 + 오디오·결과 저장.
   * code·setId 를 쿼리로 넘기면 서버가 Supabase 에 저장(교차기기·재청구 방지). 미도달 시 reject → 수동 폴백. */
  function gradeRemote(bundle, endpoint, code, setId) {
    var u = endpoint || "http://localhost:8788/grade";
    if (code != null && setId != null) {
      u += (u.indexOf("?") < 0 ? "?" : "&") + "code=" + encodeURIComponent(code) + "&set=" + encodeURIComponent(setId);
    }
    return fetch(u, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle)
    }).then(function (r) {
      if (!r.ok) throw new Error("grader HTTP " + r.status);
      return r.json();      // {gid: {task, score_0_5, weighted_pts, report_data}}
    });
  }

  /* 저장된 채점 결과 조회(교차기기·재방문 — 재채점 없이). 없으면 null. */
  function fetchResult(endpoint, code, setId) {
    var base = endpoint || "http://localhost:8788/result";
    var u = base + "?code=" + encodeURIComponent(code) + "&set=" + encodeURIComponent(setId);
    return fetch(u).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("result HTTP " + r.status);
      return r.json();      // {gid: {...report_data(오디오 서명URL 포함)...}}
    });
  }

  /* feedback → score.js 주입 맵 */
  function aiMaps(exam, fb) {
    var W = {}, S = {};
    exam.sections.W.groups.forEach(function (gid) { if (fb[gid]) W[gid] = fb[gid].weighted_pts; });
    exam.sections.S.groups.forEach(function (gid) { if (fb[gid]) S[gid] = fb[gid].weighted_pts; });
    return { W: W, S: S };
  }

  /* 그룹의 문항 녹음을 report_data audio 필드에 주입.
   * 서버가 서명 URL(t.audio)을 이미 넣었으면 그걸 우선(교차기기), 없으면 로컬 IndexedDB blob 폴백. */
  function injectRecordings(exam, gid, rd, code, setId) {
    var g = exam.groups[gid], targets = rd.sentences || (rd.questions) || [];
    var proms = targets.map(function (t) {
      if (t.audio) return Promise.resolve();   // 서버 서명 URL 이미 있음
      return NEO_EXAMDB.getRec(code, setId, g.src + "_" + t.n)
        .then(function (rec) { return blobToB64(rec && rec.blob); })
        .then(function (b64) { if (b64) t.audio = b64; })
        .catch(function () {});
    });
    return Promise.all(proms).then(function () { return rd; });
  }

  /* 오버레이(iframe) 안에서도 복사·드래그 차단(부정행위 방지). */
  var FB_BLOCK = "<script>['copy','cut','paste','dragstart','contextmenu'].forEach(function(v){document.addEventListener(v,function(e){e.preventDefault();},true);});<\/script>";

  /* 첨삭 리포트를 앱 안 오버레이(iframe)에 띄우고 '돌아가기' 버튼으로 닫는다.
   * 새 탭(window.open) 대신 인앱 표시 — 복붙 차단·UX 일관성. */
  function showReportOverlay(html) {
    var old = document.getElementById("fb-overlay");
    if (old) old.remove();
    var ov = document.createElement("div");
    ov.id = "fb-overlay";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:99999;background:#f2f2ec;display:flex;flex-direction:column");
    var bar = document.createElement("div");
    bar.setAttribute("style", "flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:3px solid #0A0A0A;background:#FBFBF7");
    var back = document.createElement("button");
    back.textContent = "← 돌아가기";
    back.setAttribute("style", "font:700 15px 'Noto Sans KR',sans-serif;background:#0A0A0A;color:#fff;border:0;border-radius:6px;padding:9px 16px;cursor:pointer");
    bar.appendChild(back);
    var ifr = document.createElement("iframe");
    ifr.setAttribute("style", "flex:1 1 auto;width:100%;border:0;background:#fff");
    ov.appendChild(bar);
    ov.appendChild(ifr);
    document.body.appendChild(ov);
    ifr.srcdoc = html;
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    back.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
  }

  /* 그룹 첨삭 리포트를 앱 오버레이에 (build/mock/feedback 셸+렌더 재사용) */
  function openReport(exam, gid, fbEntry, code, setId) {
    var rd = JSON.parse(JSON.stringify(fbEntry.report_data));
    return injectRecordings(exam, gid, rd, code, setId).then(function (rd2) {
      // no-store 로 항상 최신 렌더러를 받는다(배포 후 옛 캐시로 빈 칸 뜨는 것 방지).
      return Promise.all([
        fetch(FBDIR + "report.html", { cache: "no-store" }).then(function (r) { return r.text(); }),
        fetch(FBDIR + "report-render.js", { cache: "no-store" }).then(function (r) { return r.text(); })
      ]).then(function (parts) {
        var shell = parts[0], render = parts[1];
        var blob = JSON.stringify(rd2).replace(/<\//g, "<\\/");
        var inject = "<script>window.FEEDBACK=" + blob + ";<\/script>\n<script>" + render + "<\/script>";
        var html = shell.replace('<script src="report-render.js"><\/script>', inject + FB_BLOCK);
        showReportOverlay(html);
      });
    });
  }

  window.NEO_FBIO = {
    buildBundle: buildBundle, exportBundle: exportBundle, gradeRemote: gradeRemote,
    fetchResult: fetchResult, aiMaps: aiMaps, openReport: openReport
  };
})();
