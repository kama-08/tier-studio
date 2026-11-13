import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpRight, Copy, FolderOpen, Plus, Search, LayoutGrid, X, Trash2 } from 'lucide-react';
import { projects, getFiles } from '@/app/services';
import { createProject, createSampleProject, countRanked } from '@/core/project';
import { readableInk } from '@/core/color';
import type { Project } from '@/core/schema';
import { useAssetUrls } from '@/features/assets/use-asset-urls';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useNotice } from '@/components/ui/notice';
import { ThemeToggle } from '@/components/ui/theme-controls';
import { SidebarToggle } from '@/components/ui/sidebar-toggle';
import { assetIdsForItems } from '@/core/assets';
import {
  collectLibraryAssets,
  deleteStoredProject,
  withProjectAssets,
} from '@/services/storage/asset-lifetime';
import { trackOperation } from '@/services/operations';

function MiniBoard({ project, hero = false }: { project: Project; hero?: boolean }) {
  const visibleItems = project.tiers.slice(0, 5).flatMap((tier) => tier.itemIds.slice(0, 6));
  const urls = useAssetUrls(project.id, 0, assetIdsForItems(project, visibleItems), true);
  return (
    <div
      className={`mini-board ${hero ? 'mini-board-hero' : ''}`}
      data-shape={project.itemShape ?? 'square'}
      aria-hidden="true"
    >
      {project.tiers.slice(0, 5).map((tier) => (
        <div className="mini-row" key={tier.id}>
          <div
            className="mini-label"
            style={{ background: tier.color, color: readableInk(tier.color) }}
          >
            {tier.label}
          </div>
          <div className="mini-items">
            {tier.itemIds.slice(0, 6).map((id) => {
              const item = project.items[id];
              return (
                <div
                  className="mini-item"
                  key={id}
                  style={{ background: item.color, color: readableInk(item.color) }}
                >
                  {item.assetId && urls[item.assetId] ? (
                    <img src={urls[item.assetId]} alt="" />
                  ) : (
                    <span>{hero ? item.name : item.name.slice(0, 2)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="project-card">
      <Link
        to="/projects/$projectId"
        params={{ projectId: project.id }}
        className="project-preview"
        aria-label={`Open ${project.title}`}
      >
        <MiniBoard project={project} />
        <span className="preview-open">
          <ArrowUpRight size={18} aria-hidden="true" />
        </span>
      </Link>
      <div className="project-card-body">
        <div className="flex items-start justify-between gap-2">
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="project-title"
          >
            {project.title}
          </Link>
          <div className="flex">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Duplicate ${project.title}`}
              onClick={onDuplicate}
            >
              <Copy size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${project.title}`}
              onClick={onDelete}
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
        <p className="project-meta">
          {Object.keys(project.items).length} items <span>·</span> {countRanked(project)} ranked{' '}
          <span>·</span>{' '}
          {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
            project.updatedAt,
          )}
        </p>
      </div>
    </article>
  );
}

export function ProjectLibrary() {
  const navigate = useNavigate();
  const [library, setLibrary] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [sample] = useState(createSampleProject);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const show = useNotice((state) => state.show);

  useEffect(() => {
    let canceled = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    async function cleanup(delay = 200) {
      try {
        const complete = await collectLibraryAssets();
        // A tab closing or crashing may release its lock after the library's
        // initial scan. Retry without queuing exclusive locks behind editors.
        if (!canceled && !complete)
          cleanupTimer = setTimeout(() => void cleanup(Math.min(delay * 2, 5000)), delay);
      } catch (error) {
        console.error('Could not collect unused images.', error);
      }
    }
    void projects
      .list()
      .then((result) => {
        if (!canceled) setLibrary(result);
        if (!canceled) void cleanup();
      })
      .catch((error: unknown) =>
        show(error instanceof Error ? error.message : 'Could not load your projects.', true),
      )
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
      clearTimeout(cleanupTimer);
    };
  }, [show]);

  async function openNew(project: Project) {
    setBusy(true);
    try {
      await trackOperation(() => projects.save(project));
      await navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not create this project.', true);
    } finally {
      setBusy(false);
    }
  }

  async function importFile() {
    setBusy(true);
    try {
      await trackOperation(async () => {
        const file = await (await getFiles()).openProject();
        if (!file) return;
        const { unpackProject, copyImportedProject } =
          await import('@/services/project-files/archive');
        const imported = unpackProject(file.bytes);
        const copy = copyImportedProject(imported.project, imported.assets);
        await projects.importProject(copy.project, copy.assets);
        await navigate({ to: '/projects/$projectId', params: { projectId: copy.project.id } });
        show('Project imported. Make it your own.');
      });
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not import this project.', true);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(project: Project) {
    try {
      await trackOperation(() =>
        withProjectAssets(project.id, async () => {
          const { copyImportedProject } = await import('@/services/project-files/archive');
          const latest = await projects.get(project.id);
          if (!latest) throw new Error('This project has been deleted.');
          const copy = copyImportedProject(
            latest,
            await projects.assets(project.id, assetIdsForItems(latest)),
          );
          copy.project.title = `${project.title.slice(0, 150)} (copy)`;
          await projects.importProject(copy.project, copy.assets);
          setLibrary(await projects.list());
          show('Project duplicated.');
        }),
      );
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not duplicate this project.', true);
    }
  }

  async function deleteProject() {
    if (!deleting) return;
    setBusy(true);
    try {
      await trackOperation(() => deleteStoredProject(deleting.id));
      setLibrary(await projects.list());
      setDeleting(null);
      show('Project deleted.');
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not delete this project.', true);
    } finally {
      setBusy(false);
    }
  }

  const query = search.trim().toLocaleLowerCase();
  const filtered = library.filter((project) => project.title.toLocaleLowerCase().includes(query));
  const samplePanel = (
    <section className="sample-panel" aria-labelledby="sample-heading">
      <div className="sample-copy">
        <span className="sample-label">
          <LayoutGrid size={14} aria-hidden="true" /> Sample board
        </span>
        <h2 id="sample-heading">Start a tier list</h2>
        <p>Explore a ready-made ranking, or create a blank project and make it yours.</p>
        <Button onClick={() => void openNew(createSampleProject())} disabled={busy}>
          Try the sample <ArrowUpRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="sample-art" aria-hidden="true">
        <div className="sample-board">
          <div className="sample-board-title">
            <span className="sample-board-mark">
              <LayoutGrid size={15} />
            </span>{' '}
            The little things
          </div>
          <MiniBoard project={sample} hero />
        </div>
      </div>
    </section>
  );
  return (
    <>
      <header className="page-topbar">
        <div className="topbar-leading">
          <SidebarToggle />
          <span>Workspace</span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
        </div>
      </header>
      <div className="library-page">
        <div className="workspace-heading">
          <div>
            <h1>My projects</h1>
            <p>Pick up a ranking or start something new.</p>
          </div>
          <div className="workspace-actions">
            <Button onClick={() => void importFile()} disabled={busy}>
              <FolderOpen size={17} aria-hidden="true" /> Import project
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setName('');
                setCreateOpen(true);
              }}
              disabled={busy}
            >
              <Plus size={17} aria-hidden="true" /> New project
            </Button>
          </div>
        </div>
        <section aria-labelledby="projects-heading">
          <div className="library-toolbar">
            <div className="flex items-center gap-3">
              <h2 id="projects-heading">Library</h2>
              <output className="count-badge">
                {filtered.length}
                <span className="sr-only">
                  {' '}
                  {filtered.length === 1 ? 'project' : 'projects'}
                  {query ? ' found' : ''}
                </span>
              </output>
            </div>
            {library.length > 0 ? (
              <div className="search-field">
                <Search size={16} aria-hidden="true" />
                <label className="sr-only" htmlFor="project-search">
                  Search projects
                </label>
                <input
                  ref={searchInput}
                  id="project-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search projects…"
                />
                {search ? (
                  <button
                    type="button"
                    className="clear-search"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearch('');
                      searchInput.current?.focus();
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {loading ? (
            <output className="empty-library">Loading projects…</output>
          ) : library.length === 0 ? (
            samplePanel
          ) : filtered.length === 0 ? (
            <div className="empty-library">
              <Search size={26} aria-hidden="true" />
              <h3>No projects found</h3>
              <p>Try a different name or clear your search.</p>
            </div>
          ) : (
            <div className="project-grid">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onDuplicate={() => void duplicate(project)}
                  onDelete={() => setDeleting(project)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New project">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void openNew(createProject(name.trim() || 'Untitled ranking'));
          }}
        >
          <label className="field-label" htmlFor="project-name">
            Project name
          </label>
          <input
            id="project-name"
            className="text-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Favorite albums"
            maxLength={160}
          />
          <p className="dialog-help">Start with five tiers. Change everything as you go.</p>
          <div className="dialog-actions">
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              <Plus size={16} /> Create project
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this project?"
      >
        <p className="text-secondary">
          “{deleting?.title}” and its images will be removed from this device. Export a project file
          first if you want to keep a copy.
        </p>
        <div className="dialog-actions">
          <Button onClick={() => setDeleting(null)}>Keep project</Button>
          <Button variant="danger" disabled={busy} onClick={() => void deleteProject()}>
            Delete project
          </Button>
        </div>
      </Dialog>
    </>
  );
}
