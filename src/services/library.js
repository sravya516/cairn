// Bookmarks and recently viewed guides, stored locally (IndexedDB via Store).
const MAX_RECENTS = 12;
const isIdList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

export async function getBookmarks(store) { return store.getValid('bookmarks', isIdList, []); }
export async function isBookmarked(store, id) { return (await getBookmarks(store)).includes(id); }

/** Toggles a bookmark; returns the new state (true = bookmarked). */
export async function toggleBookmark(store, id) {
  const list = await getBookmarks(store);
  const has = list.includes(id);
  await store.set('bookmarks', has ? list.filter((x) => x !== id) : [id, ...list]);
  return !has;
}

export async function getRecents(store) { return store.getValid('recents', isIdList, []); }

export async function addRecent(store, id, max = MAX_RECENTS) {
  const list = (await getRecents(store)).filter((x) => x !== id);
  list.unshift(id);
  await store.set('recents', list.slice(0, max));
}

/** Drops ids that no longer exist in the content (e.g. after an update removed a guide). */
export function resolveGuides(ids, guideById) { return ids.map((id) => guideById.get(id)).filter(Boolean); }
