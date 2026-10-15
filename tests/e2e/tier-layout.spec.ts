import { expect, test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import { createProject } from '../../src/core/project';
import { withoutRowActions } from './export-layout';

test('fills wrapped tiers with consistent square tiles and preserves their geometry in PNG exports', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1454, height: 836 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  // Keep the header on one line so this test isolates tile geometry.
  await page.getByLabel('Project name', { exact: true }).fill('Crowded tier');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const images = await page.evaluate(() =>
    Array.from({ length: 14 }, (_, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d')!;
      context.fillStyle = `hsl(${index * 27} 45% 65%)`;
      context.fillRect(0, 0, 128, 128);
      context.fillStyle = '#18181b';
      context.font = 'bold 48px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(index + 1), 64, 64);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
  );
  await page.getByLabel('Choose images', { exact: true }).setInputFiles(
    images.map((image, index) => ({
      name: `Tile-${index + 1}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    })),
  );
  await expect(page.getByRole('button', { name: 'Drag Tile-14', exact: true })).toBeVisible();
  for (let index = 1; index <= 14; index++) {
    await page.getByRole('button', { name: `Options for Tile-${index}`, exact: true }).click();
    await page
      .getByRole('button', { name: `Move to ${index === 1 ? 'A' : 'B'}`, exact: true })
      .click();
  }
  const row = page.getByTestId('tier-2');
  const metrics = () =>
    row.evaluate((element) => {
      const tiles = Array.from(element.children).map((tile) => tile.getBoundingClientRect());
      const lines = new Map<number, number>();
      for (const tile of tiles) {
        const y = Math.round(tile.y);
        lines.set(y, (lines.get(y) ?? 0) + 1);
      }
      const firstLine = tiles.filter((tile) => Math.abs(tile.y - tiles[0].y) < 1);
      return {
        count: tiles.length,
        lineCounts: Array.from(lines.values()),
        oneLine: tiles.every((tile) => Math.abs(tile.y - tiles[0].y) < 1),
        square: tiles.every((tile) => Math.abs(tile.width - tile.height) < 1),
        minWidth: Math.min(...tiles.map((tile) => tile.width)),
        maxWidth: Math.max(...tiles.map((tile) => tile.width)),
        unusedWidth:
          element.getBoundingClientRect().right -
          parseFloat(getComputedStyle(element).paddingRight) -
          Math.max(...firstLine.map((tile) => tile.right)),
        overflow: element.scrollWidth > element.clientWidth,
      };
    });
  await expect.poll(async () => (await metrics()).count).toBe(13);
  const desktop = await metrics();
  expect(desktop.oneLine).toBe(true);
  expect(desktop.square).toBe(true);
  expect(desktop.overflow).toBe(false);
  expect(desktop.minWidth).toBeGreaterThanOrEqual(64);
  expect(desktop.maxWidth).toBeLessThan(92);
  expect(
    await page.getByRole('button', { name: 'Drag Tile-1', exact: true }).boundingBox(),
  ).toMatchObject({
    width: 92,
    height: 92,
  });

  async function checkExportMatchesBoard(name: string) {
    await page.getByRole('button', { name: 'Export PNG', exact: true }).scrollIntoViewIfNeeded();
    const editorLayout = await metrics();
    const board = await withoutRowActions(page, () =>
      page.locator('.tier-board').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        return {
          width: bounds.width,
          height: bounds.height,
          tiles: Array.from(element.querySelectorAll<HTMLElement>('[data-item-id]'), (tile) => {
            const rect = tile.getBoundingClientRect();
            context.drawImage(tile.querySelector('img')!, 0, 0);
            const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
            return {
              color: (r << 16) | (g << 8) | b,
              x: rect.left - bounds.left,
              y: rect.top - bounds.top,
              width: rect.width,
              height: rect.height,
            };
          }),
        };
      }),
    );
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    const download = await downloading;
    await download.saveAs(testInfo.outputPath(`${name}.png`));
    const bytes = await readFile((await download.path())!);
    const exported = await page.evaluate(
      async ({ base64, colors }) => {
        const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const image = await createImageBitmap(new Blob([data], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        image.close();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const rectangles = Object.fromEntries(
          colors.map((color) => [
            color,
            {
              left: canvas.width,
              top: canvas.height,
              right: -1,
              bottom: -1,
            },
          ]),
        );
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const color = (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2];
          const rectangle = rectangles[color];
          if (!rectangle) continue;
          const x = (offset / 4) % canvas.width;
          const y = Math.floor(offset / 4 / canvas.width);
          rectangle.left = Math.min(rectangle.left, x);
          rectangle.top = Math.min(rectangle.top, y);
          rectangle.right = Math.max(rectangle.right, x);
          rectangle.bottom = Math.max(rectangle.bottom, y);
        }
        return { width: canvas.width, height: canvas.height, rectangles };
      },
      { base64: bytes.toString('base64'), colors: board.tiles.map((tile) => tile.color) },
    );
    expect(Math.abs(exported.width - board.width * 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(exported.height - (108 + board.height + 48) * 2)).toBeLessThanOrEqual(1);
    for (const tile of board.tiles) {
      const rectangle = exported.rectangles[tile.color];
      expect(Math.abs(rectangle.left - tile.x * 2), `${name}: image x`).toBeLessThanOrEqual(2);
      expect(Math.abs(rectangle.top - (108 + tile.y) * 2), `${name}: image y`).toBeLessThanOrEqual(
        2,
      );
      expect(
        Math.abs(rectangle.right - rectangle.left + 1 - tile.width * 2),
        `${name}: image width`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(rectangle.bottom - rectangle.top + 1 - tile.height * 2),
        `${name}: image height`,
      ).toBeLessThanOrEqual(2);
    }
    await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
    expect(await metrics()).toEqual(editorLayout);
    await expect(page.locator('[data-export-snapshot]')).toHaveCount(0);
  }

  await checkExportMatchesBoard('single-line-desktop');
  await page.screenshot({ path: 'test-results/tier-layout-desktop.png', fullPage: true });
  const itemOrder = await row
    .locator('[data-item-id]')
    .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-item-id')));
  // Resize in both directions across column, sidebar, and mobile breakpoints.
  for (const width of [1280, 1194, 1150, 1100, 1000, 900, 850, 390, 850, 1000, 1150, 1454]) {
    await page.setViewportSize({ width, height: 836 });
    await expect
      .poll(
        async () => {
          const layout = await metrics();
          return {
            square: layout.square,
            sameSize: layout.minWidth === layout.maxWidth,
            withinBounds: layout.minWidth >= 64 && layout.maxWidth <= 92,
            filled: layout.unusedWidth < 1,
            overflow: layout.overflow,
          };
        },
        { message: `Tier layout after resizing to ${width}px` },
      )
      .toEqual({ square: true, sameSize: true, withinBounds: true, filled: true, overflow: false });
  }
  expect(
    await row
      .locator('[data-item-id]')
      .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-item-id'))),
  ).toEqual(itemOrder);
  await page.setViewportSize({ width: 1100, height: 836 });
  await expect.poll(async () => (await metrics()).lineCounts).toEqual([9, 4]);
  const wrapped = await metrics();
  const sparseTile = (await page
    .getByRole('button', { name: 'Drag Tile-1', exact: true })
    .boundingBox())!;
  expect(wrapped.minWidth).toBeGreaterThanOrEqual(64);
  expect(wrapped.maxWidth).toBeLessThanOrEqual(sparseTile.width);
  expect(wrapped.minWidth).toBe(wrapped.maxWidth);
  expect(wrapped.square).toBe(true);
  expect(wrapped.overflow).toBe(false);
  expect(wrapped.unusedWidth).toBeLessThan(1);
  await checkExportMatchesBoard('uniform-wrapped-desktop');
  await page.screenshot({ path: 'test-results/tier-layout-uniform.png', fullPage: true });
  await page.getByRole('button', { name: 'Show sidebar', exact: true }).click();
  await page.setViewportSize({ width: 1100, height: 836 });
  await expect.poll(async () => (await metrics()).lineCounts).toEqual([7, 6]);
  expect((await metrics()).square).toBe(true);
  expect((await metrics()).overflow).toBe(false);
  expect((await metrics()).minWidth).toBe((await metrics()).maxWidth);
  expect((await metrics()).unusedWidth).toBeLessThan(1);
  await checkExportMatchesBoard('wrapped-desktop');
  await page.screenshot({ path: 'test-results/tier-layout-wrapped.png', fullPage: true });
  const target = page.getByTestId('tier-3');
  // Keep both tiers away from the viewport edge so this checks wrapping and
  // placement without also exercising the drag library's page auto-scrolling.
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const tile = page.getByRole('button', { name: 'Drag Tile-14', exact: true });
  const start = (await tile.boundingBox())!;
  const destination = (await target.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 - 10, start.y + start.height / 2, { steps: 4 });
  await expect(page.locator('output.sr-only')).toContainText('Picked up Tile-14');
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
    { steps: 20 },
  );
  await page.mouse.up();
  await expect(target.getByRole('button', { name: 'Drag Tile-14', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await metrics()).count).toBe(13);
  await expect.poll(async () => (await metrics()).lineCounts).toEqual([7, 6]);

  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await metrics()).oneLine).toBe(false);
  const mobile = await metrics();
  expect(mobile.square).toBe(true);
  expect(mobile.minWidth).toBeGreaterThanOrEqual(64);
  expect(mobile.maxWidth).toBeLessThanOrEqual(92);
  expect(mobile.minWidth).toBe(mobile.maxWidth);
  expect(mobile.unusedWidth).toBeLessThan(1);
  expect(mobile.overflow).toBe(false);
  expect(mobile.lineCounts.slice(0, -1).every((count) => count === mobile.lineCounts[0])).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await checkExportMatchesBoard('wrapped-mobile');
  await row.getByRole('button', { name: 'Options for Tile-14', exact: true }).click();
  await page.getByRole('button', { name: 'Move to A', exact: true }).click();
  await expect(
    page.getByTestId('tier-1').getByRole('button', { name: 'Drag Tile-14', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/tier-layout-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('compact and custom item sizes fill wrapped rows after resizing, and export the same arrangement', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1136, height: 892 });
  await page.goto('/');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 100;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ef4444';
    context.fillRect(0, 0, 100, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const project = createProject('Compact layout regression');
  for (let index = 0; index < 16; index++) {
    const id = `tile-${index}`;
    project.items[id] = { id, name: `Tile ${index}`, color: '#ffffff', assetId: 'image' };
    project.tiers[index === 0 ? 1 : 3].itemIds.push(id);
  }
  const archive = zipSync({
    'project.json': strToU8(JSON.stringify(project)),
    'assets.json': strToU8(JSON.stringify([{ id: 'image', name: 'tile.png', mime: 'image/png' }])),
    'assets/image': Buffer.from(image, 'base64'),
  });
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (
    await choosing
  ).setFiles({ name: 'compact.tier', mimeType: 'application/zip', buffer: Buffer.from(archive) });
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page
    .getByRole('button', { name: 'Compact Small tiles, less spacing', exact: true })
    .click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const row = page.getByTestId('tier-3');
  const metrics = () =>
    row.evaluate((element) => {
      const tiles = Array.from(element.children).map((tile) => tile.getBoundingClientRect());
      const firstLine = tiles.filter((tile) => Math.abs(tile.y - tiles[0].y) < 1);
      return {
        count: tiles.length,
        wrapped: firstLine.length < tiles.length,
        unusedWidth:
          element.getBoundingClientRect().right -
          parseFloat(getComputedStyle(element).paddingRight) -
          firstLine.at(-1)!.right,
        uniform: tiles.every(
          (tile) =>
            Math.abs(tile.width - tiles[0].width) < 0.02 &&
            Math.abs(tile.height - tiles[0].height) < 0.02,
        ),
        longestEdge: Math.max(...tiles.flatMap((tile) => [tile.width, tile.height])),
        overflow: element.scrollWidth > element.clientWidth,
      };
    });
  await expect.poll(async () => (await metrics()).unusedWidth).toBeLessThan(1);
  expect((await metrics()).wrapped).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('compact-filled.png'), fullPage: true });

  await page.getByRole('button', { name: 'Export PNG', exact: true }).scrollIntoViewIfNeeded();
  const expected = await withoutRowActions(page, () =>
    row.evaluate((element) => {
      const board = element.closest('.tier-board')!.getBoundingClientRect();
      const tiles = Array.from(element.children).map((tile) => tile.getBoundingClientRect());
      return {
        y: 108 + tiles[0].y - board.y + tiles[0].height / 2,
        spans: tiles
          .filter((tile) => Math.abs(tile.y - tiles[0].y) < 1)
          .map((tile) => ({ x: tile.x - board.x, width: tile.width })),
      };
    }),
  );
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const download = await downloading;
  await download.saveAs(testInfo.outputPath('compact-filled.png-export.png'));
  const png = await readFile((await download.path())!);
  const spans = await page.evaluate(
    async ({ base64, y }) => {
      const image = await createImageBitmap(
        new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      image.close();
      const pixels = context.getImageData(0, Math.round(y * 2), canvas.width, 1).data;
      const spans: { x: number; width: number }[] = [];
      for (let x = 0; x < canvas.width; x++) {
        const red = pixels[x * 4] === 239 && pixels[x * 4 + 1] === 68 && pixels[x * 4 + 2] === 68;
        if (red) {
          const previous = spans.at(-1);
          if (previous && previous.x + previous.width === x) previous.width++;
          else spans.push({ x, width: 1 });
        }
      }
      return spans;
    },
    { base64: png.toString('base64'), y: expected.y },
  );
  expect(spans).toHaveLength(expected.spans.length);
  spans.forEach((span, index) => {
    expect(Math.abs(span.x - expected.spans[index].x * 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(span.width - expected.spans[index].width * 2)).toBeLessThanOrEqual(2);
  });

  for (const size of [64, 48, 52, 160]) {
    await page.getByRole('button', { name: 'Customize', exact: true }).click();
    const slider = page.getByRole('slider', { name: 'Item size', exact: true });
    await slider.press(size === 160 ? 'End' : 'Home');
    for (let step = 48; step < size && size !== 160; step++) await slider.press('ArrowRight');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    for (const shape of ['Square', 'Vertical', 'Horizontal']) {
      await page.getByRole('button', { name: /^Item shape:/ }).click();
      await page.getByRole('option', { name: shape, exact: true }).click();
      for (const width of [1136, 900, 390]) {
        await page.setViewportSize({ width, height: 892 });
        await expect
          .poll(
            async () => {
              const current = await metrics();
              return {
                filled: !current.wrapped || current.unusedWidth < 1,
                uniform: current.uniform,
                withinSize: current.longestEdge <= size + 0.02,
                overflow: current.overflow,
                count: current.count,
              };
            },
            { message: `${size}px ${shape} tiles at a ${width}px viewport` },
          )
          .toEqual({ filled: true, uniform: true, withinSize: true, overflow: false, count: 15 });
      }
    }
  }
  expect(errors).toEqual([]);
});
