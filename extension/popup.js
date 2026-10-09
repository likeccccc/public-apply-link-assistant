const $ = (id) => document.getElementById(id);
const fields = { base: "providerBase", model: "modelName", key: "apiKey", scope: "searchScope", placement: "linkPlacement", browser: "linkBrowser" };
const defaults = { providerBase: "https://maas.qianwenaiapi.com/compatible-mode/v1", modelName: "deepseek-v4-flash", apiKey: "", searchScope: "visible", linkPlacement: "company", linkBrowser: "chrome" };
const pending = new Set();

function status(message, error = false) {
  $("saveStatus").textContent = message;
  $("saveStatus").className = `status ${error ? "error" : "success"}`;
}

function save(values) {
  const operation = chrome.storage.local.set(values);
  pending.add(operation);
  operation.then(() => {
    if (Object.hasOwn(values, "apiKey")) status(`API Key 已保存（${String(values.apiKey).length} 字符）；其他输入也会自动保存。`);
    else status("设置已保存。");
  }, (error) => status(`保存失败：${error.message}`, true)).finally(() => pending.delete(operation));
  return operation;
}

async function initialize() {
  try {
    const raw = await chrome.storage.local.get(["providerBase", "modelName", "apiKey", "searchScope", "linkPlacement", "linkBrowser", "draftBase", "draftModel", "draftKey"]);
    const saved = { ...defaults, ...raw };
    if (raw.providerBase === undefined && raw.draftBase !== undefined) saved.providerBase = raw.draftBase;
    if (raw.modelName === undefined && raw.draftModel !== undefined) saved.modelName = raw.draftModel;
    if (!raw.apiKey && raw.draftKey) saved.apiKey = raw.draftKey;
    if (!saved.apiKey) {
      const session = await chrome.storage.session.get({ apiKey: "" });
      saved.apiKey = session.apiKey || "";
    }
    for (const [id, key] of Object.entries(fields)) $(id).value = saved[key] ?? defaults[key];
    if (saved.apiKey && !raw.apiKey) await chrome.storage.local.set({ apiKey: saved.apiKey });
    status(saved.apiKey ? `已读取 API Key（${saved.apiKey.length} 字符）和搜索选项。` : "尚未填写 API Key。", !saved.apiKey);
  } catch (error) { status(`读取设置失败：${error.message}`, true); }

  for (const [id, key] of Object.entries(fields)) {
    const eventType = id === "scope" || id === "placement" || id === "browser" ? "change" : "input";
    $(id).addEventListener(eventType, () => { save({ [key]: $(id).value }); });
    if (eventType === "input") $(id).addEventListener("change", () => { save({ [key]: $(id).value }); });
  }
  $("toggle").addEventListener("click", () => {
    $("key").type = $("key").type === "password" ? "text" : "password";
    $("toggle").textContent = $("key").type === "password" ? "显示" : "隐藏";
  });
  $("saveAll").addEventListener("click", async () => {
    try {
      await Promise.allSettled([...pending]);
      const values = Object.fromEntries(Object.entries(fields).map(([id, key]) => [key, $(id).value]));
      await save(values);
      status("全部设置已保存。回到招聘页点击绿色浮卡即可搜索。");
    } catch (error) { status(`保存失败：${error.message}`, true); }
  });
  $("authorize").addEventListener("click", async () => {
    try {
      const url = new URL($("base").value.trim());
      if (url.protocol !== "https:") throw new Error("API 地址必须使用 HTTPS。");
      const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
      status(granted ? "API 域名已授权。" : "没有获得 API 域名权限。", !granted);
    } catch (error) { status(`授权失败：${error.message}`, true); }
  });
  $("testModel").addEventListener("click", async () => {
    const button = $("testModel");
    const result = $("testStatus");
    button.disabled = true;
    result.textContent = "正在用真实投递入口搜索流程测试（不走缓存）……";
    result.className = "status";
    try {
      const reply = await chrome.runtime.sendMessage({ type: "test-model", config: {
        base: $("base").value, model: $("model").value, key: $("key").value,
      } });
      if (!reply?.ok) throw new Error(reply?.error || "扩展后台没有返回测试结果。");
      const data = reply.data;
      result.textContent = `${data.message} 本次消耗：输入 ${data.inputTokens}、输出 ${data.outputTokens} Token。`;
      result.className = `status ${data.supported ? "success" : "error"}`;
    } catch (error) {
      result.textContent = `真实搜索测试失败：${error.message}`;
      result.className = "status error";
    } finally { button.disabled = false; }
  });
}

initialize();
