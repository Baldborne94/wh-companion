#!/usr/bin/env node
// Download real book covers and self-host them under public/covers/.
//
// Why this exists: Open Library / Google Books *title* lookups (the old runtime
// fallback in CoverImage.jsx) routinely matched the wrong book — e.g. False Gods
// showed "The Enemy Within", The Magos showed a climate-change textbook. This
// script resolves each cover from sources keyed on stable identifiers, downloads
// the image once, and writes src/data/covers.js so the app serves covers locally.
//
// Sources, tried in order per book (first hit wins):
//   1. Google Books by ISBN        — exact, when the book has an isbn field
//   2. Warhammer Fandom wiki page  — lead image of the book's own article
//   3. Google Books by title+author
//
// Network: needs egress to www.googleapis.com, books.google.com,
// warhammer40k.fandom.com, ageofsigmar.fandom.com, whfb.lexicanum.com and
// static.wikia.nocookie.net. This environment's allowlist blocks them, so run
// this where the network is open (locally, CI, or after widening egress), then
// commit public/covers/ and src/data/covers.js.
//
// Usage:
//   node scripts/fetch-covers.mjs            # fetch all, skip already-downloaded
//   node scripts/fetch-covers.mjs --force    # re-fetch everything
//   node scripts/fetch-covers.mjs --only 2,3,aos14   # only these ids

import { writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const COVERS_DIR = join(ROOT, "public", "covers");
const MANIFEST = join(ROOT, "src", "data", "covers.js");
const REPORT = join(ROOT, "covers-report.json");

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const onlyArg = argv[argv.indexOf("--only") + 1];
const ONLY = argv.includes("--only") && onlyArg ? new Set(onlyArg.split(",")) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadBooks() {
  const wh40k = await import(join(ROOT, "src", "data", "books.js"));
  const aos = await import(join(ROOT, "src", "data", "aosBooks.js"));
  // 40k uses the 40k Fandom wiki; AoS + Old World use the AoS wiki.
  const list = [
    ...wh40k.BOOKS.map((b) => ({ ...b, wiki: "warhammer40k" })),
    ...aos.AOS_BOOKS.map((b) => ({ ...b, wiki: "ageofsigmar" })),
  ];
  return list.map((b) => ({ ...b, id: String(b.id) }));
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "wh-companion-cover-fetcher" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// 1. Google Books keyed on ISBN — exact match, never the wrong book.
async function fromGoogleIsbn(book) {
  if (!book.isbn) return null;
  const d = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${book.isbn}&maxResults=1&fields=items(volumeInfo/imageLinks)`
  );
  return pickGoogleThumb(d);
}

// 2. The book's own Fandom article — its infobox image is the cover.
// Resolve by EXACT page title only (with type suffixes / "The"-stripping), never
// full-text search: search drifts to characters/factions/series pages and returns
// their art instead of the book cover (e.g. Soul Hunter -> "Talos Valcoran").
function fandomTitleCandidates(title) {
  const variants = new Set();
  const bases = [title];
  if (/^the\s+/i.test(title)) bases.push(title.replace(/^the\s+/i, ""));
  for (const b of bases) {
    variants.add(b);
    variants.add(`${b} (Novel)`);
    variants.add(`${b} (Novella)`);
    variants.add(`${b} (Anthology)`);
    variants.add(`${b} (Short Story)`);
    variants.add(`${b} (Audio Drama)`);
  }
  return [...variants];
}

async function fromFandom(book) {
  const host = `${book.wiki}.fandom.com`;
  for (const cand of fandomTitleCandidates(book.title)) {
    let page;
    try {
      page = await fetchJson(
        `https://${host}/api.php?action=query&prop=pageimages&piprop=original&redirects=1&format=json&origin=*&titles=${encodeURIComponent(
          cand
        )}`
      );
    } catch {
      continue;
    }
    const pages = page?.query?.pages || {};
    const first = Object.values(pages)[0];
    if (!first || first.missing !== undefined) continue; // page doesn't exist
    const src = first.original?.source;
    if (src) return { url: src, via: `fandom:${first.title || cand}` };
  }
  return null;
}

function pickGoogleThumb(d) {
  const links = d?.items?.[0]?.volumeInfo?.imageLinks;
  if (!links) return null;
  const url = (links.thumbnail || links.smallThumbnail || "")
    .replace("http://", "https://")
    .replace("&edge=curl", "")
    .replace("zoom=1", "zoom=2");
  return url ? { url, via: "googleBooks" } : null;
}

function extFromUrl(url, contentType) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg")) return "jpg";
  const m = url.split("?")[0].match(/\.(png|jpe?g|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

async function download(url, id) {
  const r = await fetch(url, { headers: { "User-Agent": "wh-companion-cover-fetcher" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} downloading ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1024) throw new Error("image too small, likely a placeholder");
  const ext = extFromUrl(url, r.headers.get("content-type"));
  const file = `${id}.${ext}`;
  await writeFile(join(COVERS_DIR, file), buf);
  return `/covers/${file}`;
}

async function existingFor(id) {
  try {
    const files = await readdir(COVERS_DIR);
    const f = files.find((n) => n.replace(/\.[^.]+$/, "") === id);
    return f ? `/covers/${f}` : null;
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(COVERS_DIR, { recursive: true });
  const books = await loadBooks();
  const map = {};
  const report = { ok: [], missed: [], errors: [] };

  for (const book of books) {
    if (ONLY && !ONLY.has(book.id)) continue;

    if (!FORCE) {
      const have = await existingFor(book.id);
      if (have) {
        map[book.id] = have;
        continue;
      }
    }

    // Only correct-by-construction sources: ISBN-exact, then exact wiki page.
    // No fuzzy title search — that was the original wrong-cover bug.
    const strategies = [fromGoogleIsbn, fromFandom];
    let saved = null;
    let via = null;
    for (const strat of strategies) {
      try {
        const res = await strat(book);
        if (res?.url) {
          saved = await download(res.url, book.id);
          via = res.via || strat.name;
          break;
        }
      } catch (e) {
        report.errors.push({ id: book.id, title: book.title, strat: strat.name, error: String(e.message || e) });
      }
      await sleep(120); // be polite to the APIs
    }

    if (saved) {
      map[book.id] = saved;
      report.ok.push({ id: book.id, title: book.title, via, path: saved });
      console.log(`✓ ${book.id.padEnd(7)} ${book.title}  (${via})`);
    } else {
      report.missed.push({ id: book.id, title: book.title });
      console.log(`✗ ${book.id.padEnd(7)} ${book.title}  — no cover found`);
    }
  }

  // Merge with any covers already recorded so --only / incremental runs don't drop entries.
  let prev = {};
  if (existsSync(MANIFEST)) {
    try {
      const txt = await readFile(MANIFEST, "utf8");
      const m = txt.match(/COVERS\s*=\s*(\{[\s\S]*?\});/);
      if (m) prev = JSON.parse(m[1].replace(/,(\s*})/g, "$1"));
    } catch {}
  }
  const merged = { ...prev, ...map };
  const sorted = Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  );

  const body =
    "// Self-hosted book cover map: book.id → local path under /public/covers/.\n" +
    "// Generated by scripts/fetch-covers.mjs — do not edit by hand.\n" +
    "// When a cover is present here, CoverImage uses it directly (correct, offline-cacheable)\n" +
    "// and never falls back to the unreliable Open Library / Google Books fuzzy lookup.\n" +
    "export const COVERS = " +
    JSON.stringify(sorted, null, 2) +
    ";\n";
  await writeFile(MANIFEST, body);
  await writeFile(REPORT, JSON.stringify(report, null, 2));

  console.log(
    `\nDone. ${report.ok.length} fetched, ${report.missed.length} missed. ` +
      `Manifest has ${Object.keys(sorted).length} covers. Review covers-report.json for misses.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
