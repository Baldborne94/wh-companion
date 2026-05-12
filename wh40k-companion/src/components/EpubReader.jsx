import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { LORE_DB, wikiUrl, KW_REGEX } from "../data/lore";
import { C, THEMES, FONTS } from "../data/constants";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Minimal sb helper (reader-local, avoids circular deps) ──────────────────
const sbr = {
  async _h() {
    const { data:{ session } } = await supabase.auth.getSession();
    const tok = session?.access_token ?? SB_KEY;
    return { apikey:SB_KEY, Authorization:`Bearer ${tok}`, "Content-Type":"application/json" };
  },
  async get(t, q="") {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${t}?${q}`, { headers:await this._h() });
      if(!r.ok) return [];
      return r.json();
    } catch { return []; }
  },
  async upsert(t, d, conflict="user_id,book_id") {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${t}?on_conflict=${conflict}`, {
        method:"POST",
        headers:{...await this._h(), Prefer:"resolution=merge-duplicates,return=representation"},
        body:JSON.stringify(d),
      });
      if(!r.ok) return null;
      return r.json();
    } catch { return null; }
  },
  async del(t, q="") {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${t}?${q}`, { method:"DELETE", headers:await this._h() });
      return r.ok;
    } catch { return false; }
  },
};

// ── Highlight lore keywords ──────────────────────────────────────────────────
function highlightKeywords(html) {
  return html.split(/(<[^>]+>)/).map((part, i) => {
    if (i % 2 === 1 || part.includes("lore-kw")) return part;
    return part.replace(KW_REGEX, m => {
      const k = m.toLowerCase();
      if (!LORE_DB[k]) return m;
      return `<span class="lore-kw" data-kw="${k}" style="color:#4a8adc;cursor:pointer;border-bottom:1px solid #4a8adc55;font-style:normal;" title="Open on Fandom Wiki ↗">${m}</span>`;
    });
  }).join("");
}

// ── Path resolver ────────────────────────────────────────────────────────────
function resolveEpubPath(base, rel) {
  if (!rel || rel.startsWith("data:") || /^https?:\/\//.test(rel)) return rel;
  const parts = base.split("/"); parts.pop();
  for (const seg of rel.split("/")) {
    if (seg === "..") { if (parts.length) parts.pop(); }
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

// ── EPUB parser ──────────────────────────────────────────────────────────────
async function parseEpub(url) {
  if (!window.JSZip) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const buf = await (await fetch(url)).arrayBuffer();
  const zip = await window.JSZip.loadAsync(buf);
  const px = new DOMParser();
  const cXml = await zip.file("META-INF/container.xml").async("text");
  const opfPath = px.parseFromString(cXml, "application/xml").querySelector("rootfile").getAttribute("full-path");
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfDoc = px.parseFromString(await zip.file(opfPath).async("text"), "application/xml");
  const manifest = {};
  opfDoc.querySelectorAll("manifest item").forEach(i => { manifest[i.getAttribute("id")] = i.getAttribute("href"); });
  const hrefs = [...opfDoc.querySelectorAll("spine itemref")].map(i => manifest[i.getAttribute("idref")]).filter(Boolean);

  const tocLabels = {};
  try {
    const ncxItem = opfDoc.querySelector('item[media-type="application/x-dtbncx+xml"]');
    const navItem = opfDoc.querySelector('item[properties~="nav"],item[properties="nav"]');
    if (ncxItem) {
      const ncxText = await zip.file(opfDir + ncxItem.getAttribute("href"))?.async("text");
      if (ncxText) {
        const ncxDoc = px.parseFromString(ncxText, "application/xml");
        ncxDoc.querySelectorAll("navPoint").forEach(np => {
          const src = np.querySelector("content")?.getAttribute("src");
          const label = np.querySelector("navLabel text")?.textContent?.trim();
          if (src && label) { tocLabels[src.split("#")[0]] = label; tocLabels[src.split("#")[0].split("/").pop()] = label; }
        });
      }
    } else if (navItem) {
      const navText = await zip.file(opfDir + navItem.getAttribute("href"))?.async("text");
      if (navText) {
        const navDoc = new DOMParser().parseFromString(navText, "text/html");
        navDoc.querySelectorAll("nav a").forEach(a => {
          const href = a.getAttribute("href")?.split("#")[0];
          const label = a.textContent?.trim();
          if (href && label) { tocLabels[href] = label; tocLabels[href.split("/").pop()] = label; }
        });
      }
    }
  } catch {}

  const chapters = await Promise.all(hrefs.map(async (href, idx) => {
    const chapterPath = opfDir + href;
    const file = zip.file(chapterPath) || zip.file(href);
    if (!file) return null;
    let html = await file.async("text");
    for (const m of [...html.matchAll(/(?:src|href)=["']([^"'#][^"']*\.(jpe?g|png|gif|webp|svg))["']/gi)]) {
      const rawSrc = m[1];
      if (rawSrc.startsWith("data:")) continue;
      const resolved = resolveEpubPath(chapterPath, rawSrc);
      const imgFile = zip.file(resolved) || zip.file(opfDir + rawSrc) || zip.file(rawSrc);
      if (imgFile) {
        const b64 = await imgFile.async("base64");
        const ext = rawSrc.split(".").pop().toLowerCase().replace(/[?#].*/, "");
        const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : (ext === "svg" || ext === "svgz") ? "image/svg+xml" : "image/jpeg";
        html = html.replace(m[0], m[0].replace(rawSrc, `data:${mime};base64,${b64}`));
      }
    }
    const hrefBase = href.split("/").pop();
    const tocLabel = tocLabels[href] || tocLabels[hrefBase];
    const tMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) || html.match(/<h[123][^>]*>([^<]+)<\/h[123]>/i);
    const rawLabel = tMatch?.[1]?.trim() || "";
    const label = tocLabel || (rawLabel && rawLabel.length < 80 && !/\.x?html?$/i.test(rawLabel) ? rawLabel : null) || `Chapter ${idx + 1}`;
    return { html: highlightKeywords(html), label };
  }));
  return chapters.filter(Boolean);
}

// ── useReaderViewport ────────────────────────────────────────────────────────
function useReaderViewport() {
  useEffect(() => {
    const meta = document.querySelector('meta[name=viewport]');
    if (!meta) return;
    const prev = meta.content;
    meta.content = 'width=device-width,initial-scale=1,user-scalable=no';
    return () => {
      meta.content = prev;
      if (navigator.maxTouchPoints > 0) {
        const w = window.innerWidth;
        if (w > 520) { const s = Math.min(1.9, w / 430); meta.content = `width=430,initial-scale=${s.toFixed(2)},user-scalable=no`; }
      }
    };
  }, []);
}

// ── DictionaryPanel ──────────────────────────────────────────────────────────
function DictionaryPanel({ word, onClose, theme }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const T = THEMES[theme];

  useEffect(() => {
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) && d[0] ? d[0] : null); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [word]);

  const meaning = data?.meanings?.[0];
  const def = meaning?.definitions?.[0];

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderTop:`2px solid ${C.gold}`, borderRadius:"16px 16px 0 0", padding:"20px 20px 48px", width:"100%", maxWidth:600, maxHeight:"60vh", overflowY:"auto", animation:"slideUp 0.2s ease" }}>
        <div style={{ width:36, height:4, background:T.border, borderRadius:2, margin:"0 auto 16px" }} />
        {loading && <div style={{ textAlign:"center", padding:24, color:T.muted, fontStyle:"italic" }}>Looking up "{word}"…</div>}
        {error && <div style={{ textAlign:"center", padding:24, color:T.muted, fontStyle:"italic" }}>No definition found for "{word}"</div>}
        {!loading && !error && data && (
          <>
            <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:4 }}>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:22, fontWeight:700, color:T.text }}>{data.word}</span>
              {data.phonetics?.[0]?.text && <span style={{ color:T.muted, fontSize:14 }}>{data.phonetics[0].text}</span>}
            </div>
            {meaning && <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:C.gold, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>{meaning.partOfSpeech}</div>}
            {def && (
              <>
                <p style={{ color:T.text, fontSize:15, lineHeight:1.7, marginBottom:10 }}>{def.definition}</p>
                {def.example && <p style={{ color:T.muted, fontSize:13, lineHeight:1.6, fontStyle:"italic", borderLeft:`2px solid ${C.gold}44`, paddingLeft:12 }}>"{def.example}"</p>}
              </>
            )}
            {data.meanings?.length > 1 && (
              <div style={{ marginTop:14 }}>
                {data.meanings.slice(1, 3).map((m, i) => (
                  <div key={i} style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim, letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>{m.partOfSpeech}</div>
                    <p style={{ color:T.text, fontSize:13, lineHeight:1.6 }}>{m.definitions[0]?.definition}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── SettingsBottomSheet ──────────────────────────────────────────────────────
function SettingsBottomSheet({ settings, onChange, onClose }) {
  const T = THEMES[settings.theme];
  const Btn = ({ label, active, onClick }) => (
    <button onClick={onClick} style={{ background:active ? `${C.gold}22` : "transparent", border:`1px solid ${active ? C.gold : T.border}`, borderRadius:6, padding:"6px 12px", color:active ? C.gold : T.muted, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer" }}>
      {label}
    </button>
  );
  const Row = ({ label, children }) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
      <span style={{ fontFamily:"'Cinzel',serif", fontSize:12, color:T.text, letterSpacing:1 }}>{label}</span>
      {children}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:800, background:"rgba(0,0,0,0.5)" }}>
      <div onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:0, right:0, background:T.surface, borderTop:`2px solid ${C.gold}55`, borderRadius:"16px 16px 0 0", padding:"16px 20px 48px", maxHeight:"85vh", overflowY:"auto", animation:"slideUp 0.25s ease" }}>
        <div style={{ width:36, height:4, background:T.border, borderRadius:2, margin:"0 auto 16px" }} />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:15, color:T.text }}>Reading Settings</span>
          <button onClick={onClose} style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:6, color:T.muted, width:32, height:32, cursor:"pointer", fontSize:16 }}>✕</button>
        </div>

        {/* Theme */}
        <div style={{ marginBottom:4, fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim, letterSpacing:3, textTransform:"uppercase" }}>Theme</div>
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {Object.values(THEMES).map(th => (
            <button key={th.id} onClick={() => onChange("theme", th.id)} style={{ flex:1, padding:"14px 8px", borderRadius:8, cursor:"pointer", background:th.bg, border:`2px solid ${settings.theme === th.id ? C.gold : T.border}`, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ width:20, height:20, borderRadius:"50%", background:th.text }} />
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:th.text, letterSpacing:1 }}>{th.label}</span>
            </button>
          ))}
        </div>

        {/* Font */}
        <div style={{ marginBottom:4, fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim, letterSpacing:3, textTransform:"uppercase" }}>Font</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:20 }}>
          {FONTS.map((f, i) => (
            <button key={i} onClick={() => onChange("fontIndex", i)} style={{ padding:"10px 8px", borderRadius:6, background:"transparent", border:`1px solid ${settings.fontIndex === i ? C.gold : T.border}`, color:settings.fontIndex === i ? C.gold : T.muted, fontFamily:f.value, fontSize:13, cursor:"pointer" }}>{f.name}</button>
          ))}
        </div>

        <Row label={`Size — ${settings.fontSize}px`}>
          <div style={{ display:"flex", gap:6 }}>
            {[14, 16, 18, 20, 22, 24].map(s => <Btn key={s} label={s} active={settings.fontSize === s} onClick={() => onChange("fontSize", s)} />)}
          </div>
        </Row>
        <Row label={`Line height — ${settings.lineHeight}×`}>
          <div style={{ display:"flex", gap:6 }}>
            {[1.5, 1.7, 1.9, 2.1].map(v => <Btn key={v} label={v} active={settings.lineHeight === v} onClick={() => onChange("lineHeight", v)} />)}
          </div>
        </Row>
        <Row label="Margins">
          <div style={{ display:"flex", gap:6 }}>
            {[{ l:"Narrow", v:12 }, { l:"Normal", v:24 }, { l:"Wide", v:40 }].map(m => <Btn key={m.v} label={m.l} active={settings.margin === m.v} onClick={() => onChange("margin", m.v)} />)}
          </div>
        </Row>
        <Row label="Reading mode">
          <div style={{ display:"flex", gap:6 }}>
            <Btn label="Pages" active={settings.paginate} onClick={() => onChange("paginate", true)} />
            <Btn label="Scroll" active={!settings.paginate} onClick={() => { onChange("paginate", false); onChange("twoPage", false); }} />
          </div>
        </Row>
        {settings.paginate && (
          <Row label="Layout">
            <div style={{ display:"flex", gap:6 }}>
              <Btn label="Single" active={!settings.twoPage} onClick={() => onChange("twoPage", false)} />
              <Btn label="Two-page" active={settings.twoPage} onClick={() => onChange("twoPage", true)} />
            </div>
          </Row>
        )}
      </div>
    </div>
  );
}

// ── Main EpubReader ──────────────────────────────────────────────────────────
export default function EpubReader({ url, title, bookId, userId, initProgress, initChapterIndex, initPageIndex, onProgress, onClose }) {
  useReaderViewport();

  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [chapters, setChapters]   = useState([]);
  const [chIdx, setChIdx]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [settings, setSettings] = useState({
    theme:"dark", fontIndex:0, fontSize:18, lineHeight:1.8, margin:24, paginate:true, twoPage:false,
  });
  const updateSetting = (key, val) => setSettings(s => ({ ...s, [key]:val }));
  const T   = THEMES[settings.theme];
  const fnt = FONTS[settings.fontIndex];

  const outerRef        = useRef(null);
  const innerRef        = useRef(null);
  const pendingPageRef  = useRef(initPageIndex || 0);
  const [pageIndex, setPageIndex]   = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageWidth, setPageWidth]   = useState(0);
  const [pageHeight, setPageHeight] = useState(0);

  // ── Kindle UI: showUI false = full immersion ─────────────────────────────
  const [showUI, setShowUI]           = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc]         = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [dictWord, setDictWord]       = useState(null);
  const [showHint, setShowHint]       = useState(() => !localStorage.getItem("wh40k_lore_hint"));
  const hideUITimerRef  = useRef(null);
  const measureTimerRef = useRef(null);
  const scrollSaveTimer = useRef(null);
  const [scrollPct, setScrollPct] = useState(Math.round((initProgress || 0) * 100));

  // ── Reveal UI + auto-hide after 4.5s ────────────────────────────────────
  const revealUI = useCallback(() => {
    setShowUI(true);
    if (hideUITimerRef.current) clearTimeout(hideUITimerRef.current);
    hideUITimerRef.current = setTimeout(() => setShowUI(false), 4500);
  }, []);

  // Keep UI visible while a panel is open
  useEffect(() => {
    if (showSettings || showToc || showBookmarks) {
      if (hideUITimerRef.current) clearTimeout(hideUITimerRef.current);
    }
  }, [showSettings, showToc, showBookmarks]);

  // ── Bookmarks ────────────────────────────────────────────────────────────
  const [bookmarks, setBookmarks] = useState(() => {
    if (!userId || !bookId) return [];
    try { return JSON.parse(localStorage.getItem(`wh40k_bm_${userId}_${bookId}`) || '[]'); } catch { return []; }
  });
  useEffect(() => {
    if (!userId || !bookId) return;
    sbr.get("bookmarks", `user_id=eq.${userId}&book_id=eq.${bookId}&order=created_at.desc`).then(rows => {
      if (rows?.length && !rows._error) {
        const bms = rows.map(r => ({ id:r.id, chapter_index:r.chapter_index, page_index:r.page_index, scroll_top:r.scroll_top ?? null, progress_pct:r.progress_pct, label:r.label, createdAt:r.created_at }));
        setBookmarks(bms);
        localStorage.setItem(`wh40k_bm_${userId}_${bookId}`, JSON.stringify(bms));
      }
    });
  }, [userId, bookId]);

  // ── Load EPUB ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    parseEpub(url).then(chs => {
      if (cancelled) return;
      setChapters(chs);
      const startCh = initChapterIndex > 0
        ? Math.min(initChapterIndex, chs.length - 1)
        : Math.min(Math.floor((initProgress || 0) * chs.length), Math.max(0, chs.length - 1));
      setChIdx(startCh);
      setLoading(false);
    }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url]);

  // ── Load custom fonts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!fnt.import) return;
    const id = `font-${settings.fontIndex}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id; link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${fnt.import}&display=swap`;
      document.head.appendChild(link);
    }
  }, [settings.fontIndex]);

  // ── Measure columns ──────────────────────────────────────────────────────
  const measurePages = useCallback(() => {
    if (!outerRef.current || !innerRef.current || !settings.paginate) return;
    const ow = outerRef.current.clientWidth;
    const oh = outerRef.current.clientHeight;
    setPageWidth(ow); setPageHeight(oh);
    if (measureTimerRef.current) clearTimeout(measureTimerRef.current);
    measureTimerRef.current = setTimeout(() => {
      if (!innerRef.current) return;
      const tp = Math.max(1, Math.round(innerRef.current.scrollWidth / ow));
      setTotalPages(tp);
      if (pendingPageRef.current > 0) {
        setPageIndex(Math.min(pendingPageRef.current, tp - 1));
        pendingPageRef.current = 0;
      } else {
        setPageIndex(prev => Math.min(prev, Math.max(0, tp - 1)));
      }
    }, 200);
  }, [settings.paginate]);

  useEffect(() => { measurePages(); }, [chIdx, settings, chapters, measurePages]);
  useEffect(() => {
    if (!outerRef.current) return;
    const ro = new ResizeObserver(measurePages);
    ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [measurePages]);

  // ── Save progress (paginated) ────────────────────────────────────────────
  useEffect(() => {
    if (!chapters.length || !userId || !settings.paginate) return;
    const pct = (chIdx + (pageIndex / Math.max(1, totalPages))) / chapters.length;
    onProgress(pct);
    sbr.upsert("reading_progress", { user_id:userId, book_id:bookId, chapter_index:chIdx, page_index:pageIndex, progress_pct:pct, last_read:new Date().toISOString() }, "user_id,book_id");
    localStorage.setItem(`wh40k_prog_${userId}_${bookId}`, JSON.stringify({ progress_pct:pct, chapter_index:chIdx, page_index:pageIndex }));
  }, [chIdx, pageIndex, chapters.length, totalPages, settings.paginate]);

  useEffect(() => { setPageIndex(0); }, [chIdx]);

  // ── Scroll mode: restore position ────────────────────────────────────────
  useEffect(() => {
    if (settings.paginate || !chapters.length || !outerRef.current) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`wh40k_prog_${userId}_${bookId}`) || '{}');
      if (saved.scroll_top > 0) {
        requestAnimationFrame(() => { if (outerRef.current) outerRef.current.scrollTop = saved.scroll_top; });
      } else if (initChapterIndex > 0) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`epub-ch-${bookId}-${initChapterIndex}`);
          if (el && outerRef.current) outerRef.current.scrollTop = el.offsetTop - 48;
        });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.paginate, chapters.length]);

  // ── Lore hint ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => { setShowHint(false); localStorage.setItem("wh40k_lore_hint", "1"); }, 5000);
    return () => clearTimeout(t);
  }, [showHint]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const prevPage = useCallback(() => {
    if (pageIndex > 0) { setPageIndex(p => p - 1); }
    else if (chIdx > 0) { pendingPageRef.current = 0; setChIdx(c => c - 1); }
  }, [pageIndex, chIdx]);

  const nextPage = useCallback(() => {
    if (pageIndex < totalPages - 1) { setPageIndex(p => p + 1); }
    else if (chIdx < chapters.length - 1) { pendingPageRef.current = 0; setChIdx(c => c + 1); }
  }, [pageIndex, totalPages, chIdx, chapters.length]);

  // ── Tap handler: left/right = nav, center = toggle UI ────────────────────
  const handleTap = useCallback(e => {
    // Lore keyword click
    const kw = e.target.getAttribute?.("data-kw");
    if (kw && LORE_DB[kw]) { window.open(wikiUrl(kw), '_blank', 'noopener'); return; }
    if (e.target.closest('button,a,input,select,[role=button]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const w = rect.width;

    if (settings.paginate) {
      if (relX < w * 0.30) { prevPage(); return; }
      if (relX > w * 0.70) { nextPage(); return; }
    }
    // Center 40% (or full area in scroll mode) → toggle UI
    revealUI();
  }, [settings.paginate, prevPage, nextPage, revealUI]);

  // ── Word select → dictionary ──────────────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const word = sel.toString().trim().replace(/[^a-zA-Z'-]/g, "");
    if (word.length < 2 || word.includes(" ")) return;
    if (LORE_DB[word.toLowerCase()]) return;
    setDictWord(word);
    sel.removeAllRanges();
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (showSettings || dictWord) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); nextPage(); return; }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   { e.preventDefault(); prevPage(); return; }
      if (e.key === " ") { e.preventDefault(); nextPage(); return; }
      if (e.key === "Escape") {
        if (showBookmarks) { setShowBookmarks(false); return; }
        if (showToc) { setShowToc(false); return; }
        onClose(); return;
      }
      if (e.key === "t" || e.key === "T") { setShowToc(v => !v); return; }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showSettings, showToc, showBookmarks, dictWord, nextPage, prevPage, onClose]);

  // ── Scroll-mode progress ─────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    if (!outerRef.current || settings.paginate || !chapters.length) return;
    const { scrollTop, scrollHeight, clientHeight } = outerRef.current;
    if (scrollHeight <= clientHeight) return;
    const pct = scrollTop / (scrollHeight - clientHeight);
    onProgress(pct);
    setScrollPct(Math.round(pct * 100));
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => {
      if (userId && bookId) {
        localStorage.setItem(`wh40k_prog_${userId}_${bookId}`, JSON.stringify({ progress_pct:pct, chapter_index:0, page_index:0, scroll_top:scrollTop }));
        sbr.upsert("reading_progress", { user_id:userId, book_id:bookId, chapter_index:0, page_index:0, progress_pct:pct, last_read:new Date().toISOString() }, "user_id,book_id");
      }
    }, 800);
  }, [chapters.length, settings.paginate, onProgress, userId, bookId]);

  // ── Save bookmark ────────────────────────────────────────────────────────
  const saveBookmark = useCallback(() => {
    if (userId && bookId) {
      let pct, curChIdx, curPageIndex, scrollTop = 0;
      if (!settings.paginate && outerRef.current) {
        scrollTop = outerRef.current.scrollTop;
        const { scrollHeight, clientHeight } = outerRef.current;
        pct = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
        curChIdx = 0;
        for (let i = chapters.length - 1; i >= 0; i--) {
          const el = document.getElementById(`epub-ch-${bookId}-${i}`);
          if (el && el.offsetTop <= scrollTop + 80) { curChIdx = i; break; }
        }
        curPageIndex = 0;
      } else {
        pct = chapters.length > 0 ? (chIdx + (pageIndex / Math.max(1, totalPages))) / chapters.length : 0;
        curChIdx = chIdx; curPageIndex = pageIndex; scrollTop = 0;
      }
      const bmData = { user_id:userId, book_id:bookId, chapter_index:curChIdx, page_index:curPageIndex, scroll_top:scrollTop, progress_pct:pct, label:chapters[curChIdx]?.label || `Chapter ${curChIdx + 1}` };
      sbr.upsert("bookmarks", bmData, "id").then(res => {
        const dbId = Array.isArray(res) ? res[0]?.id : res?.id;
        const bm = { id:dbId || Date.now(), chapter_index:curChIdx, page_index:curPageIndex, scroll_top:scrollTop, progress_pct:pct, label:bmData.label, createdAt:new Date().toISOString() };
        const updated = [bm, ...bookmarks.filter(b => b.id !== bm.id)].slice(0, 30);
        setBookmarks(updated);
        localStorage.setItem(`wh40k_bm_${userId}_${bookId}`, JSON.stringify(updated));
      });
      localStorage.setItem(`wh40k_prog_${userId}_${bookId}`, JSON.stringify({ progress_pct:pct, chapter_index:curChIdx, page_index:curPageIndex, scroll_top:scrollTop, bookmarked:true, bookmarkedAt:new Date().toISOString() }));
    }
    setBookmarkSaved(true);
    setTimeout(() => setBookmarkSaved(false), 2000);
  }, [userId, bookId, chapters, chIdx, pageIndex, totalPages, bookmarks, settings.paginate]);

  // ── Derived values ────────────────────────────────────────────────────────
  const readingMinutes = useMemo(() => {
    if (!chapters[chIdx]) return null;
    const words = chapters[chIdx].html.replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).length;
    const mins = Math.ceil(words / 250);
    return mins < 1 ? null : mins;
  }, [chapters, chIdx]);

  const globalPct = chapters.length > 0
    ? Math.round(((chIdx + (pageIndex / Math.max(1, totalPages))) / chapters.length) * 100) : 0;

  const hPad    = settings.twoPage ? settings.margin : settings.margin + 8; // narrow padding — no side arrows
  const colWidth = settings.twoPage
    ? Math.max(80, Math.floor((pageWidth - 2 * settings.margin - 48) / 2))
    : Math.max(100, pageWidth - 2 * hPad);
  const colGap  = settings.twoPage ? 48 : 2 * hPad;
  const atStart = pageIndex === 0 && chIdx === 0;
  const atEnd   = pageIndex >= totalPages - 1 && chIdx >= chapters.length - 1;

  const readerStyle = {
    fontFamily:fnt.value, fontSize:settings.fontSize, lineHeight:settings.lineHeight,
    color:T.text, padding:`24px ${settings.margin}px`, wordBreak:"break-word",
    hyphens:"auto", textAlign:"justify", maxWidth:"100%",
  };

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ position:"fixed", inset:0, zIndex:600, background:THEMES.dark.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
      <div style={{ fontSize:52, animation:"spin 2s linear infinite" }}>⚙</div>
      <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:C.goldDim, letterSpacing:3 }}>Decrypting tome…</div>
      <div style={{ color:C.muted, fontSize:12, fontStyle:"italic" }}>Parsing EPUB chapters</div>
    </div>
  );

  if (error) return (
    <div style={{ position:"fixed", inset:0, zIndex:600, background:THEMES.dark.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:32, textAlign:"center" }}>
      <div style={{ fontSize:48 }}>⚠</div>
      <div style={{ fontFamily:"'Cinzel',serif", fontSize:15, color:C.red }}>Could not open EPUB</div>
      <div style={{ color:C.muted, fontSize:12, maxWidth:300 }}>{error}</div>
      <div style={{ color:C.dim, fontSize:11, maxWidth:300, marginTop:4 }}>DRM-protected files cannot be opened. Try a DRM-free copy.</div>
      <button onClick={onClose} style={{ marginTop:12, background:"transparent", border:`1px solid ${C.gold}`, borderRadius:8, padding:"10px 24px", color:C.gold, fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2, cursor:"pointer", textTransform:"uppercase" }}>← Back to Library</button>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, zIndex:600, background:T.bg, overflow:"hidden", transition:"background 0.3s" }}>

      {/* ── TOP BAR — slides in/out ── */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, zIndex:10,
        background:T.ui, borderBottom:`1px solid ${T.border}`,
        height:52, display:"flex", alignItems:"center", padding:"0 10px", gap:6,
        transform: showUI ? "translateY(0)" : "translateY(-100%)",
        transition:"transform 0.22s ease",
        pointerEvents: showUI ? "auto" : "none",
      }}>
        <button onClick={onClose} title="Back (Esc)" style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, color:T.text, padding:"7px 12px", cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, flexShrink:0 }}>← Back</button>
        <div style={{ flex:1, fontFamily:"'Cinzel',serif", fontSize:11, color:T.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", padding:"0 4px" }}>{title}</div>
        {readingMinutes && <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim, letterSpacing:1, flexShrink:0, whiteSpace:"nowrap" }}>~{readingMinutes} min</div>}

        <button onClick={saveBookmark} title="Add bookmark" style={{ background:bookmarkSaved ? `${C.gold}22` : "transparent", border:`1px solid ${bookmarkSaved ? C.gold : T.border}`, borderRadius:6, color:bookmarkSaved ? C.gold : T.muted, width:34, height:34, cursor:"pointer", fontSize:16, flexShrink:0, position:"relative" }}>
          🔖
          {bookmarkSaved && <span style={{ position:"absolute", top:-28, left:"50%", transform:"translateX(-50%)", background:C.gold, color:C.bg, fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1, padding:"3px 7px", borderRadius:4, whiteSpace:"nowrap", pointerEvents:"none" }}>Saved ✓</span>}
        </button>
        <button onClick={() => { setShowBookmarks(v => !v); if(!showBookmarks) revealUI(); }} title="Bookmarks" style={{ background:showBookmarks ? `${C.gold}22` : "transparent", border:`1px solid ${showBookmarks ? C.gold : T.border}`, borderRadius:6, color:showBookmarks ? C.gold : T.muted, width:34, height:34, cursor:"pointer", fontSize:14, flexShrink:0, position:"relative" }}>
          📑
          {bookmarks.length > 0 && <span style={{ position:"absolute", top:-4, right:-4, background:C.gold, color:C.bg, borderRadius:10, fontSize:8, minWidth:14, height:14, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"sans-serif", fontWeight:"bold", padding:"0 2px", pointerEvents:"none" }}>{bookmarks.length}</span>}
        </button>
        <button onClick={() => { setShowToc(t => !t); if(!showToc) revealUI(); }} title="Contents (T)" style={{ background:showToc ? `${C.gold}22` : "transparent", border:`1px solid ${showToc ? C.gold : T.border}`, borderRadius:6, color:showToc ? C.gold : T.muted, width:34, height:34, cursor:"pointer", fontSize:16, flexShrink:0 }}>≡</button>
        <button onClick={() => { setShowSettings(true); if (hideUITimerRef.current) clearTimeout(hideUITimerRef.current); }} title="Settings" style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:6, color:T.muted, width:34, height:34, cursor:"pointer", fontSize:16, flexShrink:0 }}>⚙</button>
      </div>

      {/* ── READING AREA — full screen, tap to nav/toggle UI ── */}
      <div
        ref={settings.paginate ? null : outerRef}
        style={{ position:"absolute", inset:0, overflow:settings.paginate ? "hidden" : "auto", WebkitOverflowScrolling:"touch" }}
        onClick={handleTap}
        onMouseUp={handleMouseUp}
        onScroll={settings.paginate ? undefined : handleScroll}
      >
        <style>{`.epub-col img{break-inside:avoid;max-width:100%;height:auto;}.epub-col h1,.epub-col h2,.epub-col h3{break-after:avoid;}.epub-col p{orphans:3;widows:3;}`}</style>

        {settings.paginate ? (
          <div ref={outerRef} style={{ position:"absolute", inset:0, overflow:"hidden", paddingTop:0, paddingBottom:0, boxSizing:"border-box", cursor:"default", userSelect:"none" }}>
            <div ref={innerRef} className="epub-col" style={{
              fontFamily:fnt.value, fontSize:settings.fontSize, lineHeight:settings.lineHeight,
              color:T.text, wordBreak:"break-word", hyphens:"auto", textAlign:"justify",
              paddingTop:24, paddingBottom:24,
              paddingLeft:`${hPad}px`, paddingRight:`${hPad}px`,
              columnWidth:`${colWidth}px`, columnFill:"auto", columnGap:`${colGap}px`,
              height: pageHeight ? `${pageHeight - 48}px` : "100%",
              transform:`translateX(-${pageIndex * (pageWidth || 300)}px)`,
              transition:"transform 0.28s cubic-bezier(.4,0,.2,1)",
              willChange:"transform",
            }} dangerouslySetInnerHTML={{ __html: chapters[chIdx]?.html || "" }} />
          </div>
        ) : (
          <div ref={innerRef}>
            {chapters.map((ch, i) => (
              <div key={i} id={`epub-ch-${bookId}-${i}`}>
                {i > 0 && (
                  <div style={{ margin:"40px 0 0", padding:`16px ${settings.margin}px 12px`, borderTop:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.goldDim, letterSpacing:3, textTransform:"uppercase", flexShrink:0 }}>Chapter {i + 1}</span>
                    <span style={{ flex:1, height:1, background:T.border }} />
                    <span style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:T.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"60%" }}>{ch.label}</span>
                  </div>
                )}
                <div style={readerStyle} dangerouslySetInnerHTML={{ __html: ch.html }} />
              </div>
            ))}
            <div style={{ padding:`32px ${settings.margin}px 60px`, textAlign:"center" }}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim, letterSpacing:4, textTransform:"uppercase" }}>— End of Book —</div>
            </div>
          </div>
        )}
      </div>

      {/* ── TOC sidebar ── */}
      {showToc && (
        <div style={{ position:"absolute", top:0, left:0, bottom:0, width:220, zIndex:20, background:T.ui, borderRight:`1px solid ${T.border}`, overflowY:"auto", animation:"slideLeft 0.2s ease" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px 10px", borderBottom:`1px solid ${T.border}` }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim, letterSpacing:3, textTransform:"uppercase" }}>Contents</span>
            <button onClick={() => setShowToc(false)} style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:16, padding:0 }}>✕</button>
          </div>
          {chapters.map((ch, i) => (
            <button key={i} onClick={() => {
              if (!settings.paginate && outerRef.current) {
                const el = document.getElementById(`epub-ch-${bookId}-${i}`);
                if (el) requestAnimationFrame(() => { if (outerRef.current) outerRef.current.scrollTop = el.offsetTop - 48; });
              } else {
                pendingPageRef.current = 0; setChIdx(i); setPageIndex(0);
              }
              setShowToc(false);
            }} style={{ display:"block", width:"100%", textAlign:"left", background:i === chIdx ? `${C.gold}18` : "transparent", border:"none", borderLeft:`3px solid ${i === chIdx ? C.gold : "transparent"}`, padding:"10px 16px", color:i === chIdx ? C.gold : T.muted, fontSize:12, cursor:"pointer", lineHeight:1.4, transition:"background 0.15s" }}>{ch.label}</button>
          ))}
        </div>
      )}

      {/* ── Bookmarks sidebar ── */}
      {showBookmarks && (
        <div style={{ position:"absolute", top:0, left:0, bottom:0, width:240, zIndex:20, background:T.ui, borderRight:`1px solid ${T.border}`, overflowY:"auto", animation:"slideLeft 0.2s ease" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px 10px", borderBottom:`1px solid ${T.border}` }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim, letterSpacing:3, textTransform:"uppercase" }}>Bookmarks</span>
            <button onClick={() => setShowBookmarks(false)} style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:16, padding:0 }}>✕</button>
          </div>
          {bookmarks.length === 0 && <div style={{ padding:"20px 16px", color:T.muted, fontSize:12, fontStyle:"italic", textAlign:"center" }}>No bookmarks yet.<br />Press 🔖 to add one.</div>}
          {bookmarks.map((bm, i) => (
            <div key={bm.id} style={{ borderBottom:`1px solid ${T.border}55`, padding:"10px 12px", display:"flex", gap:8, alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <button onClick={() => {
                  if (!settings.paginate) {
                    setShowBookmarks(false);
                    setTimeout(() => {
                      const el = outerRef.current; if (!el) return;
                      if (bm.scroll_top > 0) el.scrollTop = bm.scroll_top;
                      else if (bm.progress_pct > 0) el.scrollTop = bm.progress_pct * (el.scrollHeight - el.clientHeight);
                      else { const chEl = document.getElementById(`epub-ch-${bookId}-${bm.chapter_index || 0}`); if (chEl) el.scrollTop = chEl.offsetTop - 48; }
                    }, 80);
                  } else {
                    pendingPageRef.current = bm.page_index || 0;
                    setChIdx(bm.chapter_index || 0);
                    setPageIndex(0);
                    setShowBookmarks(false);
                  }
                }} style={{ background:"none", border:"none", textAlign:"left", cursor:"pointer", padding:0, width:"100%" }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:i === 0 ? C.gold : T.text, marginBottom:2 }}>
                    {i === 0 && <span style={{ fontSize:9, color:C.gold, marginRight:4 }}>●</span>}
                    {bm.label}
                  </div>
                  <div style={{ fontSize:10, color:T.muted }}>{settings.paginate ? `p. ${bm.page_index + 1} · ` : ''}{Math.round((bm.progress_pct || 0) * 100)}%</div>
                  <div style={{ fontSize:9, color:T.muted, marginTop:1 }}>{new Date(bm.createdAt).toLocaleDateString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
                </button>
              </div>
              <button onClick={() => {
                const u = [...bookmarks]; u.splice(i, 1);
                setBookmarks(u);
                localStorage.setItem(`wh40k_bm_${userId}_${bookId}`, JSON.stringify(u));
                if (bm.id && typeof bm.id === 'number' && bm.id <= 1000000000000) sbr.del("bookmarks", `id=eq.${bm.id}&user_id=eq.${userId}`);
              }} style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:14, padding:"2px 4px", flexShrink:0 }} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── BOTTOM BAR — slides in/out ── */}
      <div style={{
        position:"absolute", bottom:0, left:0, right:0, zIndex:10,
        background:T.ui, borderTop:`1px solid ${T.border}`,
        height:48, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 14px",
        transform: showUI ? "translateY(0)" : "translateY(100%)",
        transition:"transform 0.22s ease",
        pointerEvents: showUI ? "auto" : "none",
      }}>
        {settings.twoPage
          ? <button onClick={prevPage} disabled={atStart} style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, color:atStart ? T.border : T.text, padding:"6px 14px", cursor:atStart ? "default" : "pointer", fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, minWidth:66 }}>← Prev</button>
          : <div style={{ minWidth:66 }} />}
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:T.muted }}>
            {settings.paginate ? `ch. ${chIdx + 1}/${chapters.length} · ${globalPct}%` : `${scrollPct}% complete`}
          </div>
          {settings.paginate && settings.twoPage && <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim }}>spread {pageIndex + 1}/{totalPages}</div>}
        </div>
        {settings.twoPage
          ? <button onClick={nextPage} disabled={atEnd} style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, color:atEnd ? T.border : T.text, padding:"6px 14px", cursor:atEnd ? "default" : "pointer", fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, minWidth:66 }}>Next →</button>
          : <div style={{ minWidth:66 }} />}
      </div>

      {/* ── PROGRESS BAR — always visible at very bottom ── */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, zIndex:15, pointerEvents:"none" }}>
        <div style={{ height:"100%", width:`${settings.paginate ? globalPct : scrollPct}%`, background:`linear-gradient(to right,${C.gold},${C.red})`, transition:"width 0.5s" }} />
      </div>

      {/* ── LORE HINT ── */}
      {showHint && (
        <div style={{ position:"absolute", bottom:settings.paginate ? 60 : 20, left:"50%", transform:"translateX(-50%)", background:`${T.ui}f0`, border:`1px solid ${C.gold}55`, borderRadius:20, padding:"6px 16px", whiteSpace:"nowrap", pointerEvents:"none", zIndex:5, animation:"slideUp 0.3s ease" }}>
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim, letterSpacing:1 }}>🔵 Blue terms → Fandom Wiki · Select text → Dictionary · Tap center → show controls</span>
        </div>
      )}

      {/* ── OVERLAYS ── */}
      {showSettings && <SettingsBottomSheet settings={settings} onChange={updateSetting} onClose={() => setShowSettings(false)} />}
      {dictWord && <DictionaryPanel word={dictWord} onClose={() => setDictWord(null)} theme={settings.theme} />}
    </div>
  );
}
