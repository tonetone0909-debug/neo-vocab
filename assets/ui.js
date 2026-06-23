/* ui.js — 인앱 모달(확인/알림). 네이티브 confirm()/alert() 대체.
 * neoConfirm(msg, {danger, okText, cancelText}) → Promise<boolean>
 * neoAlert(msg, {okText}) → Promise<void> (확인 버튼만) */
(function () {
  var overlay, msgEl, okBtn, cancelBtn, resolver;

  function build() {
    overlay = document.createElement("div");
    overlay.className = "neo-modal-overlay";
    overlay.innerHTML =
      '<div class="neo-modal" role="dialog" aria-modal="true">' +
        '<div class="neo-modal-msg"></div>' +
        '<div class="neo-modal-actions">' +
          '<button class="btn btn-ghost" data-act="cancel">취소</button>' +
          '<button class="btn btn-grind" data-act="ok">확인</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    msgEl = overlay.querySelector(".neo-modal-msg");
    cancelBtn = overlay.querySelector('[data-act="cancel"]');
    okBtn = overlay.querySelector('[data-act="ok"]');
    cancelBtn.addEventListener("click", function () { close(false); });
    okBtn.addEventListener("click", function () { close(true); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(false); });
    document.addEventListener("keydown", function (e) {
      if (overlay.classList.contains("show")) {
        if (e.key === "Escape") close(false);
        else if (e.key === "Enter") close(true);
      }
    });
  }

  function close(val) {
    overlay.classList.remove("show");
    var r = resolver; resolver = null;
    if (r) r(val);
  }

  function open(message, opts) {
    if (!overlay) build();
    opts = opts || {};
    msgEl.textContent = message;
    okBtn.textContent = opts.okText || "확인";
    cancelBtn.textContent = opts.cancelText || "취소";
    cancelBtn.style.display = opts.alert ? "none" : "";
    okBtn.className = "btn " + (opts.danger ? "btn-hard" : "btn-grind");
    overlay.classList.add("show");
    setTimeout(function () { okBtn.focus(); }, 0);
    return new Promise(function (res) { resolver = res; });
  }

  window.neoConfirm = function (m, o) { return open(m, o || {}); };
  window.neoAlert = function (m, o) { return open(m, Object.assign({ alert: true }, o || {})); };
})();
