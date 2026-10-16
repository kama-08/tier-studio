// Observe the service worker registered by Vite PWA's injected script.
// Updates stay waiting until the user chooses to apply them.
export function watchWebUpdates(
  onWaiting: (registration: ServiceWorkerRegistration) => void,
  onControlling: () => void,
) {
  const workers = navigator.serviceWorker;
  const cleanup: (() => void)[] = [];
  let disposed = false;
  function listen(target: EventTarget, event: string, handler: EventListener) {
    target.addEventListener(event, handler);
    cleanup.push(() => target.removeEventListener(event, handler));
  }
  listen(workers, 'controllerchange', onControlling);
  void workers.ready.then((registration) => {
    if (disposed) return;
    const announced = new WeakSet<ServiceWorker>();
    const observed = new WeakSet<ServiceWorker>();
    function checkWaiting() {
      const waiting = registration.waiting;
      if (waiting && workers.controller && !announced.has(waiting)) {
        announced.add(waiting);
        onWaiting(registration);
      }
    }
    function watchInstalling() {
      const installing = registration.installing;
      if (installing && !observed.has(installing)) {
        observed.add(installing);
        listen(installing, 'statechange', checkWaiting);
      }
      checkWaiting();
    }
    function checkForUpdate() {
      if (navigator.onLine && !document.hidden) {
        // Offline and transient network failures must not interrupt editing.
        void registration.update().catch(() => {});
      }
    }
    listen(registration, 'updatefound', watchInstalling);
    listen(window, 'focus', checkForUpdate);
    listen(window, 'online', checkForUpdate);
    listen(document, 'visibilitychange', checkForUpdate);
    const interval = window.setInterval(checkForUpdate, 60 * 60 * 1000);
    cleanup.push(() => window.clearInterval(interval));
    watchInstalling();
  });
  return () => {
    disposed = true;
    cleanup.forEach((remove) => remove());
  };
}
