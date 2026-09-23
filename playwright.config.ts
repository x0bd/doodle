// The smoke (PLAN.md M1.10): the app in WebKit — the engine the installed
// app runs on — against the dev server, as a first-run visitor would use
// it. No Tauri: the page's `inTauri` is false, so nothing touches a disk.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.e2e\.ts/,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:1430", viewport: { width: 1280, height: 800 } },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } }],
  webServer: { command: "pnpm dev", port: 1430, reuseExistingServer: true, timeout: 60_000 },
});
