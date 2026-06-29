import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveBookUrl } from './openBook.js';
import { cacheGet, cachePut } from './ebookCache';

// Mock the IndexedDB cache so we can drive the offline / fallback paths.
vi.mock('./ebookCache', () => ({ cacheGet: vi.fn(), cachePut: vi.fn() }));

// navigator.onLine is read-only in jsdom — redefine it per test.
function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

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
  beforeEach(() => { vi.clearAllMocks(); setOnline(true); });
  afterEach(() => setOnline(true));

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

  it('caches the bytes and stores meta on a successful download', async () => {
    const sb = makeSb();
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(cachePut).toHaveBeenCalledWith(UID, FAKE_BOOK.id, expect.any(ArrayBuffer));
    expect(JSON.parse(localStorage.getItem(`wh40k_ebook_${UID}_${FAKE_BOOK.id}`))).toEqual(FAKE_META);
    expect(result.fromCache).toBeUndefined();
  });

  it('finds metadata via the all-rows fallback when both id queries miss', async () => {
    const sb = makeSb();
    let n = 0;
    sb.get = vi.fn().mockImplementation(async () => {
      n++;
      if (n <= 2) return [];                 // numeric + string id queries miss
      return [{ ...FAKE_META, book_id: '42' }]; // all-rows query, filtered by String(id)
    });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.arrayBuffer).toBeInstanceOf(ArrayBuffer);
    expect(n).toBe(3);
  });

  // ── download-failed fallback to cache (navigator.onLine true but no real net) ──
  it('falls back to the IndexedDB cache when the download fails but bytes are cached', async () => {
    cacheGet.mockResolvedValue(EPUB_BYTES);
    const sb = makeSb({ dlOk: false });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.arrayBuffer).toBe(EPUB_BYTES);
    expect(result.fromCache).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns no_dl error when download fails AND nothing is cached', async () => {
    cacheGet.mockResolvedValue(undefined);
    const sb = makeSb({ dlOk: false });
    const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
    expect(result.error).toBe('no_dl_400');
  });

  // ── offline path ──────────────────────────────────────────────────────────────
  describe('offline', () => {
    beforeEach(() => setOnline(false));

    it('returns cached bytes (fromCache) without any network call', async () => {
      cacheGet.mockResolvedValue(EPUB_BYTES);
      const sb = makeSb();
      const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb });
      expect(result.arrayBuffer).toBe(EPUB_BYTES);
      expect(result.fromCache).toBe(true);
      expect(sb.get).not.toHaveBeenCalled();
      expect(sb.storage.download).not.toHaveBeenCalled();
    });

    it('preserves a cached PDF file_type from localStorage meta', async () => {
      cacheGet.mockResolvedValue(EPUB_BYTES);
      localStorage.setItem(`wh40k_ebook_${UID}_${FAKE_BOOK.id}`, JSON.stringify({ file_type: 'pdf' }));
      const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb: makeSb() });
      expect(result.meta.file_type).toBe('pdf');
    });

    it('defaults file_type to epub when no localStorage meta exists', async () => {
      cacheGet.mockResolvedValue(EPUB_BYTES);
      localStorage.removeItem(`wh40k_ebook_${UID}_${FAKE_BOOK.id}`);
      const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb: makeSb() });
      expect(result.meta.file_type).toBe('epub');
    });

    it('returns offline_no_cache when offline and nothing is cached', async () => {
      cacheGet.mockResolvedValue(undefined);
      const result = await resolveBookUrl({ uid: UID, book: FAKE_BOOK, supabase: makeSupabase(), sb: makeSb() });
      expect(result.error).toBe('offline_no_cache');
    });
  });
});
