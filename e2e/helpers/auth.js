// Auth mock for E2E. The app gates everything behind a Supabase session that
// `supabase.auth.getSession()` reads from localStorage, so we (a) seed a fake,
// far-future session under the derived storage key and (b) intercept every
// Supabase network call — auth token refreshes and REST reads — so no real
// backend or Google OAuth is ever touched. Data endpoints return empty sets;
// the app's UI (catalogue, lore, nav) is driven by static bundled data, so an
// authenticated shell renders fully without a live database.
//
// Storage key: supabase-js derives `sb-<host-first-label>-auth-token` from the
// URL host. The E2E build points VITE_SUPABASE_URL at http://localhost:4173
// (same-origin, to avoid CORS) → host `localhost` → `sb-localhost-auth-token`.

const UID = '00000000-0000-0000-0000-000000000001';
const FAR_FUTURE = 4102444800; // 2100-01-01, in seconds

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

// Mocked responses are cross-origin (localhost → *.supabase.co), so every
// fulfilled response needs CORS headers and every preflight OPTIONS must be
// answered — otherwise the browser blocks the body with ERR_FAILED.
const CORS = { 'access-control-allow-origin': '*' };

// Answer a CORS preflight; returns true if it handled the request. We reflect the
// requested headers rather than using `*`, because the wildcard does NOT cover
// `Authorization` per the Fetch spec — and sb.js sends an Authorization header.
function handledPreflight(route) {
  if (route.request().method() !== 'OPTIONS') return false;
  const reqHeaders = route.request().headers();
  route.fulfill({
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers':
        reqHeaders['access-control-request-headers'] || '*',
      'access-control-max-age': '86400',
    },
    body: '',
  });
  return true;
}

function fulfillJson(route, data) {
  if (handledPreflight(route)) return;
  route.fulfill({
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function fulfillBytes(route, buffer, contentType) {
  if (handledPreflight(route)) return;
  route.fulfill({
    status: 200,
    headers: { ...CORS, 'content-type': contentType },
    body: buffer,
  });
}

// A structurally-valid (unsigned) JWT — getSession does not verify the signature,
// it only reads expiry, and we pin expires_at on the session anyway.
const ACCESS_TOKEN = [
  b64url({ alg: 'HS256', typ: 'JWT' }),
  b64url({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: FAR_FUTURE }),
  'e2e-signature',
].join('.');

const SESSION = {
  access_token: ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: FAR_FUTURE,
  refresh_token: 'e2e-refresh-token',
  user: {
    id: UID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'tester@example.com',
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'E2E Tester' },
    created_at: '2024-01-01T00:00:00.000Z',
  },
};

/**
 * Make the app think a Google-authenticated user is signed in.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.seedLocalStorage] extra localStorage keys
 *        to set before the app boots (e.g. `wh_universe` to skip the selector).
 */
export async function mockAuth(page, { seedLocalStorage = {} } = {}) {
  // Auth endpoints (refresh, user) → always hand back the fake session.
  await page.route('**/auth/v1/**', (route) =>
    fulfillJson(route, SESSION)
  );

  // REST reads/writes → empty result sets; UI runs off static bundled data.
  await page.route('**/rest/v1/**', (route) => fulfillJson(route, []));

  await page.addInitScript(
    ({ session, seed }) => {
      localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session));
      // Skip first-run overlays that would otherwise cover the shell.
      localStorage.setItem('wh40k_onboarding_done', '1');
      localStorage.setItem('wh40k_releases_reminder', String(Date.now()));
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);

      // Kill CSS transitions/animations so hover-driven layout shifts (e.g. the
      // universe-selector panels expanding on hover) can't move a target mid-click.
      const style = document.createElement('style');
      style.textContent =
        '*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;animation-delay:0s!important;}';
      document.documentElement.appendChild(style);
    },
    { session: SESSION, seed: seedLocalStorage }
  );
}

/**
 * Make one catalogue book openable in the reader: the app queries `ebook_files`
 * to learn a book has an uploaded file, then downloads the bytes from storage.
 * Call AFTER mockAuth so these specific routes take precedence over its generic
 * `/rest/v1/**` → [] handler (Playwright matches the last-registered route first).
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {number|string} opts.bookId  catalogue id to make openable
 * @param {Buffer} opts.epubBuffer     raw EPUB bytes to serve as the download
 */
export async function mockReaderBook(page, { bookId, epubBuffer }) {
  const filePath = `${UID}/${bookId}/test-book.epub`;
  const row = {
    user_id: UID,
    book_id: bookId,
    file_path: filePath,
    file_type: 'epub',
    file_name: 'test-book.epub',
  };

  // The app reads ebook_files via both the JS client (select=book_id) and a raw
  // REST fetch (resolveBookUrl); one row covers both.
  await page.route('**/rest/v1/ebook_files**', (route) => fulfillJson(route, [row]));

  // The actual file download — hand back the EPUB bytes.
  await page.route('**/storage/v1/object/ebooks/**', (route) =>
    fulfillBytes(route, epubBuffer, 'application/epub+zip')
  );
}

export { UID };
