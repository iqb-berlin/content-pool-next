import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, Page, test } from '@playwright/test';
import { installOidcSession } from './oidc-test-session';
import { conditionalVisibilityDefinition } from './fixtures/conditional-visibility';

const ACP_ID = '10000000-0000-4000-8000-000000000101';
const playerHtml = readFileSync(join(__dirname, '../tmp/aspect-3.0.1.html'), 'utf8');
const rowA = '#item-explorer-row-regression-item-uuid-1';
const rowB = '#item-explorer-row-regression-item-uuid-2';

async function openPreview(
  page: Page,
  options: {
    enabled?: boolean;
    definition?: ReturnType<typeof conditionalVisibilityDefinition>;
    saved?: Record<string, string>;
  } = {},
) {
  await installOidcSession(page, '10000000-0000-4000-8000-000000000002', 'e2e-manager');
  await page.route(`**/api/view/acp/${ACP_ID}`, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.featureConfig = {
      ...json.featureConfig,
      enableItemExplorerConditionalVisibility: options.enabled !== false,
    };
    await route.fulfill({ response, json });
  });
  // Other suites publish a V2 override for row A. Keep this task's target mapping
  // explicit in every perspective without mutating the shared seed database.
  await page.route(`**/api/view/acp/${ACP_ID}/item-explorer/state*`, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    for (const state of [json.activeState, json.draftState, json.publishedState]) {
      if (!state) continue;
      for (const [rowKey, target] of [
        ['regression-item-uuid-1', 'V1'],
        ['regression-item-uuid-2', 'V2'],
      ]) {
        state.itemProperties = { ...state.itemProperties, [rowKey]: { previewTargetId: target } };
      }
    }
    await route.fulfill({ response, json });
  });
  await page.route(`**/api/acp/${ACP_ID}/items/*/response-state/with-fallback`, (route) =>
    route.fulfill({
      json: { state: options.saved ? { responseData: options.saved } : null, isFallback: false },
    }),
  );
  await page.route(`**/api/acp/${ACP_ID}/files/unit-view/u1*`, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.dependencies = [
      {
        fileId: 'visibility-player',
        type: 'PLAYER',
        downloadUrl: '/api/visibility-fixture/player',
      },
      {
        fileId: 'visibility-definition',
        type: 'UNIT_DEFINITION',
        downloadUrl: '/api/visibility-fixture/definition',
      },
    ];
    await route.fulfill({ response, json });
  });
  await page.route('**/api/visibility-fixture/player*', (route) =>
    route.fulfill({ contentType: 'text/html', body: playerHtml }),
  );
  await page.route('**/api/visibility-fixture/definition*', (route) =>
    route.fulfill({ json: options.definition || conditionalVisibilityDefinition() }),
  );
  await page.goto(`/view/${ACP_ID}/item-explorer`);
  await expect(page.locator(rowA)).toBeVisible();
}

test('real Aspect switches stimulus A → B → A and blocks synthetic answer saving', async ({
  page,
}, info) => {
  await openPreview(page);
  const frame = page.frameLocator('iframe.player-iframe');
  for (const [row, visible, hidden] of [
    [rowA, 'A', 'B'],
    [rowB, 'B', 'A'],
    [rowA, 'A', 'B'],
  ]) {
    await page.locator(row).click();
    await expect(frame.getByText(`Aufgabe ${visible}`, { exact: true })).toBeVisible();
    await expect(frame.getByText(`Stimulus nur für ${visible}`, { exact: true })).toBeVisible();
    await expect(frame.getByText(`Stimulus nur für ${hidden}`, { exact: true })).toBeHidden();
    await expect(page.locator('.preview-state-note')).toContainText(
      'Vorbereiteter Vorschauzustand',
    );
  }
  await page.getByText('Weitere Aktionen ▾', { exact: true }).last().click();
  await expect(
    page.getByRole('button', { name: 'Player-Eingaben speichern …', exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath('conditional-stimulus.png'), fullPage: true });
});

test('disabled option keeps the existing overview with both stimulus sections', async ({
  page,
}) => {
  await openPreview(page, { enabled: false });
  await page.locator(rowA).click();
  const frame = page.frameLocator('iframe.player-iframe');
  await expect(frame.getByText('Stimulus nur für A', { exact: true })).toBeVisible();
  await expect(frame.getByText('Stimulus nur für B', { exact: true })).toBeVisible();
  await expect(page.locator('.preview-state-note')).toHaveCount(0);
});

test('saved player context takes precedence and remains saveable', async ({ page }) => {
  await openPreview(page, {
    saved: {
      stateVariableCodes: JSON.stringify([{ id: 'Context', status: 'VALUE_CHANGED', value: '2' }]),
    },
  });
  await page.locator(rowB).click();
  const frame = page.frameLocator('iframe.player-iframe');
  await expect(frame.getByText('Stimulus nur für B', { exact: true })).toBeVisible();
  await expect(frame.getByText('Stimulus nur für A', { exact: true })).toBeHidden();
  await expect(page.locator('.preview-state-note')).toHaveCount(0);
  await page.getByText('Weitere Aktionen ▾', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Player-Eingaben speichern …', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Zustand speichern' })).toBeVisible();
  await expect(page.locator('.overlay-dialog')).not.toContainText('Kein Zustand zum Speichern');
});

test('unsupported conditions explain the fallback to the complete unit', async ({ page }) => {
  const definition = conditionalVisibilityDefinition();
  definition.pages[1].sections[0].visibilityRules[0].operator = '>';
  await openPreview(page, { definition });
  await page.locator(rowA).click();
  await expect(page.locator('.player-container')).toContainText('nicht unterstützten Bedingungen');
  await expect(page.locator('iframe.player-iframe')).toHaveCount(0);
  await expect(page.locator('.player-container a')).toHaveAttribute('href', /unit/);
});
