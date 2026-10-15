import type { Project } from '@/core/schema';
import { getAppearance } from '@/core/appearance';
import { getItemAspectRatio, getTierLayout } from '@/core/layout';
import { wrapText } from './text-layout';

export type BoardExportLayout = Awaited<ReturnType<typeof measureBoardLayout>>;

// Measure an isolated copy so editor controls do not reserve space in the PNG.
// The visible editor stays untouched, including during image/font decoding.
export async function measureBoardLayout(board: HTMLElement | null, project: Project) {
  if (!board) throw new Error('The board is not ready to export yet.');
  const width = getAppearance(project).exportWidth || board.getBoundingClientRect().width;
  if (width <= 0) throw new Error('The board must be visible to export it.');
  const owner = board.ownerDocument;
  const snapshot = owner.createElement('div');
  snapshot.dataset.exportSnapshot = '';
  snapshot.inert = true;
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;visibility:hidden;pointer-events:none;`;
  const copy = board.cloneNode(true) as HTMLElement;
  snapshot.append(copy);
  if (getAppearance(project).exportUnranked) {
    const pool = board.parentElement?.querySelector('.unranked-section');
    if (pool) snapshot.append(pool.cloneNode(true));
  }
  if (getAppearance(project).exportWidth) {
    const appearance = getAppearance(project);
    // A fixed-width export uses the saved style even when the editor's mobile
    // defaults would otherwise override label size and row padding.
    for (const section of snapshot.querySelectorAll<HTMLElement>(
      '.tier-board, .unranked-section',
    )) {
      section.style.setProperty('--label-width', `${appearance.labelWidth}px`);
      section.style.setProperty('--label-font-size', `${appearance.labelFontSize}px`);
      section.style.setProperty('--tier-padding', `${appearance.tierPadding}px`);
    }
    snapshot.querySelectorAll<HTMLElement>('.tier-label').forEach((label) => {
      label.style.padding = '8px';
    });
  }
  snapshot
    .querySelectorAll('.tier-row-actions, .item-options, .tier-label svg')
    .forEach((element) => element.remove());
  snapshot.querySelectorAll('[id], [data-testid]').forEach((element) => {
    element.removeAttribute('id');
    element.removeAttribute('data-testid');
  });
  (board.parentElement ?? owner.body).append(snapshot);
  try {
    await owner.fonts.ready;
    await Promise.all(Array.from(snapshot.querySelectorAll('img'), (image) => image.decode()));
    refitSnapshot(copy, project);
    return readBoardLayout(copy, project);
  } finally {
    snapshot.remove();
  }
}

function refitSnapshot(board: HTMLElement, project: Project) {
  const appearance = getAppearance(project);
  const shape = project.itemShape ?? 'square';
  const aspectRatio = getItemAspectRatio(shape);
  for (const area of board.parentElement!.querySelectorAll<HTMLElement>('.tier-drop-area')) {
    const style = getComputedStyle(area);
    const contentWidth = Math.max(
      1,
      area.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth),
    );
    area.style.setProperty('--item-max-width', `${contentWidth}px`);
    if (shape === 'original' || area.classList.contains('pool-drop-area')) continue;
    const tier = project.tiers.find((tier) => tier.id === area.parentElement?.dataset.tierId);
    if (!tier) throw new Error('The board is not ready to export yet.');
    const layout = getTierLayout(
      tier.itemIds.length,
      contentWidth,
      aspectRatio,
      appearance.itemSize,
      appearance.itemGap,
    );
    area.style.gridTemplateColumns = `repeat(${layout.columns}, ${layout.tileWidth}px)`;
    area.style.gridTemplateRows = `repeat(${layout.lineCounts.length}, ${layout.tileHeight}px)`;
    const tiles = new Map(
      Array.from(area.querySelectorAll<HTMLElement>('[data-item-id]'), (tile) => [
        tile.dataset.itemId,
        tile,
      ]),
    );
    tier.itemIds.forEach((id, index) => {
      const tile = tiles.get(id);
      if (!tile) throw new Error('The board is not ready to export yet.');
      tile.style.width = `${layout.tileWidth}px`;
      tile.style.height = `${layout.tileHeight}px`;
      tile.style.gridRow = String(layout.positions[index].row + 1);
      tile.style.gridColumn = String(layout.positions[index].column + 1);
    });
  }
}

function readBoardLayout(board: HTMLElement, project: Project) {
  const appearance = getAppearance(project);
  const poolSection = appearance.exportUnranked
    ? board.parentElement?.querySelector<HTMLElement>('.unranked-section')
    : null;
  const baseHeaderHeight = appearance.exportTitle
    ? appearance.exportDescription
      ? 108
      : 84
    : appearance.exportDescription
      ? 64
      : 0;
  const footerHeight = appearance.exportFooter ? 48 : 0;
  const bounds = board.getBoundingClientRect();
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('Image export is unavailable.');
  const editor = board.closest('.editor-page');
  const family = (selector: string) => {
    const element = editor?.querySelector(selector);
    return getComputedStyle(element ?? board).fontFamily;
  };
  const titleFont = `600 30px ${family('.project-title-input')}`;
  const descriptionFont = `14px ${family('.project-description-input')}`;
  const headerLines = (text: string, font: string) => {
    context.font = font;
    return wrapText(
      text,
      Math.max(1, bounds.width - 48),
      (value) => context.measureText(value).width,
    );
  };
  const titleLines = appearance.exportTitle ? headerLines(project.title, titleFont) : [];
  const descriptionLines = appearance.exportDescription
    ? headerLines(project.description || 'A ranking by me.', descriptionFont)
    : [];
  const titleExtra = Math.max(0, titleLines.length - 1) * 36;
  const headerHeight =
    baseHeaderHeight + titleExtra + Math.max(0, descriptionLines.length - 1) * 20;
  if (bounds.width <= 0) throw new Error('The board must be visible to export it.');
  const rows = new Map(
    Array.from(board.querySelectorAll<HTMLElement>('.tier-row'), (row) => [
      row.dataset.tierId,
      row,
    ]),
  );
  const rectangle = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - bounds.left,
      y: headerHeight + rect.top - bounds.top,
      width: rect.width,
      height: rect.height,
    };
  };
  const boxStyle = (element: Element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderWidth: parseFloat(style.borderTopWidth),
      borderStyle: style.borderTopStyle,
      radius: parseFloat(style.borderTopLeftRadius),
    };
  };
  const measureItems = (container: Element, ids: string[]) => {
    const tiles = new Map(
      Array.from(container.querySelectorAll<HTMLElement>('[data-item-id]'), (tile) => [
        tile.dataset.itemId,
        tile,
      ]),
    );
    return ids.map((id) => {
      const tile = tiles.get(id);
      if (!tile) throw new Error('The board is not ready to export yet.');
      const text = tile.querySelector('.tile-drag-area > span');
      const style = getComputedStyle(text ?? tile);
      return {
        id,
        ...rectangle(tile),
        text: {
          font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          color: style.color,
          lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5,
          padding: parseFloat(style.paddingLeft),
        },
      };
    });
  };
  const tiers = project.tiers.map((tier) => {
    const row = rows.get(tier.id);
    const label = row?.querySelector('.tier-label');
    if (!row || !label) throw new Error('The board is not ready to export yet.');
    const labelText = label.querySelector('span');
    const labelStyle = getComputedStyle(labelText ?? label);
    return {
      id: tier.id,
      ...rectangle(row),
      style: boxStyle(row),
      label: {
        ...rectangle(label),
        color: labelStyle.color,
        fontSize: parseFloat(labelStyle.fontSize),
        fontWeight: labelStyle.fontWeight,
        fontFamily: labelStyle.fontFamily,
        lineHeight: parseFloat(labelStyle.lineHeight),
        align: labelStyle.textAlign as CanvasTextAlign,
        padding: parseFloat(getComputedStyle(label).paddingLeft),
      },
      items: measureItems(row, tier.itemIds),
    };
  });
  const pool = poolSection?.querySelector<HTMLElement>('.pool-drop-area');
  if (appearance.exportUnranked && (!poolSection || !pool))
    throw new Error('The Unranked list is not ready to export yet.');
  const unranked =
    poolSection && pool
      ? {
          ...rectangle(pool),
          style: boxStyle(pool),
          items: measureItems(pool, project.unranked),
          heading: rectangle(poolSection.querySelector('h2')!),
        }
      : null;
  const contentHeight = poolSection
    ? poolSection.getBoundingClientRect().bottom - bounds.top
    : bounds.height;
  const theme = getComputedStyle(document.documentElement);
  return {
    width: bounds.width,
    height: headerHeight + contentHeight + footerHeight,
    headerHeight,
    header: {
      titleFont,
      descriptionFont,
      titleLines,
      descriptionLines,
      descriptionY: (appearance.exportTitle ? 76 : 40) + titleExtra,
    },
    tiers,
    unranked,
    colors: {
      background: theme.getPropertyValue('--app-background').trim(),
      text: theme.getPropertyValue('--color-ink').trim(),
      secondary: theme.getPropertyValue('--color-secondary').trim(),
      line: theme.getPropertyValue('--color-line').trim(),
    },
  };
}
