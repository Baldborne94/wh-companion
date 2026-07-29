// Reader settings: defaults, persistence, and the layout thresholds the
// defaults depend on. Lives outside EpubReader so the first-run rules can be
// reasoned about (and tested) without loading epub.js.

const SETTINGS_KEY = "wh40k_reader_v2";

// Width (px) at which epub.js's spread:"auto" actually renders two columns side
// by side instead of one. The reader's resize observer measures against this
// too, so the decorative "open book" spine/page-edges only show when epub.js
// truly split into two pages — a landscape-orientation guess isn't enough: many
// phones' landscape width falls under this, so epub.js silently renders a
// single column while a landscape-only check would still draw the artwork.
export const MIN_SPREAD_WIDTH = 820;

// Short side (px) below which a touch device is a phone rather than a tablet.
// Matches the threshold index.html uses to decide whether to apply tablet zoom.
export const PHONE_MAX_SHORT_SIDE = 520;

export const DEFAULTS = {
  fontIndex: 0, fontSize: 18, lineHeight: 1.8, paginate: true, twoPage: true,
  themeId: "sepia", margin: 1, brightness: 100, showLore: true, warmFilter: false,
};

// Two pages is a tablet/desktop default, not a universal one. A phone held
// upright is far too narrow to spread, so epub.js quietly renders ONE column
// while the setting still reads "Two page"; turned sideways, the columns that
// do fit are a few words wide. Devices that can't make a spread look like a
// book therefore start on single page — the chip is still there for anyone who
// wants it.
export function defaultTwoPage() {
  try {
    const coarse = window.matchMedia?.("(pointer:coarse)").matches;
    const w = window.screen?.width  || window.innerWidth;
    const h = window.screen?.height || window.innerHeight;
    return !(coarse && Math.min(w, h) < PHONE_MAX_SHORT_SIDE);
  } catch { return true; }
}

// Saved preferences always win over the device-derived defaults, so the
// first-run rule above can never overwrite a choice the reader already made.
export function loadReaderSettings() {
  const def = { ...DEFAULTS, twoPage: defaultTwoPage() };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch { return def; }
}

export function saveReaderSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}
