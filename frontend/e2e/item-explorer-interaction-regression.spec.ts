import { expect, Page, test } from '@playwright/test';
import { createOidcAppToken, installOidcSession } from './oidc-test-session';

const ACP_ID = '10000000-0000-4000-8000-000000000201';
const MANAGER_ID = '10000000-0000-4000-8000-000000000002';

async function openExplorer(page: Page) {
  const headers = { Authorization: `Bearer ${createOidcAppToken(MANAGER_ID, 'e2e-manager')}` };
  const accessUrl = `/api/acp/${ACP_ID}/access`;
  const accessResponse = await page.request.get(accessUrl, { headers });
  expect(accessResponse.ok()).toBeTruthy();
  const access = await accessResponse.json();
  const update = await page.request.put(accessUrl, {
    headers,
    data: {
      accessModel: access.accessModel,
      allowRegistered: access.allowRegistered,
      featureConfig: { ...access.featureConfig, enableItemCollections: true },
    },
  });
  expect(update.ok()).toBeTruthy();
  await installOidcSession(page, MANAGER_ID, 'e2e-manager');
  await page.goto(`/view/${ACP_ID}/item-explorer`);
  await expect(page.locator('.collection-management summary')).toBeVisible();
  await page.locator('input[placeholder="🔍 Items filtern..."]').clear();
  await expect(page.locator('.explorer-table tbody tr').first()).toBeVisible();
}

test('shrinks narrow metadata immediately with keyboard and pointer after resizing the viewport', async ({
  page,
}, info) => {
  await openExplorer(page);
  await page.locator('.explorer-table tbody tr').first().click();
  await page.getByRole('button', { name: 'Metadaten', exact: true }).click();
  const drawer = page.locator('.drawer-container');
  const handle = page.getByRole('separator', { name: 'Breite der Metadaten ändern' });
  await handle.hover();
  await page.setViewportSize({ width: 390, height: 844 });
  await handle.focus();
  await handle.press('ArrowRight');
  await expect(drawer).toHaveCSS('width', '350px');
  await expect(handle).toHaveAttribute('aria-valuenow', '350');
  await handle.press('ArrowLeft');
  await expect(drawer).toHaveCSS('width', '390px');
  await handle.hover();
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 4, bounds!.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 44, bounds!.y + 100);
  await page.mouse.up();
  await expect(drawer).toHaveCSS('width', '350px');
  await page.screenshot({ path: info.outputPath('narrow-metadata.png'), fullPage: true });
});

test('keeps global save shortcuts out of a pending native dialog even when focus leaves its disabled controls', async ({
  page,
}, info) => {
  await openExplorer(page);
  await page
    .locator('input[placeholder="🔍 Items filtern..."]')
    .fill(`Pending ${info.project.name}`);
  await expect(
    page.getByRole('button', { name: 'Änderungen prüfen …', exact: true }),
  ).toBeEnabled();
  await page.locator('.collection-management summary').click();
  await page
    .locator('.collection-management-actions')
    .getByRole('button', { name: 'Neu', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Neue Auswahlliste' });
  await dialog.getByLabel('Name der Auswahlliste').fill(`Pending ${info.project.name}`);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/items/collections', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests++;
    await gate;
    await route.continue();
  });
  try {
    await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(dialog.getByLabel('Name der Auswahlliste')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    for (const shortcut of ['Control+s', 'Meta+s']) {
      await page.keyboard.press(shortcut);
      await expect(
        page.getByRole('heading', { name: 'Änderungsübersicht vor Speichern' }),
      ).toHaveCount(0);
    }
    // Model the body-targeted event seen when browsers blur disabled modal controls.
    for (const modifier of ['ctrlKey', 'metaKey']) {
      const prevented = await page.evaluate(
        (key) =>
          !document.body.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 's',
              [key]: true,
              bubbles: true,
              cancelable: true,
            }),
          ),
        modifier,
      );
      expect(prevented).toBe(true);
      await expect(
        page.getByRole('heading', { name: 'Änderungsübersicht vor Speichern' }),
      ).toHaveCount(0);
    }
    await page.screenshot({ path: info.outputPath('pending-dialog.png'), fullPage: true });
  } finally {
    release();
  }
  await expect(dialog).toBeHidden();
  expect(requests).toBe(1);
});
