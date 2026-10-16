import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { isDesktop } from '@/app/services';
import { watchWebUpdates } from '@/app/web-updates';
import { flushEditor } from '@/features/editor/editor-store';
import { Button } from './button';

export function WebUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);
  const reportError = useCallback((cause: unknown) => {
    requested.current = false;
    setUpdating(false);
    setError(cause instanceof Error ? cause.message : 'Could not apply the update. Try again.');
  }, []);
  const finishUpdate = useCallback(async () => {
    // Include any edits made while the new worker was activating.
    await flushEditor();
    window.location.reload();
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || isDesktop || !('serviceWorker' in navigator)) return;
    return watchWebUpdates(setRegistration, () => {
      if (requested.current) void finishUpdate().catch(reportError);
    });
  }, [finishUpdate, reportError]);

  async function applyUpdate() {
    if (!registration || updating) return;
    setUpdating(true);
    setError(null);
    try {
      await flushEditor();
      requested.current = true;
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      else await finishUpdate(); // Another tab may already have activated this version.
    } catch (cause) {
      reportError(cause);
    }
  }

  if (!registration) return null;
  return (
    <section className="web-update" aria-label="Application update" aria-busy={updating}>
      <output className="web-update-heading">
        <RefreshCw size={16} aria-hidden="true" />
        <strong>New version available</strong>
      </output>
      <p>Update when you’re ready. Your project will be saved before reloading.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="web-update-actions">
        <Button variant="primary" size="sm" disabled={updating} onClick={() => void applyUpdate()}>
          {updating ? 'Updating…' : 'Update now'}
        </Button>
        <Button variant="ghost" size="sm" disabled={updating} onClick={() => setRegistration(null)}>
          Later
        </Button>
      </div>
    </section>
  );
}
