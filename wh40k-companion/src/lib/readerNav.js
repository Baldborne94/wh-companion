/**
 * Display a target (CFI or chapter href) reliably in both epub.js flows.
 *
 * Paginated flow ("default" manager) jumps to the target correctly on the first
 * `display()` call. The continuous flow ("continuous" manager, used for scroll
 * mode) renders the target section but lands short of the exact position until
 * that section has been laid out and measured — so we re-issue the display once
 * after the layout settles. On any failure we retry once after a longer delay,
 * regardless of flow.
 *
 * The scheduler and delays are injected so the orchestration can be unit-tested
 * without real timers or epub.js.
 *
 * @param {object}   args
 * @param {function} args.display    - calls epub.js display(target); returns a Promise (or anything)
 * @param {string}   args.target     - CFI string or chapter href
 * @param {boolean}  args.paginated  - true for pages mode, false for scroll/continuous
 * @param {function} [args.schedule] - (fn, ms) => void; defaults to setTimeout
 * @param {number}   [args.retryDelay] - ms to wait before the scroll-mode re-display
 * @param {number}   [args.errorDelay] - ms to wait before retrying after a failure
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
    .then(() => { if (!paginated) schedule(again, retryDelay); })
    .catch(() => { schedule(again, errorDelay); });
}
