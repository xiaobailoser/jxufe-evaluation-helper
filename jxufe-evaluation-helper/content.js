(function () {
  "use strict";

  if (globalThis.__jxufeEvaluationHelperLoaded) return;
  globalThis.__jxufeEvaluationHelperLoaded = true;

  const shared = globalThis.JxufeEvaluationShared;
  const STATUS_LABELS = {
    pending: "待处理",
    filling: "填写中",
    filled: "已填充",
    saved: "已暂存",
    failed: "失败",
    complete: "已完成"
  };

  let stopped = false;
  let running = false;
  let state = {
    message: "准备就绪",
    courses: []
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function visible(element) {
    if (!element) return false;
    const view = element.ownerDocument?.defaultView;
    if (!view) return false;
    const style = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function textOf(element) {
    return (element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function allDocuments() {
    const documents = [];
    const visited = new Set();

    function visit(doc) {
      if (!doc || visited.has(doc)) return;
      visited.add(doc);
      documents.push(doc);
      for (const frame of doc.querySelectorAll("iframe, frame")) {
        try {
          visit(frame.contentDocument);
        } catch (_) {
          // Cross-origin frames are intentionally ignored.
        }
      }
    }

    visit(document);
    return documents;
  }

  function pageText() {
    return allDocuments().map((doc) => textOf(doc.body)).join("\n");
  }

  function assertSafePage() {
    const text = pageText();
    if (shared.isBlockingPage(text)) {
      throw new Error("检测到登录、验证码或系统错误页面，已停止");
    }
    if (!shared.isEvaluationPage(text)) {
      throw new Error("当前页面不是可识别的教学评价页面");
    }
  }

  function findButtonsByText(pattern, scope) {
    const root = scope || document;
    return Array.from(root.querySelectorAll("button, a, input[type='button'], input[type='submit']"))
      .filter(visible)
      .filter((element) => pattern.test(textOf(element) || element.value || ""));
  }

  function parseCourseRow(row, index) {
    const cells = Array.from(row.querySelectorAll("td"));
    const rowText = textOf(row);
    const action = Array.from(row.querySelectorAll("a, button")).find((element) => /评价/.test(textOf(element)));
    const scoreText = textOf(cells[cells.length - 2]);
    const alreadySaved = /删除暂存/.test(rowText) || /^\d+(?:\.\d+)?$/.test(scoreText);
    if (!action || !/评价/.test(rowText) || alreadySaved) return null;

    return {
      id: row.dataset.jxufeCourseId || `course-${index + 1}`,
      course: textOf(cells[1]) || rowText.slice(0, 80),
      teacher: textOf(cells[2]) || "教师未知",
      action,
      status: "pending",
      label: STATUS_LABELS.pending
    };
  }

  function scanCourses() {
    const found = [];
    let index = 0;
    for (const doc of allDocuments()) {
      for (const row of doc.querySelectorAll("tr")) {
        const course = parseCourseRow(row, index);
        if (course) {
          found.push(course);
          index += 1;
        }
      }
    }
    state.courses = found.map(({ action, ...course }) => course);
    state.message = found.length ? `发现 ${found.length} 门待评价课程` : "没有发现可评价课程";
    publish();
    return found;
  }

  function resolveCourseAction(course) {
    const row = findCourseRow(course);
    if (!row || isCourseRowSaved(row)) return null;
    return Array.from(row.querySelectorAll("a, button"))
      .find((element) => visible(element) && /评价/.test(textOf(element))) || null;
  }

  function findCourseRow(course) {
    let fallback = null;
    for (const doc of allDocuments()) {
      for (const row of doc.querySelectorAll("tr")) {
        const cells = Array.from(row.querySelectorAll("td"));
        const courseText = textOf(cells[1]);
        const teacherText = textOf(cells[2]);
        if (courseText === course.course && teacherText === course.teacher) return row;
        if (!fallback && courseText === course.course) fallback = row;
      }
    }
    return fallback;
  }

  function isCourseRowSaved(row) {
    if (!row) return false;
    const cells = Array.from(row.querySelectorAll("td"));
    const scoreText = textOf(cells[cells.length - 2]);
    return /删除暂存/.test(textOf(row)) || /^\d+(?:\.\d+)?$/.test(scoreText);
  }

  async function waitForCourseSaved(course, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      assertSafePage();
      const row = findCourseRow(course);
      if (isCourseRowSaved(row)) return true;
      await delay(250);
    }
    return false;
  }

  function publish() {
    try {
      chrome.runtime.sendMessage({ type: "JXUFE_STATE", payload: state });
    } catch (_) {
      // The popup may be closed; processing should continue.
    }
  }

  function updateCourse(index, status, error) {
    const course = state.courses[index];
    if (!course) return;
    course.status = status;
    course.label = error ? `${STATUS_LABELS[status]}：${error}` : STATUS_LABELS[status];
    state.message = error
      ? `${course.course} 处理失败`
      : `${course.course}：${STATUS_LABELS[status]}`;
    publish();
  }

  async function waitForEvaluationForm(timeout = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      assertSafePage();
      const form = findEvaluationForm();
      if (form) return form;
      await delay(180);
    }
    throw new Error("打开课程后未找到评价表");
  }

  function findEvaluationForm() {
    for (const doc of allDocuments()) {
      const radios = doc.querySelectorAll("input[type='radio']");
      const textareas = doc.querySelectorAll("textarea");
      if (radios.length >= 4 && textareas.length >= 1) {
        const dialog = Array.from(doc.querySelectorAll("[role='dialog'], .modal, .layui-layer, .panel, form"))
          .filter(visible)
          .find((element) => element.querySelectorAll("input[type='radio']").length >= 4);
        return dialog || radios[0].closest("form") || doc.body;
      }
    }
    return null;
  }

  function radioLabel(radio) {
    const escape = radio.ownerDocument.defaultView.CSS?.escape ||
      ((value) => String(value).replace(/["\\]/g, "\\$&"));
    const explicit = radio.id && radio.ownerDocument.querySelector(`label[for="${escape(radio.id)}"]`);
    if (explicit) return textOf(explicit);
    const wrapping = radio.closest("label");
    if (wrapping) return textOf(wrapping);
    return textOf(radio.parentElement);
  }

  function groupRadios(radios) {
    const groups = new Map();
    radios.forEach((radio, index) => {
      const key = radio.name || `unnamed-${Math.floor(index / 4)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(radio);
    });
    return Array.from(groups.values());
  }

  function fillRadios(form, rating) {
    const groups = groupRadios(Array.from(form.querySelectorAll("input[type='radio']")).filter(visible));
    if (!groups.length) throw new Error("没有找到评分选项");

    for (const group of groups) {
      const target = group.find((radio) => radioLabel(radio).includes(rating)) ||
        group.find((radio) => String(radio.value).includes(rating));
      if (!target) throw new Error(`某道题缺少“${rating}”选项`);
      target.click();
      const EventClass = target.ownerDocument.defaultView.Event;
      target.dispatchEvent(new EventClass("change", { bubbles: true }));
    }
    return groups.length;
  }

  function fillTextareas(form, recommendation, feedback) {
    const textareas = Array.from(form.querySelectorAll("textarea")).filter(visible);
    if (!textareas.length) throw new Error("没有找到文字评价输入框");
    const values = [recommendation, feedback];
    textareas.forEach((textarea, index) => {
      const value = values[Math.min(index, values.length - 1)];
      const textareaClass = textarea.ownerDocument.defaultView.HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(textareaClass.prototype, "value")?.set;
      if (setter) setter.call(textarea, value);
      else textarea.value = value;
      const EventClass = textarea.ownerDocument.defaultView.Event;
      textarea.dispatchEvent(new EventClass("input", { bubbles: true }));
      textarea.dispatchEvent(new EventClass("change", { bubbles: true }));
    });
    return textareas.length;
  }

  function validateForm(form) {
    const missingGroups = groupRadios(Array.from(form.querySelectorAll("input[type='radio']")).filter(visible))
      .filter((group) => !group.some((radio) => radio.checked));
    const emptyTextareas = Array.from(form.querySelectorAll("textarea")).filter(visible)
      .filter((textarea) => textarea.required && !textarea.value.trim());
    if (missingGroups.length || emptyTextareas.length) {
      throw new Error(`仍有 ${missingGroups.length} 道单选题和 ${emptyTextareas.length} 个必填文本框未完成`);
    }
  }

  function findSaveButton(form) {
    return findButtonsByText(/暂存|保存/, form)[0] || findButtonsByText(/暂存|保存/)[0];
  }

  function findCloseButton(form) {
    return findButtonsByText(/关闭|取消/, form)[0] || findButtonsByText(/关闭|取消/)[0];
  }

  async function waitForFormToClose(form, timeout = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (!form.ownerDocument.contains(form) || !visible(form)) return true;
      await delay(150);
    }
    return false;
  }

  async function fillCourse(course, index, settings) {
    updateCourse(index, "filling");
    const action = resolveCourseAction(course);
    if (!action) throw new Error("课程列表刷新后未能重新定位“评价”按钮");
    action.scrollIntoView({ block: "center" });
    action.click();

    const form = await waitForEvaluationForm();
    const recommendation = shared.chooseTemplate(settings.recommendationTemplates, index);
    const feedback = shared.chooseTemplate(settings.feedbackTemplates, index);
    fillRadios(form, settings.rating);
    fillTextareas(form, recommendation, feedback);
    validateForm(form);

    state.courses[index].rating = settings.rating;
    state.courses[index].recommendation = recommendation;
    state.courses[index].feedback = feedback;
    updateCourse(index, "filled");

    if (settings.autoSave) {
      const save = findSaveButton(form);
      if (!save) throw new Error("未找到“暂存”按钮");
      const saveWindow = save.ownerDocument.defaultView;
      saveWindow.dispatchEvent(new saveWindow.CustomEvent("jxufe-arm-temporary-save-confirm"));
      save.click();
      if (!await waitForFormToClose(form, 2000)) {
        const close = findCloseButton(form);
        if (!close) throw new Error("暂存后评价窗口未关闭，已停止以避免误操作");
        close.click();
        if (!await waitForFormToClose(form, 3000)) {
          throw new Error("暂存后无法关闭评价窗口，已停止");
        }
      }
      if (!await waitForCourseSaved(course)) {
        throw new Error("暂存后课程列表未显示分数，已停止以避免跳过课程");
      }
      updateCourse(index, "saved");
    } else {
      showSingleCourseNotice(index);
      stopped = true;
    }
  }

  function showSingleCourseNotice(index) {
    showPreview(
      "已填写一门课程",
      `<p>${escapeHtml(state.courses[index].course)} 已填写但尚未暂存。请先在页面核对并手动暂存；为避免覆盖当前表单，批量流程已暂停。</p>`
    );
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showPreview(title, intro) {
    document.querySelector("#jxufe-evaluation-preview")?.remove();
    const panel = document.createElement("aside");
    panel.id = "jxufe-evaluation-preview";
    const items = state.courses
      .filter((course) => ["filled", "saved", "complete"].includes(course.status))
      .map((course) => `<li><strong>${escapeHtml(course.course)}</strong> / ${escapeHtml(course.teacher)} / ${escapeHtml(course.rating || "")}<br>${escapeHtml(course.recommendation || "")}<br>${escapeHtml(course.feedback || "")}</li>`)
      .join("");
    panel.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      ${intro}
      <ol>${items}</ol>
      <p><strong>请逐门核对。</strong>点击下面按钮只会定位并高亮学校页面的最终“提交”，不会替你点击。</p>
      <button data-action="locate">我已核对，定位最终提交</button>
      <button data-action="close">关闭预览</button>
    `;
    panel.addEventListener("click", (event) => {
      const action = event.target.dataset.action;
      if (action === "close") panel.remove();
      if (action === "locate") {
        locateFinalSubmit();
        panel.remove();
      }
    });
    document.documentElement.append(panel);
  }

  function locateFinalSubmit() {
    const candidates = findButtonsByText(/^提交$/);
    const button = candidates.find((element) => !element.closest("#jxufe-evaluation-preview"));
    if (!button) {
      state.message = "未找到最终“提交”按钮，请在课程列表页手动检查";
      publish();
      return;
    }
    button.classList.add("jxufe-final-submit-highlight");
    button.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => button.classList.remove("jxufe-final-submit-highlight"), 6500);
  }

  async function start(settingsInput) {
    if (running) return state;
    stopped = false;
    running = true;
    const settings = shared.normalizeSettings(settingsInput);
    try {
      assertSafePage();
      const courses = scanCourses();
      if (!courses.length) throw new Error("没有发现可处理的未评价课程");

      for (let index = 0; index < courses.length; index += 1) {
        if (stopped) break;
        try {
          await fillCourse(courses[index], index, settings);
        } catch (error) {
          updateCourse(index, "failed", error.message);
          stopped = true;
        }
      }

      if (!stopped) {
        state.courses.forEach((course) => {
          if (course.status === "saved") {
            course.status = "complete";
            course.label = STATUS_LABELS.complete;
          }
        });
        state.message = "全部课程已处理，请核对预览后手动完成最终提交";
        publish();
        showPreview("评价填写预览", "<p>批量填写已结束，学校系统尚未最终提交。</p>");
      }
    } catch (error) {
      state.message = error.message;
      publish();
    } finally {
      running = false;
    }
    return state;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "JXUFE_SCAN") {
      try {
        assertSafePage();
        sendResponse((scanCourses(), state));
      } catch (error) {
        state.message = error.message;
        sendResponse(state);
      }
      return;
    }
    if (message.type === "JXUFE_STOP") {
      stopped = true;
      state.message = "已请求停止，将不会继续处理下一门课程";
      publish();
      sendResponse(state);
      return;
    }
    if (message.type === "JXUFE_START") {
      start(message.payload).then(sendResponse);
      return true;
    }
  });
})();
