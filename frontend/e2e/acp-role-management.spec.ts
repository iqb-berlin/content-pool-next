import { expect, test } from '@playwright/test';
import { installOidcSession } from './oidc-test-session';

const acpId = '10000000-0000-4000-8000-000000000201';
const managerId = '10000000-0000-4000-8000-000000000002';

test('aligns roles and supports inline changes, errors, adding and removing people', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installOidcSession(page, managerId, 'e2e-manager');
  const users = [
    { id: managerId, displayName: 'Alex' },
    { id: 'second', displayName: 'Person mit einem deutlich längeren Anzeigenamen' },
    { id: 'third', displayName: 'Neue Person' },
  ];
  const roles = users
    .slice(0, 2)
    .map((user) => ({ id: user.id, userId: user.id, role: 'ACP_MANAGER', user }));
  let failSave = true;
  const writes: object[] = [];
  await page.route(`**/api/acp/${acpId}/roles`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: roles });
    const data = route.request().postDataJSON();
    writes.push(data);
    return failSave
      ? route.fulfill({
          status: 400,
          json: { message: 'At least one ACP_MANAGER must remain assigned' },
        })
      : route.fulfill({ json: { id: data.userId, ...data } });
  });
  await page.route(`**/api/acp/${acpId}/assignable-users`, (route) =>
    route.fulfill({ json: users }),
  );
  await page.route(`**/api/acp/${acpId}/roles/third`, (route) => route.fulfill({ status: 204 }));
  await page.goto(`/manage/${acpId}`);
  const section = page.getByRole('region', { name: 'Rollenzuweisungen' });
  const rows = section.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  const bounds = await section
    .locator('tbody select')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
  expect(Math.abs(bounds[0] - bounds[1])).toBeLessThan(1);
  const row = rows.filter({ hasText: users[1].displayName });
  await expect(row.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  await row.getByRole('combobox').selectOption('READ_ONLY');
  await row.getByRole('button', { name: 'Speichern' }).click();
  await expect(section.getByRole('alert')).toContainText('Mindestens ein ACP-Manager');
  await expect(row.getByRole('combobox')).toHaveValue('READ_ONLY');
  await expect(row.getByRole('button', { name: 'Speichern' })).toBeEnabled();
  failSave = false;
  await row.getByRole('button', { name: 'Speichern' }).click();
  await expect(section.getByRole('status')).toHaveText('Rolle gespeichert.');
  await expect(row.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  expect(writes.at(-1)).toEqual({ userId: 'second', role: 'READ_ONLY' });
  const add = section.locator('.add-person');
  await expect(add.getByLabel('Person', { exact: true }).locator('option')).toHaveCount(2);
  await add.getByLabel('Person', { exact: true }).selectOption('third');
  await add.getByRole('button', { name: 'Hinzufügen' }).click();
  await expect(rows).toHaveCount(3);
  await expect(add).toContainText('Alle verfügbaren Personen sind bereits zugewiesen.');
  await rows.filter({ hasText: 'Neue Person' }).getByRole('button', { name: 'Entfernen' }).click();
  await expect(rows).toHaveCount(2);
  await expect(
    add.getByLabel('Person', { exact: true }).locator('option[value="third"]'),
  ).toHaveCount(1);
  await testInfo.attach('role-management', {
    body: await section.screenshot(),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row.getByRole('combobox')).toBeVisible();
  await testInfo.attach('role-management-narrow', {
    body: await section.screenshot(),
    contentType: 'image/png',
  });
});
