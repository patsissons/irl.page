import { defineConfig, devices } from "@playwright/test";

// E2e runs the real stack: a throwaway PocketBase (its own port and data
// directory, wiped on every run and seeded by e2e/global-setup.ts) and
// `vite dev` with the Worker in workerd, both reading .dev.vars.e2e. Ports
// differ from local development, so a running `pnpm dev` is never touched.
// OSM_LOOKUP=off there keeps the run off the public OpenStreetMap servers.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5198",
    trace: "on-first-retry",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: [
    {
      command:
        "rm -rf pocketbase/pb_data_e2e && ENV_FILE=.dev.vars.e2e PB_DATA_DIR=pocketbase/pb_data_e2e bash scripts/pocketbase.sh",
      url: "http://127.0.0.1:8191/api/health",
      reuseExistingServer: false,
    },
    {
      command: "CLOUDFLARE_ENV=e2e pnpm dev:web --port 5198 --strictPort",
      url: "http://localhost:5198/api/health",
      reuseExistingServer: false,
    },
  ],
});
