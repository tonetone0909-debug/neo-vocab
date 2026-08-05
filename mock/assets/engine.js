/* engine.js — 시험 진행 엔진.
 *
 * 책임: 섹션 시퀀스 강제 / 타이머 / MST 분기 판정 / 이탈·새로고침 복구 / 자동제출.
 * 렌더링은 전혀 하지 않는다. 렌더러는 NEO_RENDER 레지스트리에 등록된 것을 호출한다.
 *
 * 설계 원칙 3가지
 *  1) 단계 전환은 advance() 한 곳에서만 일어난다. 이중 진입·건너뛰기를 구조적으로 막는다.
 *  2) 타이머는 Date.now() 기준 절대 시각(deadlineAt)이다. setInterval 은 표시 갱신 전용.
 *     백그라운드 탭에서 콜백이 스로틀링되므로 누적 방식은 반드시 틀어진다.
 *  3) 경로(path)는 판정 즉시 확정 저장하고 이후 절대 재계산하지 않는다.
 *     복구 때 재계산하면 답안이 바뀌어 경로가 달라질 수 있다.
 */
(function () {
  "use strict";

  /* 섹션 순서는 상수로 고정. 되돌아가기 없음. */
  var FLOW = [
    { sec: "R", stage: "s1", mod: "router" },
    { sec: "R", stage: "s2", mod: null },      // mod 는 라우팅 후 확정
    { sec: "L", stage: "s1", mod: "router" },
    { sec: "L", stage: "s2", mod: null },
    { sec: "W", stage: "all", mod: null },
    { sec: "S", stage: "all", mod: null }
  ];

  function now() { return Date.now(); }

  function Engine(opts) {
    this.exam = opts.exam;
    this.key = opts.key;            // 라우팅 판정에만 쓴다. 화면에 절대 노출하지 않는다.
    this.code = opts.code;
    this.sid = opts.exam.set_id;
    this.host = opts.host;
    this.free = !!opts.free;          // 자유 모드(강사): 시간 무제한 + 섹션 자유이동
    this.onPhase = opts.onPhase || function () {};
    this.onTick = opts.onTick || function () {};
    this.onFinish = opts.onFinish || function () {};
    this.onSubmit = opts.onSubmit || function () {};   // 파트 제출 직후(phaseKey) — W.all 조기 채점 트리거용
    this.onIntro = opts.onIntro || null;   // 없으면 설명 화면을 건너뛴다
    this.st = null;
    this._tick = null;
    this._guard = null;
  }

  Engine.prototype.freshState = function () {
    return {
      code: this.code, set_id: this.sid,
      step: 0,                     // FLOW 인덱스
      path: {},                    // {R:"upper", L:"lower"} — 확정 후 불변
      deadlines: {},               // {"R.s1": 절대ms}
      answers: {},                 // {questionId: 선택인덱스 | 문자열 | 타일배열}
      spent: {},                   // {"R.s1": 초} — 제출 시점에 기록
      cursor: 0,                   // 현재 단계 안에서의 화면 인덱스
      flags: {},                   // {questionId: true}
      entered: {},                 // {phaseKey: 절대ms} — 문항별 구간의 소요시간 계산용
      played: {},                  // {groupId: 1} — 오디오는 1회만 재생. 새로고침해도 다시 못 듣는다
      recs: {},                    // {itemId: 1} — Speaking 녹음 완료 표시
      intro: {},                   // {phaseKey: 1} — 설명 화면을 이미 본 단계
      startedAt: now(), updatedAt: now(),
      done: false
    };
  };

  /* 진행 중 스냅샷이 있으면 이어서, 없으면 새로. */
  Engine.prototype.start = function () {
    var self = this;
    return NEO_EXAMDB.getSession(this.code, this.sid).then(function (snap) {
      self.st = (snap && !snap.done) ? snap : self.freshState();
      self.installGuard();
      self.enter();
      return !!(snap && !snap.done);
    });
  };

  /* ---- 타이머 ---------------------------------------------------- */

  Engine.prototype.phaseKey = function () {
    var f = FLOW[this.st.step];
    return f ? f.sec + "." + f.stage : "done";
  };

  /* Listening 은 모듈 총시간이 아니라 **문항별 카운트다운**이다.
   * 음원이 끝난 뒤부터 20초(Task4 는 30초)가 돌고, 끝나면 다음 문항으로 자동 이동한다.
   * 재생 중에는 타이머를 돌리지 않는다 — 음원 길이가 답변 시간을 잡아먹으면 안 된다. */
  Engine.prototype.isPerQ = function () {
    var f = FLOW[this.st.step];
    return !!(f && this.exam.sections[f.sec] && this.exam.sections[f.sec].perQ);
  };

  /* Writing 은 **태스크(그룹)별 타이머**다 — Task1 6:50 / Task2 7:00 / Task3 10:00.
   * 한 태스크 안에서는 문항을 오갈 수 있고, 그 태스크 시간이 끝나면 다음 태스크로 넘어간다. */
  Engine.prototype.isPerGroup = function () {
    var f = FLOW[this.st.step];
    return !!(f && this.exam.sections[f.sec] && this.exam.sections[f.sec].perGroup);
  };

  Engine.prototype.curGid = function () {
    var s = this.steps()[this.st.cursor];
    return s ? s.gid : "";
  };

  /* 타이머를 저장하는 키. 문항별이면 커서까지 넣어 문항마다 따로 관리한다. */
  Engine.prototype.timerKey = function () {
    var k = this.phaseKey();
    if (this.isPerQ()) return k + "#" + this.st.cursor;
    if (this.isPerGroup()) return k + "#" + this.curGid();
    return k;
  };

  Engine.prototype.curGroup = function () {
    var s = this.steps()[this.st.cursor];
    return s ? this.exam.groups[s.gid] : null;
  };

  /* 제한시간은 모듈 단위다. Reading 은 모듈의 문항 구성에서 계산된 값이 들어온다
   * (Task1 세트당 2:30 / Task2 문항당 0:30 / Task3 문항당 1:00). */
  Engine.prototype.budget = function () {
    if (this.free) return 1e12;        // 자유 모드: 사실상 무제한 (자동 넘김 없음)
    var f = FLOW[this.st.step];
    if (this.isPerQ()) {
      var g = this.curGroup();
      return ((g && g.qsec) || 20) * 1000;
    }
    if (this.isPerGroup()) {
      var gg = this.curGroup();
      return ((gg && gg.tsec) || 600) * 1000;
    }
    var t = this.exam.sections[f.sec].time;
    if (f.stage === "all") return t.all * 1000;
    var mod = f.mod || this.st.path[f.sec];
    return (t[mod] !== undefined ? t[mod] : t[f.stage]) * 1000;
  };

  /* 남은 ms. 이탈 중에도 시간이 흐르므로 벽시계 기준으로 계산한다. */
  Engine.prototype.left = function () {
    var d = this.st.deadlines[this.timerKey()];
    return d ? Math.max(0, d - now()) : this.budget();
  };

  /* 일시정지 — 남은 시간을 기록하고 타이머를 멈춘다.
   * 마감시각을 절대값(Date.now 기준)으로 들고 있어서, 멈춘 동안 흐른 시간을
   * 그대로 두면 재개할 때 그만큼 깎인다. 남은 ms 를 저장했다가 다시 건다. */
  Engine.prototype.pause = function () {
    if (this.st.paused) return;
    var k = this.timerKey();
    var dl = this.st.deadlines[k];
    this.st.paused = { key: k, left: dl ? Math.max(0, dl - now()) : null };
    this.stopTimer();
    this.save();
  };

  Engine.prototype.resume = function () {
    var p = this.st.paused;
    if (!p) return;
    if (p.left !== null && p.left !== undefined) {
      this.st.deadlines[p.key] = now() + p.left;
    }
    this.st.paused = null;
    this.save();
    if (this.isPerQ()) this.armIfReady(); else this.startTimer();
  };

  /* 지금 모듈의 문항별 응답 여부. Review 화면이 쓴다. */
  Engine.prototype.progress = function () {
    var self = this, steps = this.steps(), nums = this.numbers(steps);
    return steps.map(function (s, i) {
      var g = self.exam.groups[s.gid];
      var ids = [];
      if (g.t === "ctw") {
        g.blanks.forEach(function (b) { ids.push(s.gid + "_b" + b.n); });
      } else if (g.q) {
        ids.push(g.q[s.qi].id);
      } else if (g.items && g.items[s.qi]) {
        ids.push(g.items[s.qi].id);
      }
      var done = ids.length && ids.every(function (id) {
        var v = self.st.answers[id];
        return v !== undefined && v !== null && v !== "" &&
               !(Array.isArray(v) && !v.length);
      });
      return { cursor: i, num: nums[i], answered: !!done, gid: s.gid };
    });
  };

  Engine.prototype.startTimer = function () {
    var self = this, k = this.timerKey();
    if (this.st.paused) return;          // 재개할 때 resume() 이 다시 건다
    if (!this.st.deadlines[k]) {
      this.st.deadlines[k] = now() + this.budget();
      this.save();
    }
    this.stopTimer();
    this._tick = setInterval(function () {
      var ms = self.left();
      self.onTick(ms, self.budget());
      if (ms <= 0) {
        self.stopTimer();
        // 문항별이면 다음 문항, 그룹별이면 다음 태스크, 아니면 파트 제출
        if (self.isPerQ()) self.nextQ();
        else if (self.isPerGroup()) self.nextGroup();
        else self.submitPhase(true);
      }
    }, 250);
    this.onTick(this.left(), this.budget());
  };

  /* 문항 시간이 끝났다. 마지막 문항이면 파트를 제출한다. */
  Engine.prototype.nextQ = function () {
    if (this.st.cursor < this.steps().length - 1) this.go(1);
    else this.submitPhase(true);
  };

  /* 자유 모드 — 임의 FLOW 단계로 점프(섹션 자유이동). enter()가 라우팅·인트로·타이머·draw 처리.
   * s2 로 바로 가면 enter()가 현재 답안으로 경로를 확정한다(답 없으면 lower). */
  Engine.prototype.jumpTo = function (step) {
    if (!this.free || step < 0 || step >= FLOW.length) return;
    this.stopTimer();
    this.st.step = step;
    this.st.cursor = 0;
    this.save();
    this.enter();
  };

  /* 태스크 시간이 끝났다. 다음 태스크의 첫 화면으로 건너뛴다. */
  Engine.prototype.nextGroup = function () {
    var steps = this.steps(), cur = this.curGid();
    for (var i = this.st.cursor + 1; i < steps.length; i++) {
      if (steps[i].gid !== cur) {
        this.st.cursor = i;
        this.save();
        var self2 = this;
        if (this.groupIntro(function () { self2.startTimer(); self2.draw(); })) return;
        this.startTimer();
        this.draw();
        return;
      }
    }
    this.submitPhase(true);
  };

  /* 렌더러가 오디오 재생을 마치면 부른다 — 여기서부터 답변 시간이 돈다. */
  Engine.prototype.arm = function () {
    if (this.isPerQ()) this.startTimer();
  };

  /* Speaking 은 렌더러가 재생->beep->녹음->다음 을 스스로 몰아간다.
   * 녹음이 끝나면 이걸 불러 다음 화면으로 넘긴다. 마지막이면 파트 제출. */
  Engine.prototype.advanceAuto = function () {
    if (this.st.cursor < this.steps().length - 1) this.go(1);
    else this.submitPhase(false);
  };

  Engine.prototype.stopTimer = function () {
    if (this._tick) { clearInterval(this._tick); this._tick = null; }
  };

  /* ---- 화면 구성 -------------------------------------------------- */

  /* 현재 단계의 화면 목록을 만든다.
   * 지문+문항 묶음(group)이 최소 렌더 단위지만, 실제 시험은 문항을 하나씩 보여준다.
   * 그래서 group 을 화면 단위로 펼친다. Complete the Words 는 지문 전체가 한 화면이다. */
  Engine.prototype.steps = function () {
    var f = FLOW[this.st.step], ex = this.exam, out = [];
    var gids;
    if (f.sec === "R" || f.sec === "L") {
      var mod = f.mod || this.st.path[f.sec];
      gids = ex.sections[f.sec].modules[mod].groups;
    } else {
      gids = ex.sections[f.sec].groups;
    }
    gids.forEach(function (gid) {
      var g = ex.groups[gid];
      if (g.t === "bas" || g.t === "repeat" || g.t === "interview") {
        // 한 화면에 한 문항. Speaking 은 문항마다 그림·영상이 다르고 녹음이 따로다.
        g.items.forEach(function (_, i) { out.push({ gid: gid, qi: i }); });
      } else if (g.t === "ctw" || g.t === "email" || g.t === "disc") {
        out.push({ gid: gid, qi: -1 });          // 그룹 전체가 한 화면
      } else {
        g.q.forEach(function (_, i) { out.push({ gid: gid, qi: i }); });
      }
    });
    return out;
  };

  /* Review 화면에서 특정 문항으로 건너뛴다. */
  Engine.prototype.jump = function (cursor) {
    var steps = this.steps();
    if (cursor < 0 || cursor >= steps.length) return;
    this.st.cursor = cursor;
    this.save();
    var self = this;
    if (this.groupIntro(function () { self.startAndDraw(); })) return;
    this.startAndDraw();
  };

  Engine.prototype.enter = function () {
    if (window.NEO_RENDER && window.NEO_RENDER.stopAudio) {
      window.NEO_RENDER.stopAudio();
    }
    var f = FLOW[this.st.step];
    if (!f) return this.finish();

    // Stage2 진입 시점에 경로를 확정한다. 이미 확정돼 있으면 건드리지 않는다.
    if (f.stage === "s2" && !this.st.path[f.sec]) {
      var r = NEO_SCORE.route(f.sec, this.exam, this.key, this.st.answers);
      this.st.path[f.sec] = r.path;
      this.save();
    }
    // 단계 시작 전 설명 화면. 내용은 data/intro.js 가 들고 있고, 없으면 건너뛴다.
    // **타이머는 설명을 닫은 뒤에 시작한다** — 설명을 읽는 동안 시간이 흐르면
    // 안 되기 때문에 begin() 을 따로 뺐다.
    var self = this, key = this.phaseKey();
    if (!this.st.intro) this.st.intro = {};
    if (this.onIntro && !this.st.intro[key] && introFor(key)) {
      this.onPhase(this.info());          // 헤더(섹션명)는 미리 맞춰 둔다
      this.onIntro(this.info(), introFor(key), function () {
        self.st.intro[key] = 1;
        self.save();
        self.begin();
      });
      return;
    }
    this.begin();
  };

  function introFor(key) {
    var all = window.NEO_INTRO;
    if (!all) return null;
    var pages = all[key];
    if (!pages || !pages.length) return null;
    return pages;
  }

  /* 실제 단계 시작 — 여기서부터 시간이 흐른다. */
  Engine.prototype.begin = function () {
    if (!this.st.entered) this.st.entered = {};
    if (!this.st.entered[this.phaseKey()]) this.st.entered[this.phaseKey()] = now();
    this.st.cursor = Math.min(this.st.cursor, this.steps().length - 1);
    if (this.st.cursor < 0) this.st.cursor = 0;
    var self = this;
    if (this.groupIntro(function () { self.startAndDraw(); })) return;
    this.startAndDraw();
  };

  Engine.prototype.startAndDraw = function () {
    if (this.isPerQ()) this.armIfReady(); else this.startTimer();
    // (그룹별 타이머는 startTimer 가 timerKey 로 알아서 그룹 것을 잡는다)
    this.onPhase(this.info());
    this.draw();
  };

  /* 화면별 문항 번호를 매긴다.
   * Complete the Words 는 한 화면이 10문항이라 번호가 범위가 된다 ("1-10").
   * 번호는 섹션 전체에 걸쳐 이어진다 — Stage2 는 router 문항 수 다음부터 시작한다.
   * (Reading 이면 router 20문항 다음이니 21부터) */
  Engine.prototype.numbers = function (steps) {
    var ex = this.exam;
    // 번호는 **모듈 안에서** 1부터 센다. 섹션 전체로 이어 세면 Stage2 가
    // "21 of 15" 처럼 총계와 어긋난다.
    var n = 1;
    return steps.map(function (s) {
      var span = screenQuestions(ex.groups[s.gid], s.qi);
      var from = n;
      n += span;
      return span > 1 ? { from: from, to: n - 1 } : { from: from, to: from };
    });
  };

  /* 이 화면이 몇 문항을 담당하는가.
   * 한 화면에 여러 문항인 유형이 있다 — Complete the Words 10개, Build a Sentence 10개,
   * Listen and Repeat 7개, Interview 4개. 이걸 1로 세면 번호가 어긋난다. */
  function screenQuestions(g, qi) {
    if (qi >= 0) return 1;
    if (g.blanks) return g.blanks.length;      // ctw
    if (g.items) return g.items.length;        // bas / repeat / interview
    return 1;                                  // email / disc
  }

  function moduleQuestions(ex, gids) {
    var n = 0;
    gids.forEach(function (gid) {
      var g = ex.groups[gid];
      n += g.q ? g.q.length : screenQuestions(g, -1);
    });
    return n;
  }

  /* 섹션에서 학생이 풀게 되는 총 **문항 수**. "QUESTION 3 of 35" 의 뒷숫자.
   * scored(배점 합)를 쓰면 안 된다 — Writing 은 12문항인데 배점이 20이고,
   * Speaking 은 11문항인데 55다. 학생에게 보여줄 건 문항 수다.
   * R·L 은 경로와 무관하게 항상 35 라 Stage1 에서도 미리 보여줄 수 있다. */
  /* 지금 모듈의 문항 수. 헤더의 "... of N" 이 이 값을 쓴다. */
  Engine.prototype.moduleTotal = function () {
    var f = FLOW[this.st.step];
    if (!f) return 0;
    var ex = this.exam, sec = ex.sections[f.sec];
    if (!sec) return 0;
    if (sec.modules) {
      var mod = f.mod || this.st.path[f.sec] || "lower";
      return moduleQuestions(ex, sec.modules[mod].groups);
    }
    return moduleQuestions(ex, sec.groups);
  };

  Engine.prototype.sectionTotal = function (sec) {
    var s = this.exam.sections[sec];
    if (!s) return 0;
    if (s.modules) {
      var path = this.st.path[sec] || "lower";
      return moduleQuestions(this.exam, s.modules.router.groups) +
             moduleQuestions(this.exam, s.modules[path].groups);
    }
    return moduleQuestions(this.exam, s.groups);
  };

  Engine.prototype.info = function () {
    var f = FLOW[this.st.step] || { sec: "done", stage: "" };
    var steps = f.sec === "done" ? [] : this.steps();
    return {
      sec: f.sec, stage: f.stage, step: this.st.step,
      mod: f.mod || this.st.path[f.sec] || "",
      cursor: this.st.cursor, total: steps.length,
      canBack: f.sec === "done" ? false : this.canGoBack(),
      steps: steps, nums: f.sec === "done" ? [] : this.numbers(steps),
      secTotal: f.sec === "done" ? 0 : this.moduleTotal(),
      gt: (this.curGroup() || {}).t || "",   // 현재 그룹 유형 (Review 노출 판단)
      paused: !!this.st.paused,
      path: this.st.path,
      played: this.st.played   // {gid:1} — 오디오를 실제로 들은 그룹. 리스닝 Next 게이트 판단용
    };
  };

  /* 태스크(그룹) 설명 화면.
   * 키는 "<phaseKey>:<그룹타입>" — 예: "W.all:email", "S.all:interview".
   * Writing·Speaking 은 태스크마다 안내가 따로 있고, 실제 시험도 태스크 직전에
   * 띄운다. 섹션 시작에 몰아 넣으면 학생이 읽을 시점을 놓친다.
   *
   * 이미 본 태스크면 false 를 돌려 그냥 진행한다. */
  Engine.prototype.groupIntro = function (proceed) {
    var g = this.curGroup();
    if (!g) return false;
    var key = this.phaseKey() + ":" + g.t;
    if (!this.onIntro || this.st.intro[key] || !introFor(key)) return false;
    var self = this;
    this.stopTimer();                 // 설명을 읽는 동안 시간이 흐르면 안 된다
    this.onPhase(this.info());
    this.onIntro(this.info(), introFor(key), function () {
      self.st.intro[key] = 1;
      self.save();
      proceed();
    });
    return true;
  };

  Engine.prototype.draw = function () {
    // 화면이 바뀌면 재생 중인 음원을 먼저 끊는다. Audio 는 DOM 밖에 살아서
    // host 를 비우는 것만으로는 안 멈춘다.
    if (window.NEO_RENDER && window.NEO_RENDER.stopAudio) {
      window.NEO_RENDER.stopAudio();
    }
    var s = this.steps()[this.st.cursor];
    if (!s) return;
    var g = this.exam.groups[s.gid];
    var r = window.NEO_RENDER[g.t];
    this.host.innerHTML = "";
    if (!r) {
      this.host.textContent = "This question type is not available: " + g.t;
      return;
    }
    r(this.host, {
      group: g, gid: s.gid, qi: s.qi,
      answers: this.st.answers, flags: this.st.flags,
      played: this.st.played, recs: this.st.recs,
      code: this.code, setId: this.sid, free: this.free,
      set: this.setAnswer.bind(this),
      flag: this.toggleFlag.bind(this),
      mark: this.markMeta.bind(this),
      arm: this.arm.bind(this),
      next: this.advanceAuto.bind(this)
    });
    this.onPhase(this.info());
  };

  /* ---- 답안 ------------------------------------------------------- */

  Engine.prototype.setAnswer = function (qid, val) {
    this.st.answers[qid] = val;
    this.save();
    this.onPhase(this.info());     // 진행 점(dot) 갱신
  };

  /* 오디오 재생·녹음처럼 답안이 아닌 진행 상태를 기록한다. 채점에는 안 쓰인다. */
  Engine.prototype.markMeta = function (bucket, id) {
    if (!this.st[bucket]) this.st[bucket] = {};
    this.st[bucket][id] = 1;
    this.save();
  };

  Engine.prototype.toggleFlag = function (qid) {
    if (this.st.flags[qid]) delete this.st.flags[qid];
    else this.st.flags[qid] = 1;
    this.save();
    this.onPhase(this.info());
  };

  /* 문항별 구간: 이미 들은 문항이면 바로 타이머를 걸고, 아니면 대기 상태로 둔다. */
  Engine.prototype.armIfReady = function () {
    this.stopTimer();
    var s = this.steps()[this.st.cursor];
    if (s && this.st.played[s.gid]) this.startTimer();
    else this.onTick(null, this.budget());
  };

  /* 태스크 경계를 뒤로 넘을 수 있는가.
   * Writing 은 태스크마다 시간이 따로라, 다음 태스크로 넘어간 뒤 이전 태스크로
   * 돌아갈 수 있으면 남겨둔 시간을 나중에 다시 쓰는 셈이 된다. 앞으로만 간다. */
  Engine.prototype.canGoBack = function () {
    if (this.st.cursor === 0) return false;
    if (!this.isPerGroup()) return true;
    var steps = this.steps();
    return steps[this.st.cursor - 1].gid === steps[this.st.cursor].gid;
  };

  Engine.prototype.go = function (delta) {
    var n = this.steps().length;
    var c = this.st.cursor + delta;
    if (c < 0 || c >= n) return false;
    if (delta < 0 && !this.canGoBack()) return false;
    this.st.cursor = c;
    this.save();
    var self = this;
    if (this.groupIntro(function () { self.afterMove(); })) return true;
    this.afterMove();
    return true;
  };

  Engine.prototype.afterMove = function () {
    if (this.isPerQ()) this.armIfReady();
    else if (this.isPerGroup()) this.startTimer();
    this.draw();
  };

  Engine.prototype.jump = function (i) {
    if (i < 0 || i >= this.steps().length) return;
    this.st.cursor = i;
    this.save();
    this.draw();
  };

  /* ---- 저장 / 복구 ------------------------------------------------ */

  Engine.prototype.save = function () {
    this.st.updatedAt = now();
    return NEO_EXAMDB.putSession(this.st).catch(function () {});
  };

  Engine.prototype.installGuard = function () {
    if (this._guard) return;
    var self = this;
    this._guard = function (e) {
      if (self.st && !self.st.done) { e.preventDefault(); e.returnValue = ""; return ""; }
    };
    window.addEventListener("beforeunload", this._guard);
  };

  Engine.prototype.removeGuard = function () {
    if (this._guard) { window.removeEventListener("beforeunload", this._guard); this._guard = null; }
  };

  /* ---- 단계 제출 -------------------------------------------------- */

  Engine.prototype.submitPhase = function (auto) {
    var k = this.phaseKey();
    if (this.st.spent[k] !== undefined) return;      // 이중 제출 방지
    if (this.isPerQ() || this.isPerGroup()) {
      // 문항별·그룹별 구간은 모듈 예산이 없다. 진입 시각부터 잰다.
      this.st.spent[k] = Math.round((now() - (this.st.entered[k] || now())) / 1000);
    } else {
      var d = this.st.deadlines[k];
      this.st.spent[k] = Math.round((this.budget() - Math.max(0, d - now())) / 1000);
    }
    this.st.autoSubmitted = this.st.autoSubmitted || {};
    if (auto) this.st.autoSubmitted[k] = 1;
    this.stopTimer();
    this.st.step += 1;
    this.st.cursor = 0;
    this.save();
    try { this.onSubmit(k); } catch (e) {}   // 방금 제출한 파트(k). Writing 끝나면 채점 선시작.
    this.enter();
  };

  /* 답안 스냅샷(읽기용) — Writing 조기 채점이 detail 없이 번들을 만들 때 쓴다. */
  Engine.prototype.answers = function () { return this.st.answers; };

  Engine.prototype.finish = function () {
    var self = this;
    this.stopTimer();
    this.st.done = true;
    this.st.finishedAt = now();
    this.removeGuard();

    var res = this.grade();
    var detail = {
      code: this.code, set_id: this.sid,
      answers: this.st.answers, flags: this.st.flags,
      spent: this.st.spent, path: this.st.path,
      startedAt: this.st.startedAt, finishedAt: this.st.finishedAt,
      result: res
    };
    return NEO_EXAMDB.putDetail(detail)
      .then(function () { return NEO_EXAMDB.delSession(self.code, self.sid); })
      .then(function () { self.save = function () {}; self.onFinish(res, detail); })
      .catch(function () { self.onFinish(res, detail); });
  };

  Engine.prototype.grade = function () {
    var ex = this.exam, k = this.key, a = this.st.answers;
    var R = NEO_SCORE.scoreSection("R", this.st.path.R || "lower", ex, k, a);
    var L = NEO_SCORE.scoreSection("L", this.st.path.L || "lower", ex, k, a);
    // W Task2·3 과 S 는 AI 첨삭 전이라 ai 인자 없이 부른다 -> pending 으로 남는다.
    // 나중에 첨삭 결과가 들어오면 리포트가 같은 함수를 ai 와 함께 다시 부른다.
    var W = NEO_SCORE.scoreWriting(ex, k, a, null);
    var S = NEO_SCORE.scoreSpeaking(ex, null);
    var o = NEO_SCORE.total({ R: R.band, L: L.band, W: W.band, S: S.band });
    var total = 0;
    for (var key2 in this.st.spent) total += this.st.spent[key2];
    return { R: R, L: L, W: W, S: S, overall: o, seconds: total };
  };

  window.NEO_ENGINE = Engine;
  window.NEO_ENGINE.FLOW = FLOW;
})();
