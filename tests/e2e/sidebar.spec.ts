import { expect, test } from './fixtures';

test('toggles the sidebar with the keyboard and remembers it across pages and reloads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1543, height: 836 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const sidebar = page.locator('#app-sidebar');
  const main = page.getByRole('main');
  await expect(sidebar).toBeVisible();
  expect((await main.boundingBox())?.x).toBe(228);

  const hide = page.getByRole('button', { name: 'Hide sidebar', exact: true });
  await hide.focus();
  await hide.press('Enter');
  const show = page.getByRole('button', { name: 'Show sidebar', exact: true });
  await expect(show).toBeFocused();
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).toBeHidden();
  expect((await main.boundingBox())?.x).toBe(0);
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('The little things');
  await expect(sidebar).toBeHidden();
  await page.reload();
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).toBeHidden();
  await page.screenshot({ path: 'test-results/sidebar-editor-hidden-dark.png', fullPage: true });

  await page.getByRole('button', { name: 'Text item', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add text item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'My projects', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate The little things', exact: true }).click();
  const notice = page.getByRole('status').filter({ hasText: 'Project duplicated.' });
  await expect(notice).toBeVisible();
  const bounds = await notice.boundingBox();
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(bounds!.x + bounds!.width / 2).toBeCloseTo(width / 2, 0);

  await show.focus();
  await show.press('Space');
  await expect(hide).toBeFocused();
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).toBeVisible();
  expect((await main.boundingBox())?.x).toBe(228);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(hide).toBeVisible();
  await hide.click();
  await page.reload();
  await expect(show).toBeVisible();
  await expect(sidebar).toBeHidden();
  await show.click();
  await page.reload();
  await expect(sidebar).toBeVisible();
});

test('keeps the editor usable with either sidebar state at mobile and desktop widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const sidebar = page.locator('#app-sidebar');
  const main = page.getByRole('main');
  const hide = page.getByRole('button', { name: 'Hide sidebar', exact: true });
  const show = page.getByRole('button', { name: 'Show sidebar', exact: true });
  await expect(sidebar).toBeVisible();
  await hide.click();
  await expect(sidebar).toBeHidden();
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('The little things');
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/sidebar-editor-hidden-mobile.png', fullPage: true });

  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(sidebar).toBeHidden();
    expect((await main.boundingBox())?.x).toBe(0);
  }
  await show.click();
  expect((await main.boundingBox())?.x).toBe(228);
  await page.setViewportSize({ width: 1024, height: 900 });
  expect((await main.boundingBox())?.x).toBe(198);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(sidebar).toBeVisible();
  expect((await main.boundingBox())?.x).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await hide.click();
  await expect(show).toBeVisible();
  await expect(sidebar).toBeHidden();
});
