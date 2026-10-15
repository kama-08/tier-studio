import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { createSampleProject } from '@/core/project';
import { TierDatabase } from './database';
import { ProjectRepository, SaveConflictError } from './project-repository';

const databases: TierDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

function repository() {
  const database = new TierDatabase(`test-${crypto.randomUUID()}`);
  databases.push(database);
  return new ProjectRepository(database);
}

describe('project persistence', () => {
  it('rejects stale saves from another connection and allows an explicit reload', async () => {
    const first = repository();
    const secondDb = new TierDatabase(first.database.name);
    databases.push(secondDb);
    const second = new ProjectRepository(secondDb);
    const project = createSampleProject();
    await first.save(project);
    const stale = (await second.get(project.id))!;
    await first.save({ ...project, title: 'Saved in the first tab' });
    await expect(
      second.save({ ...stale, description: 'Unsaved in the second tab' }),
    ).rejects.toBeInstanceOf(SaveConflictError);
    expect((await first.get(project.id))?.title).toBe('Saved in the first tab');
    const latest = (await second.get(project.id))!;
    await second.save({ ...latest, description: 'Resolved' });
    expect(await first.get(project.id)).toMatchObject({
      title: 'Saved in the first tab',
      description: 'Resolved',
    });
  });

  it('uses an atomic transaction when two tabs save at the same time', async () => {
    const first = repository();
    const second = new ProjectRepository(first.database);
    const project = createSampleProject();
    await first.save(project);
    await second.get(project.id);
    const results = await Promise.allSettled([
      first.save({ ...project, title: 'One' }),
      second.save({ ...project, title: 'Two' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await first.database.projects.get(project.id))?.storageRevision).toBe(2);
  });

  it('cannot resurrect a document deleted in another tab', async () => {
    const first = repository();
    const second = new ProjectRepository(first.database);
    const project = createSampleProject();
    await first.save(project);
    await second.get(project.id);
    await first.delete(project.id);
    await expect(second.save(project)).rejects.toBeInstanceOf(SaveConflictError);
    expect(await first.get(project.id)).toBeUndefined();
  });

  it('reads legacy records and excludes storage metadata from portable documents', async () => {
    const repo = repository();
    const project = createSampleProject();
    const legacy = new Dexie(repo.database.name);
    legacy.version(1).stores({ projects: 'id, updatedAt', assets: 'id, projectId' });
    await legacy.table('projects').put(project);
    legacy.close();
    await repo.save((await repo.get(project.id))!);
    expect((await repo.database.projects.get(project.id))?.storageRevision).toBe(1);
    expect(await repo.get(project.id)).not.toHaveProperty('storageRevision');
  });

  it('loads only requested assets and collects unreferenced images', async () => {
    const repo = repository();
    const project = createSampleProject();
    const item = Object.values(project.items)[0];
    item.assetId = 'used';
    const asset = {
      projectId: project.id,
      name: 'Image',
      mime: 'image/png',
      blob: new Blob(['bytes']),
    };
    await repo.importProject(project, [
      { ...asset, id: 'used' },
      { ...asset, id: 'unused' },
    ]);
    expect((await repo.assets(project.id, ['used', 'absent'])).map((entry) => entry.id)).toEqual([
      'used',
    ]);
    expect(await repo.collectUnusedAssets(project.id)).toBe(1);
    expect((await repo.assets(project.id)).map((entry) => entry.id)).toEqual(['used']);
    await repo.delete(project.id, true);
    expect(await repo.collectUnusedAssets(project.id)).toBe(1);
    expect(await repo.assets(project.id)).toEqual([]);
  });
  it('serializes overlapping saves so reopening gets the latest edit', async () => {
    const projects = repository();
    const project = createSampleProject();
    const first = projects.save({ ...project, title: 'First edit' });
    const second = projects.save({ ...project, title: 'Latest edit' });
    expect((await projects.get(project.id))?.title).toBe('Latest edit');
    await Promise.all([first, second]);
  });

  it('deletes a project and its assets together', async () => {
    const projects = repository();
    const project = createSampleProject();
    await projects.importProject(project, [
      {
        id: 'image',
        projectId: project.id,
        name: 'Image',
        mime: 'image/png',
        blob: new Blob(['image']),
      },
    ]);
    await projects.delete(project.id);
    expect(await projects.get(project.id)).toBeUndefined();
    expect(await projects.assets(project.id)).toEqual([]);
  });
});
