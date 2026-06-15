(function (root) {
  "use strict";

  const DEFAULT_SETTINGS = {
    rating: "优秀",
    autoSave: false,
    recommendationTemplates: [
      "这门课程内容充实，教师讲解清晰，课堂安排合理，我愿意向其他同学推荐。建议今后继续增加与实际应用相关的案例。",
      "课程目标明确，教学过程认真负责，对理解相关知识很有帮助，我愿意推荐这门课程。建议适当增加课堂互动。",
      "课程组织有序，重点突出，教师能够耐心解答问题，我愿意向同学推荐。建议继续丰富课后学习资料。"
    ],
    feedbackTemplates: [
      "教师教学态度认真，讲解条理清楚，能够结合课程内容帮助学生理解重点。建议今后适当增加案例分析和实践环节。",
      "整体学习体验良好，课堂内容安排合理，教师能够及时回应学生的问题。建议继续丰富互动形式，增强课堂参与感。",
      "课程内容具有启发性，教师备课充分，教学要求明确。建议适当补充拓展资料，帮助学生进一步巩固所学内容。"
    ]
  };

  function normalizeLines(value, fallback) {
    const lines = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
    const cleaned = lines.map((line) => String(line).trim()).filter(Boolean);
    return cleaned.length ? cleaned : fallback.slice();
  }

  function normalizeSettings(input) {
    const settings = input || {};
    return {
      rating: ["优秀", "良好", "一般", "差"].includes(settings.rating)
        ? settings.rating
        : DEFAULT_SETTINGS.rating,
      autoSave: Boolean(settings.autoSave),
      recommendationTemplates: normalizeLines(
        settings.recommendationTemplates,
        DEFAULT_SETTINGS.recommendationTemplates
      ),
      feedbackTemplates: normalizeLines(
        settings.feedbackTemplates,
        DEFAULT_SETTINGS.feedbackTemplates
      )
    };
  }

  function chooseTemplate(templates, index) {
    if (!templates.length) return "";
    return templates[index % templates.length];
  }

  function isEvaluationPage(text) {
    const value = String(text || "");
    return value.includes("教学评价") && (
      value.includes("提交教学评价表") ||
      value.includes("评价轮次") ||
      value.includes("指标式评价")
    );
  }

  function isBlockingPage(text) {
    const value = String(text || "").toLowerCase();
    return [
      "验证码",
      "重新登录",
      "登录超时",
      "会话超时",
      "系统异常",
      "服务器错误",
      "service unavailable"
    ].some((keyword) => value.includes(keyword.toLowerCase()));
  }

  const api = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    chooseTemplate,
    isEvaluationPage,
    isBlockingPage
  };

  root.JxufeEvaluationShared = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
