// Local data store. One key/value API with three interchangeable backends:
//   IndexedDB (preferred) -> localStorage (if IndexedDB is blocked) -> memory (last resort).
// Everything stays on the device; nothing here touches the network.
// Backends are injectable so the logic can be unit-tested in Node.

const DB_NAME = 'cairn-db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const LS_PREFIX = 'cairn.kv.';

export function createMemoryBackend() {
  const m = new Map();
  return {
    kind: 'memory',
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async set(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
    async clear() { m.clear(); },
  };
}

export function createLocalStorageBackend(ls) {
  return {
    kind: 'localStorage',
    async get(k) {
      const raw = ls.getItem(LS_PREFIX + k);
      if (raw == null) return undefined;
      try { return JSON.parse(raw); } catch (_) { const e = new Error('corrupt'); e.corrupt = true; throw e; }
    },
    async set(k, v) { ls.setItem(LS_PREFIX + k, JSON.stringify(v)); },
    async delete(k) { ls.removeItem(LS_PREFIX + k); },
    async keys() {
      const out = [];
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (key && key.startsWith(LS_PREFIX)) out.push(key.slice(LS_PREFIX.length));
      }
      return out;
    },
    async clear() { for (const k of await this.keys()) ls.removeItem(LS_PREFIX + k); },
  };
}

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export async function createIndexedDBBackend(idb) {
  const db = await new Promise((resolve, reject) => {
    const open = idb.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE_NAME)) open.result.createObjectStore(STORE_NAME); };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  const store = (mode) => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  return {
    kind: 'indexedDB',
    get: (k) => req(store('readonly').get(k)),
    set: async (k, v) => { await req(store('readwrite').put(v, k)); },
    delete: async (k) => { await req(store('readwrite').delete(k)); },
    keys: async () => (await req(store('readonly').getAllKeys())).map(String),
    clear: async () => { await req(store('readwrite').clear()); },
  };
}

export class Store {
  constructor(backend) {
    this.backend = backend;
    this.issues = []; // corrupted or invalid records encountered (surfaced on the storage screen)
  }
  get kind() { return this.backend.kind; }

  /** Returns the stored value, or `fallback` if missing, unreadable or corrupted. Never throws. */
  async get(key, fallback = undefined) {
    try {
      const v = await this.backend.get(key);
      return v === undefined ? fallback : v;
    } catch (err) {
      this.issues.push({ key, problem: err && err.corrupt ? 'corrupt' : 'unreadable' });
      return fallback;
    }
  }

  /** Like get(), but the value must pass `validate`; otherwise the fallback is returned and the issue recorded. */
  async getValid(key, validate, fallback) {
    const v = await this.get(key, undefined);
    if (v === undefined) return fallback;
    let ok = false;
    try { ok = !!validate(v); } catch (_) { ok = false; }
    if (!ok) { this.issues.push({ key, problem: 'invalid' }); return fallback; }
    return v;
  }

  async set(key, value) { await this.backend.set(key, value); return value; }
  async delete(key) { await this.backend.delete(key); }
  async keys(prefix = '') { return (await this.backend.keys()).filter((k) => k.startsWith(prefix)).sort(); }
  async clear() { await this.backend.clear(); }

  async entries(prefix = '') {
    const out = {};
    for (const k of await this.keys(prefix)) out[k] = await this.get(k);
    return out;
  }

  /** Read-modify-write helper: fn receives the current value (or fallback) and returns the new value. */
  async update(key, fn, fallback) {
    const next = fn(await this.get(key, fallback));
    await this.set(key, next);
    return next;
  }

  /** Write/read/delete round trip proving the backend really persists data. */
  async selfTest() {
    const k = '__selftest__';
    const token = String(Date.now());
    await this.set(k, { token });
    const back = await this.get(k);
    await this.delete(k);
    return !!back && back.token === token;
  }
}

/** Opens the best available backend, proving each one works before trusting it. */
export async function openBestStore(env = globalThis) {
  const attempts = [];
  if (env.indexedDB) {
    attempts.push(async () => new Store(await createIndexedDBBackend(env.indexedDB)));
  }
  attempts.push(async () => {
    const ls = env.localStorage; // may throw in private/blocked modes
    if (!ls) throw new Error('no localStorage');
    return new Store(createLocalStorageBackend(ls));
  });
  attempts.push(async () => new Store(createMemoryBackend()));

  const failures = [];
  for (const make of attempts) {
    try {
      const store = await make();
      if (await store.selfTest()) { store.fallbackReasons = failures; return store; }
      failures.push(`${store.kind}: self-test failed`);
    } catch (err) {
      failures.push(String(err && err.message || err));
    }
  }
  const mem = new Store(createMemoryBackend());
  mem.fallbackReasons = failures;
  return mem;
}
