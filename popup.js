"use strict";

const shared = globalThis.JxufeEvaluationShared;
const fields = {
  rating: document.querySelector("#rating"),
  autoSave: document.querySelector("#autoSave"),
  recommendationTemplates: document.querySelector("#recommendationTemplates"),
  feedbackTemplates: document.querySelector("#feedbackTemplates")
};
const summary = document.querySelector("#summary");
const courses = document.querySelector("#courses");

function getSettingsFromForm() {
  return shared.normalizeSettings({
    rating: fields.rating.value,
    autoSave: fields.autoSave.checked,
    recommendationTemplates: fields.recommendationTemplates.value,
    feedbackTemplates: fields.feedbackTemplates.value
  });
}

function applySettings(settings) {
  fields.rating.value = settings.rating;
  fields.autoSave.checked = settings.autoSave;
  fields.recommendationTemplates.value = settings.recommendationTemplates.join("\n");
  fields.feedbackTemplates.value = settings.feedbackTemplates.join("\n");
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("没有找到当前标签页");
  if (!/^https:\/\/jwxt\.jxufe\.edu\.cn\//.test(tab.url || "")) {
    throw new Error("请先打开江西财经大学教学评价页面");
  }
  return tab;
}

async function send(type, payload) {
  const tab = await activeTab();
  try {
    return await chrome.tabs.sendMessage(tab.id, { type, payload });
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["shared.js", "content.js"]
    });
    return chrome.tabs.sendMessage(tab.id, { type, payload });
  }
}

function renderState(state) {
  if (!state) return;
  summary.textContent = state.message || "准备就绪";
  courses.replaceChildren();
  for (const item of state.courses || []) {
    const li = document.createElement("li");
    li.className = `status-${item.status || "pending"}`;
    li.textContent = `${item.course || "未命名课程"} / ${item.teacher || "教师未知"}：${item.label || item.status}`;
    courses.append(li);
  }
}

async function run(action) {
  try {
    summary.textContent = "正在处理…";
    if (action === "START") {
      const settings = getSettingsFromForm();
      await chrome.storage.local.set({ settings });
      renderState(await send("JXUFE_START", settings));
    } else {
      renderState(await send(`JXUFE_${action}`));
    }
  } catch (error) {
    summary.textContent = error.message;
  }
}

document.querySelector("#scan").addEventListener("click", () => run("SCAN"));
document.querySelector("#start").addEventListener("click", () => run("START"));
document.querySelector("#stop").addEventListener("click", () => run("STOP"));

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "JXUFE_STATE") renderState(message.payload);
});

chrome.storage.local.get("settings").then(({ settings }) => {
  applySettings(shared.normalizeSettings(settings));
  run("SCAN");
});
