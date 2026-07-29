// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initErrorTracking, captureError, setErrorUser } from './errorTracking.js';

// Without VITE_SENTRY_DSN (never set in tests or the E2E build) the module must
// be completely inert: no listeners, no dynamic import, no throws. This is the
// contract that keeps the test suites hermetic and the default bundle clean.
describe('errorTracking without a DSN', () => {
  it('initErrorTracking is a no-op (registers no global handlers)', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    expect(() => initErrorTracking()).not.toThrow();
    expect(spy.mock.calls.filter(([type]) => type === 'error' || type === 'unhandledrejection')).toHaveLength(0);
    spy.mockRestore();
  });

  it('captureError and setErrorUser never throw', () => {
    expect(() => captureError(new Error('boom'), { where: 'test' })).not.toThrow();
    expect(() => captureError(undefined)).not.toThrow();
    expect(() => setErrorUser('some-uuid')).not.toThrow();
    expect(() => setErrorUser(null)).not.toThrow();
  });
});
