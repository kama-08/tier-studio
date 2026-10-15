import { describe, expect, it } from 'vitest';
import { appearanceSchema, DEFAULT_APPEARANCE, getAppearance } from './appearance';
import { STYLE_PRESETS } from './style-presets';
import { createSampleProject, getPlacements } from './project';
import { parseProject } from './schema';
import { commit, redo, startHistory, undo } from './history';
import { getItemAspectRatio, getTierLayout } from './layout';

describe('list customization', () => {
  it('opens old documents with unchanged defaults and validates imported settings', () => {
    const old = createSampleProject();
    expect(getAppearance(parseProject(old))).toEqual(DEFAULT_APPEARANCE);
    expect(appearanceSchema.parse({ itemSize: 120 })).toEqual({
      ...DEFAULT_APPEARANCE,
      itemSize: 120,
    });
    for (const invalid of [
      { itemSize: 0 },
      { itemGap: -1 },
      { labelWidth: 1000 },
      { imageFit: 'stretch' },
      { exportTransparent: 'yes' },
    ]) {
      expect(() => parseProject({ ...old, appearance: invalid })).toThrow(/appearance/);
    }
  });
  it('applies a complete preset in one undo step without altering content or placements', () => {
    const project = createSampleProject();
    const style = {
      ...STYLE_PRESETS[2].style,
      itemShape: 'circle' as const,
      colors: ['#111111', '#ffffff'],
    };
    const changed = commit(startHistory(project), { type: 'apply-style', style });
    expect(changed.past).toHaveLength(1);
    expect(changed.document.appearance?.itemSize).toBe(120);
    expect(changed.document.itemShape).toBe('circle');
    expect(changed.document.tiers.map((tier) => tier.color)).toEqual([
      '#111111',
      '#ffffff',
      '#111111',
      '#ffffff',
      '#111111',
    ]);
    expect(getPlacements(changed.document)).toEqual(getPlacements(project));
    expect(changed.document.items).toEqual(project.items);
    expect(undo(changed).document.appearance).toBeUndefined();
    expect(undo(changed).document.tiers).toEqual(project.tiers);
    expect(redo(undo(changed)).document.appearance).toEqual(style.appearance);
  });
  it('keeps custom sizes and gaps within bounds for every rectangular shape and narrow screens', () => {
    for (const itemSize of [48, 64, 92, 120, 160])
      for (const gap of [0, 8, 24])
        for (const width of [20, 90, 200, 537, 1000])
          for (const shape of ['square', 'vertical', 'horizontal'] as const) {
            const ratio = getItemAspectRatio(shape);
            const layout = getTierLayout(37, width, ratio, itemSize, gap);
            expect(layout.tileWidth / layout.tileHeight).toBeCloseTo(ratio, 5);
            expect(layout.tileSize).toBeLessThanOrEqual(itemSize);
            expect(layout.tileWidth).toBeGreaterThan(0);
            expect(
              layout.columns * layout.tileWidth + (layout.columns - 1) * gap,
            ).toBeLessThanOrEqual(width);
            expect(layout.positions).toHaveLength(37);
          }
  });
});
