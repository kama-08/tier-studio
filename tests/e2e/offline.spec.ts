import { expect, test } from './fixtures';

test('reopens and edits a saved project while the production app is offline', async ({
  page,
  context,
}) => {
  test.skip(!process.env.TEST_PRODUCTION, 'The service worker is only enabled in production.');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good taste. Your rules.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/preview-library.png', fullPage: true });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByLabel('Project title', { exact: true })).toHaveValue(
      'The little things',
    );
    await page.getByRole('button', { name: 'Text item', exact: true }).click();
    await page.getByLabel('Item name', { exact: true }).fill('Offline favorite');
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Customize', exact: true }).click();
    await page.getByRole('slider', { name: 'Item size', exact: true }).press('Home');
    await page.getByLabel('Style name', { exact: true }).fill('Offline compact');
    await page.getByRole('button', { name: 'Save style', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    await page.goto('/');
    await page.getByRole('link', { name: 'Open The little things', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Drag Offline favorite', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('unranked-pool').locator('.item-tile').first()).toHaveCSS(
      'width',
      '48px',
    );
    await page.getByRole('button', { name: 'Customize', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Offline compact', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    expect((await downloading).suggestedFilename()).toBe('The-little-things.png');
  } finally {
    await context.setOffline(false);
  }
});
