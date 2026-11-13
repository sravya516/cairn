// My Plan: household details stored only on this device, edited with validation and autosave.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getStore } from '../services/storage/index.js';
import { loadContent } from '../services/content.js';
import { loadAllStates, overallProgress, PREPAREDNESS_GROUPS } from '../services/checklists.js';
import { SECTIONS, SECTION_BY_ID, loadPlan, savePlan, validateField, newId, completeness, sectionCount, MAX_ITEMS } from '../services/plan.js';
import { cardLink } from '../components/ui.js';
import { progressBar } from './checklists.js';
import { themeButton } from '../components/shell.js';

const SECTION_ICON = { members: 'plan', contacts: 'phone', outOfArea: 'phone', meeting: 'shelter', evacuation: 'car', pets: 'shield', addresses: 'home', vehicles: 'car', notes: 'book' };

export async function planHome() {
  const store = await getStore();
  const plan = await loadPlan(store);
  const c = await loadContent();
  const states = await loadAllStates(store, c.checklists);
  const prog = overallProgress(c.checklists, states, { groups: PREPAREDNESS_GROUPS });
  const comp = completeness(plan);

  return h('div', null,
    h('h1', { tabindex: '-1', id: 'page-title' }, 'My Plan'),
    h('div', { class: 'notice', role: 'note' },
      h('strong', null, 'Private by design. '),
      'Everything here is stored only on this device and is never sent anywhere. It may include sensitive medical and family details: use a phone passcode, and export a backup only to places you control. If this phone is lost, someone with access could read it.'),
    h('div', { class: 'card' },
      h('h2', null, 'Plan completeness'), progressBar(comp.pct, 'Plan completeness'),
      h('p', null, h('strong', null, `${comp.pct}%`), ` · ${comp.done} of ${comp.total} steps`),
      comp.missing.length ? h('ul', { class: 'small' }, comp.missing.slice(0, 4).map((m) => h('li', null, m))) : h('p', { class: 'small' }, 'Your plan covers every step. Review it twice a year.')),
    h('div', { class: 'card' },
      h('h2', null, 'Supplies progress'), progressBar(prog.pct, 'Supplies progress'),
      h('p', null, h('strong', null, `${prog.pct}%`), ` · ${prog.done} of ${prog.total} kit and supply items`), h('a', { class: 'btn secondary', href: '#/checklists' }, 'Open checklists')),
    h('div', { class: 'section-title' }, h('h2', null, 'Household plan')),
    ...SECTIONS.map((s) => cardLink({ href: `#/plan/${s.id}`, iconName: SECTION_ICON[s.id], title: s.title, subtitle: s.kind === 'list' ? `${sectionCount(plan, s)} saved` : (sectionCount(plan, s) ? 'Filled in' : 'Not filled in yet') })),
    h('div', { class: 'section-title' }, h('h2', null, 'Your data')),
    cardLink({ href: '#/backup', iconName: 'download', title: 'Backup and restore', subtitle: 'Export your plan and checklists, or restore them' }),
    cardLink({ href: '#/storage', iconName: 'wifi', title: 'Offline and storage status', subtitle: 'Verify everything is saved on this device' }),
    h('p', null, themeButton({ labelled: true, cls: 'btn secondary block' })));
}

export async function planSection({ section }) {
  const def = SECTION_BY_ID[section];
  if (!def) return h('div', null, h('h1', { tabindex: '-1', id: 'page-title' }, 'Section not found'), h('a', { class: 'btn', href: '#/plan' }, 'My Plan'));
  const store = await getStore();
  let plan = await loadPlan(store);

  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' }, 'Changes save automatically on this device.');
  let chain = Promise.resolve();
  const persist = () => {
    const snapshot = plan;
    chain = chain.then(async () => { plan = { ...plan, updated: (await savePlan(store, snapshot)).updated }; status.textContent = 'Saved on this device.'; })
      .catch(() => { status.textContent = 'Could not save. Storage may be full or blocked.'; });
  };

  /** Builds one input bound to `target[field.key]`. Invalid values show an error and are not saved. */
  function fieldInput(field, target, idPrefix) {
    const id = `${idPrefix}-${field.key}`;
    const err = h('p', { class: 'error small', id: `${id}-err`, role: 'alert' });
    const common = { id, 'aria-describedby': `${id}-err`, maxlength: field.max || undefined };
    let el;
    if (field.type === 'textarea') el = h('textarea', { ...common, rows: 3 });
    else el = h('input', { ...common, type: field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : 'text', inputmode: field.type === 'age' ? 'numeric' : field.type === 'phone' ? 'tel' : undefined, autocomplete: 'off', autocapitalize: field.type === 'email' ? 'off' : undefined });
    el.value = target[field.key] || '';
    let timer = null;
    const commit = () => {
      const r = validateField(field, el.value);
      if (!r.ok) { err.textContent = r.error; el.setAttribute('aria-invalid', 'true'); return false; }
      err.textContent = ''; el.removeAttribute('aria-invalid');
      if (target[field.key] !== r.value) { target[field.key] = r.value; persist(); }
      return true;
    };
    el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(commit, 500); });
    el.addEventListener('blur', () => { clearTimeout(timer); commit(); });
    return h('div', { class: 'field' }, h('label', { for: id }, field.label, field.required ? ' *' : ''), field.help ? h('p', { class: 'help' }, field.help) : null, el, err);
  }

  const body = h('div');
  if (def.kind === 'single') {
    body.append(h('form', { class: 'card', novalidate: true, onsubmit: (e) => e.preventDefault() }, def.fields.map((f) => fieldInput(f, plan[def.id], def.id))));
  } else {
    const list = h('div');
    const addBtn = h('button', { type: 'button', class: 'btn block', onclick: () => {
      if (plan[def.id].length >= MAX_ITEMS) { status.textContent = `You can save up to ${MAX_ITEMS} entries here.`; return; }
      const item = { id: newId(), ...Object.fromEntries(def.fields.map((f) => [f.key, ''])) };
      item[def.titleKey] = '';
      plan[def.id].push(item); paint(true);
    } }, icon('check'), `Add ${def.itemLabel}`);
    const paint = (focusLast = false) => {
      list.replaceChildren(...plan[def.id].map((it, i) => {
        let armed = false;
        const rm = h('button', { type: 'button', class: 'btn secondary small-btn', onclick: () => {
          if (!armed) { armed = true; rm.textContent = 'Tap again to delete'; setTimeout(() => { armed = false; rm.textContent = `Delete this ${def.itemLabel}`; }, 4000); return; }
          plan[def.id] = plan[def.id].filter((x) => x.id !== it.id); persist(); paint();
        } }, `Delete this ${def.itemLabel}`);
        const titleEl = h('span', null, it[def.titleKey] || `New ${def.itemLabel}`);
        const card = h('details', { class: 'card entry', open: focusLast && i === plan[def.id].length - 1 || !it[def.titleKey] || null },
          h('summary', null, titleEl), def.fields.map((f) => {
            const node = fieldInput(f, it, `${def.id}-${i}`);
            if (f.key === def.titleKey) node.querySelector('input').addEventListener('input', (e) => { titleEl.textContent = e.target.value || `New ${def.itemLabel}`; });
            return node;
          }), rm);
        if (focusLast && i === plan[def.id].length - 1) setTimeout(() => card.querySelector('input,textarea')?.focus(), 50);
        return card;
      }));
      if (!plan[def.id].length) list.append(h('p', { class: 'muted' }, `No ${def.title.toLowerCase()} saved yet.`));
    };
    paint();
    body.append(list, addBtn);
  }

  return h('div', null,
    h('a', { class: 'back', href: '#/plan' }, icon('back'), 'My Plan'),
    h('h1', { tabindex: '-1', id: 'page-title' }, def.title),
    h('p', { class: 'muted' }, def.blurb),
    h('div', { class: 'notice small' }, 'Stored only on this device. Protect your phone with a passcode.'),
    body, status);
}
