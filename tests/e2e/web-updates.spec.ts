import { resolve, sep } from 'node:path';
import { expect, test } from './fixtures';

// Serve the real production build on an isolated local origin. Changing only
// the worker's bytes exercises Chromium's actual install/wait/activate lifecycle.
function updateServer() {
  const root = resolve('dist/web');
  let revision = 1;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      if (pathname === '/sw.js') {
        return new Response(`// Revision ${revision}\n${await Bun.file(`${root}/sw.js`).text()}`, {
          headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' },
        });
      }
      const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!path.startsWith(`${root}${sep}`)) return new Response(null, { status: 404 });
      const file = Bun.file(path);
      return new Response((await file.exists()) ? file : Bun.file(`${root}/index.html`), {
        headers: { 'Cache-Control': 'no-store' },
      });
    },
  });
  return { url: server.url.href, nextVersion: () => revision++, stop: () => server.stop(true) };
}

test('applies a waiting app update on request and preserves the saved project', async ({
  page,
}) => {
  test.skip(!process.env.TEST_PRODUCTION, 'Requires the generated production service worker.');
  const server = updateServer();
  try {
    await page.goto(server.url);
    const github = page.getByRole('link', { name: 'GitHub (opens in a new tab)', exact: true });
    await expect(github.locator('svg').first()).toHaveAttribute('viewBox', '0 0 16 16');
    await expect(github.locator('svg').first()).toHaveAttribute('fill', 'currentColor');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
    await page.getByRole('button', { name: 'Text item', exact: true }).click();
    await page.getByLabel('Item name', { exact: true }).fill('Keep across updates');
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    const projectURL = page.url();

    server.nextVersion();
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    const prompt = page.getByRole('region', { name: 'Application update', exact: true });
    await expect(prompt).toBeVisible();
    await page.screenshot({ path: 'test-results/web-update-prompt.png' });
    await prompt.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(prompt).toBeHidden();
    expect(page.url()).toBe(projectURL);
    expect(
      await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting)),
    ).toBe(true);

    // A worker already waiting when the app opens must also produce the prompt.
    await page.reload();
    await expect(prompt).toBeVisible();
    await Promise.all([
      page.waitForEvent('load'),
      prompt.getByRole('button', { name: 'Update now', exact: true }).click(),
    ]);
    await expect(page.getByLabel('Project title', { exact: true })).toHaveValue(
      'The little things',
    );
    await expect(
      page.getByRole('button', { name: 'Drag Keep across updates', exact: true }),
    ).toBeVisible();
    await expect(prompt).toBeHidden();
    expect(page.url()).toBe(projectURL);
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting),
    ).toBeNull();
  } finally {
    await server.stop();
  }
});

test('does not activate an app update when the current project has a save conflict', async ({
  page,
  context,
}) => {
  test.skip(!process.env.TEST_PRODUCTION, 'Requires the generated production service worker.');
  const server = updateServer();
  try {
    await page.goto(server.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    const projectURL = page.url();
    const second = await context.newPage();
    await second.goto(projectURL);
    await expect(second.getByLabel('Project title', { exact: true })).toHaveValue(
      'The little things',
    );
    await second.getByLabel('Project title', { exact: true }).fill('Saved in another tab');
    await second.getByLabel('Project title', { exact: true }).press('Enter');
    await expect(second.getByText('All changes saved', { exact: true })).toBeVisible();
    await page
      .getByLabel('Project description', { exact: true })
      .fill('Keep my unsaved description');
    await page.getByLabel('Project description', { exact: true }).press('Enter');
    await expect(page.getByRole('alert')).toContainText('another tab');

    server.nextVersion();
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    const prompt = page.getByRole('region', { name: 'Application update', exact: true });
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Update now', exact: true }).click();
    await expect(prompt.getByRole('alert')).toContainText('another tab');
    await expect(prompt.getByRole('button', { name: 'Update now', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Project description', { exact: true })).toHaveValue(
      'Keep my unsaved description',
    );
    expect(page.url()).toBe(projectURL);
    expect(
      await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting)),
    ).toBe(true);
  } finally {
    await server.stop();
  }
});
