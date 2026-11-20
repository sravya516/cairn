// Installing Cairn on a Home Screen. Chrome and Edge on Android (and desktop) offer a one-tap install through the
// "beforeinstallprompt" event; Safari on iPhone never does, so it needs written steps (see pages/install.js).
// The event can fire before any screen is drawn, so it is captured once at startup and kept here.

let deferred = null;
let installed = false;
const listeners = new Set();
const notify = () => { for (const fn of listeners) { try { fn(); } catch (_) { /* a broken listener must not stop the others */ } } };

export function initInstall() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; notify(); });
}

/** True when the browser has offered a one-tap install. */
export const canPromptInstall = () => !!deferred;
export const justInstalled = () => installed;

/** Shows the browser's own install dialog. Resolves to 'accepted', 'dismissed' or 'unavailable'. */
export async function promptInstall() {
  const ev = deferred;
  if (!ev) return 'unavailable';
  deferred = null; // an event can be used only once
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    notify();
    return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch (_) { notify(); return 'dismissed'; }
}

/** Runs fn whenever the install state changes. Returns an unsubscribe function. */
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** True when Cairn is running as an installed app (from the Home Screen) rather than in a browser tab. */
export function isStandalone() {
  return (typeof navigator !== 'undefined' && navigator.standalone === true) || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}
