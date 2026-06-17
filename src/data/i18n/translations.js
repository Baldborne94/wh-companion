// Aggregated app translations.
//
// Each namespace lives in its own module under ./ns/* and exports
// { en: {...}, it: {...} }. They are merged here into a single dictionary
// per language. Keys are resolved by dot-path via lib/i18n.jsx `t()`.
// English is the source of truth and the fallback for any missing IT key.

import { core } from "./ns/core";
import { home } from "./ns/home";
import { library } from "./ns/library";
import { reading } from "./ns/reading";
import { aos } from "./ns/aos";
import { lore } from "./ns/lore";
import { music } from "./ns/music";
import { painting } from "./ns/painting";
import { stats } from "./ns/stats";
import { backup } from "./ns/backup";
import { reader } from "./ns/reader";
import { login } from "./ns/login";

const MODULES = [core, home, library, reading, aos, lore, music, painting, stats, backup, reader, login];

const merge = (lang) => Object.assign({}, ...MODULES.map((m) => m[lang]));

export const TRANSLATIONS = {
  en: merge("en"),
  it: merge("it"),
};
