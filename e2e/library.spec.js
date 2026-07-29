import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mockAuth, mockReaderBook, UID } from './helpers/auth.js';
import { expectTextInAnyFrame } from './helpers/reader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EPUB = readFileSync(resolve(__dirname, 'fixtures/test-book.epub'));
const CH1 = 'In the grim darkness of the far future there is only war.';

// Open the catalogue, filter to one book, and open its detail page.
async function openHorusRisingDetail(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByPlaceholder(/Search titles/).fill('Horus Rising');
  // The cover can render a text fallback with the same title, so more than one
  // element may match — any of them sits inside the clickable card.
  await page.getByText('Horus Rising', { exact: true }).first().click();
  // BookDetail: title heading + Library back control.
  await expect(page.getByRole('heading', { name: 'Horus Rising' })).toBeVisible();
  await expect(page.getByRole('button', { name: '← Library' })).toBeVisible();
}

test.describe('Library', () => {
  test('browses the catalogue and opens a book detail page', async ({ page }) => {
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await openHorusRisingDetail(page);
  });

  test('a read book is shown complete, not "still reading", even with saved progress', async ({ page }) => {
    // Book 1 is marked read locally, but reading_progress still holds a mid-book
    // percentage — status must win so the card doesn't show a "continue reading" %.
    await mockAuth(page, {
      seedLocalStorage: {
        wh_universe: '40k',
        [`wh40k_status_${UID}_1`]: JSON.stringify({
          status: 'read', updatedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:00.000Z',
        }),
      },
    });
    await page.route('**/rest/v1/reading_progress**', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify([{ book_id: 1, progress_pct: 0.5 }]),
      })
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByPlaceholder(/Search titles/).fill('Horus Rising');

    // The card renders, and the in-progress "50%" badge is suppressed for a read book.
    await expect(page.getByText('Horus Rising', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('50%')).toHaveCount(0);
  });

  test('finishing a book opened from the detail page auto-marks it read', async ({ page }) => {
    // Regression guard for the unified reader mount: the library used to render
    // its OWN reader without onFinish, so auto-mark-read only worked from Home.
    // Now the detail page routes through App's reader, which wires onFinish.
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await mockReaderBook(page, { bookId: 1, epubBuffer: EPUB });
    await openHorusRisingDetail(page);
    await page.getByRole('button', { name: /Start Reading/ }).click();
    await expectTextInAnyFrame(page, CH1);

    const statusKey = `wh40k_status_${UID}_1`;
    let value = null;
    for (let i = 0; i < 30 && !value?.includes('"status":"read"'); i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(150);
      value = await page.evaluate((k) => localStorage.getItem(k), statusKey);
    }
    expect(value).toContain('"status":"read"');
  });

  test('closing the reader returns to the book detail page it was opened from', async ({ page }) => {
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await mockReaderBook(page, { bookId: 1, epubBuffer: EPUB });
    await openHorusRisingDetail(page);
    await page.getByRole('button', { name: /Start Reading/ }).click();
    await expectTextInAnyFrame(page, CH1);

    // Reader back button (‹, aria-label "Close").
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Horus Rising' })).toBeVisible();
    await expect(page.getByRole('button', { name: '← Library' })).toBeVisible();
  });

  test('opens the reader from a book detail page', async ({ page }) => {
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await mockReaderBook(page, { bookId: 1, epubBuffer: EPUB });

    await openHorusRisingDetail(page);

    // The book has an uploaded file → the detail page offers to start reading.
    await page.getByRole('button', { name: /Start Reading/ }).click();

    // The reader opens and renders the EPUB's first chapter.
    await expectTextInAnyFrame(page, CH1);
  });
});
