import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setBookStatusLS,
  getBookStatus,
  loadAllStatuses,
  loadAoSStatuses,
} from "./bookStatus.js";

const UID = "user-1";

beforeEach(() => {
  localStorage.clear();
});

// ─── round-trip ────────────────────────────────────────────────────────────────
describe("setBookStatusLS / getBookStatus", () => {
  it("persists and reads back a status", () => {
    setBookStatusLS(UID, 42, "read");
    expect(getBookStatus(UID, 42).status).toBe("read");
  });

  it("stamps completedAt (and startedAt) when marked read", () => {
    const d = setBookStatusLS(UID, 42, "read");
    expect(d.completedAt).toBeTruthy();
    expect(d.startedAt).toBeTruthy();
  });

  it("stamps startedAt (not completedAt) when marked reading", () => {
    const d = setBookStatusLS(UID, 7, "reading");
    expect(d.startedAt).toBeTruthy();
    expect(d.completedAt).toBeUndefined();
  });

  it("returns {status:'none'} for an unknown book", () => {
    expect(getBookStatus(UID, 999)).toEqual({ status: "none" });
  });

  it("preserves the original startedAt when going reading -> read", () => {
    // Mutation-testing found this gap: marking read must NOT overwrite an
    // existing startedAt (the `if (!d.startedAt)` guard). The two writes must
    // land on DIFFERENT timestamps or the `if (true)` mutant is invisible —
    // so we control the clock (FIRST: Repeatable) instead of trusting it.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
      const started = setBookStatusLS(UID, 7, "reading").startedAt;
      expect(started).toBe("2026-06-01T00:00:00.000Z");

      vi.setSystemTime(new Date("2026-06-10T00:00:00.000Z")); // 9 days later
      const finished = setBookStatusLS(UID, 7, "read");
      expect(finished.startedAt).toBe(started); // unchanged
      expect(finished.completedAt).toBe("2026-06-10T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── universe separation — the real guard behind SPEC §1.1 ─────────────────────
// 40k and AoS reading trophies must stay separate. The separation is enforced
// here: loadAllStatuses keeps only numeric (40k) ids; loadAoSStatuses keeps only
// "aos"-prefixed ids. If this leaks, an AoS book would inflate 40k milestones.
describe("loadAllStatuses / loadAoSStatuses universe split", () => {
  beforeEach(() => {
    setBookStatusLS(UID, 1, "read");        // 40k (numeric id)
    setBookStatusLS(UID, 2, "reading");     // 40k
    setBookStatusLS(UID, "aos10", "read");  // AoS (string id)
    setBookStatusLS(UID, "aos11", "want");  // AoS
  });

  it("loadAllStatuses returns ONLY numeric (40k) ids", () => {
    const m = loadAllStatuses(UID);
    expect(Object.keys(m).sort()).toEqual(["1", "2"]);
    expect(m["aos10"]).toBeUndefined();
  });

  it("loadAoSStatuses returns ONLY aos-prefixed ids", () => {
    const m = loadAoSStatuses(UID);
    expect(Object.keys(m).sort()).toEqual(["aos10", "aos11"]);
    expect(m["1"]).toBeUndefined();
  });

  it("does not leak another user's statuses", () => {
    setBookStatusLS("user-2", 5, "read");
    expect(loadAllStatuses(UID)["5"]).toBeUndefined();
  });
});
