import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../closeTabShortcut.js", import.meta.url), "utf8");

function loadShortcut({ tabbed = true, platform = "macOS" } = {}) {
  let keydown;
  const messages = [];
  vm.runInNewContext(source, {
    window: {
      addEventListener(type, listener, capture) {
        assert.equal(type, "keydown");
        assert.equal(capture, true);
        keydown = listener;
      },
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
  return { keydown, messages };
}

function keyboardEvent(overrides = {}) {
  const calls = [];
  return {
    key: "w",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: () => calls.push("preventDefault"),
    stopImmediatePropagation: () => calls.push("stopImmediatePropagation"),
    calls,
    ...overrides,
  };
}

test("Command+W closes the sender tab in tabbed PWAs on macOS", () => {
  const { keydown, messages } = loadShortcut();
  const event = keyboardEvent({ metaKey: true });

  keydown(event);

  assert.deepEqual(event.calls, ["preventDefault", "stopImmediatePropagation"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "closeCurrentTab");
});

test("Command+Shift+W remains available for closing the whole PWA window", () => {
  const { keydown, messages } = loadShortcut();
  const event = keyboardEvent({ metaKey: true, shiftKey: true });

  keydown(event);

  assert.deepEqual(event.calls, []);
  assert.deepEqual(messages, []);
});

test("the shortcut is untouched outside tabbed display mode", () => {
  const { keydown, messages } = loadShortcut({ tabbed: false });
  const event = keyboardEvent({ metaKey: true });

  keydown(event);

  assert.deepEqual(event.calls, []);
  assert.deepEqual(messages, []);
});

test("Ctrl+W is used as the close-tab shortcut off macOS", () => {
  const { keydown, messages } = loadShortcut({ platform: "Windows" });
  const event = keyboardEvent({ ctrlKey: true });

  keydown(event);

  assert.deepEqual(event.calls, ["preventDefault", "stopImmediatePropagation"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "closeCurrentTab");
});
