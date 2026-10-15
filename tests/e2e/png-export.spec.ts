import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { strToU8, zipSync } from 'fflate';
import { createProject } from '../../src/core/project';
import { DEFAULT_APPEARANCE } from '../../src/core/appearance';
import { withoutRowActions } from './export-layout';

test('PNG exports follow explicit themes and live system theme changes', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('The little things');

  async function checkExport(name: string) {
    const colors = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      return {
        background: style('html').backgroundColor,
        surface: style('.tier-row').backgroundColor,
        title: style('.project-title-input').color,
        secondary: style('.project-description-input').color,
        tier: style('.tier-label').backgroundColor,
        item: style('.item-tile').backgroundColor,
      };
    });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('The-little-things.png');
    await download.saveAs(testInfo.outputPath(`${name}.png`));
    const bytes = await readFile((await download.path())!);
    const pixels = await page.evaluate(
      async ({ base64, colors }) => {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        image.close();
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixel = (x: number, y: number) =>
          Array.from(data.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4));
        const background = pixel(0, 0);
        // Sample inside the row, clear of its exported border.
        const surface = pixel(canvas.width - 8, Math.floor(canvas.height / 2));
        const samples = Object.fromEntries(
          Object.entries(colors).map(([key, color]) => {
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [key, Array.from(context.getImageData(0, 0, 1, 1).data)];
          }),
        );
        const counts = Object.fromEntries(Object.keys(colors).map((key) => [key, 0]));
        for (let offset = 0; offset < data.length; offset += 4) {
          for (const [key, rgba] of Object.entries(samples)) {
            if (rgba.every((channel, index) => data[offset + index] === channel)) counts[key]++;
          }
        }
        return { background, surface, samples, counts };
      },
      { base64: bytes.toString('base64'), colors },
    );
    expect(pixels.background, `${name}: page background`).toEqual(pixels.samples.background);
    expect(pixels.surface, `${name}: tier background`).toEqual(pixels.samples.surface);
    expect(pixels.counts.title, `${name}: readable title`).toBeGreaterThan(100);
    expect(pixels.counts.secondary, `${name}: readable description/footer`).toBeGreaterThan(10);
    expect(pixels.counts.tier, `${name}: original tier color`).toBeGreaterThan(1000);
    expect(pixels.counts.item, `${name}: original item color`).toBeGreaterThan(1000);
    await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
  }

  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await checkExport('system-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await checkExport('system-dark');
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'light');
  await checkExport('explicit-light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark');
  await checkExport('explicit-dark');
  expect(errors).toEqual([]);
});

test('PNG reclaims the row-control column, reflows original images and Unranked, and leaves the editor intact', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1136, height: 892 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Measure export width');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const fitting = await page.getByTestId('tier-3').evaluate((area) => {
    const style = getComputedStyle(area);
    const content =
      area.getBoundingClientRect().width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const controls = area
      .parentElement!.querySelector('.tier-row-actions')!
      .getBoundingClientRect().width;
    const count = Math.ceil(content / 92);
    // Fits one row only after reclaiming the control column.
    return { count, size: Math.floor((content + controls - 8 * (count - 1) - 2) / count) };
  });
  const images = await page.evaluate(() =>
    ['#ef4444', '#3b82f6'].map((color) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 160;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, 160, 160);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
  );
  const project = createProject('No exported control column');
  project.itemShape = 'original';
  project.appearance = { ...DEFAULT_APPEARANCE, itemSize: fitting.size, exportUnranked: true };
  for (let index = 0; index <= fitting.count; index++) {
    const id = `tile-${index}`;
    const pool = index === fitting.count;
    project.items[id] = {
      id,
      name: `Tile ${index}`,
      color: '#ffffff',
      assetId: pool ? 'blue' : 'red',
    };
    (pool ? project.unranked : project.tiers[3].itemIds).push(id);
  }
  const archive = zipSync({
    'project.json': strToU8(JSON.stringify(project)),
    'assets.json': strToU8(
      JSON.stringify(['red', 'blue'].map((id) => ({ id, name: `${id}.png`, mime: 'image/png' }))),
    ),
    'assets/red': Buffer.from(images[0], 'base64'),
    'assets/blue': Buffer.from(images[1], 'base64'),
  });
  await page.getByRole('link', { name: 'My projects', exact: true }).last().click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'export-width.tier',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByTestId('tier-3').locator('img')).toHaveCount(fitting.count);
  await page.evaluate(() =>
    Promise.all(Array.from(document.querySelectorAll('img'), (image) => image.decode())),
  );
  const geometry = () =>
    page.evaluate(() => {
      const board = document.querySelector('.tier-board')!.getBoundingClientRect();
      const row = document.querySelectorAll('.tier-row')[3];
      const tiles = Array.from(row.querySelectorAll('[data-item-id]')).map((tile) =>
        tile.getBoundingClientRect(),
      );
      const pool = document.querySelector('.pool-drop-area')!.getBoundingClientRect();
      const poolItem = document
        .querySelector('.pool-drop-area [data-item-id]')!
        .getBoundingClientRect();
      return {
        width: board.width,
        height: board.height,
        tileYs: tiles.map((tile) => tile.y - board.y),
        last: {
          x: tiles.at(-1)!.right - board.x - 4,
          y: 108 + tiles.at(-1)!.y - board.y + tiles.at(-1)!.height / 2,
        },
        pool: {
          x: poolItem.x - board.x + poolItem.width / 2,
          y: 108 + poolItem.y - board.y + poolItem.height / 2,
        },
        totalHeight: 108 + pool.bottom - board.y + 48,
        controlX: row.querySelector('.tier-row-actions')?.getBoundingClientRect().left,
        boardX: board.x,
      };
    });
  const before = await geometry();
  expect(new Set(before.tileYs).size).toBe(2);
  const expected = await withoutRowActions(page, geometry);
  expect(new Set(expected.tileYs).size).toBe(1);
  expect(expected.last.x).toBeGreaterThan(before.controlX! - before.boardX);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const download = await downloading;
  await download.saveAs(testInfo.outputPath('reclaimed-width.png'));
  const bytes = await readFile((await download.path())!);
  const pixels = await page.evaluate(
    async ({ base64, expected }) => {
      const image = await createImageBitmap(
        new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      image.close();
      const sample = ({ x, y }: { x: number; y: number }) =>
        Array.from(context.getImageData(Math.round(x * 2), Math.round(y * 2), 1, 1).data);
      return {
        width: canvas.width,
        height: canvas.height,
        last: sample(expected.last),
        pool: sample(expected.pool),
      };
    },
    { base64: bytes.toString('base64'), expected },
  );
  expect(pixels.width).toBeCloseTo(expected.width * 2, 0);
  expect(pixels.height).toBeCloseTo(expected.totalHeight * 2, 0);
  expect(pixels.height).toBeLessThan(before.totalHeight * 2 - fitting.size);
  expect(pixels.last).toEqual([239, 68, 68, 255]);
  expect(pixels.pool).toEqual([59, 130, 246, 255]);
  expect(await geometry()).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.locator('[data-export-snapshot]')).toHaveCount(0);

  // Decoding failures must also dispose of the hidden snapshot.
  const source = await page.getByTestId('tier-3').locator('img').first().getAttribute('src');
  await page
    .getByTestId('tier-3')
    .locator('img')
    .first()
    .evaluate((image) => {
      image.setAttribute('src', 'data:image/png;base64,AA==');
    });
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
  await expect(page.locator('[data-export-snapshot]')).toHaveCount(0);
  await page
    .getByTestId('tier-3')
    .locator('img')
    .first()
    .evaluate((image, src) => {
      image.setAttribute('src', src!);
    }, source);
});
