import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { unpackProject } from '../../src/services/project-files/archive';

test('a stale tab preserves its work as a backup and reloads the saved version', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByLabel('Project title', { exact: true })).toHaveValue(
    'The little things',
  );

  await page.getByLabel('Project title', { exact: true }).fill('Saved in tab A');
  await page.getByLabel('Project title', { exact: true }).press('Enter');
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await second.getByLabel('Project description', { exact: true }).fill('My unsaved work in tab B');
  await second.getByLabel('Project description', { exact: true }).press('Enter');
  await expect(second.getByRole('alert')).toContainText('another tab');
  await expect(second.getByRole('button', { name: 'Add images', exact: true })).toBeDisabled();
  await expect(second.getByLabel('Project title', { exact: true })).toBeDisabled();

  const downloading = second.waitForEvent('download');
  await second.getByRole('button', { name: 'Save project copy', exact: true }).click();
  const download = await downloading;
  const backup = unpackProject(new Uint8Array(await readFile((await download.path())!)));
  expect(backup.project.description).toBe('My unsaved work in tab B');
  await page.reload();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('Saved in tab A');
  await expect(page.getByLabel('Project description', { exact: true })).not.toHaveValue(
    'My unsaved work in tab B',
  );
  await second.getByRole('button', { name: 'Reload latest', exact: true }).click();
  await expect(second.getByLabel('Project title', { exact: true })).toHaveValue('Saved in tab A');
  await second.getByLabel('Project description', { exact: true }).fill('Resolved from tab B');
  await second.getByLabel('Project description', { exact: true }).press('Enter');
  await expect(second.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Project description', { exact: true })).toHaveValue(
    'Resolved from tab B',
  );
});

test('deleting in another tab does not resurrect the project on a stale edit', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample', exact: true }).click();
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByLabel('Project title', { exact: true })).toHaveValue(
    'The little things',
  );
  await page.getByRole('link', { name: 'My projects', exact: true }).last().click();
  await page.getByRole('button', { name: 'Delete The little things', exact: true }).click();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open The little things' })).toHaveCount(0);
  await second.getByLabel('Project title', { exact: true }).fill('Resurrected?');
  await second.getByLabel('Project title', { exact: true }).press('Enter');
  await expect(second.getByRole('alert')).toContainText('deleted');
  await second.getByRole('button', { name: 'Reload latest', exact: true }).click();
  await expect(second.getByRole('heading', { name: 'My projects', exact: true })).toBeVisible();
  await expect(second.getByRole('link', { name: 'Open Resurrected?' })).toHaveCount(0);
});
