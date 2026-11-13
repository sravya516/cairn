// Service-worker registration, update handling and online/offline status.
const listeners = new Set();
export const offlineState = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  swSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  controlled: false,       // page is being served by the service worker (offline-ready)
  updateReady: false,      // a newer version finished installing and is waiting
  registrationError: null,
};
let waitingWorker = null;

function emit() { listeners.forEach((fn) => { try { fn(offlineState); } catch (_) { /* ignore */ } }); }
export function onOfflineChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function initOffline() {
  window.addEventListener('online', () => { offlineState.online = true; emit(); });
  window.addEventListener('offline', () => { offlineState.online = false; emit(); });
  if (!offlineState.swSupported) return Promise.resolve(null);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    offlineState.controlled = !!navigator.serviceWorker.controller;
    // Reload once after the user accepted an update so the new version takes over cleanly.
    if (offlineState.reloadOnControllerChange) location.reload();
    emit();
  });

  return navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    offlineState.controlled = !!navigator.serviceWorker.controller;
    const track = (worker) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorker = worker; offlineState.updateReady = true; emit();
        }
        if (worker.state === 'activated') { offlineState.controlled = !!navigator.serviceWorker.controller; emit(); }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) { waitingWorker = reg.waiting; offlineState.updateReady = true; }
    if (reg.installing) track(reg.installing);
    reg.addEventListener('updatefound', () => reg.installing && track(reg.installing));
    // Check for a new version whenever the app is opened while online.
    if (navigator.onLine) reg.update().catch(() => {});
    emit();
    return reg;
  }).catch((err) => {
    offlineState.registrationError = String(err && err.message || err);
    emit();
    return null;
  });
}

export function applyUpdate() {
  if (!waitingWorker) return;
  offlineState.reloadOnControllerChange = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}
