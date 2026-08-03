/* mobile-guard.js — 모의고사는 폰에서 접근 차단.
 * 실제 시험 환경(넓은 화면·키보드)이 필요해 폰은 막는다. 태블릿·데스크탑은 허용.
 * 사용:
 *   - mock 페이지: 메인 스크립트 맨 위에서  if (NEO_MOBILE.guard()) return;
 *   - 허브 카드:   NEO_MOBILE.isPhone() 로 카드 노출 여부 판단.
 */
(function () {
  "use strict";

  function isPhone() {
    try {
      var ua = navigator.userAgent || "";
      // 폰 UA(안드로이드는 'Mobile' 포함, 태블릿은 미포함) 또는 터치우선 + 짧은 변 500 미만.
      var uaPhone = /iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile|Android.*Mobile/i.test(ua);
      var coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
      var minDim = Math.min(screen.width || 9999, screen.height || 9999);
      return !!(uaPhone || (coarse && minDim < 500));
    } catch (e) { return false; }
  }

  // 폰 + 태블릿(=PC가 아닌 터치기기). 모의고사는 넓은 화면·키보드가 필요해 PC 전용.
  // 태블릿 판별: 마우스(fine pointer)가 없고 터치가 있으면 태블릿(iPadOS 데스크탑 UA 포함).
  function isMobileOrTablet() {
    try {
      if (isPhone()) return true;
      var hasFine = !!(window.matchMedia && matchMedia("(any-pointer: fine)").matches);
      var touch = (navigator.maxTouchPoints || 0) > 0 || ("ontouchstart" in window);
      return touch && !hasFine;
    } catch (e) { return false; }
  }

  function block() {
    try { document.documentElement.style.visibility = "visible"; } catch (e) {}
    var overlay =
      "position:fixed;inset:0;z-index:99999;background:#FBFBF7;color:#0A0A0A;" +
      "display:flex;align-items:center;justify-content:center;padding:28px;" +
      "font-family:'Noto Sans KR',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;";
    var card =
      "max-width:420px;width:100%;border:3px solid #0A0A0A;background:#fff;" +
      "box-shadow:8px 8px 0 #0A0A0A;padding:34px 26px;text-align:center;box-sizing:border-box;";
    var wrap = document.createElement("div");
    wrap.setAttribute("style", overlay);
    wrap.innerHTML =
      '<div style="' + card + '">' +
      '<div style="font-family:monospace;font-size:11px;font-weight:700;letter-spacing:.16em;' +
      'background:#0A0A0A;color:#FBFBF7;display:inline-block;padding:5px 11px;">PC ONLY</div>' +
      '<h1 style="font-weight:900;font-size:26px;line-height:1.25;letter-spacing:-.02em;margin:22px 0 10px;">' +
      '모의고사는 PC에서<br>이용해 주세요</h1>' +
      '<p style="font-size:15px;font-weight:500;line-height:1.65;margin:0 0 22px;">' +
      '실제 시험과 같은 환경(넓은 화면·키보드)이 필요해요. 노트북이나 데스크탑에서 접속해 주세요.<br><br>' +
      '단어장과 문장 조립은 모바일에서도 그대로 쓸 수 있어요.</p>' +
      '<a href="../index.html" style="display:inline-block;font-weight:700;font-size:15px;' +
      'border:3px solid #0A0A0A;background:#E8FF3A;color:#0A0A0A;padding:11px 20px;text-decoration:none;">← 홈으로</a>' +
      '</div>';
    try {
      document.body.innerHTML = "";
      document.body.appendChild(wrap);
      document.body.style.overflow = "hidden";
    } catch (e) {
      document.documentElement.appendChild(wrap);
    }
  }

  window.NEO_MOBILE = {
    isPhone: isPhone,
    isMobileOrTablet: isMobileOrTablet,
    /* 폰이면 차단 화면을 띄우고 true 반환(호출부가 return 으로 중단). */
    guard: function () { if (!isPhone()) return false; block(); return true; },
    /* 모의고사 응시용 — 폰·태블릿이면 차단(PC 전용). */
    guardMock: function () { if (!isMobileOrTablet()) return false; block(); return true; }
  };
})();
