import { cacheGet, cachePut } from './ebookCache';

/**
 * Download the ebook file as an ArrayBuffer, ready to pass directly to epubjs.
 *
 * Returns { arrayBuffer, meta } on success or { error: string } on failure.
 * We never pass a URL to EpubReader — fetching from inside the reader can fail
 * with CORS or service-worker errors on tablet. Downloading here uses explicit
 * auth headers that we control and avoids any secondary fetch inside the reader.
 *
 * Offline: returns cached ArrayBuffer from IndexedDB if available.
 * Online: downloads from Supabase then saves to IndexedDB for future offline use.
 */
export async function resolveBookUrl({ uid, book, supabase, sb }) {
  // Offline path: use IndexedDB cache + localStorage meta
  if (!navigator.onLine) {
    const cached = await cacheGet(uid, book.id);
    if (cached) {
      // Always keep file_type so cached PDFs don't open as EPUB; prefer stored meta.
      let meta = { file_type: 'epub' };
      try {
        const parsed = JSON.parse(localStorage.getItem(`wh40k_ebook_${uid}_${book.id}`) || 'null');
        if (parsed) meta = { file_type: 'epub', ...parsed };
      } catch {}
      return { arrayBuffer: cached, meta, fromCache: true };
    }
    return { error: 'offline_no_cache' };
  }

  // Step 1: get a fresh access token
  let freshToken = null;
  try {
    const { data } = await supabase.auth.refreshSession();
    freshToken = data?.session?.access_token ?? null;
  } catch {}
  if (!freshToken) {
    try {
      const { data } = await supabase.auth.getSession();
      freshToken = data?.session?.access_token ?? null;
    } catch {}
  }
  if (!freshToken) return { error: 'no_session' };

  // Step 2: fetch metadata fresh from DB (no localStorage cache — stale path = 400)
  let rows = await sb.get('ebook_files', `user_id=eq.${uid}&book_id=eq.${book.id}&limit=1`);
  if (!rows?.length || rows._error)
    rows = await sb.get('ebook_files', `user_id=eq.${uid}&book_id=eq.${String(book.id)}&limit=1`);
  if (!rows?.length || rows._error) {
    const all = await sb.get('ebook_files', `user_id=eq.${uid}`);
    rows = Array.isArray(all) ? all.filter(f => String(f.book_id) === String(book.id)) : [];
  }
  if (!rows?.length || rows._error) return { error: 'no_meta' };
  const meta = rows[0];

  // Step 3: download file bytes directly via REST with explicit freshToken.
  // This is the only download path — no signed URL, no URL.createObjectURL.
  // Bypasses CORS issues that occur when EpubReader tries to fetch a signed URL.
  const { blob, status: dlStatus } = await sb.storage.download(meta.file_path, freshToken);
  if (blob) {
    const arrayBuffer = await blob.arrayBuffer();
    cachePut(uid, book.id, arrayBuffer.slice(0)); // cache a copy so the original isn't detached by IDB
    try { localStorage.setItem(`wh40k_ebook_${uid}_${book.id}`, JSON.stringify(meta)); } catch {}
    return { arrayBuffer, meta };
  }

  // Download failed (e.g. navigator.onLine=true but no real internet) — fall back to cache.
  const cached = await cacheGet(uid, book.id);
  if (cached) return { arrayBuffer: cached, meta, fromCache: true };

  return { error: `no_dl_${dlStatus ?? 'x'}` };
}
