# WH40K Companion — Project Context for Claude

## What This Is

A Warhammer 40,000 + Age of Sigmar companion PWA. React 18 + Vite 5 SPA, Supabase (PostgreSQL + Storage + Auth), deployed on Vercel. Users can read EPUB/PDF ebooks, track reading progress, track miniature painting, listen to ambient music, and browse lore — all synced to their Google account.

## Repository Layout

```
wh-companion/             ← git root + Vite project (run npm commands here)
├── index.html
├── vite.config.js
├── package.json
├── public/
│   ├── manifest.json      ← PWA manifest (orientation: "any")
│   ├── icon.svg / icon-192.png / icon-512.png
│   ├── aquila.png         ← WH40K logo asset
│   └── AOS.jpg            ← AoS logo asset (radiant starburst comet)
└── src/
    ├── App.jsx            ← nav, top-level state, reader orchestration
    ├── main.jsx
    ├── index.css
    ├── components/
    │   ├── AoSApp.jsx         ← Age of Sigmar universe module (Path to Glory: Overview / Reading Order / Getting Started)
    │   ├── ReadingSection.jsx ← WH40K Crusade (Overview + Horus Heresy guide)
    │   ├── LibrarySection.jsx ← book catalogue + My Shelf (offline-aware)
    │   ├── BookDetail.jsx     ← per-book detail / upload / open (offline-aware)
    │   ├── HomePage.jsx
    │   ├── LoreSection.jsx
    │   ├── EpubReader.jsx     ← EPUB reader (CFI bookmarks, paginate/scroll)
    │   ├── PdfReader.jsx      ← PDF reader
    │   ├── MusicPlayer.jsx    ← YouTube + Spotify player (forwardRef)
    │   ├── PaintingTracker.jsx
    │   ├── StatsModal.jsx / AchievementPopup.jsx / OnboardingModal.jsx
    │   ├── BackupModal.jsx    ← export/import of local user data (JSON) — 💾 header button
    │   ├── LoginPage.jsx      ← Google OAuth landing page
    │   ├── CoverImage.jsx / ErrorBoundary.jsx / UniverseSelector.jsx
    ├── data/
    │   ├── books.js       ← 230+ WH40K book catalogue
    │   ├── aosBooks.js    ← AoS book catalogue + AOS colour palette
    │   ├── constants.js   ← C (colours), FC (faction colours), THEMES, FONTS, STATUS_CFG
    │   ├── lore.js        ← WH40K keyword→wiki DB + KW_REGEX
    │   ├── hhGuide.js     ← Horus Heresy reading order (HH_MIN / HH_FULL / HH_OPTIONAL)
    │   ├── aosGuide.js    ← AoS reading order (AOS_ESSENTIAL chronological spine) + findAoSGuideBook
    │   └── releases.js
    └── lib/
        ├── supabase.js    ← createClient, signInWithGoogle, signOut
        ├── sb.js          ← fetch-based REST helpers (sb.get, sb.upsert, sb.del, sb.storage)
        ├── openBook.js    ← resolveBookUrl: download bytes (auth headers) + IndexedDB cache fallback
        ├── ebookCache.js  ← IndexedDB ebook cache (cacheGet/cachePut/cacheListIds) for offline reading
        ├── bookStatus.js / bookmarkHelpers.js / readerNav.js / readingHelpers.js / achievements.js
```

## Dev Commands

```bash
cd wh-companion
npm run dev       # local dev server
npm run build     # production build — ALWAYS run before committing to verify no errors
npm run preview   # preview production build
npm test          # Vitest unit + component tests (jsdom)
npm run test:e2e  # Playwright end-to-end tests (real Chromium) — see "End-to-End Testing"
```

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GOOGLE_CLIENT_ID=...      # YouTube OAuth (optional)
VITE_SPOTIFY_CLIENT_ID=...     # Spotify OAuth (optional)
```

Set in `.env` locally and in Vercel project settings for deployment.

### Server-side variables (Vercel only — no `VITE_` prefix)

Used by `api/paint-advisor.js` (the AI Color Advisor proxy). These are **never** bundled into the client. Set them in Vercel project settings only:

```env
ANTHROPIC_API_KEY=sk-ant-...          # Claude API key (server-side, kept secret)
SUPABASE_SERVICE_ROLE_KEY=...         # bypasses RLS to read/write ai_usage
# SUPABASE_URL / SUPABASE_ANON_KEY    # optional — proxy falls back to the VITE_ ones
```

⚠️ Never expose the Anthropic key with a `VITE_` prefix — that bundles it into the public client JS. The AI Color Advisor must go through the serverless proxy.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite 5 (SPA, no router) |
| Styling | 100% inline JSX styles — zero CSS frameworks |
| State | Local useState/useEffect — no Redux/Zustand |
| Auth | Supabase Google OAuth 2.0 |
| Database | Supabase PostgreSQL with RLS |
| File Storage | Supabase private `ebooks` bucket |
| Deployment | Vercel (auto-deploy on push to main) |
| PWA | manifest.json + installable icons |

## Supabase Schema

Key tables (all RLS-enforced — users see only their rows):
- `ebook_files` — `(user_id, book_id, file_path, file_type, file_name)` — uploaded ebook files
- `reading_progress` — `(user_id, book_id, progress_pct, last_read, epub_cfi)` — auto-saved position
- `bookmarks` — `(user_id, book_id, epub_cfi, label, progress, created_at)` — manual bookmarks
- `painting_tracker` — painting step progress
- `ai_usage` — `(user_id, day, count)` — per-user daily counter for the AI Color Advisor; written only by the serverless proxy via the service role (RLS enabled, no policies). See `supabase/ai_usage.sql`.

Storage: private `ebooks` bucket at `{user_id}/{book_id}/{filename}`.  
Signed URLs (2h TTL) via `sb.storage.signedUrl(path)`.

### AI Color Advisor (serverless proxy)

`PaintingTracker.jsx` no longer calls Anthropic from the browser. It POSTs to `api/paint-advisor.js` (Vercel serverless) with the user's Supabase access token. The proxy:
1. Validates the token → resolves `user_id`.
2. Enforces **3 generations/day per user** via `ai_usage` (returns HTTP 429 → client shows "Hai esaurito le 3 generazioni AI di oggi").
3. Fetches + base64-encodes photo URLs server-side (small request bodies). SSRF guard: only `https` URLs on the project's Supabase storage host (`/storage/…`) with an `image/*` content-type are fetched.
4. Calls Claude with the server-side `ANTHROPIC_API_KEY` (`claude-sonnet-4-6` with photos, `claude-haiku-4-5-20251001` text-only).

## App Architecture

### Navigation

Single-page app with a bottom nav bar. Sections: `home`, `library`, `reading` (Crusade/Path to Glory), `lore`, `music`, `painting`.

```js
// In App.jsx
const NAV = [
  { id:"home",    label:"Home",   icon:"⚔" },
  { id:"library", label:"Library",icon:"📚" },
  { id:"reading", label:"Crusade",icon:"🗡" },  // label becomes "Path to Glory" for AoS
  { id:"lore",    label:"Lore",   icon:"📖" },
  { id:"music",   label:"Music",  icon:"🎵" },
  { id:"painting",label:"Painting",icon:"🎨"},
];
```

### Universe System

Two universes: `wh40k` and `aos` (Age of Sigmar). Toggled via `UniverseSelector`. Most sections adapt to the active universe. AoS-specific UI lives in `AoSApp.jsx`.

```js
const [universe, setUniverse] = useState("wh40k");
```

### Reader System

`EpubReader` and `PdfReader` are lazy-loaded. They mount on top of the main app (z-index 3) with `position:absolute` covering everything. `MusicPlayer` stays mounted underneath so music keeps playing across navigation.

```js
const EpubReader = lazy(() => import("./components/EpubReader"));
const PdfReader  = lazy(() => import("./components/PdfReader"));
```

Reader is opened via `appReader` state: `{ url, book, fileType, progress, chapterIndex, pageIndex }`.

## Key Components

### MusicPlayer (forwardRef)

`MusicPlayer` is always in the DOM (never unmounted) so iframes keep playing. It is a `forwardRef` component exposing:
```js
musicRef.current.stop()   // clears video/playlist, calls onNowPlaying(null)
musicRef.current.pause()  // postMessage pause to active iframe
musicRef.current.resume() // postMessage resume to active iframe
```

`YouTubeSection` and `SpotifySection` are also `forwardRef` with their own `iframeRef` for direct postMessage control. YouTube embed uses `?autoplay=1&enablejsapi=1`.

In `App.jsx`:
```js
const musicRef = useRef(null);
const [nowPlaying, setNowPlaying] = useState(null);
const [musicPaused, setMusicPaused] = useState(false);
```

Mini player bar renders when `nowPlaying && section !== "music" && !appReader`. It has:
- Spotify album art (if available)
- Song title (clickable → navigates to Music section)
- ⏸/▶ pause toggle button
- ✕ stop button

Both `EpubReader` and `PdfReader` receive `nowPlaying`, `musicPaused`, `onMusicClick`, `onStopMusic`, `onTogglePauseMusic` props and show the same controls in their header.

### EpubReader Bookmarks

```js
const [bookmarks, setBookmarks] = useState(() =>
  JSON.parse(localStorage.getItem(`wh40k_bm_${userId}_${bookId}`) || "[]")
);
```

Bookmarks are stored locally + synced to `bookmarks` Supabase table. Array sorted `created_at.desc` so `bookmarks[0]` is the most recent.

🔖 button behavior:
- `bookmarks.length > 0` → click navigates to `bookmarks[0].cfi` (gold color)
- `bookmarks.length === 0` → click saves current position (muted color)

📑 bookmarks panel has a **"+ Save here"** button to save a new bookmark at any time.

Navigate to CFI: `rendRef.current?.display(bm.cfi)`

### EpubReader Selection Toolbar

Selecting text in a chapter surfaces the `selBar` action pill (📖 Definition for a single word, 🖍 highlight swatches for a phrase). `captureSelection` records the selection's **viewport rect** (the in-iframe range rect plus the iframe element's own offset). A `useLayoutEffect` then anchors the pill **next to the word** — above it when there's room, otherwise below — horizontally centred and clamped on-screen (`selBarPos`). The reader root is `position:fixed; inset:0`, so viewport coords double as the pill's absolute coords. While the rect is mid-measure the pill renders `visibility:hidden` (no top-of-page flash); if no rect is available (e.g. Android wiped the iframe selection) it falls back to the centred top bar.

### Auto-mark "read" on finishing a book

Reaching the last page auto-marks the book **read** (so it appears on the shelf, and reading stats + achievements update). The readers signal completion via an `onFinish` prop — `EpubReader` fires it once when epub.js `relocated` reports `loc.atEnd`; `PdfReader` fires it when `page >= total`. Because many EPUBs pad the last few % with endmatter/adverts, each reader **also** fires `onFinish` on unmount (reader close) if the max progress reached this session was **≥97%** (`maxPctRef` for EPUB, `maxPageRef/total` for PDF) — so finishing the story counts even if you don't page through the trailing matter, and reopening a nearly-finished book then closing it resolves it. `App.markBookFinished(book)` calls `updateStatus`/`updateAoSStatus(book.id, 'read')` (picking the map by the active `universe`), guarded so an already-read book isn't re-written. `setBookStatusLS` stamps `completedAt`; the change persists to localStorage + Supabase `reading_status`.

Because the "reading" section, Home, Crusade/Path-to-Glory, and Library stat counts all key off `status === 'reading'`, flipping a book to `read` removes it from every "currently reading" list automatically. The Library catalogue's per-book **progress bar/`%` badge** is driven by `reading_progress` independently of status, so it's made status-aware (`pctPct = bst === 'read' ? 100 : …` in all three views — card, list, shelf): a read book always renders complete, never "still reading".

### EpubReader Immersive Chrome (header/footer toggle)

A plain click/tap on the **text column** (the side margins are page-turn strips, so only a dead-centre click reaches the iframe) toggles the header + footer via `rend.on("click", toggleUI)`. Visibility is driven by `uiVisible = !settings.paginate || showUI` — scroll mode always shows it; paginated mode lets `showUI` drive it on **both touch and desktop**. `showUI` initialises to `!matchMedia("(pointer:coarse)")` so touch starts immersive (hidden, revealed by tap/swipe) and **desktop starts visible but can be toggled with a click** (no 4s auto-hide on desktop — only touch arms the timer). The header carries `data-reader-chrome="header"` purely as an E2E hook (its `opacity` flips 1↔0; `toBeVisible` can't see opacity).

### Tablet Zoom (index.html)

Applied via inline `<script>` in `index.html`, targeting `body` (not `html`) so `position:fixed` elements stay unaffected:

```js
var sc = isLandscape ? Math.min(1.35, w/430) : Math.min(1.75, w/430);
styleEl.textContent =
  'body{zoom:' + sc.toFixed(4) + ';height:' + (100/sc).toFixed(4) + 'dvh!important}';
html.style.setProperty('--nav-h', (56 * sc).toFixed(1) + 'px');
```

- Only applies when `navigator.maxTouchPoints >= 1` and `window.innerWidth > 520`
- Portrait: up to 1.75× zoom; Landscape: up to 1.35× zoom
- `--nav-h` CSS variable used by mini player to sit above the visually-scaled nav bar
- `orientationchange` listener with 300ms delay recalculates on rotation

Why `body` not `html`: `html` zoom causes Android Chrome to lock rotation on tablets. Body zoom avoids this.

### AoS Realms (Lore Section)

Defined in `App.jsx` as `AOS_REALMS` constant, rendered in the Lore section only when `universe === 'aos'`. Each realm links to `ageofsigmar.lexicanum.com/wiki/Realm_of_X`.

```js
const AOS_REALMS = [
  { name:"Realm of Aqshy", sub:"Fire",    color:"#C0392B", icon:"🔥" },
  { name:"Realm of Ghyran", sub:"Life",   color:"#4aaa6a", icon:"🌿" },
  // ... 8 realms total
];
```

### Lore Keywords (In-Reader Highlighting)

`lore.js` exports `LORE_DB` (object), `wikiUrl(term)`, and `KW_REGEX` (regex). When a chapter loads, the renderer replaces matched terms with `<span>` elements styled gold+underline that open the WH40K Fandom wiki in a new tab. AoS uses the AoS Lexicanum wiki (`ageofsigmar.lexicanum.com`).

Reader hint shown in the reader viewport:
> "While reading, WH40K/AoS terms appear underlined in blue. Tap them to open the wiki page directly."

## Colour Palette

```js
// WH40K (C)
export const C = {
  bg:"#0a0905", surface:"#111009", card:"#16140f", border:"#2a2518",
  gold:"#c9a84c", goldDim:"#7a6330", red:"#b03030", blue:"#4a8adc",
  green:"#4aaa6a", text:"#d4cbb8", muted:"#7a7060", dim:"#3a3428",
};

// AoS (AOS) — defined in AoSApp.jsx
export const AOS = {
  gold:"#C9A227", surface:"#0d0c08", border:"#2a2010", muted:"#706840",
};
```

## Git Workflow

- **Working branch**: `claude/wizardly-fermat-q790e`
- **Deploy target**: `main` (Vercel auto-deploys on merge)
- **Merge strategy**: Squash merge via GitHub MCP tools
- **After squash merge**: new PR from same branch conflicts with main → always `git fetch origin main && git rebase origin/main` before next push

Standard flow:
```bash
# make changes
npm run build                          # verify no errors
git add <specific files>
git commit -m "feat/fix: description"
git push -u origin claude/wizardly-fermat-q790e
# create draft PR via mcp__github__create_pull_request
# merge via mcp__github__update_pull_request (draft:false) + mcp__github__merge_pull_request
```

## Changes Made in This Project (PRs #83–#99)

| PR | What |
|----|------|
| #83 | PWA manifest `orientation: "any"` (was `portrait-primary`) |
| #90 | Fix tablet scroll broken by CSS zoom height overflow |
| #91 | Body zoom instead of html zoom → fixes tablet rotation |
| #92 | Remove `user-scalable=no` from viewport meta; orientation-aware zoom levels |
| #93 | AoS realm cards + move to Lore section + fix header "PATH TO GLORY" (was "CRUSADE") |
| #94 | AoS realm links to Lexicanum wiki |
| #95 | Reader hint in English for both universes; "Realm of X" naming convention |
| #96 | Login page ring animation (opacity-only, no scale = no flicker); 🔖 navigates to bookmark; music mini player stop (✕) button; MusicPlayer → forwardRef |
| #97 | Music stop ✕ + ⏸/▶ pause in reader header; remove % from bookmark panel; "Save here" button in 📑 panel |
| #98 | Remove redundant YouTube ▶ icon from mini player (pause button is enough) |
| #99 | Remove pulsing circle rings from login page entirely |
| #227 | BookDetail shows correct state offline with cached ebook; fall back to IndexedDB cache when download fails (`navigator.onLine` false-positive) |
| #228 | Full offline support — precache JS chunks in `vite.config.js`; auth persists across PWA cold start (localStorage); don't clear user when offline token refresh fails |
| #229 | My Shelf loads offline (builds shelf from localStorage + IndexedDB); cached PDFs open as PDF not EPUB |
| #230 | AoS Reading Order guide added to Path to Glory |
| #231–#233 | AoS guide refinement: Getting Started reframed as newcomer wizard; Reading Order simplified to a single chronological spine (no Essential/Full toggle — AoS has no Horus-Heresy-style mega-arc to isolate); all AoS text translated to English |
| #259–#260 | EN/IT i18n system (`lib/i18n.jsx` + per-namespace `data/i18n/ns/*`); header toggle; full-app localization of every section |
| #261 | Localize achievements (names/descriptions via `localizeAchievement`), AoS era headers, and date formatting (lang-aware `locale`) |
| #262 | EN/IT toggle on the login page (pre-auth) |
| #270 | Localize reading-guide prose (Horus Heresy + AoS notes, part labels, AoS main-story-arc); part titles kept as IP proper nouns |
| #347–#365 | QA Phase 1–2: risk-based Test Plan + behaviour specs; Vitest unit tests for the achievements engine (+ mutation testing); component tests for the "easy" components (AchievementPopup, HomePage, AoSHomePage, StatsModal, MiniPlayer, UniverseSelector, BackupModal, OnboardingModal) |
| #366–#373 | QA Phase 3: Playwright E2E suite — harness + CI gating job; pre-auth login; authenticated shell + universe nav; EPUB reader (open + render); bookmarks + TOC; PDF reader; Age of Sigmar universe; Library catalogue → detail → open reader. See "End-to-End Testing (Playwright)" |
| #380 | QA: 35 unit tests for `api/paint-advisor.js` (method guard, env vars, auth, rate limit, SSRF guard, MIME guard, 4-image cap, Anthropic errors, happy paths, usage increment) |
| #381 | fix(reader): uniform margins — `body{padding:0!important}` resets per-chapter EPUB CSS; symmetric top/bottom container padding (`clamp(30px,6vh,56px)` both sides) |
| #382 | fix(reader): resume at last-read position — flush CFI to localStorage on close (was lost if reader closed within 1500 ms debounce); retry `displayCfi` after `book.ready` in paginated mode; E2E test for close-then-reopen resume flow; `aria-label` on back button |

### Offline Reading (key files)

End-to-end offline EPUB/PDF reading spans several layers:
1. `vite.config.js` — `globPatterns` precaches **all** JS chunks (not just CSS/images) so the app shell loads cold-offline.
2. `lib/ebookCache.js` — IndexedDB store; ebook bytes cached on first successful download.
3. `lib/openBook.js` — `resolveBookUrl` downloads via REST with explicit auth headers, caches the bytes, and **falls back to IndexedDB** if the network download fails. `file_type` is preserved in localStorage so cached PDFs don't open as EPUB.
4. `App.jsx` — `appStarted` and auth persist across PWA cold starts; `onAuthStateChange` only clears the user when `navigator.onLine`.
5. `LibrarySection.jsx` — `buildLocalShelf()` reconstructs My Shelf from localStorage meta + IndexedDB ids when offline.

⚠️ `navigator.onLine` returns `true` on a LAN with no real internet — never trust it as the sole signal; always have a cache fallback.

### AoS Path to Glory tabs (`AoSApp.jsx`)

Three distinct tabs (mirrors the 40K Crusade structure):
- **Overview** — full `AOS_BOOKS` catalogue grouped by series.
- **📖 Reading Order** — single curated chronological spine (`AOS_ESSENTIAL` in `aosGuide.js`), Realmgate Wars → Dawnbringers. No Essential/Full toggle (unlike the 40K Heresy Guide, AoS has no self-contained mega-arc to isolate from the catalogue).
- **🌟 Getting Started** — newcomer wizard (`AOS_STARTER_GUIDE`), branching `pickOne` paths. Book rows support an optional `era:"old"|"aos"` badge (used by the full Gotrek & Felix saga to mark Old World vs Age of Sigmar entries).

## Known Behaviors & Gotchas

- **PWA cache**: After manifest changes, users must reinstall the PWA (remove from homescreen + re-add) to pick up new orientation settings.
- **Tablet rotation**: Root cause was PWA manifest `portrait-primary` cached from old install + `user-scalable=no`. Both fixed. Body zoom (not html zoom) is essential for Android rotation.
- **MusicPlayer always mounted**: Never conditionally render MusicPlayer or music stops. It sits at z-index 0 under the content area, becomes z-index 2 only when Music section is active.
- **Squash merge conflicts**: Every new PR on the same branch after a squash merge will show conflicts. Fix: `git rebase origin/main` (drops already-upstream commits).
- **Draft PR merge**: GitHub API returns 405 on draft PRs. Always call `update_pull_request(draft: false)` first.
- **Spotify pause**: Uses `postMessage({ command: "pause" }, "https://open.spotify.com")`. Works for the embedded player if Spotify supports it in the embed context. YouTube pause is reliable with `enablejsapi=1`.
- **Signed URLs**: Ebook files are in a private Supabase bucket. Always use signed URLs (2h TTL) — never expose the file path directly.
- **Reading progress localStorage**: Primary fast storage. Supabase is a backup for new devices.
- **EPUB resume position**: Saved as a CFI string at `wh40k_cfi_${userId}_${bookId}`. The `relocated` event debounces the write by 1500 ms; the effect cleanup flushes synchronously so closing quickly doesn't lose the position. On reopen, `rend.display(savedCfi)` is called immediately and retried after `book.ready` (both paginated and continuous managers). DB fallback (`reading_progress.epub_cfi`) kicks in when the localStorage key is absent (e.g. new device).

## UI Conventions

- **Fonts**: `'Cinzel Decorative'` for titles, `'Cinzel'` for labels/buttons — imported from Google Fonts in LoginPage.jsx CSS.
- **No comments in code** unless the WHY is non-obvious.
- **No external UI libraries** — all styles are inline JSX objects.
- **Language / i18n**: The app is fully **bilingual EN/IT** via a lightweight in-house i18n system (no external library). Default `en`, persisted to `localStorage` (`wh_language`). English is the source of truth and the fallback for any missing IT key. Warhammer IP proper nouns (book/author/series/faction/realm names, lore terms) and brand names (YouTube, Spotify, EPUB, PDF, Citadel, Black Library) are intentionally left untranslated. **When adding any new user-facing string, add it to both `en` and `it`** in the relevant namespace module and render it through `t()`. See "Internationalization (i18n)" below.
- **Merge method**: Always squash.

## Internationalization (i18n)

- **`lib/i18n.jsx`** — `LanguageProvider` (wraps `<App/>` in `main.jsx`) + `useLang()` hook returning `{ lang, setLang, toggle, t, locale }`.
  - `t("namespace.key")` resolves a dot-path against the active language, falls back to English, then to the key string itself.
  - `locale` is `it-IT` / `en-US` — use it for `toLocaleDateString` so dates follow the language.
  - `partLabel(label, t)` helper localizes reading-guide labels ("Part 1" → "Parte 1").
- **`data/i18n/translations.js`** — merges per-namespace modules from `data/i18n/ns/*` (`core`, `home`, `library`, `reading`, `aos`, `lore`, `music`, `painting`, `stats`, `backup`, `reader`, `login`). Each module exports `{ en: { <ns>: {...} }, it: { <ns>: {...} } }`. Keep en/it key structure identical.
- **Toggle UI**: EN/IT button in the post-auth header (`App.jsx`) **and** on the login page (`LoginPage.jsx`) so first-run users can switch before signing in.
- **Dynamic content**: achievement names/descriptions live in `lib/achievements.js` (English) with `localizeAchievement(ach, t)` resolving translations from the `stats.ach.*` keys; the popup flavor/opener pools live in the `stats` namespace.
- **Gotcha**: a sub-component that calls `t()` needs its own `useLang()` (or must close over a parent's) — esbuild does **not** catch a `t` that is undefined at runtime. After i18n edits, grep that every component using `t()` has `useLang()` in scope.

## Testing

Three layers (`npm test` for the first two, `npm run test:e2e` for E2E):

- **Unit** — `src/lib/*.test.js` (Vitest, jsdom). Pure logic: achievements engine, book status, bookmarks, reader nav, openBook.
- **Component** — `src/components/*.test.jsx` (Vitest + Testing Library). The "easy" components render-and-interact in jsdom.
- **End-to-End** — `e2e/*.spec.js` (Playwright, real Chromium). The real built app, driven in a browser.

`vite.config.js` `test.exclude` lists `**/e2e/**` so Vitest never picks up Playwright specs (different runner).

CI (`.github/workflows/ci.yml`) runs two parallel jobs on every PR: **`test + build`** (`npm test` + `npm run build`) and **`e2e (playwright)`** (`npx playwright install --with-deps chromium` + `npm run test:e2e`, uploads the HTML report artifact).

### End-to-End Testing (Playwright)

`playwright.config.js` builds the app and serves it with `vite preview`, then drives it in headless Chromium.

- **Pinned runtime**: `@playwright/test@1.56.0` matches the web environment's pre-installed `chromium-1194`; the config points `launchOptions.executablePath` at `/opt/pw-browsers/chromium-1194/...` when present, else lets Playwright resolve its own download (so CI works after `playwright install`).
- **Serial** (`workers: 1`): each reader spec spins up an epubjs/pdf.js render; several at once against the single preview server starved each other past the assertion timeout. The suite is small, so determinism wins.
- **Same-origin trick**: the E2E build sets `VITE_SUPABASE_URL` to the preview server's own origin (`http://localhost:4173`). Every Supabase call is then same-origin, so route interception catches it with **no CORS preflight** — the app's `sb.js` sends `Content-Type: application/json` on GETs, which would otherwise force a cross-origin preflight that doesn't survive mocking. The auth storage key follows the host → `sb-localhost-auth-token`.

**Helpers (`e2e/helpers/`)**
- `auth.js` — `mockAuth(page, {seedLocalStorage})` seeds a fake far-future Supabase session in localStorage (supabase-js reads the session from there) and intercepts all `/auth/v1/**` + `/rest/v1/**` calls (empty result sets); also skips first-run overlays and disables CSS transitions. `mockReaderBook(page, {bookId, epubBuffer|bytes, fileType})` serves one `ebook_files` row + the file bytes so a catalogue book is openable. `mockPdfRuntime(page)` serves `pdf.js` from the bundled `pdfjs-dist` build instead of the CDN the reader loads it from (hermetic). `ytTokenSeed()` returns a far-future `yt_token` localStorage seed so the Music section skips its YouTube OAuth connect screen; `mockYouTube(page)` mocks the googleapis playlist/search endpoints and the embed iframe so playback runs offline. `mockPaintAdvisor(page, payload?)` mocks the serverless `/api/paint-advisor` proxy with a Claude-shaped response so the Painting AI Color Advisor renders schemes without an Anthropic key. No real Google OAuth, Anthropic, or backend is ever touched; UI runs off static bundled data.
- `reader.js` — `expectTextInAnyFrame(page, text)` asserts a chapter rendered. Uses **`textContent`, not `innerText`** (innerText drops text in off-screen paginated columns) and polls **every** frame (epubjs keeps several rendered iframes).

**Fixtures** are generated, committed, and regenerable: `scripts/make-test-epub.mjs` → `e2e/fixtures/test-book.epub` (2 chapters, known phrases); `scripts/make-test-pdf.mjs` → `e2e/fixtures/test-book.pdf` (2 pages, computed xref offsets).

**Specs**: `login` (pre-auth landing + EN/IT) · `app-shell` (auth → universe select → nav) · `reader` (open EPUB, render chapter) · `reader-interactions` (bookmark + TOC) · `reader-controls` (settings font-size/theme, in-book search → jump, selection toolbar anchoring) · `reader-pdf` (open PDF, page counter) · `aos` (AoS universe + Path to Glory) · `library` (catalogue → detail → open reader) · `stats` (Deeds & Honour modal: tabs + close) · `backup` (export download + import validation/confirm) · `painting` (gallery/army/collection tabs + AI Color Advisor) · `music` (paste YouTube link → play + header mini player follows across sections).

**Gotchas**
- Assert reader content (chapter text / `1 / 2` page counter), **not** the book title — the shelf/catalogue cover renders a text fallback with the same title, so a title locator collides under load.
- `retries: 1` (CI only) absorbs an occasional headless epubjs render miss under full-suite load; the suite is green in CI with it. In isolation each reader spec is stable.
- When adding a reader/data flow, call `mockReaderBook` **after** `mockAuth` — Playwright matches the last-registered route first, so the specific `ebook_files`/storage routes must win over the generic `/rest/v1/**` handler.
- Modal tabs (Stats, Painting) collide with the bottom-nav buttons sitting behind them: the nav button's accessible name is the bare label (`Painting`) while the modal tab carries an emoji prefix (`🎨 Painting`). Match the modal tab by its **exact emoji-prefixed name** so the locator can't resolve to the covered nav button.
- The E2E build sets a dummy `VITE_GOOGLE_CLIENT_ID` (`playwright.config.js`) so the Music section renders its real YouTube flow instead of the "not configured" placeholder — `mockYouTube` + `ytTokenSeed` keep it hermetic.
- Many step/tip/hint strings repeat a paint or term (e.g. "Macragge Blue" in both a scheme tip and a step row) — assert with `{ exact: true }` to avoid strict-mode multi-match.
