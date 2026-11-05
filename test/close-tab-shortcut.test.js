import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../closeTabShortcut.js", import.meta.url), "utf8");

function loadShortcut({ tabbed = true, platform = "macOS", readyState = "loading" } = {}) {
  let keydown;
  let load;
  let timer;
  const messages = [];
  vm.runInNewContext(source, {
    document: { readyState },
    window: {
      addEventListener(type, listener, options) {
        if (type === "load") {
          assert.equal(options?.once, true);
          load = listener;
          return;
        }
        assert.equal(type, "keydown");
        assert.equal(options, undefined);
        keydown = listener;
      },
    },
    setTimeout(callback, delay) {
      assert.equal(delay, 0);
      timer = callback;
      return 1;
    },
    matchMedia(query) {
      assert.equal(query, "(display-mode: tabbed)");
      return { matches: tabbed };
    },
    navigator: {
      userAgentData: { platform },
      platform: platform === "macOS" ? "MacIntel" : platform,
    },
    chrome: {
      runtime: {
        sendMessage(message) {
          messages.push(message);
          return Promise.resolve({ ok: true });
        },
      },
    },
    console,
  });

  return {
    get keydown() {
      return keydown;
    },
    messages,
    activate() {
      if (load) load();
      assert.equal(typeof timer, "function");
      const callback = timer;
      timer = undefined;
      callback();
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
    stopImmediatePropagation: () => calls.push("stopImmediatePropagation"),
    calls,
    ...overrides,
  };
}

test("the close-tab handler registers late in the window bubble phase", () => {
  const shortcut = loadShortcut();
  assert.equal(shortcut.keydown, undefined);

  shortcut.activate();

  assert.equal(typeof shortcut.keydown, "function");
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

test("Ctrl+W is used as the close-tab shortcut off macOS", () => {
  const shortcut = loadShortcut({ platform: "Windows" });
  shortcut.activate();
  const event = keyboardEvent({ ctrlKey: true });

  shortcut.keydown(event);

  assert.deepEqual(event.calls, ["preventDefault"]);
  assert.equal(shortcut.messages.length, 1);
  assert.equal(shortcut.messages[0].type, "closeCurrentTab");
});
