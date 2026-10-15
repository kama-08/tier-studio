import type { Page } from '@playwright/test';

// The intended PNG is the board laid out without editor controls. Use the real
// editor's ResizeObserver to obtain that reference, independently of export code.
export async function withoutRowActions<T>(page: Page, read: () => Promise<T>): Promise<T> {
  const styles = await page.addStyleTag({
    content: '.tier-row-actions { display: none !important; }',
  });
  const settle = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  try {
    await settle();
    return await read();
  } finally {
    await styles.evaluate((element) => element.parentNode?.removeChild(element));
    await settle();
  }
}
