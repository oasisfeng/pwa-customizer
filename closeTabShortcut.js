(() => {
  const stateKey = "__betterPwasTabShortcuts";

  // If this script is reinjected into the same live extension world, replace our
  // previous listener instead of stacking another one.
  const previous = globalThis[stateKey];
  if (previous?.loadListener) window.removeEventListener("load", previous.loadListener);
  if (previous?.timer != null) clearTimeout(previous.timer);
  if (previous?.listener) window.removeEventListener("keydown", previous.listener);

  const state = {};
  globalThis[stateKey] = state;

  const scheduleRegistration = () => {
    state.timer = setTimeout(() => {
      state.timer = null;
      state.listener = handleTabbedPwaShortcut;
      window.addEventListener("keydown", state.listener);
    }, 0);
  };

  // Register late in the bubble phase so the PWA gets first chance to claim
  // Command/Ctrl+W or Command/Ctrl+T itself.
  if (document.readyState === "complete") {
    scheduleRegistration();
  } else {
    state.loadListener = () => {
      state.loadListener = null;
      scheduleRegistration();
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
    if (
      !primaryModifier ||
      otherPrimaryModifier ||
      event.altKey ||
      event.shiftKey ||
      !["t", "w"].includes(key)
    ) {
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
    const type = key === "t" ? "openNewTab" : "closeCurrentTab";
    runtime
      .sendMessage({ type })
      .then((response) => {
        if (response?.ok === false) {
          console.error(`Better PWAs could not ${key === "t" ? "open a new" : "close the current"} tab:`, response.error);
        }
      })
      .catch((error) => {
        console.error(`Better PWAs could not ${key === "t" ? "open a new" : "close the current"} tab:`, error);
      });
  }
})();
