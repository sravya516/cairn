// Backup, restore and erase screen.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getStore } from '../services/storage/index.js';
import { loadContent } from '../services/content.js';
import { buildBackup, validateBackup, restoreBackup, undoLastRestore, hasUndo, eraseAll, LAST_EXPORT_KEY, MAX_BYTES } from '../services/backup/backup.js';

const DAY = 86400000;

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function backupPage() {
  const store = await getStore();
  const content = await loadContent().catch(() => null);
  const appVersion = content ? content.meta.contentVersion : null;
  const msg = (id) => h('p', { id, class: 'small', role: 'status', 'aria-live': 'polite' });

  // ---- Export ----
  const lastExport = await store.get(LAST_EXPORT_KEY, null);
  const age = lastExport ? (Date.now() - Date.parse(lastExport)) / DAY : null;
  const exportMsg = msg('export-msg');
  const makeFile = async () => {
    const b = await buildBackup(store, { appVersion });
    const text = JSON.stringify(b, null, 2);
    await store.set(LAST_EXPORT_KEY, b.exportedAt);
    return { text, name: `cairn-backup-${b.exportedAt.slice(0, 10)}.json` };
  };
  const canShareFiles = typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });
  const exportCard = h('div', { class: 'card' },
    h('h2', null, 'Export a backup'),
    h('p', null, 'Saves your household plan, checklist progress, bookmarks and calculator settings to a file.'),
    h('p', { class: lastExport && age <= 90 ? 'muted small' : 'bad small' }, lastExport ? `Last exported ${new Date(lastExport).toLocaleDateString()}${age > 90 ? ' — over 90 days ago. Export again.' : '.'}` : 'You have never exported a backup.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn block', type: 'button', onclick: async () => {
        try { const f = await makeFile(); download(f.name, f.text); exportMsg.textContent = `Backup created: ${f.name}. On iPhone, look in the Downloads or share sheet, and save it to Files.`; } catch (e) { exportMsg.textContent = 'Could not create the backup: ' + e.message; }
      } }, icon('download'), 'Download backup file'),
      canShareFiles ? h('button', { class: 'btn secondary block', type: 'button', onclick: async () => {
        try { const f = await makeFile(); await navigator.share({ files: [new File([f.text], f.name, { type: 'application/json' })], title: 'Cairn backup' }); exportMsg.textContent = 'Shared.'; } catch (e) { if (e.name !== 'AbortError') exportMsg.textContent = 'Sharing failed: ' + e.message; }
      } }, 'Share or save to Files…') : null,
      h('button', { class: 'btn secondary block', type: 'button', onclick: async () => {
        try { const f = await makeFile(); await navigator.clipboard.writeText(f.text); exportMsg.textContent = 'Copied. Paste it into a note or message to yourself, and keep it private.'; } catch (e) { exportMsg.textContent = 'Could not copy automatically. Use the download button instead.'; }
      } }, 'Copy backup text')),
    exportMsg,
    h('p', { class: 'help' }, 'Backup files are not encrypted. They may contain medical and family details, so store them somewhere private.'));

  // ---- Import ----
  const importMsg = msg('import-msg');
  const preview = h('div');
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', id: 'bk-file' });
  const paste = h('textarea', { id: 'bk-paste', rows: 4, placeholder: 'Or paste backup text here', 'aria-label': 'Paste backup text' });
  let pendingText = null;

  async function check(text, ignoreChecksum = false) {
    pendingText = text;
    preview.replaceChildren();
    importMsg.textContent = 'Checking…';
    const v = await validateBackup(text, { ignoreChecksum });
    importMsg.textContent = '';
    if (!v.ok) {
      preview.append(h('div', { class: 'notice' }, h('strong', null, 'This backup cannot be restored. '), v.errors.join(' ')),
        v.checksumMismatch ? h('button', { class: 'btn secondary block', type: 'button', onclick: () => check(text, true) }, 'Inspect it anyway') : null);
      return;
    }
    const s = v.summary;
    let armed = false;
    const replaceBtn = h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
      if (!armed) { armed = true; replaceBtn.textContent = 'Tap again to replace everything on this device'; setTimeout(() => { armed = false; replaceBtn.textContent = 'Replace my current data'; }, 5000); return; }
      await doRestore(v, 'replace');
    } }, 'Replace my current data');
    preview.append(
      h('div', { class: 'card' }, h('h3', null, 'Backup looks valid'),
        h('p', { class: 'small' }, `Exported ${new Date(v.backup.exportedAt).toLocaleString()}`),
        h('ul', null, h('li', null, `${s.members} household members, ${s.contacts} contacts, ${s.pets} pets`), h('li', null, `${s.checklists} checklists with ${s.checkedItems} items checked and ${s.customItems} custom items`), h('li', null, `${s.bookmarks} bookmarked guides`)),
        v.warnings.length ? h('div', { class: 'notice small' }, v.warnings.map((w) => h('div', null, w))) : null,
        h('div', { class: 'stack' },
          h('button', { class: 'btn block', type: 'button', onclick: () => doRestore(v, 'merge') }, 'Merge with my current data'),
          replaceBtn),
        h('p', { class: 'help' }, 'Merge keeps everything you have and adds what is missing. Replace swaps your data for the backup. Either way Cairn first saves a snapshot so you can undo.')));
  }

  async function doRestore(v, mode) {
    try {
      const r = await restoreBackup(store, v, { mode, appVersion });
      preview.replaceChildren(h('div', { class: 'card' }, h('h3', null, 'Restore complete'), h('p', null, `${mode === 'merge' ? 'Merged' : 'Replaced'}: ${r.summary.members} members, ${r.summary.checklists} checklists, ${r.summary.bookmarks} bookmarks.`), h('a', { class: 'btn', href: '#/plan' }, 'Go to My Plan')));
      undoCard.hidden = false;
    } catch (e) { importMsg.textContent = 'Restore failed: ' + e.message; }
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { preview.replaceChildren(h('div', { class: 'notice' }, 'That file is larger than 5 MB, which is far bigger than any Cairn backup.')); return; }
    try { await check(await f.text()); } catch (e) { importMsg.textContent = 'Could not read that file.'; }
  });
  const checkPaste = h('button', { class: 'btn secondary block', type: 'button', onclick: () => { if (paste.value.trim()) check(paste.value); else importMsg.textContent = 'Paste backup text first.'; } }, 'Check pasted text');

  const importCard = h('div', { class: 'card' }, h('h2', null, 'Restore from a backup'),
    h('label', { for: 'bk-file' }, 'Choose a backup file'), fileInput,
    h('label', { for: 'bk-paste' }, 'Or paste text'), paste, checkPaste, importMsg, preview);

  // ---- Undo ----
  const undoMsg = msg('undo-msg');
  const undoCard = h('div', { class: 'card', hidden: !(await hasUndo(store)) }, h('h2', null, 'Undo last restore'),
    h('p', { class: 'small' }, 'Puts back the data you had just before the last restore.'),
    h('button', { class: 'btn secondary block', type: 'button', onclick: async () => {
      try { const s = await undoLastRestore(store); undoMsg.textContent = `Undone. Back to ${s.members} members and ${s.checklists} checklists.`; undoCard.querySelector('button').hidden = true; } catch (e) { undoMsg.textContent = e.message; }
    } }, 'Undo restore'), undoMsg);

  // ---- Erase ----
  const eraseMsg = msg('erase-msg');
  const confirm = h('input', { type: 'text', id: 'erase-confirm', autocomplete: 'off', placeholder: 'Type ERASE', 'aria-label': 'Type ERASE to confirm' });
  const eraseBtn = h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
    if (confirm.value.trim() !== 'ERASE') { eraseMsg.textContent = 'Type ERASE exactly to confirm.'; return; }
    await eraseAll(store); confirm.value = ''; undoCard.hidden = true;
    eraseMsg.textContent = 'All your plan data, checklist progress, bookmarks and calculator settings were erased from this device.';
  } }, 'Erase all my data');
  const eraseCard = h('div', { class: 'card' }, h('h2', null, 'Erase all data'),
    h('p', { class: 'small' }, 'Permanently deletes your household plan, checklist progress, bookmarks and saved calculator inputs from this device. Export a backup first. This cannot be undone.'),
    h('label', { for: 'erase-confirm' }, 'Type ERASE to confirm'), confirm, eraseBtn, eraseMsg);

  return h('div', null,
    h('a', { class: 'back', href: '#/plan' }, icon('back'), 'My Plan'),
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Backup and restore'),
    h('p', { class: 'muted' }, 'Your data lives only on this device. If you delete the app, clear Safari data, or lose or replace your phone, it is gone unless you have a backup.'),
    exportCard, importCard, undoCard, eraseCard);
}
