// Content storage verification screen.
import { h } from '../utils/dom.js';
import { getStore, requestPersistence, storageEstimate } from '../services/storage/index.js';
import { loadContent } from '../services/content.js';
import { verifyOffline, redownloadOfflineCopy } from '../services/offline/verify.js';
import { offlineState, applyUpdate } from '../services/offline/register.js';

const LABEL = { ok: 'OK', warn: 'Check', fail: 'Problem' };
const SUMMARY = {
  ok: 'Ready for offline use. Everything essential is stored on this device.',
  warn: 'Mostly ready. Review the items marked “Check”.',
  fail: 'Not fully ready for offline use yet. See the items marked “Problem”.',
};

export function storagePage() {
  const results = h('ul', { class: 'checks' });
  const summary = h('div', { class: 'card', role: 'status', 'aria-live': 'polite' }, 'Checking…');
  const runBtn = h('button', { class: 'btn block', type: 'button' }, 'Run verification again');

  async function run() {
    summary.textContent = 'Checking…';
    results.replaceChildren();
    let content = null;
    try { content = await loadContent(); } catch (_) { /* reported by the check */ }
    const report = await verifyOffline({
      navigator, caches: globalThis.caches, fetch: (u, o) => fetch(u, o), store: await getStore(),
      content, requestPersistence, storageEstimate,
    });
    summary.replaceChildren(h('h2', null, report.overall === 'ok' ? 'Offline ready' : report.overall === 'warn' ? 'Almost ready' : 'Needs attention'),
      h('p', null, SUMMARY[report.overall]),
      h('p', { class: 'muted small' }, `Network now: ${navigator.onLine ? 'online' : 'offline'}${report.version ? ` · app version ${report.version}` : ''}`));
    for (const it of report.items) {
      results.append(h('li', { class: 'check ' + it.state },
        h('span', { class: 'badge' }, LABEL[it.state]),
        h('div', null, h('strong', null, it.label), h('div', { class: 'small muted' }, it.detail))));
    }
  }
  runBtn.addEventListener('click', run);

  const actions = h('div', { class: 'stack' },
    offlineState.updateReady ? h('button', { class: 'btn block', type: 'button', onclick: applyUpdate }, 'Install the new version now') : null,
    h('button', { class: 'btn secondary block', type: 'button', onclick: async (e) => {
      const p = await requestPersistence(); e.target.textContent = p.persisted ? 'Protected storage is on' : p.supported ? 'Browser declined — keep backups' : 'Not supported here — keep backups';
    } }, 'Request protected storage'),
    h('button', { class: 'btn secondary block', type: 'button', onclick: async (e) => {
      try { await redownloadOfflineCopy(); } catch (err) { e.target.textContent = err.message; }
    } }, 'Re-download offline copy'));

  run();
  return h('div', null,
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Offline & storage status'),
    h('p', { class: 'muted' }, 'Confirms that the guide, checklists and your data are stored on this device and will open without internet.'),
    summary, runBtn, h('div', { class: 'section-title' }, h('h2', null, 'Details')), results,
    h('div', { class: 'section-title' }, h('h2', null, 'Actions')), actions,
    h('div', { class: 'card' },
      h('h2', null, 'iPhone and iOS limits'),
      h('ul', null,
        h('li', null, 'Open Cairn in Safari, tap Share, then “Add to Home Screen”. Launch it from the Home Screen icon.'),
        h('li', null, 'Run it once while online and wait for “Offline ready” above. iOS only stores the offline copy after that first visit.'),
        h('li', null, 'iOS can clear website data if the phone is critically low on storage, or for sites used in Safari tabs but not installed. Installed Home Screen apps are treated more generously, but this is not a guarantee.'),
        h('li', null, 'Deleting the Home Screen app or clearing Safari website data erases your saved plan and checklist progress. Export a backup regularly.'),
        h('li', null, 'Updates install the next time you open the app while online; you will see an “update ready” bar.'))));
}
