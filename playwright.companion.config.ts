import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/companion",
  workers: 1,
  timeout: 45000,
  use: { screenshot: "only-on-failure" },
});
