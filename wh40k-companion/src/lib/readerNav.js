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
 * epub.js's continuous manager calls fill() after every display(), which
 * prepends adjacent sections and fires counter() for each one — counter()
 * calls scrollBy(0, sectionHeight), compensating the scroll offset so the
 * viewport stays on the requested position. A second display() call would
 * trigger another fill()+counter() cycle, overshooting the position and
 * causing a visible jump ("flicker to another area"). So on success we do
 * NOT re-issue display; the fill()/counter() mechanism is self-correcting.
 *
 * On any failure we retry once after a longer delay, regardless of flow/target.
 *
 * The scheduler and errorDelay are injected so the orchestration can be
 * unit-tested without real timers or epub.js.
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
  return Promise.resolve(display(target))
    .catch(() => { schedule(again, errorDelay); });
}
