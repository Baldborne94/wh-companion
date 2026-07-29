import { test, expect } from '@playwright/test';
import { mockAuth, UID } from './helpers/auth.js';

// The reconciled reading state: "what the user said" (reading_status) and "what
// the reader observed" (reading_progress) are merged into one derived status,
// so every screen agrees about a book instead of patching the mismatch locally.

const HORUS = 'Horus Rising'; // catalogue book id 1

// Serve one reading_progress row; everything else keeps mockAuth's empty sets.
async function mockProgress(page, rows) {
  await page.route('**/rest/v1/reading_progress**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(rows),
    })
  );
}

async function findInCatalogue(page, title) {
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByPlaceholder(/Search titles/).fill(title);
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
}

// Filter the catalogue by reading status. The chips live in the collapsed
// Filters panel and carry an emoji prefix, so match them exactly.
async function filterByStatus(page, label) {
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
}

test.describe('Reading state', () => {
  test('a book read to the end counts as read even if nothing was marked', async ({ page }) => {
    // Progress crossed the finish line but the status write never landed (offline,
    // or the book was finished on another device). The catalogue must not keep
    // showing it as a partially-read book.
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await mockProgress(page, [{ book_id: 1, progress_pct: 0.99, last_read: '2026-01-02T00:00:00.000Z' }]);

    await page.goto('/');
    await findInCatalogue(page, HORUS);

    // No "99%" in-progress badge — the book resolves to read (100%).
    await expect(page.getByText('99%')).toHaveCount(0);

    // And it survives a filter on "read" books.
    await filterByStatus(page, '✅ Read');
    await expect(page.getByText(HORUS, { exact: true }).first()).toBeVisible();
  });

  test('a manually read book stays complete despite stale mid-book progress', async ({ page }) => {
    await mockAuth(page, {
      seedLocalStorage: {
        wh_universe: '40k',
        [`wh40k_status_${UID}_1`]: JSON.stringify({
          status: 'read', updatedAt: '2026-03-01T00:00:00.000Z', completedAt: '2026-03-01T00:00:00.000Z',
        }),
      },
    });
    await mockProgress(page, [{ book_id: 1, progress_pct: 0.5, last_read: '2026-04-01T00:00:00.000Z' }]);

    await page.goto('/');
    await findInCatalogue(page, HORUS);
    await expect(page.getByText('50%')).toHaveCount(0);
  });

  test('a status set after the last read overrides the observed progress', async ({ page }) => {
    // Re-shelved as "to read" today, having read 60% back in January.
    await mockAuth(page, {
      seedLocalStorage: {
        wh_universe: '40k',
        [`wh40k_status_${UID}_1`]: JSON.stringify({ status: 'want', updatedAt: '2026-06-01T00:00:00.000Z' }),
      },
    });
    await mockProgress(page, [{ book_id: 1, progress_pct: 0.6, last_read: '2026-01-01T00:00:00.000Z' }]);

    await page.goto('/');
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await filterByStatus(page, '📋 To Read');
    await page.getByPlaceholder(/Search titles/).fill(HORUS);
    await expect(page.getByText(HORUS, { exact: true }).first()).toBeVisible();
  });

  test('percentages written by the PDF reader are not shown a hundred times too big', async ({ page }) => {
    // PdfReader used to write progress_pct on a 0–100 scale into the same column
    // EpubReader wrote 0–1 into, so the badge rendered "5000%".
    await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
    await mockProgress(page, [{ book_id: 1, progress_pct: 50, last_read: '2026-01-02T00:00:00.000Z' }]);

    await page.goto('/');
    await findInCatalogue(page, HORUS);
    await expect(page.getByText('50%').first()).toBeVisible();
    await expect(page.getByText('5000%')).toHaveCount(0);
  });
});
