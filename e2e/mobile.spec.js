import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mockAuth, mockReaderBook } from './helpers/auth.js';
import { expectTextInAnyFrame } from './helpers/reader.js';

// Runs on the `mobile-chromium` project only (a Pixel 7 viewport, touch pointer).
// The app is used mostly on a phone, and the rules that differ there — touch
// starts the reader immersive, two-page is off, nothing may overflow sideways —
// are invisible to a desktop-viewport suite.

const __dirname = dirname(fileURLToPath(import.meta.url));
const EPUB = readFileSync(resolve(__dirname, 'fixtures/test-book.epub'));
const CH1 = 'In the grim darkness of the far future there is only war.';
const BOOK_ID = 1; // "Horus Rising"

async function openReader(page) {
  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
  await mockReaderBook(page, { bookId: BOOK_ID, epubBuffer: EPUB });
  await page.goto('/');
  await page.getByTitle(/Horus Rising/).first().click();
  await expectTextInAnyFrame(page, CH1);
}

// True when the page is wider than its own viewport — i.e. something inside is
// forcing a horizontal scrollbar.
const overflowsSideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

const headerOpacity = (page) =>
  page.locator('[data-reader-chrome="header"]').evaluate((el) => getComputedStyle(el).opacity);

// On touch the reader starts immersive, so the toolbar has to be summoned before
// anything on it can be pressed — a centre tap, clear of the page-turn strips.
async function openSettings(page) {
  const vp = page.viewportSize();
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await expect.poll(() => headerOpacity(page)).toBe('1');
  await page.getByTitle('Settings').click();
}

test.describe('Phone viewport', () => {
  test('opens a book on a single page, not the two-page spread', async ({ page }) => {
    await openReader(page);

    // A phone can't fit two columns, so the decorative spine must stay away…
    await expect(page.locator('[data-reader-spine="1"]')).toHaveCount(0);

    // …and the setting itself must say Single, rather than claiming Two-page
    // while epub.js quietly renders one column.
    await openSettings(page);
    await expect(page.getByRole('button', { name: 'Single', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Two-page', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test('lets the reader switch to two pages anyway, and remembers it', async ({ page }) => {
    await openReader(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Two-page', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Two-page', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // Reopening must respect the choice — the phone default only applies on first run.
    await page.reload();
    await page.getByTitle(/Horus Rising/).first().click();
    await expectTextInAnyFrame(page, CH1);
    await openSettings(page);
    await expect(page.getByRole('button', { name: 'Two-page', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('starts the reader immersive — chrome hidden until tapped', async ({ page }) => {
    await openReader(page);
    const opacity = () => headerOpacity(page);

    // Touch (a coarse pointer) starts hidden, unlike desktop.
    await expect(page.locator('[data-reader-chrome="header"]')).toHaveCount(1);
    await expect.poll(opacity).toBe('0');

    // A tap in the middle of the text column brings it back.
    const vp = page.viewportSize();
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await expect.poll(opacity).toBe('1');
  });

  test('no section scrolls sideways on a phone', async ({ page }) => {
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await page.goto('/');

    for (const name of ['Home', 'Library', 'Crusade', 'Lore']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect.poll(() => overflowsSideways(page), {
        message: `${name} overflows the phone viewport horizontally`,
      }).toBe(false);
    }
  });
});
