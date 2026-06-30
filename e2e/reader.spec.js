import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mockAuth, mockReaderBook } from './helpers/auth.js';
import { expectTextInAnyFrame } from './helpers/reader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EPUB = readFileSync(resolve(__dirname, 'fixtures/test-book.epub'));

// The phrase baked into the fixture's first chapter (scripts/make-test-epub.mjs).
const CHAPTER_PHRASE = 'In the grim darkness of the far future there is only war.';

// The deepest, highest-value E2E: a signed-in user opens an EPUB from their shelf
// and the reader actually parses and renders the book. This exercises the full
// open path — refresh session → ebook_files lookup → storage download → epubjs
// render — all against mocked Supabase responses and a real EPUB fixture.

test('opens an EPUB from the shelf and renders its first chapter', async ({ page }) => {
  const BOOK_ID = 1; // "Horus Rising" in the bundled catalogue

  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
  await mockReaderBook(page, { bookId: BOOK_ID, epubBuffer: EPUB });

  await page.goto('/');

  // The shelf now shows the uploaded book; the home shelf groups by series.
  const shelfBook = page.getByTitle(/Horus Rising/);
  await expect(shelfBook.first()).toBeVisible();

  await shelfBook.first().click();

  // The real proof: epubjs parsed the downloaded bytes and rendered chapter one
  // inside its iframe.
  await expectTextInAnyFrame(page, CHAPTER_PHRASE);
});
