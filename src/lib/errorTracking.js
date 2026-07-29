// Error tracking (Sentry) — errors-only, lazy-loaded, and fully inert unless a
// DSN is configured.
//
// Every production bug so far has arrived as a user screenshot (the drifted
// ebook_files constraint, wrong covers, the phone fullscreen layout). This
// captures those same failures with a real stack trace, device and app version
// attached, without waiting for a report.
//
// Design constraints:
// - No VITE_SENTRY_DSN → nothing is imported, nothing runs, zero bytes on the
//   wire. The E2E build sets no DSN, so the suite stays hermetic by default.
// - The SDK chunk is dynamically imported after boot (on idle) so it never
//   weighs down the initial bundle. Errors thrown before the import resolves
//   are queued by our own early window handlers and flushed after init.
// - Errors only: no performance tracing, no session replay, no PII beyond the
//   pseudonymous Supabase user id (needed to answer "how many users hit this").

const DSN = import.meta.env.VITE_SENTRY_DSN;

let sentry = null;          // module namespace once loaded
let pendingErrors = [];     // captured before the SDK finished loading
let pendingUser = null;

// Noise that would drown the signal on flaky mobile networks / browser quirks.
const IGNORE = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "AbortError",
];

/**
 * Report a handled error with optional context, e.g.
 *   captureError(err, { where: "ebook-upload", bookId })
 * Safe to call any time: before init it queues, without a DSN it's a no-op
 * (call sites keep their own console.error / user-facing message).
 */
export function captureError(error, context) {
  if (!DSN) return;
  const entry = { error, context };
  if (sentry) send(entry);
  else pendingErrors.push(entry);
}

/** Attach the pseudonymous user id to future events (pass null on logout). */
export function setErrorUser(userId) {
  if (!DSN) return;
  pendingUser = userId ? { id: userId } : null;
  if (sentry) sentry.setUser(pendingUser);
}

function send({ error, context }) {
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch { /* never let telemetry break the app */ }
}

export function initErrorTracking() {
  if (!DSN || sentry) return;

  // Catch errors that happen before the lazy SDK lands; Sentry's own global
  // handlers take over after init (these queue into the same flush).
  const onError = (e) => { if (e?.error) pendingErrors.push({ error: e.error }); };
  const onRejection = (e) => { if (e?.reason) pendingErrors.push({ error: e.reason }); };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const load = () =>
    import("@sentry/browser")
      .then((Sentry) => {
        Sentry.init({
          dsn: DSN,
          release: __APP_RELEASE__,
          environment: import.meta.env.MODE,
          ignoreErrors: IGNORE,
          sendDefaultPii: false,
        });
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        sentry = Sentry;
        if (pendingUser) Sentry.setUser(pendingUser);
        pendingErrors.forEach(send);
        pendingErrors = [];
      })
      .catch(() => { /* SDK unreachable (offline first load) — stay silent */ });

  if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 2000);
}
