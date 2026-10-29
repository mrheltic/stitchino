import { defineConfig, devices } from '@playwright/test';

// Locally the installed Chrome is used; CI installs Playwright's Chromium.
const channel = process.env.CI ? undefined : 'chrome';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'tablet', use: { ...devices['iPad Pro 11'], browserName: 'chromium', channel } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
