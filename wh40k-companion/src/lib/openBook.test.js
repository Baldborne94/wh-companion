import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveBookUrl } from './openBook.js';

// Mock URL.createObjectURL (not available in jsdom)
globalThis.URL.createObjectURL = vi.fn(blob => `blob:mock-${blob.size}`);

const FAKE_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.mock';
const FAKE_PATH  = 'user-123/42/my-book.epub';
const FAKE_META  = { id: 1, user_id: 'user-123', book_id: 42, file_path: FAKE_PATH, file_type: 'epub', file_name: 'my-book.epub' };
const FAKE_BOOK  = { id: 42, title: 'Test Book' };
const UID        = 'user-123';

function makeSupabase({ token = FAKE_TOKEN } = {}) {
  return {
    auth: {
      refreshSession: vi.fn().mockResolvedValue({ data: { session: { access_token: token } } }),
      getSession:     vi.fn().mockResolvedValue({ data: { session: { access_token: token } } }),
    },
  };
}

function makeSb({ rows = [FAKE_META], signedUrl = 'https://sb.co/signed', download = null } = {}) {
  return {
    get: vi.fn().mockResolvedValue(rows),
    storage: {
      signedUrl: vi.fn().mockImplementation(async (_path, _tok, onError) => {
        if (signedUrl === null) { onError?.({ status: 400 }); return null; }
        return signedUrl;
      }),
      download: vi.fn().mockResolvedValue(
        download !== null
          ? { blob: new Blob(['epub data'], { type: 'application/epub+zip' }), status: 200 }
          : { blob: null, status: 400 }
      ),
    },
  };
}

describe('resolveBookUrl', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns signed URL when storage sign succeeds', async () => {
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb: makeSb() });
    expect(result.url).toBe('https://sb.co/signed');
    expect(result.meta).toEqual(FAKE_META);
    expect(result.error).toBeUndefined();
  });

  it('falls back to blob URL when sign returns 400 but download succeeds', async () => {
    const sb = makeSb({ signedUrl: null, download: true });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.url).toMatch(/^blob:/);
    expect(result.error).toBeUndefined();
  });

  it('returns no_url error when both sign and download return 400', async () => {
    const sb = makeSb({ signedUrl: null, download: null });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.error).toBe('no_url_s400_d400');
    expect(result.url).toBeUndefined();
  });

  it('returns no_meta when ebook_files has no rows for this book', async () => {
    const sb = makeSb({ rows: [] });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.error).toBe('no_meta');
  });

  it('returns no_session when refreshSession and getSession both return null token', async () => {
    const supabase = {
      auth: {
        refreshSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        getSession:     vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    };
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase, sb: makeSb() });
    expect(result.error).toBe('no_session');
  });

  it('falls back to getSession when refreshSession throws', async () => {
    const supabase = {
      auth: {
        refreshSession: vi.fn().mockRejectedValue(new Error('network error')),
        getSession:     vi.fn().mockResolvedValue({ data: { session: { access_token: FAKE_TOKEN } } }),
      },
    };
    const sb = makeSb();
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase, sb });
    expect(result.url).toBe('https://sb.co/signed');
  });

  it('fetches metadata from DB (never uses stale cache)', async () => {
    const sb = makeSb();
    await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(sb.get).toHaveBeenCalledWith('ebook_files', expect.stringContaining('user_id=eq.user-123'));
  });

  it('retries with string book_id when first DB query returns empty', async () => {
    let callCount = 0;
    const sb = makeSb();
    sb.get = vi.fn().mockImplementation(async (_t, q) => {
      callCount++;
      if (callCount === 1) return []; // first call: empty
      return [FAKE_META];             // second call: found
    });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.url).toBe('https://sb.co/signed');
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
