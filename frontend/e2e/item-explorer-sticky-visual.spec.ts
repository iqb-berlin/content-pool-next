import { expect, Page, test } from '@playwright/test';
import { installOidcSession } from './oidc-test-session';

const ACP_ID = '10000000-0000-4000-8000-000000000201';
const MANAGER_ID = '10000000-0000-4000-8000-000000000002';
const MANAGER_USERNAME = 'e2e-manager';

async function openExplorer(page: Page): Promise<void> {
  await installOidcSession(page, MANAGER_ID, MANAGER_USERNAME);
  await page.goto(`/view/${ACP_ID}/item-explorer`);
  await expect(page.getByRole('heading', { name: 'Item-Explorer' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
}

test('keeps sticky cells opaque and paints the complete selected row while scrolling', async ({
  page,
}, testInfo) => {
  await openExplorer(page);

  await page.getByRole('button', { name: /Spalten verwalten/ }).click();
  const columnDialog = page
    .getByRole('heading', { name: 'Spalten verwalten' })
    .locator('xpath=ancestor::div[contains(@class, "column-manager-dialog")]');
  const resetButton = columnDialog.getByRole('button', { name: /Standard/ });
  if (await resetButton.isEnabled()) {
    await resetButton.click();
  }
  await columnDialog.getByRole('button', { name: /Speichern/ }).click();
  await expect(columnDialog).toHaveCount(0);

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
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
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
  await testInfo.attach(`sticky-selected-row-${testInfo.project.name}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
