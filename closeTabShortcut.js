// Chromium maps the close-tab shortcut to Close Window in tabbed PWA app windows.
// Register late in the bubble phase so the PWA gets first chance to claim the shortcut.
if (document.readyState === "complete") {
  setTimeout(registerCloseTabShortcut, 0);
} else {
  window.addEventListener("load", () => setTimeout(registerCloseTabShortcut, 0), { once: true });
}

function registerCloseTabShortcut() {
  window.addEventListener("keydown", handleCloseTabShortcut);
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

  event.preventDefault();
  chrome.runtime.sendMessage({ type: "closeCurrentTab" }).catch((error) => {
    console.error("Better PWAs could not close the current tab:", error);
  });
}
