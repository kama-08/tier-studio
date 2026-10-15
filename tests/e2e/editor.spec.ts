import { expect, test } from './fixtures';
import { readFile } from 'node:fs/promises';

test('creates, edits, saves, exports, and imports a project with its image', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Weekend favorites');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('Weekend favorites');
  await page.getByRole('button', { name: 'Text item', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Coffee');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Coffee', exact: true }).click();
  await page.getByRole('button', { name: 'Move to S', exact: true }).click();
  await expect(
    page.getByTestId('tier-0').getByRole('button', { name: 'Drag Coffee', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByTestId('unranked-pool').getByRole('button', { name: 'Drag Coffee', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#a6b789';
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Choose images', { exact: true }).setInputFiles({
    name: 'Green.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(
    page.getByRole('button', { name: 'Drag Green', exact: true }).getByRole('img'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Options for Green', exact: true }).click();
  await page.getByRole('button', { name: 'Move to A', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('Weekend favorites');
  await expect(
    page.getByTestId('tier-0').getByRole('button', { name: 'Drag Coffee', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Drag Green', exact: true }).getByRole('img'),
  ).toBeVisible();
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const pngExport = await pngDownload;
  expect(pngExport.suggestedFilename()).toBe('Weekend-favorites.png');
  const imageBytes = await readFile((await pngExport.path())!);
  expect([...imageBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(imageBytes.readUInt32BE(16)).toBeGreaterThan(0);
  expect(imageBytes.readUInt32BE(20)).toBeGreaterThan(0);
  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const exported = await projectDownload;
  expect(exported.suggestedFilename()).toBe('Weekend-favorites.tier');
  const path = await exported.path();
  await page.getByRole('link', { name: 'My projects', exact: true }).last().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (await chooser).setFiles(path!);
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('Weekend favorites');
  await expect(
    page.getByRole('button', { name: 'Drag Green', exact: true }).getByRole('img'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('drags an item into an empty tier and cancels a later drag without changing history', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  await page.screenshot({ path: 'test-results/preview-editor.png', fullPage: true });
  const tile = page.getByRole('button', { name: 'Drag Warm cookies', exact: true });
  await tile.scrollIntoViewIfNeeded();
  const start = await tile.boundingBox();
  const target = await page.getByTestId('tier-3').boundingBox();
  expect(start).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(start!.x + 35, start!.y + 35);
  await page.mouse.down();
  await page.mouse.move(start!.x + 45, start!.y + 35, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.move(target!.x + 55, target!.y + 45, { steps: 20 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect(
    page.getByTestId('tier-3').getByRole('button', { name: 'Drag Warm cookies', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page
      .getByTestId('unranked-pool')
      .getByRole('button', { name: 'Drag Warm cookies', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await tile.scrollIntoViewIfNeeded();
  const nextStart = await tile.boundingBox();
  const nextTarget = await page.getByTestId('tier-3').boundingBox();
  await page.mouse.move(nextStart!.x + 35, nextStart!.y + 35);
  await page.mouse.down();
  await page.mouse.move(nextTarget!.x + 55, nextTarget!.y + 45, { steps: 20 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(
    page
      .getByTestId('unranked-pool')
      .getByRole('button', { name: 'Drag Warm cookies', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('renders the library on a narrow screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good taste. Your rules.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/preview-library-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('The little things');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/preview-editor-mobile.png', fullPage: true });
});
