import { expect, it } from 'vitest';
import { mapConcurrent } from './async-pool';

it('bounds active jobs and preserves input order', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapConcurrent([5, 4, 3, 2, 1], 2, async (value) => {
    peak = Math.max(peak, ++active);
    await new Promise((done) => setTimeout(done, value));
    active--;
    return value * 2;
  });
  expect(result).toEqual([10, 8, 6, 4, 2]);
  expect(peak).toBe(2);
});

it('waits for in-flight jobs to clean up before reporting failure', async () => {
  let cleaned = false;
  await expect(
    mapConcurrent([0, 1, 2], 2, async (value) => {
      if (value === 0) throw new Error('Decode failed');
      await new Promise((done) => setTimeout(done, 5));
      cleaned = true;
      return value;
    }),
  ).rejects.toThrow('Decode failed');
  expect(cleaned).toBe(true);
});
