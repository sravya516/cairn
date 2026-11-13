// App-wide singleton store + persistent-storage request.
import { openBestStore } from './db.js';

let storePromise = null;
export function getStore() {
  if (!storePromise) storePromise = openBestStore();
  return storePromise;
}

/**
 * Ask the browser not to evict our data under storage pressure.
 * Works in Chrome/Edge/Firefox and Safari 17+. Installed iOS home-screen apps are
 * generally exempt from Safari's 7-day script-storage cleanup, but this cannot be guaranteed.
 */
export async function requestPersistence(nav = globalThis.navigator) {
  const s = nav && nav.storage;
  if (!s || !s.persist) return { supported: false, persisted: false };
  try {
    const already = s.persisted ? await s.persisted() : false;
    if (already) return { supported: true, persisted: true };
    return { supported: true, persisted: await s.persist() };
  } catch (_) {
    return { supported: true, persisted: false };
  }
}

export async function storageEstimate(nav = globalThis.navigator) {
  try {
    if (nav && nav.storage && nav.storage.estimate) {
      const { usage = 0, quota = 0 } = await nav.storage.estimate();
      return { usage, quota };
    }
  } catch (_) { /* ignore */ }
  return null;
}
