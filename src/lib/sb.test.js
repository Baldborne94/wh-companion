// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub env vars before the module under test reads them (vi.hoisted runs before imports).
vi.hoisted(() => {
  import.meta.env.VITE_SUPABASE_URL      = 'https://test.supabase.co';
  import.meta.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
});

// Mock supabase client so auth + storage calls are controllable.
vi.mock('./supabase', () => {
  const storageBucket = {
    createSignedUrl: vi.fn(),
    remove: vi.fn(),
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
      storage: {
        from: vi.fn().mockReturnValue(storageBucket),
        _bucket: storageBucket, // expose for per-test control
      },
    },
  };
});

import { sb } from './sb.js';
import { supabase } from './supabase';

const SB_URL = 'https://test.supabase.co';
const SB_KEY = 'test-anon-key';
const TOKEN  = 'real-access-token';

function mockSession(token = TOKEN) {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: token } } });
}
function mockNoSession() {
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
}
function ok(body = {}) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}
function err(status = 500, body = 'error') {
  return { ok: false, status, json: async () => ({}), text: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks(); // reset call history on module-level vi.fn() mocks
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok([]));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockNoSession();
});
afterEach(() => { vi.restoreAllMocks(); });

// ── _h() ──────────────────────────────────────────────────────────────────────
describe('sb._h()', () => {
  it('uses anon key as bearer when no session', async () => {
    const h = await sb._h();
    expect(h.apikey).toBe(SB_KEY);
    expect(h.Authorization).toBe(`Bearer ${SB_KEY}`);
    expect(h['Content-Type']).toBe('application/json');
  });

  it('uses session access_token when a session exists', async () => {
    mockSession();
    const h = await sb._h();
    expect(h.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(h.apikey).toBe(SB_KEY);
  });
});

// ── sb.get() ──────────────────────────────────────────────────────────────────
describe('sb.get()', () => {
  it('calls the right REST URL and returns parsed JSON', async () => {
    const rows = [{ id: 1 }];
    globalThis.fetch.mockResolvedValue(ok(rows));
    const result = await sb.get('reading_progress', 'user_id=eq.u1');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${SB_URL}/rest/v1/reading_progress?user_id=eq.u1`);
    expect(result).toEqual(rows);
  });

  it('returns {_error, _body} and logs on HTTP error', async () => {
    globalThis.fetch.mockResolvedValue(err(404, 'not found'));
    const result = await sb.get('reading_progress');
    expect(result).toMatchObject({ _error: 404, _body: 'not found' });
    expect(console.error).toHaveBeenCalled();
  });

  it('returns [] and logs on network exception', async () => {
    globalThis.fetch.mockRejectedValue(new Error('offline'));
    const result = await sb.get('reading_progress');
    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('appends auth headers to every request', async () => {
    mockSession('tok123');
    await sb.get('bookmarks');
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer tok123');
    expect(opts.headers.apikey).toBe(SB_KEY);
  });
});

// ── sb.upsert() ───────────────────────────────────────────────────────────────
describe('sb.upsert()', () => {
  it('POSTs with on_conflict and returns JSON on success', async () => {
    const row = { user_id: 'u1', book_id: 1, progress_pct: 50 };
    globalThis.fetch.mockResolvedValue(ok([row]));
    const result = await sb.upsert('reading_progress', row);
    expect(result).toEqual([row]);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/rest/v1/reading_progress?on_conflict=user_id,book_id');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(row);
  });

  it('falls back to PATCH when POST fails, returns PATCH rows', async () => {
    const row = { user_id: 'u1', book_id: 1, progress_pct: 75 };
    const patchResult = [{ ...row, id: 99 }];
    globalThis.fetch
      .mockResolvedValueOnce(err(409))       // POST fails
      .mockResolvedValueOnce(ok(patchResult)); // PATCH succeeds
    const result = await sb.upsert('reading_progress', row);
    expect(result).toEqual(patchResult);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const [, patchOpts] = globalThis.fetch.mock.calls[1];
    expect(patchOpts.method).toBe('PATCH');
  });

  it('falls back to INSERT when POST fails and PATCH returns empty rows', async () => {
    const row = { user_id: 'u1', book_id: 2, progress_pct: 10 };
    const insertResult = [{ ...row, id: 5 }];
    globalThis.fetch
      .mockResolvedValueOnce(err(409))      // POST fails
      .mockResolvedValueOnce(ok([]))         // PATCH returns empty
      .mockResolvedValueOnce(ok(insertResult)); // INSERT succeeds
    const result = await sb.upsert('reading_progress', row);
    expect(result).toEqual(insertResult);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    const [, insertOpts] = globalThis.fetch.mock.calls[2];
    expect(insertOpts.method).toBe('POST');
    expect(insertOpts.headers.Prefer).toBe('return=representation');
  });

  it('returns {_error} and logs when INSERT also fails', async () => {
    const row = { user_id: 'u1', book_id: 3 };
    globalThis.fetch
      .mockResolvedValueOnce(err(409))  // POST fails
      .mockResolvedValueOnce(ok([]))    // PATCH empty
      .mockResolvedValueOnce(err(500, 'server error')); // INSERT fails
    const result = await sb.upsert('reading_progress', row);
    expect(result).toMatchObject({ _error: 500 });
    expect(console.error).toHaveBeenCalled();
  });

  it('returns null and logs on network exception', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net'));
    const result = await sb.upsert('reading_progress', {});
    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('respects custom conflict column', async () => {
    globalThis.fetch.mockResolvedValue(ok([{}]));
    await sb.upsert('bookmarks', { user_id: 'u1', book_id: 1 }, 'user_id,book_id,epub_cfi');
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('on_conflict=user_id,book_id,epub_cfi');
  });
});

// ── sb.del() ──────────────────────────────────────────────────────────────────
describe('sb.del()', () => {
  it('returns true on successful DELETE', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 204 });
    const result = await sb.del('bookmarks', 'user_id=eq.u1');
    expect(result).toBe(true);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/rest/v1/bookmarks?user_id=eq.u1');
    expect(opts.method).toBe('DELETE');
  });

  it('returns false on HTTP error', async () => {
    globalThis.fetch.mockResolvedValue(err(403));
    expect(await sb.del('bookmarks')).toBe(false);
  });

  it('returns false on network exception', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net'));
    expect(await sb.del('bookmarks')).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

// ── storage.upload() ──────────────────────────────────────────────────────────
describe('sb.storage.upload()', () => {
  it('returns true on successful upload', async () => {
    mockSession();
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200 });
    const file = new Blob(['data'], { type: 'application/epub+zip' });
    const result = await sb.storage.upload('u1/42/book.epub', file);
    expect(result).toBe(true);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/storage/v1/object/ebooks/u1/42/book.epub');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-upsert']).toBe('true');
  });

  it('returns false on HTTP error', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 413 });
    expect(await sb.storage.upload('u1/1/a.epub', new Blob())).toBe(false);
  });

  it('returns false on exception', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net'));
    expect(await sb.storage.upload('u1/1/a.epub', new Blob())).toBe(false);
  });
});

// ── storage.signedUrl() ───────────────────────────────────────────────────────
describe('sb.storage.signedUrl()', () => {
  it('uses explicit token without calling getSession', async () => {
    const signedResp = { signedURL: '/storage/v1/object/sign/ebooks/u/b.epub?token=x' };
    globalThis.fetch.mockResolvedValue(ok(signedResp));
    const url = await sb.storage.signedUrl('u/b.epub', 'explicit-tok');
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    expect(url).toBe(`${SB_URL}${signedResp.signedURL}`);
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer explicit-tok');
  });

  it('reads session when no explicit token', async () => {
    mockSession('sess-tok');
    const signedResp = { signedUrl: '/storage/v1/object/sign/ebooks/u/b.epub?token=y' };
    globalThis.fetch.mockResolvedValue(ok(signedResp));
    const url = await sb.storage.signedUrl('u/b.epub');
    expect(supabase.auth.getSession).toHaveBeenCalled();
    expect(url).toBe(`${SB_URL}${signedResp.signedUrl}`);
  });

  it('percent-encodes path segments with special chars', async () => {
    globalThis.fetch.mockResolvedValue(ok({ signedURL: '/signed' }));
    await sb.storage.signedUrl('user id/my book.epub', 'tok');
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('user%20id/my%20book.epub');
  });

  it('falls back to JS client when REST fails', async () => {
    globalThis.fetch.mockResolvedValue(err(403));
    const jsUrl = 'https://test.supabase.co/storage/v1/object/sign/ebooks/u/b.epub?tok=js';
    supabase.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: jsUrl }, error: null }),
    });
    const url = await sb.storage.signedUrl('u/b.epub', 'tok');
    expect(url).toBe(jsUrl);
  });

  it('calls onError and returns null when both REST and JS client fail', async () => {
    globalThis.fetch.mockResolvedValue(err(403));
    supabase.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }),
    });
    const onError = vi.fn();
    const url = await sb.storage.signedUrl('u/b.epub', 'tok', onError);
    expect(url).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('calls onError and returns null on exception', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network down'));
    const onError = vi.fn();
    const url = await sb.storage.signedUrl('u/b.epub', 'tok', onError);
    expect(url).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ jsErr: 'network down' }));
  });
});

// ── storage.download() ────────────────────────────────────────────────────────
describe('sb.storage.download()', () => {
  it('returns blob and status on success', async () => {
    mockSession();
    const blob = new Blob(['data']);
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, blob: async () => blob });
    const result = await sb.storage.download('u1/1/book.epub');
    expect(result.blob).toBe(blob);
    expect(result.status).toBe(200);
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/storage/v1/object/ebooks/u1/1/book.epub');
  });

  it('uses explicit token when provided', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob() });
    await sb.storage.download('u/f.epub', 'explicit-tok');
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer explicit-tok');
  });

  it('percent-encodes path segments', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob() });
    await sb.storage.download('user id/my book.epub', 'tok');
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('user%20id/my%20book.epub');
  });

  it('returns {blob: null, status} on HTTP error', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 403, blob: async () => null });
    const result = await sb.storage.download('u/f.epub', 'tok');
    expect(result.blob).toBeNull();
    expect(result.status).toBe(403);
  });

  it('returns {blob: null, status: 0} on exception', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net'));
    const result = await sb.storage.download('u/f.epub', 'tok');
    expect(result.blob).toBeNull();
    expect(result.status).toBe(0);
  });
});

// ── storage.remove() ──────────────────────────────────────────────────────────
describe('sb.storage.remove()', () => {
  it('returns true when Supabase JS client removes successfully', async () => {
    supabase.storage.from.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: null }),
    });
    expect(await sb.storage.remove('u1/1/book.epub')).toBe(true);
    expect(supabase.storage.from).toHaveBeenCalledWith('ebooks');
  });

  it('returns false when JS client returns an error', async () => {
    supabase.storage.from.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: { message: 'not found' } }),
    });
    expect(await sb.storage.remove('u/f.epub')).toBe(false);
  });

  it('returns false on exception', async () => {
    supabase.storage.from.mockReturnValue({
      remove: vi.fn().mockRejectedValue(new Error('net')),
    });
    expect(await sb.storage.remove('u/f.epub')).toBe(false);
  });
});

// ── storage.url() ─────────────────────────────────────────────────────────────
describe('sb.storage.url()', () => {
  it('returns the public storage URL for a path', () => {
    const url = sb.storage.url('u1/1/cover.jpg');
    expect(url).toBe(`${SB_URL}/storage/v1/object/public/ebooks/u1/1/cover.jpg`);
  });

  it('does not encode the path (passes it verbatim)', () => {
    const url = sb.storage.url('user/file name.epub');
    expect(url).toContain('file name.epub');
  });
});
