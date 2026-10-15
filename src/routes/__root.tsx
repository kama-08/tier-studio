import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { ArrowUpRight, Grid2X2, Settings2, CloudOff, CodeXml } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { Button } from '@/components/ui/button';
import { useThemeSynchronization } from '@/app/theme';
import { useSidebarStore } from '@/app/layout';
import { isDesktop } from '@/app/services';
import { publicRepository } from '@/app/distribution';
import { DesktopDownloadButton } from '@/components/ui/desktop-download';

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ({ error, reset }) => (
    <div className="error-page">
      <h1 className="font-display text-3xl">Something needs another try.</h1>
      <p>{error instanceof Error ? error.message : 'Please try opening this page again.'}</p>
      <Button onClick={reset}>Try again</Button>
      <Link to="/">Back to projects</Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="error-page">
      <h1 className="font-display text-3xl">This page wandered off.</h1>
      <Link to="/">Back to projects</Link>
    </div>
  ),
});

function RootLayout() {
  useThemeSynchronization();
  const sidebarVisible = useSidebarStore((state) => state.visible);
  return (
    <div className="app-shell" data-sidebar={sidebarVisible ? 'open' : 'closed'}>
      <aside id="app-sidebar" className="sidebar" aria-label="Sidebar" hidden={!sidebarVisible}>
        <Link to="/" className="brand" aria-label="Tier Studio home">
          <img src="/icon.svg" width="34" height="34" alt="" />
          <span>
            tier studio<span className="brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="nav-link"
            activeProps={{ className: 'nav-link nav-link-active' }}
          >
            <Grid2X2 size={18} /> My projects{' '}
            <span className="nav-arrow">
              <ArrowUpRight size={14} />
            </span>
          </Link>
          <Link
            to="/settings"
            className="nav-link"
            activeProps={{ className: 'nav-link nav-link-active' }}
          >
            <Settings2 size={18} /> Settings
          </Link>
        </nav>
        <div className="sidebar-bottom">
          {!isDesktop ? (
            <div className="sidebar-download-actions">
              <DesktopDownloadButton sidebar />
              {publicRepository ? (
                <a
                  href={publicRepository.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sidebar-github"
                >
                  <CodeXml size={16} aria-hidden="true" /> GitHub
                  <ArrowUpRight size={13} aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="sidebar-version">
            <CloudOff size={14} />
            <span>Local first · v0.1</span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
      <Notice />
    </div>
  );
}
