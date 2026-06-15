(async function () {
  "use strict";

  while (!document.querySelector("#form-host")?.contentDocument
    ?.querySelector("#evaluation-frame")?.contentDocument
    ?.querySelector("#evaluation-dialog")) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const settings = {
    rating: "优秀",
    autoSave: true,
    recommendationTemplates: ["推荐模板一", "推荐模板二", "推荐模板三"],
    feedbackTemplates: ["意见模板一", "意见模板二", "意见模板三"]
  };

  const state = await new Promise((resolve, reject) => {
    if (!window.mockRuntimeListener) {
      reject(new Error("内容脚本没有注册消息监听器"));
      return;
    }
    const keepChannelOpen = window.mockRuntimeListener(
      { type: "JXUFE_START", payload: settings },
      {},
      resolve
    );
    if (keepChannelOpen !== true) reject(new Error("批处理消息通道未保持开启"));
  });

  const errors = [];
  if (window.mockSaved.length !== 10) errors.push(`暂存数量为 ${window.mockSaved.length}`);
  if (document.querySelectorAll(".score").length !== 10 ||
    Array.from(document.querySelectorAll(".score")).some((cell) => cell.textContent !== "95.00")) {
    errors.push("课程列表没有全部回写分数");
  }
  if (window.mockSaved.some((item) => item.checked !== 16)) errors.push("存在未完成的单选题");
  if (window.mockSaved.some((item) => item.text.length !== 2 || item.text.some((text) => !text))) {
    errors.push("存在未完成的必填文本框");
  }
  if (window.mockFinalSubmitClicks !== 0) errors.push("最终提交被脚本点击");
  if (state.courses.some((course) => course.status !== "complete")) errors.push("课程状态未全部完成");
  if (!document.querySelector("#jxufe-evaluation-preview")) errors.push("没有显示最终核对预览");

  document.body.dataset.testStatus = errors.length ? "failed" : "passed";
  document.body.dataset.testErrors = errors.join("；");
  document.title = errors.length ? `FAILED: ${errors.join("；")}` : "PASSED: evaluation helper";
})();
