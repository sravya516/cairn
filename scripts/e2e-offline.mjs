// Real-browser offline test (Edge or Chrome, headless) driven over the DevTools protocol. No dependencies.
// Run: npm run e2e
// Proves: installs the service worker, caches every file, survives a REAL outage (server killed),
// persists IndexedDB data across reloads, and picks up a new version when one is published.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const ROOT = process.cwd();
const APP_PORT = 4175, DEBUG_PORT = 9333;
const argBase = process.argv.includes('--base-path') ? process.argv[process.argv.indexOf('--base-path') + 1] : null;
const RAW_BASE = argBase || process.env.BASE_PATH || '/'; // pass "cairn" (no slashes): Git Bash on Windows rewrites "/cairn/"
const SEGMENT = RAW_BASE.replace(/^\/+|\/+$/g, '');
const BASE_PATH = SEGMENT ? `/${SEGMENT}/` : '/';
const ROOT_URL = `http://localhost:${APP_PORT}${BASE_PATH}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-e2e-'));
const dist = path.join(tmp, 'dist');
const profile = path.join(tmp, 'profile');

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browserPath = process.env.BROWSER || BROWSERS.find((p) => fs.existsSync(p));
if (!browserPath) { console.log('SKIP: no Chrome/Edge found (set BROWSER=path).'); process.exit(0); }

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const build = (stamp) => execFileSync(process.execPath, ['scripts/build.mjs', '--out', dist, '--stamp', stamp], { cwd: ROOT, stdio: 'pipe' });

let server = null, browser = null;
const killTree = (child) => {
  if (!child || child.killed) return;
  try { process.platform === 'win32' ? execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) : child.kill('SIGKILL'); } catch (_) { /* already gone */ }
};
const startServer = async () => {
  server = spawn(process.execPath, ['scripts/serve.mjs', dist, String(APP_PORT), new URL(ROOT_URL).pathname], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(ROOT_URL)).ok) return; } catch (_) { await sleep(100); } }
  throw new Error('server did not start');
};
const portOpen = (port) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); resolve(true); }); s.on('error', () => resolve(false)); });

// --- minimal CDP client -------------------------------------------------------------
let ws, nextId = 1; const pending = new Map(); const consoleErrors = []; const failedRequests = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression, timeout = 20000, label = expression) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await evaluate(expression)) return true; } catch (_) { /* page navigating */ } await sleep(250); }
  throw new Error('timeout waiting for: ' + label);
}
async function navigate(url) {
  await send('Page.navigate', { url });
  await sleep(300);
  await waitFor("document.readyState === 'complete' && !!document.querySelector('h1')", 15000, 'page load');
}

async function main() {
  build('A');
  await startServer();
  fs.mkdirSync(profile, { recursive: true });
  browser = spawn(browserPath, [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=390,844', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json(); } catch (_) { await sleep(150); } }
  const page = targets && targets.find((t) => t.type === 'page');
  if (!page) throw new Error('could not attach to browser');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
    else if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    else if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) failedRequests.push(msg.params.errorText);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

  // 1. First load while online
  await navigate(ROOT_URL);
  check('Initial load renders the app', (await evaluate('document.querySelector(\'h1\').textContent')) === 'CAIRN');

  // 2. Service worker installs, controls the page, caches every file
  await waitFor('!!navigator.serviceWorker.controller', 30000, 'service worker controlling page');
  check('Service worker registered and controlling page', true);
  const scope = await evaluate("navigator.serviceWorker.getRegistration().then((r) => r.scope)");
  check(`Service worker scope matches the deploy path (${new URL(ROOT_URL).pathname})`, scope === ROOT_URL, scope);
  const verify = `(async()=>{const m=await import('./src/services/offline/verify.js');const {getStore,requestPersistence,storageEstimate}=await import('./src/services/storage/index.js');const {loadContent}=await import('./src/services/content.js');
    const r=await m.verifyOffline({navigator,caches,fetch:(u,o)=>fetch(u,o),store:await getStore(),content:await loadContent(),requestPersistence,storageEstimate});return r})()`;
  const rep = await evaluate(verify);
  const st = (id) => rep.items.find((i) => i.id === id);
  check('All precached files present in cache', st('cache')?.state === 'ok', st('cache')?.detail);
  check('Every cached file matches its checksum', st('integrity')?.state === 'ok', st('integrity')?.detail);
  check('IndexedDB read/write works', st('db')?.state === 'ok', st('db')?.detail);
  const versionA = rep.version;

  // 3. Write user data to IndexedDB
  await evaluate(`(async()=>{const {getStore}=await import('./src/services/storage/index.js');const s=await getStore();await s.set('e2e',{answer:42,list:['a','b']});})()`);

  // 4. REAL outage: kill the server, confirm nothing is listening, also emulate offline in the browser
  killTree(server); server = null; await sleep(600);
  check('Server is really down (connection refused)', !(await portOpen(APP_PORT)));
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });

  // 5. Offline startup (full reload) and navigation across every route
  await navigate(ROOT_URL);
  check('OFFLINE: app starts from a cold reload', (await evaluate('document.querySelector(\'h1\').textContent')) === 'CAIRN');
  check('OFFLINE: status pill says offline', /Offline/.test(await evaluate("document.querySelector('.pill').textContent")));
  for (const [hash, h1] of [['#/guides', 'Guides'], ['#/checklists', 'Checklists'], ['#/calculators', 'Calculators'], ['#/plan', 'My Plan'], ['#/emergency', 'Emergency Now'], ['#/search', 'Search'], ['#/storage', 'Offline & storage status']]) {
    await evaluate(`location.hash='${hash}'`);
    await waitFor(`document.querySelector('h1') && document.querySelector('h1').textContent === ${JSON.stringify(h1)}`, 8000, hash);
    check(`OFFLINE: route ${hash} opens`, true);
  }
  await waitFor("document.querySelector('.check, .checks li')", 15000, 'storage checks');
  await waitFor("/Offline ready|Almost ready|Needs attention/.test(document.querySelector('.card[role=status] h2')?.textContent||'')", 15000, 'verification result');
  const verdict = await evaluate("document.querySelector('.card[role=status] h2').textContent");
  const lines = await evaluate("[...document.querySelectorAll('.check')].map(c=>c.textContent).join(' | ')");
  check('OFFLINE: storage verification screen reports ready', verdict === 'Offline ready' || verdict === 'Almost ready', `${verdict}: ${lines}`);

  // 5b. Real content, fully offline: guides, search, bookmarks
  await evaluate("location.hash='#/guides'");
  await waitFor("document.querySelectorAll('.card-link').length >= 12", 8000, 'category cards');
  check('OFFLINE: Guides hub lists all 12 categories', true);
  await evaluate("location.hash='#/guide/water-boiling'");
  await waitFor("document.querySelector('h1') && document.querySelector('h1').textContent === 'Boiling Water'", 8000, 'guide page');
  const guideInfo = await evaluate("({sections: document.querySelectorAll('.guide-sec').length, warn: !!document.querySelector('.callout.warn'), steps: document.querySelectorAll('ol.steps li').length, src: !!document.querySelector('.sources')})");
  check('OFFLINE: guide renders sections, steps, warnings and sources', guideInfo.sections >= 4 && guideInfo.warn && guideInfo.steps >= 4 && guideInfo.src, JSON.stringify(guideInfo));
  await evaluate("document.querySelector('.bm').click()");
  await sleep(400);
  check('OFFLINE: bookmark can be saved', (await evaluate("document.querySelector('.bm').getAttribute('aria-pressed')")) === 'true');
  await evaluate("location.hash='#/search?q=generator%20carbon%20monoxide'");
  await waitFor("document.querySelectorAll('.results .result').length > 0", 8000, 'search results');
  const topHit = await evaluate("document.querySelector('.results .result strong').textContent");
  check('OFFLINE: full-text search returns results', /Generator|Carbon Monoxide|Ventilation/i.test(topHit), topHit);
  const disasterCount = await evaluate("fetch('./data/content.json').then(r=>r.json()).then(c=>c.guides.filter(g=>g.category==='disasters').length)");
  check('OFFLINE: all 15 disaster guides are in the cached content', disasterCount === 15, String(disasterCount));

  // 5c. Phase 4 features, fully offline
  const setVal = (sel, v) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});el.value=${JSON.stringify(v)};el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await evaluate("location.hash='#/checklists'");
  await waitFor("document.querySelectorAll('.checklist-row').length === 21", 8000, '21 checklists');
  check('OFFLINE: Checklists screen lists all 21 checklists', true);
  await evaluate("location.hash='#/checklist/kit-72h'");
  await waitFor("document.querySelectorAll('.item').length >= 18", 8000, 'checklist items');
  await evaluate("document.querySelector('.item input[type=checkbox]').click()");
  await evaluate("document.querySelectorAll('.item input[type=checkbox]')[2].click()");
  await sleep(300);
  const pctText = await evaluate("document.querySelector('.card .bar + p').textContent");
  check('OFFLINE: checking items updates progress', /2 of \d+ done/.test(pctText), pctText);
  await setVal('#cn', 'Spare glasses'); await setVal('#cq', '2 pairs');
  await evaluate("document.querySelector('.add-form').requestSubmit()");
  await sleep(300);
  check('OFFLINE: custom item can be added', await evaluate("[...document.querySelectorAll('.item strong')].some(e=>e.textContent==='Spare glasses')"));
  await sleep(300);
  await navigate(ROOT_URL + '#/checklist/kit-72h');
  await waitFor("document.querySelectorAll('.item').length >= 18", 8000, 'items after reload');
  const afterReload = await evaluate("({checked: document.querySelectorAll('.item input:checked').length, custom: [...document.querySelectorAll('.item strong')].some(e=>e.textContent==='Spare glasses')})");
  check('OFFLINE: checklist progress and custom item persist after reload', afterReload.checked === 2 && afterReload.custom, JSON.stringify(afterReload));

  await evaluate("location.hash='#/calc/water'");
  await waitFor("document.querySelector('.results-box .big')", 8000, 'calculator');
  await setVal('#f-adults', '2'); await setVal('#f-children', '1'); await setVal('#f-days', '3');
  await sleep(500);
  check('OFFLINE: water calculator gives 9 gallons for 2 adults + 1 child x 3 days', /^9 gallons/.test(await evaluate("document.querySelector('.results-box .big').textContent")), await evaluate("document.querySelector('.results-box .big').textContent"));
  await setVal('#f-days', '0'); await sleep(400);
  check('OFFLINE: invalid calculator input shows an error, not a result', (await evaluate("document.querySelector('#err-days').textContent")).length > 0);
  await setVal('#f-days', '5'); await sleep(500);
  await navigate(ROOT_URL + '#/calc/water');
  await waitFor("document.querySelector('#f-days')", 8000);
  check('OFFLINE: calculator remembers last inputs after reload', (await evaluate("document.querySelector('#f-days').value")) === '5');
  await evaluate("location.hash='#/calc/power'");
  await waitFor("document.querySelectorAll('.device').length >= 3", 8000, 'power devices');
  check('OFFLINE: power calculator renders device editor', true);

  await evaluate("location.hash='#/plan/members'");
  await waitFor("document.querySelector('.btn.block')", 8000, 'plan members page');
  await evaluate("[...document.querySelectorAll('.btn.block')].find(b=>/Add person/.test(b.textContent)).click()");
  await waitFor("document.querySelector('#members-0-name')", 4000, 'new member form');
  await setVal('#members-0-name', 'Ana Test'); await setVal('#members-0-age', '34');
  await evaluate("document.querySelector('#members-0-age').blur()");
  await sleep(900);
  await evaluate("location.hash='#/plan/contacts'");
  await waitFor("document.querySelector('.btn.block')", 8000);
  await evaluate("[...document.querySelectorAll('.btn.block')].find(b=>/Add contact/.test(b.textContent)).click()");
  await waitFor("document.querySelector('#contacts-0-phone')", 4000);
  await setVal('#contacts-0-phone', 'not a phone');
  await sleep(900); // input is validated after a 500 ms debounce (headless Chrome does not fire blur without window focus)
  const phoneState = await evaluate("(()=>{const el=document.querySelector('#contacts-0-phone');const er=document.querySelector('#contacts-0-phone-err');return {value:el&&el.value,invalid:el&&el.getAttribute('aria-invalid'),err:er&&er.textContent,active:document.activeElement&&document.activeElement.id}})()");
  check('OFFLINE: plan form rejects an invalid phone number', !!phoneState.err && phoneState.invalid === 'true', JSON.stringify(phoneState));
  await navigate(ROOT_URL + '#/plan/members');
  await waitFor("document.querySelector('details.entry summary')", 8000, 'saved member');
  check('OFFLINE: household member persisted after reload', (await evaluate("document.querySelector('details.entry summary').textContent")).includes('Ana Test'));

  const roundTrip = await evaluate(`(async()=>{
    const {getStore}=await import('./src/services/storage/index.js');
    const b=await import('./src/services/backup/backup.js');
    const s=await getStore();
    const before=JSON.stringify(await b.collectData(s));
    const file=JSON.stringify(await b.buildBackup(s));
    await b.eraseAll(s);
    const erased=(await b.collectData(s)).household.members.length===0;
    const v=await b.validateBackup(file);
    await b.restoreBackup(s,v,{mode:'replace'});
    const after=JSON.stringify(await b.collectData(s));
    const tampered=JSON.parse(file); tampered.data.household.members[0].name='X';
    const t=await b.validateBackup(JSON.stringify(tampered));
    return {same: before===after, erased, ok: v.ok, tamperRejected: !t.ok, size: file.length};
  })()`);
  check('OFFLINE: backup -> erase -> restore round trip returns identical data (real IndexedDB)', roundTrip.same && roundTrip.erased && roundTrip.ok, JSON.stringify(roundTrip));
  check('OFFLINE: tampered backup is rejected', roundTrip.tamperRejected);
  await evaluate("location.hash='#/backup'");
  await waitFor("document.querySelector('#bk-file')", 8000, 'backup page');
  check('OFFLINE: backup and restore screen opens', true);

  // 5d. Phase 5 features, fully offline
  await evaluate("location.hash='#/emergency'");
  await waitFor("document.querySelectorAll('.em-btn').length >= 21", 8000, 'emergency cards');
  const emHead = await evaluate("({call: !!document.querySelector('a.call-911[href=\"tel:911\"]'), text: document.querySelector('.lead-911').textContent})");
  check('OFFLINE: Emergency Now shows Call 911 and all quick-reference cards', emHead.call && /911/.test(emHead.text));
  await evaluate("location.hash='#/emergency/bleeding'");
  await waitFor("document.querySelector('h1') && document.querySelector('h1').textContent === 'Severe Bleeding'", 8000, 'bleeding card');
  const card = await evaluate("({steps: document.querySelectorAll('.em-steps li').length, call: !!document.querySelector('a.call-911'), guide: !!document.querySelector('a[href=\"#/guide/bleeding-control\"]'), fontPx: parseFloat(getComputedStyle(document.querySelector('.em-steps li')).fontSize)})");
  check('OFFLINE: emergency card has numbered steps, a Call 911 button, full-guide link and large text', card.steps >= 4 && card.call && card.guide && card.fontPx >= 18, JSON.stringify(card));

  await navigate(ROOT_URL + '#/');
  await waitFor("document.querySelector('.home-search')", 8000, 'dashboard');
  const dash = await evaluate("({titles: [...document.querySelectorAll('h2')].map(h=>h.textContent), tel: [...document.querySelectorAll('.contact a')].map(a=>a.getAttribute('href')), search: !!document.querySelector('#home-q'), emergency: !!document.querySelector('a.btn.danger[href=\"#/emergency\"]'), quick: document.querySelectorAll('.quick-card').length})");
  check('OFFLINE: dashboard has progress, household, critical guides, contacts, tools, search and Emergency Now', ['Your preparedness', 'My household', 'Critical guides', 'Important contacts', 'Tools'].every((t) => dash.titles.includes(t)) && dash.search && dash.emergency && dash.quick >= 6 && dash.tel.includes('tel:911') && dash.tel.includes('tel:18002221222'), JSON.stringify(dash));
  await setVal('#home-q', 'boil water');
  await evaluate("document.querySelector('.home-search').requestSubmit()");
  await waitFor("location.hash.startsWith('#/search') && document.querySelectorAll('.results .result').length > 0", 8000, 'home search');
  check('OFFLINE: home search opens results', /boil/i.test(await evaluate("decodeURIComponent(location.hash)")));

  await evaluate("location.hash='#/about'");
  await waitFor("document.body.textContent.includes('Disclaimer')", 8000, 'about');
  check('OFFLINE: About page shows disclaimer, sources and privacy statement', await evaluate("['Disclaimer','Sources','Your privacy','NOT professionally reviewed'].every(t=>document.body.textContent.includes(t))"));

  await evaluate("location.hash='#/handbook'");
  await waitFor("document.querySelector('iframe.hb-frame') && document.querySelector('iframe.hb-frame').srcdoc.length > 100000", 15000, 'handbook preview');
  const hb = await evaluate("({len: document.querySelector('iframe.hb-frame').srcdoc.length, status: document.querySelector('.handbook-page [role=status]').textContent, hasCards: document.querySelector('iframe.hb-frame').srcdoc.includes('Severe Bleeding')})");
  check('OFFLINE: handbook is generated from local content', hb.hasCards && /pages/.test(hb.status), JSON.stringify(hb));

  // Real PDF through Chrome's print engine, with the server down.
  await navigate(ROOT_URL + 'offline.html');
  const gen = await evaluate(`(async()=>{
    const hbk = await import('./src/services/handbook.js');
    const {loadContent} = await import('./src/services/content.js');
    const css = await (await fetch('./src/styles/handbook.css')).text();
    const html = hbk.buildHandbookHTML({content: await loadContent(), options: {scope:'essential'}, css});
    document.open(); document.write(html); document.close();
    return html.length;
  })()`);
  await sleep(1200);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  const buf = Buffer.from(pdf.data, 'base64');
  const pdfText = buf.toString('latin1');
  const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('OFFLINE: handbook prints to a real PDF (header, size, page count)', pdfText.startsWith('%PDF-') && buf.length > 100000 && pageCount >= 25, `${buf.length} bytes, ${pageCount} pages, html ${gen} chars`);
  // The PDF step replaced the page's document, so reload for real (a hash-only navigation would not).
  await send('Page.navigate', { url: ROOT_URL });
  await sleep(500);
  await waitFor("document.readyState === 'complete' && !!document.documentElement.dataset.route", 15000, 'app reload after PDF');

  // Notched-iPhone layout (real-device bug): sticky and fixed bars must start below the header and never cover the form
  let notch = true;
  try { await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } }); } catch (_) { notch = false; }
  if (notch) {
    await evaluate("location.hash='#/calc/water'");
    await waitFor("document.documentElement.dataset.route === '#/calc/water' && !!document.querySelector('.results-box')", 8000, 'water calculator');
    await sleep(400);
    const geo = await evaluate(`(() => {
      const hb = document.querySelector('header.header').getBoundingClientRect().bottom;
      const cssVar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top'));
      const before = document.querySelector('.calc-summary').classList.contains('show');
      window.scrollTo(0, 900);
      return { hb: Math.round(hb), cssVar: Math.round(cssVar), before, resultsSticky: getComputedStyle(document.querySelector('.results-box')).position };
    })()`);
    await sleep(500);
    const after = await evaluate(`(() => {
      const bar = document.querySelector('.calc-summary');
      const r = bar.querySelector('.calc-summary-bar').getBoundingClientRect();
      const hb = document.querySelector('header.header').getBoundingClientRect().bottom;
      const input = document.querySelector('#f-adults');
      input.scrollIntoView({ block: 'center' });
      const ir = input.getBoundingClientRect();
      return { shown: bar.classList.contains('show'), top: Math.round(r.top), height: Math.round(r.height), hb: Math.round(hb), inputBelowBar: ir.top > r.bottom, text: bar.textContent.slice(0, 40) };
    })()`);
    check('NOTCHED IPHONE: header measured at its real height (includes the safe area)', geo.hb > 100 && Math.abs(geo.hb - geo.cssVar) <= 2, JSON.stringify(geo));
    check('NOTCHED IPHONE: the full results panel is not sticky and no bar shows at the top', geo.resultsSticky !== 'sticky' && !geo.before);
    check('NOTCHED IPHONE: slim result bar appears under the header after scrolling, and is small', after.shown && Math.abs(after.top - after.hb) <= 2 && after.height < 80, JSON.stringify(after));
    check('NOTCHED IPHONE: form inputs are never covered by the bar', after.inputBelowBar, JSON.stringify(after));
    await evaluate("location.hash='#/guide/hurricanes'");
    await waitFor("document.documentElement.dataset.route === '#/guide/hurricanes' && !!document.querySelector('.toc')", 8000, 'guide with section bar');
    await evaluate("window.scrollTo(0, 700)");
    await sleep(400);
    const toc = await evaluate("({ top: Math.round(document.querySelector('.toc').getBoundingClientRect().top), hb: Math.round(document.querySelector('header.header').getBoundingClientRect().bottom) })");
    check('NOTCHED IPHONE: guide section bar sticks directly below the header (not under it)', Math.abs(toc.top - toc.hb) <= 2, JSON.stringify(toc));
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } }).catch(() => {});
    await evaluate("location.hash='#/'");
    await sleep(300);
  } else console.log('NOTE  safe-area emulation unavailable in this browser; notch layout checks skipped');

  // Skip link must move focus without breaking the router
  const skip = await evaluate("(()=>{const before=location.hash;document.querySelector('.skip-link').click();return {same: location.hash===before, focused: document.activeElement&&document.activeElement.id}})()");
  check('OFFLINE: skip-to-content link moves focus and does not change the route', skip.same && skip.focused === 'view', JSON.stringify(skip));

  // 5e. Whole-app sweep, offline: every screen is opened and audited
  await evaluate(`window.__sweepRoute = ''; window.__sweepDone = false; window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason && e.reason.stack || e.reason))); (async () => {
    const { loadContent } = await import('./src/services/content.js');
    const { CALCULATORS } = await import('./src/calculators/registry.js');
    const { SECTIONS } = await import('./src/services/plan.js');
    const { routes } = await import('./src/routes.js');
    const { parseHash, matchRoute } = await import('./src/navigation/router.js');
    const c = await loadContent();
    const list = ['#/', '#/emergency', '#/search', '#/storage', '#/guides', '#/checklists', '#/calculators', '#/plan', '#/handbook', '#/about', '#/backup',
      ...c.meta.categories.map((x) => '#/guides/' + x.id), ...c.guides.map((g) => '#/guide/' + g.id), ...c.checklists.map((x) => '#/checklist/' + x.id),
      ...CALCULATORS.map((x) => '#/calc/' + x.id), ...c.emergency.map((x) => '#/emergency/' + x.id), ...SECTIONS.map((s) => '#/plan/' + s.id)];
    const linkOk = (href) => {
      if (/^tel:\\+?\\d{3,15}$/.test(href)) return true;
      if (!href.startsWith('#/')) return false;
      const m = matchRoute(routes, parseHash(href).path);
      if (!m) return false;
      const p = m.params;
      switch (m.route.pattern) {
        case 'guide/:id': return c.guideById.has(p.id);
        case 'guides/:cat': return c.categoryById.has(p.cat);
        case 'checklist/:id': return c.checklistById.has(p.id);
        case 'calc/:id': return CALCULATORS.some((x) => x.id === p.id);
        case 'emergency/:id': return c.emergencyById.has(p.id);
        case 'plan/:section': return SECTIONS.some((s) => s.id === p.section);
        default: return true;
      }
    };
    const nameOf = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim() || (el.getAttribute('aria-labelledby') ? 'ok' : '') || (el.querySelector('img[alt]') ? 'ok' : '');
    const problems = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const r of list) {
      window.__sweepRoute = r;
      await wait(70); // Chrome throttles pages that make more than ~200 navigations in 10 s, so pace the sweep
      document.documentElement.dataset.route = '';
      if (location.hash === r) location.hash = '#/x-reset';
      location.hash = r;
      let waited = 0;
      while (document.documentElement.dataset.route !== r && waited < 8000) { await wait(15); waited += 15; }
      const bad = (m) => problems.push(r + ': ' + m);
      if (document.documentElement.dataset.route !== r) { bad('did not finish rendering (route=' + document.documentElement.dataset.route + ', hash=' + location.hash + ', errors=' + JSON.stringify((window.__errs || []).slice(-2)) + ', view=' + document.querySelector('main#view').textContent.slice(0, 80) + ')'); continue; }
      const main = document.querySelector('main#view');
      const h1s = main.querySelectorAll('h1');
      if (h1s.length !== 1) bad(h1s.length + ' h1 elements');
      if (!/ · Cairn$/.test(document.title)) bad('title "' + document.title + '"');
      if (document.activeElement && document.activeElement.id !== 'page-title') bad('focus not moved to the page heading');
      if (document.documentElement.scrollWidth > innerWidth + 1) bad('horizontal overflow ' + document.documentElement.scrollWidth + ' > ' + innerWidth);
      if (/\\b(undefined|NaN)\\b|\\[object|\\bnull\\b/.test(main.textContent)) bad('stray text: ' + (main.textContent.match(/.{0,25}(undefined|NaN|\\[object|\\bnull\\b).{0,10}/) || [''])[0]);
      for (const el of main.querySelectorAll('input:not([type=hidden]), select, textarea')) {
        const named = (el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        if (!named) bad('unlabelled <' + el.tagName.toLowerCase() + '> id=' + el.id);
      }
      for (const el of document.querySelectorAll('button, a[href]')) if (!nameOf(el)) bad('control without an accessible name: ' + el.outerHTML.slice(0, 80));
      for (const a of document.querySelectorAll('a[href]:not(.skip-link)')) if (!linkOk(a.getAttribute('href'))) bad('dead or unsupported link ' + a.getAttribute('href'));
      for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) bad('img without alt');
      for (const l of main.querySelectorAll('label[for]')) if (!document.getElementById(l.getAttribute('for'))) bad('label for missing id ' + l.getAttribute('for'));
      for (const el of main.querySelectorAll('[aria-describedby]')) for (const id of el.getAttribute('aria-describedby').split(' ')) if (!document.getElementById(id)) bad('aria-describedby points to missing #' + id);
      const ids = [...document.querySelectorAll('#app [id]')].map((e) => e.id); // the app's own DOM only (browsers may inject their own elements)
      const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
      if (dup.length) bad('duplicate ids: ' + [...new Set(dup)].join(', '));
    }
    return { count: list.length, problems };
  })().then((r) => { window.__sweepResult = r; window.__sweepDone = true; }, (e) => { window.__sweepResult = { count: 0, problems: ['sweep crashed: ' + e.message] }; window.__sweepDone = true; }); 0`);
  try { await waitFor('window.__sweepDone', 240000, 'whole-app sweep'); } catch (e) { throw new Error(e.message + ' (last route: ' + await evaluate('window.__sweepRoute') + ')'); }
  const sweep = await evaluate('window.__sweepResult');
  check(`OFFLINE SWEEP: ${sweep.count} screens audited (headings, labels, names, links, overflow, stray text)`, sweep.problems.length === 0, sweep.problems.slice(0, 6).join(' | '));
  await evaluate("location.hash='#/'");

  // Layout at tablet and desktop widths (the sweep above ran at phone width)
  for (const [w, hgt] of [[768, 1024], [1280, 800]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: 1, mobile: w < 800 });
    await sleep(300);
    const wide = await evaluate(`(async () => {
      const out = [];
      for (const r of ['#/', '#/emergency', '#/guides', '#/guide/hurricanes', '#/checklist/kit-72h', '#/calc/power', '#/plan/members', '#/handbook', '#/backup']) {
        document.documentElement.dataset.route = ''; location.hash = '#/x-reset'; location.hash = r;
        for (let i = 0; i < 400 && document.documentElement.dataset.route !== r; i++) await new Promise((x) => setTimeout(x, 15));
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push(r + ' overflows (' + document.documentElement.scrollWidth + ' > ' + innerWidth + ')');
      }
      return out;
    })()`);
    check(`OFFLINE: no horizontal overflow at ${w}px wide`, wide.length === 0, wide.join(' | '));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

  // Startup time from the cached copy (offline). Headless budgets are generous; the real number is logged.
  const times = [];
  for (let i = 0; i < 3; i++) {
    await send('Page.navigate', { url: ROOT_URL });
    await sleep(200);
    times.push(await evaluate("new Promise((res) => { const t = setInterval(() => { if (document.documentElement.dataset.route) { clearInterval(t); res(Math.round(performance.now())); } }, 5); })"));
  }
  times.sort((a, b) => a - b);
  check('OFFLINE: home screen renders from the cache in under 2 seconds', times[1] < 2000, `median ${times[1]} ms (runs: ${times.join(', ')})`);

  // 6. Deep-link navigation fallback (a URL that doesn't exist on disk) still serves the shell offline
  await navigate(ROOT_URL + 'some/unknown/path');
  check('OFFLINE: unknown URL is redirected to the cached app shell', (await evaluate("document.querySelector('h1').textContent")) === 'CAIRN' && (await evaluate('location.pathname')) === new URL(ROOT_URL).pathname);

  // 7. IndexedDB data survived reload + outage
  const saved = await evaluate(`(async()=>{const {getStore}=await import('./src/services/storage/index.js');return (await getStore()).get('e2e')})()`);
  check('OFFLINE: IndexedDB data persisted across reloads', saved && saved.answer === 42 && saved.list.length === 2);

  await navigate(ROOT_URL + '#/guides');
  await waitFor("document.body.textContent.includes('Bookmarked')", 8000, 'bookmarks section');
  check('OFFLINE: bookmark persisted across reload (IndexedDB) and shows on Guides', true);

  // 7b. Corrupted local data must never break the app
  await evaluate(`(async () => {
    const { getStore } = await import('./src/services/storage/index.js');
    const s = await getStore();
    await s.set('household', { members: 'broken', outOfArea: 7, contacts: [null, 5, { name: 123 }] });
    await s.set('checklist:kit-72h', 'garbage');
    await s.set('checklist:flood', { checked: { a: 'yes' }, notes: [], custom: 'x' });
    await s.set('bookmarks', 123);
    await s.set('recents', { a: 1 });
    await s.set('calc:water', { adults: { x: 1 }, days: [] });
    await s.set('calc:power', { devices: [null, 5, 'x'] });
    await s.set('ui:installTipDismissed', 'maybe');
  })()`);
  const broken = await evaluate(`(async () => {
    const out = [];
    for (const r of ['#/', '#/plan', '#/plan/members', '#/plan/contacts', '#/checklists', '#/checklist/kit-72h', '#/checklist/flood', '#/guides', '#/calc/water', '#/calc/power', '#/backup']) {
      document.documentElement.dataset.route = ''; location.hash = '#/x-reset'; location.hash = r;
      for (let i = 0; i < 400 && document.documentElement.dataset.route !== r; i++) await new Promise((x) => setTimeout(x, 15));
      const t = document.querySelector('main#view').textContent;
      if (document.documentElement.dataset.route !== r) out.push(r + ' never rendered');
      else if (/Something went wrong/.test(t)) out.push(r + ' crashed: ' + t.slice(0, 80));
      else if (!document.querySelector('h1')) out.push(r + ' has no heading');
    }
    return out;
  })()`);
  check('OFFLINE: corrupted saved data (plan, checklists, bookmarks, calculators) never breaks a screen', broken.length === 0, broken.join(' | '));
  const healed = await evaluate(`(async () => {
    const { getStore } = await import('./src/services/storage/index.js');
    const { loadPlan, isValidPlan } = await import('./src/services/plan.js');
    const s = await getStore();
    return { plan: isValidPlan(await loadPlan(s)), issues: s.issues.length };
  })()`);
  check('OFFLINE: damaged records are detected and reported by the storage layer', healed.plan && healed.issues > 0, JSON.stringify(healed));
  await evaluate(`(async () => {
    const b = await import('./src/services/backup/backup.js');
    const { getStore } = await import('./src/services/storage/index.js');
    await b.eraseAll(await getStore());
  })()`);

  // 8. Back online with a NEW build published: update flow
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  build('B');
  await startServer();
  await navigate(ROOT_URL);
  await evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())");
  await waitFor("import('./src/services/offline/register.js').then(m=>m.offlineState.updateReady)", 30000, 'update ready');
  check('UPDATE: new version is detected and waits for user approval', true);
  check('UPDATE: update banner is shown', await evaluate("!document.querySelector('.update-banner').hidden"));
  const stillOld = (await evaluate("caches.keys()")).filter((k) => k.startsWith('cairn-v-'));
  check('UPDATE: old cache stays until the user installs (no half-updates)', stillOld.length === 2 && stillOld.includes('cairn-v-' + versionA), stillOld.join(','));
  await evaluate("import('./src/services/offline/register.js').then(m=>m.applyUpdate())");
  await sleep(2500);
  await waitFor("document.readyState==='complete' && !!document.querySelector('h1')", 15000);
  const keys = (await evaluate('caches.keys()')).filter((k) => k.startsWith('cairn-v-'));
  check('UPDATE: after install only the new cache version remains', keys.length === 1 && keys[0] !== 'cairn-v-' + versionA, keys.join(','));
  const stamp = await evaluate("fetch('./build-stamp.txt').then(r=>r.text())");
  check('UPDATE: app now serves the new build', stamp === 'B');

  check('No JavaScript errors during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
}

try { await main(); } catch (e) { check('E2E run completed', false, e.message); }
finally {
  try { ws && ws.close(); } catch (_) { /* ignore */ }
  killTree(browser); killTree(server);
  await sleep(500);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* profile may still be locked */ }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
