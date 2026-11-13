// Checklist list and detail screens. Every change is saved to the device immediately.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { loadContent } from '../services/content.js';
import { getStore } from '../services/storage/index.js';
import {
  loadState, saveState, loadAllStates, itemsWithState, progress, overallProgress, setDone, setNote,
  addCustom, removeCustom, resetChecks, makeCustomItem, PREPAREDNESS_GROUPS, LIMITS,
} from '../services/checklists.js';

export function progressBar(pct, label) {
  return h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': label || 'Progress' },
    h('span', { style: `width:${pct}%` }));
}

export async function checklistsHome() {
  const c = await loadContent();
  const store = await getStore();
  const states = await loadAllStates(store, c.checklists);
  const overall = overallProgress(c.checklists, states, { groups: PREPAREDNESS_GROUPS });
  const groups = [...new Set(c.checklists.map((x) => x.group))];

  return h('div', null,
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Checklists'),
    h('div', { class: 'card' },
      h('h2', null, 'Preparedness progress'),
      h('p', { class: 'muted small' }, 'Kits, go-bags and supplies combined.'),
      progressBar(overall.pct, 'Overall preparedness'),
      h('p', null, h('strong', null, `${overall.pct}%`), ` · ${overall.done} of ${overall.total} items · ${overall.criticalDone} of ${overall.criticalTotal} critical items`)),
    ...groups.flatMap((g) => [
      h('div', { class: 'section-title' }, h('h2', null, g)),
      ...c.checklists.filter((x) => x.group === g).map((cl) => {
        const p = progress(cl, states[cl.id]);
        return h('a', { class: 'card checklist-row', href: `#/checklist/${cl.id}` },
          h('span', { class: 'row-top' }, h('strong', null, cl.title), h('span', { class: 'muted small' }, `${p.done}/${p.total}`)),
          progressBar(p.pct, cl.title));
      }),
    ]));
}

export async function checklistPage({ id }) {
  const c = await loadContent();
  const cl = c.checklistById.get(id);
  if (!cl) return h('div', null, h('h1', { tabindex: '-1', id: 'page-title' }, 'Checklist not found'), h('a', { class: 'btn', href: '#/checklists' }, 'All checklists'));
  const store = await getStore();
  let state = await loadState(store, id);
  let hideDone = false;

  // Saves are queued so quick taps can never overwrite each other out of order.
  let chain = Promise.resolve();
  const persist = () => { const snapshot = state; chain = chain.then(() => saveState(store, id, snapshot)).catch(() => { saveStatus.textContent = 'Could not save. Storage may be full or blocked.'; }); };
  const saveStatus = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' }, 'Progress saves automatically on this device.');

  const barHolder = h('div');
  const list = h('ul', { class: 'items' });
  const form = h('form', { class: 'card add-form', novalidate: true });
  const formMsg = h('p', { class: 'error small', role: 'alert' });

  const paintProgress = () => {
    const p = progress(cl, state);
    barHolder.replaceChildren(
      progressBar(p.pct, `${cl.title} progress`),
      h('p', null, h('strong', null, `${p.pct}%`), ` · ${p.done} of ${p.total} done`, p.criticalTotal ? ` · critical ${p.criticalDone}/${p.criticalTotal}` : ''));
  };

  const paintList = () => {
    const items = itemsWithState(cl, state).filter((i) => !(hideDone && i.done));
    list.replaceChildren(...items.map((it) => itemRow(it)));
    if (!items.length) list.append(h('li', { class: 'muted' }, 'Everything here is done. Nice work.'));
  };

  function itemRow(it) {
    const cb = h('input', { type: 'checkbox', id: 'cb-' + it.key, checked: it.done || null, 'aria-describedby': 'd-' + it.key });
    cb.checked = it.done;
    cb.addEventListener('change', () => { state = setDone(state, it, cb.checked); persist(); paintProgress(); if (hideDone) paintList(); else row.classList.toggle('done', cb.checked); });
    const note = h('textarea', { rows: 2, maxlength: LIMITS.note, placeholder: 'Personal note (stays on this device)', 'aria-label': `Note for ${it.name}` });
    note.value = it.note;
    let t = null;
    note.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state = setNote(state, it, note.value); persist(); }, 300); });
    note.addEventListener('blur', () => { clearTimeout(t); state = setNote(state, it, note.value); persist(); });

    const row = h('li', { class: 'item' + (it.done ? ' done' : '') },
      h('label', { class: 'item-main', for: 'cb-' + it.key }, cb,
        h('span', { class: 'item-text' },
          h('strong', null, it.name),
          h('span', { id: 'd-' + it.key, class: 'muted small' }, it.desc),
          h('span', { class: 'meta' },
            it.qty ? h('span', { class: 'qty' }, it.qty) : null,
            h('span', { class: 'tag ' + it.priority }, it.priority === 'normal' ? 'Optional' : it.priority === 'high' ? 'Important' : 'Critical')))),
      h('details', { class: 'item-note' }, h('summary', null, it.note ? 'Edit note' : 'Add note'), note,
        it.custom ? h('button', { type: 'button', class: 'btn secondary small-btn', onclick: () => { state = removeCustom(state, it.id); persist(); paintProgress(); paintList(); } }, 'Delete this item') : null));
    return row;
  }

  // Add custom item
  const f = {
    name: h('input', { type: 'text', maxlength: LIMITS.name, id: 'cn', placeholder: 'e.g. Spare glasses' }),
    qty: h('input', { type: 'text', maxlength: LIMITS.qty, id: 'cq', placeholder: 'e.g. 2 pairs' }),
    desc: h('input', { type: 'text', maxlength: LIMITS.desc, id: 'cd', placeholder: 'Optional description' }),
    pri: h('select', { id: 'cp' }, h('option', { value: 'normal' }, 'Optional'), h('option', { value: 'high' }, 'Important'), h('option', { value: 'critical' }, 'Critical')),
  };
  form.append(h('h2', null, 'Add your own item'),
    h('label', { for: 'cn' }, 'Item name'), f.name, h('label', { for: 'cq' }, 'Quantity'), f.qty,
    h('label', { for: 'cd' }, 'Description'), f.desc, h('label', { for: 'cp' }, 'Priority'), f.pri,
    formMsg, h('button', { class: 'btn block', type: 'submit' }, icon('check'), 'Add item'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = makeCustomItem({ name: f.name.value, desc: f.desc.value, qty: f.qty.value, priority: f.pri.value });
    if (!r.ok) { formMsg.textContent = r.error; return; }
    if (state.custom.length >= LIMITS.custom) { formMsg.textContent = `You can add up to ${LIMITS.custom} custom items per list.`; return; }
    formMsg.textContent = '';
    state = addCustom(state, r.item); persist();
    f.name.value = f.qty.value = f.desc.value = ''; f.pri.value = 'normal';
    paintProgress(); paintList();
  });

  const hideBtn = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => { hideDone = !hideDone; hideBtn.setAttribute('aria-pressed', String(hideDone)); hideBtn.classList.toggle('on', hideDone); paintList(); } }, 'Hide completed');
  let armed = false;
  const resetBtn = h('button', { type: 'button', class: 'chip', onclick: () => {
    if (!armed) { armed = true; resetBtn.textContent = 'Tap again to uncheck all'; setTimeout(() => { armed = false; resetBtn.textContent = 'Uncheck all'; }, 4000); return; }
    armed = false; resetBtn.textContent = 'Uncheck all'; state = resetChecks(state); persist(); paintProgress(); paintList();
  } }, 'Uncheck all');

  paintProgress(); paintList();
  return h('div', { class: 'checklist' },
    h('a', { class: 'back', href: '#/checklists' }, icon('back'), 'All checklists'),
    h('h1', { tabindex: '-1', id: 'page-title' }, cl.title),
    h('p', { class: 'muted' }, cl.description),
    h('div', { class: 'card' }, barHolder, h('div', { class: 'chips' }, hideBtn, resetBtn), saveStatus),
    list, form);
}
