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

async function openReader(page) {
  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
  await mockReaderBook(page, { bookId: BOOK_ID, epubBuffer: EPUB });
  await page.goto('/');
  await page.getByTitle(/Horus Rising/).first().click();
  await expectTextInAnyFrame(page, CH1);
}

test.describe('Reader controls', () => {
  test('clicking the page toggles the header/footer chrome on desktop', async ({ page }) => {
    await openReader(page);

    const header = page.locator('[data-reader-chrome="header"]');
    const opacity = () => header.evaluate((el) => getComputedStyle(el).opacity);

    // Desktop (a fine pointer) starts with the chrome visible.
    await expect(header).toHaveCount(1);
    expect(await opacity()).toBe('1');

    // A plain click on the text column (centre — clear of the margin page-turn
    // strips) hides the chrome, the same way a tablet centre-tap does.
    const vp = page.viewportSize();
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await expect.poll(opacity).toBe('0');

    // Clicking again brings it back.
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await expect.poll(opacity).toBe('1');
  });

  test('settings panel changes the font size and closes', async ({ page }) => {
    await openReader(page);

    await page.getByRole('button', { name: 'Settings' }).click();

    // The panel opens at the default font size (18px).
    await expect(page.getByRole('button', { name: 'Close settings' })).toBeVisible();
    await expect(page.getByText('Font size — 18px')).toBeVisible();

    // Pick a new size → the live label reflects the change.
    await page.getByRole('button', { name: '20', exact: true }).click();
    await expect(page.getByText('Font size — 20px')).toBeVisible();

    // Switching theme keeps the panel open (the change is applied in place).
    await page.getByRole('button', { name: 'Paper', exact: true }).click();
    await expect(page.getByText('Font size — 20px')).toBeVisible();

    // Close it → the panel is gone.
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page.getByText('Font size — 20px')).toHaveCount(0);
  });

  test('selection toolbar anchors next to the selected word', async ({ page }) => {
    await openReader(page);

    // Select a word inside the chapter iframe and surface the action toolbar the
    // same way a real text selection does (epub.js reads the iframe's own
    // Selection on mouseup). Return the word's viewport rect so we can check the
    // toolbar lands next to it rather than pinned to the top of the page.
    const word = await page.evaluate(() => {
      for (const f of Array.from(document.querySelectorAll('iframe'))) {
        const doc = f.contentDocument;
        if (!doc) continue;
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const idx = node.textContent.indexOf('darkness');
          if (idx >= 0) {
            const range = doc.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + 'darkness'.length);
            const sel = doc.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            const rr = range.getBoundingClientRect();
            const ir = f.getBoundingClientRect();
            doc.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            return { cx: ir.left + rr.left + rr.width / 2, top: ir.top + rr.top, bottom: ir.top + rr.bottom };
          }
        }
      }
      return null;
    });
    expect(word).not.toBeNull();

    const defBtn = page.getByRole('button', { name: /Definition/ });
    await expect(defBtn).toBeVisible();
    const box = await defBtn.boundingBox();

    // Horizontally centred on the word (anchored, not screen-centred)…
    expect(Math.abs(box.x + box.width / 2 - word.cx)).toBeLessThan(40);
    // …and sitting just above or below it, not on the 54px top bar.
    const barCenterY = box.y + box.height / 2;
    expect(barCenterY).toBeGreaterThan(word.top - 80);
    expect(barCenterY).toBeLessThan(word.bottom + 80);
  });

  test('in-book search finds a phrase and jumps to its chapter', async ({ page }) => {
    await openReader(page);

    await page.getByRole('button', { name: 'Search' }).click();
    const input = page.getByPlaceholder('Search in this book…');
    await expect(input).toBeVisible();

    // "duty" lives only in Chapter Two — searching from Chapter One finds it.
    await input.fill('duty');
    await input.press('Enter');

    // The results header reports the hit count.
    await expect(page.getByText(/\d+ results?/)).toBeVisible();

    // Clicking the result navigates the reader to Chapter Two and closes the panel.
    await page.getByRole('button').filter({ hasText: /duty/i }).first().click();
    await expect(input).toHaveCount(0);
    await expectTextInAnyFrame(page, CH2);
  });
});
