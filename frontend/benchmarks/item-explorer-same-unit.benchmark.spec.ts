import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { expect, Page, test } from '@playwright/test';

const ACP_ID = '20000000-0000-4000-8000-000000000001';
const MANAGER_USERNAME = 'benchmark-manager';
const MANAGER_PASSWORD = 'Benchmark-E2E-123!';
const SAMPLE_COUNT = 40;

const rowIds = {
  direct: '#item-explorer-row-benchmark-item-0001',
  fallback: '#item-explorer-row-benchmark-item-0002',
};

interface BenchmarkResult {
  schemaVersion: 1;
  variant: 'baseline' | 'candidate';
  revision: string;
  runIndex: number;
  sampleCount: number;
  durationsMs: number[];
}

async function loginAsManager(page: Page): Promise<void> {
  const response = await page.request.post('/api/auth/login', {
    data: { username: MANAGER_USERNAME, password: MANAGER_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const token = (await response.json()).accessToken as string;
  await page.addInitScript((accessToken) => {
    localStorage.setItem('cp_token', accessToken);
    localStorage.setItem('cp_auth_type', 'local');
  }, token);
}

async function selectItem(page: Page, rowSelector: string, itemId: string): Promise<void> {
  const responsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === 'POST' &&
      pathname.endsWith(`/items/${itemId}/response-state/with-fallback`) &&
      response.ok()
    );
  });
  await page.locator(rowSelector).click();
  await responsePromise;
  await expect(page.locator(rowSelector)).toHaveAttribute('aria-selected', 'true');
}

test('records same-unit browser latency outside the regular E2E suite', async ({
  page,
}, testInfo) => {
  const variant = process.env['ITEM_EXPLORER_BENCHMARK_VARIANT'];
  if (variant !== 'baseline' && variant !== 'candidate') {
    throw new Error(
      "Run this benchmark through `npm run benchmark:item-explorer` with variant 'baseline' or 'candidate'.",
    );
  }
  const revision = process.env['ITEM_EXPLORER_BENCHMARK_REVISION'];
  if (!revision) {
    throw new Error('The benchmark runner did not provide a revision.');
  }
  const runIndex = Number(process.env['ITEM_EXPLORER_BENCHMARK_RUN_INDEX']);
  if (!Number.isInteger(runIndex) || runIndex < 1) {
    throw new Error('The benchmark runner did not provide a valid run index.');
  }

  await loginAsManager(page);
  await page.goto(`/view/${ACP_ID}/item-explorer`);
  await expect(page.locator(rowIds.direct)).toBeVisible({ timeout: 60_000 });

  await selectItem(page, rowIds.direct, 'item-0001');
  await expect(page.locator('iframe.player-iframe')).toBeVisible();

  const durationsMs: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const useFallbackItem = index % 2 === 0;
    const startedAt = performance.now();
    await selectItem(
      page,
      useFallbackItem ? rowIds.fallback : rowIds.direct,
      useFallbackItem ? 'item-0002' : 'item-0001',
    );
    durationsMs.push(performance.now() - startedAt);
  }

  const result: BenchmarkResult = {
    schemaVersion: 1,
    variant,
    revision,
    runIndex,
    sampleCount: durationsMs.length,
    durationsMs,
  };
  const resultPath = resolve(
    process.env['ITEM_EXPLORER_BENCHMARK_RESULT'] ||
      `benchmark-results/item-explorer-same-unit-${variant}.json`,
  );
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await testInfo.attach('same-unit-performance', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
});
