# WH40K Companion — Project Context for Claude

## What This Is

A Warhammer 40,000 + Age of Sigmar companion PWA. React 18 + Vite 5 SPA, Supabase (PostgreSQL + Storage + Auth), deployed on Vercel. Users can read EPUB/PDF ebooks, track reading progress, track miniature painting, listen to ambient music, and browse lore — all synced to their Google account.

## Repository Layout

```
wh40k-companion/          ← git root
└── wh40k-companion/      ← actual Vite project (cd here to run npm commands)
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── public/
    │   ├── manifest.json      ← PWA manifest (orientation: "any")
    │   ├── icon.svg / icon-192.png / icon-512.png
    │   ├── aquila.png         ← WH40K logo asset
    │   └── sigmar.png
    └── src/
        ├── App.jsx            ← monolith: all sections, nav, state (~1900 lines)
        ├── main.jsx
        ├── index.css
        ├── components/
        │   ├── AoSApp.jsx         ← Age of Sigmar universe module
        │   ├── EpubReader.jsx     ← EPUB reader (CFI bookmarks, paginate/scroll)
        │   ├── PdfReader.jsx      ← PDF reader
        │   ├── MusicPlayer.jsx    ← YouTube + Spotify player (forwardRef)
        │   ├── PaintingTracker.jsx
        │   ├── LoginPage.jsx      ← Google OAuth landing page
        │   ├── CoverImage.jsx
        │   └── UniverseSelector.jsx
        ├── data/
        │   ├── books.js       ← 230+ book catalogue
        │   ├── constants.js   ← C (colours), FC (faction colours), THEMES, FONTS, STATUS_CFG
        │   ├── lore.js        ← WH40K keyword→wiki DB + KW_REGEX
        │   └── hhGuide.js     ← Horus Heresy reading order (11 parts)
        └── lib/
            ├── supabase.js    ← createClient, signInWithGoogle, signOut
            └── sb.js          ← fetch-based REST helpers (sb.get, sb.upsert, sb.del, sb.storage)
```

## Dev Commands

```bash
cd wh40k-companion/wh40k-companion
npm run dev       # local dev server
npm run build     # production build — ALWAYS run before committing to verify no errors
npm run preview   # preview production build
```

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GOOGLE_CLIENT_ID=...      # YouTube OAuth (optional)
VITE_SPOTIFY_CLIENT_ID=...     # Spotify OAuth (optional)
```

Set in `.env` locally and in Vercel project settings for deployment.

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

Storage: private `ebooks` bucket at `{user_id}/{book_id}/{filename}`.  
Signed URLs (2h TTL) via `sb.storage.signedUrl(path)`.

## App Architecture

### Navigation

Single-page app with a bottom nav bar. Sections: `home`, `library`, `reading` (Crusade/Path to Glory), `lore`, `music`, `painting`, `oracle`.

```js
// In App.jsx
const NAV = [
  { id:"home",    label:"Home",   icon:"⚔" },
  { id:"library", label:"Library",icon:"📚" },
  { id:"reading", label:"Crusade",icon:"🗡" },  // label becomes "Path to Glory" for AoS
  { id:"lore",    label:"Lore",   icon:"📖" },
  { id:"music",   label:"Music",  icon:"🎵" },
  { id:"painting",label:"Painting",icon:"🎨"},
  { id:"oracle",  label:"Oracle", icon:"🔮" },
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

- **Working branch**: `claude/relaxed-fermat-QZW5d`
- **Deploy target**: `main` (Vercel auto-deploys on merge)
- **Merge strategy**: Squash merge via GitHub MCP tools
- **After squash merge**: new PR from same branch conflicts with main → always `git fetch origin main && git rebase origin/main` before next push

Standard flow:
```bash
# make changes
npm run build                          # verify no errors
git add <specific files>
git commit -m "feat/fix: description"
git push -u origin claude/relaxed-fermat-QZW5d
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

## Known Behaviors & Gotchas

- **PWA cache**: After manifest changes, users must reinstall the PWA (remove from homescreen + re-add) to pick up new orientation settings.
- **Tablet rotation**: Root cause was PWA manifest `portrait-primary` cached from old install + `user-scalable=no`. Both fixed. Body zoom (not html zoom) is essential for Android rotation.
- **MusicPlayer always mounted**: Never conditionally render MusicPlayer or music stops. It sits at z-index 0 under the content area, becomes z-index 2 only when Music section is active.
- **Squash merge conflicts**: Every new PR on the same branch after a squash merge will show conflicts. Fix: `git rebase origin/main` (drops already-upstream commits).
- **Draft PR merge**: GitHub API returns 405 on draft PRs. Always call `update_pull_request(draft: false)` first.
- **Spotify pause**: Uses `postMessage({ command: "pause" }, "https://open.spotify.com")`. Works for the embedded player if Spotify supports it in the embed context. YouTube pause is reliable with `enablejsapi=1`.
- **Signed URLs**: Ebook files are in a private Supabase bucket. Always use signed URLs (2h TTL) — never expose the file path directly.
- **Reading progress localStorage**: Primary fast storage. Supabase is a backup for new devices.

## UI Conventions

- **Fonts**: `'Cinzel Decorative'` for titles, `'Cinzel'` for labels/buttons — imported from Google Fonts in LoginPage.jsx CSS.
- **No comments in code** unless the WHY is non-obvious.
- **No external UI libraries** — all styles are inline JSX objects.
- **Language**: UI labels in English. Code comments in English. User-facing text can be Italian (the owner is Italian).
- **Merge method**: Always squash.
