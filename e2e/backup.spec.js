import { test, expect } from '@playwright/test';
import { mockAuth } from './helpers/auth.js';

// The Backup & Restore modal (💾 in the header) exports the user's local data as a
// JSON file and imports one back. mockAuth already seeds a couple of `wh40k_` keys
// (onboarding flag, release reminder), so an export always has something to gather.

const openBackup = async (page) => {
  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k' } });
  await page.goto('/');
  await page.locator('button[title="Backup & Restore"]').first().click();
  await expect(page.getByText('Backup & Restore', { exact: true })).toBeVisible();
};

test.describe('Backup & Restore modal', () => {
  test('exports the local data as a downloadable .json file', async ({ page }) => {
    await openBackup(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export backup/ }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^wh40k-backup-\d{4}-\d{2}-\d{2}\.json$/);

    // The success line confirms how many items were gathered.
    await expect(page.getByText(/Backup exported — \d+ items\./)).toBeVisible();
  });

  test('rejects a file that is not a WH40K Companion backup', async ({ page }) => {
    await openBackup(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'random.json',
      mimeType: 'application/json',
      buffer: Buffer.from('this is not json at all'),
    });

    await expect(
      page.getByText('Invalid file: not a WH40K Companion backup.')
    ).toBeVisible();
  });

  test('accepts a valid backup and asks to confirm before overwriting', async ({ page }) => {
    await openBackup(page);

    const backup = {
      app: 'wh-companion',
      version: 1,
      exportedAt: '2025-01-01T12:00:00.000Z',
      userId: 'anon',
      count: 2,
      data: { wh40k_demo_a: '1', wh40k_demo_b: '2' },
    };

    await page.locator('input[type="file"]').setInputFiles({
      name: 'wh40k-backup-2025-01-01.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });

    // Import is a destructive action → a confirmation step gates it (we stop here
    // rather than confirm, since confirming reloads the page).
    await expect(page.getByRole('button', { name: 'Confirm import' })).toBeVisible();
  });
});
