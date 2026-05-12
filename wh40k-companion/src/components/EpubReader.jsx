import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { LORE_DB, wikiUrl, KW_REGEX } from "../data/lore";
import { C, THEMES, FONTS } from "../data/constants";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// Supabase helper
// ─────────────────────────────────────────────────────────────────────────────
const sbr = {
  async _h() {
    const { data:{ session } } = await supabase.auth.getSession();
    const tok = session?.access_token ?? SB_KEY;
    return { apikey:SB_KEY, Authorization:`Bearer ${tok}`, "Content-Type":"application/json" };
  },
  async get(t, q="") {
    try { const r = await fetch(`${SB_URL}/rest/v1/${t}?${q}`, { headers:await this._h() }); return r.ok ? r.json() : []; } catch { return []; }
  },
  async upsert(t, d, conflict="user_id,book_id") {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${t}?on_conflict=${conflict}`, {
        method:"POST", headers:{...await this._h(), Prefer:"resolution=merge-duplicates,return=representation"}, body:JSON.stringify(d),
      });
      return r.ok ? r.json() : null;
    } catch { return null; }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EPUB utilities
// ─────────────────────────────────────────────────────────────────────────────
function resolveEpubPath(base, rel) {
  if (!rel || rel.startsWith("data:") || /^https?:\/\//.test(rel)) return rel;
  const parts = base.split("/"); parts.pop();
  for (const seg of rel.split("/")) {
    if (seg === "..") { if (parts.length) parts.pop(); }
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function extractBody(html) {
  try { return new DOMParser().parseFromString(html, "text/html").body.innerHTML; }
  catch { return html; }
}

function highlightKeywords(html) {
  return html.split(/(<[^>]+>)/).map((part, i) => {
    if (i % 2 === 1 || part.includes("lore-kw")) return part;
    return part.replace(KW_REGEX, m => {
      const k = m.toLowerCase();
      if (!LORE_DB[k]) return m;
      return `<span class="lore-kw" data-kw="${k}" title="Open Fandom Wiki ↗">${m}</span>`;
    });
  }).join("");
}

async function parseEpub(url) {
  if (!window.JSZip) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  const buf = await (await fetch(url)).arrayBuffer();
  const zip  = await window.JSZip.loadAsync(buf);
  const px   = new DOMParser();
  const cXml = await zip.file("META-INF/container.xml").async("text");
  const opfPath = px.parseFromString(cXml, "application/xml").querySelector("rootfile").getAttribute("full-path");
  const opfDir  = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfDoc  = px.parseFromString(await zip.file(opfPath).async("text"), "application/xml");
  const manifest = {};
  opfDoc.querySelectorAll("manifest item").forEach(i => { manifest[i.getAttribute("id")] = i.getAttribute("href"); });
  const hrefs = [...opfDoc.querySelectorAll("spine itemref")].map(i => manifest[i.getAttribute("idref")]).filter(Boolean);

  const tocLabels = {};
  try {
    const ncxItem = opfDoc.querySelector('item[media-type="application/x-dtbncx+xml"]');
    const navItem = opfDoc.querySelector('item[properties~="nav"],item[properties="nav"]');
    const parseTocFile = async (path) => {
      const text = await zip.file(path)?.async("text");
      if (!text) return;
      if (path.endsWith(".ncx")) {
        px.parseFromString(text, "application/xml").querySelectorAll("navPoint").forEach(np => {
          const src = np.querySelector("content")?.getAttribute("src");
          const lbl = np.querySelector("navLabel text")?.textContent?.trim();
          if (src && lbl) { tocLabels[src.split("#")[0]] = lbl; tocLabels[src.split("#")[0].split("/").pop()] = lbl; }
        });
      } else {
        new DOMParser().parseFromString(text, "text/html").querySelectorAll("nav a").forEach(a => {
          const href = a.getAttribute("href")?.split("#")[0];
          const lbl  = a.textContent?.trim();
          if (href && lbl) { tocLabels[href] = lbl; tocLabels[href.split("/").pop()] = lbl; }
        });
      }
    };
    if (ncxItem) await parseTocFile(opfDir + ncxItem.getAttribute("href"));
    else if (navItem) await parseTocFile(opfDir + navItem.getAttribute("href"));
  } catch {}

  const chapters = await Promise.all(hrefs.map(async (href, idx) => {
    const chPath = opfDir + href;
    const file = zip.file(chPath) || zip.file(href);
    if (!file) return null;
    let html = await file.async("text");
    // Inline images as base64
    for (const m of [...html.matchAll(/(?:src|href)=["']([^"'#][^"']*\.(jpe?g|png|gif|webp|svg))["']/gi)]) {
      const raw = m[1]; if (raw.startsWith("data:")) continue;
      const imgFile = zip.file(resolveEpubPath(chPath, raw)) || zip.file(opfDir + raw) || zip.file(raw);
      if (imgFile) {
        const ext  = raw.split(".").pop().toLowerCase().replace(/[?#].*/, "");
        const mime = { png:"image/png", gif:"image/gif", webp:"image/webp", svg:"image/svg+xml", svgz:"image/svg+xml" }[ext] ?? "image/jpeg";
        html = html.replace(m[0], m[0].replace(raw, `data:${mime};base64,${await imgFile.async("base64")}`));
      }
    }
    const hrefBase = href.split("/").pop();
    const tocLabel = tocLabels[href] || tocLabels[hrefBase];
    const tMatch   = html.match(/<title[^>]*>([^<]+)<\/title>/i) || html.match(/<h[123][^>]*>([^<]+)<\/h[123]>/i);
    const rawLabel = tMatch?.[1]?.trim() || "";
    const label    = tocLabel || (rawLabel && rawLabel.length < 80 && !/\.x?html?$/i.test(rawLabel) ? rawLabel : null) || `Chapter ${idx + 1}`;
    return { body: highlightKeywords(extractBody(html)), label };
  }));
  return chapters.filter(Boolean);
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
// Global CSS for EPUB content
// ─────────────────────────────────────────────────────────────────────────────
function useEpubStyles() {
  useEffect(() => {
    const id = "wh40k-epub-styles";
    document.getElementById(id)?.remove(); // always recreate (handles hot-reload / remount)
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes rdrUp   { from { transform:translateY(24px); opacity:0 } to { transform:translateY(0); opacity:1 } }
      @keyframes rdrIn   { from { opacity:0 } to { opacity:1 } }
      @keyframes rdrSpin { to { transform:rotate(360deg) } }

      .epub-body { box-sizing:border-box; }
      .epub-body *, .epub-body *::before, .epub-body *::after { box-sizing:inherit; }

      /* ── Book typography: justified, first-line indent, no gap between paragraphs ── */
      .epub-body p {
        margin: 0;
        padding: 0;
        text-indent: 1.5em;
        text-align: justify;
        hyphens: auto;
        -webkit-hyphens: auto;
        orphans: 3;
        widows: 3;
      }
      /* No indent on first paragraph after chapter start or heading */
      .epub-chapter > p:first-child,
      .epub-body h1 + p, .epub-body h2 + p,
      .epub-body h3 + p, .epub-body h4 + p,
      .epub-body hr  + p {
        text-indent: 0;
      }
      .epub-body h1,.epub-body h2,.epub-body h3,.epub-body h4 {
        break-after:avoid; page-break-after:avoid;
        margin: 0; padding: .6em 0 .3em;
        text-align: center;
        font-variant: small-caps;
        letter-spacing: .04em;
      }
      /* Italic / small-caps for section breaks (common in HH novels) */
      .epub-body hr { border:none; text-align:center; margin:.3em 0; }
      .epub-body hr::after { content:"· · ·"; color:currentColor; opacity:.4; }
      .epub-body img {
        max-width:100% !important; height:auto !important;
        display:block; margin:1em auto;
        break-inside:avoid; page-break-inside:avoid;
      }
      .epub-body a { color:#4a8adc; text-decoration:none; }
      /* Dialogue / special blocks that already have spacing in EPUB source */
      .epub-body blockquote { border-left:3px solid #c9a84c55; padding-left:1em; margin:.5em 0; }
      .epub-body table { max-width:100%; border-collapse:collapse; }
      .epub-body td, .epub-body th { padding:.3em .6em; border:1px solid currentColor; }

      /* Chapter break — each chapter starts on a new column */
      .epub-chapter { break-before:column; page-break-before:always; padding-top:.5em; }
      .epub-chapter:first-child { break-before:avoid; page-break-before:avoid; }

      /* Lore keywords */
      .lore-kw {
        color:#4a8adc !important;
        cursor:pointer;
        border-bottom:1px solid #4a8adc44;
        font-style:normal !important;
      }
      .lore-kw:hover { border-bottom-color:#4a8adc; }
    `;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
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
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,0.55)",
               display:"flex", alignItems:"flex-end", justifyContent:"center" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width:"100%", maxWidth:620, background:T.surface, border:`1px solid ${T.border}`,
                 borderTop:`2px solid ${C.gold}`, borderRadius:"18px 18px 0 0",
                 padding:"8px 20px 44px", maxHeight:"68vh", overflowY:"auto",
                 animation:"rdrUp .22s ease" }}
      >
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

              {entry.meanings?.slice(0, 3).map((m, i) => (
                <div key={i} style={{ marginTop: i > 0 ? 14 : 4, paddingTop: i > 0 ? 14 : 0,
                                      borderTop: i > 0 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.gold,
                                letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>
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
  const T = THEMES[settings.theme];

  const Chip = ({ label, active, onClick }) => (
    <button
      onClick={onClick}
      style={{ background: active ? `${C.gold}22` : "transparent",
               border:`1px solid ${active ? C.gold : T.border}`, borderRadius:6,
               padding:"6px 13px", color: active ? C.gold : T.muted,
               fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
               cursor:"pointer", transition:"all .15s" }}
    >{label}</button>
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
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:1100, background:"rgba(0,0,0,0.5)" }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ position:"absolute", bottom:0, left:0, right:0,
                 background:T.surface, borderTop:`2px solid ${C.gold}55`,
                 borderRadius:"18px 18px 0 0", padding:"12px 20px 52px",
                 maxHeight:"90vh", overflowY:"auto", animation:"rdrUp .25s ease" }}
      >
        <div style={{ width:36, height:4, background:T.border, borderRadius:2, margin:"8px auto 14px" }} />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:14, color:T.text, letterSpacing:1 }}>
            Reading Settings
          </span>
          <button onClick={onClose} style={{ background:"transparent", border:`1px solid ${T.border}`,
            borderRadius:6, color:T.muted, width:30, height:30, cursor:"pointer", fontSize:14,
            display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        {/* Theme */}
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim,
                      letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>Theme</div>
        <div style={{ display:"flex", gap:8, marginBottom:22 }}>
          {Object.values(THEMES).map(th => (
            <button key={th.id} onClick={() => onChange("theme", th.id)}
              style={{ flex:1, padding:"14px 8px", borderRadius:10, cursor:"pointer",
                       background:th.bg, border:`2px solid ${settings.theme === th.id ? C.gold : th.border}`,
                       display:"flex", flexDirection:"column", alignItems:"center", gap:6, transition:"border-color .15s" }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:th.text }} />
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:th.text, letterSpacing:1 }}>{th.label}</span>
            </button>
          ))}
        </div>

        {/* Typeface */}
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim,
                      letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>Typeface</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:20 }}>
          {FONTS.map((f, i) => (
            <button key={i} onClick={() => onChange("fontIndex", i)}
              style={{ padding:"10px 8px", borderRadius:6, background:"transparent",
                       border:`1px solid ${settings.fontIndex === i ? C.gold : T.border}`,
                       color: settings.fontIndex === i ? C.gold : T.muted,
                       fontFamily:f.value, fontSize:13, cursor:"pointer", transition:"all .15s" }}>
              {f.name}
            </button>
          ))}
        </div>

        <Row label={`Font size — ${settings.fontSize}px`}>
          {[14,16,18,20,22,24].map(s => (
            <Chip key={s} label={String(s)} active={settings.fontSize === s} onClick={() => onChange("fontSize", s)} />
          ))}
        </Row>

        <Row label={`Line spacing — ${settings.lineHeight}×`}>
          {[1.5,1.7,1.9,2.1].map(v => (
            <Chip key={v} label={String(v)} active={settings.lineHeight === v} onClick={() => onChange("lineHeight", v)} />
          ))}
        </Row>

        <Row label="Side margins">
          {[{ l:"Narrow", v:16 }, { l:"Normal", v:28 }, { l:"Wide", v:48 }].map(m => (
            <Chip key={m.v} label={m.l} active={settings.margin === m.v} onClick={() => onChange("margin", m.v)} />
          ))}
        </Row>

        <Row label="Reading mode">
          <Chip label="Pages"  active={ settings.paginate} onClick={() => onChange("paginate", true)} />
          <Chip label="Scroll" active={!settings.paginate} onClick={() => { onChange("paginate", false); onChange("twoPage", false); }} />
        </Row>

        {settings.paginate && (
          <Row label="Layout">
            <Chip label="Single"   active={!settings.twoPage} onClick={() => onChange("twoPage", false)} />
            <Chip label="Two-page" active={ settings.twoPage} onClick={() => onChange("twoPage", true)} />
          </Row>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main EpubReader
// Architecture: CSS columns on all-chapters HTML → navigate via scrollLeft only.
// React state is NEVER used for page position — only refs.
// setDisplayPage / setTotalPages are UI-only and don't affect content layout.
// ─────────────────────────────────────────────────────────────────────────────
export default function EpubReader({
  url, title, bookId, userId,
  initProgress, initChapterIndex, initPageIndex,
  onProgress, onClose,
}) {
  useReaderViewport();
  useEpubStyles();

  // ── Settings (persisted) ─────────────────────────────────────────────────
  const [settings, setSettings] = useState(() => {
    try {
      return {
        theme:"dark", fontIndex:0, fontSize:18, lineHeight:1.8,
        margin:28, paginate:true, twoPage:false,
        ...JSON.parse(localStorage.getItem("wh40k_reader_v2") || "{}"),
      };
    } catch {
      return { theme:"dark", fontIndex:0, fontSize:18, lineHeight:1.8, margin:28, paginate:true, twoPage:false };
    }
  });
  const updateSetting = useCallback((key, val) => {
    setSettings(s => {
      const next = { ...s, [key]:val };
      localStorage.setItem("wh40k_reader_v2", JSON.stringify(next));
      return next;
    });
  }, []);
  const T   = THEMES[settings.theme];
  const fnt = FONTS[settings.fontIndex];

  // Load custom font
  useEffect(() => {
    if (!fnt.import) return;
    const id = `gf-${fnt.import}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${fnt.import}&display=swap`;
    document.head.appendChild(link);
  }, [fnt]);

  // ── Book data ─────────────────────────────────────────────────────────────
  const [chapters, setChapters] = useState([]);
  const [allHtml,  setAllHtml]  = useState("");
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // ── UI-only display state (NOT the navigation source of truth) ────────────
  const [displayPage,  setDisplayPage]  = useState(0);
  const [totalPages,   setTotalPages]   = useState(1);
  const [currentChIdx, setCurrentChIdx] = useState(0);
  const [scrollPct,    setScrollPct]    = useState(0);
  // colWidth: actual pixel width of the column container, updated by ResizeObserver.
  // Stored in state so bodyStyle re-renders with correct columnWidth on first paint.
  const [colWidth, setColWidth] = useState(() =>
    typeof window !== "undefined" ? Math.max(100, window.innerWidth - 2 * 28) : 600
  );

  // ── UI panels ─────────────────────────────────────────────────────────────
  const [showUI,         setShowUI]         = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [showToc,        setShowToc]        = useState(false);
  const [showBookmarks,  setShowBookmarks]  = useState(false);
  const [dictWord,       setDictWord]       = useState(null);
  const [bookmarkSaved,  setBookmarkSaved]  = useState(false);
  const [bookmarks,      setBookmarks]      = useState(() => {
    if (!userId || !bookId) return [];
    try { return JSON.parse(localStorage.getItem(`wh40k_bm_${userId}_${bookId}`) || "[]"); } catch { return []; }
  });

  // ── Core refs ─────────────────────────────────────────────────────────────
  // colRef   = the overflow:hidden div whose scrollLeft we control directly
  // bodyRef  = the CSS-columns div holding all chapter HTML
  // pageRef  = source-of-truth page index (no stale closures)
  // totalRef = source-of-truth total pages
  const colRef     = useRef(null);
  const bodyRef    = useRef(null);
  const pageRef    = useRef(0);
  const totalRef     = useRef(1);
  const touchX       = useRef(0);
  const touchY       = useRef(0);
  const didSwipe     = useRef(false);  // suppress click after a successful swipe
  const initialized  = useRef(false);  // true after first measurement (don't re-apply init position)
  const isTouch      = useRef(typeof window !== "undefined" && window.matchMedia("(pointer:coarse)").matches);
  const hideTimer    = useRef(null);
  const saveTimer    = useRef(null);
  const msrTimer     = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Load EPUB → build one big HTML string (all chapters concatenated)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    parseEpub(url).then(chs => {
      if (cancelled) return;
      setChapters(chs);
      setAllHtml(chs.map((ch, i) =>
        `<div id="rdr-ch-${bookId}-${i}" class="epub-chapter">${ch.body}</div>`
      ).join(""));
      setLoading(false);
    }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url, bookId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation helpers (all pure DOM — zero React state updates during nav)
  // ─────────────────────────────────────────────────────────────────────────
  const getColWidth = useCallback(() => colRef.current?.clientWidth ?? 0, []);

  /** Return absolute page index where chapter idx starts */
  const chapterPage = useCallback((idx) => {
    if (!colRef.current) return 0;
    const el = document.getElementById(`rdr-ch-${bookId}-${idx}`);
    if (!el) return 0;
    const cw = getColWidth();
    if (cw <= 0) return 0;
    // offsetLeft is relative to the offsetParent (bodyRef). Works in column layout.
    return Math.max(0, Math.floor(el.offsetLeft / cw));
  }, [bookId, getColWidth]);

  /** Scroll to page n — the ONLY place scrollLeft is set */
  const goToPage = useCallback((n) => {
    const cw = getColWidth();
    if (!colRef.current || cw <= 0) return;
    const p = Math.max(0, Math.min(n, totalRef.current - 1));
    pageRef.current = p;
    colRef.current.scrollLeft = p * cw;
    setDisplayPage(p);
  }, [getColWidth]);

  const prevPage = useCallback(() => goToPage(pageRef.current - 1), [goToPage]);
  const nextPage = useCallback(() => goToPage(pageRef.current + 1), [goToPage]);

  // ─────────────────────────────────────────────────────────────────────────
  // Measure: calculate totalPages, then restore scrollLeft
  // Called after content renders or container resizes
  // ─────────────────────────────────────────────────────────────────────────
  const measurePages = useCallback((targetPage) => {
    if (!colRef.current || !bodyRef.current || !settings.paginate) return;
    const cw = getColWidth();
    const sw = bodyRef.current.scrollWidth;
    if (cw <= 0 || sw <= 0) return;
    // In two-page mode each "page" = one full-container-width spread (2 columns of cw/2)
    // scrollWidth is already in terms of half-width columns; dividing by cw gives spreads
    const tp = Math.max(1, Math.round(sw / cw));
    totalRef.current = tp;
    setTotalPages(tp);
    const p = targetPage !== undefined
      ? Math.min(targetPage, tp - 1)
      : Math.min(pageRef.current, tp - 1);
    pageRef.current = p;
    colRef.current.scrollLeft = p * cw;
    setDisplayPage(p);
  }, [getColWidth, settings.paginate]);

  // ResizeObserver → update colWidth state + re-measure on container size change
  useEffect(() => {
    if (!colRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setColWidth(cw); // triggers re-render with correct columnWidth
      if (msrTimer.current) clearTimeout(msrTimer.current);
      msrTimer.current = setTimeout(() => measurePages(), 120);
    });
    ro.observe(colRef.current);
    return () => ro.disconnect();
  }, [measurePages]);

  // Re-measure when content or relevant settings change.
  // On first load (initialized=false) go to the saved/init page.
  // On subsequent calls (settings tweak) keep the current page (pageRef.current).
  useEffect(() => {
    if (!allHtml || !settings.paginate) return;
    if (msrTimer.current) clearTimeout(msrTimer.current);
    msrTimer.current = setTimeout(() => {
      let target;
      if (!initialized.current) {
        // First measurement only: jump to saved position
        if (initPageIndex > 0) {
          target = initPageIndex;
        } else if (initChapterIndex > 0) {
          target = chapterPage(Math.min(initChapterIndex, chapters.length - 1));
        } else if (initProgress > 0) {
          target = Math.floor(initProgress * (totalRef.current - 1));
        }
        initialized.current = true;
      }
      // target === undefined → measurePages keeps pageRef.current (current page)
      measurePages(target);
    }, 220);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHtml, settings.fontSize, settings.lineHeight, settings.margin,
      settings.paginate, settings.twoPage, settings.fontIndex]);

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard navigation
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); nextPage(); }
      else if (e.key === "ArrowLeft")               { e.preventDefault(); prevPage(); }
      else if (e.key === "Escape") {
        if      (dictWord)       setDictWord(null);
        else if (showSettings)   setShowSettings(false);
        else if (showToc)        setShowToc(false);
        else if (showBookmarks)  setShowBookmarks(false);
        else                     onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextPage, prevPage, dictWord, showSettings, showToc, showBookmarks, onClose]);

  // ─────────────────────────────────────────────────────────────────────────
  // UI show/hide (Kindle-style: tap center to reveal, auto-hide after 4s)
  // ─────────────────────────────────────────────────────────────────────────
  const revealUI = useCallback(() => {
    setShowUI(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowUI(false), 4000);
  }, []);

  // Keep UI visible while any panel is open
  useEffect(() => {
    if (showSettings || showToc || showBookmarks) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowUI(true);
    }
  }, [showSettings, showToc, showBookmarks]);

  // ─────────────────────────────────────────────────────────────────────────
  // Get the word at screen coordinates (for single-click dictionary on desktop)
  // ─────────────────────────────────────────────────────────────────────────
  const getWordAtPoint = useCallback((x, y) => {
    try {
      let node, offset;
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (!r || r.startContainer.nodeType !== Node.TEXT_NODE) return null;
        node = r.startContainer; offset = r.startOffset;
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (!pos || pos.offsetNode.nodeType !== Node.TEXT_NODE) return null;
        node = pos.offsetNode; offset = pos.offset;
      } else return null;

      const text = node.textContent;
      let s = offset, e = offset;
      while (s > 0 && /[a-zA-Z'-]/.test(text[s - 1])) s--;
      while (e < text.length && /[a-zA-Z'-]/.test(text[e])) e++;
      if (s === e) return null;
      return text.slice(s, e).replace(/^[-']+|[-']+$/g, "") || null;
    } catch { return null; }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tap handler — center tap toggles UI; desktop single-click opens dictionary
  // ─────────────────────────────────────────────────────────────────────────
  const handleTap = useCallback((e) => {
    // Suppress click that follows a touch swipe
    if (didSwipe.current) { didSwipe.current = false; return; }

    // Lore keyword — always highest priority
    const kw = e.target.getAttribute?.("data-kw");
    if (kw && LORE_DB[kw]) { window.open(wikiUrl(kw), "_blank", "noopener"); return; }
    if (e.target.closest("button,a,input,select,[role=button]")) return;

    // Desktop single-click: try to look up the word at click position
    if (!isTouch.current) {
      const word = getWordAtPoint(e.clientX, e.clientY);
      if (word && word.length >= 3 && !LORE_DB[word.toLowerCase()]) {
        setDictWord(word);
        return;
      }
    }

    // Clear any lingering selection, then toggle UI
    const sel = window.getSelection();
    if (sel?.toString().trim()) { sel.removeAllRanges(); return; }
    revealUI();
  }, [revealUI, getWordAtPoint]);

  // ─────────────────────────────────────────────────────────────────────────
  // Touch swipe (paginate mode only)
  // ─────────────────────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    touchX.current = e.touches[0].clientX;
    touchY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!settings.paginate) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = e.changedTouches[0].clientY - touchY.current;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      didSwipe.current = true;
      if (dx > 0) prevPage(); else nextPage();
    }
  }, [settings.paginate, prevPage, nextPage]);

  // ─────────────────────────────────────────────────────────────────────────
  // Dictionary via text selection (touch long-press or mouse drag-select)
  // ─────────────────────────────────────────────────────────────────────────
  const handlePointerUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const word = sel.toString().trim().replace(/[^a-zA-Z'-]/g, "");
      if (word.length < 2 || word.includes(" ")) return;
      if (LORE_DB[word.toLowerCase()]) return; // lore words handled by tap→wiki
      setDictWord(word);
      sel.removeAllRanges();
    }, 50);
  }, []);

  // Double-click / double-tap: browser auto-selects the word → open dictionary
  const handleDblClick = useCallback((e) => {
    const kw = e.target.getAttribute?.("data-kw");
    if (kw && LORE_DB[kw]) return; // let lore click handle it
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const word = sel.toString().trim().replace(/[^a-zA-Z'-]/g, "");
      if (word.length < 2 || word.includes(" ")) return;
      if (LORE_DB[word.toLowerCase()]) return;
      setDictWord(word);
      sel.removeAllRanges();
    }, 30);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Scroll mode: track position + save progress
  // ─────────────────────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    if (settings.paginate || !colRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = colRef.current;
    const pct = scrollHeight > clientHeight
      ? Math.round((scrollTop / (scrollHeight - clientHeight)) * 100) : 0;
    setScrollPct(pct);
  }, [settings.paginate]);

  // ─────────────────────────────────────────────────────────────────────────
  // Current chapter detection (for TOC highlight + bookmarks)
  // ─────────────────────────────────────────────────────────────────────────
  const detectChapter = useCallback(() => {
    if (!colRef.current || !chapters.length) return 0;
    const cw   = getColWidth();
    const page = pageRef.current;
    for (let i = chapters.length - 1; i >= 0; i--) {
      const el = document.getElementById(`rdr-ch-${bookId}-${i}`);
      if (!el) continue;
      const cp = cw > 0 ? Math.floor(el.offsetLeft / cw) : 0;
      if (cp <= page) return i;
    }
    return 0;
  }, [bookId, chapters.length, getColWidth]);

  useEffect(() => {
    setCurrentChIdx(detectChapter());
  }, [displayPage, detectChapter]);

  // ─────────────────────────────────────────────────────────────────────────
  // Progress save (debounced 1.5s, only on meaningful page change)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chapters.length || !userId || !bookId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const pct = totalRef.current > 1 ? displayPage / (totalRef.current - 1) : 0;
      onProgress?.(pct);
      const chIdx = detectChapter();
      const payload = { progress_pct:pct, chapter_index:chIdx, page_index:displayPage };
      localStorage.setItem(`wh40k_prog_${userId}_${bookId}`, JSON.stringify(payload));
      sbr.upsert("reading_progress", { user_id:userId, book_id:bookId, ...payload, last_read:new Date().toISOString() }, "user_id,book_id");
    }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayPage]);

  // ─────────────────────────────────────────────────────────────────────────
  // Bookmarks
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !bookId) return;
    sbr.get("bookmarks", `user_id=eq.${userId}&book_id=eq.${bookId}&order=created_at.desc`).then(rows => {
      if (rows?.length) {
        const bms = rows.map(r => ({ id:r.id, chapter_index:r.chapter_index, page_index:r.page_index, progress_pct:r.progress_pct, label:r.label, createdAt:r.created_at }));
        setBookmarks(bms);
        localStorage.setItem(`wh40k_bm_${userId}_${bookId}`, JSON.stringify(bms));
      }
    });
  }, [userId, bookId]);

  const saveBookmark = useCallback(() => {
    if (!userId || !bookId) return;
    const page  = pageRef.current;
    const pct   = totalRef.current > 1 ? page / (totalRef.current - 1) : 0;
    const chIdx = detectChapter();
    const label = chapters[chIdx]?.label || `Page ${page + 1}`;
    sbr.upsert("bookmarks", { user_id:userId, book_id:bookId, chapter_index:chIdx, page_index:page, progress_pct:pct, label }, "id")
      .then(res => {
        const id  = Array.isArray(res) ? res[0]?.id : res?.id;
        const bm  = { id:id || Date.now(), chapter_index:chIdx, page_index:page, progress_pct:pct, label, createdAt:new Date().toISOString() };
        const upd = [bm, ...bookmarks.filter(b => b.id !== bm.id)].slice(0, 30);
        setBookmarks(upd);
        localStorage.setItem(`wh40k_bm_${userId}_${bookId}`, JSON.stringify(upd));
      });
    setBookmarkSaved(true);
    setTimeout(() => setBookmarkSaved(false), 2000);
  }, [userId, bookId, chapters, bookmarks, detectChapter]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived display values
  // ─────────────────────────────────────────────────────────────────────────
  const progressPct = settings.paginate
    ? (totalPages > 1 ? Math.round((displayPage / (totalPages - 1)) * 100) : 0)
    : scrollPct;

  const atStart = displayPage === 0;
  const atEnd   = settings.paginate && displayPage >= totalPages - 1;

  // Desktop: header/footer always visible; touch: Kindle-style hide/show
  const isDesktop = !isTouch.current;
  const uiVisible = isDesktop || showUI;

  // Column container: on desktop offset below/above the permanent header/footer
  const colContainerStyle = {
    position:"absolute",
    top:    isDesktop ? 54 : 0,
    bottom: isDesktop ? 54 : 0,
    left: settings.margin, right: settings.margin,
    overflow: settings.paginate ? "hidden" : "auto",
    WebkitOverflowScrolling:"touch",
  };

  // colWidth state (set by ResizeObserver) drives the CSS columns layout.
  // Single page: each column = full container width.
  // Two-page:    each column = half container width → 2 columns per "spread".
  const colPx = settings.twoPage
    ? `${Math.max(100, Math.floor(colWidth / 2))}px`
    : `${Math.max(100, colWidth)}px`;

  const bodyStyle = settings.paginate ? {
    columnFill: "auto",
    columnGap:  0,
    columnWidth: colPx,
    height: "100%",
    color: T.text, fontFamily: fnt.value,
    fontSize: settings.fontSize, lineHeight: settings.lineHeight,
  } : {
    padding: isDesktop ? "20px 0 24px" : "60px 0 80px",
    color: T.text, fontFamily: fnt.value,
    fontSize: settings.fontSize, lineHeight: settings.lineHeight,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Loading / error screens
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ position:"fixed", inset:0, background:"#0f0e09", zIndex:999,
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
      <div style={{ width:36, height:36, border:"2px solid #2a2518", borderTopColor:C.gold,
                    borderRadius:"50%", animation:"rdrSpin 1s linear infinite" }} />
      <p style={{ fontFamily:"'Cinzel',serif", color:"#7a7060", fontSize:12, letterSpacing:2, margin:0 }}>
        Loading…
      </p>
    </div>
  );

  if (error) return (
    <div style={{ position:"fixed", inset:0, background:"#0f0e09", zIndex:999,
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14 }}>
      <p style={{ color:C.gold, fontFamily:"'Cinzel',serif", fontSize:14, margin:0 }}>Failed to load</p>
      <p style={{ color:"#7a7060", fontSize:12, margin:0, textAlign:"center", padding:"0 24px" }}>{error}</p>
      <button onClick={onClose} style={{ marginTop:8, background:"transparent", border:`1px solid #2a2518`,
        borderRadius:8, color:"#7a7060", padding:"8px 20px", cursor:"pointer",
        fontFamily:"'Cinzel',serif", fontSize:12 }}>Close</button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, background:T.bg, zIndex:999 }}>

      {/* ── Reading area ──────────────────────────────────────────────────── */}
      <div
        ref={colRef}
        style={colContainerStyle}
        onClick={handleTap}
        onDoubleClick={handleDblClick}
        onPointerUp={handlePointerUp}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={bodyRef}
          className="epub-body"
          style={{ ...bodyStyle, userSelect:"text", cursor:"text" }}
          dangerouslySetInnerHTML={{ __html: allHtml }}
        />
      </div>

      {/* ── Header (overlays content, fades in/out) ───────────────────────── */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, height:54,
        background:`${T.bg}ee`, backdropFilter:"blur(10px)",
        borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 8px",
        opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? "auto" : "none",
        transition:"opacity .25s ease",
      }}>
        <button onClick={onClose} style={{ background:"transparent", border:"none",
          color:T.muted, cursor:"pointer", padding:"10px 12px", fontSize:20, lineHeight:1 }}>
          ‹
        </button>

        <span style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:T.text, letterSpacing:1,
                       flex:1, textAlign:"center", overflow:"hidden", textOverflow:"ellipsis",
                       whiteSpace:"nowrap", padding:"0 4px" }}>
          {title || ""}
        </span>

        <div style={{ display:"flex", alignItems:"center" }}>
          <IconBtn onClick={() => setShowToc(v => !v)}    title="Contents"   color={T.muted}>☰</IconBtn>
          <IconBtn onClick={saveBookmark}                 title="Bookmark"   color={bookmarkSaved ? C.gold : T.muted}>🔖</IconBtn>
          <IconBtn onClick={() => setShowBookmarks(v=>!v)} title="Bookmarks" color={T.muted}>📑</IconBtn>
          <IconBtn onClick={() => setShowSettings(true)}  title="Settings"   color={T.muted}>⚙</IconBtn>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={{
        position:"absolute", bottom:0, left:0, right:0, height:54,
        background:`${T.bg}ee`, backdropFilter:"blur(10px)",
        borderTop:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", padding:"0 14px", gap:14,
        opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? "auto" : "none",
        transition:"opacity .25s ease",
      }}>
        {/* Prev — touch: button; desktop: keyboard hint */}
        {isTouch.current ? (
          <button onClick={prevPage} disabled={atStart}
            style={{ background:"transparent", border:`1px solid ${atStart ? T.border : T.muted}`,
                     borderRadius:6, color: atStart ? T.border : T.text,
                     padding:"5px 14px", cursor: atStart ? "default" : "pointer",
                     fontFamily:"'Cinzel',serif", fontSize:14, flexShrink:0 }}>
            ‹
          </button>
        ) : (
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:T.border,
                         letterSpacing:1, flexShrink:0, padding:"0 4px" }}>
            ← prev
          </span>
        )}

        {/* Progress bar + label */}
        <div style={{ flex:1 }}>
          <div style={{ height:2, background:T.border, borderRadius:1, overflow:"hidden", marginBottom:4 }}>
            <div style={{ height:"100%", width:`${progressPct}%`, background:C.gold,
                          borderRadius:1, transition:"width .4s ease" }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:T.muted, letterSpacing:1,
                           overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"60%" }}>
              {chapters[currentChIdx]?.label || ""}
            </span>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:T.muted, letterSpacing:1, flexShrink:0 }}>
              {settings.paginate ? `${displayPage + 1} / ${totalPages}` : `${progressPct}%`}
            </span>
          </div>
        </div>

        {/* Next — touch: button; desktop: keyboard hint */}
        {isTouch.current ? (
          <button onClick={nextPage} disabled={atEnd}
            style={{ background:"transparent", border:`1px solid ${atEnd ? T.border : T.muted}`,
                     borderRadius:6, color: atEnd ? T.border : T.text,
                     padding:"5px 14px", cursor: atEnd ? "default" : "pointer",
                     fontFamily:"'Cinzel',serif", fontSize:14, flexShrink:0 }}>
            ›
          </button>
        ) : (
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:T.border,
                         letterSpacing:1, flexShrink:0, padding:"0 4px" }}>
            next →
          </span>
        )}
      </div>

      {/* ── Table of Contents (left drawer) ───────────────────────────────── */}
      {showToc && (
        <div onClick={() => setShowToc(false)}
          style={{ position:"absolute", inset:0, zIndex:1000, background:"rgba(0,0,0,0.55)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", left:0, top:0, bottom:0,
                     width:Math.min(310, window.innerWidth * 0.85),
                     background:T.surface, borderRight:`1px solid ${T.border}`,
                     overflowY:"auto", animation:"rdrIn .2s ease",
                     display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"16px 16px 10px", borderBottom:`1px solid ${T.border}`,
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                          position:"sticky", top:0, background:T.surface, zIndex:1, flexShrink:0 }}>
              <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:T.text }}>
                Contents
              </span>
              <button onClick={() => setShowToc(false)}
                style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>
                ✕
              </button>
            </div>
            <div style={{ overflowY:"auto", flex:1 }}>
              {chapters.map((ch, i) => (
                <button key={i}
                  onClick={() => { goToPage(chapterPage(i)); setShowToc(false); }}
                  style={{ display:"block", width:"100%", textAlign:"left",
                           background: i === currentChIdx ? `${C.gold}18` : "transparent",
                           border:"none", borderLeft:`3px solid ${i === currentChIdx ? C.gold : "transparent"}`,
                           padding:"11px 16px", cursor:"pointer",
                           color: i === currentChIdx ? C.gold : T.muted,
                           fontFamily:"'Cinzel',serif", fontSize:11, lineHeight:1.5,
                           transition:"background .15s" }}>
                  {ch.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Bookmarks (right drawer) ───────────────────────────────────────── */}
      {showBookmarks && (
        <div onClick={() => setShowBookmarks(false)}
          style={{ position:"absolute", inset:0, zIndex:1000, background:"rgba(0,0,0,0.55)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", right:0, top:0, bottom:0,
                     width:Math.min(300, window.innerWidth * 0.85),
                     background:T.surface, borderLeft:`1px solid ${T.border}`,
                     overflowY:"auto", animation:"rdrIn .2s ease",
                     display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"16px 16px 10px", borderBottom:`1px solid ${T.border}`,
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                          position:"sticky", top:0, background:T.surface, flexShrink:0 }}>
              <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:T.text }}>
                Bookmarks
              </span>
              <button onClick={() => setShowBookmarks(false)}
                style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>
                ✕
              </button>
            </div>
            {bookmarks.length === 0 ? (
              <p style={{ textAlign:"center", color:T.muted, fontSize:12,
                          padding:"28px 16px", fontStyle:"italic" }}>
                No bookmarks yet.<br/>Tap 🔖 while reading to add one.
              </p>
            ) : bookmarks.map((bm, i) => (
              <button key={bm.id || i}
                onClick={() => { goToPage(bm.page_index || 0); setShowBookmarks(false); }}
                style={{ display:"block", width:"100%", textAlign:"left", background:"transparent",
                         border:"none", borderBottom:`1px solid ${T.border}`, padding:"12px 16px", cursor:"pointer" }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:T.text, marginBottom:3 }}>
                  {bm.label}
                </div>
                <div style={{ fontSize:10, color:T.muted }}>
                  p.&nbsp;{(bm.page_index || 0) + 1} &middot; {Math.round((bm.progress_pct || 0) * 100)}%
                </div>
                <div style={{ fontSize:9, color:T.muted, marginTop:2 }}>
                  {new Date(bm.createdAt).toLocaleDateString("en-US", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Dictionary ────────────────────────────────────────────────────── */}
      {dictWord && (
        <DictionaryPanel word={dictWord} onClose={() => setDictWord(null)} theme={settings.theme} />
      )}

      {/* ── Settings ──────────────────────────────────────────────────────── */}
      {showSettings && (
        <SettingsPanel settings={settings} onChange={updateSetting} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

// Small icon button used in header
function IconBtn({ onClick, title, color, children }) {
  return (
    <button onClick={onClick} title={title}
      style={{ background:"transparent", border:"none", color, cursor:"pointer",
               padding:"10px 9px", fontSize:17, lineHeight:1, transition:"color .15s" }}>
      {children}
    </button>
  );
}
