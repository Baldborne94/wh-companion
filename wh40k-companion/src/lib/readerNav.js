/**
 * True when `target` is an epub.js CFI string (e.g. "epubcfi(/6/14!/4/2/1:0)")
 * rather than a chapter href ("chapter-3.xhtml" / "text/part7.html#sec2").
 */
export function isCfiTarget(target) {
  return typeof target === 'string' && /^epubcfi\(/i.test(target);
}

/**
 * Display a target (CFI or chapter href) reliably in both epub.js flows.
 *
 * Paginated flow ("default" manager) jumps to the target correctly on the first
 * `display()` call.
 *
 * Continuous flow ("continuous" manager, scroll mode) renders the target section
 * and scrolls to it, then `fill()` prepends the previous sections above it — which
 * shifts the scroll offset, so the first jump lands short. For a CFI target we
 * re-issue the display once after the layout settles: the second call takes
 * epub.js's "view already shown → moveTo(target)" path and corrects the offset.
 * Plain chapter hrefs are NOT re-issued: epub.js drops the move target when it
 * equals the section href, so a second href display just fights `fill()` and can
 * land at the wrong place. The caller converts chapter hrefs to a section-start
 * CFI so TOC navigation also rides the reliable CFI path.
 *
 * On any failure we retry once after a longer delay, regardless of flow/target.
 *
 * The scheduler and delays are injected so the orchestration can be unit-tested
 * without real timers or epub.js.
 *
 * @param {object}   args
 * @param {function} args.display    - calls epub.js display(target); returns a Promise (or anything)
 * @param {string}   args.target     - CFI string or chapter href
 * @param {boolean}  args.paginated  - true for pages mode, false for scroll/continuous
 * @param {function} [args.schedule] - (fn, ms) => void; defaults to setTimeout
 * @param {number}   [args.retryDelay] - ms before the scroll-mode CFI re-display
 * @param {number}   [args.errorDelay] - ms before retrying after a failure
 * @returns {Promise<void>}
 */
export function displayTarget({
  display,
  target,
  paginated,
  schedule = (fn, ms) => setTimeout(fn, ms),
  retryDelay = 400,
  errorDelay = 800,
}) {
  if (typeof display !== 'function' || !target) return Promise.resolve();
  const again = () => Promise.resolve(display(target)).catch(() => {});
  return Promise.resolve(display(target))
    .then(() => { if (!paginated && isCfiTarget(target)) schedule(again, retryDelay); })
    .catch(() => { schedule(again, errorDelay); });
}
