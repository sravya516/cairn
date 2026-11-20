// Keeps the documentation honest: links resolve, scripts are documented, and the numbers quoted match the real content.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadGuides, loadCards } from '../scripts/sources-report.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const DOCS = ['README.md', 'CONTRIBUTING.md', 'CONTENT_SOURCES.md', 'docs/ACCEPTANCE.md', 'docs/IPHONE_TEST_PLAN.md'];

test('required project files exist', () => {
  for (const f of [...DOCS, 'LICENSE', '.github/workflows/pages.yml', '.gitignore', 'package.json']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

test('every relative link in the documentation points at a real file', () => {
  for (const doc of DOCS) {
    const text = read(doc);
    for (const m of text.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)) {
      const target = path.resolve(path.dirname(path.join(ROOT, doc)), m[1].split('#')[0]);
      assert.ok(fs.existsSync(target), `${doc} links to missing ${m[1]}`);
    }
  }
});

test('README documents every npm script', () => {
  const scripts = Object.keys(JSON.parse(read('package.json')).scripts);
  const readme = read('README.md');
  for (const s of scripts) assert.ok(readme.includes('npm run ' + s) || readme.includes('npm ' + s) || readme.includes('`' + s + '`'), `README does not mention the "${s}" script`);
});

test('numbers quoted in the docs match the real content', () => {
  const guides = loadGuides(ROOT), cards = loadCards(ROOT);
  const dir = path.join(ROOT, 'src/data/checklists');
  const checklists = fs.readdirSync(dir).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const items = checklists.reduce((n, c) => n + c.items.length, 0);
  const calcs = fs.readdirSync(path.join(ROOT, 'src/calculators')).filter((f) => !['common.js', 'registry.js'].includes(f)).length;
  const words = guides.reduce((n, g) => n + JSON.stringify(g.sections).split(/\s+/).length, 0);

  const readme = read('README.md');
  assert.ok(readme.includes(`**${guides.length} guides**`), `README should say ${guides.length} guides`);
  assert.ok(readme.includes(`${checklists.length} checklists** (${items} items)`), `README should say ${checklists.length} checklists (${items} items)`);
  assert.ok(readme.includes(`${cards.length} quick-reference cards`));
  assert.ok(readme.includes(`**${calcs} calculators**`), `README should say ${calcs} calculators`);
  assert.ok(Math.abs(words - 37000) < 3000, `README says about 37,000 words; real count ${words}`);
  assert.ok(read('docs/ACCEPTANCE.md').includes(`${guides.length} guides`));
  assert.ok(read('docs/ACCEPTANCE.md').includes(`${checklists.length} checklists, ${items} items`));
});

test('the pre-cached file count in the audit matches a fresh build', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-docs-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--out', out], { cwd: ROOT, stdio: 'pipe' });
    const n = JSON.parse(fs.readFileSync(path.join(out, 'precache.json'), 'utf8')).files.length;
    assert.ok(read('docs/ACCEPTANCE.md').includes(`${n} files pre-cached`), `ACCEPTANCE.md should say ${n} files pre-cached`);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('docs never overclaim: iPhone and professional review are stated as NOT done', () => {
  const readme = read('README.md');
  assert.match(readme, /Installing on a real iPhone[^|]*\|\s*\*\*Partly tested by the owner, not logged/);
  assert.match(readme, /No device model, iOS version or per-step log was recorded/);
  assert.match(readme, /Not professionally reviewed/i);
  assert.match(readme, /No source has been verified/);
  const accept = read('docs/ACCEPTANCE.md');
  assert.match(accept, /informal owner testing[^.]*no device, iOS version or step log recorded/);
  assert.match(read('docs/IPHONE_TEST_PLAN.md'), /Only informal, unlogged owner testing has been done/);
  // The register must still show no fabricated verification dates.
  const sources = read('CONTENT_SOURCES.md');
  assert.ok(!/\|\s*20\d\d-\d\d-\d\d\s*\|\s*$/m.test(sources.split('## Change log')[0].split('## Source registry')[1]), 'a verification date appears without evidence: if a human verified, update this test');
});

test('GitHub Pages workflow is sane: tests gate deploy, publishes dist, needs no secrets, uses official actions', () => {
  const y = read('.github/workflows/pages.yml');
  for (const needle of ['actions/checkout@v4', 'actions/deploy-pages@v4', 'actions/upload-pages-artifact@v3', 'path: dist', 'npm test', 'needs: test', 'branches: [main]', 'pages: write', 'id-token: write']) assert.ok(y.includes(needle), needle);
  assert.ok(!/secrets\./.test(y), 'must not need secrets');
  assert.ok(!/npm (install|ci)/.test(y), 'the project has no dependencies to install');
  const uses = [...y.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  for (const u of uses) assert.match(u, /^actions\//, `non-official action ${u}`);
});

test('package.json declares no dependencies', () => {
  const p = JSON.parse(read('package.json'));
  assert.equal(p.dependencies, undefined);
  assert.equal(p.devDependencies, undefined);
});
