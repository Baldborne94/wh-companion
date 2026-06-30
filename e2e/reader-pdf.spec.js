import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mockAuth, mockReaderBook, mockPdfRuntime } from './helpers/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF = readFileSync(resolve(__dirname, 'fixtures/test-book.pdf'));
const BOOK_ID = 1; // "Horus Rising"

// The PDF reader is the app's second reading engine (pdf.js → canvas). This opens
// a PDF from the shelf and confirms pdf.js parsed it: the page counter reflects the
// fixture's two pages. pdf.js is served from the bundled build, not the CDN, so the
// test stays hermetic.

test('opens a PDF from the shelf and shows the page count', async ({ page }) => {
  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
  await mockReaderBook(page, { bookId: BOOK_ID, bytes: PDF, fileType: 'pdf' });
  await mockPdfRuntime(page);

  await page.goto('/');
  await page.getByTitle(/Horus Rising/).first().click();

  // The proof pdf.js loaded the document: the PdfReader chrome shows the 2-page
  // counter. (Pages rasterise to canvas, so there's no text to assert against.)
  await expect(page.getByText('1 / 2')).toBeVisible({ timeout: 15000 });
});
