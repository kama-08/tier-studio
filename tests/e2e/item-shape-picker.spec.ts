import { expect, test } from './fixtures';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`visual shape picker supports pointer, keyboard, dismissal, and mobile (${colorScheme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1254, height: 892 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
    const trigger = page.getByRole('button', { name: /^Item shape:/ });
    const options = page.getByRole('listbox', { name: 'Item shape', exact: true });
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(options.getByRole('option')).toHaveCount(5);
    await expect(page.getByRole('option', { name: 'Square', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    for (const name of ['Square', 'Vertical', 'Horizontal', 'Circle', 'Original']) {
      await expect(
        page.getByRole('option', { name, exact: true }).locator('svg').first(),
      ).toBeVisible();
    }
    await page.screenshot({ path: `test-results/shape-picker-desktop-${colorScheme}.png` });
    await page.getByRole('option', { name: 'Vertical', exact: true }).click();
    await expect(trigger).toHaveAttribute('data-value', 'vertical');
    await expect(trigger).toBeFocused();
    await expect(options).toHaveCount(0);

    await trigger.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Vertical', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('option', { name: 'Horizontal', exact: true })).toBeFocused();
    await expect(trigger).toHaveAttribute('data-value', 'vertical');
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('data-value', 'horizontal');
    await expect(options).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(trigger).toHaveAttribute('data-value', 'vertical');

    await trigger.click();
    await page.keyboard.press('End');
    await expect(page.getByRole('option', { name: 'Original', exact: true })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('option', { name: 'Square', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(options).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('data-value', 'vertical');
    await trigger.click();
    await page.getByLabel('Project title', { exact: true }).click();
    await expect(options).toHaveCount(0);

    await trigger.click();
    await page.keyboard.press('Tab');
    await expect(options).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeFocused();
    await trigger.click();
    await page.keyboard.press('Shift+Tab');
    await expect(options).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    const bounds = (await page.locator('.item-shape-popover').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(12);
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewportWidth - 12);
    expect(bounds.y).toBeGreaterThanOrEqual(12);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(832);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/shape-picker-mobile-${colorScheme}.png` });
    await page.getByRole('option', { name: 'Circle', exact: true }).click();
    await expect(trigger).toHaveAttribute('data-value', 'circle');
  });
}
