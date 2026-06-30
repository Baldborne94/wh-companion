import { test, expect } from '@playwright/test';
import { mockAuth, mockPaintAdvisor } from './helpers/auth.js';

// The Painting Tracker is the hobby module: a Community Gallery, a localStorage-backed
// "My Army" planner, and a Supabase-backed "My Collection". mockAuth's `/rest/v1/**`
// → [] keeps the gallery/collection queries hermetic (they resolve empty rather than
// hang). The Add modal hosts the AI Color Advisor, which posts to the serverless
// proxy `/api/paint-advisor` — mockPaintAdvisor stands in for it.

const gotoPainting = async (page) => {
  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Painting', exact: true }).click();
};

test.describe('Painting Tracker', () => {
  test('renders the three tabs and switches between them', async ({ page }) => {
    await gotoPainting(page);

    // Default tab: Community Gallery (empty, mocked).
    await expect(page.getByRole('button', { name: /Community Gallery/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /My Army/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /My Collection/ })).toBeVisible();
    await expect(page.getByText('No miniatures in the gallery')).toBeVisible();

    // My Collection → empty-state CTA to add the first model.
    await page.getByRole('button', { name: /My Collection/ }).click();
    await expect(page.getByText('No miniatures in your collection')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add your First' })).toBeVisible();

    // My Army → the faction planner lists factions to follow.
    await page.getByRole('button', { name: /My Army/ }).click();
    await expect(page.getByText('Space Marines', { exact: true })).toBeVisible();
  });

  test('AI Color Advisor returns schemes for a chosen faction', async ({ page }) => {
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await mockPaintAdvisor(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Painting', exact: true }).click();

    // Open the Add modal from the empty collection.
    await page.getByRole('button', { name: /My Collection/ }).click();
    await page.getByRole('button', { name: '+ Add your First' }).click();

    // Choosing a faction reveals the AI advisor panel (it's hidden until there's
    // something to advise on).
    await page.locator('select').first().selectOption('Space Marines');

    const inspire = page.getByRole('button', { name: /Inspire Me/ });
    await expect(inspire).toBeVisible();
    await inspire.click();

    // The mocked proxy response renders its scheme tabs + techniques.
    await expect(page.getByRole('button', { name: 'Ultramarines' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crimson Fists' })).toBeVisible();
    await expect(page.getByText('Techniques', { exact: true })).toBeVisible();
    await expect(page.getByText('Macragge Blue', { exact: true })).toBeVisible();
  });
});
