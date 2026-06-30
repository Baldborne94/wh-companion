import { test, expect } from '@playwright/test';
import { mockAuth } from './helpers/auth.js';

// The Stats / Achievements modal (🏆 in the header) is the app's progress dashboard:
// reading, painting and Age of Sigmar tabs, each with stat boxes and an achievement
// grid. It opens over any section. The painting tab additionally queries the user's
// miniatures — mockAuth's `/rest/v1/**` → [] handler keeps that hermetic, so the tab
// renders its (empty) stats rather than hanging on the request.
//
// Tabs are matched by their exact emoji-prefixed names ("🎨 Painting", …) so the
// locators can't collide with the bottom-nav buttons (aria-label "Painting", …)
// that sit behind the modal.

test.describe('Stats & Achievements modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Achievements and stats' }).click();
  });

  test('opens from the header and shows the reading dashboard', async ({ page }) => {
    // Modal header.
    await expect(page.getByText('Deeds & Honour')).toBeVisible();

    // All three tabs are present.
    await expect(page.getByRole('button', { name: '📖 WH40K' })).toBeVisible();
    await expect(page.getByRole('button', { name: '🎨 Painting' })).toBeVisible();
    await expect(page.getByRole('button', { name: '⚡ Age of Sigmar' })).toBeVisible();

    // Reading is the default tab → its achievements grid renders.
    await expect(page.getByText(/Achievements — \d+\/\d+ Unlocked/)).toBeVisible();
  });

  test('switches between the reading, painting and AoS tabs', async ({ page }) => {
    // Painting tab → its miniatures query resolves (empty) and the painting-only
    // "armies built" hint renders.
    await page.getByRole('button', { name: '🎨 Painting' }).click();
    await expect(
      page.getByText(/Complete 5 minis of the same faction/)
    ).toBeVisible();

    // AoS tab → the painting-only hint is gone and an achievements grid is shown.
    await page.getByRole('button', { name: '⚡ Age of Sigmar' }).click();
    await expect(page.getByText(/Complete 5 minis of the same faction/)).toHaveCount(0);
    await expect(page.getByText(/Achievements — \d+\/\d+ Unlocked/)).toBeVisible();

    // Back to reading.
    await page.getByRole('button', { name: '📖 WH40K' }).click();
    await expect(page.getByText(/Complete 5 minis of the same faction/)).toHaveCount(0);
  });

  test('closes via the ✕ button', async ({ page }) => {
    const title = page.getByText('Deeds & Honour');
    await expect(title).toBeVisible();
    await page.getByRole('button', { name: 'Close stats' }).click();
    await expect(title).toHaveCount(0);
  });
});
