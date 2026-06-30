import { test, expect } from '@playwright/test';
import { mockAuth } from './helpers/auth.js';

// End-to-end coverage of the authenticated shell, reached with a mocked Supabase
// session (no real Google OAuth). This exercises what the pre-auth login smoke
// test cannot: the app actually transitions past login, mounts the universe
// selector, and renders the full navigable shell with all six sections.

test.describe('Authenticated shell', () => {
  test('signed-in user picks a universe and lands on the navigable shell', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/');

    // Past login → the universe selector (a screen only an authed user sees).
    await expect(page.getByText('Select Your Universe')).toBeVisible();

    // Choose Warhammer 40,000 via that panel's ENTER button.
    await page
      .locator('.us-panel-40k')
      .getByRole('button', { name: 'ENTER', exact: true })
      .click();

    // The main shell: bottom nav with all sections. 40K shows the "Crusade" tab.
    // `exact` matters: an empty shelf renders a "Go to Library →" button on Home,
    // so a substring match on "Library" would resolve to two elements.
    await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crusade', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Painting', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Music', exact: true })).toBeVisible();

    // We open on Home — its nav button is the current page.
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('bottom nav switches sections', async ({ page }) => {
    // Seed the universe so we land straight in the shell, isolating navigation.
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await page.goto('/');

    const lore = page.getByRole('button', { name: 'Lore', exact: true });
    const library = page.getByRole('button', { name: 'Library', exact: true });

    await expect(lore).toBeVisible();

    // Tap Lore → it becomes the active section.
    await lore.click();
    await expect(lore).toHaveAttribute('aria-current', 'page');
    await expect(library).not.toHaveAttribute('aria-current', 'page');

    // Tap Library → focus moves there.
    await library.click();
    await expect(library).toHaveAttribute('aria-current', 'page');
    await expect(lore).not.toHaveAttribute('aria-current', 'page');
  });
});
