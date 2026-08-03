import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" },
  webServer: {
    command: "pnpm --filter @iso-room-pixi/demo dev --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
