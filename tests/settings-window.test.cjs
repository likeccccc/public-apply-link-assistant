const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const extension = path.join(__dirname, "../extension");
const background = fs.readFileSync(path.join(extension, "background.js"), "utf8");
const search = fs.readFileSync(path.join(extension, "search.js"), "utf8");

test("native popup remains configured and pin action opens one persistent window", async () => {
  let onMessage;
  let removed;
  let nextId = 10;
  const open = new Map();
  const session = {};
  const chrome = {
    runtime: { getURL: (name) => `chrome-extension://test/${name}`, onMessage: { addListener(callback) { onMessage = callback; } } },
    storage: { session: {
      async get(defaults) { return { ...defaults, ...session }; },
      async set(values) { Object.assign(session, values); },
      async remove(key) { delete session[key]; },
    } },
    windows: {
      onRemoved: { addListener(callback) { removed = callback; } },
      async create(options) {
        const window = { id: nextId++, type: options.type, tabs: [{ url: options.url }] };
        open.set(window.id, window);
        return window;
      },
      async get(id) {
        if (!open.has(id)) throw new Error("No window");
        return open.get(id);
      },
      async update(id) { if (!open.has(id)) throw new Error("No window"); },
    },
  };
  const context = vm.createContext({ chrome, URL, importScripts: () => vm.runInContext(search, context) });
  vm.runInContext(background, context);
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
  assert.equal(manifest.action.default_popup, "popup.html");
  const pin = () => new Promise((resolve) => {
    const accepted = onMessage({ type: "open-pinned-settings" }, {}, resolve);
    assert.equal(accepted, true);
  });

  assert.equal((await pin()).ok, true);
  assert.equal(open.size, 1);
  assert.equal(session.settingsWindowId, 10);
  assert.equal(open.get(10).tabs[0].url, "chrome-extension://test/popup.html?pinned=1");
  // Opening again focuses the same window; clicking elsewhere is not a close event.
  assert.equal((await pin()).ok, true);
  assert.equal(open.size, 1);

  const id = session.settingsWindowId;
  open.delete(id);
  await removed(id);
  assert.equal(session.settingsWindowId, undefined);
  assert.equal((await pin()).ok, true);
  assert.equal(open.size, 1);
  assert.equal(session.settingsWindowId, 11);
});
