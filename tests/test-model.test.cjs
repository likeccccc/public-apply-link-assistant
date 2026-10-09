const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8");
const config = { base: "https://maas.qianwenaiapi.com/compatible-mode/v1", model: "deepseek-v3.2-exp", key: "test-secret-key-123" };

function contextFor(fetch) {
  const context = vm.createContext({
    fetch, URL,
    chrome: { runtime: { onMessage: { addListener() {} } } },
  });
  vm.runInContext(source, context);
  return context;
}

test("model test reports provider's unsupported web_search error without exposing the key", async () => {
  const context = contextFor(async (url, options) => {
    assert.equal(url, `${config.base}/responses`);
    const body = JSON.parse(options.body);
    assert.equal(body.model, config.model);
    assert.deepEqual(body.tools, [{ type: "web_search" }]);
    assert.equal(JSON.parse(body.input).companies[0].name, "腾讯");
    return { ok: false, status: 400, json: async () => ({ error: { message: `The current model does not support the web_search tool. ${config.key}` } }) };
  });
  await assert.rejects(vm.runInContext(`testModel(${JSON.stringify(config)})`, context), (error) => {
    assert.match(error.message, /400.*does not support the web_search tool/);
    assert.doesNotMatch(error.message, /test-secret-key-123/);
    return true;
  });
});

test("model test passes the same search and JSON validation as a real lookup", async () => {
  const context = contextFor(async () => ({ ok: true, json: async () => ({ output: [
    { type: "web_search_call" },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({ results: [{ company: "腾讯", apply_url: "https://careers.tencent.com/", source_url: "https://careers.tencent.com/", title: "腾讯招聘", confidence: "high", note: "" }] }) }] },
  ], usage: { input_tokens: 12, output_tokens: 3 } }) }));
  const result = await vm.runInContext(`testModel(${JSON.stringify(config)})`, context);
  assert.equal(result.supported, true);
  assert.match(result.message, /真实投递入口搜索流程/);
  assert.equal(result.inputTokens, 12);
  assert.equal(result.outputTokens, 3);
});

test("a successful response without search is rejected like a real lookup", async () => {
  const context = contextFor(async () => ({ ok: true, json: async () => ({ output: [{ type: "message" }] }) }));
  await assert.rejects(vm.runInContext(`testModel(${JSON.stringify(config)})`, context), /没有执行联网搜索/);
});
