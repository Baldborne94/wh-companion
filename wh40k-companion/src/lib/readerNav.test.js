import { describe, it, expect, vi } from 'vitest';
import { displayTarget, isCfiTarget } from './readerNav.js';

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

// ─── pages (paginated) mode ───────────────────────────────────────────────────

describe('displayTarget — pages (paginated) mode', () => {
  it('calls display exactly once and schedules no retry on success (CFI)', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: true, schedule });
    expect(display).toHaveBeenCalledTimes(1);
    expect(display).toHaveBeenCalledWith(CFI);
    expect(schedule.calls).toHaveLength(0);
  });

  it('calls display once and schedules no retry on success (href)', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: HREF, paginated: true, schedule });
    expect(display).toHaveBeenCalledTimes(1);
    expect(schedule.calls).toHaveLength(0);
  });
});

// ─── scroll (continuous) mode ─────────────────────────────────────────────────

describe('displayTarget — scroll (continuous) mode, CFI target', () => {
  it('schedules a re-display after the layout settles', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule });
    expect(display).toHaveBeenCalledTimes(1);
    expect(schedule.calls).toHaveLength(1);
    expect(schedule.calls[0].ms).toBe(400);
  });

  it('the scheduled retry re-issues display with the same CFI', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule });
    await schedule.runAll();
    expect(display).toHaveBeenCalledTimes(2);
    expect(display).toHaveBeenNthCalledWith(2, CFI);
  });

  it('a section-start CFI (converted from a TOC href) also gets the retry', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: SECTION_CFI, paginated: false, schedule });
    expect(schedule.calls).toHaveLength(1);
    expect(schedule.calls[0].ms).toBe(400);
  });

  it('uses a custom retryDelay when provided', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule, retryDelay: 250 });
    expect(schedule.calls[0].ms).toBe(250);
  });
});

describe('displayTarget — scroll (continuous) mode, href target', () => {
  it('does NOT re-issue a raw href on success (would fight fill())', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: HREF, paginated: false, schedule });
    expect(display).toHaveBeenCalledTimes(1);
    expect(schedule.calls).toHaveLength(0);
  });
});

// ─── failure handling ─────────────────────────────────────────────────────────

describe('displayTarget — failure handling', () => {
  it('schedules an error retry after the longer delay when a CFI display rejects', async () => {
    const display = vi.fn().mockRejectedValue(new Error('section not loaded'));
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule });
    expect(schedule.calls).toHaveLength(1);
    expect(schedule.calls[0].ms).toBe(800);
  });

  it('error retry fires for an href too (first display rejected)', async () => {
    const display = vi.fn().mockRejectedValue(new Error('fail'));
    const schedule = makeSchedule();
    await displayTarget({ display, target: HREF, paginated: false, schedule });
    expect(schedule.calls).toHaveLength(1);
    expect(schedule.calls[0].ms).toBe(800);
  });

  it('error retry fires in pages mode too', async () => {
    const display = vi.fn().mockRejectedValue(new Error('fail'));
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: true, schedule });
    expect(schedule.calls).toHaveLength(1);
    expect(schedule.calls[0].ms).toBe(800);
  });

  it('a retry that also rejects does not throw (swallowed)', async () => {
    const display = vi.fn().mockRejectedValue(new Error('still failing'));
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule });
    await expect(schedule.runAll()).resolves.toBeUndefined();
    expect(display).toHaveBeenCalledTimes(2);
  });

  it('uses a custom errorDelay when provided', async () => {
    const display = vi.fn().mockRejectedValue(new Error('fail'));
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule, errorDelay: 1200 });
    expect(schedule.calls[0].ms).toBe(1200);
  });
});

// ─── guards ───────────────────────────────────────────────────────────────────

describe('displayTarget — guards', () => {
  it('no-ops when target is empty', async () => {
    const display = vi.fn();
    const schedule = makeSchedule();
    await displayTarget({ display, target: '', paginated: false, schedule });
    expect(display).not.toHaveBeenCalled();
    expect(schedule.calls).toHaveLength(0);
  });

  it('no-ops when target is null', async () => {
    const display = vi.fn();
    const schedule = makeSchedule();
    await displayTarget({ display, target: null, paginated: false, schedule });
    expect(display).not.toHaveBeenCalled();
  });

  it('no-ops when display is not a function', async () => {
    const schedule = makeSchedule();
    await expect(
      displayTarget({ display: undefined, target: CFI, paginated: false, schedule })
    ).resolves.toBeUndefined();
    expect(schedule.calls).toHaveLength(0);
  });

  it('tolerates a synchronous (non-promise) display return value', async () => {
    const display = vi.fn().mockReturnValue(undefined); // display() returns void
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule });
    expect(display).toHaveBeenCalledTimes(1);
    expect(schedule.calls).toHaveLength(1);
  });
});
