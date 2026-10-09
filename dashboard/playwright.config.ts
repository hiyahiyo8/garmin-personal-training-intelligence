import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:4175", channel: "chrome" },
  webServer: { command: "node node_modules/vite/bin/vite.js --host localhost --port 4175", url: "http://localhost:4175", reuseExistingServer: true, timeout: 120_000 },
});
