// Backup, restore and erase. Pure logic over the Store, so it is fully unit-testable.
//
// File format (JSON):
//   { app: "Cairn", format: 1, exportedAt, appVersion, checksum, data: { household, checklists, bookmarks, recents, calculators } }
// The checksum is a SHA-256 of the canonicalised `data`. It detects accidental corruption and hand edits;
// it is not a security feature, and backup files are NOT encrypted. Treat them as sensitive.

import { sanitizePlan, mergePlans, emptyPlan, STORE_KEY as HOUSEHOLD_KEY } from '../plan.js';
import { isValidState, emptyState, stateKey } from '../checklists.js';

export const FORMAT = 1;
export const APP = 'Cairn';
export const MAX_BYTES = 5 * 1024 * 1024;
export const SAFETY_KEY = 'backup:before-last-restore';
export const LAST_EXPORT_KEY = 'meta:lastExport';
const MAX_IDS = 200;

/** Keys whose values are user data and belong in a backup (and in "erase all"). */
const isManaged = (k) => k === HOUSEHOLD_KEY || k === 'bookmarks' || k === 'recents' || k.startsWith('checklist:') || k.startsWith('calc:');

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

export async function checksumOf(data, cryptoImpl = globalThis.crypto) {
  const buf = new TextEncoder().encode(canonical(data));
  const digest = await cryptoImpl.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function collectData(store) {
  const data = { household: emptyPlan(), checklists: {}, bookmarks: [], recents: [], calculators: {} };
  const household = await store.get(HOUSEHOLD_KEY, null);
  if (household) data.household = sanitizePlan(household).plan;
  for (const k of await store.keys('checklist:')) {
    const s = await store.get(k);
    if (isValidState(s)) data.checklists[k.slice('checklist:'.length)] = s;
  }
  for (const k of await store.keys('calc:')) {
    const s = await store.get(k);
    if (s && typeof s === 'object') data.calculators[k.slice('calc:'.length)] = s;
  }
  const idList = (v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.slice(0, MAX_IDS) : []);
  data.bookmarks = idList(await store.get('bookmarks', []));
  data.recents = idList(await store.get('recents', []));
  return data;
}

export async function buildBackup(store, { appVersion = null, now = new Date() } = {}) {
  const data = await collectData(store);
  return { app: APP, format: FORMAT, exportedAt: now.toISOString(), appVersion, checksum: await checksumOf(data), data };
}

export function describe(data) {
  const checklists = Object.values(data.checklists);
  return {
    members: data.household.members.length, contacts: data.household.contacts.length, pets: data.household.pets.length,
    checklists: checklists.length,
    checkedItems: checklists.reduce((n, s) => n + Object.keys(s.checked).length + s.custom.filter((c) => c.done).length, 0),
    customItems: checklists.reduce((n, s) => n + s.custom.length, 0),
    bookmarks: data.bookmarks.length,
  };
}

/**
 * Parses and validates backup text (or an object). Never throws.
 * Returns { ok, errors[], warnings[], backup?, data?, summary? }. `data` is sanitised and safe to restore.
 */
export async function validateBackup(input, { cryptoImpl = globalThis.crypto, ignoreChecksum = false } = {}) {
  const errors = [], warnings = [];
  let obj = input;
  if (typeof input === 'string') {
    if (input.length > MAX_BYTES) return { ok: false, errors: ['That file is larger than 5 MB, which is far bigger than any Cairn backup. It was not read.'], warnings };
    try { obj = JSON.parse(input); } catch (_) { return { ok: false, errors: ['This is not a valid backup file. It could not be read as JSON (it may be cut off or damaged).'], warnings }; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['This file is not a Cairn backup.'], warnings };
  if (obj.app !== APP) return { ok: false, errors: ['This file was not created by Cairn.'], warnings };
  if (!Number.isInteger(obj.format) || obj.format < 1) return { ok: false, errors: ['The backup format version is missing or invalid.'], warnings };
  if (obj.format > FORMAT) return { ok: false, errors: [`This backup was made by a newer version of Cairn (format ${obj.format}). Update the app and try again.`], warnings };
  if (!obj.data || typeof obj.data !== 'object') return { ok: false, errors: ['The backup contains no data.'], warnings };

  if (obj.checksum) {
    let actual = null;
    try { actual = await checksumOf(obj.data, cryptoImpl); } catch (_) { warnings.push('Could not verify the checksum in this browser.'); }
    if (actual && actual !== obj.checksum) {
      if (ignoreChecksum) warnings.push('The checksum does not match: the file was edited or damaged. Restoring anyway as you chose.');
      else return { ok: false, errors: ['The checksum does not match. The file was edited or damaged after it was exported.'], warnings, checksumMismatch: true };
    }
  } else warnings.push('This backup has no checksum, so corruption cannot be ruled out.');

  const raw = obj.data;
  const { plan, dropped } = sanitizePlan(raw.household);
  if (dropped) warnings.push(`${dropped} household value${dropped === 1 ? ' was' : 's were'} invalid and ${dropped === 1 ? 'was' : 'were'} trimmed or skipped.`);

  const checklists = {};
  for (const [id, s] of Object.entries(raw.checklists && typeof raw.checklists === 'object' ? raw.checklists : {})) {
    if (!/^[a-z0-9-]{1,60}$/.test(id)) { warnings.push(`Skipped a checklist with an invalid id.`); continue; }
    if (isValidState(s)) checklists[id] = s; else warnings.push(`Skipped damaged checklist "${id}".`);
  }
  const idList = (v, name) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && x.length < 100)) { warnings.push(`Skipped invalid ${name}.`); return []; }
    return v.slice(0, MAX_IDS);
  };
  const calculators = {};
  for (const [id, s] of Object.entries(raw.calculators && typeof raw.calculators === 'object' ? raw.calculators : {})) {
    if (/^[a-z0-9-]{1,30}$/.test(id) && s && typeof s === 'object' && JSON.stringify(s).length < 20000) calculators[id] = s;
  }
  const data = { household: plan, checklists, bookmarks: idList(raw.bookmarks, 'bookmarks'), recents: idList(raw.recents, 'recent guides'), calculators };
  return { ok: true, errors, warnings, backup: obj, data, summary: describe(data) };
}

async function writeAll(store, data) {
  await store.set(HOUSEHOLD_KEY, data.household);
  for (const [id, s] of Object.entries(data.checklists)) await store.set(stateKey(id), s);
  for (const [id, s] of Object.entries(data.calculators)) await store.set(`calc:${id}`, s);
  await store.set('bookmarks', data.bookmarks);
  await store.set('recents', data.recents);
}

export async function clearManaged(store) {
  for (const k of await store.keys()) if (isManaged(k)) await store.delete(k);
}

export function mergeData(current, incoming) {
  const checklists = { ...current.checklists };
  for (const [id, inc] of Object.entries(incoming.checklists)) {
    const cur = checklists[id];
    if (!cur) { checklists[id] = inc; continue; }
    const custom = [...cur.custom];
    const have = new Set(custom.map((c) => c.id));
    for (const c of inc.custom) if (!have.has(c.id)) custom.push(c);
    checklists[id] = { checked: { ...inc.checked, ...cur.checked }, notes: { ...inc.notes, ...cur.notes }, custom: custom.slice(0, 60) };
  }
  const uniq = (a, b, n) => [...new Set([...a, ...b])].slice(0, n);
  return {
    household: mergePlans(current.household, incoming.household),
    checklists,
    bookmarks: uniq(current.bookmarks, incoming.bookmarks, MAX_IDS),
    recents: uniq(current.recents, incoming.recents, 12),
    calculators: { ...incoming.calculators, ...current.calculators },
  };
}

/**
 * Restores validated data. Always saves a safety snapshot first so the restore can be undone.
 * mode: "replace" (default) discards current user data; "merge" combines both, keeping what you already have.
 */
export async function restoreBackup(store, validated, { mode = 'replace', appVersion = null } = {}) {
  if (!validated || !validated.ok) throw new Error('Cannot restore an invalid backup.');
  const snapshot = await buildBackup(store, { appVersion });
  await store.set(SAFETY_KEY, snapshot);
  const incoming = validated.data;
  const next = mode === 'merge' ? mergeData(await collectData(store), incoming) : incoming;
  if (mode === 'replace') await clearManaged(store);
  await writeAll(store, next);
  return { mode, summary: describe(next) };
}

export async function hasUndo(store) { return !!(await store.get(SAFETY_KEY, null)); }

/** Puts back the data from just before the last restore. */
export async function undoLastRestore(store) {
  const snap = await store.get(SAFETY_KEY, null);
  if (!snap) throw new Error('There is nothing to undo.');
  const v = await validateBackup(snap);
  if (!v.ok) throw new Error('The saved snapshot is damaged: ' + v.errors[0]);
  await clearManaged(store);
  await writeAll(store, v.data);
  await store.delete(SAFETY_KEY);
  return describe(v.data);
}

/** Deletes all user data on this device (plan, checklist progress, bookmarks, calculator inputs). */
export async function eraseAll(store) {
  await clearManaged(store);
  await store.delete(SAFETY_KEY);
  await store.delete(LAST_EXPORT_KEY);
}

export const emptyChecklistState = emptyState;
