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
