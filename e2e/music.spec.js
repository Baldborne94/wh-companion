import { test, expect } from '@playwright/test';
import { mockAuth, mockYouTube, ytTokenSeed } from './helpers/auth.js';

// The Music section plays YouTube tracks; pasting a link starts playback without any
// OAuth (parseYouTube → playVideo). Once something is playing, App shows a header
// "mini player" on every OTHER section so music controls follow the user around.
// We seed a fake yt_token (skip the connect screen) and mock googleapis + the embed
// iframe so nothing leaves the page.

const YT_LINK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

async function startPlayback(page) {
  await mockAuth(page, { seedLocalStorage: { wh_universe: '40k', ...ytTokenSeed() } });
  await mockYouTube(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Music', exact: true }).click();

  // Token is seeded → the search/playlist UI renders (not the connect screen).
  const search = page.getByPlaceholder('Search a track or paste a YouTube link');
  await expect(search).toBeVisible();

  // Pasting a video link plays it immediately.
  await search.fill(YT_LINK);
  await search.press('Enter');
}

test.describe('Music & mini player', () => {
  test('plays a pasted YouTube link and shows the embed', async ({ page }) => {
    await startPlayback(page);
    // The player iframe mounts for the chosen video.
    await expect(page.locator('iframe[src*="youtube.com/embed/dQw4w9WgXcQ"]')).toBeVisible();
  });

  test('mini player follows the user to another section and stops playback', async ({ page }) => {
    await startPlayback(page);

    // Leave Music → the header mini player appears for the now-playing track.
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    const mini = page.getByRole('button', { name: /Now playing: .*Open music section/ });
    await expect(mini).toBeVisible();

    // Pause toggles to a resume control.
    await page.getByRole('button', { name: 'Pause music' }).click();
    await expect(page.getByRole('button', { name: 'Resume music' })).toBeVisible();

    // Stop clears it.
    await page.getByRole('button', { name: 'Stop music' }).click();
    await expect(mini).toHaveCount(0);
  });

  test('mini player is hidden while in the Music section', async ({ page }) => {
    await startPlayback(page);
    // On Music itself there is no mini player (the full player is on screen).
    await expect(
      page.getByRole('button', { name: /Now playing: .*Open music section/ })
    ).toHaveCount(0);
  });
});
