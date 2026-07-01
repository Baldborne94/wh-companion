import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mockAuth, mockReaderBook } from './helpers/auth.js';
import { expectTextInAnyFrame } from './helpers/reader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EPUB = readFileSync(resolve(__dirname, 'fixtures/test-book.epub'));

// Phrases baked into the fixture (scripts/make-test-epub.mjs).
const CH1 = 'In the grim darkness of the far future there is only war.';
const CH2 = 'Only in death does duty end, brother.';
const BOOK_ID = 1; // "Horus Rising"

// Open the EPUB reader from the Home shelf and wait until chapter one has rendered.
async function openReader(page) {
  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
  await mockReaderBook(page, { bookId: BOOK_ID, epubBuffer: EPUB });
  await page.goto('/');
  await page.getByTitle(/Horus Rising/).first().click();
  await expectTextInAnyFrame(page, CH1);
}

// Re-open the reader with the same mocks already registered.
// Waits only for the reader header back button to become visible — the chapter
// depends on the saved position so we don't assert a specific chapter here.
async function reopenReader(page) {
  await page.getByTitle(/Horus Rising/).first().click();
  // The back/close button is the aria-labelled "Close" button in the header.
  await expect(page.getByRole('button', { name: 'Close', exact: true }).first()).toBeVisible();
}

test.describe('Reader interactions', () => {
  test('adds a bookmark and lists it in the bookmarks panel', async ({ page }) => {
    await openReader(page);

    // Save a bookmark at the current position; the star button flips state.
    const add = page.getByRole('button', { name: 'Add bookmark' });
    await expect(add).toBeVisible();
    await add.click();
    await expect(page.getByRole('button', { name: 'Remove bookmark' })).toBeVisible();

    // The bookmarks panel now lists the saved bookmark, not the empty state.
    // Assert via the per-row delete control (its label doesn't depend on the
    // chapter title the bookmark is tagged with).
    await page.getByRole('button', { name: 'Bookmarks' }).click();
    await expect(page.getByText('No bookmarks yet.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete bookmark' })).toBeVisible();
  });

  test('jumps to another chapter from the table of contents', async ({ page }) => {
    await openReader(page);

    // Open the TOC — both chapters are listed.
    await page.getByRole('button', { name: 'Contents' }).click();
    await expect(page.getByRole('button', { name: 'Chapter One' })).toBeVisible();

    // Jump to chapter two → the reader renders its text.
    await page.getByRole('button', { name: 'Chapter Two' }).click();
    await expectTextInAnyFrame(page, CH2);
  });

  test('resumes at last-read position after closing and reopening', async ({ page }) => {
    await openReader(page);

    // Navigate to chapter two via TOC.
    await page.getByRole('button', { name: 'Contents' }).click();
    await page.getByRole('button', { name: 'Chapter Two' }).click();
    await expectTextInAnyFrame(page, CH2);

    // Close the reader immediately (without waiting 1500 ms for the debounce).
    // The fix flushes cfiRef.current to localStorage synchronously in the
    // effect cleanup, so the position survives even a quick close.
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);

    // The CFI must now be in localStorage (written by the cleanup flush).
    const cfi = await page.evaluate(
      ([uid, bookId]) => localStorage.getItem(`wh40k_cfi_${uid}_${bookId}`),
      ['00000000-0000-0000-0000-000000000001', String(BOOK_ID)]
    );
    expect(cfi).toBeTruthy();

    // Reopen the same book — it must land on chapter two, not chapter one.
    await reopenReader(page);
    await expectTextInAnyFrame(page, CH2);
  });
});
