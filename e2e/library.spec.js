import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mockAuth, mockReaderBook } from './helpers/auth.js';
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
