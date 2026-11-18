(() => {
  const stateKey = "__betterPwasTabShortcuts";

  // If this script is reinjected into the same live extension world, replace our
  // previous listeners instead of stacking another set.
  const previous = globalThis[stateKey];
  if (previous?.loadListener) window.removeEventListener("load", previous.loadListener);
  if (previous?.timer != null) clearTimeout(previous.timer);
  if (previous?.earlyListener) window.removeEventListener("keydown", previous.earlyListener);
  if (previous?.lateListener) window.removeEventListener("keydown", previous.lateListener);

  const state = {};
  globalThis[stateKey] = state;

  const registerLateListener = () => {
    state.lateListener = handleTabbedPwaShortcut;
    window.addEventListener("keydown", state.lateListener);
  };

  if (document.readyState === "complete") {
    // Existing app listeners are already registered, so app-first ordering is
    // preserved without introducing a post-injection shortcut gap.
    registerLateListener();
  } else {
    // A newly-created PWA tab can receive Command/Ctrl+W before load. Protect
    // that startup interval immediately; otherwise Chromium falls back to its
    // native Close Window command and closes the whole PWA.
    state.earlyListener = handleTabbedPwaShortcut;
    window.addEventListener("keydown", state.earlyListener);

    state.loadListener = () => {
      state.loadListener = null;
      state.timer = setTimeout(() => {
        state.timer = null;

        // Add the steady-state listener only after normal load handlers have had
        // a chance to register their own window-level shortcuts. Remove and add
        // within one task, so no keyboard event can land in between.
        window.removeEventListener("keydown", state.earlyListener);
        state.earlyListener = null;
        registerLateListener();
      }, 0);
    };
    window.addEventListener("load", state.loadListener, { once: true });
  }

  function handleTabbedPwaShortcut(event) {
    if (!matchMedia("(display-mode: tabbed)").matches) return;

    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    const mac = platform === "macOS" || platform.startsWith("Mac");
    const primaryModifier = mac ? event.metaKey : event.ctrlKey;
    const otherPrimaryModifier = mac ? event.ctrlKey : event.metaKey;
    const key = event.key.toLowerCase();
    if (!primaryModifier || otherPrimaryModifier || event.altKey || !["t", "w"].includes(key)) {
      return;
    }

    let type;
    let action;
    if (key === "t" && event.shiftKey) {
      type = "reopenClosedTab";
      action = "reopen the last closed";
    } else if (key === "t" && !event.shiftKey) {
      type = "openNewTab";
      action = "open a new";
    } else if (key === "w" && !event.shiftKey) {
      type = "closeCurrentTab";
      action = "close the current";
    } else {
      return;
    }

    // Respect a shortcut handler that ran earlier in the PWA.
    if (event.defaultPrevented) return;

    // After an extension reload, an old content-script listener can briefly
    // survive with an invalidated extension context. Do not swallow the native
    // shortcut unless there is a live runtime capable of completing the action.
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.sendMessage) return;

    event.preventDefault();
    runtime
      .sendMessage({ type })
      .then((response) => {
        if (response?.ok === false) {
          console.error(`Better PWAs could not ${action} tab:`, response.error);
        }
      })
      .catch((error) => {
        console.error(`Better PWAs could not ${action} tab:`, error);
      });
  }
})();
