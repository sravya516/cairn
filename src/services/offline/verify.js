// "Is everything I need really stored on this device?" checks.
// The comparison logic is pure and dependency-injected so it can be unit-tested without a browser.

export async function sha256Hex16(buffer, cryptoImpl = globalThis.crypto) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * Compare the precache manifest against what is actually in the cache.
 * readCached(url) -> ArrayBuffer | null. Returns {missing, corrupt, ok}.
 */
export async function compareCache(manifestFiles, readCached, { hash = sha256Hex16, checkHashes = true } = {}) {
  const missing = [], corrupt = [];
  let ok = 0;
  for (const f of manifestFiles) {
    const buf = await readCached(f.url);
    if (!buf) { missing.push(f.url); continue; }
    if (checkHashes) {
      if ((await hash(buf)) !== f.hash) { corrupt.push(f.url); continue; }
    }
    ok++;
  }
  return { missing, corrupt, ok, total: manifestFiles.length };
}

const status = (id, label, state, detail) => ({ id, label, state, detail }); // state: ok | warn | fail

/**
 * Runs every offline-readiness check and returns a report.
 * env: { navigator, caches, fetch, store, content, requestPersistence, storageEstimate }
 */
export async function verifyOffline(env) {
  const items = [];
  const nav = env.navigator;

  // 1. Service worker
  if (!nav || !('serviceWorker' in nav)) {
    items.push(status('sw', 'Service worker', 'fail', 'This browser does not support service workers, so offline use is not possible here.'));
  } else {
    const reg = await nav.serviceWorker.getRegistration();
    if (!reg || !reg.active) items.push(status('sw', 'Service worker', 'fail', 'Not installed yet. Open Cairn once while online and wait a few seconds.'));
    else if (!nav.serviceWorker.controller) items.push(status('sw', 'Service worker', 'warn', 'Installed, but this page is not under its control yet. Reload the app once.'));
    else items.push(status('sw', 'Service worker', 'ok', 'Installed and controlling this app.'));
  }

  // 2 & 3. Cache completeness + integrity
  let manifest = null;
  try {
    const res = await env.fetch('./precache.json', { cache: 'no-store' }).catch(() => env.fetch('./precache.json'));
    manifest = await res.json();
  } catch (_) { /* handled below */ }
  if (!manifest) {
    items.push(status('cache', 'Offline files', 'fail', 'Could not read the file list (precache.json).'));
  } else {
    const name = 'cairn-v-' + manifest.version;
    const hasCache = env.caches ? await env.caches.has(name) : false;
    if (!hasCache) {
      items.push(status('cache', 'Offline files', 'fail', `Cache ${name} is missing. Connect to the internet and use “Re-download offline copy”.`));
    } else {
      const cache = await env.caches.open(name);
      const result = await compareCache(manifest.files, async (url) => {
        const r = await cache.match(url);
        return r ? r.arrayBuffer() : null;
      });
      if (result.missing.length) items.push(status('cache', 'Offline files', 'fail', `${result.missing.length} of ${result.total} files missing: ${result.missing.slice(0, 5).join(', ')}${result.missing.length > 5 ? '…' : ''}`));
      else items.push(status('cache', 'Offline files', 'ok', `All ${result.total} app files are stored on this device (version ${manifest.version}).`));
      if (result.corrupt.length) items.push(status('integrity', 'File integrity', 'fail', `${result.corrupt.length} stored files do not match their checksums: ${result.corrupt.slice(0, 5).join(', ')}. Re-download the offline copy.`));
      else if (!result.missing.length) items.push(status('integrity', 'File integrity', 'ok', 'Every stored file matches its checksum.'));
    }
  }

  // 4. Content
  const c = env.content;
  if (!c) items.push(status('content', 'Emergency content', 'fail', 'Content could not be loaded.'));
  else {
    const n = `${c.guides.length} guides, ${c.checklists.length} checklists, ${c.emergency.length} quick-reference cards`;
    items.push(status('content', 'Emergency content', c.guides.length ? 'ok' : 'warn', c.guides.length ? `${n} loaded from local storage.` : `${n}. No guides are bundled in this build yet.`));
  }

  // 5. Local database
  try {
    const works = await env.store.selfTest();
    const kind = env.store.kind;
    items.push(status('db', 'Local database', works ? (kind === 'indexedDB' ? 'ok' : 'warn') : 'fail',
      works ? (kind === 'indexedDB' ? 'IndexedDB read/write test passed.' : `Using ${kind} (IndexedDB unavailable). Your data is still saved, but may be less durable.`) : 'The write/read test failed. Household data may not be saved.'));
    if (env.store.issues.length) items.push(status('records', 'Saved records', 'warn', `${env.store.issues.length} damaged record(s) were ignored: ${env.store.issues.map((i) => i.key).join(', ')}.`));
  } catch (e) {
    items.push(status('db', 'Local database', 'fail', 'Database error: ' + (e && e.message || e)));
  }

  // 6. Persistence + quota
  const persist = env.requestPersistence ? await env.requestPersistence(nav) : { supported: false, persisted: false };
  items.push(status('persist', 'Protected storage', persist.persisted ? 'ok' : 'warn',
    persist.persisted ? 'The browser has agreed not to clear Cairn’s data automatically.'
      : persist.supported ? 'Not granted. Browsers may clear data if the device is very low on space. Export a backup occasionally.'
        : 'Not supported by this browser. Export a backup occasionally.'));
  const est = env.storageEstimate ? await env.storageEstimate(nav) : null;
  if (est) items.push(status('quota', 'Storage used', 'ok', `${formatBytes(est.usage)} used of ${formatBytes(est.quota)} available to this app.`));

  const worst = items.some((i) => i.state === 'fail') ? 'fail' : items.some((i) => i.state === 'warn') ? 'warn' : 'ok';
  return { items, overall: worst, version: manifest ? manifest.version : null, checkedAt: new Date().toISOString() };
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/** Wipes old caches and re-registers the service worker so the whole offline copy is fetched fresh. Needs a connection. */
export async function redownloadOfflineCopy(env = globalThis) {
  if (!env.navigator.onLine) throw new Error('You are offline. Connect to the internet to re-download.');
  for (const k of await env.caches.keys()) if (k.startsWith('cairn-v-')) await env.caches.delete(k);
  for (const r of await env.navigator.serviceWorker.getRegistrations()) await r.unregister();
  env.location.reload();
}
