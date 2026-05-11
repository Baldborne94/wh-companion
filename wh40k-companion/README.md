# ⚜ WH40K Companion

> *In the grim darkness of the far future, there is only war — and this app.*

A progressive web app (PWA) for Warhammer 40,000 fans: a full Black Library catalogue, an in-app EPUB/PDF reader, reading-progress tracking, faction lore, painting guides and more. Deployed at **https://wh40k-companion-omega.vercel.app/** — no installation required.

---

## Features

### 📚 Library
- 230+ Black Library titles (novels, novellas, anthologies) with series info, author, faction and era
- Catalogue view with filters (series, faction, type, era) and full-text search
- Three display modes: Card · List · Shelf
- Reading-status badges: **To Read · Reading · Read ✓**
- My Shelf tab — lists only books with an uploaded ebook file

### 📖 Built-in EPUB/PDF Reader
- Upload your own DRM-free EPUB or PDF files (stored privately in Supabase Storage)
- **Paginated mode** — CSS multi-column layout, single or two-page spread
- **Scroll mode** — continuous full-book scrolling, all chapters concatenated
- Always-visible top/bottom bars; side arrows in single-page mode
- Four themes: Grimdark · Sepia · Paper
- Font, font-size, line-height and margin controls
- **Bookmarks** — save up to 30 positions per book; panel shows chapter label, progress %, date; navigates back to exact position in both modes
- Auto-saves reading progress (chapter + page in paginate mode; exact `scrollTop` in scroll mode)
- Resumes from last position when reopening a book
- Lore keywords highlighted in blue — tap to open Fandom Wiki
- Select any word → inline dictionary lookup
- Fullscreen mode; keyboard shortcuts (← →, F, T, Esc)
- Reading-time estimate per chapter

### 📊 Crusade (Reading Tracker)
- Overview of all series with per-series progress bars
- Stats: Read / Reading / To Read / Total
- "Continue Reading" suggestion — shows the active series and next book
- Expandable series view with per-book status icons

### ⚔️ Lore (Encyclopedia)
- Faction overviews with key facts
- Timeline of major eras (Age of Terra → Dark Imperium)
- Primarchs reference (all XX Primarchs, status, fate)
- Links to Fandom Wiki for each entry

### 🎨 Painting
- Colour-recipe tracker for your miniatures (Citadel, AK Interactive, Vallejo)
- Steps, notes and progress per model

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Styling | Inline JSX styles — zero external UI libraries |
| EPUB parsing | JSZip (CDN) |
| Auth | Supabase Auth (Google OAuth) |
| Database | Supabase PostgreSQL (`reading_progress`, `ebook_files`) |
| Storage | Supabase Storage — private `ebooks` bucket |
| Fonts | Google Fonts — Cinzel, Cinzel Decorative, Lora, Merriweather, Open Sans |
| Deploy | Vercel (auto-deploy on `git push main`) |
| PWA | `manifest.json` + icons — installable on mobile |

---

## Quick start (local)

```bash
# 1. Clone and install
git clone https://github.com/Baldborne94/wh40k-companion.git
cd wh40k-companion/wh40k-companion
npm install

# 2. Add environment variables — create a .env file:
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...

# 3. Start dev server
npm run dev
# → http://localhost:5173
```

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo
3. Add environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in project settings
4. **Deploy** — every `git push main` triggers an automatic redeploy ✅

---

## Project structure

```
wh40k-companion/
├── public/
│   ├── manifest.json        ← PWA manifest (installable on phone)
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   ├── App.jsx              ← Main app — all components & data
│   ├── components/
│   │   └── PaintingTracker.jsx
│   ├── lib/
│   │   └── supabase.js
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
└── package.json
```

---

## Supabase schema

```sql
-- Ebook file metadata
create table ebook_files (
  id         bigint primary key generated always as identity,
  user_id    uuid references auth.users,
  book_id    int not null,
  file_path  text not null,
  created_at timestamptz default now()
);

-- Reading progress (auto-saved)
create table reading_progress (
  user_id       uuid references auth.users,
  book_id       int not null,
  chapter_index int default 0,
  page_index    int default 0,
  progress_pct  float default 0,
  last_read     timestamptz default now(),
  primary key (user_id, book_id)
);
```

Storage: private bucket named `ebooks`. Each file is stored at `{user_id}/{book_id}.epub`.

---

*Unofficial fan project. Warhammer 40,000 is © Games Workshop Ltd. All book titles belong to their respective copyright holders.*
