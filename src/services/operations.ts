const pending = new Set<Promise<unknown>>();

export const hasPendingOperations = () => pending.size > 0;

export async function trackOperation<T>(operation: () => Promise<T>): Promise<T> {
  const task = operation();
  pending.add(task);
  try {
    return await task;
  } finally {
    pending.delete(task);
  }
}

export async function waitForOperations(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}
