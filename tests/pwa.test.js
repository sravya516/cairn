// Verifies PWA installability metadata and that the build output is complete and self-consistent.
// Requires `npm run build` first (the `npm run check` script does both).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

test.before(() => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { cwd: ROOT, stdio: 'pipe' });
});

const read = (p) => fs.readFileSync(path.join(DIST, p), 'utf8');

test('manifest is valid and installable', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.short_name, 'Cairn');
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url && m.scope);
  assert.ok(m.background_color && m.theme_color);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'needs 192 and 512 icons');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(DIST, i.src)), `icon missing: ${i.src}`);
});

test('manifest and html use only relative URLs (GitHub Pages subpath safe)', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 5);
  for (const r of refs) {
    assert.ok(r.startsWith('./'), `non-relative reference: ${r}`);
    assert.ok(fs.existsSync(path.join(DIST, r)), `missing file for reference: ${r}`);
  }
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const i of m.icons) assert.ok(!i.src.startsWith('/'));
  assert.ok(!m.start_url.startsWith('/'));
});

test('iOS home-screen requirements are present', () => {
  const html = read('index.html');
  for (const needle of ['apple-mobile-web-app-capable', 'apple-touch-icon', 'apple-touch-startup-image', 'viewport-fit=cover']) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
  const png = fs.readFileSync(path.join(DIST, 'icons', 'icon-180.png'));
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png[25], 2, 'icon must be opaque RGB (no alpha)');
});

test('no external runtime dependencies in shipped code', () => {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|css|html)$/.test(e.name)) files.push(p);
    }
  })(DIST);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const external = [...text.matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)]*/gi)]
      .map((m) => m[0]).filter((u) => !u.includes('www.w3.org'));
    // Only allow external URLs inside the offline fallback text (none expected in code).
    assert.deepEqual(external, [], `${path.relative(DIST, f)} references external URLs`);
  }
});

test('precache manifest lists every built file with correct hashes', () => {
  const pre = JSON.parse(read('precache.json'));
  const onDisk = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      e.isDirectory() ? walk(p) : onDisk.push(path.relative(DIST, p).split(path.sep).join('/'));
    }
  })(DIST);
  const expected = onDisk.filter((f) => f !== 'sw.js' && f !== 'precache.json');
  const listed = pre.files.map((f) => f.url.replace(/^\.\//, ''));
  assert.deepEqual([...listed].sort(), [...expected].sort());
  for (const f of pre.files) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, f.url))).digest('hex').slice(0, 16);
    assert.equal(h, f.hash, `hash mismatch ${f.url}`);
  }
  assert.ok(listed.includes('index.html') && listed.includes('offline.html') && listed.includes('data/content.json'));
});

test('service worker has version and precache injected', () => {
  const sw = read('sw.js');
  const pre = JSON.parse(read('precache.json'));
  assert.ok(sw.includes(`const VERSION = "${pre.version}"`));
  assert.ok(!sw.includes('__VERSION__') && !sw.includes('__PRECACHE__'));
  assert.ok(sw.includes('"./index.html"'));
  assert.ok(sw.includes('"./precache.json"'), 'the offline verifier needs precache.json in the cache');
  assert.ok(sw.includes("addEventListener('fetch'"));
});

test('every module imported by shipped JS exists', () => {
  const srcDir = path.join(DIST, 'src');
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.js')) continue;
      const text = fs.readFileSync(p, 'utf8');
      for (const m of text.matchAll(/from\s+'(\.[^']+)'/g)) {
        assert.ok(fs.existsSync(path.resolve(path.dirname(p), m[1])), `${path.relative(DIST, p)} imports missing ${m[1]}`);
      }
    }
  })(srcDir);
});

test('Content Security Policy: self-only scripts and connections, no eval, no inline scripts', () => {
  const html = read('index.html');
  const m = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'CSP meta tag missing');
  const csp = Object.fromEntries(m[1].split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));
  assert.deepEqual(csp['default-src'], ["'self'"]);
  assert.deepEqual(csp['script-src'], ["'self'"], 'scripts may only come from this origin');
  assert.deepEqual(csp['connect-src'], ["'self'"], 'the app may only talk to its own origin');
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'none'"]);
  assert.ok(!m[1].includes('unsafe-eval'));
  assert.ok(!m[1].includes('http:') && !m[1].includes('https:'), 'no external origins');
  // The page itself must comply: every <script> has a src, and there are no inline handlers.
  for (const tag of html.match(/<script\b[^>]*>/g)) assert.match(tag, /src="/, `inline script: ${tag}`);
  assert.ok(!/\son[a-z]+\s*=/i.test(html));
});

test('source code never uses eval, document.write, innerHTML or inline-HTML sinks', () => {
  const bad = /\b(eval|new Function)\s*\(|document\.write\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.js')) continue;
      const text = fs.readFileSync(p, 'utf8');
      // utils/dom.js svg() uses a template element to parse our own constant icon markup; allow only that.
      const offenders = text.split('\n').filter((l) => bad.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
      const allowed = p.endsWith(path.join('utils', 'dom.js')) ? offenders.filter((l) => !/t\.innerHTML = markup\.trim\(\)/.test(l)) : offenders;
      assert.deepEqual(allowed, [], `${path.relative(DIST, p)} uses a dangerous sink`);
    }
  })(path.join(DIST, 'src'));
});
