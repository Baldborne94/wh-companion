import { describe, it, expect, vi } from 'vitest';
import { displayTarget } from './readerNav.js';

const CFI = 'epubcfi(/6/14!/4/2/2/1:0)';
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

describe('displayTarget — pages (paginated) mode', () => {
  it('calls display exactly once and schedules no retry on success', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: true, schedule });
    expect(display).toHaveBeenCalledTimes(1);
    expect(display).toHaveBeenCalledWith(CFI);
    expect(schedule.calls).toHaveLength(0);
  });
});

describe('displayTarget — scroll (continuous) mode', () => {
  it('schedules a re-display after the layout settles', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule });
    expect(display).toHaveBeenCalledTimes(1);
    expect(schedule.calls).toHaveLength(1);
    expect(schedule.calls[0].ms).toBe(400);
  });

  it('the scheduled retry re-issues display with the same target', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule });
    await schedule.runAll();
    expect(display).toHaveBeenCalledTimes(2);
    expect(display).toHaveBeenNthCalledWith(2, CFI);
  });

  it('uses a custom retryDelay when provided', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule, retryDelay: 250 });
    expect(schedule.calls[0].ms).toBe(250);
  });

  it('works with a chapter href target (TOC navigation)', async () => {
    const display = vi.fn().mockResolvedValue(undefined);
    const schedule = makeSchedule();
    await displayTarget({ display, target: HREF, paginated: false, schedule });
    await schedule.runAll();
    expect(display).toHaveBeenNthCalledWith(1, HREF);
    expect(display).toHaveBeenNthCalledWith(2, HREF);
  });
});

describe('displayTarget — failure handling', () => {
  it('schedules an error retry after the longer delay when display rejects', async () => {
    const display = vi.fn().mockRejectedValue(new Error('section not loaded'));
    const schedule = makeSchedule();
    await displayTarget({ display, target: CFI, paginated: false, schedule });
    expect(schedule.calls).toHaveLength(1);
    expect(schedule.calls[0].ms).toBe(800);
  });

  it('error retry fires once in pages mode too (first display rejected)', async () => {
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
