(() => {
  const stateKey = "__betterPwasCloseTabShortcut";

  // Programmatic reinjection keeps already-open PWA tabs protected after an
  // extension reload/update. Replace our previous listener instead of stacking
  // another one in the same isolated world.
  const previous = globalThis[stateKey];
  if (previous?.loadListener) window.removeEventListener("load", previous.loadListener);
  if (previous?.timer != null) clearTimeout(previous.timer);
  if (previous?.listener) window.removeEventListener("keydown", previous.listener);

  const state = {};
  globalThis[stateKey] = state;

  const scheduleRegistration = () => {
    state.timer = setTimeout(() => {
      state.timer = null;
      state.listener = handleCloseTabShortcut;
      window.addEventListener("keydown", state.listener);
    }, 0);
  };

  // Chromium maps the close-tab shortcut to Close Window in tabbed PWA app windows.
  // Register late in the bubble phase so the PWA gets first chance to claim the shortcut.
  if (document.readyState === "complete") {
    scheduleRegistration();
  } else {
    state.loadListener = () => {
      state.loadListener = null;
      scheduleRegistration();
    };
    window.addEventListener("load", state.loadListener, { once: true });
  }

  function handleCloseTabShortcut(event) {
    if (!matchMedia("(display-mode: tabbed)").matches) return;

    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    const mac = platform === "macOS" || platform.startsWith("Mac");
    const primaryModifier = mac ? event.metaKey : event.ctrlKey;
    const otherPrimaryModifier = mac ? event.ctrlKey : event.metaKey;
    if (
      !primaryModifier ||
      otherPrimaryModifier ||
      event.altKey ||
      event.shiftKey ||
      event.key.toLowerCase() !== "w"
    ) {
      return;
    }

    // Respect a shortcut handler that ran earlier in the PWA.
    if (event.defaultPrevented) return;

    // After an extension reload, an old content-script listener can briefly
    // survive with an invalidated extension context. Do not swallow Cmd+W if
    // there is no live runtime capable of closing the tab.
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.sendMessage) return;

    event.preventDefault();
    runtime.sendMessage({ type: "closeCurrentTab" }).catch((error) => {
      console.error("Better PWAs could not close the current tab:", error);
    });
  }
})();
