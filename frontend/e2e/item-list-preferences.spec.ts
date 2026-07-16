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
