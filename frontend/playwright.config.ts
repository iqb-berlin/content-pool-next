import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run start',
      cwd: '../backend',
      url: 'http://127.0.0.1:3000/api/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm start -- --host 127.0.0.1 --port 4200 --proxy-config e2e/proxy.conf.json',
      cwd: '.',
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
