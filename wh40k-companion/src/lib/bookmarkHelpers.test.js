import { describe, it, expect } from 'vitest';
import { addBookmark, removeBookmark, mergeBookmarks, bookmarkPageLabel, resolveNavCfi, MAX_BOOKMARKS } from './bookmarkHelpers.js';

const bm = (cfi, label = 'B', pct = 10) => ({ cfi, label, pct, createdAt: new Date().toISOString() });

// ─── addBookmark ──────────────────────────────────────────────────────────────

describe('addBookmark', () => {
  it('prepends a new bookmark to an empty list', () => {
    const result = addBookmark([], bm('cfi1'));
    expect(result).toHaveLength(1);
    expect(result[0].cfi).toBe('cfi1');
  });

  it('prepends to the front (most-recent first)', () => {
    const existing = [bm('cfi1')];
    const result = addBookmark(existing, bm('cfi2'));
    expect(result[0].cfi).toBe('cfi2');
    expect(result[1].cfi).toBe('cfi1');
  });

  it('deduplicates: removes old entry and puts updated one at front', () => {
    const existing = [bm('cfi1', 'Old', 5), bm('cfi2')];
    const updated = bm('cfi1', 'Updated', 42);
    const result = addBookmark(existing, updated);
    expect(result[0].cfi).toBe('cfi1');
    expect(result[0].label).toBe('Updated');
    expect(result).toHaveLength(2); // no duplicates
  });

  it('caps at MAX_BOOKMARKS', () => {
    const existing = Array.from({ length: MAX_BOOKMARKS }, (_, i) => bm(`cfi${i}`));
    const result = addBookmark(existing, bm('cfiNew'));
    expect(result).toHaveLength(MAX_BOOKMARKS);
    expect(result[0].cfi).toBe('cfiNew');
  });

  it('ignores bookmark with no CFI', () => {
    const existing = [bm('cfi1')];
    const result = addBookmark(existing, { label: 'No CFI', pct: 5, createdAt: '' });
    expect(result).toHaveLength(1);
  });

  it('does not mutate the original array', () => {
    const existing = [bm('cfi1')];
    addBookmark(existing, bm('cfi2'));
    expect(existing).toHaveLength(1);
  });
});

// ─── removeBookmark ───────────────────────────────────────────────────────────

describe('removeBookmark', () => {
  it('removes the bookmark with the given CFI', () => {
    const existing = [bm('cfi1'), bm('cfi2'), bm('cfi3')];
    const result = removeBookmark(existing, 'cfi2');
    expect(result).toHaveLength(2);
    expect(result.find(b => b.cfi === 'cfi2')).toBeUndefined();
  });

  it('returns empty array when last bookmark is removed', () => {
    expect(removeBookmark([bm('cfi1')], 'cfi1')).toHaveLength(0);
  });

  it('no-ops when CFI is not found', () => {
    const existing = [bm('cfi1')];
    const result = removeBookmark(existing, 'nonexistent');
    expect(result).toHaveLength(1);
  });

  it('does not mutate the original array', () => {
    const existing = [bm('cfi1')];
    removeBookmark(existing, 'cfi1');
    expect(existing).toHaveLength(1);
  });
});

// ─── mergeBookmarks ───────────────────────────────────────────────────────────

describe('mergeBookmarks', () => {
  it('returns DB bookmarks when local is empty', () => {
    const dbBms = [bm('cfi1'), bm('cfi2')];
    const result = mergeBookmarks([], dbBms);
    expect(result.map(b => b.cfi)).toEqual(['cfi1', 'cfi2']);
  });

  it('appends local-only entries after DB entries', () => {
    const local  = [bm('local1')];
    const dbBms  = [bm('db1'), bm('db2')];
    const result = mergeBookmarks(local, dbBms);
    expect(result[0].cfi).toBe('db1');
    expect(result[2].cfi).toBe('local1');
  });

  it('does not duplicate bookmarks that exist in both local and DB', () => {
    const shared  = bm('shared');
    const local   = [shared, bm('local-only')];
    const dbBms   = [shared, bm('db-only')];
    const result  = mergeBookmarks(local, dbBms);
    const cfis    = result.map(b => b.cfi);
    expect(cfis.filter(c => c === 'shared')).toHaveLength(1);
  });

  it('excludes pending-deleted CFIs from DB result', () => {
    const dbBms = [bm('keep'), bm('del1'), bm('del2')];
    const result = mergeBookmarks([], dbBms, ['del1', 'del2']);
    expect(result).toHaveLength(1);
    expect(result[0].cfi).toBe('keep');
  });

  it('excludes pending-deleted CFIs from local entries', () => {
    const local  = [bm('keep'), bm('to-delete')];
    const result = mergeBookmarks(local, [], ['to-delete']);
    expect(result).toHaveLength(1);
    expect(result[0].cfi).toBe('keep');
  });

  it('caps merged result at MAX_BOOKMARKS', () => {
    const dbBms = Array.from({ length: 20 }, (_, i) => bm(`db${i}`));
    const local  = Array.from({ length: 20 }, (_, i) => bm(`local${i}`));
    const result = mergeBookmarks(local, dbBms);
    expect(result).toHaveLength(MAX_BOOKMARKS);
  });

  it('returns empty array when all bookmarks are pending-deleted', () => {
    const dbBms = [bm('x'), bm('y')];
    const local  = [bm('x'), bm('y')];
    const result = mergeBookmarks(local, dbBms, ['x', 'y']);
    expect(result).toHaveLength(0);
  });

  it('user saves bookmark, exits, reopens: bookmark is present in merged result', () => {
    // Simulates: user saved bm at cfi-saved, DB has it, local also has it
    const saved = bm('cfi-saved', 'My place', 55);
    const local  = [saved];
    const dbBms  = [saved];
    const result = mergeBookmarks(local, dbBms, []);
    expect(result).toHaveLength(1);
    expect(result[0].cfi).toBe('cfi-saved');
    expect(result[0].pct).toBe(55);
  });
});

// ─── bookmarkPageLabel ────────────────────────────────────────────────────────

describe('bookmarkPageLabel', () => {
  it('returns exact page when bm.page is set', () => {
    expect(bookmarkPageLabel({ page: 42, pct: 50 })).toBe('Pag. 42');
  });

  it('returns estimated page from pct when pageDisplay.total is available', () => {
    expect(bookmarkPageLabel({ pct: 50 }, { total: 100 })).toBe('Pag. ~50');
  });

  it('rounds the estimated page correctly', () => {
    expect(bookmarkPageLabel({ pct: 33 }, { total: 100 })).toBe('Pag. ~33');
  });

  it('returns at least page 1 for very small pct', () => {
    expect(bookmarkPageLabel({ pct: 0.1 }, { total: 1000 })).toBe('Pag. ~1');
  });

  it('falls back to raw percent when no pageDisplay', () => {
    expect(bookmarkPageLabel({ pct: 30 })).toBe('30%');
  });

  it('falls back to raw percent when pageDisplay has no total', () => {
    expect(bookmarkPageLabel({ pct: 30 }, { total: null })).toBe('30%');
  });

  it('returns dash when pct is 0 and no page', () => {
    expect(bookmarkPageLabel({ pct: 0 })).toBe('–');
  });

  it('returns dash for empty bookmark', () => {
    expect(bookmarkPageLabel({})).toBe('–');
  });

  it('page takes priority over pct + pageDisplay', () => {
    expect(bookmarkPageLabel({ page: 7, pct: 50 }, { total: 100 })).toBe('Pag. 7');
  });
});

// ─── resolveNavCfi ────────────────────────────────────────────────────────────

const mockBook = (total, pctCfi) => ({
  locations: { total, cfiFromPercentage: () => pctCfi },
});

describe('resolveNavCfi', () => {
  it('returns bm.cfi when book is null', () => {
    expect(resolveNavCfi({ cfi: 'cfi1', pct: 50 }, null)).toBe('cfi1');
  });

  it('returns bm.cfi when locations not loaded (total=0)', () => {
    expect(resolveNavCfi({ cfi: 'cfi1', pct: 50 }, mockBook(0, 'pct-cfi'))).toBe('cfi1');
  });

  it('returns bm.cfi when pct is 0 (no percentage info)', () => {
    expect(resolveNavCfi({ cfi: 'cfi1', pct: 0 }, mockBook(100, 'pct-cfi'))).toBe('cfi1');
  });

  it('returns percentage-based CFI when locations loaded and pct > 0', () => {
    expect(resolveNavCfi({ cfi: 'cfi1', pct: 42 }, mockBook(100, 'pct-cfi'))).toBe('pct-cfi');
  });

  it('falls back to bm.cfi when cfiFromPercentage returns null', () => {
    const book = { locations: { total: 100, cfiFromPercentage: () => null } };
    expect(resolveNavCfi({ cfi: 'cfi1', pct: 42 }, book)).toBe('cfi1');
  });
});
