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
}) => {
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

  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(2);
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

  await selectionDialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(selectionDialog).toHaveCount(0);
  const reorderedCustomHeader = page.locator('thead tr').first().locator('th', {
    hasText: 'Eigene Qualitätsspalte',
  });
  const expectedCustomCellIndex = await reorderedCustomHeader.evaluate(
    (header) => (header as HTMLTableCellElement).cellIndex,
  );
  await publishExplorerDraft(page);
  await page.getByRole('button', { name: 'READ ONLY-Vorschau' }).click();
  await expect(page.getByText('READ ONLY-Vorschau aktiv.')).toBeVisible();
  const readOnlyCustomHeader = page.locator('thead tr').first().locator('th', {
    hasText: 'Eigene Qualitätsspalte',
  });
  await expect(readOnlyCustomHeader).toHaveCSS('width', '260px');
  await expect
    .poll(() =>
      readOnlyCustomHeader.evaluate((header) => (header as HTMLTableCellElement).cellIndex),
    )
    .toBe(expectedCustomCellIndex);
  await page.getByRole('button', { name: 'Bearbeitungsansicht' }).click();
  await expect(page.getByText('READ ONLY-Vorschau aktiv.')).toHaveCount(0);

  await page.getByRole('button', { name: /Spalten verwalten/ }).click();
  const emptySelectionDialog = page
    .getByRole('heading', { name: 'Spalten verwalten' })
    .locator('xpath=ancestor::div[contains(@class, "column-manager-dialog")]');

  await expect.poll(() => emptySelectionDialog.locator('.tile-id').count()).toBeGreaterThan(0);
  const selectedColumnIds = await emptySelectionDialog.locator('.tile-id').allTextContents();
  let remainingSelectedColumns = selectedColumnIds.length;
  for (const columnId of selectedColumnIds) {
    await emptySelectionDialog.getByText(columnId.trim(), { exact: true }).click();
    remainingSelectedColumns -= 1;
    await expect(emptySelectionDialog.locator('.selection-info')).toContainText(
      new RegExp(`^\\s*${remainingSelectedColumns} von \\d+ Spalten gewählt\\s*$`),
    );
  }
  await expect(emptySelectionDialog.locator('.selection-info')).toContainText(
    /^\s*0 von \d+ Spalten gewählt\s*$/,
  );
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
        response.ok(),
    ),
    emptySelectionDialog.getByRole('button', { name: /Speichern/ }).click(),
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
  await reloadedDialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(reloadedDialog).toHaveCount(0);
  await publishExplorerDraft(page);
  await page.getByRole('button', { name: 'READ ONLY-Vorschau' }).click();
  await expect(page.getByText('READ ONLY-Vorschau aktiv.')).toBeVisible();
  await expect(page.locator('tbody tr').first().locator('td.meta-cell')).toHaveCount(0);
  await expect(
    page.locator('thead tr').first().locator('th', { hasText: 'Eigene Qualitätsspalte' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Bearbeitungsansicht' }).click();
  await expect(page.getByText('READ ONLY-Vorschau aktiv.')).toHaveCount(0);

  await page.getByRole('button', { name: /Spalten verwalten/ }).click();
  const resetDialog = page
    .getByRole('heading', { name: 'Spalten verwalten' })
    .locator('xpath=ancestor::div[contains(@class, "column-manager-dialog")]');
  const resetButton = resetDialog.getByRole('button', { name: /Standard/ });
  await expect(resetButton).toBeEnabled();
  await resetButton.click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
        response.ok(),
    ),
    resetDialog.getByRole('button', { name: /Speichern/ }).click(),
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

test('sorts VERA items by the complete visible Item-ID in both directions', async ({ page }) => {
  const veraItems = [
    {
      itemId: '01',
      uuid: 'vera-mdv010-01',
      rowKey: 'vera-mdv010-01',
      rowNumber: 6,
      unitId: 'MDV010',
      unitLabel: 'VERA Aufgabe 10',
      description: 'Item 01',
      variableId: '',
      metadata: {},
    },
    {
      itemId: '10',
      uuid: 'vera-mdv002-10',
      rowKey: 'vera-mdv002-10',
      rowNumber: 5,
      unitId: 'MDV002',
      unitLabel: 'VERA Aufgabe 2',
      description: 'Item 10',
      variableId: '',
      metadata: {},
    },
    {
      itemId: '01',
      uuid: 'vera-mdv002-01',
      rowKey: 'vera-mdv002-01::10',
      rowNumber: 3,
      subId: '10',
      subIdDisplay: '10',
      unitId: 'MDV002',
      unitLabel: 'VERA Aufgabe 2',
      description: 'Partial Credit 10',
      variableId: '',
      metadata: {},
    },
    {
      itemId: '02',
      uuid: 'vera-mdv002-02',
      rowKey: 'vera-mdv002-02',
      rowNumber: 4,
      unitId: 'MDV002',
      unitLabel: 'VERA Aufgabe 2',
      description: 'Item 02',
      variableId: '',
      metadata: {},
    },
    {
      itemId: '01',
      uuid: 'vera-mdv002-01',
      rowKey: 'vera-mdv002-01::2-b',
      rowNumber: 2,
      subId: '2',
      subIdDisplay: '2',
      unitId: 'MDV002',
      unitLabel: 'VERA Aufgabe 2',
      description: 'Partial Credit 2b',
      variableId: '',
      metadata: {},
    },
    {
      itemId: '01',
      uuid: 'vera-mdv002-01',
      rowKey: 'vera-mdv002-01::2-a',
      rowNumber: 1,
      subId: '2',
      subIdDisplay: '2',
      unitId: 'MDV002',
      unitLabel: 'VERA Aufgabe 2',
      description: 'Partial Credit 2a',
      variableId: '',
      metadata: {},
    },
  ];
  await page.route(`**/api/acp/${ACP_ID}/files/item-list*`, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    await route.fulfill({ response, json: { ...payload, items: veraItems } });
  });
  await login(page, MANAGER_ID, MANAGER_USERNAME);
  await page.goto(`/view/${ACP_ID}/item-explorer`);
  await expect(page.getByRole('heading', { name: 'Item-Explorer' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(veraItems.length);

  const itemIdHeader = page.getByRole('columnheader', { name: /Item-ID/ });
  const ascendingPatch = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
      response.ok(),
  );
  await itemIdHeader.click();
  await ascendingPatch;
  await expect(itemIdHeader).toContainText('↑');

  const rows = page.locator('tbody tr');
  const ascendingRowIds = await rows.evaluateAll((elements) => elements.map((row) => row.id));
  expect(ascendingRowIds).toEqual([
    'item-explorer-row-vera-mdv002-01--2-a',
    'item-explorer-row-vera-mdv002-01--2-b',
    'item-explorer-row-vera-mdv002-01--10',
    'item-explorer-row-vera-mdv002-02',
    'item-explorer-row-vera-mdv002-10',
    'item-explorer-row-vera-mdv010-01',
  ]);
  await expect(rows.first().locator('.unit-id')).toHaveText('MDV002');
  await expect(rows.first().locator('.item-id')).toHaveText('01');

  const descendingPatch = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().endsWith(`/api/acp/${ACP_ID}/item-explorer/draft`) &&
      response.ok(),
  );
  await itemIdHeader.click();
  await descendingPatch;
  await expect(itemIdHeader).toContainText('↓');
  await expect
    .poll(() => rows.evaluateAll((elements) => elements.map((row) => row.id)))
    .toEqual([...ascendingRowIds].reverse());

  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(veraItems.length);
  await expect(page.getByRole('columnheader', { name: /Item-ID/ })).toContainText('↓');
  await expect
    .poll(() => page.locator('tbody tr').evaluateAll((elements) => elements.map((row) => row.id)))
    .toEqual([...ascendingRowIds].reverse());
});
