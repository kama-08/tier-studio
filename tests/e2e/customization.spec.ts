import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';

async function openSample(page: Page) {
  await page.setViewportSize({ width: 1454, height: 1000 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
}
async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Customize list', exact: true })).toBeVisible();
}
async function closePanel(page: Page) {
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Customize list', exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeFocused();
}
async function endRange(page: Page, label: string, end: 'Home' | 'End') {
  await page.getByRole('slider', { name: label, exact: true }).press(end);
}
const firstTile = (page: Page) => page.getByTestId('tier-0').locator('.item-tile').first();

test('customizations preview live, group a slider gesture into one undo, persist, and reuse across projects', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSample(page);
  await openPanel(page);
  const slider = page.getByRole('slider', { name: 'Item size', exact: true });
  await slider.focus();
  for (let index = 0; index < 4; index++) await page.keyboard.down('ArrowRight');
  await expect(slider).toHaveValue('96');
  await expect(firstTile(page)).toHaveCSS('width', '96px');
  await page.keyboard.up('ArrowRight');
  await closePanel(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(firstTile(page)).toHaveCSS('width', '92px');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(firstTile(page)).toHaveCSS('width', '96px');

  await openPanel(page);
  await page
    .getByRole('button', { name: 'Compact Small tiles, less spacing', exact: true })
    .click();
  await expect(firstTile(page)).toHaveCSS('width', '64px');
  await page.getByRole('button', { name: 'Use Vibrant colors', exact: true }).click();
  await page.getByLabel('Tint rows with tier colors', { exact: true }).check();
  await page.getByLabel('Row borders', { exact: true }).selectOption('dashed');
  await endRange(page, 'Label width', 'End');
  await endRange(page, 'Label font size', 'End');
  await page.getByRole('button', { name: 'Align labels left', exact: true }).click();
  await page.getByLabel('Bold labels', { exact: true }).uncheck();
  await page.getByLabel('Image fitting', { exact: true }).selectOption('contain');
  await endRange(page, 'Corner radius', 'End');
  await page.getByLabel('Item borders', { exact: true }).check();
  await page.getByLabel('Item shadows', { exact: true }).uncheck();
  await expect(firstTile(page)).toHaveCSS('border-radius', '32px');
  await expect(firstTile(page)).toHaveCSS('outline-style', 'solid');
  await expect(firstTile(page)).toHaveCSS('box-shadow', 'none');
  await expect(page.locator('.tier-label').first()).toHaveCSS('width', '200px');
  await expect(page.locator('.tier-label > span').first()).toHaveCSS('font-size', '40px');
  await expect(page.locator('.tier-label > span').first()).toHaveCSS('text-align', 'left');
  await expect(page.locator('.tier-label > span').first()).toHaveCSS('font-weight', '400');
  await expect(page.locator('.tier-row').first()).toHaveCSS('border-style', 'dashed');
  const tintedColor = await page
    .locator('.tier-row')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(tintedColor).not.toBe('rgb(39, 39, 42)');
  await page.getByLabel('Style name', { exact: true }).fill('My compact style');
  await page.getByRole('button', { name: 'Save style', exact: true }).click();
  await expect(page.getByText('Style saved on this device.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('customize-desktop.png') });
  await closePanel(page);
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(firstTile(page)).toHaveCSS('width', '64px');
  await expect(firstTile(page)).toHaveCSS('border-radius', '32px');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const savedProject = await downloading;
  await page.getByRole('link', { name: 'My projects', exact: true }).last().click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Reuse style');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await openPanel(page);
  await page.getByRole('button', { name: 'My compact style', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Item size', exact: true })).toHaveValue('64');
  await expect(page.getByLabel('Image fitting', { exact: true })).toHaveValue('contain');
  await expect(page.locator('.tier-label').first()).toHaveCSS(
    'background-color',
    'rgb(251, 113, 133)',
  );
  await page.getByRole('button', { name: 'Reset style', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Item size', exact: true })).toHaveValue('92');
  await page.getByRole('button', { name: 'Delete style My compact style', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My compact style', exact: true })).toHaveCount(0);
  await closePanel(page);
  await page.getByRole('link', { name: 'My projects', exact: true }).last().click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (await choosing).setFiles((await savedProject.path())!);
  await expect(firstTile(page)).toHaveCSS('width', '64px');
  await expect(firstTile(page)).toHaveCSS('border-radius', '32px');

  await page.setViewportSize({ width: 390, height: 844 });
  await openPanel(page);
  await endRange(page, 'Item size', 'End');
  await endRange(page, 'Tier padding', 'End');
  await endRange(page, 'Item spacing', 'End');
  await page.screenshot({ path: testInfo.outputPath('customize-mobile.png') });
  expect(
    await page
      .getByRole('dialog', { name: 'Customize list', exact: true })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await closePanel(page);
  // The app's existing minimum supported viewport is 360px.
  for (const width of [390, 360, 700, 1454]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page
          .locator('.tier-drop-area')
          .evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth)),
      )
      .toBe(true);
    const viewport = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll('*'))
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
        .map((el) => ({
          tag: el.tagName,
          className: el.className,
          width: el.getBoundingClientRect().width,
          right: el.getBoundingClientRect().right,
        }))
        .slice(0, 15),
    }));
    expect(viewport.scrollWidth, JSON.stringify(viewport)).toBeLessThanOrEqual(width);
  }
  expect(errors).toEqual([]);
});

test('PNG exports apply image fit, rounded corners, row tints, transparency, and optional sections', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await openSample(page);
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, 0, 160, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page
    .getByLabel('Choose images', { exact: true })
    .setInputFiles([
      { name: 'Red.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') },
    ]);
  await page.getByRole('button', { name: 'Options for Red', exact: true }).click();
  await page.getByRole('button', { name: 'Move to A', exact: true }).click();
  await openPanel(page);
  await page.getByLabel('Image fitting', { exact: true }).selectOption('contain');
  await page.getByLabel('Tint rows with tier colors', { exact: true }).check();
  await endRange(page, 'Corner radius', 'End');
  await page.getByLabel('Item shadows', { exact: true }).uncheck();
  await page.getByLabel('Transparent background', { exact: true }).check();
  await page.getByLabel('Include title', { exact: true }).uncheck();
  await page.getByLabel('Include description', { exact: true }).uncheck();
  await page.getByLabel('Include footer', { exact: true }).uncheck();
  await closePanel(page);
  const rects = await page.evaluate(() => {
    const board = document.querySelector('.tier-board')!.getBoundingClientRect();
    const tile = document.querySelector('img[alt="Red"]')!.closest('.item-tile')!;
    const rect = tile.getBoundingClientRect();
    const row = tile.closest('.tier-row')!;
    return {
      width: board.width,
      height: board.height,
      x: rect.x - board.x,
      y: rect.y - board.y,
      size: rect.width,
      itemColor: getComputedStyle(tile).backgroundColor,
      rowColor: getComputedStyle(row).backgroundColor,
      rowY: row.getBoundingClientRect().top - board.top,
      rowH: row.getBoundingClientRect().height,
    };
  });
  async function exportPixels(name: string) {
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    const download = await downloading;
    await download.saveAs(testInfo.outputPath(`${name}.png`));
    const png = await readFile((await download.path())!);
    return page.evaluate(
      async ({ base64, rects }) => {
        const image = await createImageBitmap(
          new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/png' }),
        );
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        image.close();
        const pixel = (x: number, y: number) =>
          Array.from(ctx.getImageData(Math.floor(x * 2), Math.floor(y * 2), 1, 1).data);
        const top = pixel(rects.x + rects.size / 2, rects.y + 5);
        const center = pixel(rects.x + rects.size / 2, rects.y + rects.size / 2);
        const corner = pixel(rects.x + 1, rects.y + 1);
        const row = pixel(rects.width - 15, rects.rowY + rects.rowH / 2);
        const background = pixel(0, 0);
        ctx.fillStyle = rects.itemColor;
        ctx.fillRect(0, 0, 1, 1);
        const itemColor = Array.from(ctx.getImageData(0, 0, 1, 1).data);
        ctx.fillStyle = rects.rowColor;
        ctx.fillRect(0, 0, 1, 1);
        const rowColor = Array.from(ctx.getImageData(0, 0, 1, 1).data);
        return {
          width: canvas.width,
          height: canvas.height,
          top,
          center,
          corner,
          row,
          background,
          itemColor,
          rowColor,
        };
      },
      { base64: png.toString('base64'), rects },
    );
  }
  const fit = await exportPixels('transparent-fit');
  expect(fit.height).toBeCloseTo(rects.height * 2, 0);
  expect(fit.background[3]).toBe(0);
  expect(fit.top).toEqual(fit.itemColor);
  expect(fit.center).toEqual([239, 68, 68, 255]);
  expect(fit.corner).toEqual(fit.rowColor);
  expect(fit.row).toEqual(fit.rowColor);
  await openPanel(page);
  await page.getByLabel('Image fitting', { exact: true }).selectOption('cover');
  await page.getByLabel('Include Unranked', { exact: true }).check();
  await closePanel(page);
  const crop = await exportPixels('transparent-crop-unranked');
  expect(crop.top).toEqual([239, 68, 68, 255]);
  expect(crop.height).toBeGreaterThan(fit.height + 200);
  await openPanel(page);
  await page.getByLabel('Include title', { exact: true }).check();
  await page.getByLabel('Include description', { exact: true }).check();
  await page.getByLabel('Include footer', { exact: true }).check();
  await page.getByLabel('Transparent background', { exact: true }).uncheck();
  await closePanel(page);
  const headers = await exportPixels('all-sections');
  expect(headers.height - crop.height).toBe(312);
  expect(headers.background).toEqual([24, 24, 27, 255]);
});
