import { useState, useEffect, useRef, useCallback } from "react";
import ePub from "epubjs";
import { supabase } from "../lib/supabase";
import { C, THEMES, FONTS } from "../data/constants";
import { LORE_DB, wikiUrl, lexUrl, KW_REGEX } from "../data/lore";
import { isCfiTarget, displayTarget, targetScrollTop, runScrollNav } from "../lib/readerNav";
import { useLang } from "../lib/i18n.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// Supabase helpers (use JS client — handles auth token automatically)
// ─────────────────────────────────────────────────────────────────────────────
async function saveProgressToSupabase(userId, bookId, pct, cfi) {
  if (!userId || !bookId) return;
  // Don't overwrite existing progress with a cold-open 0% (no CFI = nothing navigated yet)
  if (!cfi && (!pct || pct === 0)) return;
  try {
    const now = new Date().toISOString();
    const row = { user_id:userId, book_id:bookId, progress_pct:pct, last_read:now, ...(cfi?{epub_cfi:cfi}:{}) };
    await supabase.from("reading_progress").delete().eq("user_id", userId).eq("book_id", bookId);
    await supabase.from("reading_progress").insert(row);
  } catch {}
}

async function loadCfiFromDB(userId, bookId) {
  if (!userId || !bookId) return null;
  try {
    const { data } = await supabase
      .from("reading_progress")
      .select("epub_cfi")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .limit(1)
      .single();
    return data?.epub_cfi ?? null;
  } catch { return null; }
}


async function loadBmsFromDB(userId, bookId) {
  if (!userId || !bookId) return [];
  try {
    const { data } = await supabase.from("bookmarks")
      .select("epub_cfi,label,progress,created_at")
      .eq("user_id", userId).eq("book_id", bookId)
      .not("epub_cfi", "is", null)
      .order("created_at", { ascending: false }).limit(20);
    return (data || []).map(b => ({ cfi: b.epub_cfi, label: b.label || "", pct: b.progress || 0, createdAt: b.created_at }));
  } catch { return []; }
}

// Per-bookmark DB ops — never a delete-all, so saving on one device does NOT wipe
// the bookmarks another device added. Add = delete-this-cfi-then-insert (idempotent
// even without a unique constraint); remove = delete-this-cfi only.
async function putBmToDB(userId, bookId, bm) {
  if (!userId || !bookId || !bm?.cfi) return;
  try {
    await supabase.from("bookmarks").delete()
      .eq("user_id", userId).eq("book_id", bookId).eq("epub_cfi", bm.cfi);
    await supabase.from("bookmarks").insert({
      user_id:userId, book_id:bookId, epub_cfi:bm.cfi, label:bm.label, progress:bm.pct|0,
    });
  } catch {}
}

async function deleteBmFromDB(userId, bookId, cfi) {
  if (!userId || !bookId || !cfi) return;
  try {
    await supabase.from("bookmarks").delete()
      .eq("user_id", userId).eq("book_id", bookId).eq("epub_cfi", cfi);
  } catch {}
}

async function putBmsToDB(userId, bookId, bms) {
  for (const b of bms) await putBmToDB(userId, bookId, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────
const DEF = { fontIndex:0, fontSize:18, lineHeight:1.8, paginate:true, twoPage:true, themeId:"sepia" };

function loadSettings() {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem("wh40k_reader_v2") || "{}") }; }
  catch { return DEF; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Viewport hook
// ─────────────────────────────────────────────────────────────────────────────
function useReaderViewport() {
  useEffect(() => {
    const meta = document.querySelector("meta[name=viewport]");
    if (meta) {
      const prev = meta.content;
      meta.content = "width=device-width,initial-scale=1,user-scalable=no";
      // Suspend body zoom so epub.js measures the real viewport.
      // The zoom stylesheet rule (body{zoom:N}) is overridden by this inline style;
      // removing the inline property restores the rule when the reader closes.
      document.body.style.zoom = "1";
      return () => {
        meta.content = prev;
        document.body.style.removeProperty("zoom");
      };
    }
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Global CSS (spinner + slide-up animation)
// ─────────────────────────────────────────────────────────────────────────────
function useReaderStyles() {
  useEffect(() => {
    const id = "wh40k-reader-styles";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes rdrSpin { to { transform:rotate(360deg) } }
      @keyframes rdrUp   { from { transform:translateY(24px);opacity:0 } to { transform:translateY(0);opacity:1 } }
      @keyframes rdrIn   { from { opacity:0 } to { opacity:1 } }
    `;
    document.head.appendChild(el);
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme CSS injected into epub.js iframes
// ─────────────────────────────────────────────────────────────────────────────
// Build the complete CSS to inject into epub iframes.
// Called both from the content hook (on each page load) and from applyTheme (on live settings change).
function buildReaderCss(settings, T, fnt) {
  const googleImport = fnt.import
    ? `@import url('https://fonts.googleapis.com/css2?family=${fnt.import}&display=swap');\n`
    : "";
  return googleImport + `
    *, *::before, *::after { box-sizing: border-box; }
    html { background: ${T.bg} !important; }
    html, body { background: ${T.bg} !important; color: ${T.text} !important; }
    html body * { color: ${T.text} !important; background-color: transparent !important; }
    body {
      font-family: ${fnt.value} !important;
      font-size: ${settings.fontSize}px !important;
      line-height: ${settings.lineHeight} !important;
      margin: 0 !important;
    }
    html body a { color: #4a8adc !important; text-decoration: none !important; }
    p {
      margin-right: 0 !important; margin-left: 0 !important; padding: 0 !important;
      text-indent: 1.5em !important;
      text-align: justify !important;
      hyphens: auto !important; -webkit-hyphens: auto !important;
      orphans: 3 !important; widows: 3 !important;
    }
    /* Force the chosen line spacing onto text elements — many EPUBs set their own
       line-height on <p>, which overrides an inherited value set only on body. */
    p, li, dd, dt, blockquote { line-height: ${settings.lineHeight} !important; }
    p:first-child, h1+p, h2+p, h3+p, h4+p, hr+p { text-indent: 0 !important; }
    h1, h2, h3, h4 {
      font-variant: small-caps !important;
      text-align: center !important;
      margin: 0 !important; padding: 0.6em 0 0.3em !important;
      break-after: avoid !important;
    }
    p:empty, .epub-scene-break {
      min-height: 1.2em !important;
      margin: 1em 0 !important;
      text-indent: 0 !important;
    }
    hr { border: none !important; text-align: center !important; margin: 1em 0 !important; }
    hr::after { content: "· · ·" !important; opacity: 0.4 !important; }
    img { max-width: 100% !important; height: auto !important; display: block !important; margin: 1em auto !important; }
    blockquote { border-left: 3px solid #c9a84c55 !important; padding-left: 1em !important; margin: 0.5em 0 !important; }
    table { max-width: 100% !important; border-collapse: collapse !important; }
    td, th { padding: 0.3em 0.6em !important; }
    .lore-kw {
      display: inline !important; position: static !important; float: none !important;
      vertical-align: baseline !important; color: #4a8adc !important; cursor: pointer !important;
      border-bottom: 1px solid #4a8adc55 !important;
      font-style: normal !important; font-weight: inherit !important;
    }
    .lore-kw:hover { border-bottom-color: #4a8adc !important; }
  `;
}

// Update all currently loaded epub iframes with the latest CSS.
// epub.js's Contents.addStylesheetCss() finds/creates a keyed <style> element so
// repeated calls overwrite rather than stack.
function applyTheme(rend, settings, T, fnt) {
  const css = buildReaderCss(settings, T, fnt);
  rend.getContents().forEach(c => c.addStylesheetCss(css, 'wh40k-reader'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scroll-mode helpers
// ─────────────────────────────────────────────────────────────────────────────
// In scrolled-doc mode epub.js creates a stage element (overflow:auto) inside
// the container div.  That element is the true scroll root.

// ─────────────────────────────────────────────────────────────────────────────
// TOC helpers
// ─────────────────────────────────────────────────────────────────────────────
function flattenToc(items, depth = 0) {
  return (items || []).flatMap(item => [
    { label: item.label, href: item.href, depth },
    ...flattenToc(item.subitems, depth + 1),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dictionary bottom-sheet
// ─────────────────────────────────────────────────────────────────────────────
function DictionaryPanel({ word, onClose, theme }) {
  const { t } = useLang();
  const [entry,   setEntry]   = useState(null);
  const [loading, setLoading] = useState(true);
  const T = THEMES[theme];

  useEffect(() => {
    setLoading(true); setEntry(null);
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d  => { setEntry(Array.isArray(d) ? d[0] ?? null : null); setLoading(false); })
      .catch(() => { setEntry(null); setLoading(false); });
  }, [word]);

  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,0.55)",
               display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:"100%", maxWidth:620, background:T.surface, border:`1px solid ${T.border}`,
                 borderTop:`2px solid ${C.gold}`, borderRadius:"18px 18px 0 0",
                 padding:"8px 20px 44px", maxHeight:"68vh", overflowY:"auto",
                 animation:"rdrUp .22s ease" }}>
        <div style={{ width:36, height:4, background:T.border, borderRadius:2, margin:"10px auto 18px" }} />

        {loading && (
          <p style={{ textAlign:"center", color:T.muted, fontStyle:"italic", padding:"28px 0" }}>
            {t("reader.lookingUp").replace("{word}", word)}
          </p>
        )}

        {!loading && !entry && (
          <p style={{ textAlign:"center", color:T.muted, fontStyle:"italic", padding:"28px 0" }}>
            {t("reader.noDefinition").replace("{word}", word)}
          </p>
        )}

        {!loading && entry && (() => {
          const phonetic = entry.phonetics?.find(p => p.text)?.text;
          return (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap", marginBottom:6 }}>
                <span style={{ fontSize:24, fontWeight:700, color:T.text, fontFamily:"Georgia,serif" }}>{entry.word}</span>
                {phonetic && <span style={{ fontSize:14, color:T.muted }}>{phonetic}</span>}
              </div>
              {entry.meanings?.slice(0,3).map((m, i) => (
                <div key={i} style={{ marginTop:i>0?14:4, paddingTop:i>0?14:0, borderTop:i>0?`1px solid ${T.border}`:"none" }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.gold, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>
                    {m.partOfSpeech}
                  </div>
                  <p style={{ color:T.text, fontSize:15, lineHeight:1.75, margin:0 }}>
                    {m.definitions[0]?.definition}
                  </p>
                  {m.definitions[0]?.example && (
                    <p style={{ color:T.muted, fontSize:13, lineHeight:1.6, fontStyle:"italic",
                                margin:"8px 0 0", paddingLeft:12, borderLeft:`2px solid ${C.gold}44` }}>
                      &ldquo;{m.definitions[0].example}&rdquo;
                    </p>
                  )}
                  {m.synonyms?.length > 0 && (
                    <p style={{ color:T.muted, fontSize:12, margin:"8px 0 0" }}>
                      {t("reader.synonyms")} <span style={{ color:T.text }}>{m.synonyms.slice(0,6).join(", ")}</span>
                    </p>
                  )}
                </div>
              ))}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings bottom-sheet
// ─────────────────────────────────────────────────────────────────────────────
function SettingsPanel({ settings, onChange, onClose }) {
  const { t } = useLang();
  const T = THEMES[settings.themeId] ?? THEMES.dark;

  const Chip = ({ label, active, onClick }) => (
    <button onClick={onClick}
      style={{ background:active?`${C.gold}22`:"transparent",
               border:`1px solid ${active?C.gold:T.border}`, borderRadius:6,
               padding:"6px 13px", color:active?C.gold:T.muted,
               fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
               cursor:"pointer", transition:"all .15s" }}>
      {label}
    </button>
  );

  const Row = ({ label, children }) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"14px 0", borderBottom:`1px solid ${T.border}` }}>
      <span style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:T.text,
                     letterSpacing:1, flexShrink:0, marginRight:12 }}>{label}</span>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"flex-end" }}>
        {children}
      </div>
    </div>
  );

  return (
    <div onPointerDown={onClose} style={{ position:"fixed", inset:0, zIndex:1100, background:"rgba(0,0,0,0.5)" }}>
      <div onPointerDown={e => e.stopPropagation()}
        style={{ position:"absolute", bottom:0, left:0, right:0,
                 background:T.surface, borderTop:`2px solid ${C.gold}55`,
                 borderRadius:"18px 18px 0 0", padding:"12px 20px 52px",
                 maxHeight:"90vh", overflowY:"auto", animation:"rdrUp .25s ease" }}>
        <div style={{ width:36, height:4, background:T.border, borderRadius:2, margin:"8px auto 14px" }} />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:14, color:T.text, letterSpacing:1 }}>
            {t("reader.readingSettings")}
          </span>
          <button onClick={onClose} aria-label="Close settings" style={{ background:"transparent", border:`1px solid ${T.border}`,
            borderRadius:6, color:T.muted, width:30, height:30, cursor:"pointer", fontSize:14,
            display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim,
                      letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>{t("reader.typeface")}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:20 }}>
          {FONTS.map((f, i) => (
            <button key={i} onClick={() => onChange("fontIndex", i)}
              style={{ padding:"10px 8px", borderRadius:6, background:"transparent",
                       border:`1px solid ${settings.fontIndex===i?C.gold:T.border}`,
                       color:settings.fontIndex===i?C.gold:T.muted,
                       fontFamily:f.value, fontSize:13, cursor:"pointer", transition:"all .15s" }}>
              {f.name}
            </button>
          ))}
        </div>

        <Row label={t("reader.fontSize").replace("{n}", settings.fontSize)}>
          {[14,16,18,20,22,24].map(s => (
            <Chip key={s} label={String(s)} active={settings.fontSize===s} onClick={() => onChange("fontSize",s)} />
          ))}
        </Row>

        <Row label={t("reader.lineSpacing").replace("{n}", settings.lineHeight)}>
          {[1.5,1.7,1.9,2.1].map(v => (
            <Chip key={v} label={String(v)} active={settings.lineHeight===v} onClick={() => onChange("lineHeight",v)} />
          ))}
        </Row>

        <Row label={t("reader.readingMode")}>
          <Chip label={t("reader.pages")}  active={ settings.paginate} onClick={() => onChange("paginate",true)} />
          <Chip label={t("reader.scroll")} active={!settings.paginate} onClick={() => { onChange("paginate",false); onChange("twoPage",false); }} />
        </Row>

        {settings.paginate && (
          <Row label={t("reader.layout")}>
            <Chip label={t("reader.single")}   active={!settings.twoPage} onClick={() => onChange("twoPage",false)} />
            <Chip label={t("reader.twoPage")} active={ settings.twoPage} onClick={() => onChange("twoPage",true)} />
          </Row>
        )}

        <Row label={t("reader.theme")}>
          {Object.values(THEMES).map(th => (
            <Chip key={th.id} label={th.label} active={settings.themeId===th.id} onClick={() => onChange("themeId", th.id)} />
          ))}
        </Row>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main EpubReader
// ─────────────────────────────────────────────────────────────────────────────
export default function EpubReader({
  arrayBuffer, url, title, bookId, userId,
  initProgress,
  onProgress, onClose, nowPlaying, musicPaused, onMusicClick, onStopMusic, onTogglePauseMusic,
}) {
  const { t } = useLang();
  useReaderViewport();
  useReaderStyles();

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState(loadSettings);
  const updateSetting = useCallback((key, val) => {
    setSettings(s => {
      const n = { ...s, [key]:val };
      localStorage.setItem("wh40k_reader_v2", JSON.stringify(n));
      return n;
    });
  }, []);
  const T   = THEMES[settings.themeId] ?? THEMES.dark;
  const fnt = FONTS[settings.fontIndex];

  // ── Book state ─────────────────────────────────────────────────────────────
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [toc,      setToc]      = useState([]);
  const [chLabel,  setChLabel]  = useState("");
  const [progress, setProgress] = useState(0);
  const [chMinLeft, setChMinLeft] = useState(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showUI,        setShowUI]        = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showToc,       setShowToc]       = useState(false);
  const [dictWord,      setDictWord]      = useState(null);
  const [lorePick,      setLorePick]      = useState(null);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  const [showSearch,    setShowSearch]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [searched,      setSearched]      = useState(false);
  const searchToken = useRef(0);

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  const bmKey = `wh40k_bm_${userId}_${bookId}`;
  const [bookmarks, setBookmarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(bmKey) || "[]"); }
    catch { return []; }
  });
  const [showBmPanel, setShowBmPanel] = useState(false);
  const [bmFlash,     setBmFlash]     = useState(false);
  const [curCfi,      setCurCfi]      = useState(null);
  const [navFade,     setNavFade]     = useState(false);
  const [navDir,      setNavDir]      = useState(1);
  const [isWide,      setIsWide]      = useState(() => typeof window !== "undefined" && window.innerWidth > window.innerHeight);

  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen?.() || el.webkitRequestFullscreen?.())
        ?.catch(() => {});
    } else {
      (document.exitFullscreen?.() || document.webkitExitFullscreen?.())
        ?.catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
  // Keep the screen awake while reading. The Wake Lock is released by the browser
  // whenever the tab is hidden, so re-acquire it on visibilitychange. Best-effort:
  // unsupported browsers (or a denied request) just fall through silently.
  useEffect(() => {
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && navigator.wakeLock) {
          lock = await navigator.wakeLock.request("screen");
          if (cancelled) { lock.release?.(); lock = null; }
        }
      } catch {}
    };
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      try { lock?.release?.(); } catch {}
    };
  }, []);

  // Pre-load CFI from DB if nothing in localStorage (new device)
  useEffect(() => {
    const cfiKey = `wh40k_cfi_${userId}_${bookId}`;
    if (!userId || !bookId || localStorage.getItem(cfiKey)) return;
    loadCfiFromDB(userId, bookId).then(cfi => {
      if (!cfi) return;
      localStorage.setItem(cfiKey, cfi);
      cfiRef.current = cfi;
      if (rendRef.current) displayCfi(cfi);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, bookId]);

  // Reconcile bookmarks with the DB on every open (not just on a fresh device) so
  // bookmarks added on another device show up here. Merge = union by cfi of local +
  // DB; then push any local-only bookmarks up so the DB holds the union too.
  useEffect(() => {
    if (!userId || !bookId) return;
    loadBmsFromDB(userId, bookId).then(dbBms => {
      setBookmarks(prev => {
        const byCfi = new Map();
        for (const b of [...prev, ...dbBms]) {
          if (b?.cfi && !byCfi.has(b.cfi)) byCfi.set(b.cfi, b);
        }
        const merged = [...byCfi.values()]
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
          .slice(0, 20);
        localStorage.setItem(bmKey, JSON.stringify(merged));
        const dbCfis = new Set(dbBms.map(b => b.cfi));
        const localOnly = merged.filter(b => !dbCfis.has(b.cfi));
        if (localOnly.length) putBmsToDB(userId, bookId, localOnly);
        return merged;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, bookId]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const containerRef  = useRef(null);
  const bookRef       = useRef(null);
  const rendRef       = useRef(null);
  const cfiRef        = useRef(null);
  const tocRef        = useRef([]);
  const saveTimer     = useRef(null);
  // CFI queued while book is still loading — executed once renderer is ready
  const pendingNavRef = useRef(null);
  const hideTimer    = useRef(null);
  const isTouch      = useRef(window.matchMedia("(pointer:coarse)").matches);
  const themeRef     = useRef(T);
  themeRef.current   = T;
  const settingsRef  = useRef(settings);
  settingsRef.current = settings;

  // The tablet body{zoom} hack (index.html) scales the whole app, but inside the
  // reader it only hurts: it renders text at a lower effective resolution and
  // breaks transforms/coordinate math. The reader has its own font-size controls,
  // so suspend body zoom while it's open and restore it on close.
  useEffect(() => {
    const prev = document.body.style.zoom;
    document.body.style.zoom = "1";
    return () => { document.body.style.zoom = prev; };
  }, []);

  // Track landscape/portrait so the open-book centre spine only shows when two
  // pages are actually side by side (landscape).
  useEffect(() => {
    const on = () => setIsWide(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("orientationchange", on); };
  }, []);
  // Prevent rapid-fire nav calls before epub.js finishes loading the chapter.
  // In paginated mode the lock releases on `relocated` (page turn done).
  // In scroll/continuous mode `relocated` fires on every scroll-position change
  // (too early) — the lock releases on `rendered` instead (chapter in DOM).
  const navLockRef   = useRef(false);
  const navLockTimer = useRef(null);
  // True while a programmatic scroll-mode jump (TOC / bookmark / resume) is in
  // flight. Keeps the nav-fade mask up across the display+settle+snap sequence so
  // the relocated handler doesn't reveal the mid-jump drift.
  const navHoldRef   = useRef(false);
  // Track start-of-book so prev() doesn't fire when there is no prev chapter.
  const atStartRef   = useRef(false);

  // Resolve a chapter href to the CFI at the start of its spine section.
  // epub.js href navigation lands at the wrong scroll offset in continuous mode
  // (fill() prepends earlier sections after the jump), so we navigate by CFI —
  // the path that scrolls reliably. Returns null when the href can't be resolved.
  const hrefToCfi = useCallback((href) => {
    try {
      const section = bookRef.current?.spine?.get(href);
      if (section?.cfiBase) return `epubcfi(${section.cfiBase}!/4)`;
    } catch {}
    return null;
  }, []);

  // Snap the continuous scroll container straight to a CFI's exact offset.
  // Authoritative: reads the target section's currently-measured position rather
  // than relying on epub.js's racy counter() compensation. The offset is
  // recomputed on every call because it grows as fill() prepends earlier
  // sections. Returns true when the viewport is already at the target (within a
  // couple px) so the convergence loop in runScrollNav can stop.
  const scrollToCfiExact = useCallback((cfi) => {
    try {
      const rend = rendRef.current, book = bookRef.current;
      const mgr = rend?.manager;
      if (!mgr || !book) return true;
      const section = book.spine.get(cfi);
      const view = section && mgr.views?.find?.(section);
      if (!view) return true;
      const base = view.offset ? view.offset().top : 0;
      let within = 0;
      try { within = view.locationOf(cfi)?.top || 0; } catch {}
      const top = targetScrollTop(base, within);
      const fullsize = !!mgr.settings?.fullsize;
      const cur = fullsize ? window.scrollY : (mgr.container?.scrollTop ?? 0);
      if (Math.abs(cur - top) <= 2) return true;
      if (fullsize) window.scrollTo(0, top);
      else if (mgr.container) mgr.container.scrollTop = top;
      return false;
    } catch { return true; }
  }, []);

  // Display a CFI/href reliably in both flows (see lib/readerNav).
  // Paginated: a single display lands correctly. Scroll/continuous: mask the
  // viewport, let display()+fill() settle, snap to the exact offset, then reveal.
  const displayCfi = useCallback((target) => {
    const rend = rendRef.current;
    if (!rend || !target) return;
    const cfi = isCfiTarget(target) ? target : (hrefToCfi(target) || target);
    if (settingsRef.current.paginate) {
      displayTarget({ display: (t) => rend.display(t), target: cfi });
      return;
    }
    navHoldRef.current = true;
    runScrollNav({
      display: () => rend.display(cfi),
      scrollToTarget: () => scrollToCfiExact(cfi),
      mask: () => setNavFade(true),
      unmask: () => {
        navHoldRef.current = false;
        requestAnimationFrame(() => setNavFade(false));
      },
    });
  }, [hrefToCfi, scrollToCfiExact]);

  // Full-text search across the book. epub.js has no Book-level search, so we
  // walk the spine, load each section, run Section.find(), then unload to free
  // memory. Runs on demand (cancellable via a token so a new query / close
  // aborts the previous walk). Capped at 300 hits to keep the list usable.
  const runSearch = useCallback(async (raw) => {
    const q = (raw || "").trim();
    const book = bookRef.current;
    if (!q || q.length < 2 || !book) return;
    const token = ++searchToken.current;
    setSearching(true);
    setSearched(true);
    setSearchResults([]);
    const results = [];
    try {
      await book.ready;
      const sections = [];
      book.spine.each((s) => sections.push(s));
      for (const section of sections) {
        if (token !== searchToken.current) return;   // superseded / closed
        try {
          await section.load(book.load.bind(book));
          const found = section.find(q);
          if (found.length) {
            const base = decodeURIComponent(section.href || "").split("#")[0].split("/").pop();
            const label = tocRef.current.find(ch =>
              ch.href && decodeURIComponent(ch.href).split("#")[0].split("/").pop() === base
            )?.label?.trim() || "";
            found.forEach(m => results.push({ cfi: m.cfi, excerpt: m.excerpt, label }));
          }
        } catch {}
        finally { try { section.unload(); } catch {} }
        if (results.length >= 300) break;
        if (token === searchToken.current) setSearchResults([...results]);
      }
      if (token === searchToken.current) setSearchResults([...results]);
    } finally {
      if (token === searchToken.current) setSearching(false);
    }
  }, []);

  // In scrolled mode, always show UI (no swipe overlay to trigger revealUI)
  const uiVisible = !isTouch.current || !settings.paginate || showUI;

  const revealUI = useCallback(() => {
    if (!isTouch.current) return;
    setShowUI(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowUI(false), 4000);
  }, []);

  // Center tap toggles the header (immersive control). When showing, arm the
  // same 4s auto-hide; when hiding, dismiss instantly. Side strips + swipe still
  // turn pages — only a plain tap on the text column reaches here.
  const toggleUI = useCallback(() => {
    if (!isTouch.current) return;
    setShowUI(prev => {
      clearTimeout(hideTimer.current);
      if (!prev) hideTimer.current = setTimeout(() => setShowUI(false), 4000);
      return !prev;
    });
  }, []);

  // Keep UI visible while a panel is open
  useEffect(() => {
    if (showSettings || showToc || showBmPanel || showSearch) {
      clearTimeout(hideTimer.current);
      setShowUI(true);
    }
  }, [showSettings, showToc, showBmPanel, showSearch]);

  // TOC navigation is paginated-only — epub.js's continuous manager doesn't land
  // chapter jumps reliably across all books. Close the panel if it's open when
  // switching to scroll mode.
  useEffect(() => {
    if (!settings.paginate) setShowToc(false);
  }, [settings.paginate]);

  // ── Book init / layout change ─────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (!arrayBuffer && !url) {
      setError(t("reader.noDownloadLink"));
      setLoading(false);
      return;
    }
    let cancelled = false;

    setLoading(true);
    setError(null);
    setChLabel("");
    setProgress(0);

    // Destroy previous instance
    if (bookRef.current) {
      try { bookRef.current.destroy(); } catch {}
      bookRef.current = null;
    }
    rendRef.current = null;

    const flow    = settings.paginate ? "paginated" : "scrolled";
    const manager = settings.paginate ? "default"   : "continuous";
    // "auto" gives the open-book feel: two pages side by side when there's room
    // (landscape tablet) and one page when narrow (portrait / phone). "none" forces
    // a single page. minSpreadWidth tuned so landscape tablets trigger the spread.
    const spread  = settings.paginate && settings.twoPage ? "auto" : "none";

    (async () => {
      if (cancelled || !containerRef.current) return;

      // Use pre-downloaded ArrayBuffer when available (avoids CORS/network issues
      // that can occur when fetching a signed URL from inside an iframe/tablet PWA).
      // Fall back to fetching the URL only when no ArrayBuffer was passed.
      let epubBuf = arrayBuffer ?? null;
      if (!epubBuf) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(t("reader.httpError").replace("{status}", resp.status));
          epubBuf = await resp.arrayBuffer();
        } catch (fetchErr) {
          if (!cancelled) { setError(fetchErr.message || t("reader.failedDownload")); setLoading(false); }
          return;
        }
      }
      if (cancelled || !containerRef.current) return;

      try {
        const book = ePub(epubBuf);
        bookRef.current = book;

        const rend = book.renderTo(containerRef.current, {
          width:          "100%",
          height:         "100%",
          spread,
          flow,
          minSpreadWidth: 820,
          manager,
        });
        rendRef.current = rend;

        // Execute any navigation queued before the renderer was ready
        if (pendingNavRef.current) {
          const queuedCfi = pendingNavRef.current;
          pendingNavRef.current = null;
          rend.display(queuedCfi).catch(() => setTimeout(() => rend.display(queuedCfi), 600));
        }

        applyTheme(rend, settings, T, fnt);

        // Capture outer window so we can open URLs from inside the epub iframe
        const appWindow = window;

        // Inject reader CSS + lore-keyword highlighting into every rendered chapter iframe
        rend.hooks.content.register((contents) => {
          const doc = contents.document;
          if (!doc?.body) return;
          // Read current settings/theme via refs so hook always uses the latest values
          const s = settingsRef.current;
          // Set bg inline before stylesheet lands — eliminates the white flash during chapter load
          const bg = themeRef.current.bg;
          if (doc.documentElement) doc.documentElement.style.background = bg;
          doc.body.style.background = bg;
          contents.addStylesheetCss(buildReaderCss(s, themeRef.current, FONTS[s.fontIndex]), 'wh40k-reader');
          const walker = doc.createTreeWalker(doc.body, 4, null);
          const textNodes = [];
          let tw;
          while ((tw = walker.nextNode())) {
            const p = tw.parentNode;
            if (!p) continue;
            const tag = p.tagName?.toUpperCase();
            if (["SCRIPT","STYLE","A","CODE","PRE"].includes(tag)) continue;
            if (p.classList?.contains("lore-kw")) continue;
            KW_REGEX.lastIndex = 0;
            if (KW_REGEX.test(tw.textContent)) textNodes.push(tw);
          }
          textNodes.forEach(node => {
            KW_REGEX.lastIndex = 0;
            const text = node.textContent;
            const frag = doc.createDocumentFragment();
            let last = 0, m;
            while ((m = KW_REGEX.exec(text)) !== null) {
              const k = m[0].toLowerCase();
              if (!LORE_DB[k]) continue;
              if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
              const span = doc.createElement("span");
              span.className = "lore-kw";
              span.setAttribute("data-kw", k);
              span.title = t("reader.searchWiki");
              span.textContent = m[0];
              frag.appendChild(span);
              last = m.index + m[0].length;
            }
            if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
            node.parentNode?.replaceChild(frag, node);
          });

            // Detect scene-break paragraphs (empty or decorative-only).
          doc.body.querySelectorAll('p').forEach(p => {
            if (!p.textContent.replace(/[\u00A0\s *·•~-]/g, '')) p.classList.add('epub-scene-break');
          });

          // Only add spacing where the EPUB has explicit scene breaks — do NOT touch
          // normal paragraphs so the book's own typography is preserved.
          // Two cases:
          //   1. Empty/nbsp paragraphs detected above → force visible height+margin
          //   2. Paragraphs the EPUB already gives a large margin-top (≥12px) → boost them
          doc.body.querySelectorAll('p').forEach(p => {
            if (p.classList.contains('epub-scene-break')) {
              p.style.setProperty('margin-top',    '1.5em', 'important');
              p.style.setProperty('margin-bottom', '1.5em', 'important');
              p.style.setProperty('min-height',    '1.2em', 'important');
            } else {
              const mt = parseFloat(contents.window.getComputedStyle(p).marginTop) || 0;
              if (mt >= 12) {
                p.style.setProperty('margin-top', Math.max(mt, 24) + 'px', 'important');
              }
            }
          });

          doc.addEventListener("click", (e) => {
            const kw = e.target?.closest?.("[data-kw]")?.getAttribute?.("data-kw");
            if (kw && LORE_DB[kw]) {
              e.preventDefault();
              e.stopPropagation();
              setLorePick(kw);
            }
          });

          // Touch navigation lives here (not on an outer overlay) so taps hit the
          // iframe natively — the click listener above handles lore/anchors with the
          // browser's own hit-testing. Swipe + edge-tap turn the page in paginated
          // mode; scroll mode turns by scrolling.
          let _tsx = 0, _tsy = 0;
          doc.addEventListener("touchstart", (ev) => {
            const tp = ev.touches?.[0];
            if (tp) { _tsx = tp.clientX; _tsy = tp.clientY; }
          }, { passive: true });
          doc.addEventListener("touchend", (ev) => {
            if (!settingsRef.current.paginate) return;   // scroll mode turns pages by scrolling
            const tp = ev.changedTouches?.[0];
            if (!tp) return;
            const dx = tp.clientX - _tsx, dy = tp.clientY - _tsy;
            // Horizontal swipe → page turn. (Side-tap-to-turn is handled by the
            // transparent React-layer strips, which use reliable native coordinates
            // — in-iframe clientX was unreliable across single/two-page layouts.)
            if (Math.abs(dx) > 50 && Math.abs(dy) < Math.abs(dx) * 0.7) {
              if (dx < 0) navFnsRef.current.next(); else navFnsRef.current.prev();
            }
          }, { passive: true });

          // mouseup: instant dictionary on desktop/phone
          doc.addEventListener("mouseup", () => {
            const text = contents.window.getSelection()?.toString()?.trim() ?? "";
            const word = text.replace(/[^a-zA-Z'-]/g, "");
            if (word.length >= 2 && word.length < 40) setDictWord(word);
          });

          // selectionchange: for tablet where Android clears the selection when its
          // native menu appears. Store the word when selection exists; only start a
          // new timer on a valid word so the timer survives the native-menu clear.
          let pendingWord = "";
          let selTimer = null;
          doc.addEventListener("selectionchange", () => {
            const text = contents.window.getSelection()?.toString()?.trim() ?? "";
            const word = text.replace(/[^a-zA-Z'-]/g, "");
            if (word.length >= 2 && word.length < 40) {
              pendingWord = word;
              clearTimeout(selTimer);
              selTimer = setTimeout(() => { if (pendingWord) setDictWord(pendingWord); }, 350);
            }
            // Do NOT cancel timer on empty selection — Android native menu clears the
            // iframe selection when it steals focus, but pendingWord is still valid.
          });
        });

        const savedCfi = cfiRef.current || localStorage.getItem(`wh40k_cfi_${userId}_${bookId}`);
        rend.display(savedCfi || undefined);

        // loc.start.percentage uses spine position (chapter index / total) before
        // locations are generated — last chapter reads as ~100% regardless of actual
        // content position. Only use percentageFromCfi() after generate() completes.
        let locationsReady = false;

        // In scroll/continuous mode, release the nav lock only on `rendered`
        // (chapter content in DOM), not `relocated` (fires on every scroll tick).
        if (manager === "continuous") {
          rend.on("rendered", () => {
            if (cancelled) return;
            navLockRef.current = false;
            clearTimeout(navLockTimer.current);
          });
        }

        rend.on("relocated", (loc) => {
          if (cancelled) return;
          atStartRef.current = loc.atStart ?? false;
          // Paginated: release lock here (one event per page turn).
          // Scroll: lock already released by `rendered` above.
          if (manager !== "continuous") {
            navLockRef.current = false;
            clearTimeout(navLockTimer.current);
            // Page-turn settled — restore instant scroll so CFI jumps (resume, TOC,
            // bookmarks) don't slowly scroll across the chapter.
            const sc = containerRef.current?.querySelector('.epub-container');
            if (sc) sc.style.scrollBehavior = 'auto';
          }
          // Keep the mask up while a programmatic scroll-mode jump settles —
          // runScrollNav lifts it once the snap is done.
          if (!navHoldRef.current) setNavFade(false);
          const cfi = loc.start?.cfi;
          if (cfi) { cfiRef.current = cfi; setCurCfi(cfi); }
          if (tocRef.current.length > 0 && loc.start?.href) {
            const base = decodeURIComponent(loc.start.href).split("#")[0].split("/").pop();
            const found = tocRef.current.find(ch =>
              ch.href && decodeURIComponent(ch.href).split("#")[0].split("/").pop() === base
            );
            setChLabel(found?.label?.trim() || "");
          }
          // Time-left-in-chapter estimate (paginated only). epub.js gives the
          // current page / total pages of the displayed section; multiply the
          // remaining fraction by the rendered section's word count and divide
          // by an average reading speed (~220 wpm). Best-effort — hidden if the
          // page counters aren't available (e.g. scroll mode).
          const disp = loc.start?.displayed;
          if (settingsRef.current.paginate && disp && disp.total > 0) {
            let words = 0;
            (rend.getContents?.() || []).forEach(c => {
              const txt = c?.document?.body?.innerText?.trim() || "";
              if (txt) words += txt.split(/\s+/).length;
            });
            const remainFrac = Math.max(0, (disp.total - disp.page) / disp.total);
            setChMinLeft(words > 0 ? Math.round((words * remainFrac) / 220) : null);
          } else {
            setChMinLeft(null);
          }
          if (locationsReady && cfi) {
            const pct = book.locations.percentageFromCfi(cfi) ?? 0;
            setProgress(Math.round(pct * 100));
            clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => {
              if (cancelled) return;
              onProgress?.(pct);
              localStorage.setItem(`wh40k_cfi_${userId}_${bookId}`, cfi);
              saveProgressToSupabase(userId, bookId, pct, cfi);
            }, 1500);
          } else if (cfi) {
            // Locations not ready yet — persist CFI only, defer progress update
            clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => {
              if (cancelled) return;
              localStorage.setItem(`wh40k_cfi_${userId}_${bookId}`, cfi);
              saveProgressToSupabase(userId, bookId, null, cfi);
            }, 1500);
          }
        });

        rend.on("click", () => toggleUI());

        const readyTimeout = setTimeout(() => {
          if (!cancelled) { setError(t("reader.tookTooLong")); setLoading(false); }
        }, 20000);


        book.ready
          .then(() => {
            clearTimeout(readyTimeout);
            if (cancelled) return;
            setLoading(false);
            // Continuous (scroll) manager doesn't scroll to the saved CFI on the
            // initial pre-ready display — re-issue it now that the section can be
            // measured so the book resumes at the exact saved position.
            if (manager === "continuous" && savedCfi) {
              setTimeout(() => { if (!cancelled) displayCfi(savedCfi); }, 250);
            }
            return book.loaded.navigation;
          })
          .then(nav => {
            if (cancelled || !nav) return;
            const flat = flattenToc(nav.toc);
            setToc(flat);
            tocRef.current = flat;
          })
          .catch(e => {
            clearTimeout(readyTimeout);
            if (cancelled) return;
            const msg = e?.message || "";
            const friendly = msg.includes("403") ? t("reader.linkExpired")
                           : msg.includes("404") ? t("reader.fileNotFound")
                           : msg || t("reader.failedLoadBook");
            setError(friendly);
            setLoading(false);
          });

        book.locations.generate(1536).then(() => {
          if (cancelled) return;
          locationsReady = true;
          const cfi = cfiRef.current;
          const pct = cfi ? (book.locations.percentageFromCfi(cfi) ?? 0) : 0;
          if (pct != null) {
            setProgress(Math.round(pct * 100));
            onProgress?.(pct);
            saveProgressToSupabase(userId, bookId, pct, cfi || undefined);
          }
          if (!savedCfi && (initProgress ?? 0) > 0) {
            const jumpCfi = book.locations.cfiFromPercentage(initProgress);
            if (jumpCfi) rend.display(jumpCfi);
          }
        }).catch(() => {});

      } catch (e) {
        if (!cancelled) { setError(e?.message || t("reader.failedInit")); setLoading(false); }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(saveTimer.current);
      clearTimeout(hideTimer.current);
      clearTimeout(navLockTimer.current);
      navLockRef.current = false;
      if (bookRef.current) { try { bookRef.current.destroy(); } catch {} bookRef.current = null; }
      rendRef.current = null;
    };
  // Re-create rendition only when URL or layout settings change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrayBuffer, url, settings.paginate, settings.twoPage]);

  // ── Typography updates ────────────────────────────────────────────────────
  useEffect(() => {
    if (!rendRef.current) return;
    applyTheme(rendRef.current, settings, T, fnt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.fontSize, settings.fontIndex, settings.lineHeight, settings.themeId]);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      try {
        rendRef.current?.resize();
        const cfi = cfiRef.current;
        if (cfi) setTimeout(() => rendRef.current?.display(cfi), 100);
      } catch {}
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);


  // ── Navigation ────────────────────────────────────────────────────────────
  // Instant page turn. The navFade overlay (page-bg colour) masks the brief flash
  // while a new chapter iframe loads and doubles as a subtle cross-page fade — it
  // renders on every device, unlike the 3D curl we dropped.
  const nav = useCallback((dir) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    // Safety release in case relocated never fires (e.g. already at first/last chapter)
    clearTimeout(navLockTimer.current);
    navLockTimer.current = setTimeout(() => { navLockRef.current = false; }, 3000);
    const sc = containerRef.current?.querySelector('.epub-container');
    if (sc) sc.style.scrollBehavior = 'auto';
    setNavDir(dir);
    setNavFade(true);
    if (dir > 0) rendRef.current?.next(); else rendRef.current?.prev();
  }, []);
  const next = useCallback(() => nav(1),  [nav]);
  const prev = useCallback(() => { if (!atStartRef.current) nav(-1); }, [nav]);

  // Touch navigation runs inside each chapter iframe (see content hook) so lore taps,
  // anchors and word selection are hit-tested natively by the browser — no overlay,
  // no outer→iframe coordinate translation that the body{zoom} factor kept breaking.
  // Expose the latest next/prev to that hook via a ref to avoid stale closures.
  const navFnsRef = useRef({ next: () => {}, prev: () => {} });
  navFnsRef.current = { next, prev };

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") {
        if      (dictWord)      setDictWord(null);
        else if (showSettings)  setShowSettings(false);
        else if (showToc)       setShowToc(false);
        else if (showBmPanel)   setShowBmPanel(false);
        else                    onClose?.();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, prev, dictWord, showSettings, showToc, showBmPanel, onClose]);

  const isBookmarked = bookmarks.some(b => b.cfi === curCfi);

  const toggleBookmark = useCallback(() => {
    const cfi = cfiRef.current;
    if (!cfi) return;
    setBookmarks(prev => {
      const exists = prev.some(b => b.cfi === cfi);
      let next;
      if (exists) {
        next = prev.filter(b => b.cfi !== cfi);
        deleteBmFromDB(userId, bookId, cfi);
      } else {
        const bm = { cfi, label: chLabel || "—", pct: progress, createdAt: new Date().toISOString() };
        next = [bm, ...prev].slice(0, 20);
        putBmToDB(userId, bookId, bm);
        setBmFlash(true);
        setTimeout(() => setBmFlash(false), 1000);
      }
      localStorage.setItem(bmKey, JSON.stringify(next));
      return next;
    });
  }, [chLabel, progress, bmKey, userId, bookId]);

  const goToBookmark = useCallback((bm) => {
    if (!bm?.cfi) return;
    displayCfi(bm.cfi);
    setShowBmPanel(false);
  }, [displayCfi]);

  const deleteBookmark = useCallback((cfi) => {
    setBookmarks(prev => {
      const next = prev.filter(b => b.cfi !== cfi);
      localStorage.setItem(bmKey, JSON.stringify(next));
      deleteBmFromDB(userId, bookId, cfi);
      return next;
    });
  }, [bmKey, userId, bookId]);

  // ── Search ────────────────────────────────────────────────────────────────
  // ── Error screen ──────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ position:"fixed", inset:0, background:"#0f0e09", zIndex:999,
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14,
                  padding:"0 28px" }}>
      <p style={{ color:C.gold, fontFamily:"'Cinzel',serif", fontSize:15, margin:0, letterSpacing:1 }}>
        {t("reader.failedToLoad")}
      </p>
      <p style={{ color:"#c8bfa8", fontSize:13, margin:0, textAlign:"center", lineHeight:1.6, maxWidth:360 }}>
        {error}
      </p>
      <button onClick={onClose}
        style={{ marginTop:8, background:"transparent", border:`1px solid ${C.gold}55`,
                 borderRadius:8, color:C.gold, padding:"9px 24px", cursor:"pointer",
                 fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:1 }}>
        {t("reader.close")}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, background:T.bg, zIndex:999 }}>

      {/* Loading overlay */}
      {loading && (
        <div style={{ position:"absolute", inset:0, background:T.bg, zIndex:50,
                      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
          <div style={{ width:36, height:36, border:`2px solid ${T.border}`, borderTopColor:C.gold,
                        borderRadius:"50%", animation:"rdrSpin 1s linear infinite" }} />
          <p style={{ fontFamily:"'Cinzel',serif", color:T.muted, fontSize:12, letterSpacing:2, margin:0 }}>
            {t("reader.loading")}
          </p>
        </div>
      )}

      {/* epub.js renders here. Full-height (top:0) so hiding the floating header
          leaves no empty band — the page fills the screen like a real book. The
          header is a translucent overlay that floats over the top margin. A small
          top padding on the host (not the body) gives breathing room without
          breaking epub's column pagination. */}
      <div ref={containerRef} style={{ position:"absolute", top:0, bottom:0, left:0, right:0, background:T.bg,
                                        padding: settings.paginate ? "12px clamp(8px, 3.5vw, 64px) 0" : 0 }} />

      {/* Open-book centre spine — a soft shadow down the gutter when two pages sit
          side by side (landscape, paginated, two-page). Sells the "real book" look,
          especially on the warm Sepia / Paper themes. */}
      {settings.paginate && settings.twoPage && isWide && (
        <div style={{
          position:"absolute", top:0, bottom:0, left:"50%", width:64, marginLeft:-32,
          zIndex:4, pointerEvents:"none",
          background:"linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.12) 42%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.12) 58%, rgba(0,0,0,0) 100%)",
        }} />
      )}

      {/* Side tap-to-turn zones (paginated only). Transparent strips confined to the
          blank page margins — their width matches the text column's side padding
          (clamp(8px,3.5vw,64px) on line ~1100) exactly, so they never overlap the
          text and word selection stays free everywhere the text actually is. They
          live in the React layer for reliable native coordinates. */}
      {settings.paginate && !loading && (<>
        <div onClick={prev} aria-label={t("reader.prevPage") || "Previous page"}
             style={{ position:"absolute", top:54, bottom:0, left:0, width:"clamp(8px, 3.5vw, 64px)", zIndex:6, cursor:"pointer" }} />
        <div onClick={next} aria-label={t("reader.nextPage") || "Next page"}
             style={{ position:"absolute", top:54, bottom:0, right:0, width:"clamp(8px, 3.5vw, 64px)", zIndex:6, cursor:"pointer" }} />
        {/* tap zones stay below top:54 so they never sit under the header's
            back / bookmark / settings buttons while it's visible */}
      </>)}

      {/* Page-turn overlay — a solid page-coloured panel that masks the white iframe
          flash during chapter load, then SLIDES away in the reading direction once
          relocated fires, revealing the new page underneath. Pure 2D translate on an
          overlay div (never touches epub.js' scroll), so it paints on every device —
          unlike the 3D curl we dropped. dir>0 (forward) → old page slides left. */}
      <div style={{
        position:"absolute", top:0, bottom:0, left:0, right:0,
        background:T.bg, zIndex:11, pointerEvents:"none",
        boxShadow: navDir > 0
          ? "-34px 0 60px -4px rgba(0,0,0,0.6), -12px 0 18px -6px rgba(0,0,0,0.45)"
          : "34px 0 60px -4px rgba(0,0,0,0.6), 12px 0 18px -6px rgba(0,0,0,0.45)",
        opacity: 1,
        transform: navFade ? "translateX(0)" : `translateX(${navDir > 0 ? "-100%" : "100%"})`,
        transition: navFade ? "none" : "transform 0.95s cubic-bezier(0.25, 0.8, 0.32, 1)",
      }} />


      {/* Bookmark saved flash */}
      {bmFlash && (
        <div style={{ position:"absolute", top:62, left:"50%", transform:"translateX(-50%)",
                      zIndex:200, background:C.gold, color:"#0a0905",
                      fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
                      padding:"6px 18px", borderRadius:20, pointerEvents:"none",
                      animation:"rdrIn .15s ease" }}>
          {t("reader.bookmarkSaved")}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, height:54,
        background:`${T.bg}ee`, backdropFilter:"blur(10px)",
        borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 8px",
        opacity:uiVisible?1:0, pointerEvents:uiVisible?"auto":"none",
        transition:"opacity .25s ease", zIndex:20,
      }}>
        <button onClick={onClose}
          style={{ background:"transparent", border:"none", color:T.muted,
                   cursor:"pointer", padding:"10px 12px", fontSize:20, lineHeight:1 }}>
          ‹
        </button>

        <span style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:T.text, letterSpacing:1,
                       flex:1, textAlign:"center", overflow:"hidden", textOverflow:"ellipsis",
                       whiteSpace:"nowrap", padding:"0 4px" }}>
          {title || ""}
        </span>

        <div style={{ display:"flex", alignItems:"center" }}>
          {nowPlaying && (
            <>
              <button onClick={onMusicClick} title={nowPlaying.title}
                style={{ background:"transparent", border:"none", cursor:"pointer",
                         padding:"6px 2px 6px 4px", display:"flex", alignItems:"center",
                         maxWidth:72, overflow:"hidden", flexShrink:0 }}>
                <span style={{ fontSize:9, color:"rgba(212,203,184,0.5)", overflow:"hidden",
                               textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {nowPlaying.title}
                </span>
              </button>
              <button onClick={onTogglePauseMusic} title={musicPaused?t("reader.resumeMusic"):t("reader.pauseMusic")} aria-label={musicPaused?"Resume music":"Pause music"}
                style={{ background:"transparent", border:"none", cursor:"pointer",
                         padding:"4px 4px", color:nowPlaying.type==="youtube"?"#FF4444":"#1DB954",
                         fontSize:12, lineHeight:1, flexShrink:0 }}>
                {musicPaused ? "▶" : "⏸"}
              </button>
              <button onClick={onStopMusic} title={t("reader.stopMusic")} aria-label="Stop music"
                style={{ background:"transparent", border:"none", cursor:"pointer",
                         padding:"4px 5px", color:"rgba(212,203,184,0.45)", fontSize:14,
                         lineHeight:1, flexShrink:0 }}>
                ✕
              </button>
            </>
          )}
          <IBtn onClick={() => setShowSearch(true)}     color={T.muted}                           title={t("reader.search")}>🔍</IBtn>
          {settings.paginate && (
            <IBtn onClick={() => setShowToc(v=>!v)}       color={T.muted}                           title={t("reader.contents")}>☰</IBtn>
          )}
          <IBtn onClick={toggleBookmark}               color={isBookmarked ? C.gold : T.muted}    title={isBookmarked ? t("reader.removeBookmark") : t("reader.addBookmark")}>{isBookmarked ? "★" : "☆"}</IBtn>
          <IBtn onClick={() => setShowBmPanel(v=>!v)}  color={bookmarks.length ? C.gold : T.muted} title={t("reader.bookmarks")}>🔖</IBtn>
          <IBtn onClick={() => setShowSettings(true)}  color={T.muted}                           title={t("reader.settings")}>⚙</IBtn>
          {document.fullscreenEnabled && (
            <IBtn onClick={toggleFullscreen} color={isFullscreen?C.gold:T.muted} title={isFullscreen?t("reader.exitFullscreen"):t("reader.fullscreen")}>
              {isFullscreen ? "⊡" : "⛶"}
            </IBtn>
          )}
        </div>
      </div>


      {/* ── Footer: chapter + time-left estimate ───────────────────────────── */}
      {settings.paginate && chMinLeft !== null && (
        <div style={{
          position:"absolute", bottom:0, left:0, right:0,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:12, padding:"0 16px", height:34,
          background:`${T.bg}cc`, backdropFilter:"blur(8px)",
          borderTop:`1px solid ${T.border}`,
          opacity:uiVisible?1:0, pointerEvents:"none",
          transition:"opacity .25s ease", zIndex:18,
        }}>
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:9.5, color:T.muted,
                         letterSpacing:0.5, overflow:"hidden", textOverflow:"ellipsis",
                         whiteSpace:"nowrap", flex:1 }}>
            {chLabel}
          </span>
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:9.5, color:C.gold,
                         letterSpacing:0.5, whiteSpace:"nowrap", flexShrink:0 }}>
            {chMinLeft >= 1
              ? t("reader.minLeftInChapter").replace("{n}", chMinLeft)
              : t("reader.lessThanMinLeft")}
          </span>
        </div>
      )}

      {/* ── Table of Contents ──────────────────────────────────────────────── */}
      {showToc && (
        <div onClick={() => setShowToc(false)}
          style={{ position:"absolute", inset:0, zIndex:1000, background:"rgba(0,0,0,0.55)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", left:0, top:0, bottom:0,
                     width:Math.min(310, window.innerWidth * 0.85),
                     background:T.surface, borderRight:`1px solid ${T.border}`,
                     animation:"rdrIn .2s ease", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"16px 16px 10px", borderBottom:`1px solid ${T.border}`,
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                          position:"sticky", top:0, background:T.surface, zIndex:1, flexShrink:0 }}>
              <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:T.text }}>{t("reader.contents")}</span>
              <button onClick={() => setShowToc(false)} aria-label="Close contents"
                style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            <div style={{ overflowY:"auto", flex:1 }}>
              {toc.length === 0 ? (
                <p style={{ textAlign:"center", color:T.muted, fontSize:12, padding:"28px 16px", fontStyle:"italic" }}>
                  {t("reader.loadingContents")}
                </p>
              ) : toc.map((ch, i) => (
                <button key={i}
                  onClick={() => { displayCfi(ch.href); setShowToc(false); }}
                  style={{ display:"block", width:"100%", textAlign:"left",
                           background:"transparent", border:"none",
                           borderLeft:`3px solid ${chLabel===ch.label?C.gold:"transparent"}`,
                           padding:`11px 16px 11px ${16 + ch.depth * 12}px`,
                           cursor:"pointer", color:chLabel===ch.label?C.gold:T.muted,
                           fontFamily:"'Cinzel',serif", fontSize:ch.depth===0?11:10,
                           lineHeight:1.5, transition:"background .15s" }}>
                  {ch.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Search-in-book ─────────────────────────────────────────────────── */}
      {showSearch && (
        <div onClick={() => { searchToken.current++; setShowSearch(false); }}
          style={{ position:"absolute", inset:0, zIndex:1000, background:"rgba(0,0,0,0.55)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", left:0, top:0, bottom:0,
                     width:Math.min(360, window.innerWidth * 0.9),
                     background:T.surface, borderRight:`1px solid ${T.border}`,
                     animation:"rdrIn .2s ease", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"14px 14px 12px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:T.text }}>{t("reader.search")}</span>
                <button onClick={() => { searchToken.current++; setShowSearch(false); }} aria-label="Close search"
                  style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>✕</button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); runSearch(searchQuery); }}
                    style={{ display:"flex", gap:8 }}>
                <input autoFocus value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("reader.searchPlaceholder")}
                  style={{ flex:1, background:T.bg, border:`1px solid ${T.border}`, borderRadius:8,
                           color:T.text, padding:"9px 12px", fontFamily:"'Cinzel',serif", fontSize:12,
                           outline:"none" }} />
                <button type="submit"
                  style={{ background:`${C.gold}1c`, border:`1px solid ${C.gold}55`, borderRadius:8,
                           color:C.gold, padding:"0 14px", cursor:"pointer", fontSize:14, flexShrink:0 }}>🔍</button>
              </form>
            </div>
            <div style={{ overflowY:"auto", flex:1 }}>
              {searching && searchResults.length === 0 ? (
                <p style={{ textAlign:"center", color:T.muted, fontSize:12, padding:"24px 16px", fontStyle:"italic" }}>
                  {t("reader.searching")}
                </p>
              ) : searched && !searching && searchResults.length === 0 ? (
                <p style={{ textAlign:"center", color:T.muted, fontSize:12, padding:"24px 16px", fontStyle:"italic" }}>
                  {t("reader.noResults")}
                </p>
              ) : (<>
                {searchResults.length > 0 && (
                  <p style={{ color:T.muted, fontSize:10, letterSpacing:1, padding:"10px 16px 4px",
                              margin:0, textTransform:"uppercase", fontFamily:"'Cinzel',serif" }}>
                    {t("reader.searchResults").replace("{n}", searchResults.length)}
                    {searching ? " …" : ""}
                  </p>
                )}
                {searchResults.map((r, i) => (
                  <button key={i}
                    onClick={() => { displayCfi(r.cfi); searchToken.current++; setShowSearch(false); }}
                    style={{ display:"block", width:"100%", textAlign:"left",
                             background:"transparent", border:"none",
                             borderBottom:`1px solid ${T.border}`,
                             padding:"11px 16px", cursor:"pointer" }}>
                    {r.label && (
                      <div style={{ fontFamily:"'Cinzel',serif", fontSize:9.5, color:C.gold,
                                    letterSpacing:0.5, marginBottom:4, overflow:"hidden",
                                    textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {r.label}
                      </div>
                    )}
                    <div style={{ fontSize:12, color:T.text, lineHeight:1.5 }}>
                      {highlightExcerpt(r.excerpt, searchQuery)}
                    </div>
                  </button>
                ))}
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* ── Bookmarks panel ────────────────────────────────────────────────── */}
      {showBmPanel && (
        <div onClick={() => setShowBmPanel(false)}
          style={{ position:"absolute", inset:0, zIndex:1000, background:"rgba(0,0,0,0.55)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", right:0, top:0, bottom:0,
                     width:Math.min(300, window.innerWidth * 0.85),
                     background:T.surface, borderLeft:`1px solid ${T.border}`,
                     animation:"rdrIn .2s ease", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"14px 16px 10px", borderBottom:`1px solid ${T.border}`,
                          display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
              <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:T.text }}>{t("reader.bookmarks")}</span>
              <button onClick={() => setShowBmPanel(false)} aria-label="Close bookmarks"
                style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            <p style={{ fontSize:11, color:T.muted, padding:"8px 16px 0", margin:0, lineHeight:1.5 }}>
              {t("reader.bookmarkHint").split("{star}").flatMap((part, i) =>
                i === 0 ? [part] : [<span key={i} style={{ color:C.gold }}>☆</span>, part]
              )}
            </p>
            {bookmarks.length === 0 ? (
              <p style={{ textAlign:"center", color:T.muted, fontSize:12, padding:"24px 16px", fontStyle:"italic", lineHeight:1.6 }}>
                {t("reader.noBookmarks")}<br/>{t("reader.tapStarToAdd")}
              </p>
            ) : (
              <div style={{ overflowY:"auto", flex:1 }}>
                {bookmarks.map((bm, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"stretch", borderBottom:`1px solid ${T.border}` }}>
                    <button onClick={() => goToBookmark(bm)}
                      style={{ flex:1, textAlign:"left", background:"transparent", border:"none",
                               padding:"12px 16px", cursor:"pointer" }}>
                      <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:T.text,
                                    marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {bm.label || t("reader.bookmarkLabel")}
                      </div>
                      <div style={{ fontSize:11, color:C.gold, fontFamily:"'Cinzel',serif" }}>
                        {bm.pct > 0 ? `${bm.pct}%` : "—"}
                      </div>
                    </button>
                    <button onClick={() => deleteBookmark(bm.cfi)} title={t("reader.delete")} aria-label="Delete bookmark"
                      style={{ background:"transparent", border:"none", borderLeft:`1px solid ${T.border}`,
                               color:T.muted, padding:"0 14px", cursor:"pointer", fontSize:16,
                               flexShrink:0, display:"flex", alignItems:"center" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Dictionary ─────────────────────────────────────────────────────── */}
      {dictWord && (
        <DictionaryPanel word={dictWord} onClose={() => setDictWord(null)} theme="dark" />
      )}

      {/* ── Settings ───────────────────────────────────────────────────────── */}
      {showSettings && (
        <SettingsPanel settings={settings} onChange={updateSetting} onClose={() => setShowSettings(false)} />
      )}

      {/* ── Lore picker ────────────────────────────────────────────────────── */}
      {lorePick && (
        <div onClick={() => setLorePick(null)}
          style={{ position:"absolute", inset:0, zIndex:300 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", bottom:80, left:16, right:16, background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 16px 14px", boxShadow:"0 -4px 24px rgba(0,0,0,0.6)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div>
                <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:14, color:C.gold, marginBottom:2 }}>{LORE_DB[lorePick]?.name || lorePick}</div>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.muted, letterSpacing:2, textTransform:"uppercase" }}>{t("reader.searchOn")}</div>
              </div>
              <button onClick={() => setLorePick(null)} aria-label="Close" style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:6, color:C.muted, padding:"2px 8px", cursor:"pointer", fontSize:12 }}>✕</button>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <a href={wikiUrl(lorePick)} target="_blank" rel="noopener noreferrer"
                onClick={() => setLorePick(null)}
                style={{ flex:1, display:"block", padding:"11px 8px", background:`${C.gold}18`, border:`1px solid ${C.gold}44`, borderRadius:10, color:C.gold, fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1, textDecoration:"none", textAlign:"center" }}>
                {t("reader.fandomWiki")}
              </a>
              <a href={lexUrl(lorePick)} target="_blank" rel="noopener noreferrer"
                onClick={() => setLorePick(null)}
                style={{ flex:1, display:"block", padding:"11px 8px", background:`${C.blue}18`, border:`1px solid ${C.blue}44`, borderRadius:10, color:C.blue, fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1, textDecoration:"none", textAlign:"center" }}>
                {t("reader.lexicanum")}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
// Bold the matched query inside a search excerpt (case-insensitive), keeping
// the original casing of the surrounding text.
function highlightExcerpt(excerpt, query) {
  const q = (query || "").trim();
  if (!q) return excerpt;
  const lower = (excerpt || "").toLowerCase();
  const lq = q.toLowerCase();
  const out = [];
  let i = 0, pos;
  while ((pos = lower.indexOf(lq, i)) !== -1) {
    if (pos > i) out.push(excerpt.slice(i, pos));
    out.push(<mark key={pos} style={{ background:"transparent", color:C.gold, fontWeight:700 }}>
      {excerpt.slice(pos, pos + q.length)}
    </mark>);
    i = pos + q.length;
  }
  if (i < excerpt.length) out.push(excerpt.slice(i));
  return out;
}

function IBtn({ onClick, color, title, children }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      style={{ background:"transparent", border:"none", color, cursor:"pointer",
               padding:"10px 9px", fontSize:17, lineHeight:1, transition:"color .15s" }}>
      {children}
    </button>
  );
}
