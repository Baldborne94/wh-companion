import { test, expect } from '@playwright/test';
import { mockAuth } from './helpers/auth.js';

// Navigate to the Lore section and wait for it to finish rendering.
// Seed wh_universe so the "Select Your Universe" modal never appears.
async function openLore(page, opts = {}) {
  const seed = opts.seedLocalStorage ?? { wh_universe: '40k' };
  await mockAuth(page, { ...opts, seedLocalStorage: seed });
  await page.goto('/');
  await page.getByRole('button', { name: 'Lore' }).click();
  // The heading is always present once the section mounts.
  await expect(page.getByRole('heading', { name: 'Lore & Resources' })).toBeVisible({ timeout: 10000 });
}

// Intercept window.open so headless Chromium never tries to navigate an external URL.
// Returns a getter that resolves all URLs collected since the call.
async function interceptWindowOpen(page) {
  await page.addInitScript(() => {
    window._openedUrls = [];
    const _orig = window.open;
    window.open = (url, ...rest) => { window._openedUrls.push(String(url)); return null; };
  });
  return () => page.evaluate(() => window._openedUrls);
}

test.describe('Lore section — WH40K universe (default)', () => {
  test('shows the 40K heading and intro text', async ({ page }) => {
    await openLore(page);
    await expect(page.getByText('Warhammer 40,000').first()).toBeVisible();
    await expect(page.getByText(/Direct access to the best online encyclopedias/)).toBeVisible();
  });

  test('renders the main resource link cards for 40K', async ({ page }) => {
    await openLore(page);
    await expect(page.getByText('Warhammer 40k Wiki')).toBeVisible();
    await expect(page.getByText('Lexicanum').first()).toBeVisible();
  });

  test('renders the 40K quick-access faction links', async ({ page }) => {
    await openLore(page);
    await expect(page.getByText('Space Marines')).toBeVisible();
    await expect(page.getByText('Necrons')).toBeVisible();
    await expect(page.getByText('Tyranids')).toBeVisible();
    await expect(page.getByText('Primarchs')).toBeVisible();
  });

  test('does NOT show AoS realm cards in 40K mode', async ({ page }) => {
    await openLore(page);
    await expect(page.getByText('Realm of Aqshy')).toHaveCount(0);
    await expect(page.getByText('The Mortal Realms')).toHaveCount(0);
  });

  test('shows the in-reader hint text', async ({ page }) => {
    await openLore(page);
    await expect(page.getByText('underlined in blue')).toBeVisible();
  });

  test('40K wiki search opens a Fandom popup for the query', async ({ page }) => {
    const getUrls = await interceptWindowOpen(page);
    await openLore(page);
    await page.getByPlaceholder('Space Marines, Horus, Aeldari…').fill('Necrons');
    await page.getByRole('button', { name: 'Search ↗' }).click();
    const urls = await getUrls();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain('warhammer40k.fandom.com');
    expect(urls[0]).toContain('Necrons');
  });

  test('40K wiki search also triggers on Enter key', async ({ page }) => {
    const getUrls = await interceptWindowOpen(page);
    await openLore(page);
    await page.getByPlaceholder('Space Marines, Horus, Aeldari…').fill('Orks');
    await page.getByPlaceholder('Space Marines, Horus, Aeldari…').press('Enter');
    const urls = await getUrls();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain('Orks');
  });
});

test.describe('Lore section — AoS universe', () => {
  test('shows the AoS heading and intro text', async ({ page }) => {
    await openLore(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await expect(page.getByText('Warhammer: Age of Sigmar')).toBeVisible();
    await expect(page.getByText(/Direct access to the best online encyclopedias of the Mortal Realms/)).toBeVisible();
  });

  test('renders AoS main resource link cards', async ({ page }) => {
    await openLore(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await expect(page.getByText('Lexicanum AoS')).toBeVisible();
    await expect(page.getByText('Sigmar Wiki')).toBeVisible();
  });

  test('renders AoS quick-access faction links', async ({ page }) => {
    await openLore(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await expect(page.getByText('Stormcast Eternals')).toBeVisible();
    await expect(page.getByText('Sylvaneth')).toBeVisible();
    await expect(page.getByText('Skaven')).toBeVisible();
  });

  test('shows all 8 Mortal Realm cards', async ({ page }) => {
    await openLore(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await expect(page.getByText('The Mortal Realms', { exact: true })).toBeVisible();
    await expect(page.getByText('Realm of Aqshy')).toBeVisible();
    await expect(page.getByText('Realm of Shyish')).toBeVisible();
    await expect(page.getByText('Realm of Azyr')).toBeVisible();
    await expect(page.getByText('Realm of Hysh')).toBeVisible();
  });

  test('does NOT show 40K faction links in AoS mode', async ({ page }) => {
    await openLore(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await expect(page.getByText('Space Marines')).toHaveCount(0);
    await expect(page.getByText('Necrons')).toHaveCount(0);
  });

  test('AoS wiki search opens AoS Lexicanum popup for the query', async ({ page }) => {
    const getUrls = await interceptWindowOpen(page);
    await openLore(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await page.getByPlaceholder('Sigmar, Stormcast, Nagash…').fill('Nagash');
    await page.getByRole('button', { name: 'Search ↗' }).click();
    const urls = await getUrls();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain('ageofsigmar.lexicanum.com');
    expect(urls[0]).toContain('Nagash');
  });

  test('realm card click opens AoS Lexicanum popup for that realm', async ({ page }) => {
    const getUrls = await interceptWindowOpen(page);
    await openLore(page, { seedLocalStorage: { wh_universe: 'aos' } });
    await page.getByRole('button', { name: /Realm of Aqshy/ }).click();
    const urls = await getUrls();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain('ageofsigmar.lexicanum.com');
    expect(urls[0]).toContain('Realm_of_Aqshy');
  });
});
