import { expect, Page, test } from '@playwright/test';
import { installOidcSession } from './oidc-test-session';

const ACP_ID = '10000000-0000-4000-8000-000000000201';
const MANAGER_ID = '10000000-0000-4000-8000-000000000002';
const MANAGER_USERNAME = 'e2e-manager';
const VIEWER_ID = '10000000-0000-4000-8000-000000000003';
const VIEWER_USERNAME = 'e2e-viewer';

test.describe.configure({ mode: 'serial' });

async function login(page: Page, userId: string, username: string): Promise<void> {
  await installOidcSession(page, userId, username);
}

async function openExplorer(page: Page): Promise<void> {
  await page.goto(`/view/${ACP_ID}/item-explorer`);
  await expect(page.getByRole('heading', { name: 'Item-Explorer' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
}

async function saveFeatureConfig(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Features speichern' }).click();
  await expect(page.getByText('✓ Gespeichert').last()).toBeVisible();
}

async function publishExplorerDraft(page: Page): Promise<void> {
  const saveButton = page.getByRole('button', { name: /Speichern/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(
    page.getByRole('heading', { name: 'Änderungsübersicht vor Speichern' }),
  ).toBeVisible();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft/save`) &&
        response.ok(),
    ),
    page.getByRole('button', { name: 'Veröffentlichen' }).click(),
  ]);
}

test('offers configured columns and persists widths plus an explicitly empty selection', async ({
  page,
}, testInfo) => {
  await login(page, MANAGER_ID, MANAGER_USERNAME);

  await page.goto(`/manage/${ACP_ID}/access`);
  await expect(page.getByRole('heading', { name: 'Zugriffskonfiguration' })).toBeVisible();
  await expect(page.getByLabel('ID der zusätzlichen Spalte 1')).toHaveValue('customQuality');
  await expect(page.getByLabel('Name der zusätzlichen Spalte 1')).toHaveValue(
    'Eigene Qualitätsspalte',
  );
  await expect(page.getByLabel('Allgemeine Kodierungshinweise anzeigen')).not.toBeChecked();
  await expect(
    page.getByLabel('Manuelle Kodieranweisung anstelle automatischer Kodiervorschrift verwenden'),
  ).toBeChecked();

  await openExplorer(page);
  const firstRow = page.locator('tbody tr').first();
  await firstRow.click();
  await expect(firstRow).toHaveAttribute('aria-selected', 'true');

  const scroller = page.locator('.table-scroll');
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const visualEvidence = await firstRow.evaluate((row) => {
    const cells = Array.from(row.querySelectorAll('td'));
    const backgrounds = cells.map((cell) => getComputedStyle(cell).backgroundColor);
    const sticky = row.querySelector<HTMLElement>('td.sticky-col');
    if (!sticky) throw new Error('Sticky item column is missing');
    const bounds = sticky.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + 10);
    return {
      backgrounds,
      stickyBackground: getComputedStyle(sticky).backgroundColor,
      stickyHit: Boolean(hit?.closest('td.sticky-col')),
      scrollLeft: row.closest('.table-scroll')?.scrollLeft || 0,
    };
  });
  expect(visualEvidence.scrollLeft).toBeGreaterThan(0);
  expect(visualEvidence.stickyHit).toBe(true);
  expect(new Set(visualEvidence.backgrounds).size).toBe(1);
  expect(visualEvidence.stickyBackground).not.toBe('rgba(0, 0, 0, 0)');
  await testInfo.attach('sticky-selected-row', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: /Spalten verwalten/ }).click();
  const dialog = page
    .getByRole('heading', { name: 'Spalten verwalten' })
    .locator('xpath=ancestor::div[contains(@class, "column-manager-dialog")]');
  await expect(dialog).toContainText('Eigene Qualitätsspalte');
  await expect(dialog).toContainText('ID: customQuality');
  await dialog.getByLabel('Breite für Eigene Qualitätsspalte').fill('260');

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
        response.ok(),
    ),
    dialog.getByRole('button', { name: /Speichern/ }).click(),
  ]);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const customHeader = page.locator('thead tr').first().locator('th', {
    hasText: 'Eigene Qualitätsspalte',
  });
  await expect(customHeader).toHaveCount(1);
  await expect(customHeader).toHaveCSS('width', '260px');

  await page.getByRole('button', { name: /Spalten verwalten/ }).click();
  const orderDialog = page
    .getByRole('heading', { name: 'Spalten verwalten' })
    .locator('xpath=ancestor::div[contains(@class, "column-manager-dialog")]');
  const orderedIdsBefore = await orderDialog.locator('.tile-id').allTextContents();
  const customIndexBefore = orderedIdsBefore.findIndex((value) => value.includes('customQuality'));
  expect(customIndexBefore).toBeGreaterThanOrEqual(0);
  const customTile = orderDialog.locator('.column-tile', { hasText: 'ID: customQuality' });
  if (customIndexBefore > 0) {
    await customTile.getByTitle('Nach oben').click();
  } else {
    await customTile.getByTitle('Nach unten').click();
  }
  const expectedCustomIndex = customIndexBefore > 0 ? customIndexBefore - 1 : 1;
  await expect
    .poll(async () => {
      const orderedIdsAfter = await orderDialog.locator('.tile-id').allTextContents();
      return orderedIdsAfter.findIndex((value) => value.includes('customQuality'));
    })
    .toBe(expectedCustomIndex);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
        response.ok(),
    ),
    orderDialog.getByRole('button', { name: /Speichern/ }).click(),
  ]);

  await page.getByRole('button', { name: /Spalten verwalten/ }).click();
  const selectionDialog = page
    .getByRole('heading', { name: 'Spalten verwalten' })
    .locator('xpath=ancestor::div[contains(@class, "column-manager-dialog")]');
  await expect
    .poll(async () => {
      const persistedOrder = await selectionDialog.locator('.tile-id').allTextContents();
      return persistedOrder.findIndex((value) => value.includes('customQuality'));
    })
    .toBe(expectedCustomIndex);

  const selectedColumnIds = await selectionDialog.locator('.tile-id').allTextContents();
  let remainingSelectedColumns = selectedColumnIds.length;
  for (const columnId of selectedColumnIds) {
    await selectionDialog.getByText(columnId.trim(), { exact: true }).click();
    remainingSelectedColumns -= 1;
    await expect(selectionDialog.locator('.selection-info')).toContainText(
      new RegExp(`^\\s*${remainingSelectedColumns} von \\d+ Spalten gewählt\\s*$`),
    );
  }
  await expect(selectionDialog.locator('.selection-info')).toContainText(
    /^\s*0 von \d+ Spalten gewählt\s*$/,
  );
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
        response.ok(),
    ),
    selectionDialog.getByRole('button', { name: /Speichern/ }).click(),
  ]);

  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: /Spalten verwalten/ }).click();
  const reloadedDialog = page
    .getByRole('heading', { name: 'Spalten verwalten' })
    .locator('xpath=ancestor::div[contains(@class, "column-manager-dialog")]');
  await expect(reloadedDialog.locator('.selection-info')).toContainText(
    /^\s*0 von \d+ Spalten gewählt\s*$/,
  );
  await expect(reloadedDialog.getByLabel('Breite für Eigene Qualitätsspalte')).toHaveValue('260');
  const resetButton = reloadedDialog.getByRole('button', { name: /Standard/ });
  await expect(resetButton).toBeEnabled();
  await resetButton.click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
        response.ok(),
    ),
    reloadedDialog.getByRole('button', { name: /Speichern/ }).click(),
  ]);
  await expect(
    page.locator('thead tr').first().locator('th', { hasText: 'Eigene Qualitätsspalte' }),
  ).toHaveCount(1);

  const oldTag = page.locator('tbody tr').first().locator('.tag-badge', { hasText: 'Alt' });
  await expect(oldTag).toBeVisible();
  const tagPatch = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
      response.ok(),
  );
  await oldTag.click();
  await expect(oldTag).toHaveCount(0);
  await tagPatch;
  await page.reload();
  await expect(
    page.locator('tbody tr').first().locator('.tag-badge', { hasText: 'Alt' }),
  ).toHaveCount(0);

  await publishExplorerDraft(page);
  await page.getByRole('button', { name: 'READ ONLY-Vorschau' }).click();
  await expect(page.getByText('READ ONLY-Vorschau aktiv.')).toBeVisible();
  await expect(
    page.locator('tbody tr').first().locator('.tag-badge', { hasText: 'Alt' }),
  ).toHaveCount(0);
});

test('applies coding configuration defaults and the alternative combinations in editor and read-only views', async ({
  browser,
  page,
}) => {
  await login(page, MANAGER_ID, MANAGER_USERNAME);
  await openExplorer(page);

  await page.locator('tbody tr').first().click();
  await page.getByRole('button', { name: /Kodierung/ }).click();
  const codingDialog = page
    .getByRole('heading', { name: /Kodierung – Lieblingsbücher_2/ })
    .locator('xpath=ancestor::div[contains(@class, "overlay-dialog")]');
  await expect(codingDialog.getByTestId('coding-variable-focus')).toContainText('01');
  await expect(codingDialog.locator('.coding-item')).toHaveCount(1);
  await expect(codingDialog).toContainText('Nur Segment Bilderbücher markieren.');
  await expect(codingDialog.locator('.rule-list')).toHaveCount(0);
  for (const technicalId of ['_button01', '_intro01', '_outro01', '_source01']) {
    await expect(codingDialog).not.toContainText(technicalId);
  }
  await codingDialog.getByRole('button', { name: /Schließen/ }).click();

  await page.locator('tbody tr').nth(1).click();
  await page.getByRole('button', { name: /Kodierung/ }).click();
  await expect(page.getByText('Allgemeiner Testhinweis zur Kodierung.')).toHaveCount(0);
  await page.getByRole('button', { name: /Schließen/ }).click();

  await page.goto(`/manage/${ACP_ID}/access`);
  await page
    .getByLabel('Manuelle Kodieranweisung anstelle automatischer Kodiervorschrift verwenden')
    .uncheck();
  await page.getByLabel('Allgemeine Kodierungshinweise anzeigen').check();
  await saveFeatureConfig(page);

  await openExplorer(page);
  await page.locator('tbody tr').first().click();
  await page.getByRole('button', { name: /Kodierung/ }).click();
  const alternativeDialog = page
    .getByRole('heading', { name: /Kodierung – Lieblingsbücher_2/ })
    .locator('xpath=ancestor::div[contains(@class, "overlay-dialog")]');
  await expect(alternativeDialog).toContainText('Nur Segment Bilderbücher markieren.');
  await expect(alternativeDialog.locator('.rule-list li')).toHaveCount(1);
  await alternativeDialog.getByRole('button', { name: /Schließen/ }).click();

  await page.locator('tbody tr').nth(1).click();
  await page.getByRole('button', { name: /Kodierung/ }).click();
  await expect(page.getByText('Allgemeiner Testhinweis zur Kodierung.')).toBeVisible();
  await page.getByRole('button', { name: /Schließen/ }).click();

  const viewerContext = await browser.newContext();
  await login(await viewerContext.newPage(), VIEWER_ID, VIEWER_USERNAME);
  const viewerPage = viewerContext.pages()[0];
  await openExplorer(viewerPage);
  await viewerPage.locator('tbody tr').nth(1).click();
  await viewerPage.getByRole('button', { name: /Kodierung/ }).click();
  await expect(viewerPage.getByText('Allgemeiner Testhinweis zur Kodierung.')).toBeVisible();
  await viewerContext.close();
});

test('shares personal lists ACP-wide as read-only and creates independent private copies', async ({
  browser,
  page,
}) => {
  await login(page, MANAGER_ID, MANAGER_USERNAME);
  await openExplorer(page);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/view/acp/${ACP_ID}/items/collections`) &&
        response.ok(),
    ),
    page.getByRole('button', { name: 'Neu', exact: true }).click(),
  ]);
  const managerRowCheckbox = page.getByLabel('Item 01 in Auswahlliste auswählen');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes('/items/collections/') &&
        response.url().endsWith('/rows') &&
        response.ok(),
    ),
    managerRowCheckbox.check(),
  ]);
  const shareToggle = page.getByLabel('Für diesen ACP freigeben');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        /\/items\/collections\/[^/]+$/.test(new URL(response.url()).pathname) &&
        response.ok(),
    ),
    shareToggle.check(),
  ]);
  await expect(shareToggle).toBeChecked();

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await login(viewerPage, VIEWER_ID, VIEWER_USERNAME);
  await openExplorer(viewerPage);
  const viewerSelect = viewerPage.getByLabel('Aktive persönliche Auswahlliste auswählen');
  const sharedOption = viewerSelect.locator('option', { hasText: 'E2E Manager' });
  await expect(sharedOption).toHaveCount(1);
  const sharedId = await sharedOption.getAttribute('value');
  expect(sharedId).toBeTruthy();
  await viewerSelect.selectOption(sharedId!);
  await expect(viewerPage.getByText('Geteilt von E2E Manager')).toBeVisible();
  await expect(viewerPage.getByRole('button', { name: 'Umbenennen' })).toBeDisabled();
  await expect(viewerPage.getByRole('button', { name: 'Leeren' })).toBeDisabled();
  await expect(viewerPage.getByLabel('Item 01 in Auswahlliste auswählen')).toBeDisabled();
  await expect(viewerPage.getByRole('button', { name: 'Private Kopie erstellen' })).toBeEnabled();

  await Promise.all([
    viewerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/items/collections/${sharedId}/copy`) &&
        response.ok(),
    ),
    viewerPage.getByRole('button', { name: 'Private Kopie erstellen' }).click(),
  ]);
  await expect(viewerSelect).toContainText('(Kopie)');
  await expect(viewerPage.getByLabel('Für diesen ACP freigeben')).not.toBeChecked();
  await expect(viewerPage.getByLabel('Item 01 in Auswahlliste auswählen')).toBeEnabled();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        /\/items\/collections\/[^/]+$/.test(new URL(response.url()).pathname) &&
        response.ok(),
    ),
    shareToggle.uncheck(),
  ]);
  await viewerPage.reload();
  await expect(viewerPage.getByLabel('Aktive persönliche Auswahlliste auswählen')).toContainText(
    '(Kopie)',
  );
  await expect(
    viewerPage.getByLabel('Aktive persönliche Auswahlliste auswählen'),
  ).not.toContainText('E2E Manager');
  await viewerContext.close();
});
