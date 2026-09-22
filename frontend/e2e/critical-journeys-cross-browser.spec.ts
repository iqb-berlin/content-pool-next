import { expect, test } from '@playwright/test';
import { installOidcSession } from './oidc-test-session';

const credentialAcp = '10000000-0000-4000-8000-000000000001';
const unitAcp = '10000000-0000-4000-8000-000000000101';
const managerId = '10000000-0000-4000-8000-000000000002';
const explorerAcps: Record<string, string> = {
  chromium: '10000000-0000-4000-8000-000000000304',
  firefox: '10000000-0000-4000-8000-000000000305',
  webkit: '10000000-0000-4000-8000-000000000306',
};

test('credential login rejects a bad password and survives reload after a valid login', async ({
  page,
}) => {
  await page.goto(`/credential-login/${credentialAcp}`);
  await page.getByLabel('Benutzername').fill('e2e-reviewer');
  await page.getByLabel('Kennwort').fill('incorrect-password');
  await page.getByRole('button', { name: 'Zugang öffnen' }).click();
  await expect(page.locator('.alert-error')).toBeVisible();
  await expect(page).toHaveURL(`/credential-login/${credentialAcp}`);

  await page.getByLabel('Kennwort').fill('Reviewer-E2E-123!');
  await page.getByRole('button', { name: 'Zugang öffnen' }).click();
  await expect(page).toHaveURL(`/view/${credentialAcp}`);
  await expect(page.getByRole('link', { name: /Item-Explorer/ })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(`/view/${credentialAcp}`);
  await expect(page.getByRole('link', { name: /Item-Explorer/ })).toBeVisible();
});

test('unit list, player and page mode work through navigation and reload', async ({ page }) => {
  await installOidcSession(page, managerId, 'e2e-manager');
  await page.goto(`/view/${unitAcp}/units`);
  await expect(page.getByRole('heading', { name: 'Aufgaben' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.locator('tbody tr').first().getByRole('link', { name: 'Ansehen' }).click();
  await expect(page).toHaveURL(`/view/${unitAcp}/unit/u1`);
  await expect(page.getByRole('heading', { name: 'Regression Aufgabe 1' })).toBeVisible();
  await expect(page.locator('iframe.player-iframe')).toBeVisible();
  const mode = page.getByRole('combobox', { name: 'Seitendarstellung der Aufgabe' });
  await mode.selectOption('separate');
  await expect(mode).toHaveValue('separate');
  await page.reload();
  await expect(page.locator('iframe.player-iframe')).toBeVisible();
  await expect(mode).toBeVisible();
});

test('coding draft, publish and reader perspective remain consistent', async ({
  page,
}, testInfo) => {
  const acpId = explorerAcps[testInfo.project.name];
  expect(acpId).toBeTruthy();
  await installOidcSession(page, managerId, 'e2e-manager');
  await page.goto(`/view/${acpId}/item-explorer`);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await page.locator('#item-explorer-row-regression-item-uuid-1').click();
  await expect(page.locator('iframe.player-iframe')).toBeVisible();
  await page.getByRole('button', { name: 'Kodierung', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kodiervariable V1' })).toBeVisible();
  await page.getByRole('button', { name: /Schließen/ }).click();

  await page.getByText('Vorschau einstellen ▾', { exact: true }).click();
  await page.getByText('Zuordnung korrigieren …', { exact: true }).click();
  await page.getByLabel('Manuelles Sprungziel').fill('V2');
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByText(/Manueller Override aktiv:/)).toContainText('V2');
  await page.getByRole('button', { name: 'Leseansicht' }).click();
  await expect(page.getByText(/unveröffentlichter Explorer-Entwurf/)).toBeVisible();
  await page.getByRole('button', { name: 'Bearbeitungsansicht' }).click();
  await page.getByRole('button', { name: 'Änderungen prüfen …' }).click();
  await expect(
    page.getByRole('heading', { name: 'Änderungsübersicht vor Speichern' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(page.locator('.status-pill')).toContainText(/Gespeichert|Unverändert/);
  await page.getByRole('button', { name: 'Leseansicht' }).click();
  await expect(page.getByText(/unveröffentlichter Explorer-Entwurf/)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(6);
});
