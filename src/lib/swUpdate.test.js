import { describe, it, expect, vi, beforeEach } from 'vitest';

// The virtual module is provided by vite-plugin-pwa at build time; in tests we
// stand in for it so we can drive the update lifecycle by hand.
const updateSW = vi.fn();
let registerOpts = null;
vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts) => { registerOpts = opts; return updateSW; },
}));

import { initSWUpdate, onUpdateReady, isUpdateReady, applyUpdate, __resetSWUpdate } from './swUpdate';

// Pretend a new build finished installing and is now waiting.
const anUpdateArrives = () => registerOpts.onNeedRefresh();

beforeEach(() => {
  __resetSWUpdate();
  updateSW.mockClear();
  registerOpts = null;
  // jsdom has no service worker; the module no-ops without one.
  if (!('serviceWorker' in navigator))
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
});

describe('swUpdate', () => {
  it('registers eagerly so the worker is live from first paint', () => {
    initSWUpdate();
    expect(registerOpts.immediate).toBe(true);
  });

  it('reports no update until one actually arrives', () => {
    initSWUpdate();
    expect(isUpdateReady()).toBe(false);
    anUpdateArrives();
    expect(isUpdateReady()).toBe(true);
  });

  it('notifies subscribers when an update starts waiting', () => {
    initSWUpdate();
    const seen = vi.fn();
    onUpdateReady(seen);
    expect(seen).not.toHaveBeenCalled();
    anUpdateArrives();
    expect(seen).toHaveBeenCalledWith(true);
  });

  it('tells a late subscriber about an update that is already waiting', () => {
    initSWUpdate();
    anUpdateArrives();
    const seen = vi.fn();
    onUpdateReady(seen);
    expect(seen).toHaveBeenCalledWith(true);
  });

  it('stops notifying after unsubscribe', () => {
    initSWUpdate();
    const seen = vi.fn();
    onUpdateReady(seen)();
    anUpdateArrives();
    expect(seen).not.toHaveBeenCalled();
  });

  it('keeps notifying the other subscribers when one throws', () => {
    initSWUpdate();
    const good = vi.fn();
    onUpdateReady(() => { throw new Error('boom'); });
    onUpdateReady(good);
    expect(() => anUpdateArrives()).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('does nothing when asked to apply an update that is not there', () => {
    initSWUpdate();
    expect(applyUpdate()).toBe(false);
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('hands over to the waiting worker and reloads on apply', () => {
    initSWUpdate();
    anUpdateArrives();
    expect(applyUpdate()).toBe(true);
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('polls for a new build when the app returns to the foreground', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    initSWUpdate();
    registerOpts.onRegisteredSW('/sw.js', { update });

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does not poll while the app is hidden', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    initSWUpdate();
    registerOpts.onRegisteredSW('/sw.js', { update });

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).not.toHaveBeenCalled();
  });

  it('survives a registration that never materialised', () => {
    initSWUpdate();
    expect(() => registerOpts.onRegisteredSW('/sw.js', undefined)).not.toThrow();
  });
});
