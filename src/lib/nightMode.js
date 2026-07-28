// App-wide "night mode" — a warm (amber) filter for the readers.
//
// The brightness veil each reader already has only DIMS the page. Dimming alone
// doesn't change the screen's colour temperature, and it's the blue component of
// the light (not raw brightness) that suppresses melatonin — so a dark theme at
// low brightness still emits plenty of blue. This veil is painted in `multiply`
// blend mode, so it genuinely attenuates the blue channel the way f.lux / Night
// Shift do, rather than just layering orange on top of the page.
//
// The flag lives inside the existing reader-settings blob (EpubReader owns the
// toggle UI) so there is a single source of truth; PdfReader reads it from here
// so the setting applies to both formats.

const SETTINGS_KEY = "wh40k_reader_v2";

// Amber multiplier. Under `multiply` each channel is scaled by value/255:
// red ×1.00 (untouched), green ×0.78, blue ×0.57 — a noticeable warm shift that
// still keeps text legible, roughly in the range of a phone's night-light preset.
export const WARM_TINT = "rgb(255, 199, 145)";

export function loadWarmFilter() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").warmFilter === true;
  } catch {
    return false;
  }
}
