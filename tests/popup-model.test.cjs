const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const extension = path.join(__dirname, "../extension");
const searchSource = fs.readFileSync(path.join(extension, "search.js"), "utf8");
const popupSource = fs.readFileSync(path.join(extension, "popup.js"), "utf8");

test("popup model test calls the shared search code without messaging the background", async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", type: "password", textContent: "", className: "", disabled: false, listeners: {},
      addEventListener(event, callback) { this.listeners[event] = callback; },
    });
    return elements.get(id);
  };
  const saved = { providerBase: "https://maas.qianwenaiapi.com/compatible-mode/v1", modelName: "deepseek-v4-pro", apiKey: "test-secret-key-123" };
  let fetchCount = 0;
  const context = vm.createContext({
    URL, document: { getElementById: element },
    chrome: {
      storage: { local: { get: async () => saved, set: async (values) => Object.assign(saved, values) }, session: { get: async () => ({ apiKey: "" }) } },
      permissions: { contains: async () => true, request: async () => true },
      runtime: { sendMessage: () => { throw new Error("background unavailable"); } },
    },
    fetch: async () => {
      fetchCount += 1;
      return { ok: true, json: async () => ({ output: [
        { type: "web_search_call" },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify({ results: [{ company: "腾讯", apply_url: "", source_url: "", title: "", confidence: "low", note: "" }] }) }] },
      ], usage: { input_tokens: 20, output_tokens: 5 } }) };
    },
  });
  vm.runInContext(searchSource, context);
  vm.runInContext(popupSource, context);
  await new Promise((resolve) => setImmediate(resolve));
  await element("testModel").listeners.click();
  assert.equal(fetchCount, 1);
  assert.match(element("testStatus").textContent, /已完成一次真实投递入口搜索流程/);
  assert.match(element("testStatus").className, /success/);
});
