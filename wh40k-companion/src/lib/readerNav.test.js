import { describe, it, expect, vi } from 'vitest';
import { isCfiTarget, targetScrollTop, displayTarget, runScrollNav } from './readerNav.js';

const CFI = 'epubcfi(/6/14!/4/2/2/1:0)';
const SECTION_CFI = 'epubcfi(/6/14!/4)';
const HREF = 'chapter-3.xhtml';

// A schedule mock that records (fn, ms) calls so we can assert delays and run
// the queued retry manually — no real timers, deterministic tests.
function makeSchedule() {
  const calls = [];
  const schedule = (fn, ms) => { calls.push({ fn, ms }); };
  schedule.calls = calls;
  schedule.runAll = async () => { for (const c of calls) await c.fn(); };
  return schedule;
}

// ─── isCfiTarget ──────────────────────────────────────────────────────────────

describe('isCfiTarget', () => {
  it('recognises a CFI string', () => {
    expect(isCfiTarget(CFI)).toBe(true);
    expect(isCfiTarget(SECTION_CFI)).toBe(true);
  });
  it('rejects chapter hrefs', () => {
    expect(isCfiTarget(HREF)).toBe(false);
    expect(isCfiTarget('text/part0007.html#sec2')).toBe(false);
  });
  it('rejects non-strings and empty values', () => {
    expect(isCfiTarget(null)).toBe(false);
    expect(isCfiTarget(undefined)).toBe(false);
    expect(isCfiTarget(42)).toBe(false);
    expect(isCfiTarget('')).toBe(false);
  });
});

// ─── targetScrollTop ──────────────────────────────────────────────────────────

describe('targetScrollTop', () => {
  it('sums the section top and the within-section offset', () => {
    expect(targetScrollTop(1200, 340)).toBe(1540);
  });
  it('handles a section-start CFI (within = 0)', () => {
    expect(targetScrollTop(1200, 0)).toBe(1200);
  });
  it('clamps negative results to 0', () => {
    expect(targetScrollTop(-50, 10)).toBe(0);
  });
  it('coerces missing/NaN inputs to 0', () => {
    expect(targetScrollTop(undefined, undefined)).toBe(0);
    expect(targetScrollTop(NaN, 500)).toBe(500);
    expect(targetScrollTop(800, null)).toBe(800);
  });
});

// ─── displayTarget (paginated mode) ───────────────────────────────────────────

describe('displayTarget — paginated', () => {
  it('calls display once and schedules no retry on success', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, schedule });
    expect(display).toHaveBeenCalledTimes(1);
    expect(display).toHaveBeenCalledWith(CFI);
    expect(schedule.calls).toHaveLength(0);
  });

  it('schedules an error retry after the delay when display rejects', async () => {
    const display = vi.fn().mockRejectedValue(new Error('not loaded'));
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, schedule });
    expect(schedule.calls).toHaveLength(1);
    expect(schedule.calls[0].ms).toBe(800);
    await schedule.runAll();
    expect(display).toHaveBeenCalledTimes(2);
  });

  it('uses a custom errorDelay', async () => {
    const display = vi.fn().mockRejectedValue(new Error('fail'));
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, schedule, errorDelay: 1200 });
    expect(schedule.calls[0].ms).toBe(1200);
  });

  it('no-ops on empty target or non-function display', async () => {
    const schedule = makeSchedule();
    const display = vi.fn();
    await displayTarget({ display, target: '', schedule });
    expect(display).not.toHaveBeenCalled();
    await expect(
      displayTarget({ display: undefined, target: CFI, schedule })
    ).resolves.toBeUndefined();
  });
});

// ─── runScrollNav (continuous mode) ───────────────────────────────────────────

// scrollToTarget returns true once stable. `stableAfter` = how many snaps until
// it reports stable (simulating epub.js prepending more sections each frame).
function makeScrollHarness({ displayImpl, stableAfter = 1 } = {}) {
  const order = [];
  let snaps = 0;
  const display = vi.fn(() => { order.push('display'); return displayImpl ? displayImpl() : Promise.resolve(); });
  const scrollToTarget = vi.fn(() => { order.push('scroll'); snaps += 1; return snaps >= stableAfter; });
  const mask = vi.fn(() => order.push('mask'));
  const unmask = vi.fn(() => order.push('unmask'));
  const settle = vi.fn(() => { order.push('settle'); return Promise.resolve(); });
  const frame = vi.fn(() => { order.push('frame'); return Promise.resolve(); });
  return { order, display, scrollToTarget, mask, unmask, settle, frame };
}

describe('runScrollNav — continuous mode', () => {
  it('masks first, then display → settle → snap loop → unmask', async () => {
    const h = makeScrollHarness({ stableAfter: 1 });
    await runScrollNav(h);
    expect(h.order).toEqual([
      'mask', 'display', 'settle', 'scroll', 'frame', 'unmask',
    ]);
  });

  it('stops the convergence loop as soon as the position is stable', async () => {
    const h = makeScrollHarness({ stableAfter: 3 });
    await runScrollNav(h);
    expect(h.scrollToTarget).toHaveBeenCalledTimes(3);
  });

  it('caps the loop at maxSnaps when the position never stabilises', async () => {
    const h = makeScrollHarness({ stableAfter: 999 });
    await runScrollNav({ ...h, maxSnaps: 5 });
    expect(h.scrollToTarget).toHaveBeenCalledTimes(5);
    expect(h.unmask).toHaveBeenCalledTimes(1);
  });

  it('always unmasks even when display rejects', async () => {
    const h = makeScrollHarness({ displayImpl: () => Promise.reject(new Error('boom')) });
    await runScrollNav(h);
    expect(h.unmask).toHaveBeenCalledTimes(1);
    // failed display short-circuits the snap loop
    expect(h.scrollToTarget).not.toHaveBeenCalled();
  });

  it('unmasks even when a snap throws', async () => {
    const h = makeScrollHarness();
    h.scrollToTarget = vi.fn(() => { throw new Error('no view'); });
    await runScrollNav(h);
    expect(h.unmask).toHaveBeenCalledTimes(1);
  });

  it('no-ops (and does not mask) when display is not a function', async () => {
    const h = makeScrollHarness();
    await runScrollNav({ ...h, display: undefined });
    expect(h.mask).not.toHaveBeenCalled();
    expect(h.unmask).not.toHaveBeenCalled();
  });

  it('uses default settle/frame when not provided (resolves without throwing)', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const scrollToTarget = vi.fn(() => true); // stable immediately
    const mask = vi.fn();
    const unmask = vi.fn();
    await expect(
      runScrollNav({ display, scrollToTarget, mask, unmask })
    ).resolves.toBeUndefined();
    expect(unmask).toHaveBeenCalledTimes(1);
    expect(scrollToTarget).toHaveBeenCalledTimes(1);
  });
});
