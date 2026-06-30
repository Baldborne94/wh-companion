// Auth mock for E2E. The app gates everything behind a Supabase session that
// `supabase.auth.getSession()` reads from localStorage, so we (a) seed a fake,
// far-future session under the derived storage key and (b) intercept every
// Supabase network call — auth token refreshes and REST reads — so no real
// backend or Google OAuth is ever touched. Data endpoints return empty sets;
// the app's UI (catalogue, lore, nav) is driven by static bundled data, so an
// authenticated shell renders fully without a live database.
//
// Storage key: supabase-js derives `sb-<subdomain>-auth-token` from the URL
// host. The E2E build uses https://e2e.placeholder.supabase.co → `sb-e2e-…`.

const UID = '00000000-0000-0000-0000-000000000001';
const FAR_FUTURE = 4102444800; // 2100-01-01, in seconds

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

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
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SESSION),
    })
  );

  // REST reads/writes → empty result sets; UI runs off static bundled data.
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.addInitScript(
    ({ session, seed }) => {
      localStorage.setItem('sb-e2e-auth-token', JSON.stringify(session));
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

export { UID };
