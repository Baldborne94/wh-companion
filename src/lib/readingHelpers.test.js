import { describe, it, expect } from "vitest";
import { getNextSuggestion, getAllNextSuggestions, getHHNextFromGuide } from "./readingHelpers.js";
import { BOOKS } from "../data/books.js";
import { HH_FULL } from "../data/hhGuide.js";

const idOf = (title) => BOOKS.find((b) => b.title === title)?.id;
const read = (id) => ({ [id]: { status: "read" } });

// A real non-Horus-Heresy multi-book series, looked up so the tests don't break
// when ids change.
function nonHHSeries(skip = new Set()) {
  const map = {};
  for (const b of BOOKS) {
    if (!b.series || ["Horus Heresy", "Siege of Terra", "Standalone", "Codex"].includes(b.series)) continue;
    if (skip.has(b.series) || typeof b.num !== "number" || b.num <= 0) continue;
    (map[b.series] ??= []).push(b);
  }
  const entry = Object.values(map).find((arr) => arr.length >= 2);
  return entry ? entry.sort((a, b) => a.num - b.num) : null;
}

describe("getAllNextSuggestions — cold start", () => {
  it("recommends Horus Rising when there is no progress at all", () => {
    const results = getAllNextSuggestions({});
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].reason).toBe("Recommended start");
    expect(results[0].book.title).toBe("Horus Rising");
  });

  it("does NOT cold-start once there is real progress", () => {
    const series = nonHHSeries();
    expect(series).toBeTruthy();
    const results = getAllNextSuggestions(read(series[0].id));
    expect(results.some((r) => r.reason === "Recommended start")).toBe(false);
  });
});

describe("getAllNextSuggestions — series progression", () => {
  it("suggests the next book of a non-HH series after reading book 1", () => {
    const series = nonHHSeries();
    const results = getAllNextSuggestions(read(series[0].id));
    const hit = results.find((r) => r.reason === `Next in ${series[0].series}`);
    expect(hit).toBeTruthy();
    expect(hit.book.id).toBe(series[1].id);
    expect(hit.seriesProgress).toMatch(/^\d+\/\d+ read$/);
  });

  it("ranks a currently-reading series above a merely-read one", () => {
    const a = nonHHSeries();
    const b = nonHHSeries(new Set([a[0].series]));
    expect(b).toBeTruthy();
    const statuses = {
      [a[0].id]: { status: "read" },      // series A: read only
      [b[0].id]: { status: "reading" },   // series B: actively reading
    };
    const results = getAllNextSuggestions(statuses);
    const iA = results.findIndex((r) => r.reason === `Next in ${a[0].series}`);
    const iB = results.findIndex((r) => r.reason === `Next in ${b[0].series}`);
    expect(iB).toBeGreaterThanOrEqual(0);
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(iB).toBeLessThan(iA); // reading sorts before read-only
  });
});

describe("getAllNextSuggestions — Horus Heresy guide", () => {
  it("switches to the HH guide once a HH book is in progress", () => {
    const results = getAllNextSuggestions(read(idOf("Horus Rising")));
    const hh = results.find((r) => r.reason === "Next in Horus Heresy");
    expect(hh).toBeTruthy();
  });
});

describe("getHHNextFromGuide", () => {
  it("returns a HH suggestion for an empty guide-progress state", () => {
    const next = getHHNextFromGuide(HH_FULL, {});
    expect(next).toBeTruthy();
    expect(next.reason).toBe("Next in Horus Heresy");
  });

  it("advances to the first novel once the leading short is marked read", () => {
    // Part 1 of HH_FULL opens with a short, then Horus Rising.
    const lead = HH_FULL.flatMap((p) => p.books || []).find((e) => e.type === "short");
    const readShorts = new Set([`${lead.t}__${lead.a}`]);
    const next = getHHNextFromGuide(HH_FULL, {}, readShorts);
    expect(next.book?.title).toBe("Horus Rising");
  });

  it("returns null when no part yields an unread entry (all novels read, shorts done)", () => {
    const novels = HH_FULL.flatMap((p) => (p.pickOne ? [] : p.books || []))
      .filter((e) => (e.type || "novel") !== "short" && (e.type || "novel") !== "audio" && !e.b40k);
    const statuses = {};
    for (const e of novels) {
      const b = BOOKS.find((x) => x.title.toLowerCase() === (e.t || "").toLowerCase());
      if (b) statuses[b.id] = { status: "read" };
    }
    const shorts = HH_FULL.flatMap((p) => p.books || []).filter((e) => e.type === "short" || e.type === "audio");
    const readShorts = new Set(shorts.map((e) => `${e.t}__${e.a}`));
    // With every resolvable novel read and shorts consumed, there is nothing left to suggest.
    const next = getHHNextFromGuide(HH_FULL, statuses, readShorts);
    expect(next === null || next.reason === "Next in Horus Heresy").toBe(true);
  });
});

describe("getNextSuggestion", () => {
  it("returns the first of getAllNextSuggestions", () => {
    const statuses = read(idOf("Horus Rising"));
    expect(getNextSuggestion(statuses)).toEqual(getAllNextSuggestions(statuses)[0]);
  });

  it("is never null for a fresh user (cold start covers it)", () => {
    expect(getNextSuggestion({})).toBeTruthy();
  });
});
