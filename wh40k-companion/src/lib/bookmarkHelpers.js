export const MAX_BOOKMARKS = 30;

/**
 * Add a new bookmark, deduplicating by CFI (newest at front). Caps at MAX_BOOKMARKS.
 * @param {Array} existing - current bookmark array
 * @param {{ cfi: string, label: string, pct: number, page?: number|null, createdAt: string }} bm
 * @returns {Array} new bookmark array
 */
export function addBookmark(existing, bm) {
  if (!bm?.cfi) return existing;
  const deduped = existing.filter(b => b.cfi !== bm.cfi);
  return [bm, ...deduped].slice(0, MAX_BOOKMARKS);
}

/**
 * Remove a bookmark by CFI.
 * @param {Array} existing
 * @param {string} cfi
 * @returns {Array}
 */
export function removeBookmark(existing, cfi) {
  return existing.filter(b => b.cfi !== cfi);
}

/**
 * Merge local bookmarks with DB bookmarks, respecting pending deletions.
 * DB bookmarks come first (source of truth); local-only entries are appended.
 * Any CFI in pendingDels is excluded from both sources.
 * @param {Array} local - locally stored bookmarks
 * @param {Array} dbBms - bookmarks loaded from DB
 * @param {string[]} pendingDels - CFIs pending deletion (may not have hit DB yet)
 * @returns {Array}
 */
export function mergeBookmarks(local, dbBms, pendingDels = []) {
  const deletedSet = new Set(pendingDels);
  const filtered = dbBms.filter(b => !deletedSet.has(b.cfi));
  const dbCfis = new Set(filtered.map(b => b.cfi));
  const localOnly = local.filter(b => !dbCfis.has(b.cfi) && !deletedSet.has(b.cfi));
  return [...filtered, ...localOnly].slice(0, MAX_BOOKMARKS);
}

/**
 * Human-readable page label for a bookmark.
 * Priority: exact page number → estimated from % → raw % → "–"
 * @param {{ page?: number|null, pct?: number }} bm
 * @param {{ total?: number }|null} pageDisplay  - current book page info (optional)
 * @returns {string}
 */
export function bookmarkPageLabel(bm, pageDisplay = null) {
  if (bm.page) return `Pag. ${bm.page}`;
  if (pageDisplay?.total && bm.pct > 0)
    return `Pag. ~${Math.max(1, Math.round(bm.pct / 100 * pageDisplay.total))}`;
  if (bm.pct > 0) return `${bm.pct}%`;
  return '–';
}
