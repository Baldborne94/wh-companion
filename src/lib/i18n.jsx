import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { TRANSLATIONS } from "../data/i18n/translations";

const STORAGE_KEY = "wh_language";
const SUPPORTED = ["en", "it"];
const DEFAULT_LANG = "en";

function readStored() {
  const v = localStorage.getItem(STORAGE_KEY);
  return SUPPORTED.includes(v) ? v : DEFAULT_LANG;
}

// Resolve a dot-path ("onboarding.skip") against a dictionary object.
function resolve(dict, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

const LangContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStored);

  const setLang = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setLangState((cur) => {
      const next = cur === "en" ? "it" : "en";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  // t(key) → current language string, falls back to English, then the key itself.
  const t = useCallback(
    (path) => {
      const hit = resolve(TRANSLATIONS[lang], path);
      if (hit !== undefined) return hit;
      const fallback = resolve(TRANSLATIONS.en, path);
      return fallback !== undefined ? fallback : path;
    },
    [lang]
  );

  const locale = lang === "it" ? "it-IT" : "en-US";
  const value = useMemo(() => ({ lang, setLang, toggle, t, locale }), [lang, setLang, toggle, t, locale]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within a LanguageProvider");
  return ctx;
}

// Localizes a reading-guide part label like "Prologue" / "Part 1" / "Optional 2"
// by translating the leading word via the shared `guide` namespace and keeping
// any trailing number. Unrecognized labels are returned unchanged.
export function partLabel(label, t) {
  const m = /^(Prologue|Part|Optional)(?:\s+(.*))?$/.exec(label || "");
  if (!m) return label;
  const key = { Prologue: "guide.prologue", Part: "guide.part", Optional: "guide.optional" }[m[1]];
  return m[2] ? `${t(key)} ${m[2]}` : t(key);
}

export { SUPPORTED, DEFAULT_LANG };
