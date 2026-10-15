import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type CSSProperties,
} from 'react';
import { DragDropProvider, useDragOperation, useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { ChevronDown, ChevronUp, MoreHorizontal, Settings2 } from 'lucide-react';
import { getPlacements } from '@/core/project';
import { getItemAspectRatio, getTierLayout, TILE_SIZE } from '@/core/layout';
import { getAppearance, DEFAULT_APPEARANCE } from '@/core/appearance';
import {
  POOL_ID,
  type ItemShape,
  type Placements,
  type Project,
  type TierItem,
} from '@/core/schema';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '../editor-store';

const SortableItem = memo(function SortableItem({
  item,
  index,
  group,
  url,
  onOptions,
  row,
  column,
  shape,
  width,
  height,
}: {
  item: TierItem;
  index: number;
  group: string;
  url?: string;
  onOptions: (item: TierItem) => void;
  row?: number;
  column?: number;
  shape: ItemShape;
  width: number;
  height: number;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: item.id,
    index,
    group,
    type: 'item',
    accept: 'item',
  });
  return (
    <div
      ref={ref}
      className={`item-tile ${isDragSource ? 'item-dragging' : ''}`}
      style={{
        backgroundColor: item.color,
        width: shape === 'original' && url ? undefined : width,
        height: shape === 'original' && url ? undefined : height,
        gridRow: row === undefined ? undefined : row + 1,
        gridColumn: column === undefined ? undefined : column + 1,
      }}
      data-item-id={item.id}
      data-shape={shape}
      data-image={url ? 'true' : undefined}
    >
      <button
        type="button"
        ref={handleRef}
        className="tile-drag-area"
        aria-label={`Drag ${item.name}`}
        title={item.name}
      >
        {url ? <img src={url} alt={item.name} draggable={false} /> : <span>{item.name}</span>}
      </button>
      <button
        type="button"
        className="item-options"
        aria-label={`Options for ${item.name}`}
        onClick={() => onOptions(item)}
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
});

function DropArea({
  id,
  ids,
  project,
  urls,
  onOptions,
  dragging,
  pool = false,
}: {
  id: string;
  ids: string[];
  project: Project;
  urls: Record<string, string>;
  onOptions: (item: TierItem) => void;
  dragging: boolean;
  pool?: boolean;
}) {
  const { ref } = useDroppable({ id, type: 'tier', accept: 'item' });
  const { target } = useDragOperation();
  // Sortable items are drop targets too. Follow their current preview tier so
  // moving between an item and empty space keeps the same destination lit.
  const isDropTarget =
    dragging && target != null && (target.id === id || ids.includes(String(target.id)));
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState(TILE_SIZE);
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      elementRef.current = element;
      ref(element);
    },
    [ref],
  );
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const style = getComputedStyle(element);
    setContentWidth(
      element.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
    );
    const observer = new ResizeObserver(([entry]) => setContentWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [pool]);
  const shape = project.itemShape ?? 'square';
  const aspectRatio = getItemAspectRatio(shape);
  const appearance = getAppearance(project);
  const layout =
    pool || shape === 'original'
      ? undefined
      : getTierLayout(
          ids.length,
          contentWidth,
          aspectRatio,
          appearance.itemSize,
          appearance.itemGap,
        );
  return (
    <div
      ref={setRef}
      className={`tier-drop-area ${pool ? 'pool-drop-area' : ''} ${shape === 'original' ? 'original-drop-area' : ''} ${isDropTarget ? 'drop-active' : ''}`}
      style={
        {
          '--item-max-width': `${Math.max(1, contentWidth)}px`,
          ...(layout
            ? {
                gridTemplateColumns: `repeat(${layout.columns}, ${layout.tileWidth}px)`,
                gridTemplateRows: `repeat(${layout.lineCounts.length}, ${layout.tileHeight}px)`,
              }
            : {}),
        } as CSSProperties
      }
      data-testid={
        pool ? 'unranked-pool' : `tier-${project.tiers.findIndex((tier) => tier.id === id)}`
      }
    >
      {ids.map((itemId, index) => (
        <SortableItem
          key={itemId}
          item={project.items[itemId]}
          index={index}
          group={id}
          url={project.items[itemId].assetId ? urls[project.items[itemId].assetId!] : undefined}
          onOptions={onOptions}
          row={layout?.positions[index].row}
          column={layout?.positions[index].column}
          shape={shape}
          width={layout?.tileWidth ?? appearance.itemSize * Math.min(1, aspectRatio)}
          height={layout?.tileHeight ?? appearance.itemSize * Math.min(1, 1 / aspectRatio)}
        />
      ))}
    </div>
  );
}

export function TierBoard({
  project,
  urls,
  onTierEdit,
  onItemOptions,
  boardRef,
}: {
  project: Project;
  urls: Record<string, string>;
  onTierEdit: (id: string) => void;
  onItemOptions: (item: TierItem) => void;
  boardRef: RefObject<HTMLDivElement | null>;
}) {
  const execute = useEditorStore((state) => state.execute);
  const [preview, setPreview] = useState<Placements | null>(null);
  const previewRef = useRef<Placements | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const placements = preview ?? getPlacements(project);
  const appearance = getAppearance(project);
  const boardStyle = {
    '--item-size': `${appearance.itemSize}px`,
    '--item-gap': `${appearance.itemGap}px`,
    '--tier-padding':
      appearance.tierPadding === DEFAULT_APPEARANCE.tierPadding
        ? undefined
        : `${appearance.tierPadding}px`,
    '--tier-gap': `${appearance.tierGap}px`,
    '--label-width':
      appearance.labelWidth === DEFAULT_APPEARANCE.labelWidth
        ? undefined
        : `${appearance.labelWidth}px`,
    '--label-font-size':
      appearance.labelFontSize === DEFAULT_APPEARANCE.labelFontSize
        ? undefined
        : `${appearance.labelFontSize}px`,
    '--label-align': appearance.labelAlign,
    '--label-weight': appearance.labelBold ? 600 : 400,
    '--item-radius': `${appearance.itemRadius}px`,
    '--image-fit': appearance.imageFit,
    '--item-outline': appearance.itemBorder ? '1px solid var(--color-line)' : 'none',
    '--item-shadow': appearance.itemShadow ? '0 1px 3px #3543260b' : 'none',
    '--tier-border-style': appearance.borderStyle,
  } as CSSProperties;
  return (
    <DragDropProvider
      onDragStart={(event) => {
        const initial = getPlacements(project);
        previewRef.current = initial;
        setPreview(initial);
        const id = String(event.operation.source?.id);
        setAnnouncement(`Picked up ${project.items[id]?.name ?? 'item'}. Press Escape to cancel.`);
      }}
      onDragOver={(event) => {
        if (!previewRef.current) return;
        const next = move(previewRef.current, event);
        previewRef.current = next;
        setPreview(next);
      }}
      onDragEnd={(event) => {
        const next = previewRef.current;
        previewRef.current = null;
        setPreview(null);
        if (event.canceled || !event.operation.target || !next) {
          setAnnouncement('Move canceled.');
          return;
        }
        execute({ type: 'place-items', placements: move(next, event) });
        setAnnouncement('Item moved.');
      }}
    >
      <div className="tier-board" aria-label="Tier board" ref={boardRef} style={boardStyle}>
        {project.tiers.map((tier, index) => (
          <div
            className="tier-row"
            key={tier.id}
            data-tier-id={tier.id}
            style={{
              background: appearance.rowTint
                ? `color-mix(in srgb, var(--color-surface), ${tier.color} 14%)`
                : undefined,
            }}
          >
            <button
              className="tier-label"
              style={{ background: tier.color }}
              onClick={() => onTierEdit(tier.id)}
              aria-label={`Edit tier ${tier.label}`}
              title="Edit label and color"
            >
              <span>{tier.label}</span>
              <Settings2 size={13} />
            </button>
            <DropArea
              id={tier.id}
              ids={placements[tier.id]}
              project={project}
              urls={urls}
              onOptions={onItemOptions}
              dragging={preview !== null}
            />
            <div className="tier-row-actions">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move tier ${tier.label} up`}
                disabled={index === 0}
                onClick={() => execute({ type: 'move-tier', id: tier.id, direction: -1 })}
              >
                <ChevronUp size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move tier ${tier.label} down`}
                disabled={index === project.tiers.length - 1}
                onClick={() => execute({ type: 'move-tier', id: tier.id, direction: 1 })}
              >
                <ChevronDown size={16} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <section className="unranked-section" aria-labelledby="unranked-heading" style={boardStyle}>
        <div className="unranked-header">
          <div className="flex items-center gap-3">
            <h2 id="unranked-heading">Unranked</h2>
            <span className="count-badge">{placements[POOL_ID].length}</span>
          </div>
        </div>
        <DropArea
          id={POOL_ID}
          ids={placements[POOL_ID]}
          project={project}
          urls={urls}
          onOptions={onItemOptions}
          dragging={preview !== null}
          pool
        />
      </section>
      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>
    </DragDropProvider>
  );
}
