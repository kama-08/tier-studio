/* oxlint-disable jsx-a11y/prefer-tag-over-role -- This custom listbox needs SVG icons and captions inside its options. */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import {
  Check,
  ChevronDown,
  Circle,
  Image,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  type LucideIcon,
} from 'lucide-react';
import { ITEM_SHAPES, type ItemShape } from '@/core/schema';

const SHAPES: Record<ItemShape, { label: string; hint: string; icon: LucideIcon }> = {
  square: { label: 'Square', hint: '1:1', icon: Square },
  vertical: { label: 'Vertical', hint: '3:4', icon: RectangleVertical },
  horizontal: { label: 'Horizontal', hint: '4:3', icon: RectangleHorizontal },
  circle: { label: 'Circle', hint: '1:1', icon: Circle },
  original: { label: 'Original', hint: 'No crop', icon: Image },
};

export function ItemShapePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ItemShape;
  onChange: (shape: ItemShape) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const expanded = open && !disabled;
  const current = SHAPES[value];
  const CurrentIcon = current.icon;

  function closeAndFocus() {
    setOpen(false);
    trigger.current?.focus();
  }

  useLayoutEffect(() => {
    if (!expanded) return;
    const popup = panel.current!;
    const button = trigger.current!;
    function position() {
      const anchor = button.getBoundingClientRect();
      const { width, height } = popup.getBoundingClientRect();
      const viewport = document.documentElement;
      const left = Math.max(12, Math.min(anchor.left, viewport.clientWidth - width - 12));
      const top =
        anchor.bottom + height + 8 <= viewport.clientHeight - 12
          ? anchor.bottom + 8
          : Math.max(12, anchor.top - height - 8);
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    position();
    popup.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [expanded, value]);

  function dismissOnBlur(event: FocusEvent<HTMLElement>) {
    if (!root.current?.contains(event.relatedTarget)) setOpen(false);
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocus();
      return;
    }
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      closeAndFocus();
      return;
    }
    const options = Array.from(
      panel.current!.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    const index = options.findIndex((option) => option === document.activeElement);
    const last = options.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? (index + 1) % options.length
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? (index - 1 + options.length) % options.length
              : undefined;
    if (next !== undefined) {
      event.preventDefault();
      options[next].focus();
    }
  }

  return (
    <div className="item-shape-control" role="group" aria-label="Item shape picker" ref={root}>
      <span>Shape</span>
      <button
        type="button"
        className="item-shape-trigger"
        ref={trigger}
        aria-label={`Item shape: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        data-value={value}
        disabled={disabled}
        onClick={() => setOpen((previous) => !previous)}
        onBlur={dismissOnBlur}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && expanded) {
            event.preventDefault();
            event.stopPropagation();
            closeAndFocus();
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CurrentIcon size={16} strokeWidth={1.7} aria-hidden="true" />
        <span>{current.label}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="item-shape-popover" ref={panel}>
          <p className="item-shape-title" id={`${id}-title`}>
            Item shape
          </p>
          <div
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={`${id}-title`}
            className="item-shape-options"
            onKeyDown={navigate}
            onBlur={dismissOnBlur}
          >
            {ITEM_SHAPES.map((shape) => {
              const { label, hint, icon: Icon } = SHAPES[shape];
              const selected = shape === value;
              return (
                <button
                  key={shape}
                  type="button"
                  role="option"
                  aria-label={label}
                  aria-selected={selected}
                  className="item-shape-option"
                  tabIndex={-1}
                  onClick={() => {
                    onChange(shape);
                    closeAndFocus();
                  }}
                >
                  <span className="item-shape-preview">
                    <Icon size={30} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="item-shape-name">{label}</span>
                  <span className="item-shape-hint">{hint}</span>
                  {selected ? (
                    <Check className="item-shape-check" size={11} aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
