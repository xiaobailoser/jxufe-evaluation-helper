(function () {
  "use strict";

  if (window.__jxufeEvaluationConfirmGuardInstalled) return;
  window.__jxufeEvaluationConfirmGuardInstalled = true;

  const originalConfirm = window.confirm.bind(window);
  let armedUntil = 0;

  window.addEventListener("jxufe-arm-temporary-save-confirm", function () {
    armedUntil = Date.now() + 5000;
  });

  function isTemporarySavePrompt(message) {
    const normalized = String(message || "")
      .replace(/\s+/g, "")
      .replace(/[，,。.!！?？:：;；'"“”‘’]/g, "");

    return normalized.includes("保存数据") &&
      normalized.includes("不会完成评价") &&
      normalized.includes("是否继续");
  }

  window.confirm = function (message) {
    if (Date.now() <= armedUntil && isTemporarySavePrompt(message)) {
      armedUntil = 0;
      return true;
    }
    return originalConfirm(message);
  };
})();
