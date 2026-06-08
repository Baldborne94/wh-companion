import { useState, useEffect, useRef, useCallback } from "react";
import ePub from "epubjs";
import { supabase } from "../lib/supabase";
import { C, THEMES, FONTS } from "../data/constants";
import { LORE_DB, wikiUrl, KW_REGEX } from "../data/lore";
import { bookmarkPageLabel } from "../lib/bookmarkHelpers";

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

async function loadBookmarksFromDB(userId, bookId) {
  if (!userId || !bookId) return [];
  try {
    const { data } = await supabase.from("bookmarks")
      .select("epub_cfi,label,progress,created_at")
      .eq("user_id", userId).eq("book_id", bookId)
      .not("epub_cfi", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    return (data || []).map(b => ({ cfi: b.epub_cfi, label: b.label || "Bookmark", pct: b.progress || 0, createdAt: b.created_at }));
  } catch { return []; }
}

async function saveAllBookmarksToDB(userId, bookId, bms) {
  if (!userId || !bookId) return;
  try {
    await supabase.from("bookmarks").delete().eq("user_id", userId).eq("book_id", bookId);
    if (bms.length > 0) {
      await supabase.from("bookmarks").insert(
        bms.map(b => ({ user_id:userId, book_id:bookId, epub_cfi:b.cfi, label:b.label, progress:b.pct|0 }))
      );
    }
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
    if (!meta) return;
    const prev = meta.content;
    meta.content = "width=device-width,initial-scale=1,user-scalable=no";
    return () => { meta.content = prev; };
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
  const [atStart,  setAtStart]  = useState(true);
  const [atEnd,    setAtEnd]    = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showUI,        setShowUI]        = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showToc,       setShowToc]       = useState(false);
  const [dictWord,      setDictWord]      = useState(null);
  const [bmSaved,       setBmSaved]       = useState(false);
  const [pageDisplay,   setPageDisplay]   = useState(null);
  const [isFullscreen,  setIsFullscreen]  = useState(false);

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
  const bmKey = `wh40k_bm_${userId}_${bookId}`;
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      const raw = localStorage.getItem(bmKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Support old single-object format
      return Array.isArray(parsed) ? parsed : (parsed?.cfi ? [parsed] : []);
    } catch { return []; }
  });
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Pre-load CFI + bookmarks from DB if nothing in localStorage (new device)
  useEffect(() => {
    const cfiKey = `wh40k_cfi_${userId}_${bookId}`;
    const hasCfi = !!localStorage.getItem(cfiKey);
    const hasBm  = !!localStorage.getItem(bmKey);
    if (!userId || !bookId || (hasCfi && hasBm)) return;
    if (!hasCfi) {
      loadCfiFromDB(userId, bookId).then(cfi => {
        if (!cfi) return;
        localStorage.setItem(cfiKey, cfi);
        cfiRef.current = cfi;
        if (rendRef.current) rendRef.current.display(cfi);
      });
    }
    if (!hasBm) {
      loadBookmarksFromDB(userId, bookId).then(bms => {
        if (!bms.length) return;
        setBookmarks(bms);
        localStorage.setItem(bmKey, JSON.stringify(bms));
      });
    }
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
    if (showSettings || showToc || showBookmarks) {
      clearTimeout(hideTimer.current);
      setShowUI(true);
    }
  }, [showSettings, showToc, showBookmarks]);

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
    setAtStart(true);
    setAtEnd(false);
    setPageDisplay(null);

    // Destroy previous instance
    if (bookRef.current) {
      try { bookRef.current.destroy(); } catch {}
      bookRef.current = null;
    }
    rendRef.current = null;

    const flow   = settings.paginate ? "paginated" : "scrolled-doc";
    const spread = settings.paginate && settings.twoPage ? "always" : "none";

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
          manager:        "default",
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

        rend.on("relocated", (loc) => {
          if (cancelled) return;
          const cfi = loc.start?.cfi;
          if (cfi) cfiRef.current = cfi;
          setAtStart(!!loc.atStart);
          setAtEnd(!!loc.atEnd);
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
      try { rendRef.current?.resize(); } catch {}
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);


  // ── Navigation ────────────────────────────────────────────────────────────
  const next = useCallback(() => rendRef.current?.next(), []);
  const prev = useCallback(() => rendRef.current?.prev(), []);

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

    // Pure tap — the overlay blocks touches from reaching epub iframes, so
    // forward manually: find the element under the touch in the iframe doc.
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
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
        if      (dictWord)        setDictWord(null);
        else if (showSettings)    setShowSettings(false);
        else if (showToc)         setShowToc(false);
        else if (showBookmarks)   setShowBookmarks(false);
        else                      onClose?.();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, prev, dictWord, showSettings, showToc, showBookmarks, onClose]);

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  const MAX_BM = 10;
  const saveBookmark = useCallback(() => {
    let cfi = cfiRef.current;
    try {
      const loc = rendRef.current?.currentLocation();
      if (loc?.start?.cfi) cfi = loc.start.cfi;
    } catch {}
    if (!cfi) return;
    const bm = { cfi, label: chLabel || "Bookmark", pct: progress, createdAt: new Date().toISOString() };
    setBookmarks(prev => {
      const deduped = prev.filter(b => b.cfi !== cfi);
      const next = [bm, ...deduped].slice(0, MAX_BM);
      localStorage.setItem(bmKey, JSON.stringify(next));
      saveAllBookmarksToDB(userId, bookId, next);
      return next;
    });
    setBmSaved(true);
    setTimeout(() => setBmSaved(false), 2000);
  }, [chLabel, progress, bmKey, userId, bookId]);

  const deleteBookmark = useCallback((cfi) => {
    setBookmarks(prev => {
      const next = prev.filter(b => b.cfi !== cfi);
      localStorage.setItem(bmKey, JSON.stringify(next));
      saveAllBookmarksToDB(userId, bookId, next);
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
      <div ref={containerRef} style={{ position:"absolute", top:54, bottom:54, left:0, right:0 }} />

      {/* Swipe overlay — paginated mode only; disabled in scrolled mode so iframe receives scroll touches */}
      {isTouch.current && (
        <div
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
          style={{ position:"absolute", top:54, bottom:54, left:0, right:0, zIndex:10,
                   pointerEvents: (!settings.paginate || showSettings || showToc || showBookmarks || dictWord) ? "none" : "auto" }}
        />
      )}

      {/* Bookmark saved toast */}
      {bmSaved && (
        <div style={{ position:"absolute", top:62, left:"50%", transform:"translateX(-50%)",
                      zIndex:200, background:C.gold, color:"#0a0905",
                      fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
                      padding:"6px 16px", borderRadius:20, pointerEvents:"none",
                      animation:"rdrIn .2s ease" }}>
          ✓ Segnalibro salvato
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
          <IBtn onClick={() => setShowToc(v=>!v)}         color={T.muted}                title="Contents">☰</IBtn>
          <IBtn
            onClick={() => {
              if (bookmarks.length > 0) {
                const bm = bookmarks[0];
                if (rendRef.current) {
                  rendRef.current.display(bm.cfi)
                    .catch(() => setTimeout(() => rendRef.current?.display(bm.cfi)
                      .catch(() => setTimeout(() => rendRef.current?.display(bm.cfi), 600)), 400));
                } else {
                  pendingNavRef.current = bm.cfi;
                }
              } else {
                saveBookmark();
              }
            }}
            color={bookmarks.length > 0 ? C.gold : T.muted}
            title={bookmarks.length > 0 ? `Vai all'ultimo segnalibro (${bookmarks[0]?.pct}%)` : "Segna posizione attuale"}
          >🔖</IBtn>
          <IBtn onClick={() => setShowBookmarks(v => !v)} color={T.muted} title="Segnalibri">📑</IBtn>
          <IBtn onClick={() => setShowSettings(true)}     color={T.muted}                title="Settings">⚙</IBtn>
          {document.fullscreenEnabled && (
            <IBtn onClick={toggleFullscreen} color={isFullscreen?C.gold:T.muted} title={isFullscreen?"Exit fullscreen":"Fullscreen"}>
              {isFullscreen ? "⊡" : "⛶"}
            </IBtn>
          )}
        </div>
      </div>


      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{
        position:"absolute", bottom:0, left:0, right:0, height:54,
        background:`${T.bg}ee`, backdropFilter:"blur(10px)",
        borderTop:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", padding:"0 14px", gap:14,
        opacity:uiVisible?1:0, pointerEvents:uiVisible?"auto":"none",
        transition:"opacity .25s ease", zIndex:20,
      }}>
        {isTouch.current ? (
          <button onClick={prev} disabled={atStart}
            style={{ background:"transparent", border:`1px solid ${atStart?T.muted:T.text}`,
                     borderRadius:6, color:atStart?T.muted:T.text, opacity:atStart?0.35:1,
                     padding:"5px 14px", cursor:atStart?"default":"pointer",
                     fontFamily:"'Cinzel',serif", fontSize:14, flexShrink:0 }}>
            ‹
          </button>
        ) : (
          <button onClick={prev} disabled={atStart}
            style={{ background:"transparent", border:"none", cursor:atStart?"default":"pointer",
                     color:atStart?T.muted:T.text, opacity:atStart?0.4:1,
                     fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
                     flexShrink:0, padding:"5px 14px" }}>
            ← prev
          </button>
        )}

        <div style={{ flex:1 }}>
          <div style={{ height:3, background:T.border, borderRadius:2, overflow:"hidden", marginBottom:4 }}>
            <div style={{ height:"100%", width:`${progress}%`, background:C.gold,
                          borderRadius:2, transition:"width .5s ease" }} />
          </div>
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6 }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:T.muted, letterSpacing:1,
                           overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {chLabel}
            </span>
          </div>
        </div>

        {isTouch.current ? (
          <button onClick={next} disabled={atEnd}
            style={{ background:"transparent", border:`1px solid ${atEnd?T.muted:T.text}`,
                     borderRadius:6, color:atEnd?T.muted:T.text, opacity:atEnd?0.35:1,
                     padding:"5px 14px", cursor:atEnd?"default":"pointer",
                     fontFamily:"'Cinzel',serif", fontSize:14, flexShrink:0 }}>
            ›
          </button>
        ) : (
          <button onClick={next} disabled={atEnd}
            style={{ background:"transparent", border:"none", cursor:atEnd?"default":"pointer",
                     color:atEnd?T.muted:T.text, opacity:atEnd?0.4:1,
                     fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
                     flexShrink:0, padding:"5px 14px" }}>
            next →
          </button>
        )}
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
      {showBookmarks && (
        <div onClick={() => setShowBookmarks(false)}
          style={{ position:"absolute", inset:0, zIndex:1000, background:"rgba(0,0,0,0.55)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", right:0, top:0, bottom:0,
                     width:Math.min(300, window.innerWidth * 0.85),
                     background:T.surface, borderLeft:`1px solid ${T.border}`,
                     animation:"rdrIn .2s ease", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"12px 16px 10px", borderBottom:`1px solid ${T.border}`,
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                          flexShrink:0 }}>
              <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:T.text }}>Segnalibri</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button onClick={() => { saveBookmark(); }}
                  style={{ background:"transparent", border:`1px solid ${C.gold}55`, borderRadius:4,
                           color:C.gold, cursor:"pointer", fontSize:10, padding:"4px 8px",
                           fontFamily:"'Cinzel',serif", letterSpacing:1 }}>
                  + Salva qui
                </button>
                <button onClick={() => setShowBookmarks(false)}
                  style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>✕</button>
              </div>
            </div>
            {bookmarks.length === 0 ? (
              <p style={{ textAlign:"center", color:T.muted, fontSize:12, padding:"28px 16px", fontStyle:"italic" }}>
                Nessun segnalibro.<br />Usa "+ Salva qui" per aggiungerne uno.
              </p>
            ) : (
              <div style={{ overflowY:"auto", flex:1 }}>
                {bookmarks.map((bm, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"stretch", borderBottom:`1px solid ${T.border}` }}>
                    <button
                      onClick={() => {
                        if (rendRef.current) {
                          rendRef.current.display(bm.cfi)
                            .catch(() => setTimeout(() => rendRef.current?.display(bm.cfi)
                              .catch(() => setTimeout(() => rendRef.current?.display(bm.cfi), 600)), 400));
                        } else {
                          pendingNavRef.current = bm.cfi;
                        }
                        setShowBookmarks(false);
                      }}
                      style={{ flex:1, textAlign:"left", background:"transparent", border:"none", padding:"12px 16px", cursor:"pointer" }}>
                      <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:T.text, marginBottom:3 }}>{bm.label}</div>
                      <div style={{ fontSize:12, color:C.gold, fontFamily:"'Cinzel',serif" }}>{bookmarkPageLabel(bm)}</div>
                    </button>
                    <button onClick={() => deleteBookmark(bm.cfi)} title="Elimina"
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
