import { describe, it, expect } from "vitest";
import { LORE_DB, wikiUrl, lexUrl, KW_KEYS, KW_REGEX, highlightKeywords } from "./lore.js";

// Reset the global regex's lastIndex between assertions (it has the /g flag).
const matches = (s) => { KW_REGEX.lastIndex = 0; return KW_REGEX.test(s); };

describe("wikiUrl (Fandom)", () => {
  it("uses the entry's wiki slug", () => {
    expect(wikiUrl("horus")).toBe("https://warhammer40k.fandom.com/wiki/Horus_Lupercal");
  });
  it("keeps a parenthesised Fandom slug as-is", () => {
    expect(wikiUrl("leman russ")).toBe("https://warhammer40k.fandom.com/wiki/Leman_Russ_(Primarch)");
  });
  it("falls back to the encoded key for an unknown term", () => {
    expect(wikiUrl("zzz unknown")).toBe("https://warhammer40k.fandom.com/wiki/zzz%20unknown");
  });
});

describe("lexUrl (Lexicanum)", () => {
  it("prefers a curated lex slug", () => {
    expect(lexUrl("severian")).toContain("/wiki/Severian_(The_Wolf)");
  });
  it("reuses a plain (no-paren) wiki slug directly", () => {
    expect(lexUrl("horus")).toContain("/wiki/Horus_Lupercal");
  });
  it("uses the Go-search for a parenthesised slug (no 1:1 Lexicanum page)", () => {
    const url = lexUrl("leman russ");
    expect(url).toContain("/index.php?search=Leman%20Russ");
    expect(url).toContain("go=Go");
    expect(url).not.toContain("/wiki/Leman_Russ_(Primarch)");
  });
  it("always forces the desktop skin", () => {
    for (const k of ["severian", "horus", "leman russ"]) {
      expect(lexUrl(k)).toContain("mobileaction=toggle_view_desktop");
    }
  });
});

describe("KW_KEYS ordering", () => {
  it("is sorted longest-first so multi-word phrases win over their substrings", () => {
    for (let i = 1; i < KW_KEYS.length; i++) {
      expect(KW_KEYS[i - 1].length).toBeGreaterThanOrEqual(KW_KEYS[i].length);
    }
  });
  it("contains every LORE_DB key", () => {
    expect(KW_KEYS.slice().sort()).toEqual(Object.keys(LORE_DB).sort());
  });
});

describe("KW_REGEX matching", () => {
  it("matches a known term case-insensitively", () => {
    expect(matches("The warmaster Horus fell")).toBe(true);
    expect(matches("the HORUS heresy")).toBe(true);
  });
  it("respects word boundaries (no match inside a larger word)", () => {
    expect(matches("Horuses")).toBe(false);
  });
});

describe("highlightKeywords", () => {
  it("wraps a known keyword in a lore-kw span with the lowercased data-kw", () => {
    const out = highlightKeywords("Horus rises");
    expect(out).toContain('class="lore-kw"');
    expect(out).toContain('data-kw="horus"');
  });

  it("preserves the original casing of the matched text", () => {
    const out = highlightKeywords("HORUS");
    expect(out).toContain('data-kw="horus"'); // key is lowercased
    expect(out).toContain(">HORUS<");          // visible text keeps its case
  });

  it("wraps a multi-word keyword", () => {
    const out = highlightKeywords("Leman Russ returns");
    expect(out).toContain('data-kw="leman russ"');
  });

  it("never rewrites text inside an HTML tag (e.g. an attribute value)", () => {
    const out = highlightKeywords('<a href="horus">link</a>');
    expect(out).toBe('<a href="horus">link</a>'); // tag untouched, "link" has no keyword
  });

  it("is idempotent — does not double-wrap already-highlighted content", () => {
    const once = highlightKeywords("Horus");
    expect(highlightKeywords(once)).toBe(once);
  });

  it("leaves text with no known keywords unchanged", () => {
    expect(highlightKeywords("nothing to see here")).toBe("nothing to see here");
  });
});
