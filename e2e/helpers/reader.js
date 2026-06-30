import { expect } from '@playwright/test';

/**
 * Assert a chapter's text has rendered inside the epubjs reader.
 *
 * Uses `textContent` (not `innerText`) so text sitting in an off-screen paginated
 * column still counts — `innerText` drops clipped/overflow-hidden text. epubjs can
 * also keep several rendered views, so we check every frame and poll until it lands.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @param {number} [timeout]
 */
export async function expectTextInAnyFrame(page, text, timeout = 30000) {
  await expect
    .poll(
      async () => {
        for (const f of page.frames()) {
          try {
            const body = await f.locator('body').textContent({ timeout: 1000 });
            if (body && body.includes(text)) return true;
          } catch {}
        }
        return false;
      },
      { timeout }
    )
    .toBe(true);
}
