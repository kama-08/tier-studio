import { expect, test } from './fixtures';

test('keeps a selected theme across pages, dialogs, and reloads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/theme-settings-dark.png', fullPage: true });
  await page.getByRole('link', { name: 'My projects', exact: true }).click();
  await page.screenshot({ path: 'test-results/theme-library-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/theme-dialog-dark.png' });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('The little things');
  const tierColor = await page
    .getByRole('button', { name: 'Edit tier S', exact: true })
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.screenshot({ path: 'test-results/theme-editor-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page
      .getByRole('button', { name: 'Edit tier S', exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(tierColor);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});

test('follows system changes and synchronizes explicit preferences between tabs', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const second = await context.newPage();
  await second.goto('/settings');
  await expect(second.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await second.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await second.close();
  await page.getByRole('radio', { name: 'System', exact: true }).check();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/theme-settings-mobile-dark.png', fullPage: true });
});
