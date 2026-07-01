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

// ─── Cross-device sync (DB is the source of truth) ─────────────────────────────
// The old union merge resurrected bookmarks: a bookmark deleted on one device but
// still cached locally on another would reappear (and get re-pushed to the DB) on
// the other device's next open, so deletions never stuck. reconcileSynced treats
// the DB as authoritative so add/remove on ANY device converges everywhere:
//   - DB rows win (minus pendingDels, which are local deletes whose DB delete may
//     not have landed yet — offline — and get retried by the caller).
//   - The ONLY local-only rows kept are pendingAdds (added here, DB insert may not
//     have landed yet). Any other local-only row is one the DB no longer has
//     because another device deleted it, so it is dropped instead of resurrected.
// Works for any CFI-keyed synced list (bookmarks AND highlights).
export function reconcileSynced(local, dbItems, { pendingAdds = [], pendingDels = [], max = MAX_BOOKMARKS } = {}) {
  const delSet = new Set(pendingDels);
  const addSet = new Set(pendingAdds);
  const db = (dbItems || []).filter(b => b?.cfi && !delSet.has(b.cfi));
  const dbCfis = new Set(db.map(b => b.cfi));
  const localAdds = (local || []).filter(
    b => b?.cfi && addSet.has(b.cfi) && !dbCfis.has(b.cfi) && !delSet.has(b.cfi)
  );
  return [...db, ...localAdds].slice(0, max);
}

// Pending-op queue helpers (offline-safe). A queued op is dropped once its DB
// write is confirmed. Adding a cfi to one queue removes it from the other so an
// add-then-delete (or vice versa) never leaves the cfi in both.
export function withPending(pend, kind, cfi) {
  const adds = new Set(pend?.adds || []);
  const dels = new Set(pend?.dels || []);
  if (kind === 'adds') { adds.add(cfi); dels.delete(cfi); }
  else                 { dels.add(cfi); adds.delete(cfi); }
  return { adds: [...adds], dels: [...dels] };
}

export function withoutPending(pend, kind, cfi) {
  const next = { adds: [...(pend?.adds || [])], dels: [...(pend?.dels || [])] };
  next[kind] = next[kind].filter(c => c !== cfi);
  return next;
}
