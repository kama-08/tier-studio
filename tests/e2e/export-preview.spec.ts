import { readFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import { expect, test } from './fixtures';
import { createSampleProject } from '../../src/core/project';
import { DEFAULT_APPEARANCE } from '../../src/core/appearance';
import { unpackProject } from '../../src/services/project-files/archive';

test('PNG export ignores unused or hidden corrupt assets and previews a fixed output width', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const project = createSampleProject();
  project.description = 'A legacy description preserved in the project file. '
    .repeat(8)
    .slice(0, 500);
  const appearance = {
    ...DEFAULT_APPEARANCE,
    exportDescription: true,
    exportWidth: 1200,
    exportScale: 3,
  };
  // An invalid image in Unranked is excluded unless that section is exported.
  const hidden = project.unranked[0];
  project.items[hidden].assetId = 'hidden-corrupt';
  const bytes = zipSync({
    'project.json': strToU8(JSON.stringify({ ...project, appearance })),
    'assets.json': strToU8(
      JSON.stringify([
        { id: 'unused-corrupt', name: 'Unused.png', mime: 'image/png' },
        { id: 'hidden-corrupt', name: 'Hidden.png', mime: 'image/png' },
      ]),
    ),
    'assets/unused-corrupt': new Uint8Array([1, 2, 3]),
    'assets/hidden-corrupt': new Uint8Array([1, 2, 3]),
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: 'Unused.tier', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('The little things');
  const before = await page.locator('.tier-board').boundingBox();
  await page.getByRole('button', { name: 'Preview PNG export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'PNG export', exact: true });
  await expect(dialog.getByAltText('PNG export preview')).toBeVisible();
  await expect(dialog.locator('output')).toContainText('3,600');
  await dialog.getByLabel('Board width', { exact: true }).selectOption('800');
  await dialog.getByLabel('Resolution', { exact: true }).selectOption('2');
  await expect(dialog.locator('output')).toContainText('1,600');
  await expect(dialog.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
  const previewHeight = await dialog
    .getByAltText('PNG export preview')
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const background = context.getImageData(0, 0, 1, 1).data;
      // The band below the title used to contain the description.
      const band = context.getImageData(0, 60, canvas.width, 22).data;
      return band.every((channel, index) => channel === background[index % 4])
        ? image.naturalHeight
        : 0;
    });
  expect(previewHeight).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('export-preview.png'), fullPage: true });
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const png = await readFile((await (await downloading).path())!);
  expect(png.readUInt32BE(16)).toBe(1600);
  const height = png.readUInt32BE(20);
  expect(height).toBeCloseTo(previewHeight * 2, -1);
  const includeTitle = dialog.getByRole('checkbox', { name: 'Include title', exact: true });
  const preview = dialog.getByAltText('PNG export preview');
  await expect(includeTitle).toBeChecked();
  await includeTitle.uncheck();
  await expect
    .poll(async () => preview.evaluate((image: HTMLImageElement) => image.naturalHeight))
    .toBe(previewHeight - 84);
  const titlelessDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const titleless = await readFile((await (await titlelessDownload).path())!);
  expect(titleless.readUInt32BE(20)).toBe(height - 168);
  await includeTitle.check();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await page.locator('.tier-board').boundingBox()).toEqual(before);
  await page.setViewportSize({ width: 390, height: 850 });
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const resized = await readFile((await (await secondDownload).path())!);
  expect(resized.readUInt32BE(16)).toBe(1600);
  expect(resized.readUInt32BE(20)).toBe(height);
  await page
    .getByLabel('Project title', { exact: true })
    .fill(
      'A much longer title that should wrap into multiple lines instead of being squeezed into the available width. '
        .repeat(2)
        .slice(0, 160),
    );
  await page.getByLabel('Project title', { exact: true }).press('Enter');
  const wrappedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const wrapped = await readFile((await (await wrappedDownload).path())!);
  expect(wrapped.readUInt32BE(16)).toBe(1600);
  expect(wrapped.readUInt32BE(20)).toBeGreaterThan(height + 100);
  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const archive = unpackProject(
    new Uint8Array(await readFile((await (await projectDownload).path())!)),
  );
  expect(archive.project.appearance).toMatchObject({ exportWidth: 800, exportScale: 2 });
  expect(archive.project.description).toBe(project.description);
  await expect(page.locator('[data-export-snapshot]')).toHaveCount(0);
});
