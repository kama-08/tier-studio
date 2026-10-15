import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';

const shapes = [
  { value: 'square', ratio: 1 },
  { value: 'vertical', ratio: 3 / 4 },
  { value: 'horizontal', ratio: 4 / 3 },
  { value: 'circle', ratio: 1 },
  { value: 'original', ratio: 2 },
] as const;

async function createImageProject(page: Page) {
  await page.setViewportSize({ width: 1454, height: 1400 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Item shapes');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const images = await page.evaluate(() =>
    [
      { name: 'Landscape', width: 160, height: 80 },
      { name: 'Portrait', width: 80, height: 160 },
    ].map(({ name, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      for (const [index, color] of ['#ef4444', '#22c55e', '#3b82f6'].entries()) {
        context.fillStyle = color;
        context.fillRect((index * width) / 3, 0, width / 3 + 1, height);
      }
      return { name, data: canvas.toDataURL('image/png').split(',')[1] };
    }),
  );
  await page.getByLabel('Choose images', { exact: true }).setInputFiles(
    images.map(({ name, data }) => ({
      name: `${name}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    })),
  );
  for (const name of ['Landscape', 'Portrait']) {
    await page.getByRole('button', { name: `Options for ${name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Move to A', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Text item', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Note');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
}

async function geometry(page: Page, name: string) {
  return page.getByRole('button', { name: `Drag ${name}`, exact: true }).evaluate((element) => {
    const tile = element.closest<HTMLElement>('.item-tile')!;
    const { width, height } = tile.getBoundingClientRect();
    return { width, height, ratio: width / height, radius: getComputedStyle(tile).borderRadius };
  });
}

async function chooseShape(page: Page, shape: string) {
  await page.getByRole('button', { name: /^Item shape:/ }).click();
  await page
    .getByRole('option', { name: shape[0].toUpperCase() + shape.slice(1), exact: true })
    .click();
}

test('project-wide shapes apply to images and text, undo, resize, reload, and travel with project files', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await createImageProject(page);
  const selector = page.getByRole('button', { name: /^Item shape:/ });
  await expect(selector).toHaveAttribute('data-value', 'square');
  for (const shape of shapes) {
    await chooseShape(page, shape.value);
    await expect
      .poll(async () => (await geometry(page, 'Landscape')).ratio)
      .toBeCloseTo(shape.ratio, 2);
    const portrait = await geometry(page, 'Portrait');
    const note = await geometry(page, 'Note');
    expect(portrait.ratio).toBeCloseTo(shape.value === 'original' ? 1 / 2 : shape.ratio, 2);
    expect(note.ratio).toBeCloseTo(shape.value === 'original' ? 1 : shape.ratio, 2);
    expect(Math.max(portrait.width, portrait.height)).toBeLessThanOrEqual(92);
    expect((await geometry(page, 'Landscape')).radius).toBe(
      shape.value === 'circle' ? '50%' : '5px',
    );
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(selector).toHaveAttribute('data-value', 'circle');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(selector).toHaveAttribute('data-value', 'original');
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(selector).toHaveAttribute('data-value', 'original');
  await expect.poll(async () => (await geometry(page, 'Landscape')).ratio).toBeCloseTo(2, 2);
  await expect.poll(async () => (await geometry(page, 'Portrait')).ratio).toBeCloseTo(1 / 2, 2);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const shape of shapes) {
    await chooseShape(page, shape.value);
    await expect
      .poll(async () => (await geometry(page, 'Landscape')).ratio)
      .toBeCloseTo(shape.ratio, 2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page
        .getByTestId('tier-1')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: 'test-results/item-shapes-original-mobile.png', fullPage: true });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const saved = await downloading;
  await page.getByRole('link', { name: 'My projects', exact: true }).last().click();
  const preview = page.getByRole('link', { name: 'Open Item shapes', exact: true });
  await expect
    .poll(() =>
      preview.locator('.mini-item img').evaluateAll((images) =>
        images.map((image) => {
          // Cards rotate the miniature board. Inspect its untransformed sizes
          // rather than the axis-aligned bounds of a rotated rectangle.
          const style = getComputedStyle(image);
          const width = parseFloat(style.width);
          const height = parseFloat(style.height);
          return Math.round((width / height) * 100) / 100;
        }),
      ),
    )
    .toEqual([2, 0.5]);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (await chooser).setFiles((await saved.path())!);
  await expect(selector).toHaveAttribute('data-value', 'original');
  await expect.poll(async () => (await geometry(page, 'Landscape')).ratio).toBeCloseTo(2, 2);
  await expect.poll(async () => (await geometry(page, 'Portrait')).ratio).toBeCloseTo(1 / 2, 2);
  expect(errors).toEqual([]);
});

test('PNG exports preserve rectangles, circular masks, and uncropped originals; original-sized items still drag', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await createImageProject(page);
  for (const shape of shapes) {
    await chooseShape(page, shape.value);
    await expect
      .poll(async () => (await geometry(page, 'Landscape')).ratio)
      .toBeCloseTo(shape.ratio, 2);
    await page.getByRole('button', { name: 'Export PNG', exact: true }).scrollIntoViewIfNeeded();
    const expected = await page
      .getByRole('button', { name: 'Drag Landscape', exact: true })
      .evaluate((element) => {
        const tile = element.closest('.item-tile')!.getBoundingClientRect();
        const board = element.closest('.tier-board')!.getBoundingClientRect();
        return {
          x: tile.x - board.x,
          y: 108 + tile.y - board.y,
          width: tile.width,
          height: tile.height,
          surface: getComputedStyle(element.closest('.tier-row')!).backgroundColor,
        };
      });
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    const download = await downloading;
    await download.saveAs(testInfo.outputPath(`${shape.value}.png`));
    const png = await readFile((await download.path())!);
    const pixels = await page.evaluate(
      async ({ base64, rect }) => {
        const image = await createImageBitmap(
          new Blob([Uint8Array.from(atob(base64), (letter) => letter.charCodeAt(0))], {
            type: 'image/png',
          }),
        );
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        image.close();
        const pixel = (x: number, y: number) =>
          Array.from(context.getImageData(Math.round(x), Math.round(y), 1, 1).data).slice(0, 3);
        const x = rect.x * 2;
        const y = rect.y * 2;
        const width = rect.width * 2;
        const height = rect.height * 2;
        // Clear the default 5px rounded corner while staying outside a circle.
        const corner = pixel(x + 8, y + 8);
        const center = pixel(x + width / 2, y + height / 2);
        const left = pixel(x + 4, y + height / 2);
        const right = pixel(x + width - 4, y + height / 2);
        const data = context.getImageData(
          Math.ceil(x),
          Math.ceil(y),
          Math.floor(width),
          Math.floor(height),
        ).data;
        let leftEdge = width,
          rightEdge = -1,
          topEdge = height,
          bottomEdge = -1;
        for (let offset = 0; offset < data.length; offset += 4) {
          if (
            !(
              (data[offset] === 239 && data[offset + 1] === 68 && data[offset + 2] === 68) ||
              (data[offset] === 34 && data[offset + 1] === 197 && data[offset + 2] === 94) ||
              (data[offset] === 59 && data[offset + 1] === 130 && data[offset + 2] === 246)
            )
          )
            continue;
          const px = (offset / 4) % Math.floor(width);
          const py = Math.floor(offset / 4 / Math.floor(width));
          leftEdge = Math.min(leftEdge, px);
          rightEdge = Math.max(rightEdge, px);
          topEdge = Math.min(topEdge, py);
          bottomEdge = Math.max(bottomEdge, py);
        }
        context.fillStyle = rect.surface;
        context.fillRect(0, 0, 1, 1);
        const surface = pixel(0, 0);
        return {
          corner,
          center,
          left,
          right,
          surface,
          width: rightEdge - leftEdge + 1,
          height: bottomEdge - topEdge + 1,
        };
      },
      { base64: png.toString('base64'), rect: expected },
    );
    expect(pixels.center, `${shape.value}: image content`).toEqual([34, 197, 94]);
    expect(
      Math.abs(pixels.width - expected.width * 2),
      `${shape.value}: exported width`,
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(pixels.height - expected.height * 2),
      `${shape.value}: exported height`,
    ).toBeLessThanOrEqual(2);
    const expectedCorner = shape.value === 'circle' ? pixels.surface : [239, 68, 68];
    // Vertical cropping can begin in the middle stripe; only circles should
    // expose the tier surface inside the tile's bounding rectangle.
    expect(pixels.corner.every((value, index) => value === pixels.surface[index])).toBe(
      shape.value === 'circle',
    );
    if (shape.value === 'circle') expect(pixels.corner).toEqual(expectedCorner);
    if (shape.value === 'original') {
      expect(pixels.left).toEqual([239, 68, 68]);
      expect(pixels.right).toEqual([59, 130, 246]);
    }
    await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`${shape.value}-editor.png`) });
  }

  const original = page.getByRole('button', { name: 'Drag Portrait', exact: true });
  const start = (await original.boundingBox())!;
  const target = page.getByTestId('tier-2');
  const end = (await target.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 10, start.y + start.height / 2, { steps: 4 });
  await expect(page.locator('output.sr-only')).toContainText('Picked up Portrait');
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 20 });
  await expect(target).toHaveClass(/drop-active/);
  await page.mouse.up();
  await expect(target.getByRole('button', { name: 'Drag Portrait', exact: true })).toBeVisible();
  expect((await geometry(page, 'Portrait')).ratio).toBeCloseTo(1 / 2, 2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByTestId('tier-1').getByRole('button', { name: 'Drag Portrait', exact: true }),
  ).toBeVisible();
});
