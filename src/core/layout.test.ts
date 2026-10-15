import { describe, expect, it } from 'vitest';
import { getItemAspectRatio, getTierLayout, TILE_GAP } from './layout';

describe('tier layout', () => {
  it('fits vertical and horizontal items without stretching their proportions or enlarging them', () => {
    for (const shape of ['vertical', 'horizontal'] as const) {
      const ratio = getItemAspectRatio(shape);
      for (const width of [220, 679, 900, 985, 1064]) {
        const layout = getTierLayout(14, width, ratio);
        expect(layout.tileWidth / layout.tileHeight).toBeCloseTo(ratio, 6);
        expect(layout.tileSize).toBeLessThanOrEqual(92);
        expect(layout.tileSize).toBeGreaterThanOrEqual(64 - 1 / 64 / ratio);
        expect(
          layout.columns * layout.tileWidth + (layout.columns - 1) * TILE_GAP,
        ).toBeLessThanOrEqual(width);
        expect(layout.positions).toHaveLength(14);
      }
    }
  });
  it('fits eleven items with a small uniform reduction instead of wrapping ten plus one', () => {
    const layout = getTierLayout(11, 1064);
    expect(layout.lineCounts).toEqual([11]);
    expect(layout.tileSize).toBeGreaterThan(89);
    expect(layout.tileSize).toBeLessThan(90);
    expect(layout.tileSize * 11 + TILE_GAP * 10).toBeLessThanOrEqual(1064);
  });

  it('fills wrapped lines without making tiles larger than those in sparse tiers', () => {
    const layout = getTierLayout(13, 900);
    expect(layout.lineCounts).toEqual([10, 3]);
    expect(layout.tileSize).toBeLessThanOrEqual(getTierLayout(1, 900).tileSize);
    expect(layout.positions[9]).toEqual({ row: 0, column: 9 });
    expect(layout.positions[10]).toEqual({ row: 1, column: 0 });
    expect(layout.positions[12]).toEqual({ row: 1, column: 2 });
  });

  it('fits compact tiles into the next column with a slight reduction instead of leaving a tile-sized gap', () => {
    const layout = getTierLayout(15, 740, 1, 64, 4);
    expect(layout.lineCounts).toEqual([11, 4]);
    expect(layout.tileSize).toBeGreaterThan(63);
    expect(layout.tileSize).toBeLessThan(64);
    expect(740 - (layout.columns * layout.tileWidth + (layout.columns - 1) * 4)).toBeLessThan(
      layout.columns / 64,
    );
    expect(layout.tileSize).toBeLessThanOrEqual(getTierLayout(1, 740, 1, 64, 4).tileSize);
  });

  it('fills wrapped rows at custom sizes whenever the next column fits within the proportional minimum', () => {
    for (const itemSize of [48, 56, 64, 72, 92, 120, 160]) {
      for (const gap of [0, 4, 8, 24]) {
        for (const shape of ['square', 'vertical', 'horizontal'] as const) {
          const ratio = getItemAspectRatio(shape);
          const factor = Math.min(1, ratio);
          for (const width of [90, 208, 220, 420, 537, 740, 900, 985, 1064]) {
            const layout = getTierLayout(100, width, ratio, itemSize, gap);
            const preferredColumns = Math.ceil((width + gap) / (itemSize * factor + gap));
            const fittedWidth = (width - (preferredColumns - 1) * gap) / preferredColumns;
            const minimum = Math.min(64, itemSize * (64 / 92));
            if (fittedWidth < minimum * factor) continue;
            expect(layout.lineCounts.length).toBeGreaterThan(1);
            expect(
              width - (layout.columns * layout.tileWidth + (layout.columns - 1) * gap),
            ).toBeLessThan(layout.columns / 64);
            expect(layout.tileSize).toBeLessThanOrEqual(itemSize);
            expect(layout.tileSize).toBeGreaterThanOrEqual(minimum - 1 / 64 / ratio);
            expect(layout.tileWidth / layout.tileHeight).toBeCloseTo(ratio, 6);
          }
        }
      }
    }
  });

  it('refits wrapped tiles when resizing would otherwise leave almost a tile of space', () => {
    const layout = getTierLayout(14, 985);
    expect(layout.lineCounts).toEqual([10, 4]);
    expect(layout.tileSize).toBeGreaterThan(91);
    expect(layout.tileSize).toBeLessThan(92);
    expect(985 - (layout.columns * layout.tileSize + (layout.columns - 1) * TILE_GAP)).toBeLessThan(
      layout.columns / 64,
    );
  });

  it('fills every line on narrow screens and keeps the last item the same size', () => {
    const layout = getTierLayout(13, 220);
    expect(layout.lineCounts).toEqual([3, 3, 3, 3, 1]);
    expect(layout.tileSize).toBe(68);
    expect(layout.positions).toHaveLength(13);
  });

  it('does not enlarge sparse tiers and reserves a usable empty drop target', () => {
    expect(getTierLayout(1, 1064).tileSize).toBe(92);
    expect(getTierLayout(0, 1064)).toMatchObject({ tileSize: 92, lineCounts: [0], positions: [] });
  });

  it('keeps full wrapped lines filled across resize thresholds', () => {
    // Below 208px, filling a line can require tiles outside the 64–92px limits.
    for (let width = 208; width <= 1400; width++) {
      for (const count of [13, 14, 27, 100]) {
        const layout = getTierLayout(count, width);
        const unusedWidth =
          layout.lineCounts.length > 1
            ? width - (layout.columns * layout.tileSize + (layout.columns - 1) * TILE_GAP)
            : 0;
        expect(unusedWidth).toBeGreaterThanOrEqual(0);
        expect(unusedWidth).toBeLessThan(layout.columns / 64);
        expect(layout.tileSize).toBeGreaterThanOrEqual(64);
        expect(layout.tileSize).toBeLessThanOrEqual(92);
      }
    }
  });

  it('stays within bounds across capacity thresholds and large projects', () => {
    for (const width of [
      56, 135, 136, 192, 193, 207, 208, 220, 280.5, 900, 1000, 1063.99, 1064, 1400,
    ]) {
      for (const count of [0, 1, 11, 13, 14, 27, 100, 2000]) {
        const layout = getTierLayout(count, width);
        const expectedWidth = Math.min(
          width,
          layout.columns * 92 + (layout.columns - 1) * TILE_GAP,
        );
        expect(layout.tileSize).toBeLessThanOrEqual(92);
        expect(layout.tileSize).toBeGreaterThanOrEqual(Math.min(64, width));
        expect(layout.positions).toHaveLength(count);
        expect(
          layout.columns * layout.tileSize + (layout.columns - 1) * TILE_GAP,
        ).toBeLessThanOrEqual(width);
        expect(
          expectedWidth - (layout.columns * layout.tileSize + (layout.columns - 1) * TILE_GAP),
        ).toBeLessThan(layout.columns / 64);
        expect(layout.lineCounts.slice(0, -1).every((count) => count === layout.columns)).toBe(
          true,
        );
        const remainingSpace =
          layout.lineCounts.length > 1
            ? width - (layout.columns * layout.tileSize + (layout.columns - 1) * TILE_GAP)
            : 0;
        expect(remainingSpace).toBeLessThan(layout.tileSize + TILE_GAP);
      }
    }
  });
});
