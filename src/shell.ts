/**
 * Makes the app feel like an app, not a web page: no WebView context menu,
 * and no browser shortcuts (reload, print, save, devtools) in production builds.
 * Copy, paste and select-all keep working in text fields.
 */
export function installShellGuards(): void {
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  if (!import.meta.env.PROD) return;
  window.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const blocked =
      e.key === "F5" ||
      e.key === "F12" ||
      (ctrl && !e.shiftKey && ["r", "p", "s"].includes(e.key.toLowerCase())) ||
      (ctrl && e.shiftKey && e.key.toLowerCase() === "i");
    if (blocked) e.preventDefault();
  });
}
