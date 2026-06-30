import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mockAuth, mockReaderBook } from './helpers/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EPUB = readFileSync(resolve(__dirname, 'fixtures/test-book.epub'));

// Phrases baked into the fixture (scripts/make-test-epub.mjs).
const CH1 = 'In the grim darkness of the far future there is only war.';
const CH2 = 'Only in death does duty end, brother.';
const BOOK_ID = 1; // "Horus Rising"

// Assert a chapter's text rendered. epubjs paginates into CSS columns, so the
// target can sit in an off-screen column (not "visible" to a visibility-based
// locator) and may live in any of several rendered iframes — so we read each
// frame's body text directly and check for a substring match.
async function expectTextInAnyFrame(page, text, timeout = 15000) {
  await expect
    .poll(
      async () => {
        for (const f of page.frames()) {
          try {
            const body = await f.locator('body').innerText({ timeout: 1000 });
            if (body.includes(text)) return true;
          } catch {}
        }
        return false;
      },
      { timeout }
    )
    .toBe(true);
}

// Open the EPUB reader from the Home shelf and wait until chapter one has rendered.
async function openReader(page) {
  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
  await mockReaderBook(page, { bookId: BOOK_ID, epubBuffer: EPUB });
  await page.goto('/');
  await page.getByTitle(/Horus Rising/).first().click();
  await expectTextInAnyFrame(page, CH1);
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
});
