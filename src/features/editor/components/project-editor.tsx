import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  ImagePlus,
  LoaderCircle,
  Plus,
  Redo2,
  RefreshCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Type,
  ScanEye,
  Undo2,
} from 'lucide-react';
import type { Project, TierItem } from '@/core/schema';
import { POOL_ID } from '@/core/schema';
import { countRanked, ITEM_COLORS, TIER_COLORS } from '@/core/project';
import { projects, getFiles } from '@/app/services';
import { importImages } from '@/features/assets/import-images';
import { useAssetUrls } from '@/features/assets/use-asset-urls';
import { projectFilename } from '@/services/project-files/filename';
import { measureBoardLayout } from '@/services/image-export/board-layout';
import { assetIdsForItems } from '@/core/assets';
import { retainEditorAssets } from '@/services/storage/asset-lifetime';
import { hasPendingOperations, trackOperation, waitForOperations } from '@/services/operations';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useNotice } from '@/components/ui/notice';
import { ThemeToggle } from '@/components/ui/theme-controls';
import { SidebarToggle } from '@/components/ui/sidebar-toggle';
import { flushEditor, useEditorStore } from '../editor-store';
import { TierBoard } from './tier-board';
import { ItemShapePicker } from './item-shape-picker';
import { CustomizationPanel } from './customization-panel';
import type { Appearance } from '@/core/appearance';
import { ExportPreview } from './export-preview';

export function ProjectEditor({ initialProject }: { initialProject: Project }) {
  const navigate = useNavigate();
  const history = useEditorStore((state) => state.history);
  const execute = useEditorStore((state) => state.execute);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const saveError = useEditorStore((state) => state.error);
  const conflict = useEditorStore((state) => state.conflict);
  const document = history?.document.id === initialProject.id ? history.document : initialProject;
  const [appearancePreview, setAppearancePreview] = useState<Appearance | null>(null);
  const project = appearancePreview ? { ...document, appearance: appearancePreview } : document;
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [assetRevision, setAssetRevision] = useState(0);
  const urls = useAssetUrls(project.id, assetRevision, assetIdsForItems(project));
  const [busy, setBusy] = useState<string | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [textName, setTextName] = useState('');
  const [tierEdit, setTierEdit] = useState<{ id: string; label: string; color: string } | null>(
    null,
  );
  const [itemOptions, setItemOptions] = useState<TierItem | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const show = useNotice((state) => state.show);

  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: async () => {
      await waitForOperations();
      try {
        await flushEditor();
        return false;
      } catch {
        return true;
      }
    },
    enableBeforeUnload: () =>
      hasPendingOperations() || useEditorStore.getState().saveStatus !== 'saved',
  });

  useEffect(() => {
    useEditorStore.getState().open(initialProject);
  }, [initialProject]);
  useEffect(() => {
    const release = retainEditorAssets(initialProject.id);
    const session = useEditorStore.getState().session;
    return () => {
      void waitForOperations()
        .then(() => projects.flush())
        .catch(() => {})
        .finally(() => {
          if (useEditorStore.getState().session === session) {
            useEditorStore.setState({
              history: null,
              saveStatus: 'saved',
              error: null,
              conflict: false,
            });
          }
          release();
        });
    };
  }, [initialProject.id]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest('input, textarea, [contenteditable]') ||
          event.target.closest('dialog'))
      )
        return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('keydown', keyboard);
    };
  }, [undo, redo]);

  const onItemOptions = useCallback((item: TierItem) => setItemOptions(item), []);
  function onTierEdit(id: string) {
    const tier = project.tiers.find((entry) => entry.id === id);
    if (tier) setTierEdit({ id, label: tier.label, color: tier.color });
  }

  async function addImages(files: File[]) {
    if (!files.length) return;
    setBusy('Importing images');
    try {
      if (Object.keys(project.items).length + files.length > 2000)
        throw new Error('A project can contain up to 2,000 items.');
      await trackOperation(async () => {
        const imported = await importImages(files, project.id);
        await projects.addAssets(imported.assets);
        if (useEditorStore.getState().history?.document.id !== project.id) return;
        execute({ type: 'add-items', items: imported.items });
        setAssetRevision((revision) => revision + 1);
        show(`${imported.items.length} ${imported.items.length === 1 ? 'image' : 'images'} added.`);
      });
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not import your images.', true);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function exportFile(kind: 'project' | 'image') {
    setBusy(kind === 'project' ? 'Saving project file' : 'Rendering image');
    try {
      await trackOperation(async () => {
        const layout =
          kind === 'image' ? await measureBoardLayout(boardRef.current, project) : undefined;
        const itemIds = layout
          ? [
              ...layout.tiers.flatMap((tier) => tier.items.map((item) => item.id)),
              ...(layout.unranked?.items.map((item) => item.id) ?? []),
            ]
          : Object.keys(project.items);
        const assets = await projects.assets(project.id, assetIdsForItems(project, itemIds));
        const bytes = layout
          ? await (
              await import('@/services/image-export/canvas-renderer')
            ).renderProjectPng(project, assets, layout)
          : await (await import('@/services/project-files/archive')).packProject(project, assets);
        const saved = await (
          await getFiles()
        ).saveFile(
          `${projectFilename(project.title)}.${kind === 'project' ? 'tier' : 'png'}`,
          bytes,
          kind,
        );
        if (saved) show(kind === 'project' ? 'Project file saved.' : 'PNG exported.');
      });
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not export this project.', true);
    } finally {
      setBusy(null);
    }
  }

  async function reloadLatest() {
    try {
      const latest = await projects.get(project.id);
      if (!latest) {
        // Discard the conflicted snapshot only after the user explicitly reloads.
        useEditorStore.setState({
          history: null,
          saveStatus: 'saved',
          error: null,
          conflict: false,
        });
        await navigate({ to: '/' });
      } else useEditorStore.getState().open(latest);
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not reload this project.', true);
    }
  }

  return (
    <>
      <header className="editor-topbar">
        <div className="topbar-leading">
          <SidebarToggle />
          <Link to="/" className="back-link">
            <ArrowLeft size={16} /> My projects
          </Link>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <output className={`save-indicator ${saveStatus === 'error' ? 'save-error' : ''}`}>
            {saveStatus === 'saving' ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : saveStatus === 'saved' ? (
              <Check size={14} />
            ) : null}
            {saveStatus === 'saved'
              ? 'All changes saved'
              : saveStatus === 'saving'
                ? 'Saving…'
                : 'Could not save'}
            <span className="status-dot" />
          </output>
        </div>
      </header>
      <div className="editor-page">
        <div className="editor-heading">
          <div className="editor-title-block">
            <input
              className="project-title-input"
              aria-label="Project title"
              disabled={conflict}
              key={`${project.id}-title-${project.title}`}
              defaultValue={project.title}
              maxLength={160}
              onBlur={(event) => execute({ type: 'rename', title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <input
              className="project-description-input"
              aria-label="Project description"
              disabled={conflict}
              key={`${project.id}-description-${project.description}`}
              defaultValue={project.description}
              maxLength={500}
              placeholder="Description (optional)"
              onBlur={(event) => execute({ type: 'describe', description: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </div>
          <div className="editor-export-actions">
            <Button disabled={Boolean(busy)} onClick={() => void exportFile('project')}>
              <Save size={16} /> Save project
            </Button>
            <Button
              variant="primary"
              disabled={Boolean(busy)}
              onClick={() => void exportFile('image')}
            >
              <ArrowDownToLine size={16} /> Export PNG
            </Button>
            <Button
              size="icon"
              aria-label="Preview PNG export"
              title="Preview and export options"
              disabled={Boolean(busy) || conflict}
              onClick={() => setExportOpen(true)}
            >
              <ScanEye size={17} />
            </Button>
          </div>
        </div>
        {saveError ? (
          <div role="alert" className="save-error-banner">
            <p>Your latest changes haven’t saved: {saveError}</p>
            {conflict ? (
              <>
                <Button onClick={() => void exportFile('project')} disabled={Boolean(busy)}>
                  Save project copy
                </Button>
                <Button onClick={() => void reloadLatest()}>Reload latest</Button>
              </>
            ) : (
              <Button onClick={() => useEditorStore.getState().retrySave()}>
                Try saving again
              </Button>
            )}
          </div>
        ) : null}
        <fieldset className="editor-toolbar" disabled={conflict}>
          <div className="toolbar-main">
            <Button onClick={() => fileInput.current?.click()} disabled={Boolean(busy)}>
              <ImagePlus size={16} /> Add images
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTextName('');
                setTextOpen(true);
              }}
              disabled={Object.keys(project.items).length >= 2000}
            >
              <Type size={16} /> Text item
            </Button>
            <ItemShapePicker
              value={project.itemShape ?? 'square'}
              disabled={Boolean(busy)}
              onChange={(shape) => execute({ type: 'set-item-shape', shape })}
            />
            <span className="toolbar-divider" />
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal size={16} /> Customize
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Undo"
              title="Undo (Ctrl/⌘ Z)"
              disabled={!history?.past.length}
              onClick={undo}
            >
              <Undo2 size={17} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Redo"
              title="Redo (Ctrl/⌘ Shift Z)"
              disabled={!history?.future.length}
              onClick={redo}
            >
              <Redo2 size={17} />
            </Button>
          </div>
          <div className="toolbar-summary">
            <span>
              {countRanked(project)} / {Object.keys(project.items).length} ranked
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reset ranking"
              title="Move all items to Unranked"
              disabled={!countRanked(project)}
              onClick={() => setResetOpen(true)}
            >
              <RefreshCcw size={15} />
            </Button>
          </div>
        </fieldset>
        <input
          className="sr-only"
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          aria-label="Choose images"
          onChange={(event) => void addImages(Array.from(event.target.files ?? []))}
        />
        <div inert={conflict} className="editor-board-content">
          <TierBoard
            boardRef={boardRef}
            project={project}
            urls={urls}
            onTierEdit={onTierEdit}
            onItemOptions={onItemOptions}
          />
          <button
            className="add-tier-button"
            disabled={project.tiers.length >= 30}
            onClick={() =>
              execute({
                type: 'add-tier',
                id: crypto.randomUUID(),
                label: 'New tier',
                color: TIER_COLORS[project.tiers.length % TIER_COLORS.length],
              })
            }
          >
            <Plus size={15} /> Add a tier
          </button>
        </div>
      </div>
      <CustomizationPanel
        open={customizeOpen}
        project={project}
        onClose={() => {
          setAppearancePreview(null);
          setCustomizeOpen(false);
        }}
        onPreview={setAppearancePreview}
        onCommit={(appearance) => {
          execute({ type: 'set-appearance', appearance });
          setAppearancePreview(null);
        }}
        onStyle={(style) => {
          execute({ type: 'apply-style', style });
          setAppearancePreview(null);
        }}
        onPalette={(colors) => execute({ type: 'apply-palette', colors })}
      />
      {exportOpen ? (
        <ExportPreview
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          project={project}
          boardRef={boardRef}
          busy={Boolean(busy)}
          onExport={() => void exportFile('image')}
        />
      ) : null}
      {busy ? (
        <output className="busy-pill">
          <LoaderCircle size={16} className="animate-spin" />
          {busy}…
        </output>
      ) : null}
      <Dialog open={textOpen} onClose={() => setTextOpen(false)} title="Add text item">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const name = textName.trim();
            if (!name) return;
            execute({
              type: 'add-items',
              items: [
                {
                  id: crypto.randomUUID(),
                  name,
                  color: ITEM_COLORS[Object.keys(project.items).length % ITEM_COLORS.length],
                },
              ],
            });
            setTextOpen(false);
          }}
        >
          <label className="field-label" htmlFor="item-name">
            Item name
          </label>
          <input
            className="text-input"
            id="item-name"
            value={textName}
            onChange={(event) => setTextName(event.target.value)}
            required
            maxLength={160}
          />
          <div className="dialog-actions">
            <Button onClick={() => setTextOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">
              Add item
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={Boolean(tierEdit)} onClose={() => setTierEdit(null)} title="Edit tier">
        {tierEdit ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              execute({ type: 'edit-tier', ...tierEdit });
              setTierEdit(null);
            }}
          >
            <label className="field-label" htmlFor="tier-label">
              Tier label
            </label>
            <input
              className="text-input"
              id="tier-label"
              value={tierEdit.label}
              onChange={(event) => setTierEdit({ ...tierEdit, label: event.target.value })}
              maxLength={40}
              required
            />
            <label className="field-label mt-5" htmlFor="tier-color">
              Color
            </label>
            <div className="color-picker-row">
              {TIER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-swatch ${tierEdit.color === color ? 'color-selected' : ''}`}
                  style={{ background: color }}
                  aria-label={`Use color ${color}`}
                  aria-pressed={tierEdit.color === color}
                  onClick={() => setTierEdit({ ...tierEdit, color })}
                />
              ))}
              <input
                type="color"
                id="tier-color"
                value={tierEdit.color}
                onChange={(event) => setTierEdit({ ...tierEdit, color: event.target.value })}
              />
            </div>
            <div className="dialog-actions">
              <Button
                variant="danger"
                disabled={project.tiers.length === 1}
                onClick={() => {
                  execute({ type: 'remove-tier', id: tierEdit.id });
                  setTierEdit(null);
                }}
              >
                <Trash2 size={15} /> Delete tier
              </Button>
              <Button variant="primary" type="submit">
                Save tier
              </Button>
            </div>
            <p className="dialog-help">Deleting a tier moves its items to Unranked.</p>
          </form>
        ) : null}
      </Dialog>
      <Dialog
        open={Boolean(itemOptions)}
        onClose={() => setItemOptions(null)}
        title={itemOptions?.name ?? 'Item options'}
      >
        {itemOptions ? (
          <>
            <p className="field-label">Move to a tier</p>
            <div className="move-options">
              {project.tiers.map((tier) => (
                <Button
                  key={tier.id}
                  onClick={() => {
                    execute({ type: 'move-item', id: itemOptions.id, target: tier.id });
                    setItemOptions(null);
                  }}
                >
                  <span className="move-color" style={{ background: tier.color }} />
                  Move to {tier.label}
                </Button>
              ))}
              <Button
                onClick={() => {
                  execute({ type: 'move-item', id: itemOptions.id, target: POOL_ID });
                  setItemOptions(null);
                }}
              >
                Move to Unranked
              </Button>
            </div>
            <div className="dialog-actions">
              <Button
                variant="danger"
                onClick={() => {
                  execute({ type: 'remove-item', id: itemOptions.id });
                  setItemOptions(null);
                }}
              >
                <Trash2 size={15} /> Remove item
              </Button>
              <Button onClick={() => setItemOptions(null)}>Done</Button>
            </div>
            <p className="dialog-help">You can undo a move or removal.</p>
          </>
        ) : null}
      </Dialog>
      <Dialog
        open={blocker.status === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Your latest changes haven’t saved."
      >
        <p className="text-secondary">
          Stay here to retry saving or download a project file before leaving.
        </p>
        <div className="dialog-actions">
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Leave anyway
          </Button>
          <Button variant="primary" onClick={() => blocker.reset?.()}>
            Keep editing
          </Button>
        </div>
      </Dialog>
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title="Reset ranking?">
        <p className="text-secondary">Move all items to Unranked. Tiers and images are kept.</p>
        <div className="dialog-actions">
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              execute({ type: 'reset' });
              setResetOpen(false);
            }}
          >
            Reset ranking
          </Button>
        </div>
      </Dialog>
    </>
  );
}
