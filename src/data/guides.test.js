import { describe, it, expect } from "vitest";
import { BOOKS } from "./books.js";
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
  }
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
