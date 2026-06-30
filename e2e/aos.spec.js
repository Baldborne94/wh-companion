import { test, expect } from '@playwright/test';
import { mockAuth } from './helpers/auth.js';

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
});
