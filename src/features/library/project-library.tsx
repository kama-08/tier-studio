import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Copy,
  FolderOpen,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { projects, getFiles } from '@/app/services';
import { createProject, createSampleProject, countRanked } from '@/core/project';
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
          <div className="mini-label" style={{ background: tier.color }}>
            {tier.label}
          </div>
          <div className="mini-items">
            {tier.itemIds.slice(0, 6).map((id) => {
              const item = project.items[id];
              return (
                <div className="mini-item" key={id} style={{ background: item.color }}>
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
          <ArrowUpRight size={20} />
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
              <Copy size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${project.title}`}
              onClick={onDelete}
            >
              <Trash2 size={14} />
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

  const filtered = library.filter((project) =>
    project.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <header className="page-topbar">
        <div className="topbar-leading">
          <SidebarToggle />
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <span className="avatar" aria-hidden="true">
            you
          </span>
        </div>
      </header>
      <div className="library-page">
        <section className="library-hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> PLAY FAVORITES
            </div>
            <h1>
              Good taste.
              <br />
              <em>Your rules.</em>
            </h1>
            <p>
              From the best films to the smallest joys.
              <br /> Give your favorites a place to belong.
            </p>
            <div className="hero-actions">
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={17} /> New project
              </Button>
              <Button variant="ghost" onClick={() => void importFile()} disabled={busy}>
                <FolderOpen size={17} /> Import project
              </Button>
            </div>
          </div>
          <div className="hero-art">
            <div className="hero-card">
              <div className="hero-card-title">
                The little things <span>MY VERY OFFICIAL RANKING</span>
              </div>
              <MiniBoard project={sample} hero />
              <div className="hero-card-footer">
                <span>A few things worth ranking.</span>
                <button onClick={() => void openNew(sample)} disabled={busy}>
                  Try the sample <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
            <div className="hero-sticker">
              <Sparkles size={15} /> entirely subjective
            </div>
          </div>
        </section>
        <section aria-labelledby="projects-heading">
          <div className="library-toolbar">
            <div className="flex items-center gap-3">
              <h2 id="projects-heading">My projects</h2>
              <span className="count-badge">{library.length}</span>
            </div>
            <label className="search-field">
              <Search size={16} />
              <span className="sr-only">Search projects</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a project…"
              />
            </label>
          </div>
          {loading ? (
            <output className="empty-library">Opening your space…</output>
          ) : library.length === 0 ? (
            <div className="empty-library">
              <div className="empty-icon">
                <ArrowDownToLine size={23} strokeWidth={1.5} />
              </div>
              <h3>Your next great ranking starts here.</h3>
              <p>
                Create a project or try the sample above.
                <br />
                Everything saves right here, as you go.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} /> Create your first project
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-library">
              <h3>No projects found.</h3>
              <p>Try a different name.</p>
              <Button onClick={() => setSearch('')}>Clear search</Button>
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
              <button className="new-project-card" onClick={() => setCreateOpen(true)}>
                <span>
                  <Plus size={24} />
                </span>{' '}
                Something new?
              </button>
            </div>
          )}
        </section>
        <footer className="library-footer">
          <span>Made for opinions, big and small.</span>
          <span>Saved locally. Always yours.</span>
        </footer>
      </div>
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Make room for your favorites."
      >
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
            placeholder="The best of absolutely anything"
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
