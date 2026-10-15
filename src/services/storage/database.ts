import Dexie, { type EntityTable } from 'dexie';
import type { Project } from '@/core/schema';

export type Asset = {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  blob: Blob;
  thumbnail?: Blob;
};

export class TierDatabase extends Dexie {
  projects!: EntityTable<Project & { storageRevision?: number }, 'id'>;
  assets!: EntityTable<Asset, 'id'>;

  constructor(name = 'tier-studio') {
    super(name);
    this.version(1).stores({ projects: 'id, updatedAt', assets: 'id, projectId' });
  }
}
