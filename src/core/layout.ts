import type { ItemShape } from './schema';

export const TILE_SIZE = 92;
export const MIN_TILE_SIZE = 64;
export const TILE_GAP = 8;

export function getItemAspectRatio(shape: ItemShape) {
  return shape === 'vertical' ? 3 / 4 : shape === 'horizontal' ? 4 / 3 : 1;
}

export function getTierLayout(
  count: number,
  contentWidth: number,
  aspectRatio = 1,
  itemSize = TILE_SIZE,
  gap = TILE_GAP,
) {
  const widthFactor = Math.min(1, aspectRatio);
  const singleLineCapacity = Math.max(
    1,
    Math.floor((contentWidth + gap) / (Math.min(MIN_TILE_SIZE, itemSize) * widthFactor + gap)),
  );
  // Scale the wrapped-row minimum down for compact sizes. A fixed 64px minimum
  // prevents compact tiles from shrinking slightly to fit another column.
  const wrappedMinimum = Math.min(MIN_TILE_SIZE, itemSize * (MIN_TILE_SIZE / TILE_SIZE));
  const wrappedCapacity = Math.max(
    1,
    Math.floor((contentWidth + gap) / (wrappedMinimum * widthFactor + gap)),
  );
  // Keep a tier on one line when its tiles can stay above the minimum size.
  // Otherwise fit one more column than fixed-size tiles would allow, shrinking
  // every tile uniformly so resizing cannot leave a nearly empty grid cell.
  const columns =
    count <= singleLineCapacity
      ? Math.max(1, count)
      : Math.min(
          wrappedCapacity,
          Math.max(1, Math.ceil((contentWidth + gap) / (itemSize * widthFactor + gap))),
        );
  const fittedSize = (contentWidth - (columns - 1) * gap) / columns;
  // Wrapping must not enlarge tiles beyond their normal size in other tiers.
  const size = Math.max(1, Math.min(itemSize * widthFactor, fittedSize));
  // Round down to a CSS layout unit so fractional widths never overflow.
  const tileWidth = Math.floor(size * 64) / 64;
  const tileHeight = tileWidth / aspectRatio;
  const tileSize = Math.max(tileWidth, tileHeight);
  const lines = Math.max(1, Math.ceil(count / columns));
  const lineCounts = Array.from({ length: lines }, (_, line) =>
    Math.min(columns, count - line * columns),
  );
  const positions = lineCounts.flatMap((lineCount, row) =>
    Array.from({ length: lineCount }, (_, column) => ({ row, column })),
  );
  return { tileSize, tileWidth, tileHeight, columns, lineCounts, positions };
}
