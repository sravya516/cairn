// Checklist state: which items are done, personal notes and custom items.
// Pure reducers + validation (unit-testable) and thin load/save helpers over the Store.
// Item identity is a slug of its name, so reordering or editing a checklist never loses progress.

export const PRIORITIES = ['critical', 'high', 'normal'];
export const LIMITS = { name: 100, desc: 200, qty: 40, note: 500, custom: 60 };

export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export const emptyState = () => ({ checked: {}, notes: {}, custom: [] });

/** Predefined items of a checklist as objects. Items are [name, description, quantity, priority]. */
export function baseItems(checklist) {
  return checklist.items.map(([name, desc, qty, priority]) => ({
    key: slug(name), name, desc: desc || '', qty: qty || '', priority: PRIORITIES.includes(priority) ? priority : 'normal', custom: false,
  }));
}

/** All items (predefined + custom) with their current done flag and note. */
export function itemsWithState(checklist, state) {
  const base = baseItems(checklist).map((it) => ({ ...it, done: !!state.checked[it.key], note: state.notes[it.key] || '' }));
  const custom = state.custom.map((c) => ({ key: 'c:' + c.id, name: c.name, desc: c.desc || '', qty: c.qty || '', priority: c.priority, custom: true, id: c.id, done: !!c.done, note: c.note || '' }));
  return [...base, ...custom];
}

export function isValidState(s) {
  if (!s || typeof s !== 'object') return false;
  if (!s.checked || typeof s.checked !== 'object' || Array.isArray(s.checked)) return false;
  if (!s.notes || typeof s.notes !== 'object' || Array.isArray(s.notes)) return false;
  if (!Array.isArray(s.custom) || s.custom.length > LIMITS.custom) return false;
  for (const v of Object.values(s.checked)) if (typeof v !== 'boolean') return false;
  for (const v of Object.values(s.notes)) if (typeof v !== 'string' || v.length > LIMITS.note * 2) return false;
  for (const c of s.custom) {
    if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !c.name || c.name.length > LIMITS.name * 2) return false;
    if (!PRIORITIES.includes(c.priority)) return false;
  }
  return true;
}

/** Validates and cleans a new custom item. Returns { ok, item } or { ok:false, error }. */
export function makeCustomItem({ name, desc = '', qty = '', priority = 'normal' }, idFn = () => Math.random().toString(36).slice(2, 10)) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, error: 'Enter a name for the item.' };
  if (n.length > LIMITS.name) return { ok: false, error: `Name must be ${LIMITS.name} characters or fewer.` };
  if (String(desc).length > LIMITS.desc) return { ok: false, error: `Description must be ${LIMITS.desc} characters or fewer.` };
  if (String(qty).length > LIMITS.qty) return { ok: false, error: `Quantity must be ${LIMITS.qty} characters or fewer.` };
  if (!PRIORITIES.includes(priority)) return { ok: false, error: 'Choose a priority.' };
  return { ok: true, item: { id: idFn(), name: n, desc: String(desc).trim(), qty: String(qty).trim(), priority, done: false, note: '' } };
}

// --- Reducers: return a new state, never mutate -------------------------------------------------
export function setDone(state, item, done) {
  if (item.custom) return { ...state, custom: state.custom.map((c) => (c.id === item.id ? { ...c, done } : c)) };
  const checked = { ...state.checked };
  if (done) checked[item.key] = true; else delete checked[item.key];
  return { ...state, checked };
}
export function setNote(state, item, text) {
  const note = String(text).slice(0, LIMITS.note);
  if (item.custom) return { ...state, custom: state.custom.map((c) => (c.id === item.id ? { ...c, note } : c)) };
  const notes = { ...state.notes };
  if (note) notes[item.key] = note; else delete notes[item.key];
  return { ...state, notes };
}
export function addCustom(state, item) {
  if (state.custom.length >= LIMITS.custom) return state;
  return { ...state, custom: [...state.custom, item] };
}
export const removeCustom = (state, id) => ({ ...state, custom: state.custom.filter((c) => c.id !== id) });
/** Un-checks everything but keeps notes and custom items. */
export const resetChecks = (state) => ({ ...state, checked: {}, custom: state.custom.map((c) => ({ ...c, done: false })) });

// --- Progress ---------------------------------------------------------------------------------------
export function progress(checklist, state) {
  const items = itemsWithState(checklist, state);
  const done = items.filter((i) => i.done).length;
  const crit = items.filter((i) => i.priority === 'critical');
  return {
    done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0,
    criticalDone: crit.filter((i) => i.done).length, criticalTotal: crit.length,
  };
}

/** Combined progress over several checklists (optionally only certain groups). */
export function overallProgress(checklists, states, { groups = null } = {}) {
  let done = 0, total = 0, criticalDone = 0, criticalTotal = 0;
  for (const c of checklists) {
    if (groups && !groups.includes(c.group)) continue;
    const p = progress(c, states[c.id] || emptyState());
    done += p.done; total += p.total; criticalDone += p.criticalDone; criticalTotal += p.criticalTotal;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, criticalDone, criticalTotal };
}

export const PREPAREDNESS_GROUPS = ['Kits & bags', 'Supplies'];

// --- Persistence ----------------------------------------------------------------------------------------
export const stateKey = (id) => `checklist:${id}`;
export async function loadState(store, id) { return store.getValid(stateKey(id), isValidState, emptyState()); }
export async function saveState(store, id, state) { await store.set(stateKey(id), state); return state; }
export async function loadAllStates(store, checklists) {
  const out = {};
  for (const c of checklists) out[c.id] = await loadState(store, c.id);
  return out;
}

/** The first `n` unchecked critical items across preparedness checklists, in list order. */
export function nextSteps(checklists, states, n = 3, { groups = PREPAREDNESS_GROUPS } = {}) {
  const out = [];
  for (const c of checklists) {
    if (groups && !groups.includes(c.group)) continue;
    for (const it of itemsWithState(c, states[c.id] || emptyState())) {
      if (it.priority === 'critical' && !it.done) out.push({ checklistId: c.id, checklistTitle: c.title, name: it.name });
      if (out.length >= n) return out;
    }
  }
  return out;
}
