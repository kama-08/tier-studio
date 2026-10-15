import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useNotice } from '@/components/ui/notice';
import { DesktopQuitGuard } from './desktop-quit-guard';

const TitlebarHostContext = createContext<((host: HTMLElement) => () => void) | null>(null);

export function DesktopFrame({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const hosts = useRef<HTMLElement[]>([]);
  const registerHost = useCallback((element: HTMLElement) => {
    hosts.current.push(element);
    setHost(element);
    return () => {
      hosts.current = hosts.current.filter((entry) => entry !== element);
      setHost(hosts.current.at(-1) ?? null);
    };
  }, []);
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    function keep(unlisten: () => void) {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    }
    void import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        if (disposed) return;
        const window = getCurrentWindow();
        async function updateMaximized() {
          const value = await window.isMaximized();
          if (!disposed) setMaximized(value);
        }
        await Promise.all([
          window
            .onResized(() => {
              void updateMaximized().catch(console.error);
            })
            .then(keep),
          window
            .onFocusChanged(({ payload }) => {
              if (!disposed) setFocused(payload);
            })
            .then(keep),
        ]);
        await Promise.all([
          updateMaximized(),
          window.isFocused().then((value) => {
            if (!disposed) setFocused(value);
          }),
        ]);
      })
      .catch((error) => console.error('Could not synchronize the window title bar.', error));
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  async function run(action: 'minimize' | 'toggleMaximize' | 'close') {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const window = getCurrentWindow();
      await window[action]();
      if (action === 'toggleMaximize') setMaximized(await window.isMaximized());
    } catch (error) {
      console.error('Could not control the desktop window.', error);
      useNotice.getState().show('Could not control the window. Please try again.', true);
    }
  }

  const titlebar = (
    <header className="desktop-titlebar" aria-label="Window title bar" data-focused={focused}>
      <div className="desktop-titlebar-drag" data-tauri-drag-region>
        <img src="/icon.svg" width="18" height="18" alt="" draggable={false} />
        <span>Tier Studio</span>
      </div>
      <div className="desktop-window-controls">
        <button
          type="button"
          aria-label="Minimize window"
          title="Minimize"
          onClick={() => void run('minimize')}
        >
          <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore window' : 'Maximize window'}
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => void run('toggleMaximize')}
        >
          {maximized ? (
            <Copy size={12} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Square size={12} strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="desktop-window-close"
          aria-label="Hide to tray"
          title="Hide to tray"
          onClick={() => void run('close')}
        >
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );

  return (
    <TitlebarHostContext value={registerHost}>
      <div className="desktop-frame">
        {host ? createPortal(titlebar, host) : titlebar}
        <div className="desktop-content">{children}</div>
        <DesktopQuitGuard />
      </div>
    </TitlebarHostContext>
  );
}

// A modal dialog makes everything outside it inert. Host the same title bar in
// its top layer so native window controls and dragging remain available.
export function DesktopTitlebarHost({ open }: { open: boolean }) {
  const registerHost = useContext(TitlebarHostContext);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!registerHost || !open || !ref.current) return;
    return registerHost(ref.current);
  }, [open, registerHost]);
  return registerHost ? <div ref={ref} /> : null;
}
