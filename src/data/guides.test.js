import { describe, it, expect } from "vitest";
import { BOOKS } from "./books.js";
import { AOS_BOOKS } from "./aosBooks.js";
import { START_40K } from "./start40k.js";
import { HH_FULL, HH_MIN, HH_OPTIONAL, findHHBook } from "./hhGuide.js";
import { AOS_ESSENTIAL, findAoSGuideBook } from "./aosGuide.js";

// R7 — reading-guide referential integrity. The guides point into the book
// catalogues by id / aos_id / title. A typo'd reference renders a broken row to
// the user with no build error. These tests fail the moment a guide references a
// book that doesn't resolve.

// Collect every { id } referenced anywhere in a START_40K step (top-level books
// or pickOne options).
function startIds() {
  const ids = [];
  for (const step of START_40K) {
    for (const b of step.books ?? []) ids.push(b.id);
    for (const opt of step.options ?? []) for (const b of opt.books ?? []) ids.push(b.id);
  }
  return ids;
}

// Flatten all book entries of a Horus Heresy guide (parts + pickOne options).
function hhEntries(guide) {
  const out = [];
  for (const part of guide) {
    for (const b of part.books ?? []) out.push(b);
    for (const opt of part.options ?? []) for (const b of opt.books ?? []) out.push(b);
  }
  return out;
}

// Flatten all AOS_ESSENTIAL book entries.
function aosEntries() {
  return AOS_ESSENTIAL.flatMap((part) => part.books ?? []);
}

const bookIds = new Set(BOOKS.map((b) => b.id));

describe("START_40K newcomer guide (R7)", () => {
  it("references at least one book", () => {
    expect(startIds().length).toBeGreaterThan(0);
  });

  it("every referenced book id exists in the catalogue", () => {
    const missing = startIds().filter((id) => !bookIds.has(id));
    expect(missing).toEqual([]);
  });

  it("has no duplicate ids within a single pickOne option set", () => {
    for (const step of START_40K) {
      for (const opt of step.options ?? []) {
        const ids = (opt.books ?? []).map((b) => b.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

describe("Horus Heresy guides (R7)", () => {
  // Numbered entries (n) are core spine novels — they MUST resolve. Shorts and
  // anthologies (marked type:"short"/src:…) are matched leniently and may live
  // outside the catalogue, so we don't assert on them here.
  for (const [name, guide] of [["HH_FULL", HH_FULL], ["HH_MIN", HH_MIN], ["HH_OPTIONAL", HH_OPTIONAL]]) {
    it(`${name}: every numbered novel resolves to a catalogue book`, () => {
      const unresolved = hhEntries(guide)
        .filter((e) => typeof e.n === "number" && e.t)
        .filter((e) => !findHHBook(e))
        .map((e) => e.t);
      expect(unresolved).toEqual([]);
    });

    it(`${name}: the guide's reading number matches the catalogue's num`, () => {
      // The `n` shown in the guide must equal the book's canonical `num`, else
      // the user is told the wrong reading-order position.
      const mismatches = hhEntries(guide)
        .filter((e) => typeof e.n === "number" && e.t)
        .map((e) => ({ t: e.t, guideN: e.n, bookNum: findHHBook(e)?.num }))
        .filter((r) => r.bookNum !== r.guideN);
      expect(mismatches).toEqual([]);
    });

    it(`${name}: no two entries share the same reading number`, () => {
      const nums = hhEntries(guide).filter((e) => typeof e.n === "number").map((e) => e.n);
      const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
      expect([...new Set(dupes)]).toEqual([]);
    });
  }
});

// ─── catalogue saga numbering — both universes ─────────────────────────────────
// Within a saga, `num` is the reading position. Two books sharing a num (or a
// gap) means a mis-numbered series. We assert uniqueness per series (gaps can be
// legitimate — omnibus/anthology side-entries — so we don't force contiguity).
function dupeNumsBySeries(catalogue) {
  const bySeries = {};
  for (const b of catalogue) {
    if (!b.series || b.series === "Standalone" || b.series === "Codex") continue;
    // num:0 (or absent) is the sentinel for "unnumbered / loose category"
    // (e.g. Battletome, Astra Militarum collections) — not an ordered saga.
    if (typeof b.num !== "number" || b.num <= 0) continue;
    (bySeries[b.series] ??= []).push(b.num);
  }
  const offenders = [];
  for (const [series, nums] of Object.entries(bySeries)) {
    const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
    if (dupes.length) offenders.push({ series, dupes: [...new Set(dupes)] });
  }
  return offenders;
}

// Short stories / audios are placed in the HH reading order with a `src` of the
// form "Anthology Title (N)", where N is the anthology's catalogue num — a
// pointer telling the reader where to find the piece. A wrong N sends the reader
// to the wrong collection, with no build error.
function shortSrcRefs() {
  const SRC_RE = /^(.+?)\s*\((\d+)\)\s*$/;
  const refs = [];
  for (const guide of [HH_FULL, HH_OPTIONAL]) {
    for (const e of hhEntries(guide)) {
      if (!e.src || (e.type !== "short" && e.type !== "audio")) continue;
      const m = SRC_RE.exec(e.src);
      if (!m) continue; // "Unprinted", "Scions of the Emperor" — no number to check
      refs.push({ story: e.t, anthology: m[1].trim(), srcNum: Number(m[2]) });
    }
  }
  return refs;
}

const findAnthology = (title) => {
  const tl = title.toLowerCase();
  const hh = BOOKS.filter((b) => b.series === "Horus Heresy");
  return hh.find((b) => b.title.toLowerCase() === tl) ||
         hh.find((b) => b.title.toLowerCase().includes(tl)) ||
         // reverse direction: guide uses a descriptive label ("Tallarn Anthology")
         // for a catalogue title ("Tallarn"). Length guard avoids spurious hits.
         hh.find((b) => b.title.length >= 5 && tl.includes(b.title.toLowerCase())) || null;
};

describe("Horus Heresy short stories (R7)", () => {
  it("references at least one numbered anthology", () => {
    expect(shortSrcRefs().length).toBeGreaterThan(0);
  });

  it("every short's anthology resolves and its number matches the catalogue", () => {
    const problems = shortSrcRefs()
      .map((r) => ({ ...r, bookNum: findAnthology(r.anthology)?.num ?? null }))
      .filter((r) => r.bookNum !== r.srcNum);
    expect(problems).toEqual([]);
  });
});

describe("catalogue saga numbering (R7)", () => {
  it("WH40K: no series has two books sharing the same num", () => {
    expect(dupeNumsBySeries(BOOKS)).toEqual([]);
  });

  it("AoS: no series has two books sharing the same num", () => {
    expect(dupeNumsBySeries(AOS_BOOKS)).toEqual([]);
  });
});

describe("AOS_ESSENTIAL guide (R7)", () => {
  it("references books", () => {
    expect(aosEntries().length).toBeGreaterThan(0);
  });

  it("every entry with an aos_id resolves to an AoS catalogue book", () => {
    const unresolved = aosEntries()
      .filter((e) => e.aos_id)
      .filter((e) => !findAoSGuideBook(e))
      .map((e) => e.aos_id);
    expect(unresolved).toEqual([]);
  });
});
