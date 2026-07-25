/* examdb.js — IndexedDB 래퍼. 진행 스냅샷 / 확정 상세 / Speaking 녹음.
 *
 * localStorage 가 아니라 IndexedDB 인 이유 두 가지.
 *   1) Speaking 녹음 Blob 을 답안과 같은 트랜잭션에 넣어야 정합성이 맞는다.
 *   2) localStorage 5MB 한도에 녹음(세트당 약 1MB)이 안 들어간다.
 *
 * 스토어는 코드(학생)별로 키가 갈린다. 한 기기를 여러 학생이 쓰는 상황을 가정한다.
 */
(function () {
  "use strict";

  var NAME = "neo_mock", VER = 2;   // v2: AI 첨삭 결과 영구 캐시(feedbacks) 추가
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var rq = indexedDB.open(NAME, VER);
      rq.onupgradeneeded = function (e) {
        var db = e.target.result;
        // 진행 중 스냅샷 — 매 답안마다 덮어쓴다
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: ["code", "set_id"] });
        }
        // 제출 확정된 상세 (답안 + 마크 + 소요시간). 리포트가 읽는다
        if (!db.objectStoreNames.contains("details")) {
          db.createObjectStore("details", { keyPath: ["code", "set_id"] });
        }
        // Speaking 녹음 Blob
        if (!db.objectStoreNames.contains("recordings")) {
          db.createObjectStore("recordings", { keyPath: ["code", "set_id", "item_id"] });
        }
        // AI 첨삭 결과 — 세트당 한 번 채점하고 영구 재사용(재채점=재비용 방지)
        if (!db.objectStoreNames.contains("feedbacks")) {
          db.createObjectStore("feedbacks", { keyPath: ["code", "set_id"] });
        }
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode);
        var rq = fn(t.objectStore(store));
        t.oncomplete = function () { res(rq && rq.result); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }

  var API = {
    /* 시험 시작 전에 호출. iOS 는 용량 압박 시 스토리지를 회수할 수 있어서,
     * 녹음이 날아가지 않도록 영속 권한을 미리 요청한다. 거부돼도 진행은 한다. */
    persist: function () {
      if (navigator.storage && navigator.storage.persist) {
        return navigator.storage.persist().catch(function () { return false; });
      }
      return Promise.resolve(false);
    },

    getSession: function (code, sid) {
      return tx("sessions", "readonly", function (s) { return s.get([code, sid]); });
    },
    putSession: function (snap) {
      return tx("sessions", "readwrite", function (s) { return s.put(snap); });
    },
    delSession: function (code, sid) {
      return tx("sessions", "readwrite", function (s) { return s.delete([code, sid]); });
    },

    getDetail: function (code, sid) {
      return tx("details", "readonly", function (s) { return s.get([code, sid]); });
    },
    putDetail: function (d) {
      return tx("details", "readwrite", function (s) { return s.put(d); });
    },

    putRec: function (code, sid, itemId, blob, mime) {
      return tx("recordings", "readwrite", function (s) {
        return s.put({ code: code, set_id: sid, item_id: itemId, blob: blob, mime: mime });
      });
    },
    getRec: function (code, sid, itemId) {
      return tx("recordings", "readonly", function (s) {
        return s.get([code, sid, itemId]);
      });
    },

    /* AI 첨삭 결과 — 세트당 한 번 채점하고 영구 저장/재사용 */
    getFeedback: function (code, sid) {
      return tx("feedbacks", "readonly", function (s) { return s.get([code, sid]); });
    },
    putFeedback: function (code, sid, fb) {
      return tx("feedbacks", "readwrite", function (s) {
        return s.put({ code: code, set_id: sid, fb: fb });
      });
    },

    /* 한 세트의 응시 기록을 통째로 지운다 (관리자 초기화 전용).
     * 세션·상세·녹음 셋을 모두 지워야 '아직 응시 안 함' 상태로 돌아간다.
     * 하나라도 남으면 재응시 화면과 리포트가 어긋난다. */
    wipeSet: function (code, sid) {
      return tx("sessions", "readwrite", function (s) {
        return s.delete([code, sid]);
      }).then(function () {
        return tx("details", "readwrite", function (s) {
          return s.delete([code, sid]);
        });
      }).then(function () {
        // 녹음은 item_id 까지 키에 들어가 있어 범위로 지운다
        return open().then(function (db) {
          return new Promise(function (res, rej) {
            var t = db.transaction("recordings", "readwrite");
            var st = t.objectStore("recordings");
            var range = IDBKeyRange.bound([code, sid, ""], [code, sid, "￿"]);
            var rq = st.openCursor(range);
            rq.onsuccess = function () {
              var cur = rq.result;
              if (!cur) return;
              cur.delete();
              cur.continue();
            };
            t.oncomplete = function () { res(true); };
            t.onerror = function () { rej(t.error); };
          });
        });
      }).then(function () {
        // 첨삭 캐시도 지운다 — 리셋 후 재응시하면 새로 채점되도록
        return tx("feedbacks", "readwrite", function (s) {
          return s.delete([code, sid]);
        }).catch(function () { return true; });
      });
    },

    /* 지원 여부 — 안 되면 시험 시작 게이트에서 미리 막아야 한다.
     * 시험 중간에 발견되면 최악이다. */
    supported: function () {
      try { return !!window.indexedDB; } catch (e) { return false; }
    }
  };

  window.NEO_EXAMDB = API;
})();
