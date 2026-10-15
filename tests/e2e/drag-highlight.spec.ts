import { expect, test } from './fixtures';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`highlights the destination over items, empty space, and the pool, then clears on cancel and drop (${colorScheme})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1454, height: 1400 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.getByRole('button', { name: 'Try the sample', exact: true }).click();

    const tierA = page.getByTestId('tier-1');
    const tierB = page.getByTestId('tier-2');
    const tierC = page.getByTestId('tier-3');
    const pool = page.getByTestId('unranked-pool');
    const highlighted = page.locator('.tier-drop-area.drop-active');
    const poolBackground = await pool.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const highlightColor = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position: fixed; background-color: var(--surface-drop)';
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });

    async function beginDrag() {
      const handle = page.getByRole('button', { name: 'Drag Warm cookies', exact: true });
      // Finish the previous drop's animation before measuring a new drag.
      await expect(handle.locator('..')).not.toHaveClass(/item-dragging/);
      await handle.click({ trial: true });
      const tile = (await handle.boundingBox())!;
      await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
      await page.mouse.down();
      await page.mouse.move(tile.x + tile.width / 2 + 10, tile.y + tile.height / 2, { steps: 4 });
      await expect(page.locator('output.sr-only')).toContainText('Picked up Warm cookies');
    }

    async function hoverItem(name: string) {
      const tile = (await page
        .getByRole('button', { name: `Drag ${name}`, exact: true })
        .boundingBox())!;
      await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2, { steps: 20 });
    }

    await beginDrag();
    await hoverItem('Rainy days');
    await expect(tierA).toHaveClass(/drop-active/);
    await expect(highlighted).toHaveCount(1);
    await page.screenshot({ path: `test-results/drag-highlight-populated-${colorScheme}.png` });

    const space = (await tierA.boundingBox())!;
    await page.mouse.move(space.x + space.width - 20, space.y + space.height / 2, { steps: 12 });
    await expect(tierA).toHaveClass(/drop-active/);
    await hoverItem('Good books');
    await expect(tierA).toHaveClass(/drop-active/);
    await expect(highlighted).toHaveCount(1);

    await hoverItem('Movie nights');
    await expect(tierB).toHaveClass(/drop-active/);
    await expect(tierA).not.toHaveClass(/drop-active/);
    await expect(highlighted).toHaveCount(1);

    const empty = (await tierC.boundingBox())!;
    await page.mouse.move(empty.x + empty.width / 2, empty.y + empty.height / 2, { steps: 20 });
    await expect(tierC).toHaveClass(/drop-active/);
    await expect(tierC).toHaveCSS('background-color', highlightColor);
    await expect(tierB).not.toHaveClass(/drop-active/);
    await expect(highlighted).toHaveCount(1);

    await hoverItem('Sunday naps');
    await expect(pool).toHaveClass(/drop-active/);
    await expect(pool).toHaveCSS('background-color', highlightColor);
    await expect(tierC).not.toHaveClass(/drop-active/);
    await expect(highlighted).toHaveCount(1);
    const poolSpace = (await pool.boundingBox())!;
    await page.mouse.move(poolSpace.x + poolSpace.width - 20, poolSpace.y + poolSpace.height / 2, {
      steps: 12,
    });
    await expect(pool).toHaveClass(/drop-active/);
    await expect(pool).toHaveCSS('background-color', highlightColor);
    await page.screenshot({ path: `test-results/drag-highlight-unranked-${colorScheme}.png` });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(highlighted).toHaveCount(0);
    await expect(pool).toHaveCSS('background-color', poolBackground);
    await expect(
      pool.getByRole('button', { name: 'Drag Warm cookies', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

    await beginDrag();
    await hoverItem('Rainy days');
    await expect(tierA).toHaveClass(/drop-active/);
    await page.mouse.up();
    await expect(
      tierA.getByRole('button', { name: 'Drag Warm cookies', exact: true }),
    ).toBeVisible();
    await expect(highlighted).toHaveCount(0);
    await beginDrag();
    await hoverItem('Sunday naps');
    await expect(pool).toHaveCSS('background-color', highlightColor);
    await page.mouse.up();
    await expect(
      pool.getByRole('button', { name: 'Drag Warm cookies', exact: true }),
    ).toBeVisible();
    await expect(highlighted).toHaveCount(0);
    await expect(pool).toHaveCSS('background-color', poolBackground);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
      tierA.getByRole('button', { name: 'Drag Warm cookies', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
      pool.getByRole('button', { name: 'Drag Warm cookies', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
