import { defineConfig } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
mkdirSync("work", { recursive: true });
const testData = mkdtempSync(path.resolve("work", "e2e-data-"));
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3101";
export default defineConfig({
  testDir: "./tests",
  testMatch: "e2e.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: base,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm run dev --port 3101",
    url: base,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      MECAPLAN_DATA_DIR: testData,
      ENABLE_DEMO: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      BUILD_OUT: ".next-e2e",
    },
  },
  reporter: "list",
  timeout: 30000,
});
