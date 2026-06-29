import { describe, it, expect, beforeEach } from "vitest";
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
