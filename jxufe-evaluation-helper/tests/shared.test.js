"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const shared = require("../shared.js");

test("normalizes invalid settings to safe defaults", () => {
  const settings = shared.normalizeSettings({
    rating: "满分",
    recommendationTemplates: "\n",
    feedbackTemplates: [],
    autoSave: 1
  });

  assert.equal(settings.rating, "优秀");
  assert.equal(settings.autoSave, true);
  assert.ok(settings.recommendationTemplates.length >= 3);
  assert.ok(settings.feedbackTemplates.length >= 3);
});

test("cycles templates across ten courses", () => {
  const templates = ["一", "二", "三"];
  const selected = Array.from({ length: 10 }, (_, index) => shared.chooseTemplate(templates, index));
  assert.deepEqual(selected, ["一", "二", "三", "一", "二", "三", "一", "二", "三", "一"]);
});

test("recognizes evaluation and blocking pages", () => {
  assert.equal(shared.isEvaluationPage("教学评价 提交教学评价表 评价轮次"), true);
  assert.equal(shared.isEvaluationPage("学生选课页面"), false);
  assert.equal(shared.isBlockingPage("登录超时，请重新登录"), true);
  assert.equal(shared.isBlockingPage("提交教学评价表"), false);
});

test("manifest permissions stay limited to the evaluation host", () => {
  const manifestPath = path.join(__dirname, "..", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.0.2");
  assert.deepEqual(manifest.permissions, ["activeTab", "storage", "scripting"]);
  assert.deepEqual(manifest.host_permissions, ["https://jwxt.jxufe.edu.cn/*"]);
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  assert.equal(manifest.content_scripts[0].world, "MAIN");
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(manifest.content_scripts[0].all_frames, true);
});

test("auto-confirms only the temporary save warning", () => {
  const guardPath = path.join(__dirname, "..", "confirm-guard.js");
  const source = fs.readFileSync(guardPath, "utf8");
  const delegated = [];
  const listeners = new Map();
  const window = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
    },
    confirm(message) {
      delegated.push(message);
      return false;
    }
  };
  window.window = window;

  vm.runInNewContext(source, { window });

  assert.equal(window.confirm("系统将保存数据但不会完成评价,是否继续?"), false);
  window.dispatchEvent({ type: "jxufe-arm-temporary-save-confirm" });
  assert.equal(window.confirm("系统将保存数据但不会完成评价,是否继续?"), true);
  assert.equal(window.confirm("系统将保存数据但不会完成评价,是否继续?"), false);
  window.dispatchEvent({ type: "jxufe-arm-temporary-save-confirm" });
  assert.equal(window.confirm("系统将保存数据，但不会完成评价，是否继续？"), true);
  assert.equal(window.confirm("确认删除暂存数据？"), false);
  assert.equal(window.confirm("是否最终提交全部评价？"), false);
  assert.deepEqual(delegated, [
    "系统将保存数据但不会完成评价,是否继续?",
    "系统将保存数据但不会完成评价,是否继续?",
    "确认删除暂存数据？",
    "是否最终提交全部评价？"
  ]);
});
