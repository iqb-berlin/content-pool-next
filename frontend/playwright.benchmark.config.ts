import { defineConfig } from '@playwright/test';
import { join, resolve } from 'node:path';
import browserTestConfig from './playwright.config';

const appRoot = resolve(process.env['ITEM_EXPLORER_BENCHMARK_APP_ROOT'] || '..');
const backendPort = 3100;
const frontendPort = 4300;

export default defineConfig({
  ...browserTestConfig,
  testDir: './benchmarks',
  outputDir: 'benchmark-results/test-results',
  timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: 'benchmark-results/playwright-results.json' }]],
  webServer: [
    {
      command: 'npm run start',
      cwd: join(appRoot, 'backend'),
      url: `http://127.0.0.1:${backendPort}/api/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm start -- --host 127.0.0.1 --port ${frontendPort} --proxy-config e2e/proxy.conf.json`,
      cwd: join(appRoot, 'frontend'),
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
