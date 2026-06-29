import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getConsecutiveMonthStreak,
  computeReadingAchievements,
  computePaintingAchievements,
  computeAoSReadingAchievements,
  diffAchievements,
  achievementFromId,
  localizeAchievement,
} from "./achievements.js";

// Test helpers ────────────────────────────────────────────────────────────────
// Build a `statuses` map of N read books with optional per-book overrides.
const read = (completedAt) => ({ status: "read", completedAt });
const statusesFromIds = (ids, completedAt = "2026-06-15T00:00:00.000Z") =>
  Object.fromEntries(ids.map((id) => [id, read(completedAt)]));

// ─── getConsecutiveMonthStreak — pure, fully deterministic ─────────────────────
describe("getConsecutiveMonthStreak", () => {
  it("returns 0 for empty / nullish input", () => {
    expect(getConsecutiveMonthStreak([])).toBe(0);
    expect(getConsecutiveMonthStreak(null)).toBe(0);
    expect(getConsecutiveMonthStreak(undefined)).toBe(0);
  });

  it("counts a single month as a streak of 1", () => {
    expect(getConsecutiveMonthStreak(["2026-06-01T00:00:00Z"])).toBe(1);
  });

  it("counts consecutive months from the most recent backwards", () => {
    const ts = ["2026-04-10T00:00:00Z", "2026-05-10T00:00:00Z", "2026-06-10T00:00:00Z"];
    expect(getConsecutiveMonthStreak(ts)).toBe(3);
  });

  it("breaks the streak on a gap month", () => {
    // Jun + May consecutive, then a gap (no April), then March
    const ts = ["2026-03-10T00:00:00Z", "2026-05-10T00:00:00Z", "2026-06-10T00:00:00Z"];
    expect(getConsecutiveMonthStreak(ts)).toBe(2);
  });

  it("handles the year boundary (Dec → Jan) correctly", () => {
    const ts = ["2025-12-10T00:00:00Z", "2026-01-10T00:00:00Z"];
    expect(getConsecutiveMonthStreak(ts)).toBe(2);
  });

  it("deduplicates multiple entries in the same month", () => {
    const ts = ["2026-06-01T00:00:00Z", "2026-06-20T00:00:00Z", "2026-05-05T00:00:00Z"];
    expect(getConsecutiveMonthStreak(ts)).toBe(2);
  });

  it("is order-independent (sorts internally)", () => {
    const ts = ["2026-06-10T00:00:00Z", "2026-04-10T00:00:00Z", "2026-05-10T00:00:00Z"];
    expect(getConsecutiveMonthStreak(ts)).toBe(3);
  });
});

// ─── diffAchievements — pure set difference ────────────────────────────────────
describe("diffAchievements", () => {
  it("returns only newly-unlocked ids", () => {
    expect(diffAchievements(["read_1"], ["read_1", "read_5"])).toEqual(["read_5"]);
  });
  it("returns empty when nothing is new", () => {
    expect(diffAchievements(["read_1", "read_5"], ["read_1"])).toEqual([]);
  });
  it("returns everything when nothing was unlocked before", () => {
    expect(diffAchievements([], ["read_1"])).toEqual(["read_1"]);
  });
});

// ─── achievementFromId — static lookup + dynamic id parsing ─────────────────────
describe("achievementFromId", () => {
  it("resolves a static achievement by id", () => {
    expect(achievementFromId("read_5")).toMatchObject({ id: "read_5", label: "Scholar of Terra" });
  });

  it("resolves a dynamic 40k series id", () => {
    const a = achievementFromId("series:Eisenhorn");
    expect(a).toMatchObject({ id: "series:Eisenhorn", cat: "series" });
    expect(a.label).toContain("Eisenhorn");
  });

  it("resolves a dynamic AoS series id", () => {
    const a = achievementFromId("aos_series:Gotrek");
    expect(a).toMatchObject({ cat: "aos_series" });
    expect(a.label).toContain("Gotrek");
  });

  it("parses an army id with a known medal", () => {
    const a = achievementFromId("army:Space Marines:10");
    expect(a).toMatchObject({ cat: "army", icon: "🛡" });
    expect(a.label).toContain("Space Marines");
    expect(a.label).toContain("Full Detachment");
  });

  it("handles faction names containing a colon (lastIndexOf split)", () => {
    const a = achievementFromId("army:Adeptus: Custodes:5");
    expect(a.desc).toContain("Adeptus: Custodes");
    expect(a.desc).toContain("5");
  });

  it("falls back to a generic medal for an unknown count", () => {
    const a = achievementFromId("army:Orks:7");
    expect(a.label).toContain("7 Minis");
    expect(a.icon).toBe("🎖");
  });

  it("returns null for an unknown id", () => {
    expect(achievementFromId("totally_unknown")).toBeNull();
  });
});

// ─── localizeAchievement — i18n with English fallback ──────────────────────────
describe("localizeAchievement", () => {
  // identity-ish t: returns the key unchanged → simulates "translation missing"
  const tMissing = (k) => k;

  it("returns the achievement unchanged when t is not a function", () => {
    const ach = { id: "read_1", label: "First Tome", desc: "x" };
    expect(localizeAchievement(ach, null)).toBe(ach);
  });

  it("falls back to the baked-in English label/desc when the key is missing", () => {
    const ach = achievementFromId("read_1");
    const out = localizeAchievement(ach, tMissing);
    expect(out.label).toBe(ach.label); // not the raw key
    expect(out.desc).toBe(ach.desc);
  });

  it("uses the translated value when present", () => {
    const t = (k) => (k === "stats.ach.read_1.label" ? "Primo Tomo" : k);
    const out = localizeAchievement(achievementFromId("read_1"), t);
    expect(out.label).toBe("Primo Tomo");
  });

  it("templates a dynamic series label", () => {
    const t = (k) => (k === "stats.ach.sagaComplete.label" ? "{name} — Saga completa" : k);
    const out = localizeAchievement(achievementFromId("series:Eisenhorn"), t);
    expect(out.label).toBe("Eisenhorn — Saga completa");
  });

  it("templates a dynamic army label + medal", () => {
    const t = (k) => {
      const m = {
        "stats.ach.armyLabel": "{faction}: {medal}",
        "stats.ach.armyMedal.5": "Pronti al combattimento",
        "stats.ach.armyDesc": "{count} di {faction}",
      };
      return m[k] ?? k;
    };
    const out = localizeAchievement(achievementFromId("army:Orks:5"), t);
    expect(out.label).toBe("Orks: Pronti al combattimento");
    expect(out.desc).toBe("5 di Orks");
  });
});

// ─── computeReadingAchievements — milestones, faction, series, explorer ────────
describe("computeReadingAchievements", () => {
  // Minimal fake catalogue covering the branches we assert.
  const books = [
    { id: 1, faction: "Space Marines", series: "Horus Heresy" },
    { id: 2, faction: "Space Marines", series: "Horus Heresy" },
    { id: 3, faction: "Space Marines", series: "Standalone" },
    { id: 4, faction: "Orks", series: "Standalone" },
    { id: 5, faction: "Chaos", series: "Night Lords" },
    { id: 6, faction: "Chaos", series: "Night Lords" },
  ];

  it("unlocks the first milestone on a single read", () => {
    const got = computeReadingAchievements(statusesFromIds([1]), books);
    expect(got).toContain("read_1");
    expect(got).not.toContain("read_5");
  });

  it("ignores books that are not marked read", () => {
    const statuses = { 1: read("2026-06-01T00:00:00Z"), 2: { status: "reading" } };
    expect(computeReadingAchievements(statuses, books)).toContain("read_1");
    expect(computeReadingAchievements(statuses, books)).not.toContain("read_5");
  });

  it("unlocks faction devotion at 3 books of the same faction", () => {
    const got = computeReadingAchievements(statusesFromIds([1, 2, 3]), books);
    expect(got).toContain("faction_3");
  });

  it("unlocks a per-series completion dynamic id when every book is read", () => {
    // Night Lords = ids 5 & 6; reading both completes the saga
    const got = computeReadingAchievements(statusesFromIds([5, 6]), books);
    expect(got).toContain("series:Night Lords");
  });

  it("does NOT complete a series when only some books are read", () => {
    const got = computeReadingAchievements(statusesFromIds([5]), books);
    expect(got).not.toContain("series:Night Lords");
  });

  it("never creates series ids for Standalone / single-book series", () => {
    const got = computeReadingAchievements(statusesFromIds([3, 4]), books);
    expect(got.some((id) => id.startsWith("series:"))).toBe(false);
  });

  it("still counts Standalone/Codex books toward milestone + monthly (spec §1.4)", () => {
    // ids 3 & 4 are Standalone — excluded ONLY from saga completion, never from
    // the read count.
    const got = computeReadingAchievements(statusesFromIds([3, 4]), books);
    expect(got).toContain("read_1"); // they count as read books
    expect(got.some((id) => id.startsWith("series:"))).toBe(false);
  });

  it("unlocks explorer_3 for three distinct factions", () => {
    const got = computeReadingAchievements(statusesFromIds([1, 4, 5]), books);
    expect(got).toContain("explorer_3");
  });
});

// ─── Time-dependent suites — freeze the clock for determinism ──────────────────
describe("monthly + streak (clock frozen to 2026-06-15)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("awards monthly_bronze for one book read this month", () => {
    const got = computeReadingAchievements(statusesFromIds([1], "2026-06-02T00:00:00Z"), []);
    expect(got).toContain("monthly_bronze");
    expect(got).not.toContain("monthly_silver");
  });

  it("does NOT award a monthly medal for a book read last month", () => {
    const got = computeReadingAchievements(statusesFromIds([1], "2026-05-02T00:00:00Z"), []);
    expect(got).not.toContain("monthly_bronze");
  });

  it("awards monthly_gold at exactly three books this month (not platinum)", () => {
    const statuses = statusesFromIds([1, 2, 3], "2026-06-10T00:00:00Z");
    const got = computeReadingAchievements(statuses, []);
    expect(got).toContain("monthly_gold");
    expect(got).not.toContain("monthly_platinum");
  });

  it("awards monthly_platinum at four+ books this month (plus all lower tiers)", () => {
    const statuses = statusesFromIds([1, 2, 3, 4], "2026-06-10T00:00:00Z");
    const got = computeReadingAchievements(statuses, []);
    expect(got).toEqual(
      expect.arrayContaining(["monthly_bronze", "monthly_silver", "monthly_gold", "monthly_platinum"])
    );
  });

  it("mirrors the monthly bands for AoS (gold at 3, platinum at 4+)", () => {
    const three = computeAoSReadingAchievements(statusesFromIds([10, 11, 12], "2026-06-10T00:00:00Z"), []);
    expect(three).toContain("aos_monthly_gold");
    expect(three).not.toContain("aos_monthly_platinum");
    const four = computeAoSReadingAchievements(statusesFromIds([10, 11, 12, 13], "2026-06-10T00:00:00Z"), []);
    expect(four).toContain("aos_monthly_platinum");
  });
});

// ─── computePaintingAchievements — R5 regression area ──────────────────────────
describe("computePaintingAchievements", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const mini = (faction, completedAt = "2026-06-10T00:00:00Z") => ({ faction, completedAt });

  it("unlocks nothing for an empty list (R5: gallery feeds [] → no trophies)", () => {
    expect(computePaintingAchievements([])).toEqual([]);
  });

  it("unlocks the first painting milestone for one completed mini", () => {
    expect(computePaintingAchievements([mini("Orks")])).toContain("paint_1");
  });

  it("unlocks an army medal at 5 minis of the same faction", () => {
    const minis = Array.from({ length: 5 }, () => mini("Necrons"));
    const got = computePaintingAchievements(minis);
    expect(got).toContain("army:Necrons:5");
    expect(got).not.toContain("army:Necrons:10");
  });

  it("counts only this-month minis toward monthly painter medals", () => {
    const minis = [mini("Orks", "2026-06-01T00:00:00Z"), mini("Orks", "2026-05-01T00:00:00Z")];
    const got = computePaintingAchievements(minis);
    expect(got).toContain("monthly_painter_1");
    expect(got).not.toContain("monthly_painter_3");
  });

  it("ignores minis with no faction for army medals", () => {
    const minis = Array.from({ length: 5 }, () => mini(null));
    const got = computePaintingAchievements(minis);
    expect(got.some((id) => id.startsWith("army:"))).toBe(false);
    expect(got).toContain("paint_5"); // milestone still counts
  });
});

// ─── computeAoSReadingAchievements — series devotion + completion ──────────────
describe("computeAoSReadingAchievements", () => {
  const aosBooks = [
    { id: 10, series: "Gotrek" },
    { id: 11, series: "Gotrek" },
    { id: 12, series: "Gotrek" },
    { id: 13, series: "Hallowed Knights" },
    { id: 14, series: "Hallowed Knights" },
  ];

  it("unlocks the AoS first milestone on a single read", () => {
    expect(computeAoSReadingAchievements(statusesFromIds([10]), aosBooks)).toContain("aos_read_1");
  });

  it("unlocks series devotion at 3 books of the same saga", () => {
    const got = computeAoSReadingAchievements(statusesFromIds([10, 11, 12]), aosBooks);
    expect(got).toContain("aos_series_3");
  });

  it("completes a saga (dynamic id) when every book in it is read", () => {
    const got = computeAoSReadingAchievements(statusesFromIds([13, 14]), aosBooks);
    expect(got).toContain("aos_series:Hallowed Knights");
  });

  it("unlocks explorer for distinct sagas", () => {
    const got = computeAoSReadingAchievements(statusesFromIds([10, 13]), aosBooks);
    // only 2 distinct sagas here → not yet explorer_3
    expect(got).not.toContain("aos_explorer_3");
  });

  it("does NOT complete a saga named Standalone or Codex (spec §1.5, parity with 40k)", () => {
    const catalogue = [
      { id: 90, series: "Standalone" },
      { id: 91, series: "Standalone" },
      { id: 92, series: "Codex" },
      { id: 93, series: "Codex" },
    ];
    const got = computeAoSReadingAchievements(statusesFromIds([90, 91, 92, 93]), catalogue);
    expect(got).not.toContain("aos_series:Standalone");
    expect(got).not.toContain("aos_series:Codex");
  });
});

// ─── boundary ladders — mutation hardening ────────────────────────────────────
// Every threshold is tested at exactly N (unlocks) and at N-1 (does not). This
// kills the "off-by-one" / changed-number mutants that survive when a ladder is
// only spot-checked at its first rung.

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => from + i);
const nRead = (n) => statusesFromIds(ids(n), "2020-01-01T00:00:00Z"); // old date → no monthly noise

describe("reading milestone boundaries", () => {
  for (const [n, id] of [[1, "read_1"], [5, "read_5"], [10, "read_10"], [25, "read_25"], [50, "read_50"], [100, "read_100"]]) {
    it(`${id}: unlocks at ${n}, not at ${n - 1}`, () => {
      expect(computeReadingAchievements(nRead(n), [])).toContain(id);
      if (n > 1) expect(computeReadingAchievements(nRead(n - 1), [])).not.toContain(id);
    });
  }
});

describe("faction / explorer / Horus Heresy boundaries", () => {
  const sameFaction = (n) => ids(n).map((id) => ({ id, faction: "Space Marines", series: "Standalone" }));
  const distinctFactions = (n) => ids(n).map((id) => ({ id, faction: `Fac${id}`, series: "Standalone" }));
  const hh = (n) => ids(n).map((id) => ({ id, faction: "Space Marines", series: "Horus Heresy" }));

  for (const [n, id] of [[3, "faction_3"], [5, "faction_5"], [10, "faction_10"]]) {
    it(`${id}: unlocks at ${n}, not at ${n - 1}`, () => {
      expect(computeReadingAchievements(nRead(n), sameFaction(n))).toContain(id);
      expect(computeReadingAchievements(nRead(n - 1), sameFaction(n - 1))).not.toContain(id);
    });
  }

  for (const [n, id] of [[3, "explorer_3"], [5, "explorer_5"], [8, "explorer_8"]]) {
    it(`${id}: unlocks at ${n} distinct factions, not at ${n - 1}`, () => {
      expect(computeReadingAchievements(nRead(n), distinctFactions(n))).toContain(id);
      expect(computeReadingAchievements(nRead(n - 1), distinctFactions(n - 1))).not.toContain(id);
    });
  }

  for (const [n, id] of [[10, "hh_10"], [30, "hh_30"]]) {
    it(`${id}: unlocks at ${n} Horus Heresy books, not at ${n - 1}`, () => {
      expect(computeReadingAchievements(nRead(n), hh(n))).toContain(id);
      expect(computeReadingAchievements(nRead(n - 1), hh(n - 1))).not.toContain(id);
    });
  }
});

// Build statuses spanning `k` consecutive months ending at 2026-06.
const consecutiveMonths = (k) => {
  const out = {};
  for (let i = 0; i < k; i++) {
    let m = 6 - i, y = 2026;
    while (m <= 0) { m += 12; y--; }
    out[`b${i}`] = read(`${y}-${String(m).padStart(2, "0")}-10T00:00:00Z`);
  }
  return out;
};

describe("reading streak boundaries (clock frozen to 2026-06-15)", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z")); });
  afterEach(() => { vi.useRealTimers(); });

  for (const [k, id] of [[2, "streak_2"], [3, "streak_3"], [6, "streak_6"], [12, "streak_12"]]) {
    it(`${id}: unlocks at ${k} consecutive months, not at ${k - 1}`, () => {
      expect(computeReadingAchievements(consecutiveMonths(k), [])).toContain(id);
      expect(computeReadingAchievements(consecutiveMonths(k - 1), [])).not.toContain(id);
    });
  }
});

describe("painting milestone / army / streak boundaries (clock frozen)", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z")); });
  afterEach(() => { vi.useRealTimers(); });

  // minis with an OLD completedAt → no monthly/streak noise for milestone checks
  const minis = (n, faction = "Orks") => ids(n).map(() => ({ faction, completedAt: "2020-01-01T00:00:00Z" }));

  for (const [n, id] of [[1, "paint_1"], [5, "paint_5"], [10, "paint_10"], [25, "paint_25"], [50, "paint_50"], [100, "paint_100"]]) {
    it(`${id}: unlocks at ${n}, not at ${n - 1}`, () => {
      expect(computePaintingAchievements(minis(n))).toContain(id);
      if (n > 1) expect(computePaintingAchievements(minis(n - 1))).not.toContain(id);
    });
  }

  for (const [n, label] of [[5, "army:Orks:5"], [10, "army:Orks:10"], [20, "army:Orks:20"]]) {
    it(`${label}: unlocks at ${n} same-faction minis, not at ${n - 1}`, () => {
      expect(computePaintingAchievements(minis(n))).toContain(label);
      expect(computePaintingAchievements(minis(n - 1))).not.toContain(label);
    });
  }

  const paintMonths = (k) => {
    const out = [];
    for (let i = 0; i < k; i++) {
      let m = 6 - i, y = 2026;
      while (m <= 0) { m += 12; y--; }
      out.push({ faction: "Orks", completedAt: `${y}-${String(m).padStart(2, "0")}-10T00:00:00Z` });
    }
    return out;
  };
  for (const [k, id] of [[2, "paint_streak_2"], [3, "paint_streak_3"], [6, "paint_streak_6"]]) {
    it(`${id}: unlocks at ${k} consecutive months, not at ${k - 1}`, () => {
      expect(computePaintingAchievements(paintMonths(k))).toContain(id);
      expect(computePaintingAchievements(paintMonths(k - 1))).not.toContain(id);
    });
  }

  for (const [n, id] of [[1, "monthly_painter_1"], [3, "monthly_painter_3"], [5, "monthly_painter_5"]]) {
    it(`${id}: unlocks at ${n} minis this month, not at ${n - 1}`, () => {
      const thisMonth = (c) => Array.from({ length: c }, () => ({ faction: "Orks", completedAt: "2026-06-05T00:00:00Z" }));
      expect(computePaintingAchievements(thisMonth(n))).toContain(id);
      if (n > 1) expect(computePaintingAchievements(thisMonth(n - 1))).not.toContain(id);
    });
  }
});

describe("AoS milestone / devotion / explorer boundaries", () => {
  const sameSeries = (n) => ids(n).map((id) => ({ id, series: "Gotrek" }));
  const distinctSeries = (n) => ids(n).map((id) => ({ id, series: `Saga${id}` }));

  for (const [n, id] of [[1, "aos_read_1"], [5, "aos_read_5"], [10, "aos_read_10"], [25, "aos_read_25"], [50, "aos_read_50"], [100, "aos_read_100"]]) {
    it(`${id}: unlocks at ${n}, not at ${n - 1}`, () => {
      expect(computeAoSReadingAchievements(nRead(n), [])).toContain(id);
      if (n > 1) expect(computeAoSReadingAchievements(nRead(n - 1), [])).not.toContain(id);
    });
  }

  for (const [n, id] of [[3, "aos_series_3"], [5, "aos_series_5"], [10, "aos_series_10"]]) {
    it(`${id}: unlocks at ${n} same-saga books, not at ${n - 1}`, () => {
      expect(computeAoSReadingAchievements(nRead(n), sameSeries(n))).toContain(id);
      expect(computeAoSReadingAchievements(nRead(n - 1), sameSeries(n - 1))).not.toContain(id);
    });
  }

  for (const [n, id] of [[3, "aos_explorer_3"], [5, "aos_explorer_5"], [8, "aos_explorer_8"]]) {
    it(`${id}: unlocks at ${n} distinct sagas, not at ${n - 1}`, () => {
      expect(computeAoSReadingAchievements(nRead(n), distinctSeries(n))).toContain(id);
      expect(computeAoSReadingAchievements(nRead(n - 1), distinctSeries(n - 1))).not.toContain(id);
    });
  }
});
