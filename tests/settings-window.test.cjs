const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const extension = path.join(__dirname, "../extension");
const background = fs.readFileSync(path.join(extension, "background.js"), "utf8");
const search = fs.readFileSync(path.join(extension, "search.js"), "utf8");

test("toolbar click toggles one persistent settings window", async () => {
  let clicked;
  let removed;
  let nextId = 10;
  const open = new Map();
  const session = {};
  const chrome = {
    runtime: { getURL: (name) => `chrome-extension://test/${name}`, onMessage: { addListener() {} } },
    action: { onClicked: { addListener(callback) { clicked = callback; } } },
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
      async remove(id) { open.delete(id); },
    },
  };
  const context = vm.createContext({ chrome, URL, importScripts: () => vm.runInContext(search, context) });
  vm.runInContext(background, context);

  await clicked();
  assert.equal(open.size, 1);
  assert.equal(session.settingsWindowId, 10);
  // Merely changing focus is not a close event.
  assert.equal(open.size, 1);
  await clicked();
  assert.equal(open.size, 0);
  assert.equal(session.settingsWindowId, undefined);

  await clicked();
  assert.equal(open.size, 1);
  const id = session.settingsWindowId;
  open.delete(id);
  await removed(id);
  assert.equal(session.settingsWindowId, undefined);
});
