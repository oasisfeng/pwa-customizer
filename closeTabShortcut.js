// Chromium maps the close-tab shortcut to Close Window in tabbed PWA app windows.
// App-window shortcuts can reach web content, so translate it back to closing the sender tab.
window.addEventListener("keydown", handleCloseTabShortcut, true);

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

  event.preventDefault();
  event.stopImmediatePropagation();
  chrome.runtime.sendMessage({ type: "closeCurrentTab" }).catch((error) => {
    console.error("Better PWAs could not close the current tab:", error);
  });
}
