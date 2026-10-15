import { projects } from '@/app/services';
import { mapConcurrent } from '@/core/async-pool';

const lockName = (id: string) => `tier-studio:assets:${id}`;

// Shared locks live as long as an editor, including its undo history. The browser
// releases locks if a tab crashes; cleanup needs an exclusive lock to proceed.
export function retainEditorAssets(id: string): () => void {
  if (!navigator.locks) return () => {};
  let release!: () => void;
  const lifetime = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = navigator.locks.request(lockName(id), { mode: 'shared' }, () => lifetime);
  return () => {
    release();
    void held.then(() => collectIdleAssets(id)).catch(console.error);
  };
}

export async function collectIdleAssets(id: string): Promise<boolean> {
  // Without Web Locks there is no safe way to know whether another tab still
  // needs an image for undo, so retain images rather than collecting them.
  if (!navigator.locks) return false;
  return navigator.locks.request(lockName(id), { ifAvailable: true }, async (lock) => {
    if (!lock) return false;
    await projects.collectUnusedAssets(id);
    return true;
  });
}

export async function deleteStoredProject(id: string): Promise<void> {
  // Keep images available for a backup in an editor whose project was deleted
  // elsewhere. The last editor release collects them once they are no longer used.
  if (!navigator.locks) {
    await projects.delete(id, true);
    return;
  }
  await navigator.locks.request(lockName(id), { ifAvailable: true }, async (lock) => {
    await projects.delete(id, !lock);
  });
}

export async function collectLibraryAssets(): Promise<boolean> {
  if (!navigator.locks) return true;
  const ids = await projects.database.assets.orderBy('projectId').uniqueKeys();
  const collected = await mapConcurrent(ids, 4, (id) => collectIdleAssets(String(id)));
  return collected.every(Boolean);
}

export async function withProjectAssets<T>(id: string, operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return operation();
  return navigator.locks.request(lockName(id), { mode: 'shared' }, operation);
}
