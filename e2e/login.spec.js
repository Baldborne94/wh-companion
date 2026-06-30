import { test, expect } from '@playwright/test';

// First end-to-end smoke: the real app, built and served, opens on the pre-auth
// LoginPage in a real browser. This covers what jsdom component tests cannot — that
// the app shell actually boots, mounts, and renders without crashing on load.
//
// Everything here is pre-authentication: no Google OAuth is triggered. We assert the
// landing chrome (title, tagline, sign-in CTA) and the EN/IT language toggle, which is
// the one piece of interactive behaviour available before signing in.

test.describe('Login page (pre-auth)', () => {
  test('boots and renders the landing screen', async ({ page }) => {
    await page.goto('/');

    // Title + brand subtitle prove the app mounted, not a blank/error screen.
    await expect(page.getByRole('heading', { name: 'WARHAMMER' })).toBeVisible();
    await expect(page.getByText('COMPANION', { exact: true })).toBeVisible();

    // Both universe badge pills are present on the landing screen.
    await expect(page.getByText('40,000', { exact: true })).toBeVisible();
    await expect(page.getByText('Age of Sigmar', { exact: true })).toBeVisible();

    // The sign-in CTA is the gate to everything else.
    await expect(
      page.getByRole('button', { name: /sign in with google/i })
    ).toBeVisible();

    // English is the default language → English tagline.
    await expect(
      page.getByText('Library, campaigns and progress — all synced.')
    ).toBeVisible();
  });

  test('language toggle switches the UI to Italian and back', async ({ page }) => {
    await page.goto('/');

    const tagline = page.getByText('Library, campaigns and progress — all synced.');
    await expect(tagline).toBeVisible();

    // Switch to Italian: tagline and CTA localize.
    await page.getByRole('button', { name: 'IT', exact: true }).click();
    await expect(
      page.getByText('Biblioteca, campagne e progressi — tutto sincronizzato.')
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /accedi con google/i })
    ).toBeVisible();
    await expect(tagline).toHaveCount(0);

    // Switch back to English.
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(tagline).toBeVisible();
  });
});
