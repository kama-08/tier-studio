import { useEffect, useState, type RefObject } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import type { Project } from '@/core/schema';
import { getAppearance } from '@/core/appearance';
import { assetIdsForItems } from '@/core/assets';
import { projects } from '@/app/services';
import { measureBoardLayout } from '@/services/image-export/board-layout';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '../editor-store';
import { useThemeStore } from '@/app/theme';

export function ExportPreview({
  open,
  onClose,
  project,
  boardRef,
  busy,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  boardRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
  onExport: () => void;
}) {
  const appearance = getAppearance(project);
  const [preview, setPreview] = useState<{
    url: string;
    width: number;
    height: number;
    reduced: boolean;
    project: Project;
    boardWidth: number;
    theme: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);
  const execute = useEditorStore((state) => state.execute);
  const theme = useThemeStore((state) => state.theme);
  const [editorWidth, setEditorWidth] = useState(0);
  const boardWidth = appearance.exportWidth || editorWidth;
  const ready =
    preview?.project === project && preview?.boardWidth === boardWidth && preview?.theme === theme;

  useEffect(() => {
    if (!open || !boardRef.current || appearance.exportWidth) return;
    const observer = new ResizeObserver(([entry]) => setEditorWidth(entry.contentRect.width));
    observer.observe(boardRef.current);
    return () => observer.disconnect();
  }, [open, boardRef, appearance.exportWidth]);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let url: string | undefined;
    const timer = setTimeout(() => {
      setRendering(true);
      setError('');
      void (async () => {
        const layout = await measureBoardLayout(boardRef.current, project);
        const ids = [
          ...layout.tiers.flatMap((tier) => tier.items.map((item) => item.id)),
          ...(layout.unranked?.items.map((item) => item.id) ?? []),
        ];
        const assets = await projects.assets(project.id, assetIdsForItems(project, ids));
        const { renderProjectPng, outputDimensions } =
          await import('@/services/image-export/canvas-renderer');
        const dimensions = outputDimensions(layout, getAppearance(project).exportScale);
        const bytes = await renderProjectPng(
          project,
          assets,
          layout,
          Math.min(1, 1000 / layout.width),
        );
        if (disposed) return;
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        setPreview({
          url,
          width: dimensions.width,
          height: dimensions.height,
          reduced: dimensions.scale < getAppearance(project).exportScale,
          project,
          boardWidth,
          theme,
        });
      })()
        .catch((cause: unknown) => {
          if (!disposed)
            setError(cause instanceof Error ? cause.message : 'Could not render the preview.');
        })
        .finally(() => {
          if (!disposed) setRendering(false);
        });
    }, 150);
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, project, boardRef, boardWidth, theme]);

  return (
    <Dialog open={open} onClose={onClose} title="PNG export" className="export-dialog">
      <div className="export-controls">
        <div>
          <label className="field-label" htmlFor="png-board-width">
            Board width
          </label>
          <select
            id="png-board-width"
            className="text-input"
            value={appearance.exportWidth}
            onChange={(event) =>
              execute({
                type: 'set-appearance',
                appearance: { ...appearance, exportWidth: Number(event.target.value) },
              })
            }
          >
            <option value={0}>Match editor</option>
            <option value={800}>800 px</option>
            <option value={1200}>1,200 px</option>
            <option value={1920}>1,920 px</option>
            <option value={2560}>2,560 px</option>
            <option value={4096}>4,096 px</option>
            {![0, 800, 1200, 1920, 2560, 4096].includes(appearance.exportWidth) ? (
              <option value={appearance.exportWidth}>{appearance.exportWidth} px</option>
            ) : null}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="png-resolution">
            Resolution
          </label>
          <select
            id="png-resolution"
            className="text-input"
            value={appearance.exportScale}
            onChange={(event) =>
              execute({
                type: 'set-appearance',
                appearance: { ...appearance, exportScale: Number(event.target.value) as 1 | 2 | 3 },
              })
            }
          >
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
          </select>
        </div>
      </div>
      <div className="export-preview" aria-busy={rendering}>
        {error ? (
          <p role="alert">{error}</p>
        ) : ready ? (
          <img src={preview.url} alt="PNG export preview" />
        ) : (
          <p>Preparing preview…</p>
        )}
      </div>
      <output className="dialog-help">
        {error
          ? ''
          : rendering || !ready
            ? 'Updating preview…'
            : preview && !error
              ? `${preview.width.toLocaleString()} × ${preview.height.toLocaleString()} px${preview.reduced ? ' · resolution reduced to fit image limits' : ''}`
              : ''}
      </output>
      <p className="dialog-help">
        Fixed widths stay the same when you resize the editor. Change visible sections and
        transparency in Customize.
      </p>
      <div className="dialog-actions">
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="primary"
          disabled={busy || rendering || Boolean(error) || !ready}
          onClick={onExport}
        >
          <ArrowDownToLine size={16} /> Download PNG
        </Button>
      </div>
    </Dialog>
  );
}
