import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { unpackProject } from '../../src/services/project-files/archive';

test('image cleanup preserves undo and backups in other tabs, then removes unused blobs', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 300;
    canvas.getContext('2d')!.fillRect(0, 0, 300, 300);
    return canvas.toDataURL().split(',')[1];
  });
  await page
    .getByLabel('Choose images', { exact: true })
    .setInputFiles({ name: 'Keep.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByRole('button', { name: 'Options for Keep', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Options for Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Move to S', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByRole('img', { name: 'Keep', exact: true })).toBeVisible();
  // Populate and verify the small library thumbnail cache.
  await page.getByRole('link', { name: 'My projects', exact: true }).last().click();
  await expect(page.locator('.project-card .mini-item img')).toBeVisible();
  const assetInfo = () =>
    page.evaluate(async () => {
      return new Promise<{ count: number; thumbnailSize: number }>((resolve, reject) => {
        const request = indexedDB.open('tier-studio');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const query = db.transaction('assets').objectStore('assets').getAll();
          query.onsuccess = () => {
            const assets = query.result;
            resolve({ count: assets.length, thumbnailSize: assets[0]?.thumbnail?.size ?? 0 });
            db.close();
          };
          query.onerror = () => {
            reject(query.error);
            db.close();
          };
        };
      });
    });
  await expect.poll(async () => (await assetInfo()).thumbnailSize).toBeGreaterThan(0);
  const thumbnail = await page.locator('.project-card .mini-item img').evaluate((img) => ({
    width: (img as HTMLImageElement).naturalWidth,
    height: (img as HTMLImageElement).naturalHeight,
  }));
  expect(Math.max(thumbnail.width, thumbnail.height)).toBe(96);
  await page.getByRole('link', { name: 'Open The little things', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Remove item', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Keep', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My projects', exact: true }).last().click();
  expect((await assetInfo()).count).toBe(1);
  // The stale second tab can still back up its image after the first tab left.
  const downloading = second.waitForEvent('download');
  await second.getByRole('button', { name: 'Save project', exact: true }).click();
  const backup = unpackProject(new Uint8Array(await readFile((await (await downloading).path())!)));
  expect(backup.assets).toHaveLength(1);
  await second.close();
  await page.reload();
  await expect.poll(async () => (await assetInfo()).count).toBe(0);
});
