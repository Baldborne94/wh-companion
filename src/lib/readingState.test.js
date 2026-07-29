import { describe, it, expect, beforeEach } from 'vitest';
import {
  DONE_PCT, normalizePct, readProgressLS, writeProgressLS, loadAllProgressLS,
  mergeProgress, deriveBookState, deriveStatusMap, loadBookProgress, progressKey,
} from './readingState';

const UID = 'u1';
const at = (iso) => iso;

beforeEach(() => localStorage.clear());

describe('normalizePct', () => {
  it('keeps a 0–1 fraction as-is', () => {
    expect(normalizePct(0.42)).toBe(0.42);
  });

  it('rescales the 0–100 form PdfReader used to write', () => {
    expect(normalizePct(50)).toBe(0.5);
    expect(normalizePct(100)).toBe(1);
  });

  it('clamps garbage to 0', () => {
    for (const v of [null, undefined, NaN, -3, 'nope', {}]) expect(normalizePct(v)).toBe(0);
  });

  it('never exceeds 1', () => {
    expect(normalizePct(250)).toBe(1);
  });
});

describe('localStorage progress store', () => {
  it('round-trips a record through the canonical fraction form', () => {
    writeProgressLS(UID, 7, { pct: 0.25, chapterIndex: 3, pageIndex: 12, updatedAt: at('2026-01-01T00:00:00.000Z') });
    expect(readProgressLS(UID, 7)).toEqual({
      pct: 0.25, chapterIndex: 3, pageIndex: 12, updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('normalizes a legacy 0–100 value written by an older PdfReader', () => {
    localStorage.setItem(progressKey(UID, 9), JSON.stringify({ page_index: 5, progress_pct: 60 }));
    expect(readProgressLS(UID, 9).pct).toBe(0.6);
  });

  it('merges a partial write instead of wiping the other fields', () => {
    writeProgressLS(UID, 7, { pct: 0.5, chapterIndex: 4, pageIndex: 9 });
    writeProgressLS(UID, 7, { pct: 0.6 });
    const rec = readProgressLS(UID, 7);
    expect(rec.pct).toBe(0.6);
    expect(rec.chapterIndex).toBe(4);
    expect(rec.pageIndex).toBe(9);
  });

  it('stamps updatedAt when the caller does not', () => {
    writeProgressLS(UID, 7, { pct: 0.1 });
    expect(Date.parse(readProgressLS(UID, 7).updatedAt)).toBeGreaterThan(0);
  });

  it('returns null for an unknown book and for corrupt JSON', () => {
    expect(readProgressLS(UID, 404)).toBeNull();
    localStorage.setItem(progressKey(UID, 5), '{not json');
    expect(readProgressLS(UID, 5)).toBeNull();
  });

  it('loads every book for the user, keyed by string id, and ignores other users', () => {
    writeProgressLS(UID, 1, { pct: 0.2 });
    writeProgressLS(UID, 'aos3', { pct: 0.4 });
    writeProgressLS('other', 2, { pct: 0.9 });
    const all = loadAllProgressLS(UID);
    expect(Object.keys(all).sort()).toEqual(['1', 'aos3']);
    expect(all.aos3.pct).toBe(0.4);
  });
});

describe('mergeProgress', () => {
  it('takes the newer observation per book', () => {
    const local = { 1: { pct: 0.2, chapterIndex: 0, pageIndex: 0, updatedAt: '2026-01-01T00:00:00.000Z' } };
    const merged = mergeProgress(local, [{ book_id: 1, progress_pct: 0.8, last_read: '2026-02-01T00:00:00.000Z' }]);
    expect(merged['1'].pct).toBe(0.8);
  });

  it('keeps the local record when the server row is older', () => {
    const local = { 1: { pct: 0.8, chapterIndex: 0, pageIndex: 0, updatedAt: '2026-02-01T00:00:00.000Z' } };
    const merged = mergeProgress(local, [{ book_id: 1, progress_pct: 0.2, last_read: '2026-01-01T00:00:00.000Z' }]);
    expect(merged['1'].pct).toBe(0.8);
  });

  it('adds books only the server knows about', () => {
    const merged = mergeProgress({}, [{ book_id: 'aos5', progress_pct: 0.3, last_read: '2026-01-01T00:00:00.000Z' }]);
    expect(merged.aos5.pct).toBe(0.3);
  });

  it('normalizes the 0–100 rows PdfReader wrote to the server', () => {
    const merged = mergeProgress({}, [{ book_id: 2, progress_pct: 75, last_read: '2026-01-01T00:00:00.000Z' }]);
    expect(merged['2'].pct).toBe(0.75);
  });

  it('ignores rows without a book id, and a missing row list', () => {
    expect(mergeProgress({}, [null, { progress_pct: 0.5 }])).toEqual({});
    expect(mergeProgress({ 1: { pct: 0.1 } }, undefined)['1'].pct).toBe(0.1);
  });
});

describe('deriveBookState', () => {
  const manual = (status, updatedAt) => ({ status, updatedAt });
  const prog = (pct, updatedAt) => ({ pct, updatedAt });

  it('is "none" with nothing recorded', () => {
    expect(deriveBookState(undefined, undefined)).toMatchObject({ status: 'none', pct: 0 });
  });

  it('reports a manually read book as complete even with stale mid-book progress', () => {
    // The exact mismatch the UI used to patch per-screen.
    const s = deriveBookState(manual('read', '2026-01-01T00:00:00.000Z'), prog(0.5, '2026-02-01T00:00:00.000Z'));
    expect(s).toMatchObject({ status: 'read', pct: 1, source: 'manual' });
  });

  it('derives "read" from progress past the finish threshold when nothing was marked', () => {
    const s = deriveBookState(undefined, prog(DONE_PCT, '2026-01-01T00:00:00.000Z'));
    expect(s).toMatchObject({ status: 'read', pct: 1, source: 'progress' });
  });

  it('derives "reading" from progress alone', () => {
    expect(deriveBookState(undefined, prog(0.3, '2026-01-01T00:00:00.000Z')))
      .toMatchObject({ status: 'reading', pct: 0.3, source: 'progress' });
  });

  it('promotes a book still marked "reading" once progress passes the threshold', () => {
    // Reader crashed / went offline before the auto-mark write landed.
    const s = deriveBookState(manual('reading', '2026-01-01T00:00:00.000Z'), prog(0.99, '2026-02-01T00:00:00.000Z'));
    expect(s).toMatchObject({ status: 'read', pct: 1, source: 'progress' });
  });

  it('lets a status set after the last read override the observed progress', () => {
    // Shelved as "to read" today, having read 60% last month → the user wins.
    const s = deriveBookState(manual('want', '2026-02-01T00:00:00.000Z'), prog(0.6, '2026-01-01T00:00:00.000Z'));
    expect(s).toMatchObject({ status: 'want', source: 'manual' });
  });

  it('keeps a "want" book at "want" when there is no progress at all', () => {
    expect(deriveBookState(manual('want', '2026-01-01T00:00:00.000Z'), undefined))
      .toMatchObject({ status: 'want', pct: 0 });
  });

  it('always exposes the raw manual status alongside the derived one', () => {
    const s = deriveBookState(manual('reading', '2026-01-01T00:00:00.000Z'), prog(0.99, '2026-02-01T00:00:00.000Z'));
    expect(s.manual).toBe('reading');
  });

  it('treats an untimestamped legacy status as an explicit choice', () => {
    expect(deriveBookState({ status: 'reading' }, undefined)).toMatchObject({ status: 'reading' });
  });

  it('normalizes 0–100 progress before comparing to the threshold', () => {
    expect(deriveBookState(undefined, { pct: 98, updatedAt: '2026-01-01T00:00:00.000Z' }))
      .toMatchObject({ status: 'read' });
  });
});

describe('deriveStatusMap', () => {
  it('merges books known only to progress with books known only to status', () => {
    const map = deriveStatusMap(
      { 1: { status: 'want', updatedAt: '2026-01-01T00:00:00.000Z' } },
      { 2: { pct: 0.4, updatedAt: '2026-01-02T00:00:00.000Z' } },
    );
    expect(map['1'].status).toBe('want');
    expect(map['2'].status).toBe('reading');
  });

  it('preserves startedAt/completedAt from the manual entry', () => {
    const map = deriveStatusMap(
      { 1: { status: 'read', updatedAt: '2026-01-01T00:00:00.000Z', startedAt: 'S', completedAt: 'C' } }, {},
    );
    expect(map['1']).toMatchObject({ status: 'read', startedAt: 'S', completedAt: 'C' });
  });

  it('drops entries that resolve to nothing', () => {
    expect(deriveStatusMap({ 1: { status: 'none' } }, {})).toEqual({});
  });

  it('restricts progress-only books to the given universe', () => {
    const map = deriveStatusMap({}, { 1: { pct: 0.5 }, aos9: { pct: 0.5 } }, new Set(['aos9']));
    expect(Object.keys(map)).toEqual(['aos9']);
  });

  it('still includes a manual entry outside the id set (it is already scoped)', () => {
    const map = deriveStatusMap({ 3: { status: 'want' } }, {}, new Set(['aos9']));
    expect(map['3'].status).toBe('want');
  });
});

describe('loadBookProgress', () => {
  const sbWith = (rows) => ({ get: async () => rows });

  it('returns the local record when there is no user or client', async () => {
    writeProgressLS(UID, 1, { pct: 0.5 });
    expect((await loadBookProgress({ uid: UID, bookId: 1, sb: null })).pct).toBe(0.5);
  });

  it('prefers the newer server row', async () => {
    writeProgressLS(UID, 1, { pct: 0.2, updatedAt: '2026-01-01T00:00:00.000Z' });
    const rec = await loadBookProgress({
      uid: UID, bookId: 1, sb: sbWith([{ book_id: 1, progress_pct: 0.9, last_read: '2026-02-01T00:00:00.000Z' }]),
    });
    expect(rec.pct).toBe(0.9);
  });

  it('keeps local progress when the server has nothing or errors', async () => {
    writeProgressLS(UID, 1, { pct: 0.2 });
    expect((await loadBookProgress({ uid: UID, bookId: 1, sb: sbWith([]) })).pct).toBe(0.2);
    expect((await loadBookProgress({ uid: UID, bookId: 1, sb: sbWith({ _error: 'boom' }) })).pct).toBe(0.2);
    expect((await loadBookProgress({ uid: UID, bookId: 1, sb: { get: async () => { throw new Error('offline'); } } })).pct).toBe(0.2);
  });

  it('attributes a row to the requested book when the row omits book_id', async () => {
    // The query pins the book, so the selected columns need not repeat the id.
    const rec = await loadBookProgress({
      uid: UID, bookId: 1, sb: sbWith([{ progress_pct: 0.45, chapter_index: 2, page_index: 3 }]),
    });
    expect(rec).toMatchObject({ pct: 0.45, chapterIndex: 2, pageIndex: 3 });
  });

  it('returns the server row for a book with no local record', async () => {
    const rec = await loadBookProgress({
      uid: UID, bookId: 4, sb: sbWith([{ book_id: 4, progress_pct: 0.7, last_read: at('2026-01-01T00:00:00.000Z') }]),
    });
    expect(rec.pct).toBe(0.7);
  });
});
