import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveBookUrl } from './openBook.js';

const FAKE_TOKEN  = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.mock';
const FAKE_PATH   = 'user-123/42/my-book.epub';
const FAKE_META   = { id: 1, user_id: 'user-123', book_id: 42, file_path: FAKE_PATH, file_type: 'epub', file_name: 'my-book.epub' };
const FAKE_BOOK   = { id: 42, title: 'Test Book' };
const UID         = 'user-123';
const EPUB_BYTES  = new Uint8Array([80, 75, 3, 4]).buffer; // fake epub header

function makeSupabase({ token = FAKE_TOKEN } = {}) {
  return {
    auth: {
      refreshSession: vi.fn().mockResolvedValue({ data: { session: { access_token: token } } }),
      getSession:     vi.fn().mockResolvedValue({ data: { session: { access_token: token } } }),
    },
  };
}

function makeBlob() {
  return new Blob([EPUB_BYTES], { type: 'application/epub+zip' });
}

function makeSb({ rows = [FAKE_META], dlOk = true } = {}) {
  return {
    get: vi.fn().mockResolvedValue(rows),
    storage: {
      download: vi.fn().mockResolvedValue(
        dlOk
          ? { blob: makeBlob(), status: 200 }
          : { blob: null, status: 400 }
      ),
    },
  };
}

describe('resolveBookUrl', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns arrayBuffer when download succeeds', async () => {
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb: makeSb() });
    expect(result.arrayBuffer).toBeInstanceOf(ArrayBuffer);
    expect(result.meta).toEqual(FAKE_META);
    expect(result.error).toBeUndefined();
  });

  it('returns no_dl error when download returns 400', async () => {
    const sb = makeSb({ dlOk: false });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.error).toBe('no_dl_400');
    expect(result.arrayBuffer).toBeUndefined();
  });

  it('returns no_meta when ebook_files has no rows for this book', async () => {
    const sb = makeSb({ rows: [] });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.error).toBe('no_meta');
  });

  it('returns no_session when both refreshSession and getSession return null token', async () => {
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
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase, sb: makeSb() });
    expect(result.arrayBuffer).toBeInstanceOf(ArrayBuffer);
  });

  it('fetches metadata from DB always (never reads stale localStorage)', async () => {
    const sb = makeSb();
    await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(sb.get).toHaveBeenCalledWith('ebook_files', expect.stringContaining('user_id=eq.user-123'));
  });

  it('retries with string book_id when first DB query returns empty', async () => {
    let callCount = 0;
    const sb = makeSb();
    sb.get = vi.fn().mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? [] : [FAKE_META];
    });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.arrayBuffer).toBeInstanceOf(ArrayBuffer);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('passes freshToken explicitly to download (not stale JS-client session)', async () => {
    const sb = makeSb();
    await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(sb.storage.download).toHaveBeenCalledWith(FAKE_PATH, FAKE_TOKEN);
  });
});
