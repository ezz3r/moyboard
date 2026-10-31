import { defineConfig, devices } from "@playwright/test";

// Runs the UI against the Vite dev server. The browser has no Tauri IPC, so
// src/api.ts routes calls to the in-memory mock (src/mock.ts). Audio, global
// hotkeys, drag-and-drop from the OS, and the folder watcher need the real app.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1100, height: 700 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 700 } } }],
  webServer: {
    command: "npm run dev -- --port 1420 --strictPort",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
