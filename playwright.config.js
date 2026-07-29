import { defineConfig, devices } from '@playwright/test';

// E2E config. The app boots only when Supabase env vars are present (supabase-js
// throws on an empty URL), so the build/preview server is fed dummy credentials —
// enough to render the pre-auth LoginPage. We never exercise real Google OAuth.
//
// VITE_SUPABASE_URL points at the preview server's OWN origin: every Supabase
// call then becomes same-origin, so route interception catches it with no CORS
// preflight (the app's sb.js sends Content-Type: application/json on GETs, which
// would otherwise force a cross-origin preflight that doesn't survive mocking).
const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
// VITE_GOOGLE_CLIENT_ID is set so the Music section renders its real YouTube
// flow (a missing id short-circuits to a "not configured" placeholder). No real
// OAuth runs — the music spec seeds a fake yt_token and mocks the googleapis +
// embed endpoints.
const DUMMY_ENV =
  `VITE_SUPABASE_URL=${ORIGIN} ` +
  'VITE_SUPABASE_ANON_KEY=e2e-anon-key ' +
  'VITE_GOOGLE_CLIENT_ID=e2e-google-client-id';

// Use the browser pre-installed in the web environment when present; otherwise let
// Playwright resolve its own download (e.g. CI after `playwright install chromium`).
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
import { existsSync } from 'node:fs';
const executablePath = existsSync(PINNED_CHROMIUM) ? PINNED_CHROMIUM : undefined;

export default defineConfig({
  testDir: './e2e',
  // Run serially. The reader specs each spin up an epubjs render, and several
  // running at once against the single preview server starve each other past the
  // assertion timeout (verified: parallel ~4/8, serial 8/8). The suite is small,
  // so determinism beats the few seconds parallelism would save.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath },
      },
      // Phone-shaped assertions belong to the mobile project below; everything
      // else runs on the desktop viewport.
      testIgnore: '**/mobile.spec.js',
    },
    {
      // The app is used mostly on a phone, where the layout rules differ enough
      // to break on their own: touch starts the reader chrome hidden, two-page
      // is off by default, and anything wider than the viewport shows up as a
      // horizontally scrolling page. A desktop-only suite can't see any of it.
      // Scoped to mobile.spec.js so CI stays fast — the rest of the behaviour is
      // viewport-independent and already covered once.
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        launchOptions: { executablePath },
      },
      testMatch: '**/mobile.spec.js',
    },
  ],
  webServer: {
    command: `${DUMMY_ENV} npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
