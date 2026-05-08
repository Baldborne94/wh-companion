# ⚜ WH40K Companion

> *In the grim darkness of the far future, there is only war — and this app.*

A complete Warhammer 40,000 companion web app: Black Library catalogue, faction lore, reading order, painting guides and an AI oracle.

## Features

- 📚 **Library** — 230+ Black Library titles with filters, search, mark-as-read and built-in EPUB/PDF reader
- ⚔️ **Factions** — Lore, history and key characters for every faction *(coming soon)*
- 📖 **Reading Order** — Guided paths for new and veteran readers *(coming soon)*
- 🎨 **Painting** — Colour guides and cross-brand recipes (Citadel, AK Interactive, Vallejo…) *(coming soon)*
- 🤖 **The Oracle** — AI chatbot powered by Claude *(coming soon)*

## Quick start (local)

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open http://localhost:5173
```

## Deploy to Vercel (free, automatic)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. Import the GitHub repo
4. Leave all settings as default → **Deploy**
5. Your app is live at `https://your-project.vercel.app` ✅

Every `git push` to `main` triggers an automatic redeploy.

## Generate APK (Android)

```bash
# 1. Build the web app
npm run build

# 2. Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# 3. Init Capacitor
npx cap init "WH40K Companion" "com.wh40k.companion"

# 4. Add Android platform
npx cap add android

# 5. Copy build
npx cap copy android

# 6. Open in Android Studio
npx cap open android

# 7. Build → Generate Signed APK
```

## Project structure

```
wh40k-companion/
├── public/
│   ├── manifest.json    ← PWA manifest (installable on phone)
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   ├── App.jsx          ← Main app (all components)
│   ├── main.jsx         ← React entry point
│   └── index.css        ← Global styles
├── index.html
├── vite.config.js
└── package.json
```

## Tech stack

- **React 18** + **Vite 5**
- **JSZip** (EPUB parsing, loaded from CDN)
- **Google Fonts** — Cinzel & Cinzel Decorative
- Zero external UI libraries — fully custom grimdark design

---

*Unofficial fan project. Warhammer 40,000 is © Games Workshop Ltd.*
