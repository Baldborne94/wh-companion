import { useState, useEffect, useRef, useCallback } from "react";
import ePub from "epubjs";
import { supabase } from "../lib/supabase";
import { C, THEMES, FONTS } from "../data/constants";
import { LORE_DB, wikiUrl, KW_REGEX } from "../data/lore";

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

async function saveBmsToDB(userId, bookId, bms) {
  if (!userId || !bookId) return;
  try {
    await supabase.from("bookmarks").delete().eq("user_id", userId).eq("book_id", bookId);
    if (bms.length) await supabase.from("bookmarks").insert(
      bms.map(b => ({ user_id:userId, book_id:bookId, epub_cfi:b.cfi, label:b.label, progress:b.pct|0 }))
    );
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────
const DEF = { fontIndex:0, fontSize:18, lineHeight:1.8, paginate:true, twoPage:false, themeId:"dark" };

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
            Looking up &ldquo;{word}&rdquo;…
          </p>
        )}

        {!loading && !entry && (
          <p style={{ textAlign:"center", color:T.muted, fontStyle:"italic", padding:"28px 0" }}>
            No definition found for &ldquo;{word}&rdquo;
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
                      Syn: <span style={{ color:T.text }}>{m.synonyms.slice(0,6).join(", ")}</span>
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
            Reading Settings
          </span>
          <button onClick={onClose} style={{ background:"transparent", border:`1px solid ${T.border}`,
            borderRadius:6, color:T.muted, width:30, height:30, cursor:"pointer", fontSize:14,
            display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim,
                      letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>Typeface</div>
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

        <Row label={`Font size — ${settings.fontSize}px`}>
          {[14,16,18,20,22,24].map(s => (
            <Chip key={s} label={String(s)} active={settings.fontSize===s} onClick={() => onChange("fontSize",s)} />
          ))}
        </Row>

        <Row label={`Line spacing — ${settings.lineHeight}×`}>
          {[1.5,1.7,1.9,2.1].map(v => (
            <Chip key={v} label={String(v)} active={settings.lineHeight===v} onClick={() => onChange("lineHeight",v)} />
          ))}
        </Row>

        <Row label="Reading mode">
          <Chip label="Pages"  active={ settings.paginate} onClick={() => onChange("paginate",true)} />
          <Chip label="Scroll" active={!settings.paginate} onClick={() => { onChange("paginate",false); onChange("twoPage",false); }} />
        </Row>

        {settings.paginate && (
          <Row label="Layout">
            <Chip label="Single"   active={!settings.twoPage} onClick={() => onChange("twoPage",false)} />
            <Chip label="Two-page" active={ settings.twoPage} onClick={() => onChange("twoPage",true)} />
          </Row>
        )}

        <Row label="Theme">
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
  initProgress, initChapterIndex, initPageIndex,
  onProgress, onClose, nowPlaying, musicPaused, onMusicClick, onStopMusic, onTogglePauseMusic,
}) {
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

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showUI,        setShowUI]        = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showToc,       setShowToc]       = useState(false);
  const [dictWord,      setDictWord]      = useState(null);
  const [pageDisplay,   setPageDisplay]   = useState(null);
  const [isFullscreen,  setIsFullscreen]  = useState(false);

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
  // Pre-load CFI from DB if nothing in localStorage (new device)
  useEffect(() => {
    const cfiKey = `wh40k_cfi_${userId}_${bookId}`;
    if (!userId || !bookId || localStorage.getItem(cfiKey)) return;
    loadCfiFromDB(userId, bookId).then(cfi => {
      if (!cfi) return;
      localStorage.setItem(cfiKey, cfi);
      cfiRef.current = cfi;
      if (rendRef.current) rendRef.current.display(cfi);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, bookId]);

  // Pre-load bookmarks from DB if nothing in localStorage (new device)
  useEffect(() => {
    if (!userId || !bookId || localStorage.getItem(bmKey)) return;
    loadBmsFromDB(userId, bookId).then(bms => {
      if (!bms.length) return;
      setBookmarks(bms);
      localStorage.setItem(bmKey, JSON.stringify(bms));
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
  const swipeRef     = useRef({ x:0, y:0, active:false });
  // Prevent rapid-fire nav calls before epub.js finishes loading the chapter.
  // In paginated mode the lock releases on `relocated` (page turn done).
  // In scroll/continuous mode `relocated` fires on every scroll-position change
  // (too early) — the lock releases on `rendered` instead (chapter in DOM).
  const navLockRef   = useRef(false);
  const navLockTimer = useRef(null);
  // Track start-of-book so prev() doesn't fire when there is no prev chapter.
  const atStartRef   = useRef(false);

  // In scrolled mode, always show UI (no swipe overlay to trigger revealUI)
  const uiVisible = !isTouch.current || !settings.paginate || showUI;

  const revealUI = useCallback(() => {
    if (!isTouch.current) return;
    setShowUI(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowUI(false), 4000);
  }, []);

  // Keep UI visible while a panel is open
  useEffect(() => {
    if (showSettings || showToc || showBmPanel) {
      clearTimeout(hideTimer.current);
      setShowUI(true);
    }
  }, [showSettings, showToc, showBmPanel]);

  // ── Book init / layout change ─────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (!arrayBuffer && !url) {
      setError("No download link — please close and reopen the book.");
      setLoading(false);
      return;
    }
    let cancelled = false;

    setLoading(true);
    setError(null);
    setChLabel("");
    setProgress(0);
    setPageDisplay(null);

    // Destroy previous instance
    if (bookRef.current) {
      try { bookRef.current.destroy(); } catch {}
      bookRef.current = null;
    }
    rendRef.current = null;

    const flow    = settings.paginate ? "paginated" : "scrolled";
    const manager = settings.paginate ? "default"   : "continuous";
    const spread  = settings.paginate && settings.twoPage ? "always" : "none";

    (async () => {
      if (cancelled || !containerRef.current) return;

      // Use pre-downloaded ArrayBuffer when available (avoids CORS/network issues
      // that can occur when fetching a signed URL from inside an iframe/tablet PWA).
      // Fall back to fetching the URL only when no ArrayBuffer was passed.
      let epubBuf = arrayBuffer ?? null;
      if (!epubBuf) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status} — download link may have expired. Please close and reopen.`);
          epubBuf = await resp.arrayBuffer();
        } catch (fetchErr) {
          if (!cancelled) { setError(fetchErr.message || "Failed to download book"); setLoading(false); }
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
          minSpreadWidth: 900,
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
              span.title = "Open on Fandom Wiki ↗";
              span.textContent = m[0];
              frag.appendChild(span);
              last = m.index + m[0].length;
            }
            if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
            node.parentNode?.replaceChild(frag, node);
          });

            // Detect scene-break paragraphs (empty /   / decorative chars).
          doc.body.querySelectorAll('p').forEach(p => {
            if (!p.textContent.replace(/[ \s *·•~\-]/g, '')) p.classList.add('epub-scene-break');
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
            const kw = e.target?.getAttribute?.("data-kw");
            if (kw && LORE_DB[kw]) {
              e.preventDefault();
              e.stopPropagation();
              // Use outer app window — iframe window.open can be blocked by browser
              appWindow.open(wikiUrl(kw), "_blank", "noopener");
            }
          });

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
          }
          setNavFade(false);
          const cfi = loc.start?.cfi;
          if (cfi) { cfiRef.current = cfi; setCurCfi(cfi); }
          if (tocRef.current.length > 0 && loc.start?.href) {
            const base = decodeURIComponent(loc.start.href).split("#")[0].split("/").pop();
            const found = tocRef.current.find(ch =>
              ch.href && decodeURIComponent(ch.href).split("#")[0].split("/").pop() === base
            );
            setChLabel(found?.label?.trim() || "");
          }
          // Paginated screen pages — chapter-relative, available immediately (no locations needed)
          const dPage = loc.start?.displayed?.page;
          const dTotal = loc.start?.displayed?.total;
          if (dPage && dTotal > 0) setPageDisplay({ page: dPage, total: dTotal });
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

        rend.on("click", () => revealUI());

        const readyTimeout = setTimeout(() => {
          if (!cancelled) { setError("Book took too long to open — try re-uploading the file."); setLoading(false); }
        }, 20000);


        book.ready
          .then(() => {
            clearTimeout(readyTimeout);
            if (cancelled) return;
            setLoading(false);
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
            const friendly = msg.includes("403") ? "Download link expired — close and reopen the book."
                           : msg.includes("404") ? "Book file not found — try re-uploading."
                           : msg || "Failed to load book";
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
        if (!cancelled) { setError(e?.message || "Failed to initialize reader"); setLoading(false); }
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
  const nav = useCallback((dir) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    // Safety release in case relocated never fires (e.g. already at first/last chapter)
    clearTimeout(navLockTimer.current);
    navLockTimer.current = setTimeout(() => { navLockRef.current = false; }, 3000);
    setNavFade(true);
    if (dir > 0) rendRef.current?.next(); else rendRef.current?.prev();
  }, []);
  const next = useCallback(() => nav(1),  [nav]);
  const prev = useCallback(() => { if (!atStartRef.current) nav(-1); }, [nav]);

  // Swipe handler attached to the transparent overlay div in JSX (not the epub iframe container)
  const onSwipeStart = useCallback((e) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: true };
    revealUI();
  }, [revealUI]);

  const onSwipeEnd = useCallback((e) => {
    if (!swipeRef.current.active) return;
    swipeRef.current.active = false;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;

    // Check if the long-press created a text selection in the iframe.
    // This must run here because the overlay intercepts all touch events, so
    // selectionchange listeners inside the iframe never fire on touch devices.
    // In spread view there are two iframes — pick the one under the touch.
    const iframes = Array.from(containerRef.current?.querySelectorAll('iframe') ?? []);
    const tapIframe = iframes.find(f => {
      const r = f.getBoundingClientRect();
      return swipeRef.current.x >= r.left && swipeRef.current.x <= r.right &&
             swipeRef.current.y >= r.top  && swipeRef.current.y <= r.bottom;
    }) ?? iframes[0];
    if (tapIframe?.contentDocument) {
      const sel = tapIframe.contentDocument.defaultView?.getSelection?.();
      const selText = sel?.toString()?.trim() ?? "";
      const selWord = selText.replace(/[^a-zA-Z'-]/g, "");
      if (selWord.length >= 2 && selWord.length < 40) {
        setDictWord(selWord);
        return;
      }
    }

    // Pure tap — edge zones navigate, centre forwards to epub iframe content.
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const EDGE = 70;
      const tapX = swipeRef.current.x;
      if (tapX < EDGE)                     { prev(); return; }
      if (tapX > window.innerWidth - EDGE) { next(); return; }

      const iframe = tapIframe;
      if (iframe?.contentDocument) {
        const rect = iframe.getBoundingClientRect();
        // body{zoom:N} scales outer clientX/Y but the iframe's internal coordinate
        // system is unzoomed — divide by zoom so caretRangeFromPoint hits the right word.
        const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
        const x = (swipeRef.current.x - rect.left) / zoom;
        const y = (swipeRef.current.y - rect.top) / zoom;
        const el = iframe.contentDocument.elementFromPoint(x, y);

        // 1. Lore keyword → open wiki
        const kw = el?.closest?.('[data-kw]')?.getAttribute?.('data-kw')
                ?? el?.getAttribute?.('data-kw');
        if (kw && LORE_DB[kw]) {
          window.open(wikiUrl(kw), '_blank', 'noopener');
          return;
        }

        // 2. Anchor link → let epub.js handle internal navigation or open external URL
        const anchor = el?.closest?.('a') ?? (el?.tagName === 'A' ? el : null);
        if (anchor) {
          anchor.click();
          return;
        }

        // 3. Any word → dictionary
        // Use Selection.modify to expand to word boundaries — more robust than
        // manual text-node walking which fails at inline elements or line ends.
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        const sel = win.getSelection();
        sel.removeAllRanges();
        let caretRange = null;
        if (doc.caretRangeFromPoint) {
          caretRange = doc.caretRangeFromPoint(x, y);
        } else if (doc.caretPositionFromPoint) {
          const p = doc.caretPositionFromPoint(x, y);
          if (p) { caretRange = doc.createRange(); caretRange.setStart(p.offsetNode, p.offset); caretRange.collapse(true); }
        }
        if (caretRange) {
          sel.addRange(caretRange);
          if (sel.modify) {
            sel.modify('move', 'backward', 'word');
            sel.modify('extend', 'forward', 'word');
          } else {
            const node = caretRange.startContainer;
            const off  = caretRange.startOffset;
            if (node?.nodeType === 3) {
              const txt = node.textContent;
              let s = off, e = off;
              while (s > 0 && /[a-zA-Z'-]/.test(txt[s - 1])) s--;
              while (e < txt.length && /[a-zA-Z'-]/.test(txt[e])) e++;
              caretRange.setStart(node, s);
              caretRange.setEnd(node, e);
              sel.removeAllRanges();
              sel.addRange(caretRange);
            }
          }
          const word = sel.toString().trim().replace(/[^a-zA-Z'-]/g, '');
          sel.removeAllRanges();
          if (word.length >= 2 && word.length < 40) setDictWord(word);
        }
      }
      return;
    }

    // Ignore if too short or more vertical than horizontal
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    if (dx < 0) next(); else prev();
  }, [next, prev]);

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
      } else {
        const bm = { cfi, label: chLabel || "—", pct: progress, createdAt: new Date().toISOString() };
        next = [bm, ...prev].slice(0, 20);
        setBmFlash(true);
        setTimeout(() => setBmFlash(false), 1000);
      }
      localStorage.setItem(bmKey, JSON.stringify(next));
      saveBmsToDB(userId, bookId, next);
      return next;
    });
  }, [chLabel, progress, bmKey, userId, bookId]);

  const goToBookmark = useCallback((bm) => {
    if (!bm?.cfi || !rendRef.current) return;
    rendRef.current.display(bm.cfi)
      .catch(() => setTimeout(() => rendRef.current?.display(bm.cfi), 800));
    setShowBmPanel(false);
  }, []);

  const deleteBookmark = useCallback((cfi) => {
    setBookmarks(prev => {
      const next = prev.filter(b => b.cfi !== cfi);
      localStorage.setItem(bmKey, JSON.stringify(next));
      saveBmsToDB(userId, bookId, next);
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
        Failed to load
      </p>
      <p style={{ color:"#c8bfa8", fontSize:13, margin:0, textAlign:"center", lineHeight:1.6, maxWidth:360 }}>
        {error}
      </p>
      <button onClick={onClose}
        style={{ marginTop:8, background:"transparent", border:`1px solid ${C.gold}55`,
                 borderRadius:8, color:C.gold, padding:"9px 24px", cursor:"pointer",
                 fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:1 }}>
        Close
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
            Loading…
          </p>
        </div>
      )}

      {/* epub.js renders here */}
      <div ref={containerRef} style={{ position:"absolute", top:54, bottom:0, left:0, right:0, background:T.bg }} />

      {/* Page-turn overlay — covers the white iframe flash during chapter load.
          Appears instantly on next/prev, fades out once relocated fires. */}
      <div style={{
        position:"absolute", top:54, bottom:0, left:0, right:0,
        background:T.bg, zIndex:11, pointerEvents:"none",
        opacity: navFade ? 1 : 0,
        transition: navFade ? "none" : "opacity 0.18s ease",
      }} />

      {/* Swipe overlay — paginated mode only; disabled in scrolled mode so iframe receives scroll touches */}
      {isTouch.current && (
        <div
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
          style={{ position:"absolute", top:54, bottom:0, left:0, right:0, zIndex:10,
                   pointerEvents: (!settings.paginate || showSettings || showToc || showBmPanel || dictWord) ? "none" : "auto" }}
        />
      )}

      {/* Bookmark saved flash */}
      {bmFlash && (
        <div style={{ position:"absolute", top:62, left:"50%", transform:"translateX(-50%)",
                      zIndex:200, background:C.gold, color:"#0a0905",
                      fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
                      padding:"6px 18px", borderRadius:20, pointerEvents:"none",
                      animation:"rdrIn .15s ease" }}>
          ★ Bookmark saved
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
              <button onClick={onTogglePauseMusic} title={musicPaused?"Resume":"Pause"}
                style={{ background:"transparent", border:"none", cursor:"pointer",
                         padding:"4px 4px", color:nowPlaying.type==="youtube"?"#FF4444":"#1DB954",
                         fontSize:12, lineHeight:1, flexShrink:0 }}>
                {musicPaused ? "▶" : "⏸"}
              </button>
              <button onClick={onStopMusic} title="Stop music"
                style={{ background:"transparent", border:"none", cursor:"pointer",
                         padding:"4px 5px", color:"rgba(212,203,184,0.45)", fontSize:14,
                         lineHeight:1, flexShrink:0 }}>
                ✕
              </button>
            </>
          )}
          <IBtn onClick={() => setShowToc(v=>!v)}       color={T.muted}                           title="Contents">☰</IBtn>
          <IBtn onClick={toggleBookmark}               color={isBookmarked ? C.gold : T.muted}    title={isBookmarked ? "Remove bookmark" : "Add bookmark"}>{isBookmarked ? "★" : "☆"}</IBtn>
          <IBtn onClick={() => setShowBmPanel(v=>!v)}  color={bookmarks.length ? C.gold : T.muted} title="Bookmarks">🔖</IBtn>
          <IBtn onClick={() => setShowSettings(true)}  color={T.muted}                           title="Settings">⚙</IBtn>
          {document.fullscreenEnabled && (
            <IBtn onClick={toggleFullscreen} color={isFullscreen?C.gold:T.muted} title={isFullscreen?"Exit fullscreen":"Fullscreen"}>
              {isFullscreen ? "⊡" : "⛶"}
            </IBtn>
          )}
        </div>
      </div>


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
              <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:T.text }}>Contents</span>
              <button onClick={() => setShowToc(false)}
                style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            <div style={{ overflowY:"auto", flex:1 }}>
              {toc.length === 0 ? (
                <p style={{ textAlign:"center", color:T.muted, fontSize:12, padding:"28px 16px", fontStyle:"italic" }}>
                  Loading contents…
                </p>
              ) : toc.map((ch, i) => (
                <button key={i}
                  onClick={() => { rendRef.current?.display(ch.href); setShowToc(false); }}
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
              <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:T.text }}>Bookmarks</span>
              <button onClick={() => setShowBmPanel(false)}
                style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            <p style={{ fontSize:11, color:T.muted, padding:"8px 16px 0", margin:0, lineHeight:1.5 }}>
              Tap <span style={{ color:C.gold }}>☆</span> in the toolbar to bookmark the current page.
              Tap a bookmark below to jump to it.
            </p>
            {bookmarks.length === 0 ? (
              <p style={{ textAlign:"center", color:T.muted, fontSize:12, padding:"24px 16px", fontStyle:"italic", lineHeight:1.6 }}>
                No bookmarks yet.<br/>Tap ☆ to add one.
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
                        {bm.label || "Bookmark"}
                      </div>
                      <div style={{ fontSize:11, color:C.gold, fontFamily:"'Cinzel',serif" }}>
                        {bm.pct > 0 ? `${bm.pct}%` : "—"}
                      </div>
                    </button>
                    <button onClick={() => deleteBookmark(bm.cfi)} title="Delete"
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
function IBtn({ onClick, color, title, children }) {
  return (
    <button onClick={onClick} title={title}
      style={{ background:"transparent", border:"none", color, cursor:"pointer",
               padding:"10px 9px", fontSize:17, lineHeight:1, transition:"color .15s" }}>
      {children}
    </button>
  );
}
