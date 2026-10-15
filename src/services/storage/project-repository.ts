import { parseProject, type Project } from '@/core/schema';
import { TierDatabase, type Asset } from './database';

export class SaveConflictError extends Error {
  constructor() {
    super(
      'This project changed or was deleted in another tab. Save a copy of your work, then reload the latest version.',
    );
    this.name = 'SaveConflictError';
  }
}

export class ProjectRepository {
  private pending = new Map<string, Promise<unknown>>();
  private revisions = new Map<string, number>();

  constructor(readonly database: TierDatabase) {}

  list(): Promise<Project[]> {
    return this.database.projects.orderBy('updatedAt').reverse().toArray();
  }

  async get(id: string): Promise<Project | undefined> {
    await this.pending.get(id);
    const project = await this.database.projects.get(id);
    if (project) this.revisions.set(id, project.storageRevision ?? 0);
    return project ? parseProject(project) : undefined;
  }

  save(project: Project): Promise<void> {
    const pending = (this.pending.get(project.id) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const revision = await this.database.transaction('rw', this.database.projects, async () => {
          const current = await this.database.projects.get(project.id);
          const expected = this.revisions.get(project.id);
          if (current ? expected !== (current.storageRevision ?? 0) : expected !== undefined)
            throw new SaveConflictError();
          const revision = (current?.storageRevision ?? 0) + 1;
          await this.database.projects.put({ ...project, storageRevision: revision });
          return revision;
        });
        this.revisions.set(project.id, revision);
      });
    this.pending.set(project.id, pending);
    void pending
      .finally(() => {
        if (this.pending.get(project.id) === pending) this.pending.delete(project.id);
      })
      .catch(() => {});
    return pending;
  }

  async importProject(project: Project, assets: Asset[]): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.projects,
      this.database.assets,
      async () => {
        await this.database.assets.bulkPut(assets);
        await this.database.projects.add({ ...parseProject(project), storageRevision: 1 });
      },
    );
    this.revisions.set(project.id, 1);
  }

  async delete(id: string, keepAssets = false): Promise<void> {
    await this.pending.get(id)?.catch(() => {});
    await this.database.transaction(
      'rw',
      this.database.projects,
      this.database.assets,
      async () => {
        await this.database.projects.delete(id);
        if (!keepAssets) await this.database.assets.where('projectId').equals(id).delete();
      },
    );
  }

  async assets(id: string, assetIds?: string[]): Promise<Asset[]> {
    if (!assetIds) return this.database.assets.where('projectId').equals(id).toArray();
    const assets = await this.database.assets.bulkGet([...new Set(assetIds)]);
    return assets.filter((asset): asset is Asset => asset !== undefined && asset.projectId === id);
  }

  async flush(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending.values()]);
  }

  async collectUnusedAssets(id: string): Promise<number> {
    await this.pending.get(id);
    return this.database.transaction(
      'rw',
      this.database.projects,
      this.database.assets,
      async () => {
        const project = await this.database.projects.get(id);
        if (!project) return this.database.assets.where('projectId').equals(id).delete();
        const used = new Set(
          Object.values(project.items).flatMap((item) => (item.assetId ? [item.assetId] : [])),
        );
        const unused = (
          await this.database.assets.where('projectId').equals(id).primaryKeys()
        ).filter((key) => !used.has(key));
        await this.database.assets.bulkDelete(unused);
        return unused.length;
      },
    );
  }

  async addAssets(assets: Asset[]): Promise<void> {
    await this.database.assets.bulkPut(assets);
  }
}
