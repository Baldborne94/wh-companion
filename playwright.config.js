import { defineConfig, devices } from '@playwright/test';

// E2E config. The app boots only when Supabase env vars are present (supabase-js
// throws on an empty URL), so the build/preview server is fed dummy credentials —
// enough to render the pre-auth LoginPage. We never exercise real Google OAuth.
const PORT = 4173;
const DUMMY_ENV =
  'VITE_SUPABASE_URL=https://e2e.placeholder.supabase.co ' +
  'VITE_SUPABASE_ANON_KEY=e2e-anon-key';

// Use the browser pre-installed in the web environment when present; otherwise let
// Playwright resolve its own download (e.g. CI after `playwright install chromium`).
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
import { existsSync } from 'node:fs';
const executablePath = existsSync(PINNED_CHROMIUM) ? PINNED_CHROMIUM : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `${DUMMY_ENV} npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
