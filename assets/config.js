/* 학생 코드 인증 백엔드 URL.
 * 비워두면 인증 비활성(앱이 기존처럼 누구나 사용).
 * 구글 Apps Script 웹앱 /exec URL을 넣으면 코드 로그인 활성화.
 * 설정법: AUTH_SETUP.md 참고. */
window.NEO_AUTH = { url: "https://script.google.com/macros/s/AKfycbypbC0SY60yPTvC_GvMJU1FqqKZnRrFMnUceBYr54jNweyErsmZuTexb0VFFn0pcVnL8Q/exec" };

/* AI 첨삭 채점 서버(Render 등) 주소.
 * 비워두면 로컬 채점 서버(http://localhost:8788)로 폴백.
 * Render 배포 URL 을 넣으면 학생 응시 → 리포트 열림 → 자동 채점 + 오디오 저장이 돼요.
 * 설정법: build/mock/feedback/DEPLOY_RENDER.md (끝에 / 없이). */
window.NEO_GRADER = { url: "https://neo-grader.onrender.com" };

/* 앱 전역: 드래그·복사·붙여넣기·우클릭 차단(부정행위 방지).
 * Writing Task1 타일은 pointer 드래그라 영향 없고, 입력창 타이핑/선택은 유지한다. */
(function () {
  ["copy", "cut", "paste", "dragstart", "contextmenu"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, true);
  });
  var css = "*{-webkit-user-select:none;-moz-user-select:none;user-select:none;-webkit-user-drag:none;}"
          + "input,textarea,[contenteditable]{-webkit-user-select:text;-moz-user-select:text;user-select:text;}";
  function inject() { var st = document.createElement("style"); st.textContent = css; (document.head || document.documentElement).appendChild(st); }
  if (document.head) inject(); else document.addEventListener("DOMContentLoaded", inject);
})();
