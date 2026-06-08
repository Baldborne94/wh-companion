/**
 * Pure function: resolve a signed/blob URL for a book's ebook file.
 *
 * Returns { url, meta } on success or { error: string } on failure.
 * All side-effects (localStorage, setAppReader) stay in the caller (App.jsx).
 */
export async function resolveBookUrl({ uid, book, supabase, sb }) {
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

  // Step 3: try signed URL
  let urlErr = {};
  const signedUrl = await sb.storage.signedUrl(meta.file_path, freshToken, e => { urlErr = e; });
  if (signedUrl) return { url: signedUrl, meta };

  // Step 4: direct REST download with explicit token (bypasses JS-client stale state)
  const { blob, status: dlStatus } = await sb.storage.download(meta.file_path, freshToken);
  if (blob) {
    const url = URL.createObjectURL(blob);
    return { url, meta };
  }

  return { error: `no_url_s${urlErr.status ?? 'x'}_d${dlStatus ?? 'x'}` };
}
