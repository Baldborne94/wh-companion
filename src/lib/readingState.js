// Single source of truth for "where am I with this book".
//
// Two independent stores used to answer that question and drifted apart:
//   • reading_status  (+ `wh40k_status_<uid>_<bid>`) — what the user *said*
//   • reading_progress(+ `wh40k_prog_<uid>_<bid>`)   — what the reader *observed*
// The UI read whichever was handy, so a finished book could still show as
// "reading", and each screen patched the mismatch its own way. Everything now
// goes through deriveBookState(): one reconciled `{ status, pct }` per book.
//
// Progress is canonically a 0–1 fraction. PdfReader historically wrote 0–100
// into the same column EpubReader wrote 0–1 into, so anything read back is
// normalized before use.

export const DONE_PCT = 0.97;

export const progressKey = (uid, bid) => `wh40k_prog_${uid || "anon"}_${bid}`;

export function normalizePct(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n > 1 ? n / 100 : n);
}

const ts = (v) => { const n = v ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : 0; };

function toRecord(raw) {
  if (!raw) return null;
  return {
    pct: normalizePct(raw.progress_pct ?? raw.pct),
    chapterIndex: Number(raw.chapter_index ?? raw.chapterIndex) || 0,
    pageIndex: Number(raw.page_index ?? raw.pageIndex) || 0,
    updatedAt: raw.last_read || raw.updatedAt || null,
  };
}

export function readProgressLS(uid, bid) {
  try { return toRecord(JSON.parse(localStorage.getItem(progressKey(uid, bid)))); }
  catch { return null; }
}

// Writes are merge-on-top so a reader that only knows the page (PDF) doesn't
// wipe the chapter index, and a cold-open 0% can never erase real progress.
export function writeProgressLS(uid, bid, patch) {
  const prev = readProgressLS(uid, bid) || { pct: 0, chapterIndex: 0, pageIndex: 0 };
  const next = {
    progress_pct: patch.pct != null ? normalizePct(patch.pct) : prev.pct,
    chapter_index: patch.chapterIndex != null ? patch.chapterIndex : prev.chapterIndex,
    page_index: patch.pageIndex != null ? patch.pageIndex : prev.pageIndex,
    last_read: patch.updatedAt || new Date().toISOString(),
  };
  try { localStorage.setItem(progressKey(uid, bid), JSON.stringify(next)); } catch {}
  return toRecord(next);
}

export function loadAllProgressLS(uid) {
  const out = {}, prefix = progressKey(uid, "");
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(prefix)) continue;
    const rec = toRecord((() => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } })());
    if (rec) out[k.slice(prefix.length)] = rec;
  }
  return out;
}

// Newest observation wins, per book. Rows without a timestamp lose to rows with
// one, so a legacy local record can't shadow a fresh sync from another device.
export function mergeProgress(localMap = {}, dbRows = []) {
  const out = { ...localMap };
  (dbRows || []).forEach(row => {
    if (!row || row.book_id == null) return;
    const id = String(row.book_id);
    const rec = toRecord(row);
    const cur = out[id];
    if (!cur || ts(rec.updatedAt) > ts(cur.updatedAt)) out[id] = rec;
  });
  return out;
}

// Reconcile the user's explicit status with what the reader observed.
//
//  • A status set *after* the last observed progress is a deliberate override
//    and wins outright (re-shelving a book you'd finished, say).
//  • Otherwise progress can only ever move a book forward: past DONE_PCT it is
//    read, above zero it is reading. It never downgrades an explicit 'read'.
//  • A read book is always 100% — a stale mid-book percentage never resurfaces.
export function deriveBookState(manual, prog) {
  const manualStatus = manual?.status || "none";
  const pct = normalizePct(prog?.pct);
  const done = { status: "read", pct: 1, manual: manualStatus };

  if (manualStatus === "read") return { ...done, source: "manual" };
  if (manualStatus !== "none" && ts(manual?.updatedAt) >= ts(prog?.updatedAt))
    return { status: manualStatus, pct, manual: manualStatus, source: "manual" };
  if (pct >= DONE_PCT) return { ...done, source: "progress" };
  if (pct > 0) return { status: "reading", pct, manual: manualStatus, source: "progress" };
  return { status: manualStatus, pct: 0, manual: manualStatus, source: manualStatus === "none" ? "none" : "manual" };
}

// Derived view of a whole status map. Keeps every field the manual entry
// carried (startedAt/completedAt/updatedAt) so callers that read those keep
// working, and adds the reconciled `status`/`pct` plus the raw `manual` status.
export function deriveStatusMap(manualMap = {}, progressMap = {}, bookIds = null) {
  const ids = new Set([
    ...Object.keys(manualMap),
    ...Object.keys(progressMap).filter(id => !bookIds || bookIds.has(id)),
  ].map(String));
  const out = {};
  ids.forEach(id => {
    const manual = manualMap[id];
    const derived = deriveBookState(manual, progressMap[id]);
    if (derived.status === "none" && !derived.pct) return;
    out[id] = { ...(manual || {}), ...derived };
  });
  return out;
}

// Single-book progress for the readers/detail page: local first (works
// offline), then whatever the server has, newest wins. Never throws.
export async function loadBookProgress({ uid, bookId, sb }) {
  const local = readProgressLS(uid, bookId);
  if (!uid || !sb) return local;
  try {
    const rows = await sb.get("reading_progress", `book_id=eq.${bookId}&limit=1`);
    if (!rows || rows._error || !rows.length) return local;
    // The query already pinned the book, so a row is this book's whether or not
    // the selected columns happened to include book_id.
    const merged = mergeProgress(
      local ? { [String(bookId)]: local } : {},
      rows.map(r => ({ ...r, book_id: r?.book_id ?? bookId })),
    );
    return merged[String(bookId)] || local;
  } catch { return local; }
}
