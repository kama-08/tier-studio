import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STYLE_PRESETS } from '@/core/style-presets';
import { deleteStylePreset, loadStylePresets, saveStylePreset } from './style-presets';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('reusable styles', () => {
  it('persists styles, replaces names case-insensitively, and deletes by ID', () => {
    expect(loadStylePresets()).toEqual([]);
    const [first] = saveStylePreset('My style', STYLE_PRESETS[0].style);
    const [updated] = saveStylePreset(' my STYLE ', STYLE_PRESETS[2].style);
    expect(updated.id).toBe(first.id);
    expect(loadStylePresets()).toEqual([updated]);
    expect(updated.style.appearance.itemSize).toBe(120);
    expect(deleteStylePreset(first.id)).toEqual([]);
    expect(loadStylePresets()).toEqual([]);
  });
  it('enforces limits and keeps valid presets intact on a rejected save', () => {
    expect(() => saveStylePreset('   ', STYLE_PRESETS[0].style)).toThrow(/name/);
    for (let index = 0; index < 20; index++)
      saveStylePreset(`Style ${index}`, STYLE_PRESETS[0].style);
    expect(() => saveStylePreset('One too many', STYLE_PRESETS[0].style)).toThrow(/20 styles/);
    expect(loadStylePresets()).toHaveLength(20);
    expect(saveStylePreset('Style 1', STYLE_PRESETS[1].style)).toHaveLength(20);
  });
  it('surfaces corrupt or unavailable storage without silently overwriting it', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken' });
    expect(() => loadStylePresets()).toThrow(/JSON/);
    expect(() => saveStylePreset('New', STYLE_PRESETS[0].style)).toThrow(/JSON/);
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    });
    expect(() => saveStylePreset('New', STYLE_PRESETS[0].style)).toThrow('Quota exceeded');
  });
});
