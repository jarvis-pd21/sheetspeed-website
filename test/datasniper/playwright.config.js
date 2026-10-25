import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.js",
  timeout: 120000,
  expect: { timeout: 20000 },
  outputDir: "test-results",
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1280, height: 900 },
    video: "on",
    screenshot: "on",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    cwd: root,
    port: 4173,
    reuseExistingServer: false,
  },
});
