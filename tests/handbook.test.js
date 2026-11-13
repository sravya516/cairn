import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadGuides, loadCards } from '../scripts/sources-report.mjs';
import { indexContent } from '../src/services/content.js';
import { buildHandbookHTML, handbookPlan, esc, inline, estimatePages, handbookFilename, ESSENTIAL_GUIDE_IDS } from '../src/services/handbook.js';
import { emptyPlan } from '../src/services/plan.js';
import { emptyState, setDone, makeCustomItem, addCustom, setNote } from '../src/services/checklists.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/meta.json'), 'utf8'));
const guides = loadGuides(ROOT);
const cards = loadCards(ROOT);
const checklists = fs.readdirSync(path.join(ROOT, 'src/data/checklists')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/checklists', f), 'utf8')));
for (const g of guides) g.updated = meta.contentDate;
const content = indexContent({ meta, guides, checklists, emergency: cards });
const css = fs.readFileSync(path.join(ROOT, 'src/styles/handbook.css'), 'utf8');
const NOW = new Date('2026-11-13T10:00:00Z');
const build = (options = {}, extra = {}) => buildHandbookHTML({ content, options, css, now: NOW, ...extra });

test('escaping and inline bold', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(inline('Use **plain** <b>x</b>'), 'Use <strong>plain</strong> &lt;b&gt;x&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('essential list only contains real guides, and scopes select the right guides', () => {
  const ids = new Set(guides.map((g) => g.id));
  for (const id of ESSENTIAL_GUIDE_IDS) assert.ok(ids.has(id), `essential list has unknown guide ${id}`);
  const ess = handbookPlan(content, { scope: 'essential' });
  assert.equal(ess.guides.filter((g) => g.category === 'disasters').length, 15, 'all disaster guides');
  assert.equal(ess.guides.length, ESSENTIAL_GUIDE_IDS.length + 15);
  assert.equal(handbookPlan(content, { scope: 'all' }).guides.length, guides.length);
  assert.equal(handbookPlan(content, { scope: 'bogus' }).scope, 'essential');
  assert.equal(handbookPlan(content, { includeChecklists: false }).checklists.length, 0);
  assert.equal(ess.cards.length, cards.length);
});

test('handbook contains every required part', () => {
  const html = build({ scope: 'essential' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Call 911/);
  for (const c of cards) assert.ok(html.includes(esc(c.title)), `card ${c.title}`);
  for (const id of ['quick', 'contacts', 'plan', 'lists', 'about', 'cat-water', 'cat-food', 'cat-medical', 'cat-disasters', 'cat-power', 'cat-evacuation']) assert.ok(html.includes(`id="${id}"`), `section ${id}`);
  for (const phrase of ['Emergency Contact Sheet', 'Family Emergency Plan', 'Poison Help', '72-Hour Emergency Kit', 'Hurricanes', 'Boiling Water', 'CPR and AED Reference', 'Extended Power Outages', 'Evacuation Checklist']) assert.ok(html.includes(phrase), phrase);
  for (const d of meta.disclaimer) assert.ok(html.includes(esc(d)), 'disclaimer text');
  assert.ok(html.includes(esc(meta.reviewStatus)));
  assert.ok(html.includes('<style>') && html.includes('@page'), 'CSS is inlined so the file is self-contained');
  assert.ok(html.includes('2026-11-13'));
});

test('the "everything" handbook includes every guide and checklist item', () => {
  const html = build({ scope: 'all' });
  for (const g of guides) assert.ok(html.includes(`<h3>${esc(g.title)}</h3>`), g.id);
  for (const c of checklists) for (const [name] of c.items) assert.ok(html.includes(`<strong>${esc(name)}</strong>`), `${c.id}: ${name}`);
  assert.ok(estimatePages(html) > estimatePages(build({ scope: 'essential' })));
});

test('options remove sections', () => {
  const noLists = build({ includeChecklists: false });
  assert.ok(!noLists.includes('id="lists"'));
  const noForms = build({ includeForms: false });
  assert.ok(!noForms.includes('id="plan"') && !noForms.includes('id="contacts"'));
  assert.ok(!noForms.includes('href="#plan"'));
});

test('output is safe: no scripts, event handlers, external links or images', () => {
  const html = build({ scope: 'all' });
  assert.ok(!/<script/i.test(html));
  assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/<style[\s\S]*?<\/style>/, '')), 'no inline event handlers');
  assert.ok(!/<img|<iframe|<object|<embed|<link/i.test(html));
  assert.ok(!/href="(?!#)/i.test(html), 'only in-page anchors');
  assert.ok(!/(src|href)="https?:/i.test(html));
});

test('markup is balanced', () => {
  const html = build({ scope: 'all' });
  for (const tag of ['section', 'article', 'table', 'ul', 'ol', 'li', 'tr', 'p']) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length, close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    assert.equal(open, close, `<${tag}> open ${open} vs close ${close}`);
  }
});

test('personal data is excluded by default and escaped when included', () => {
  const plan = emptyPlan();
  plan.members.push({ id: 'm', name: '<img src=x onerror=alert(1)>Zelda', age: '34', medical: 'Asthma & <b>more</b>', allergies: 'Penicillin', medications: 'Inhaler', notes: '' });
  plan.contacts.push({ id: 'c', name: 'Neighbor Sam', relationship: 'Next door', phone: '555-123-4567', email: '', notes: '' });
  plan.outOfArea = { name: 'Aunt Lee', phone: '555-999-0000', email: '', notes: '' };
  plan.meeting.near = 'The mailbox';
  let cl = setDone(emptyState(), { key: 'drinking-water' }, true);
  cl = setNote(cl, { key: 'drinking-water' }, 'in garage <script>');
  cl = addCustom(cl, makeCustomItem({ name: 'Spare glasses' }, () => 'g').item);
  const states = { 'kit-72h': cl };

  const generic = build({}, { plan, states });
  for (const secret of ['Zelda', 'Penicillin', 'Neighbor Sam', '555-123-4567', 'Aunt Lee', 'The mailbox', 'Spare glasses']) assert.ok(!generic.includes(secret), `leaked: ${secret}`);
  assert.match(generic, /contains no personal information/);

  const mine = build({ includePersonal: true }, { plan, states });
  for (const present of ['Penicillin', 'Neighbor Sam', '555-123-4567', 'Aunt Lee', 'The mailbox', 'Spare glasses']) assert.ok(mine.includes(present), present);
  assert.ok(!mine.includes('<img src=x'), 'hostile markup must be escaped');
  assert.ok(mine.includes('&lt;img src=x onerror=alert(1)&gt;Zelda'));
  assert.ok(!/<script/i.test(mine));
  assert.ok(mine.includes('&#9745;'), 'checked items show as checked');
  assert.match(mine, /contains your personal household information/);
});

test('deterministic output and sensible size', () => {
  assert.equal(build({ scope: 'essential' }), build({ scope: 'essential' }));
  const ess = build({ scope: 'essential' });
  const pages = estimatePages(ess);
  assert.ok(pages >= 30 && pages <= 200, `estimated pages ${pages}`);
  assert.ok(ess.length < 3 * 1024 * 1024);
  assert.equal(handbookFilename(NOW), 'cairn-handbook-2026-11-13.html');
});

test('tolerates content that is missing pieces', () => {
  const thin = indexContent({ meta, guides: [guides[0]], checklists: [], emergency: [] });
  const html = buildHandbookHTML({ content: thin, options: { scope: 'all' }, css: '', now: NOW });
  assert.ok(html.includes('CAIRN') && html.includes(esc(guides[0].title)));
  assert.doesNotThrow(() => buildHandbookHTML({ content: thin, options: { includePersonal: true }, plan: null, states: {}, css: '', now: NOW }));
});
