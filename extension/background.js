importScripts("search.js");

const DEFAULT_BASE = "https://maas.qianwenaiapi.com/compatible-mode/v1";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DAY = 24 * 60 * 60 * 1000;

chrome.action.onClicked.addListener(async () => {
  const { settingsWindowId } = await chrome.storage.session.get({ settingsWindowId: null });
  if (Number.isInteger(settingsWindowId)) {
    try {
      const existing = await chrome.windows.get(settingsWindowId, { populate: true });
      if (existing.type === "popup" && existing.tabs?.some((tab) => tab.url === chrome.runtime.getURL("popup.html"))) {
        await chrome.windows.remove(settingsWindowId);
        await chrome.storage.session.remove("settingsWindowId");
        return;
      }
    } catch {
      // The user may have closed the window with its title-bar button.
    }
    await chrome.storage.session.remove("settingsWindowId");
  }
  const settingsWindow = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 420,
    height: 720,
    focused: true,
  });
  if (Number.isInteger(settingsWindow?.id)) await chrome.storage.session.set({ settingsWindowId: settingsWindow.id });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { settingsWindowId } = await chrome.storage.session.get({ settingsWindowId: null });
  if (windowId === settingsWindowId) await chrome.storage.session.remove("settingsWindowId");
});

async function publicSettings() {
  const saved = await chrome.storage.local.get({ searchScope: "visible", linkPlacement: "company", linkBrowser: "chrome", widgetPosition: null });
  return {
    scope: saved.searchScope === "all" ? "all" : "visible",
    placement: saved.linkPlacement === "links" ? "links" : "company",
    browser: saved.linkBrowser === "edge" ? "edge" : "chrome",
    position: saved.widgetPosition,
  };
}

async function searchOne(company) {
  const saved = await chrome.storage.local.get({ providerBase: DEFAULT_BASE, modelName: DEFAULT_MODEL, apiKey: "", draftKey: "", resultCache: {} });
  let key = String(saved.apiKey || saved.draftKey || "").trim();
  if (!key) {
    const session = await chrome.storage.session.get({ apiKey: "" });
    key = String(session.apiKey || "").trim();
    if (key) await chrome.storage.local.set({ apiKey: key });
  }
  const base = String(saved.providerBase || DEFAULT_BASE).trim().replace(/\/+$/, "");
  const model = String(saved.modelName || DEFAULT_MODEL).trim();
  if (key.length < 12 || !model || !isHttpUrl(base)) throw new Error("API 配置不完整。请点浏览器工具栏扩展图标，在设置页填写 API 地址、模型和 Key。");
  const name = String(company?.name || "").trim().slice(0, 80);
  const jobs = String(company?.jobs || "").trim().slice(0, 160);
  if (name.length < 2) throw new Error("未识别到有效的企业名称。");
  const cacheKey = `${base}|${model}|${normalizeName(name)}`;
  const cache = saved.resultCache || {};
  const entry = cache[cacheKey];
  if (entry?.result && Date.now() - entry.savedAt < DAY) return { result: entry.result, usage: { inputTokens: 0, outputTokens: 0 }, cached: true };
  const response = await searchPublicLinks({ base, model, key }, [{ name, jobs }]);
  const result = response.results[0] || { company: name, apply_url: "" };
  cache[cacheKey] = { savedAt: Date.now(), result };
  const compact = Object.fromEntries(Object.entries(cache).filter(([, value]) => Date.now() - value.savedAt < DAY).slice(-500));
  await chrome.storage.local.set({ resultCache: compact });
  return { result, usage: response.usage, cached: false };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!["get-public-settings", "search-one", "save-position"].includes(message?.type)) return false;
  (async () => {
    if (message.type === "get-public-settings") return await publicSettings();
    if (message.type === "search-one") return await searchOne(message.company);
    const x = Number(message.position?.x);
    const y = Number(message.position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("悬浮按钮位置无效。");
    await chrome.storage.local.set({ widgetPosition: { x, y } });
    return { saved: true };
  })().then((data) => sendResponse({ ok: true, data }), (error) => sendResponse({ ok: false, error: String(error?.message || error).slice(0, 350) }));
  return true;
});
