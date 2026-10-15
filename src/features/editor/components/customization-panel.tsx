import { useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Check, RotateCcw, Save, Trash2 } from 'lucide-react';
import { getAppearance, type Appearance } from '@/core/appearance';
import { COLOR_PALETTES, STYLE_PRESETS, type BoardStyle } from '@/core/style-presets';
import type { Project } from '@/core/schema';
import {
  deleteStylePreset,
  loadStylePresets,
  saveStylePreset,
  type SavedStylePreset,
} from '@/services/storage/style-presets';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

function RangeControl({
  label,
  value,
  min,
  max,
  onPreview,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const pending = useRef<number | null>(null);
  function finish() {
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    onCommit(next);
  }
  return (
    <label className="style-range">
      <span>
        {label}
        <output>{value} px</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          pending.current = next;
          onPreview(next);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyUp={finish}
        onBlur={finish}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="style-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="style-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

export function CustomizationPanel({
  open,
  project,
  onClose,
  onPreview,
  onCommit,
  onStyle,
  onPalette,
}: {
  open: boolean;
  project: Project;
  onClose: () => void;
  onPreview: (appearance: Appearance) => void;
  onCommit: (appearance: Appearance) => void;
  onStyle: (style: BoardStyle) => void;
  onPalette: (colors: string[]) => void;
}) {
  const appearance = getAppearance(project);
  const [initialPresets] = useState(() => {
    try {
      return { presets: loadStylePresets(), error: '' };
    } catch {
      return {
        presets: [] as SavedStylePreset[],
        error: 'Saved styles could not be loaded from this device.',
      };
    }
  });
  const [presets, setPresets] = useState(initialPresets.presets);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(initialPresets.error);
  function change<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    onCommit({ ...appearance, [key]: value });
  }
  function range(key: keyof Appearance, label: string, min: number, max: number) {
    return (
      <RangeControl
        key={key}
        label={label}
        value={appearance[key] as number}
        min={min}
        max={max}
        onPreview={(value) => onPreview({ ...appearance, [key]: value })}
        onCommit={(value) => change(key, value)}
      />
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title="Customize list" className="customize-dialog">
      <p className="style-intro">Changes preview live and save with this project.</p>
      <Section title="Style presets">
        <div className="style-preset-grid">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="style-preset"
              onClick={() => onStyle(preset.style)}
            >
              <span
                className={`preset-preview preset-preview-${preset.name.toLowerCase()}`}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
              </span>
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Items and spacing">
        {range('itemSize', 'Item size', 48, 160)}
        {range('itemGap', 'Item spacing', 0, 24)}
        {range('tierPadding', 'Tier padding', 0, 32)}
      </Section>
      <Section title="Tier labels">
        {range('labelWidth', 'Label width', 48, 200)}
        {range('labelFontSize', 'Label font size', 12, 40)}
        <div className="style-choice-row">
          <span>Alignment</span>
          <fieldset className="style-segments" aria-label="Label alignment">
            {(
              [
                { value: 'left', Icon: AlignLeft },
                { value: 'center', Icon: AlignCenter },
                { value: 'right', Icon: AlignRight },
              ] as const
            ).map(({ value, Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={`Align labels ${value}`}
                aria-pressed={appearance.labelAlign === value}
                onClick={() => change('labelAlign', value)}
              >
                <Icon size={17} />
              </button>
            ))}
          </fieldset>
        </div>
        <Toggle
          label="Bold labels"
          checked={appearance.labelBold}
          onChange={(value) => change('labelBold', value)}
        />
      </Section>
      <Section title="Board">
        <div className="style-palettes">
          {COLOR_PALETTES.map((palette) => (
            <button
              key={palette.name}
              type="button"
              className="style-palette"
              aria-label={`Use ${palette.name} colors`}
              onClick={() => onPalette(palette.colors)}
            >
              <span aria-hidden="true">
                {palette.colors.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
              {palette.name}
            </button>
          ))}
        </div>
        <Toggle
          label="Tint rows with tier colors"
          checked={appearance.rowTint}
          onChange={(value) => change('rowTint', value)}
        />
        <label className="style-choice-row">
          <span>Row borders</span>
          <select
            aria-label="Row borders"
            value={appearance.borderStyle}
            onChange={(event) =>
              change('borderStyle', event.target.value as Appearance['borderStyle'])
            }
          >
            <option value="none">None</option>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
          </select>
        </label>
        {range('tierGap', 'Tier spacing', 0, 24)}
      </Section>
      <Section title="Image appearance">
        <label className="style-choice-row">
          <span>Image fitting</span>
          <select
            aria-label="Image fitting"
            value={appearance.imageFit}
            onChange={(event) => change('imageFit', event.target.value as Appearance['imageFit'])}
          >
            <option value="cover">Crop to fill</option>
            <option value="contain">Fit entire image</option>
          </select>
        </label>
        {range('itemRadius', 'Corner radius', 0, 32)}
        {project.itemShape === 'circle' ? (
          <p className="style-help">Circle shapes keep circular corners.</p>
        ) : null}
        <Toggle
          label="Item borders"
          checked={appearance.itemBorder}
          onChange={(value) => change('itemBorder', value)}
        />
        <Toggle
          label="Item shadows"
          checked={appearance.itemShadow}
          onChange={(value) => change('itemShadow', value)}
        />
      </Section>
      <Section title="PNG export">
        <p className="style-help">Choose what appears in the exported image.</p>
        <Toggle
          label="Include title"
          checked={appearance.exportTitle}
          onChange={(value) => change('exportTitle', value)}
        />
        <Toggle
          label="Include description"
          checked={appearance.exportDescription}
          onChange={(value) => change('exportDescription', value)}
        />
        <Toggle
          label="Include Unranked"
          checked={appearance.exportUnranked}
          onChange={(value) => change('exportUnranked', value)}
        />
        <Toggle
          label="Include footer"
          checked={appearance.exportFooter}
          onChange={(value) => change('exportFooter', value)}
        />
        <Toggle
          label="Transparent background"
          checked={appearance.exportTransparent}
          onChange={(value) => change('exportTransparent', value)}
        />
      </Section>
      <Section title="Your saved styles">
        <p className="style-help">
          Reuse colors, shape, layout, and export options across projects on this device. Saving the
          same name replaces that style.
        </p>
        <form
          className="style-save-form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              setPresets(
                saveStylePreset(name, {
                  appearance,
                  itemShape: project.itemShape ?? 'square',
                  colors: project.tiers.map((tier) => tier.color),
                }),
              );
              setName('');
              setError('');
              setMessage('Style saved on this device.');
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Could not save this style.');
            }
          }}
        >
          <input
            className="text-input"
            aria-label="Style name"
            placeholder="Style name"
            maxLength={40}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button size="sm" type="submit" disabled={!name.trim()}>
            <Save size={14} /> Save style
          </Button>
        </form>
        <div className="saved-style-list">
          {presets.map((preset) => (
            <div key={preset.id}>
              <button
                type="button"
                onClick={() => {
                  onStyle(preset.style);
                  setMessage(`Applied ${preset.name}.`);
                }}
              >
                {preset.name}
              </button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete style ${preset.name}`}
                onClick={() => {
                  try {
                    setPresets(deleteStylePreset(preset.id));
                    setError('');
                    setMessage('Style deleted.');
                  } catch {
                    setError('Could not delete this style.');
                  }
                }}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
        {message ? <output className="style-help">{message}</output> : null}
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
      </Section>
      <div className="style-panel-actions">
        <Button variant="ghost" onClick={() => onStyle(STYLE_PRESETS[1].style)}>
          <RotateCcw size={15} /> Reset style
        </Button>
        <Button variant="primary" onClick={onClose}>
          <Check size={15} /> Done
        </Button>
      </div>
    </Dialog>
  );
}
