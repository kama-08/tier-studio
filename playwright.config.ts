import { defineConfig, devices } from '@playwright/test';

const production = Boolean(process.env.TEST_PRODUCTION);
const baseURL = production ? 'http://127.0.0.1:1421' : 'http://127.0.0.1:1420';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: production ? 'bun run preview --port 1421' : 'bun run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
