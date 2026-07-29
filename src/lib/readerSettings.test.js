import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defaultTwoPage, loadReaderSettings, saveReaderSettings, DEFAULTS } from './readerSettings';

// Stand in for a device: a screen size plus whether the pointer is a finger.
// jsdom implements neither matchMedia nor a settable screen, so both are
// installed by hand (and restored in afterEach).
function device({ width, height, touch }) {
  setMatchMedia((q) => ({
    matches: q === '(pointer:coarse)' ? touch : false,
    media: q, addEventListener() {}, removeEventListener() {},
  }));
  Object.defineProperty(window, 'screen', { configurable: true, value: { width, height } });
}

const setMatchMedia = (impl) =>
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: impl });

const PHONE   = { width: 390, height: 844, touch: true };   // iPhone-class
const PHABLET = { width: 430, height: 932, touch: true };   // largest phones
const TABLET  = { width: 820, height: 1180, touch: true };  // iPad Air
const MINI    = { width: 744, height: 1133, touch: true };  // iPad mini
const DESKTOP = { width: 1920, height: 1080, touch: false };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('defaultTwoPage', () => {
  it('starts phones on a single page — they can never render a real spread', () => {
    device(PHONE);
    expect(defaultTwoPage()).toBe(false);
  });

  it('treats even the largest phones as phones (short side decides, not landscape width)', () => {
    device(PHABLET);
    expect(defaultTwoPage()).toBe(false);
  });

  it('keeps two pages on tablets', () => {
    device(TABLET);
    expect(defaultTwoPage()).toBe(true);
    device(MINI);
    expect(defaultTwoPage()).toBe(true);
  });

  it('keeps two pages on desktop, whatever the window size', () => {
    device(DESKTOP);
    expect(defaultTwoPage()).toBe(true);
  });

  it('does not treat a narrow desktop window as a phone — only touch devices qualify', () => {
    device({ width: 400, height: 700, touch: false });
    expect(defaultTwoPage()).toBe(true);
  });

  it('falls back to two pages when the environment tells us nothing', () => {
    setMatchMedia(() => { throw new Error('nope'); });
    expect(defaultTwoPage()).toBe(true);
  });
});

describe('loadReaderSettings', () => {
  it('applies the device default on first run', () => {
    device(PHONE);
    expect(loadReaderSettings().twoPage).toBe(false);
  });

  it('never overrides a choice the reader already made', () => {
    device(PHONE);
    saveReaderSettings({ ...DEFAULTS, twoPage: true });
    expect(loadReaderSettings().twoPage).toBe(true);
  });

  it('keeps a saved single-page choice on a tablet too', () => {
    device(TABLET);
    saveReaderSettings({ ...DEFAULTS, twoPage: false });
    expect(loadReaderSettings().twoPage).toBe(false);
  });

  it('fills in every other setting from the defaults', () => {
    device(DESKTOP);
    const s = loadReaderSettings();
    expect(s).toMatchObject({ fontSize: DEFAULTS.fontSize, themeId: DEFAULTS.themeId, paginate: true });
  });

  it('merges partial saved settings over the defaults', () => {
    device(DESKTOP);
    localStorage.setItem('wh40k_reader_v2', JSON.stringify({ fontSize: 26 }));
    const s = loadReaderSettings();
    expect(s.fontSize).toBe(26);
    expect(s.themeId).toBe(DEFAULTS.themeId);
  });

  it('survives a corrupted settings blob', () => {
    device(PHONE);
    localStorage.setItem('wh40k_reader_v2', '{not json');
    expect(loadReaderSettings().twoPage).toBe(false);
  });
});
