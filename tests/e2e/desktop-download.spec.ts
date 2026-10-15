import { getPublicRepositoryLinks } from '../../src/app/distribution';
import { expect, test } from './fixtures';

const links = getPublicRepositoryLinks(process.env.VITE_PUBLIC_REPOSITORY_URL);

test('desktop downloads explain project transfer and use the configured public release', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Download desktop', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Download desktop', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Tier Studio for Windows' })).toBeVisible();
  await expect(dialog.getByText('Your browser and desktop libraries are separate.')).toBeVisible();
  await expect(dialog.getByText('Import the .tier file in the desktop app.')).toBeVisible();
  if (links) {
    const download = dialog.getByRole('link', { name: /Download for Windows/ });
    await expect(download).toHaveAttribute('href', links.windowsInstaller);
    await expect(download).toHaveAttribute('target', '_blank');
    await expect(download).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(dialog.getByRole('link', { name: /Release notes/ })).toHaveAttribute(
      'href',
      links.releases,
    );
    await expect(dialog.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'href',
      links.repository,
    );
  } else {
    await expect(dialog.getByRole('button', { name: 'Downloads coming soon' })).toBeDisabled();
    await expect(dialog.getByRole('link')).toHaveCount(0);
    await expect(page.locator('#app-sidebar').getByRole('link', { name: /GitHub/ })).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  if (links) {
    await expect(
      page.locator('#app-sidebar').getByRole('link', { name: /GitHub/ }),
    ).toHaveAttribute('href', links.repository);
  }
});

test('desktop downloads remain available in Settings on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Download desktop', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Download desktop', exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
