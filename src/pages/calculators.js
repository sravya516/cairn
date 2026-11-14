// Calculator list and a single schema-driven calculator screen with live results.
import { h, fill } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { CALCULATORS, getCalculator } from '../calculators/registry.js';
import { restoreInputs } from '../calculators/common.js';
import { PRESETS } from '../calculators/power.js';
import { getStore } from '../services/storage/index.js';
import { cardLink } from '../components/ui.js';

export function calculatorsHome() {
  return h('div', null,
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Calculators'),
    h('p', { class: 'muted' }, 'Work fully offline. Each one lists its assumptions and limits. Results are planning estimates, not guarantees.'),
    ...CALCULATORS.map((c) => cardLink({ href: `#/calc/${c.id}`, iconName: c.icon, title: c.title, subtitle: c.summary })));
}

export async function calculatorPage({ id }) {
  const calc = getCalculator(id);
  if (!calc) return h('div', null, h('h1', { tabindex: '-1', id: 'page-title' }, 'Calculator not found'), h('a', { class: 'btn', href: '#/calculators' }, 'All calculators'));
  const store = await getStore();
  const key = `calc:${id}`;

  // Inputs are kept as raw strings/booleans exactly as typed; validation happens in compute().
  const saved = await store.get(key, null);
  let inputs = restoreInputs(calc, saved);

  const resultsBox = h('div', { class: 'card results-box', role: 'status', 'aria-live': 'polite' });
  // Slim copy of the main result, shown only after the full results scroll out of view. Hidden from screen readers (the live region above already announces results).
  const summaryBar = h('div', { class: 'calc-summary', 'aria-hidden': 'true' }, h('div', { class: 'calc-summary-inner' }, h('div', { class: 'calc-summary-bar' })));
  const summaryText = summaryBar.querySelector('.calc-summary-bar');
  const errEls = {};
  const form = h('form', { class: 'card calc-form', novalidate: true, onsubmit: (e) => e.preventDefault() });

  let timer = null;
  const recompute = () => {
    const out = calc.compute(inputs);
    for (const f of calc.fields) { const el = errEls[f.key]; if (el) el.textContent = ''; }
    form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
    if (!out.ok) {
      for (const [k, msg] of Object.entries(out.errors)) {
        if (errEls[k]) errEls[k].textContent = msg;
        form.querySelector(`[data-key="${k}"]`)?.setAttribute('aria-invalid', 'true');
      }
      summaryText.replaceChildren(h('strong', null, 'Check your inputs'));
      fill(resultsBox, h('h2', null, 'Check your inputs'), h('p', { class: 'bad' }, Object.values(out.errors)[0]));
      return;
    }
    const primary = out.results.find((r) => r.primary) || out.results[0];
    summaryText.replaceChildren(h('strong', null, primary.value), h('span', null, primary.label));
    fill(resultsBox,
      h('p', { class: 'muted small' }, primary.label),
      h('p', { class: 'big' }, primary.value),
      primary.note ? h('p', { class: 'muted small' }, primary.note) : null,
      h('dl', { class: 'result-list' }, out.results.filter((r) => r !== primary).flatMap((r) => [
        h('dt', null, r.label), h('dd', null, r.value, r.note ? h('span', { class: 'muted small' }, ' · ' + r.note) : null)])),
      out.breakdown ? h('details', null, h('summary', null, 'Per-device energy'), h('ul', null, out.breakdown.map((b) => h('li', null, `${b.name}: ${b.wh} Wh/day`)))) : null,
      ...out.notes.map((n) => h('p', { class: 'small muted' }, n)));
  };
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { recompute(); store.set(key, inputs).catch(() => {}); }, 120);
  };

  for (const f of calc.fields) form.append(fieldEl(f));

  function fieldEl(f) {
    const err = h('p', { class: 'error small', id: `err-${f.key}`, role: 'alert' });
    errEls[f.key] = err;
    const labelText = f.unit ? `${f.label} (${f.unit})` : f.label;
    const help = f.help ? h('p', { class: 'help', id: `help-${f.key}` }, f.help) : null;
    const desc = [f.help ? `help-${f.key}` : null, `err-${f.key}`].filter(Boolean).join(' ');

    if (f.type === 'checkbox') {
      const cb = h('input', { type: 'checkbox', id: `f-${f.key}`, 'data-key': f.key, 'aria-describedby': desc });
      cb.checked = !!inputs[f.key];
      cb.addEventListener('change', () => { inputs[f.key] = cb.checked; changed(); });
      return h('div', { class: 'field check-field' }, h('label', { for: `f-${f.key}`, class: 'inline' }, cb, ' ', f.label), help, err);
    }
    if (f.type === 'select') {
      const sel = h('select', { id: `f-${f.key}`, 'data-key': f.key, 'aria-describedby': desc }, f.options.map((o) => h('option', { value: String(o.value) }, o.label)));
      sel.value = String(inputs[f.key]);
      sel.addEventListener('change', () => { inputs[f.key] = sel.value; changed(); });
      return h('div', { class: 'field' }, h('label', { for: `f-${f.key}` }, labelText), sel, help, err);
    }
    if (f.type === 'devices') return devicesEditor(f, err);
    const input = h('input', { type: 'text', inputmode: f.integer ? 'numeric' : 'decimal', id: `f-${f.key}`, 'data-key': f.key, autocomplete: 'off', 'aria-describedby': desc });
    input.value = inputs[f.key] == null ? '' : String(inputs[f.key]);
    input.addEventListener('input', () => { inputs[f.key] = input.value; changed(); });
    return h('div', { class: 'field' }, h('label', { for: `f-${f.key}` }, labelText), input, help, err);
  }

  function devicesEditor(f, err) {
    const holder = h('div', { class: 'devices', 'data-key': f.key });
    const paint = () => {
      holder.replaceChildren(...inputs[f.key].map((d, i) => {
        const bind = (prop, el) => { el.addEventListener('input', () => { inputs[f.key][i][prop] = el.value; changed(); }); return el; };
        return h('div', { class: 'device' },
          h('label', { class: 'sr-only', for: `dn-${i}` }, 'Device name'), bind('name', h('input', { type: 'text', id: `dn-${i}`, value: d.name, maxlength: 60, placeholder: 'Device' })),
          h('div', { class: 'device-nums' },
            h('label', null, 'Watts', bind('watts', h('input', { type: 'text', inputmode: 'decimal', value: String(d.watts), 'aria-label': `${d.name} watts` }))),
            h('label', null, 'Hours/day', bind('hours', h('input', { type: 'text', inputmode: 'decimal', value: String(d.hours), 'aria-label': `${d.name} hours per day` }))),
            h('label', null, 'Qty', bind('qty', h('input', { type: 'text', inputmode: 'numeric', value: String(d.qty), 'aria-label': `${d.name} quantity` })))),
          h('button', { type: 'button', class: 'btn secondary small-btn', 'aria-label': `Remove ${d.name}`, onclick: () => { inputs[f.key].splice(i, 1); paint(); changed(); } }, 'Remove'));
      }));
    };
    const preset = h('select', { 'aria-label': 'Choose a typical device to add' }, h('option', { value: '' }, 'Add a typical device…'), PRESETS.map((p, i) => h('option', { value: String(i) }, `${p.name} (${p.watts} W)`)));
    preset.addEventListener('change', () => { if (preset.value === '') return; inputs[f.key].push({ ...PRESETS[Number(preset.value)] }); preset.value = ''; paint(); changed(); });
    const blank = h('button', { type: 'button', class: 'btn secondary small-btn', onclick: () => { inputs[f.key].push({ name: '', watts: 10, hours: 1, qty: 1 }); paint(); changed(); } }, 'Add blank device');
    paint();
    return h('div', { class: 'field' }, h('label', null, f.label), h('p', { class: 'help' }, 'Typical values are estimates. Check the label on your own equipment.'), holder, preset, blank, err);
  }

  const resetBtn = h('button', { type: 'button', class: 'btn secondary block', onclick: () => {
    inputs = calc.defaults();
    for (const el of form.querySelectorAll('.field')) el.remove();
    for (const f of calc.fields) form.append(fieldEl(f));
    recompute(); store.set(key, inputs).catch(() => {});
  } }, icon('back'), 'Reset to defaults');

  recompute();
  const page = h('div', { class: 'calc' },
    h('a', { class: 'back', href: '#/calculators' }, icon('back'), 'All calculators'),
    h('h1', { tabindex: '-1', id: 'page-title' }, calc.title),
    h('p', { class: 'muted' }, calc.summary),
    resultsBox, form, resetBtn,
    h('div', { class: 'card' }, h('h2', null, 'Assumptions'), h('ul', null, calc.assumptions.map((a) => h('li', null, a)))),
    h('div', { class: 'card' }, h('h2', null, 'Limitations'), h('ul', null, calc.limitations.map((a) => h('li', null, a)))),
    h('p', { class: 'muted small' }, 'These are planning estimates, not guarantees. Conditions and needs vary.'));
  page.prepend(summaryBar);

  // Show the slim bar once the full results have scrolled up under the header.
  if (typeof IntersectionObserver !== 'undefined') {
    const headerPx = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top'), 10) || 60;
    new IntersectionObserver(([entry]) => {
      summaryBar.classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.bottom < headerPx + 1);
    }, { rootMargin: `-${headerPx}px 0px 0px 0px` }).observe(resultsBox);
  }
  return page;
}
