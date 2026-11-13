import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCache, sha256Hex16, verifyOffline, formatBytes } from '../src/services/offline/verify.js';
import { Store, createMemoryBackend } from '../src/services/storage/db.js';

const enc = (s) => new TextEncoder().encode(s).buffer;

async function manifestFor(files) {
  const out = [];
  for (const [url, body] of Object.entries(files)) out.push({ url, hash: await sha256Hex16(enc(body)), size: body.length });
  return out;
}

test('compareCache passes when everything is present and intact', async () => {
  const files = { './a.js': 'one', './b.css': 'two' };
  const r = await compareCache(await manifestFor(files), async (u) => enc(files[u]));
  assert.deepEqual([r.ok, r.total, r.missing, r.corrupt], [2, 2, [], []]);
});

test('compareCache detects missing and corrupted files', async () => {
  const files = { './a.js': 'one', './b.css': 'two', './c.json': 'three' };
  const manifest = await manifestFor(files);
  const stored = { './a.js': 'one', './b.css': 'TAMPERED' };
  const r = await compareCache(manifest, async (u) => (stored[u] ? enc(stored[u]) : null));
  assert.deepEqual(r.missing, ['./c.json']);
  assert.deepEqual(r.corrupt, ['./b.css']);
  assert.equal(r.ok, 1);
});

function fakeEnv({ files, stored, controller = true, persisted = true, content = { guides: [{}], checklists: [{}], emergency: [{}] }, kind = 'indexedDB' }) {
  const version = 'abc123';
  const store = new Store(createMemoryBackend());
  store.backend.kind = kind; // pretend to be IndexedDB so the healthy path is exercised
  return manifestFor(files).then((manifestFiles) => ({
    navigator: { serviceWorker: { getRegistration: async () => ({ active: {} }), controller: controller ? {} : null } },
    caches: { has: async (n) => n === 'cairn-v-' + version, open: async () => ({ match: async (u) => (stored[u] ? { arrayBuffer: async () => enc(stored[u]) } : undefined) }) },
    fetch: async () => ({ json: async () => ({ version, files: manifestFiles }) }),
    store,
    content,
    requestPersistence: async () => ({ supported: true, persisted }),
    storageEstimate: async () => ({ usage: 5 * 1024 * 1024, quota: 2 * 1024 ** 3 }),
  }));
}
const find = (r, id) => r.items.find((i) => i.id === id);

test('verifyOffline reports ready when everything checks out', async () => {
  const files = { './index.html': 'x', './data/content.json': 'y' };
  const r = await verifyOffline(await fakeEnv({ files, stored: files }));
  assert.equal(r.overall, 'ok');
  assert.equal(find(r, 'cache').state, 'ok');
  assert.equal(find(r, 'integrity').state, 'ok');
  assert.equal(find(r, 'db').state, 'ok');
});

test('verifyOffline warns when only a non-IndexedDB backend is available', async () => {
  const files = { './index.html': 'x' };
  const r = await verifyOffline(await fakeEnv({ files, stored: files, kind: 'memory' }));
  assert.equal(find(r, 'db').state, 'warn');
  assert.equal(r.overall, 'warn');
});

test('verifyOffline fails on missing files and corrupted files', async () => {
  const files = { './index.html': 'x', './data/content.json': 'y' };
  let r = await verifyOffline(await fakeEnv({ files, stored: { './index.html': 'x' } }));
  assert.equal(r.overall, 'fail');
  assert.match(find(r, 'cache').detail, /missing/);
  r = await verifyOffline(await fakeEnv({ files, stored: { './index.html': 'x', './data/content.json': 'BAD' } }));
  assert.equal(find(r, 'integrity').state, 'fail');
});

test('verifyOffline warns when the page is not controlled or storage is not persisted', async () => {
  const files = { './index.html': 'x' };
  const r = await verifyOffline(await fakeEnv({ files, stored: files, controller: false, persisted: false }));
  assert.equal(find(r, 'sw').state, 'warn');
  assert.equal(find(r, 'persist').state, 'warn');
});

test('verifyOffline flags missing content and unsupported service workers', async () => {
  const files = { './index.html': 'x' };
  const env = await fakeEnv({ files, stored: files, content: null });
  assert.equal(find(await verifyOffline(env), 'content').state, 'fail');
  env.navigator = {};
  assert.equal(find(await verifyOffline(env), 'sw').state, 'fail');
});

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});
