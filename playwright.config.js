import { defineConfig, devices } from '@playwright/test';

// Chromium (phone + desktop) always runs. Safari (WebKit) and Firefox run in CI,
// or locally with ALL_BROWSERS=1 after `npx playwright install webkit firefox`.
const all = !!(process.env.CI || process.env.ALL_BROWSERS);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/server.mjs 4173', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'phone-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    ...(all ? [
      { name: 'iphone-webkit', use: { ...devices['iPhone 14'] } },
      { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
    ] : []),
  ],
});
