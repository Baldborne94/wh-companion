export const MAX_BOOKMARKS = 30;

export function addBookmark(existing, bm) {
  if (!bm?.cfi) return existing;
  const deduped = existing.filter(b => b.cfi !== bm.cfi);
  return [bm, ...deduped].slice(0, MAX_BOOKMARKS);
}

export function removeBookmark(existing, cfi) {
  return existing.filter(b => b.cfi !== cfi);
}

export function mergeBookmarks(local, dbBms, pendingDels = []) {
  const deletedSet = new Set(pendingDels);
  const filtered = dbBms.filter(b => !deletedSet.has(b.cfi));
  const dbCfis = new Set(filtered.map(b => b.cfi));
  const localOnly = local.filter(b => !dbCfis.has(b.cfi) && !deletedSet.has(b.cfi));
  return [...filtered, ...localOnly].slice(0, MAX_BOOKMARKS);
}

export function bookmarkPageLabel(bm) {
  if (bm?.pct > 0) return `${bm.pct}%`;
  return '–';
}
