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
const DUMMY_ENV =
  `VITE_SUPABASE_URL=${ORIGIN} ` +
  'VITE_SUPABASE_ANON_KEY=e2e-anon-key';

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
    },
  ],
  webServer: {
    command: `${DUMMY_ENV} npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
