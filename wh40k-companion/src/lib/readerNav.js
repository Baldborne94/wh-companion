/**
 * True when `target` is an epub.js CFI string (e.g. "epubcfi(/6/14!/4/2/1:0)")
 * rather than a chapter href ("chapter-3.xhtml" / "text/part7.html#sec2").
 */
export function isCfiTarget(target) {
  return typeof target === 'string' && /^epubcfi\(/i.test(target);
}

/**
 * Absolute scroll offset of a CFI inside the continuous scroll container:
 * the target section's top within the container (`base`) plus the CFI's offset
 * within that section (`within`). Clamped at 0. Pure so it can be unit-tested.
 */
export function targetScrollTop(base, within) {
  return Math.max(0, (Number(base) || 0) + (Number(within) || 0));
}

/**
 * Display a target reliably in PAGINATED mode. One `display()` lands correctly;
 * on failure we retry once after a delay. (Scroll mode uses `runScrollNav`.)
 *
 * @param {object}   args
 * @param {function} args.display    - calls epub.js display(target); returns a Promise (or anything)
 * @param {string}   args.target     - CFI string or chapter href
 * @param {function} [args.schedule] - (fn, ms) => void; defaults to setTimeout
 * @param {number}   [args.errorDelay] - ms before retrying after a failure
 * @returns {Promise<void>}
 */
export function displayTarget({
  display,
  target,
  schedule = (fn, ms) => setTimeout(fn, ms),
  errorDelay = 800,
}) {
  if (typeof display !== 'function' || !target) return Promise.resolve();
  const again = () => Promise.resolve(display(target)).catch(() => {});
  return Promise.resolve(display(target)).catch(() => { schedule(again, errorDelay); });
}

/**
 * Navigate reliably in SCROLL / continuous mode.
 *
 * epub.js's continuous manager runs `fill()` after every `display()`, prepending
 * the earlier sections above the target. That shifts the scroll offset, and its
 * `counter()` compensation is racy — the chapter lands, then visibly drifts away.
 *
 * Instead of fighting it with re-displays (which trigger more `fill()` cycles and
 * flicker), we mask the viewport, let `display()` + `fill()` fully settle, then
 * snap the scroll container straight to the target's exact offset (authoritative,
 * independent of `counter()`), and only then reveal. The snap runs twice — once
 * after the settle delay and once after a couple animation frames — to absorb a
 * late resize. `unmask` always runs, even on failure, so the viewport is never
 * left hidden.
 *
 * All side effects are injected so the orchestration is unit-testable without
 * epub.js, real timers, or a real DOM.
 *
 * @param {object}   args
 * @param {function} args.display        - () => Promise; epub.js display(cfi)
 * @param {function} args.scrollToTarget - () => void; snap scroll to the cfi offset
 * @param {function} args.mask           - () => void; hide the viewport
 * @param {function} args.unmask         - () => void; reveal the viewport
 * @param {function} [args.settle]       - () => Promise; wait for fill() to settle
 * @param {function} [args.frame]        - () => Promise; wait a couple animation frames
 * @returns {Promise<void>}
 */
export function runScrollNav({
  display,
  scrollToTarget,
  mask,
  unmask,
  settle = () => new Promise((r) => setTimeout(r, 60)),
  frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
}) {
  if (typeof display !== 'function') return Promise.resolve();
  mask?.();
  return Promise.resolve(display())
    .then(() => settle())
    .then(() => { scrollToTarget?.(); return frame(); })
    .then(() => { scrollToTarget?.(); })
    .catch(() => {})
    .finally(() => { unmask?.(); });
}
