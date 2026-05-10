# WH40K Companion — Project Onboarding

## What this app is
A Warhammer 40,000 companion app built with **React 18 + Vite 5**, deployed on **Vercel**, database on **Supabase**.

Live URL: `https://wh40k-companion-omega.vercel.app`
GitHub repo: `https://github.com/Baldborne94/wh40k-companion`
Vercel project: `https://vercel.com/loprestialessandro94-2004s-projects/wh40k-companion`
Supabase project: `https://supabase.com/dashboard/project/xrcaxmoviaidghjeqedf`

## Tech stack
- React 18 + Vite 5 (SPA, no router — state-based navigation)
- Supabase (PostgreSQL + RLS + Storage buckets for ebooks and photos)
- Vercel (auto-deploy on push to `main`)
- No external EPUB library — custom JSZip parser in `src/App.jsx`

## App sections (bottom nav)
1. **LIBRARY** — 238 WH40K books with cover art, series, factions
2. **LORE** — Lore encyclopedia / factions
3. **READING** — Reading order tracker
4. **PAINTING** — Miniature painting tracker (`src/components/PaintingTracker.jsx`)

## Key files
| File | Purpose |
|------|---------|
| `src/App.jsx` | Entire app — all components live here (monolith for now) |
| `src/lib/supabase.js` | Supabase client + helper `db` and `storage` objects |
| `src/components/PaintingTracker.jsx` | Painting tracker component |
| `index.html` | PWA meta, no CDN scripts (epub.js removed) |
| `supabase/migrations/001_initial_schema.sql` | DB schema reference |
| `.env.example` | Template for env vars |

## Environment variables
Both set on Vercel (Production & Preview) and in local `.env`:
```
VITE_SUPABASE_URL=https://xrcaxmoviaidghjeqedf.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_vH3pVq00MZbjGKuf7ZH2Hw_Xr8WbKGx
```
The anon key is a **publishable** key — safe in client code, security enforced via RLS.

## Supabase DB tables
- `ebook_files` — tracks which EPUB/PDF a user uploaded per book (`user_id`, `book_id`, `file_path`, `file_type`)
- `reading_progress` — reading position per user per book (`chapter_index`, `page_index`, `progress_pct`, `last_read`)
- Both tables have RLS: users can only access their own rows
- Storage bucket: `ebooks` (private) — path pattern: `{user_id}/{book_id}.{ext}`

## EPUB Reader (EpubReader component in App.jsx ~line 295)
The main feature. Key capabilities:
- Custom JSZip parser: extracts chapters, converts images to base64
- **CSS column-based pagination** (`column-width` + `transform: translateX`)
- **Scroll mode** as alternative to pagination
- **Lore keyword highlighting**: regex replaces WH40K terms with gold `<span data-kw>` → click opens LorePanel
- **Dictionary on text selection**: calls `api.dictionaryapi.dev`
- **Fullscreen** (`document.fullscreenElement` / `requestFullscreen`)
- **TOC** (table of contents sidebar)
- **Settings panel**: font size, font family, line height, theme, columns, pagination toggle
- **Touch gestures**: swipe left/right for page navigation
- **Keyboard shortcuts**: Arrow keys / Space (next page), Escape (close), F (fullscreen), T (TOC)
- **Reading time estimate**: word count / 250 wpm
- **Chapter resume**: saves `chapter_index` + `page_index` + `progress_pct` to Supabase on every page turn
- **Lore hint**: shown once, persisted in `localStorage("wh40k_lore_hint")`

## Auth
- Google OAuth via Supabase (`signInWithGoogle` in `supabase.js`)
- Redirect to `window.location.origin` after login
- Auth state tracked with `supabase.auth.onAuthStateChange`

## How to work on this project via Claude (no local machine needed)
1. Load this onboarding file at the start of each session
2. Ask Claude to read specific files via GitHub API or direct file reads
3. Claude commits changes directly to GitHub via API using a PAT token
4. Vercel auto-deploys on every push to `main`

## Decisions made
- **No epub.js**: removed CDN — app uses custom JSZip parser already built in App.jsx
- **Monolith App.jsx**: intentional for now — all components in one file for simplicity
- **Supabase anon key in client**: correct and safe — RLS policies enforce per-user access
- **`reading_progress` upsert conflict on `(user_id, book_id)`**: needs `onConflict` set correctly in supabase.js
