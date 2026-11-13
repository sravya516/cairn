// Build: copies the app to dist/, bundles data, and generates the service-worker precache list.
// No dependencies. Run: node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseGuides, validateGuides } from '../src/utils/guide-format.js';

const ROOT = process.cwd();
// Options: --out <dir> (default dist), --stamp <text> (adds build-stamp.txt so two builds differ; used by e2e update test)
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };
const DIST = path.resolve(opt('out') || path.join(ROOT, 'dist'));

const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });

function copyDir(src, dest, skip = () => false) {
  mkdirp(dest);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (skip(s)) continue;
    e.isDirectory() ? copyDir(s, d, skip) : fs.copyFileSync(s, d);
  }
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function bundleData() {
  const dataDir = path.join(ROOT, 'src', 'data');
  const out = { meta: {}, guides: [], checklists: [], emergency: [] };
  const metaPath = path.join(dataDir, 'meta.json');
  if (fs.existsSync(metaPath)) out.meta = readJSON(metaPath);
  const errors = [];
  for (const sub of ['guides', 'checklists', 'emergency']) {
    const d = path.join(dataDir, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).sort()) {
      const full = path.join(d, f);
      if (f.endsWith('.json')) {
        const v = readJSON(full);
        out[sub].push(...(Array.isArray(v) ? v : [v]));
      } else if (f.endsWith('.md') && sub === 'guides') {
        const { guides, errors: e } = parseGuides(fs.readFileSync(full, 'utf8'), 'src/data/guides/' + f);
        errors.push(...e);
        out.guides.push(...guides);
      }
    }
  }
  const date = out.meta.contentDate || new Date().toISOString().slice(0, 10);
  for (const g of out.guides) g.updated = g.updated || date;
  errors.push(...validateGuides(out.guides, out.meta));
  if (errors.length) {
    console.error('Content errors:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  return out;
}

rmrf(DIST);
mkdirp(DIST);

// 1. Static assets from public/ (sw.js template handled separately).
copyDir(path.join(ROOT, 'public'), DIST, (p) => path.basename(p) === 'sw.js');
// 2. Application source (data is bundled into one JSON file instead).
copyDir(path.join(ROOT, 'src'), path.join(DIST, 'src'), (p) => p === path.join(ROOT, 'src', 'data'));
// 3. Bundled content.
mkdirp(path.join(DIST, 'data'));
const content = bundleData();
fs.writeFileSync(path.join(DIST, 'data', 'content.json'), JSON.stringify(content));

if (opt('stamp')) fs.writeFileSync(path.join(DIST, 'build-stamp.txt'), opt('stamp'));

// 4. Precache manifest (every file the app needs offline) with content hashes.
const files = walk(DIST).map((p) => path.relative(DIST, p).split(path.sep).join('/')).sort();
const entries = files.map((rel) => {
  const buf = fs.readFileSync(path.join(DIST, rel));
  return { url: './' + rel, hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16), size: buf.length };
});
const version = crypto.createHash('sha256').update(entries.map((e) => e.url + e.hash).join('|')).digest('hex').slice(0, 12);
const manifest = { version, builtAt: new Date().toISOString(), files: entries };
fs.writeFileSync(path.join(DIST, 'precache.json'), JSON.stringify(manifest));

// 5. Service worker with embedded precache list (the SW file changes whenever any asset changes).
const swTemplate = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
const sw = swTemplate
  .replace("'__VERSION__'", JSON.stringify(version))
  // precache.json cannot list its own hash, but it must still be cached so the offline verifier can read it.
  .replace('/*__PRECACHE__*/[]', JSON.stringify([...entries.map((e) => e.url), './precache.json']));
fs.writeFileSync(path.join(DIST, 'sw.js'), sw);

const total = entries.reduce((n, e) => n + e.size, 0);
console.log(`Build ${version}: ${entries.length} files precached, ${(total / 1024 / 1024).toFixed(2)} MB`);
