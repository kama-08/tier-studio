import { useState } from 'react';
import { ArrowUpRight, Download, CodeXml, Monitor } from 'lucide-react';
import { isDesktop } from '@/app/services';
import { publicRepository } from '@/app/distribution';
import { Button, buttonStyles } from './button';
import { Dialog } from './dialog';

export function DesktopDownloadButton({ sidebar = false }: { sidebar?: boolean }) {
  const [open, setOpen] = useState(false);
  if (isDesktop) return null;

  return (
    <>
      <Button
        variant={sidebar ? 'ghost' : 'secondary'}
        className={sidebar ? 'sidebar-download' : 'mt-4'}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Download size={16} aria-hidden="true" /> Download desktop
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Download desktop"
        className="download-dialog"
      >
        <div className="download-platform">
          <div className="download-platform-icon">
            <Monitor size={28} aria-hidden="true" />
          </div>
          <div>
            <h3>Tier Studio for Windows</h3>
            <p>.exe installer</p>
          </div>
        </div>
        <p className="download-detail">
          Run the downloaded installer to choose the installation folder.
        </p>
        <div className="download-transfer">
          <h3>Bring your projects</h3>
          <p>Your browser and desktop libraries are separate.</p>
          <ol>
            <li>Open a project in your browser and choose “Save project”.</li>
            <li>Import the .tier file in the desktop app.</li>
          </ol>
        </div>
        {!publicRepository ? (
          <p className="download-detail">The first desktop release is coming soon.</p>
        ) : null}
        <div className="download-actions">
          {publicRepository ? (
            <>
              <a
                href={publicRepository.repository}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonStyles({ variant: 'ghost' })}
              >
                <CodeXml size={16} aria-hidden="true" /> GitHub
                <ArrowUpRight size={14} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                href={publicRepository.releases}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonStyles({ variant: 'primary' })}
              >
                View latest release <ArrowUpRight size={16} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </>
          ) : (
            <Button variant="primary" disabled>
              Downloads coming soon
            </Button>
          )}
        </div>
      </Dialog>
    </>
  );
}
