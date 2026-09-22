import { expect, test } from '@playwright/test';
import { installOidcSession } from './oidc-test-session';

const baseAcp = '10000000-0000-4000-8000-000000000001';
const regressionAcp = '10000000-0000-4000-8000-000000000101';
const filesAcp = '10000000-0000-4000-8000-000000000301';
const snapshotsAcp = '10000000-0000-4000-8000-000000000302';
const reviewAcp = '10000000-0000-4000-8000-000000000303';
const managerId = '10000000-0000-4000-8000-000000000002';

test('credential access cannot cross into ACP management or another private ACP', async ({
  page,
}) => {
  await page.goto(`/credential-login/${baseAcp}`);
  await page.getByLabel('Benutzername').fill('e2e-reviewer');
  await page.getByLabel('Kennwort').fill('Reviewer-E2E-123!');
  await page.getByRole('button', { name: 'Zugang öffnen' }).click();
  await expect(page).toHaveURL(`/view/${baseAcp}`);
  await page.goto(`/manage/${baseAcp}`);
  await expect(page.getByRole('heading', { name: 'Kein Zugriff' })).toBeVisible();
  await expect(page.locator('a[href^="/manage/"]')).toHaveCount(0);
  const token = await page.evaluate(() => localStorage.getItem('cp_token'));
  expect(token).toBeTruthy();
  const otherAcp = await page.request.get(`/api/view/acp/${regressionAcp}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(otherAcp.status()).toBe(403);
});

test('item deep link shows its unit and unknown item state', async ({ page }) => {
  await installOidcSession(page, managerId, 'e2e-manager');
  await page.goto(`/view/${regressionAcp}/item/u1_i1`);
  await expect(page.getByRole('heading', { name: 'Item: Direkter Zustand' })).toBeVisible();
  await expect(page.locator('.item-highlight-info')).toContainText('Regression Aufgabe 1');
  await expect(page.locator('iframe.player-iframe')).toBeVisible();
  await page.goto(`/view/${regressionAcp}/item/does-not-exist`);
  await expect(page.getByRole('heading', { name: 'Item nicht gefunden' })).toBeVisible();
});

test('file upload completes processing and the uploaded file can be downloaded', async ({
  page,
}) => {
  await installOidcSession(page, managerId, 'e2e-manager');
  await page.goto(`/manage/${filesAcp}/files`);
  await expect(page.getByRole('heading', { name: 'Dateien' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'browser-e2e-note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Isolated browser E2E upload.\n'),
  });
  await expect(page.getByText(/Auto-Validierung:/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('tbody tr').filter({ hasText: 'browser-e2e-note.txt' })).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page
    .locator('tbody tr')
    .filter({ hasText: 'browser-e2e-note.txt' })
    .getByRole('link', { name: /Download/ })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('browser-e2e-note.txt');
  await page.reload();
  await expect(page.locator('tbody tr').filter({ hasText: 'browser-e2e-note.txt' })).toHaveCount(1);
});

test('snapshot diff, cancelled restore and confirmed restore track an index change', async ({
  page,
}) => {
  await installOidcSession(page, managerId, 'e2e-manager');
  await page.goto(`/manage/${snapshotsAcp}`);
  await page.locator('details.index-section summary').click();
  await page.getByRole('button', { name: 'JSON anzeigen' }).click();
  const index = JSON.parse(
    await page.getByRole('dialog', { name: 'ACP-Index als JSON' }).locator('pre').innerText(),
  );
  await page
    .getByRole('dialog', { name: 'ACP-Index als JSON' })
    .getByRole('button', { name: 'Schließen' })
    .click();

  await page.goto(`/manage/${snapshotsAcp}/snapshots`);
  await page.getByRole('button', { name: '+ Snapshot erstellen' }).click();
  await page.getByPlaceholder('Änderungen beschreiben...').fill('Vor Indexänderung');
  await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
  const snapshot = page.locator('tbody tr').filter({ hasText: 'Vor Indexänderung' });
  await expect(snapshot).toBeVisible();

  index.assessmentParts[0].name = 'Geänderter E2E-Abschnitt';
  await page.goto(`/manage/${snapshotsAcp}`);
  await page.locator('details.index-section summary').click();
  await page.locator('details.index-section input[type=file]').setInputFiles({
    name: 'index.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(index)),
  });
  await expect(page.getByText('ACP-Index wurde importiert.', { exact: true })).toBeVisible();
  await page.goto(`/manage/${snapshotsAcp}/snapshots`);
  const changedSnapshot = page.locator('tbody tr').filter({ hasText: 'Vor Indexänderung' });
  await changedSnapshot.getByRole('button', { name: 'Diff zum aktuellen Stand' }).click();
  await expect(page.getByText('ACP-Index geändert:')).toBeVisible();
  await expect(page.getByText('ACP-Index geändert:').locator('..')).toContainText('Ja');
  await changedSnapshot.getByRole('button', { name: 'Wiederherstellen' }).click();
  const confirmation = page.locator('app-confirm-dialog .dialog');
  await confirmation.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByText('ACP-Index geändert:').locator('..')).toContainText('Ja');
  await changedSnapshot.getByRole('button', { name: 'Wiederherstellen' }).click();
  await confirmation.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(page.getByText(/Snapshot v1 wurde wiederhergestellt/)).toBeVisible();
  await changedSnapshot.getByRole('button', { name: 'Diff zum aktuellen Stand' }).click();
  await expect(page.getByText('ACP-Index geändert:').locator('..')).toContainText('Nein');
});

test('review booklet, readiness, group member and activation survive reload', async ({ page }) => {
  await installOidcSession(page, managerId, 'e2e-manager');
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`/view/${reviewAcp}/review/manage`);
  await expect(page.getByText('review-e2e', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bereitschaft prüfen' }).click();
  await expect(page.locator('.readiness-card')).toContainText('1 Testhefte');
  await expect(page.locator('.readiness-card')).not.toContainText('Blockiert');
  await page.getByRole('button', { name: 'Review-Gruppe hinzufügen' }).click();
  const group = page.locator('details.review-group').last();
  await group.getByRole('textbox', { name: 'Name' }).fill('E2E Review-Gruppe');
  await group.getByRole('checkbox', { name: 'E2E Viewer' }).check();
  await page.getByRole('button', { name: 'Review-Konfiguration speichern' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Review für Teilnehmende aktivieren' }).check();
  await page.getByRole('button', { name: 'Einstellungen speichern' }).click();
  await expect(page.locator('.review-status')).toContainText('Aktiv');
  await page.reload();
  await expect(page.locator('.review-status')).toContainText('Aktiv');
  const savedGroup = page.locator('details.review-group').filter({ hasText: 'E2E Review-Gruppe' });
  await expect(savedGroup).toBeVisible();
  await savedGroup.locator('summary').first().click();
  await expect(savedGroup.getByRole('checkbox', { name: 'E2E Viewer' })).toBeChecked();
});
