// Household emergency plan: data model, validation and completeness scoring.
// Everything is stored locally under the "household" key. Nothing here touches the network.
//
// The same sanitizer is used for typed input and for imported backups, so damaged or hostile data
// can never put an invalid shape into the store.

export const STORE_KEY = 'household';
export const MAX_ITEMS = 40;

const PHONE_RE = /^[0-9+()\-.\s#*xXextEXT]{0,30}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Field types: text, textarea, phone, email, age. Each validator returns { ok, value, error }. */
export const VALIDATORS = {
  text: (v, f) => limit(v, f.max || 120, f),
  textarea: (v, f) => limit(v, f.max || 1000, f),
  phone: (v, f) => {
    const s = String(v ?? '').trim();
    if (!s) return f.required ? { ok: false, error: 'Required.' } : { ok: true, value: '' };
    if (!PHONE_RE.test(s) || s.replace(/\D/g, '').length < 3) return { ok: false, error: 'Use digits, spaces and + ( ) - only, like 555-123-4567.' };
    return { ok: true, value: s };
  },
  email: (v, f) => {
    const s = String(v ?? '').trim();
    if (!s) return { ok: true, value: '' };
    return EMAIL_RE.test(s) ? { ok: true, value: s } : { ok: false, error: 'Enter a valid email address.' };
  },
  age: (v) => {
    const s = String(v ?? '').trim();
    if (!s) return { ok: true, value: '' };
    if (!/^\d{1,3}$/.test(s) || Number(s) > 120) return { ok: false, error: 'Age must be a whole number from 0 to 120.' };
    return { ok: true, value: String(Number(s)) };
  },
};

function limit(v, max, f) {
  const s = String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (f.required && !s) return { ok: false, error: 'Required.' };
  if (s.length > max) return { ok: false, error: `Keep this under ${max} characters.` };
  return { ok: true, value: s };
}

export const validateField = (field, value) => VALIDATORS[field.type](value, field);

// --- Schema -----------------------------------------------------------------------------------------
const L = (id, title, blurb, itemLabel, fields, titleKey = 'name') => ({ id, title, blurb, kind: 'list', itemLabel, fields, titleKey });
const S = (id, title, blurb, fields) => ({ id, title, blurb, kind: 'single', fields });

export const SECTIONS = [
  L('members', 'Household members', 'Everyone who lives in your home, with ages and health information responders may need.', 'person', [
    { key: 'name', label: 'Name', type: 'text', max: 80, required: true },
    { key: 'age', label: 'Age (years)', type: 'age' },
    { key: 'medical', label: 'Medical considerations', type: 'textarea', max: 600, help: 'Conditions, equipment (oxygen, CPAP), mobility or communication needs.' },
    { key: 'allergies', label: 'Allergies', type: 'textarea', max: 400 },
    { key: 'medications', label: 'Important medications', type: 'textarea', max: 600, help: 'Names and what they are for. Keep doses on the pharmacy label or your clinician’s list.' },
    { key: 'notes', label: 'Other notes', type: 'textarea', max: 400 },
  ]),
  L('contacts', 'Emergency contacts', 'Family, neighbors, doctors, and others to call.', 'contact', [
    { key: 'name', label: 'Name', type: 'text', max: 80, required: true },
    { key: 'relationship', label: 'Relationship or role', type: 'text', max: 60 },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'notes', label: 'Notes', type: 'textarea', max: 300 },
  ]),
  S('outOfArea', 'Out-of-area contact', 'One person outside your region that everyone checks in with.', [
    { key: 'name', label: 'Name', type: 'text', max: 80 },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'notes', label: 'Notes', type: 'textarea', max: 300 },
  ]),
  S('meeting', 'Meeting locations', 'Where to reunite if you are separated.', [
    { key: 'near', label: 'Right outside the home', type: 'text', max: 200, help: 'A fixed point, like the mailbox across the street.' },
    { key: 'neighborhood', label: 'Outside the neighborhood', type: 'text', max: 200 },
    { key: 'outOfTown', label: 'Out of town', type: 'text', max: 200 },
    { key: 'notes', label: 'Details and how long to wait', type: 'textarea', max: 400 },
  ]),
  S('evacuation', 'Evacuation destination', 'Where you will go if told to leave.', [
    { key: 'destination', label: 'Primary destination', type: 'text', max: 200 },
    { key: 'address', label: 'Address', type: 'text', max: 250 },
    { key: 'route', label: 'Primary route', type: 'textarea', max: 500 },
    { key: 'backup', label: 'Backup destination and route', type: 'textarea', max: 500 },
  ]),
  L('pets', 'Pets', 'Pets and the details a shelter or vet would need.', 'pet', [
    { key: 'name', label: 'Name', type: 'text', max: 60, required: true },
    { key: 'type', label: 'Type and breed', type: 'text', max: 80 },
    { key: 'notes', label: 'Vet, microchip number, medications, needs', type: 'textarea', max: 500 },
  ]),
  L('addresses', 'Important addresses', 'Work, school, doctor, pharmacy, relatives, shelter.', 'address', [
    { key: 'name', label: 'Label', type: 'text', max: 80, required: true },
    { key: 'address', label: 'Address', type: 'text', max: 250 },
    { key: 'phone', label: 'Phone', type: 'phone' },
  ]),
  L('vehicles', 'Vehicles', 'Details for each vehicle you may evacuate in.', 'vehicle', [
    { key: 'name', label: 'Description', type: 'text', max: 80, required: true, help: 'For example: 2018 blue Honda Civic.' },
    { key: 'plate', label: 'License plate', type: 'text', max: 20 },
    { key: 'notes', label: 'Fuel type, insurance contact, notes', type: 'textarea', max: 300 },
  ]),
  S('notes', 'Emergency notes', 'Anything else: utility shutoff locations, alarm codes, special instructions.', [
    { key: 'text', label: 'Notes', type: 'textarea', max: 4000, help: 'Do not store passwords or banking details here.' },
  ]),
];
export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

// --- Model ----------------------------------------------------------------------------------------------
export function emptyPlan() {
  const plan = { version: 1, updated: null };
  for (const s of SECTIONS) {
    if (s.kind === 'list') plan[s.id] = [];
    else plan[s.id] = Object.fromEntries(s.fields.map((f) => [f.key, '']));
  }
  return plan;
}

let idCounter = 0;
export const newId = () => `${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Coerces anything into a valid plan. Unknown keys are dropped, over-long text is trimmed, bad values become empty.
 * Returns { plan, dropped } where dropped counts values that had to be discarded (for import warnings).
 */
export function sanitizePlan(raw) {
  const plan = emptyPlan();
  let dropped = 0;
  const src = raw && typeof raw === 'object' ? raw : {};
  const clean = (field, v) => {
    if (typeof v !== 'string' && typeof v !== 'number') { if (v != null && v !== '') dropped++; return ''; }
    const r = validateField({ ...field, required: false }, v);
    if (r.ok) return r.value;
    // Keep text that is merely too long (trimmed); drop values that are the wrong kind (bad phone, bad email, bad age).
    if (field.type === 'text' || field.type === 'textarea') { dropped++; return String(v).trim().slice(0, field.max || 1000); }
    dropped++; return '';
  };
  for (const s of SECTIONS) {
    if (s.kind === 'single') {
      const o = src[s.id] && typeof src[s.id] === 'object' && !Array.isArray(src[s.id]) ? src[s.id] : {};
      for (const f of s.fields) plan[s.id][f.key] = clean(f, o[f.key]);
    } else {
      const arr = Array.isArray(src[s.id]) ? src[s.id].slice(0, MAX_ITEMS) : [];
      if (Array.isArray(src[s.id]) && src[s.id].length > MAX_ITEMS) dropped += src[s.id].length - MAX_ITEMS;
      for (const it of arr) {
        if (!it || typeof it !== 'object') { dropped++; continue; }
        const item = { id: typeof it.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(it.id) ? it.id : newId() };
        for (const f of s.fields) item[f.key] = clean(f, it[f.key]);
        if (!item[s.titleKey]) { if (Object.values(item).some((x) => x && x !== item.id)) item[s.titleKey] = '(unnamed)'; else { dropped++; continue; } }
        plan[s.id].push(item);
      }
    }
  }
  plan.updated = typeof src.updated === 'string' && !Number.isNaN(Date.parse(src.updated)) ? src.updated : null;
  return { plan, dropped };
}

export const isValidPlan = (p) => !!p && typeof p === 'object' && SECTIONS.every((s) => (s.kind === 'list' ? Array.isArray(p[s.id]) : p[s.id] && typeof p[s.id] === 'object'));

export async function loadPlan(store) {
  const stored = await store.get(STORE_KEY, null);
  if (stored == null) return emptyPlan();
  return sanitizePlan(stored).plan; // heals older or damaged data instead of failing
}
export async function savePlan(store, plan) {
  const next = { ...plan, updated: new Date().toISOString() };
  await store.set(STORE_KEY, next);
  return next;
}

// --- Completeness ----------------------------------------------------------------------------------------
export function completeness(plan) {
  const filled = (o) => Object.values(o).some((v) => String(v).trim());
  const checks = [
    ['Add household members', plan.members.length > 0],
    ['Add at least one emergency contact with a phone number', plan.contacts.some((c) => c.phone)],
    ['Choose an out-of-area contact', !!(plan.outOfArea.name && plan.outOfArea.phone)],
    ['Set meeting locations (home and neighborhood)', !!(plan.meeting.near && plan.meeting.neighborhood)],
    ['Choose an evacuation destination', !!plan.evacuation.destination],
    ['Record health information for household members', plan.members.some((m) => m.medical || m.allergies || m.medications)],
    ['Add important addresses', plan.addresses.length > 0],
    ['Add vehicle and pet details if you have them', plan.vehicles.length > 0 || plan.pets.length > 0],
    ['Write emergency notes (utility shutoffs, special needs)', filled(plan.notes)],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { done, total: checks.length, pct: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([t]) => t) };
}

export function sectionCount(plan, section) {
  if (section.kind === 'list') return plan[section.id].length;
  return Object.values(plan[section.id]).some((v) => String(v).trim()) ? 1 : 0;
}

// --- Merge (used when importing a backup in "merge" mode) -----------------------------------------------
export function mergePlans(current, incoming) {
  const out = structuredClone(current);
  for (const s of SECTIONS) {
    if (s.kind === 'list') {
      const have = new Set(out[s.id].map((x) => x.id));
      for (const it of incoming[s.id]) if (!have.has(it.id) && out[s.id].length < MAX_ITEMS) out[s.id].push(it);
    } else {
      for (const f of s.fields) if (!String(out[s.id][f.key]).trim() && String(incoming[s.id][f.key]).trim()) out[s.id][f.key] = incoming[s.id][f.key];
    }
  }
  return out;
}
