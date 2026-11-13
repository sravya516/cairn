// Handbook screen: choose what to include, preview, print / save as PDF, or download as a file.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { loadContent } from '../services/content.js';
import { getStore } from '../services/storage/index.js';
import { loadAllStates } from '../services/checklists.js';
import { loadPlan } from '../services/plan.js';
import { buildHandbookHTML, estimatePages, handbookFilename, SCOPES } from '../services/handbook.js';

let cssCache = null;
async function handbookCss() {
  if (cssCache) return cssCache;
  const res = await fetch('./src/styles/handbook.css');
  if (!res.ok) throw new Error('handbook.css not available');
  return (cssCache = await res.text());
}

export async function handbookPage() {
  const c = await loadContent();
  const store = await getStore();
  const css = await handbookCss();
  const opts = { scope: 'essential', includeChecklists: true, includeForms: true, includePersonal: false };

  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const frame = h('iframe', { class: 'hb-frame', title: 'Handbook preview', sandbox: 'allow-same-origin allow-modals' });
  let html = '';

  async function render() {
    const personal = opts.includePersonal;
    const plan = personal ? await loadPlan(store) : null;
    const states = personal ? await loadAllStates(store, c.checklists) : {};
    html = buildHandbookHTML({ content: c, options: opts, plan, states, css });
    frame.srcdoc = html;
    status.textContent = `About ${estimatePages(html)} pages · ${(html.length / 1024).toFixed(0)} KB. Built from the guides stored on this device.`;
  }

  const radio = (value) => {
    const r = h('input', { type: 'radio', name: 'scope', id: 'sc-' + value, value });
    r.checked = opts.scope === value;
    r.addEventListener('change', () => { opts.scope = value; render(); });
    return h('label', { class: 'inline', for: 'sc-' + value }, r, h('span', null, h('strong', null, SCOPES[value].label), h('span', { class: 'muted small block' }, SCOPES[value].note)));
  };
  const toggle = (key, label, help) => {
    const cb = h('input', { type: 'checkbox', id: 'op-' + key });
    cb.checked = opts[key];
    cb.addEventListener('change', () => { opts[key] = cb.checked; render(); });
    return h('label', { class: 'inline', for: 'op-' + key }, cb, h('span', null, h('strong', null, label), help ? h('span', { class: 'muted small block' }, help) : null));
  };

  const printBtn = h('button', { class: 'btn block', type: 'button', onclick: () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { status.textContent = 'Printing is not available here. Use “Download” and open the file in Safari or Chrome.'; }
  } }, icon('print'), 'Print or save as PDF');

  const dlBtn = h('button', { class: 'btn secondary block', type: 'button', onclick: async () => {
    const name = handbookFilename();
    const blob = new Blob([html], { type: 'text/html' });
    const file = new File([blob], name, { type: 'text/html' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: 'Cairn Handbook' }); status.textContent = 'Shared.'; return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    status.textContent = `Downloaded ${name}. Open it in a browser any time, with or without internet.`;
  } }, icon('download'), 'Download handbook file (HTML)');

  await render();
  return h('div', { class: 'handbook-page' },
    h('a', { class: 'back', href: '#/' }, icon('back'), 'Home'),
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Printable handbook'),
    h('p', { class: 'muted' }, 'A paper copy for when the lights and the network are both out. Built on this device from the bundled content: no internet and no PDF service needed.'),
    h('div', { class: 'card' }, h('h2', null, 'What to include'),
      radio('essential'), radio('all'),
      toggle('includeChecklists', 'Checklists', 'All 21 checklists with empty boxes to tick by hand.'),
      toggle('includeForms', 'Contact sheet and family plan forms', 'Fill-in-by-hand pages.'),
      toggle('includePersonal', 'Include my household plan and checklist progress', 'Prints your private information. Off by default. Keep printouts safe.')),
    h('div', { class: 'stack' }, printBtn, dlBtn), status,
    frame,
    h('div', { class: 'card' }, h('h2', null, 'Saving as a PDF'),
      h('ul', null,
        h('li', null, h('strong', null, 'Computer: '), 'choose “Print or save as PDF”, then pick “Save as PDF” as the printer.'),
        h('li', null, h('strong', null, 'iPhone: '), 'the Home Screen app may not open a print dialog. Use “Download”, open the saved file in Safari, tap Share, then Print. Pinch outward on the preview to turn it into a PDF you can save to Files.'),
        h('li', null, 'The downloaded file is a normal web page. You can email it to yourself or keep it on a USB drive.'))));
}
