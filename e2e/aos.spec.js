import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mockAuth, mockReaderBook } from './helpers/auth.js';
import { expectTextInAnyFrame } from './helpers/reader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EPUB = readFileSync(resolve(__dirname, 'fixtures/test-book.epub'));
const CH1 = 'In the grim darkness of the far future there is only war.';

// Age of Sigmar is the app's entire second universe (AoSHomePage / AoSLibrarySection
// / AoSCrusadeSection, lazy-loaded). These tests prove that branch mounts: selecting
// AoS lands on its home shell, the nav relabels "Crusade" → "Path to Glory", and the
// Path to Glory section renders.

test.describe('Age of Sigmar universe', () => {
  test('selects Age of Sigmar and lands on its home shell', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/');

    await expect(page.getByText('Select Your Universe')).toBeVisible();

    // Choose Age of Sigmar via that panel's ENTER button.
    await page
      .locator('.us-panel-aos')
      .getByRole('button', { name: 'ENTER', exact: true })
      .click();

    // AoS shell: the reading tab is relabelled "Path to Glory", and the AoS home
    // shows its newcomer call-to-action.
    await expect(page.getByRole('button', { name: 'Path to Glory' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/New to Age of Sigmar\?/)).toBeVisible({ timeout: 15000 });

    // The 40K-only "Crusade" tab is absent in this universe.
    await expect(page.getByRole('button', { name: 'Crusade', exact: true })).toHaveCount(0);
  });

  test('opens the Path to Glory section', async ({ page }) => {
    await mockAuth(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await page.goto('/');

    const pathToGlory = page.getByRole('button', { name: 'Path to Glory' });
    await expect(pathToGlory).toBeVisible({ timeout: 15000 });

    await pathToGlory.click();
    await expect(pathToGlory).toHaveAttribute('aria-current', 'page');

    // AoSCrusadeSection rendered → its Overview tab is present.
    await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('AoS library uses the shared BookDetail and opens through the App reader', async ({ page }) => {
    // The AoS universe used to duplicate BookDetail AND mount its own reader
    // (signed-URL open, no offline cache, no auto-mark-read). It now renders the
    // shared BookDetail — asserted via Personal Notes, a section the old AoS
    // detail never had — and opens books through App's single reader mount.
    await mockAuth(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await mockReaderBook(page, { bookId: 'aos1', epubBuffer: EPUB });
    await page.goto('/');
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByPlaceholder(/Search titles/).fill('The Gates of Azyr');
    await page.getByText('The Gates of Azyr', { exact: true }).first().click();

    await expect(page.getByRole('heading', { name: 'The Gates of Azyr' })).toBeVisible();
    await expect(page.getByText('Personal Notes')).toBeVisible();

    // Open the book — resolved via resolveBookUrl (offline-cached bytes), rendered
    // by App's reader; closing returns to this same detail page.
    await page.getByRole('button', { name: /Start Reading/ }).click();
    await expectTextInAnyFrame(page, CH1);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'The Gates of Azyr' })).toBeVisible();
  });
});
