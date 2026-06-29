import { describe, it, expect } from "vitest";
import { TRANSLATIONS } from "./translations.js";
import { ALL_ACHIEVEMENTS } from "../../lib/achievements.js";

// R6 — i18n integrity. esbuild won't catch a missing translation key; a new
// achievement shipped without its `stats.ach.*` entry would show the raw key (or
// silently fall back to English for the IT user). These data-driven tests scan
// EVERY achievement so any future trophy is covered automatically.

const enAch = TRANSLATIONS.en.stats.ach;
const itAch = TRANSLATIONS.it.stats.ach;

const nonEmpty = (s) => typeof s === "string" && s.trim().length > 0;

describe("achievement i18n coverage (R6)", () => {
  it("has an EN label + desc for every static achievement", () => {
    const missing = ALL_ACHIEVEMENTS.filter(
      (a) => !enAch[a.id] || !nonEmpty(enAch[a.id].label) || !nonEmpty(enAch[a.id].desc)
    ).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it("has an IT label + desc for every static achievement", () => {
    const missing = ALL_ACHIEVEMENTS.filter(
      (a) => !itAch[a.id] || !nonEmpty(itAch[a.id].label) || !nonEmpty(itAch[a.id].desc)
    ).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it("keeps the EN and IT achievement key sets identical (no drift)", () => {
    const enKeys = Object.keys(enAch).sort();
    const itKeys = Object.keys(itAch).sort();
    expect(itKeys).toEqual(enKeys);
  });

  it("explicitly covers the Platinum monthly tier in both languages", () => {
    for (const id of ["monthly_platinum", "aos_monthly_platinum"]) {
      expect(nonEmpty(enAch[id]?.label)).toBe(true);
      expect(nonEmpty(itAch[id]?.label)).toBe(true);
    }
  });
});

describe("dynamic-achievement template keys (R6)", () => {
  // These power series:/army: ids via localizeAchievement — must exist in both langs.
  const required = ["sagaComplete", "armyMedal", "armyLabel", "armyDesc"];

  it("are present in both EN and IT", () => {
    for (const key of required) {
      expect(enAch[key], `en.stats.ach.${key}`).toBeDefined();
      expect(itAch[key], `it.stats.ach.${key}`).toBeDefined();
    }
  });

  it("sagaComplete keeps the {name} placeholder in both langs", () => {
    expect(enAch.sagaComplete.label).toContain("{name}");
    expect(itAch.sagaComplete.label).toContain("{name}");
  });

  it("armyLabel keeps {faction} and {medal} placeholders in both langs", () => {
    for (const lbl of [enAch.armyLabel, itAch.armyLabel]) {
      expect(lbl).toContain("{faction}");
      expect(lbl).toContain("{medal}");
    }
  });
});
