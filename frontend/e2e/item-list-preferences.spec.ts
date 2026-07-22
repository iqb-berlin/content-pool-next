import { expect, Page, test } from '@playwright/test';

const ACP_ID = '10000000-0000-4000-8000-000000000001';
const MANAGER_USERNAME = 'e2e-manager';
const MANAGER_PASSWORD = 'Manager-E2E-123!';
const CREDENTIAL_USERNAME = 'e2e-reviewer';
const CREDENTIAL_PASSWORD = 'Reviewer-E2E-123!';

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
        response.url().includes('/item-explorer/draft/save') &&
        response.ok(),
    ),
    page.getByRole('button', { name: 'Veröffentlichen' }).click(),
  ]);
}

async function loginWithCredential(page: Page): Promise<void> {
  await page.goto(`/credential-login/${ACP_ID}`);
  await page.getByLabel('Benutzername').fill(CREDENTIAL_USERNAME);
  await page.getByLabel('Kennwort').fill(CREDENTIAL_PASSWORD);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/auth/credential-login') &&
        response.ok(),
    ),
    page.getByRole('button', { name: 'Zugang öffnen' }).click(),
  ]);
  await expect(page).toHaveURL(new RegExp(`/view/${ACP_ID}`));
}

test('shows a slow-connection hint while the Explorer item list is delayed', async ({
  page,
  request,
}) => {
  const login = await request.post('/api/auth/login', {
    data: { username: MANAGER_USERNAME, password: MANAGER_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).accessToken as string;
  await page.addInitScript((accessToken) => {
    localStorage.setItem('cp_token', accessToken);
    localStorage.setItem('cp_auth_type', 'local');
  }, token);
  await page.route('**/api/acp/*/files/item-list*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2200));
    await route.continue();
  });

  await page.goto(`/view/${ACP_ID}/item-explorer`);

  const slowHint = page.getByText(/Das Laden dauert länger als erwartet/);
  await expect(slowHint).toBeVisible();
  await expect(page.locator('.item-list-loading')).toHaveAttribute('aria-live', 'polite');
  await expect(slowHint).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('tbody tr').first()).toBeVisible();
});

test('shows and clears the slow-connection hint for a delayed preview phase', async ({
  page,
  request,
}) => {
  const login = await request.post('/api/auth/login', {
    data: { username: MANAGER_USERNAME, password: MANAGER_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).accessToken as string;
  await page.addInitScript((accessToken) => {
    localStorage.setItem('cp_token', accessToken);
    localStorage.setItem('cp_auth_type', 'local');
  }, token);
  await page.route('**/api/acp/*/files/unit-view/*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2200));
    await route.continue();
  });

  await page.goto(`/view/${ACP_ID}/item-explorer`);
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();

  const slowHint = page.getByText(/Aktuelle Phase:/);
  await expect(slowHint).toBeVisible();
  await expect(slowHint).toContainText('Aufgabendaten, Player und Definition');
  await expect(page.locator('.slow-load-hint')).toHaveAttribute('aria-live', 'polite');
  await expect(slowHint).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('iframe.player-iframe')).toBeVisible();
});

test('reuses preview assets and requests only response state within one unit', async ({
  page,
  request,
}) => {
  const login = await request.post('/api/auth/login', {
    data: { username: MANAGER_USERNAME, password: MANAGER_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).accessToken as string;
  await page.addInitScript((accessToken) => {
    localStorage.setItem('cp_token', accessToken);
    localStorage.setItem('cp_auth_type', 'local');
  }, token);

  const requestCounts = {
    unitView: 0,
    responseState: 0,
    previewAssets: 0,
  };
  const sameUnitReuseRequests: Array<keyof typeof requestCounts> = [];
  let trackSameUnitReuse = false;
  page.on('request', (browserRequest) => {
    const pathname = new URL(browserRequest.url()).pathname;
    let requestType: keyof typeof requestCounts | null = null;
    if (pathname.includes('/files/unit-view/')) {
      requestType = 'unitView';
    } else if (pathname.endsWith('/response-state/with-fallback')) {
      requestType = 'responseState';
    } else if (/\/files\/[^/]+\/download$/.test(pathname)) {
      requestType = 'previewAssets';
    }
    if (!requestType) return;

    requestCounts[requestType] += 1;
    if (trackSameUnitReuse) sameUnitReuseRequests.push(requestType);
  });

  await page.goto(`/view/${ACP_ID}/item-explorer`);
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);

  await rows.nth(0).click();
  await expect.poll(() => requestCounts.unitView).toBe(1);
  await expect.poll(() => requestCounts.previewAssets).toBe(2);
  await expect.poll(() => requestCounts.responseState).toBe(1);
  await expect(page.locator('iframe.player-iframe')).toBeVisible();
  expect(requestCounts).toEqual({ unitView: 1, responseState: 1, previewAssets: 2 });

  trackSameUnitReuse = true;
  await rows.nth(1).click();
  await expect.poll(() => requestCounts.responseState).toBe(2);
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(requestCounts.unitView).toBe(1);
  expect(requestCounts.previewAssets).toBe(2);

  await rows.nth(0).click();
  await expect.poll(() => requestCounts.responseState).toBe(3);
  expect(requestCounts.unitView).toBe(1);
  expect(requestCounts.previewAssets).toBe(2);
  expect(sameUnitReuseRequests).toEqual(['responseState', 'responseState']);
});

test('reconciles mean filters across clear, reimport, reload and credential relogin', async ({
  browser,
  page,
  request,
}) => {
  await loginWithCredential(page);
  await page.goto(`/view/${ACP_ID}/items`);

  const meanFilter = page.getByPlaceholder('Mittlere Schwierigkeit: Min..Max');
  await expect(meanFilter).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: /Mittlere Aufgabenschwierigkeit/ }),
  ).toBeVisible();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes('/items/preferences') &&
        response.ok(),
    ),
    meanFilter.fill('-0.1..0.1'),
  ]);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.reload();
  await expect(meanFilter).toHaveValue('-0.1..0.1');

  const managerLogin = await request.post('/api/auth/login', {
    data: { username: MANAGER_USERNAME, password: MANAGER_PASSWORD },
  });
  expect(managerLogin.ok()).toBeTruthy();
  const managerToken = (await managerLogin.json()).accessToken as string;
  const managerContext = await browser.newContext();
  await managerContext.addInitScript((token) => {
    localStorage.setItem('cp_token', token);
    localStorage.setItem('cp_auth_type', 'local');
  }, managerToken);
  const managerPage = await managerContext.newPage();

  await managerPage.goto(`/view/${ACP_ID}/item-explorer`);
  await expect(managerPage.getByRole('heading', { name: 'Item-Explorer' })).toBeVisible();
  await managerPage.getByRole('button', { name: /Werte bereinigen/ }).click();
  await Promise.all([
    managerPage.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().includes('/empirical-difficulty') &&
        response.ok(),
    ),
    managerPage.getByRole('button', { name: 'Alle Werte entfernen' }).click(),
  ]);
  await publishExplorerDraft(managerPage);

  const preferenceCleanup = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/items/preferences') &&
      response.ok(),
  );
  await page.reload();
  await preferenceCleanup;
  await expect(page.getByPlaceholder('Mittlere Schwierigkeit: Min..Max')).toBeHidden();
  await expect(
    page.getByRole('columnheader', { name: /Mittlere Aufgabenschwierigkeit/ }),
  ).toBeHidden();

  const credentialToken = await page.evaluate(() => localStorage.getItem('cp_token'));
  expect(credentialToken).toBeTruthy();
  const cleanedPreferences = await request.get(
    `/api/view/acp/${ACP_ID}/items/preferences?viewId=item-list`,
    { headers: { Authorization: `Bearer ${credentialToken}` } },
  );
  expect(cleanedPreferences.ok()).toBeTruthy();
  expect((await cleanedPreferences.json()).ui).toMatchObject({
    meanTaskDifficultyFilter: '',
    sortField: 'itemId',
  });

  const uploadInput = managerPage.locator('input[type="file"][accept=".csv"]');
  await Promise.all([
    managerPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/upload-item-parameters') &&
        response.ok(),
    ),
    uploadInput.setInputFiles({
      name: 'difficulty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('item;est\ni1;0.2\ni2;0.8'),
    }),
  ]);
  await expect(managerPage.getByRole('heading', { name: 'Upload Bericht' })).toBeVisible();
  await managerPage.getByRole('button', { name: /Schließen/ }).click();
  await publishExplorerDraft(managerPage);

  await page.reload();
  const restoredMeanFilter = page.getByPlaceholder('Mittlere Schwierigkeit: Min..Max');
  await expect(restoredMeanFilter).toBeVisible();
  await expect(restoredMeanFilter).toHaveValue('');
  await expect(page.getByText('0.5', { exact: true })).toHaveCount(2);

  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/login/);
  await loginWithCredential(page);
  await page.goto(`/view/${ACP_ID}/items`);
  await expect(page.getByPlaceholder('Mittlere Schwierigkeit: Min..Max')).toHaveValue('');
  await expect(page.getByText('0.5', { exact: true })).toHaveCount(2);

  const reloginToken = await page.evaluate(() => localStorage.getItem('cp_token'));
  const persistedPreferences = await request.get(
    `/api/view/acp/${ACP_ID}/items/preferences?viewId=item-list`,
    { headers: { Authorization: `Bearer ${reloginToken}` } },
  );
  expect(persistedPreferences.ok()).toBeTruthy();
  expect((await persistedPreferences.json()).ui).toMatchObject({
    meanTaskDifficultyFilter: '',
    sortField: 'itemId',
  });

  await managerContext.close();
});

test('paginates large personal collections and removes selections across pages', async ({
  page,
  request,
}) => {
  const login = await request.post('/api/auth/login', {
    data: { username: MANAGER_USERNAME, password: MANAGER_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).accessToken as string;
  await page.addInitScript((accessToken) => {
    localStorage.setItem('cp_token', accessToken);
    localStorage.setItem('cp_auth_type', 'local');
  }, token);

  const collectionId = '20000000-0000-4000-8000-000000000001';
  const rowKeys = Array.from({ length: 51 }, (_, index) => `missing-row-${index + 1}`);
  const summary = {
    rowCount: rowKeys.length,
    itemCount: 0,
    unitCount: 0,
    itemTimeSeconds: 0,
    stimulusTimeSeconds: 0,
    testTimeSeconds: 0,
    missingItemTimeCount: 0,
    missingStimulusTimeUnitCount: 0,
    complete: true,
  };
  let removePayload: { removeRowKeys?: string[]; rowKeys?: string[] } | null = null;
  await page.route(`**/api/view/acp/${ACP_ID}/items/collections**`, async (route) => {
    const browserRequest = route.request();
    const pathname = new URL(browserRequest.url()).pathname;
    if (browserRequest.method() === 'GET' && pathname.endsWith('/items/collections')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          activeCollectionId: collectionId,
          collectionViewMode: 'all',
          collections: [
            {
              id: collectionId,
              name: 'Große Auswahlliste',
              rowKeys,
              version: 1,
              createdAt: '2026-07-22T10:00:00.000Z',
              updatedAt: '2026-07-22T10:00:00.000Z',
              unavailableRowKeys: rowKeys,
              summary,
            },
          ],
        }),
      });
      return;
    }
    if (browserRequest.method() === 'PATCH' && pathname.endsWith('/rows')) {
      removePayload = browserRequest.postDataJSON();
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          collectionId,
          version: 2,
          updatedAt: '2026-07-22T10:01:00.000Z',
          summary: { ...summary, rowCount: 49 },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`/view/${ACP_ID}/item-explorer`);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const collectionDialog = page.getByRole('dialog', { name: 'Große Auswahlliste' });
  await expect(collectionDialog.locator('.collection-table tbody tr')).toHaveCount(50);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await collectionDialog.evaluate((dialog) => {
    const containedSelectors = [
      '.collection-modal-header',
      '.collection-modal-toolbar',
      '.collection-modal-actions',
      '.collection-modal-footer',
    ];
    const dialogRect = dialog.getBoundingClientRect();
    return {
      dialogLeft: dialogRect.left,
      dialogRight: dialogRect.right,
      viewportWidth: window.innerWidth,
      children: containedSelectors.map((selector) => {
        const element = dialog.querySelector<HTMLElement>(selector)!;
        const rect = element.getBoundingClientRect();
        return {
          selector,
          left: rect.left,
          right: rect.right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      }),
    };
  });
  expect(mobileLayout.dialogLeft).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.dialogRight).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  for (const child of mobileLayout.children) {
    expect(child.left, `${child.selector} starts outside the dialog`).toBeGreaterThanOrEqual(
      mobileLayout.dialogLeft,
    );
    expect(child.right, `${child.selector} ends outside the dialog`).toBeLessThanOrEqual(
      mobileLayout.dialogRight,
    );
    expect(child.scrollWidth, `${child.selector} overflows horizontally`).toBeLessThanOrEqual(
      child.clientWidth,
    );
  }
  await expect(collectionDialog.getByRole('searchbox')).toBeInViewport();
  await expect(collectionDialog.getByRole('button', { name: 'CSV exportieren' })).toBeInViewport();
  await expect(
    collectionDialog.getByRole('button', { name: 'Auswahlliste löschen' }),
  ).toBeInViewport();
  await expect(collectionDialog.getByRole('button', { name: 'Details schließen' })).toBeInViewport();

  await collectionDialog.getByRole('checkbox', { name: 'Eintrag 1 auswählen' }).check();
  await collectionDialog.getByRole('button', { name: 'Weiter' }).click();
  await expect(collectionDialog.getByText('Seite 2 von 2')).toBeVisible();
  await expect(collectionDialog.locator('.collection-table tbody tr')).toHaveCount(1);
  await collectionDialog.getByRole('checkbox', { name: 'Eintrag 51 auswählen' }).check();
  await expect(collectionDialog.getByText('2 ausgewählt')).toBeVisible();

  await collectionDialog.getByRole('button', { name: 'Ausgewählte entfernen (2)' }).click();
  const confirmation = page.locator('.collection-remove-confirmation');
  await expect(confirmation).toContainText(
    '2 Einträge aus der Auswahlliste „Große Auswahlliste“ entfernen?',
  );
  const confirmRemovalButton = confirmation.getByRole('button', {
    name: 'Entfernen',
    exact: true,
  });
  await expect(confirmRemovalButton).toBeFocused();
  await confirmRemovalButton.click();

  await expect.poll(() => removePayload).not.toBeNull();
  expect(removePayload).toMatchObject({
    removeRowKeys: ['missing-row-1', 'missing-row-51'],
  });
  expect(removePayload?.rowKeys).toBeUndefined();
  await expect(collectionDialog.getByText('Seite 1 von 1')).toBeVisible();
  await expect(collectionDialog.locator('.collection-table tbody tr')).toHaveCount(49);
});

test('keeps positions gapless and persists the personal selection view across perspectives', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const login = await request.post('/api/auth/login', {
    data: { username: MANAGER_USERNAME, password: MANAGER_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).accessToken as string;
  await page.addInitScript((accessToken) => {
    localStorage.setItem('cp_token', accessToken);
    localStorage.setItem('cp_auth_type', 'local');
  }, token);

  await page.goto(`/view/${ACP_ID}/item-explorer`);
  await expect(page.getByRole('columnheader', { name: 'Pos.' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Referenz-Nr/ })).toBeHidden();
  await expect(page.locator('tbody tr td.number-col')).toHaveText(['1', '2']);

  await page.getByRole('button', { name: /Referenznummern neu vergeben/ }).click();
  await expect(page.getByRole('heading', { name: 'Referenznummern neu vergeben' })).toBeVisible();
  await expect(page.getByText(/Alle 2 Zeilen des vollständigen Itembestands/)).toBeVisible();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/item-list/renumber') &&
        response.ok(),
    ),
    page.getByRole('button', { name: 'Referenznummern neu vergeben', exact: true }).last().click(),
  ]);
  await expect(page.getByText(/2 Referenznummern im vollständigen Itembestand/)).toBeVisible();

  await page.getByRole('button', { name: /Spalten verwalten/ }).click();
  await page.getByLabel(/Referenz-Nr/).check();
  await page
    .getByRole('button', { name: /Speichern/ })
    .last()
    .click();
  await expect(page.getByRole('columnheader', { name: /Referenz-Nr/ })).toBeVisible();
  await expect(page.locator('tbody tr td.number-col').nth(0)).toHaveText('1');
  await expect(page.locator('tbody tr td.number-col').nth(2)).toHaveText('2');

  const tableScroll = page.locator('.table-scroll');
  await tableScroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const [positionBox, referenceBox, itemIdBox] = await Promise.all([
    page.getByRole('columnheader', { name: 'Pos.' }).boundingBox(),
    page.getByRole('columnheader', { name: /Referenz-Nr/ }).boundingBox(),
    page.getByRole('columnheader', { name: /Item-ID/ }).boundingBox(),
  ]);
  expect(positionBox).not.toBeNull();
  expect(referenceBox).not.toBeNull();
  expect(itemIdBox).not.toBeNull();
  expect(positionBox!.x + positionBox!.width).toBeLessThanOrEqual(referenceBox!.x + 1);
  expect(referenceBox!.x + referenceBox!.width).toBeLessThanOrEqual(itemIdBox!.x + 1);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/items/collections') &&
        response.ok(),
    ),
    page.getByRole('button', { name: 'Neu', exact: true }).click(),
  ]);
  await expect(page.getByRole('button', { name: 'Nur Auswahlliste (0)' })).toBeEnabled();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes('/items/collections/') &&
        response.ok(),
    ),
    page
      .getByRole('checkbox', { name: /in Auswahlliste auswählen/ })
      .first()
      .check(),
  ]);
  const activeOnlyButton = page.getByRole('button', { name: 'Nur Auswahlliste (1)' });

  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const collectionDialog = page.getByRole('dialog', { name: 'Meine Auswahlliste' });
  await expect(collectionDialog).toBeVisible();
  const collectionSearch = collectionDialog.getByRole('searchbox', {
    name: 'Einträge der Auswahlliste durchsuchen',
  });
  await expect(collectionSearch).toBeFocused();
  await collectionSearch.fill('ohne-treffer');
  await expect(collectionDialog.getByText('Keine passenden Einträge.')).toBeVisible();
  await collectionSearch.clear();
  await collectionDialog.getByRole('checkbox', { name: 'Eintrag 1 auswählen' }).check();
  await collectionDialog.getByRole('button', { name: 'Ausgewählte entfernen (1)' }).click();
  const [removeResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith('/rows') &&
        response.ok(),
    ),
    page
      .locator('.collection-remove-confirmation')
      .getByRole('button', { name: 'Entfernen', exact: true })
      .click(),
  ]);
  const removePayload = removeResponse.request().postDataJSON();
  expect(removePayload.removeRowKeys).toHaveLength(1);
  expect(removePayload.rowKeys).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Nur Auswahlliste (0)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(collectionDialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeFocused();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith('/rows') &&
        response.ok(),
    ),
    page
      .getByRole('checkbox', { name: /in Auswahlliste auswählen/ })
      .first()
      .check(),
  ]);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().endsWith('/items/collections/active') &&
        response.ok(),
    ),
    activeOnlyButton.click(),
  ]);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Nur Auswahlliste (1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('tbody tr')).toHaveCount(1);

  const editingViewButton = page.getByRole('button', { name: 'Bearbeitungsansicht' });
  if (await editingViewButton.isVisible()) {
    await editingViewButton.click();
  }
  const readOnlyPreviewButton = page.getByRole('button', { name: 'READ ONLY-Vorschau' });
  await expect(readOnlyPreviewButton).toBeVisible();
  await readOnlyPreviewButton.click();
  await expect(page.getByRole('button', { name: 'Bearbeitungsansicht' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nur Auswahlliste (1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await page.getByRole('button', { name: 'Alle Items' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);

  await page.getByRole('button', { name: 'Bearbeitungsansicht' }).click();
  const discardButton = page.getByRole('button', { name: /Verwerfen/ }).first();
  await expect(discardButton).toBeEnabled();
  await discardButton.click();
  await page.getByRole('button', { name: 'Änderungen verwerfen', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: /Referenz-Nr/ })).toBeHidden();
});
