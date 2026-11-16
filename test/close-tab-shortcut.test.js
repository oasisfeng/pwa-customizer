import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../closeTabShortcut.js", import.meta.url), "utf8");

function loadShortcut({
  tabbed = true,
  platform = "macOS",
  readyState = "loading",
  runtimeAvailable = true,
} = {}) {
  const listeners = { load: [], keydown: [] };
  const timers = new Map();
  const messages = [];
  let nextTimer = 1;

  const document = { readyState };
  const window = {
    addEventListener(type, listener, options) {
      listeners[type].push({ listener, options });
    },
    removeEventListener(type, listener) {
      listeners[type] = listeners[type].filter((entry) => entry.listener !== listener);
    },
  };

  const context = vm.createContext({
    document,
    window,
    setTimeout(callback, delay) {
      assert.equal(delay, 0);
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    matchMedia(query) {
      assert.equal(query, "(display-mode: tabbed)");
      return { matches: tabbed };
    },
    navigator: {
      userAgentData: { platform },
      platform: platform === "macOS" ? "MacIntel" : platform,
    },
    chrome: runtimeAvailable
      ? {
          runtime: {
            sendMessage(message) {
              messages.push(message);
              return Promise.resolve({ ok: true });
            },
          },
        }
      : {},
    console,
  });

  const run = () => vm.runInContext(source, context);
  const runTimers = () => {
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
  };
  run();

  return {
    messages,
    get keydownListenerCount() {
      return listeners.keydown.length;
    },
    activate() {
      const loadListeners = [...listeners.load];
      listeners.load = listeners.load.filter((entry) => entry.options?.once !== true);
      for (const { listener } of loadListeners) listener();
      document.readyState = "complete";
      runTimers();
    },
    reinject() {
      run();
      runTimers();
    },
    keydown(event) {
      for (const { listener } of [...listeners.keydown]) listener(event);
    },
  };
}

function keyboardEvent(overrides = {}) {
  const calls = [];
  return {
    key: "w",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
      calls.push("preventDefault");
    },
    calls,
    ...overrides,
  };
}

test("the tab shortcut handler registers late in the window bubble phase", () => {
  const shortcut = loadShortcut();
  assert.equal(shortcut.keydownListenerCount, 0);

  shortcut.activate();

  assert.equal(shortcut.keydownListenerCount, 1);
});

test("reinjection replaces the existing listener instead of stacking another", () => {
  const shortcut = loadShortcut();
  shortcut.activate();
  assert.equal(shortcut.keydownListenerCount, 1);

  shortcut.reinject();

  assert.equal(shortcut.keydownListenerCount, 1);
  const event = keyboardEvent({ metaKey: true });
  shortcut.keydown(event);
  assert.deepEqual(event.calls, ["preventDefault"]);
  assert.equal(shortcut.messages.length, 1);
});

test("Command+T opens a new tab in tabbed PWAs on macOS", () => {
  const shortcut = loadShortcut();
  shortcut.activate();
  const event = keyboardEvent({ key: "t", metaKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, ["preventDefault"]);
  assert.equal(shortcut.messages.length, 1);
  assert.equal(shortcut.messages[0].type, "openNewTab");
});

test("a PWA that already prevented Command+T keeps control of the shortcut", () => {
  const shortcut = loadShortcut();
  shortcut.activate();
  const event = keyboardEvent({ key: "t", metaKey: true, defaultPrevented: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, []);
  assert.deepEqual(shortcut.messages, []);
});

test("Command+Shift+T remains untouched", () => {
  const shortcut = loadShortcut();
  shortcut.activate();
  const event = keyboardEvent({ key: "t", metaKey: true, shiftKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, []);
  assert.deepEqual(shortcut.messages, []);
});

test("Command+W closes the sender tab in tabbed PWAs on macOS", () => {
  const shortcut = loadShortcut();
  shortcut.activate();
  const event = keyboardEvent({ metaKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, ["preventDefault"]);
  assert.equal(shortcut.messages.length, 1);
  assert.equal(shortcut.messages[0].type, "closeCurrentTab");
});

test("an invalidated extension context does not swallow Command+W", () => {
  const shortcut = loadShortcut({ runtimeAvailable: false });
  shortcut.activate();
  const event = keyboardEvent({ metaKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, []);
  assert.deepEqual(shortcut.messages, []);
});

test("a PWA that already prevented Command+W keeps control of the shortcut", () => {
  const shortcut = loadShortcut();
  shortcut.activate();
  const event = keyboardEvent({ metaKey: true, defaultPrevented: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, []);
  assert.deepEqual(shortcut.messages, []);
});

test("Command+Shift+W remains available for closing the whole PWA window", () => {
  const shortcut = loadShortcut();
  shortcut.activate();
  const event = keyboardEvent({ metaKey: true, shiftKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, []);
  assert.deepEqual(shortcut.messages, []);
});

test("the shortcut is untouched outside tabbed display mode", () => {
  const shortcut = loadShortcut({ tabbed: false });
  shortcut.activate();
  const event = keyboardEvent({ metaKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, []);
  assert.deepEqual(shortcut.messages, []);
});

test("Ctrl+T opens a new tab off macOS", () => {
  const shortcut = loadShortcut({ platform: "Windows" });
  shortcut.activate();
  const event = keyboardEvent({ key: "t", ctrlKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, ["preventDefault"]);
  assert.equal(shortcut.messages.length, 1);
  assert.equal(shortcut.messages[0].type, "openNewTab");
});

test("Ctrl+W is used as the close-tab shortcut off macOS", () => {
  const shortcut = loadShortcut({ platform: "Windows" });
  shortcut.activate();
  const event = keyboardEvent({ ctrlKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, ["preventDefault"]);
  assert.equal(shortcut.messages.length, 1);
  assert.equal(shortcut.messages[0].type, "closeCurrentTab");
});
