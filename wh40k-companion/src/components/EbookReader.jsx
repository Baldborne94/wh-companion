/**
 * EpubReader.jsx
 * Drop-in replacement for the EpubReader component in App.jsx
 *
 * CHANGES vs original:
 *  - Uses epub.js (epubjs) for rendering instead of the hand-rolled JSZip parser
 *  - Keeps ALL existing features: lore keywords, dictionary panel, themes,
 *    fonts, settings panel, TOC, progress tracking, Supabase sync
 *  - Word-selection dictionary still works via postMessage bridge into the iframe
 *  - Lore keywords are injected via epub.js hooks (same gold-underline style)
 *
 * INSTALL:
 *   npm install epubjs
 *
 * USAGE (identical to before — just swap the component):
 *   <EpubReader
 *     url={...}
 *     title={...}
 *     bookId={...}
 *     initProgress={...}
 *     onProgress={...}
 *     onClose={...}
 *   />
 *
 * Keep everything else in App.jsx (LORE_DB, THEMES, FONTS, C,
 * DictionaryPanel, LorePanel, SettingsPanel, etc.) exactly as-is.
 * Only replace the EpubReader function with this one.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Epub from "epubjs";

// ─── These constants are assumed to still exist in App.jsx ───────────────────
// THEMES, FONTS, C, LORE_DB, KW_KEYS, KW_REGEX
// DictionaryPanel, LorePanel, SettingsPanel
// sb  (Supabase helper)
// If you paste this file standalone, copy those declarations here too.

// ─── EPUB READER ──────────────────────────────────────────────────────────────
export function EpubReader({ url, title, bookId, initProgress, onProgress, onClose }) {
  const viewerRef   = useRef(null);   // div that epub.js renders into
  const bookRef     = useRef(null);   // epub.js Book instance
  const renditionRef = useRef(null);  // epub.js Rendition instance

  const [toc,        setToc]        = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [showUI,     setShowUI]     = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc,    setShowToc]    = useState(false);
  const [loreKey,    setLoreKey]    = useState(null);
  const [dictWord,   setDictWord]   = useState(null);
  const [currentCfi, setCurrentCfi] = useState(null); // for progress

  // Reading settings (identical shape to original)
  const [settings, setSettings] = useState({
    theme: "dark", fontIndex: 0, fontSize: 18,
    lineHeight: 1.8, margin: 24, paginate: true,
  });
  const updateSetting = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const T   = THEMES[settings.theme];
  const fnt = FONTS[settings.fontIndex];

  // Auto-hide UI timer
  const uiTimerRef = useRef(null);
  const resetUiTimer = useCallback(() => {
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if (!showSettings && !showToc && !loreKey && !dictWord) {
      uiTimerRef.current = setTimeout(() => setShowUI(false), 4000);
    }
  }, [showSettings, showToc, loreKey, dictWord]);

  useEffect(() => {
    if (showUI) resetUiTimer();
    return () => { if (uiTimerRef.current) clearTimeout(uiTimerRef.current); };
  }, [showUI, resetUiTimer]);

  // ── Load custom Google fonts ─────────────────────────────────────────────
  useEffect(() => {
    const f = FONTS[settings.fontIndex];
    if (!f.import) return;
    const id = `font-${settings.fontIndex}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id   = id;
      link.rel  = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${f.import}&display=swap`;
      document.head.appendChild(link);
    }
  }, [settings.fontIndex]);

  // ── Build & mount epub.js ────────────────────────────────────────────────
  useEffect(() => {
    if (!viewerRef.current) return;
    setLoading(true);
    setError(null);

    const book = Epub(url);
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width:  "100%",
      height: "100%",
      flow:   settings.paginate ? "paginated" : "scrolled-doc",
      spread: "none",
    });
    renditionRef.current = rendition;

    // ── Apply reader theme / font into epub.js iframe ──────────────────
    const applyStyles = () => {
      if (!renditionRef.current) return;
      renditionRef.current.themes.register("custom", {
        body: {
          background:    `${T.bg} !important`,
          color:         `${T.text} !important`,
          "font-family": `${fnt.value} !important`,
          "font-size":   `${settings.fontSize}px !important`,
          "line-height": `${settings.lineHeight} !important`,
          padding:       `1rem ${settings.margin}px !important`,
          "text-align":  "justify",
          hyphens:       "auto",
        },
        "p, span, li, td, th, div": {
          color:         `${T.text} !important`,
          "font-family": `${fnt.value} !important`,
        },
        "h1,h2,h3,h4,h5,h6": {
          "font-family": "'Cinzel Decorative', serif !important",
          color:         `${C.gold} !important`,
        },
        a: { color: `${C.gold} !important` },
        ".lore-kw": {
          color:           `${C.gold} !important`,
          cursor:          "pointer !important",
          "border-bottom": `1px dotted ${C.gold}88 !important`,
        },
      });
      renditionRef.current.themes.select("custom");
    };

    // ── Inject lore keyword spans & word-selection bridge ─────────────
    rendition.hooks.content.register(contents => {
      const doc = contents.document;

      // Inject Cinzel Decorative font into iframe head
      const link = doc.createElement("link");
      link.rel  = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&display=swap";
      doc.head.appendChild(link);

      // Walk text nodes and wrap lore keywords
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      const nodesToReplace = [];
      let node;
      while ((node = walker.nextNode())) {
        if (KW_REGEX.test(node.textContent)) nodesToReplace.push(node);
      }
      KW_REGEX.lastIndex = 0;

      nodesToReplace.forEach(textNode => {
        const frag = doc.createDocumentFragment();
        const parts = textNode.textContent.split(KW_REGEX);
        parts.forEach(part => {
          const key = part.toLowerCase();
          if (LORE_DB[key]) {
            const span = doc.createElement("span");
            span.className    = "lore-kw";
            span.dataset.kw   = key;
            span.textContent  = part;
            span.style.cssText = `color:${C.gold};cursor:pointer;border-bottom:1px dotted ${C.gold}88;`;
            frag.appendChild(span);
          } else {
            frag.appendChild(doc.createTextNode(part));
          }
        });
        textNode.parentNode.replaceChild(frag, textNode);
        KW_REGEX.lastIndex = 0;
      });

      // ── Lore keyword click ───────────────────────────────────────────
      contents.on("click", e => {
        const kw = e.target?.dataset?.kw;
        if (kw && LORE_DB[kw]) {
          setLoreKey(kw);
          setShowUI(true);
        }
      });

      // ── Word-selection → dictionary ──────────────────────────────────
      doc.addEventListener("mouseup",  handleIframeSelection);
      doc.addEventListener("touchend", handleIframeSelection);
    });

    // ── Navigate to saved progress ────────────────────────────────────
    book.ready.then(() => book.loaded.navigation).then(nav => {
      const chapters = nav.toc || [];
      setToc(chapters);
    });

    book.ready.then(() => {
      applyStyles();
      if (initProgress && initProgress > 0) {
        return rendition.display(initProgress); // CFI string or fraction
      }
      return rendition.display();
    }).then(() => {
      setLoading(false);
    }).catch(e => {
      setError(e.message || "Failed to open EPUB");
      setLoading(false);
    });

    // ── Track location changes (progress) ────────────────────────────
    rendition.on("locationChanged", loc => {
      const cfi = loc?.start?.cfi || loc?.start;
      if (!cfi) return;
      setCurrentCfi(cfi);
      const pct = book.locations.percentageFromCfi(cfi) || 0;
      onProgress(pct);
      sb.upsert("reading_progress", {
        book_id: bookId,
        chapter_index: 0,       // epub.js doesn't use chapter index
        progress_pct: pct,
        cfi_position: cfi,
        last_read: new Date().toISOString(),
      });
    });

    // Pre-generate locations for accurate progress %
    book.ready.then(() => book.locations.generate(1024));

    return () => {
      book.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]); // re-init only when URL changes

  // ── Re-apply styles when settings change (no full reload) ───────────────
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    r.themes.register("custom", {
      body: {
        background:    `${T.bg} !important`,
        color:         `${T.text} !important`,
        "font-family": `${fnt.value} !important`,
        "font-size":   `${settings.fontSize}px !important`,
        "line-height": `${settings.lineHeight} !important`,
        padding:       `1rem ${settings.margin}px !important`,
      },
      "p, span, li, td": {
        color:         `${T.text} !important`,
        "font-family": `${fnt.value} !important`,
      },
      "h1,h2,h3,h4,h5,h6": {
        "font-family": "'Cinzel Decorative', serif !important",
        color:         `${C.gold} !important`,
      },
    });
    r.themes.select("custom");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.theme, settings.fontIndex, settings.fontSize,
      settings.lineHeight, settings.margin]);

  // ── Re-init flow when paginate mode switches ─────────────────────────────
  // epub.js doesn't support switching flow on the fly; easiest to re-render
  const prevPaginateRef = useRef(settings.paginate);
  useEffect(() => {
    if (prevPaginateRef.current === settings.paginate) return;
    prevPaginateRef.current = settings.paginate;
    const r = renditionRef.current;
    if (!r) return;
    r.flow(settings.paginate ? "paginated" : "scrolled-doc");
  }, [settings.paginate]);

  // ── Word selection inside epub.js iframe → dictionary ───────────────────
  const handleIframeSelection = useCallback(() => {
    // We need a small delay so the selection is committed
    setTimeout(() => {
      const r = renditionRef.current;
      if (!r) return;
      // epub.js exposes the iframe's window via manager
      const iframeWin = r.manager?.container?.querySelector("iframe")?.contentWindow;
      if (!iframeWin) return;
      const sel = iframeWin.getSelection();
      if (!sel || sel.isCollapsed) return;
      const word = sel.toString().trim().replace(/[^a-zA-Z'-]/g, "");
      if (word.length < 2 || word.includes(" ")) return;
      if (LORE_DB[word.toLowerCase()]) {
        setLoreKey(word.toLowerCase());
        sel.removeAllRanges();
        return;
      }
      setDictWord(word);
      sel.removeAllRanges();
    }, 50);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────
  const prevPage = () => { renditionRef.current?.prev(); setShowUI(true); };
  const nextPage = () => { renditionRef.current?.next(); setShowUI(true); };

  const goToHref = href => {
    renditionRef.current?.display(href);
    setShowToc(false);
    setShowUI(true);
  };

  // ── Touch swipe ──────────────────────────────────────────────────────────
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchMoved  = useRef(false);

  const onTouchStart = e => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchMoved.current  = false;
  };
  const onTouchMove = e => {
    if (Math.abs(e.touches[0].clientX - touchStartX.current) > 10)
      touchMoved.current = true;
  };
  const onTouchEnd = e => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(touchStartY.current - e.changedTouches[0].clientY);
    if (dy > 40) return;
    if (dx >  50) { nextPage(); return; }
    if (dx < -50) { prevPage(); return; }
    if (!touchMoved.current) {
      const x = e.changedTouches[0].clientX;
      const W = window.innerWidth;
      if (x < W * 0.25) { prevPage(); return; }
      if (x > W * 0.75) { nextPage(); return; }
      setShowUI(u => !u);
    }
  };

  // ── Loading / error screens ──────────────────────────────────────────────
  if (error) return (
    <div style={{ position:"fixed", inset:0, zIndex:600, background:THEMES.dark.bg,
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", gap:12, padding:32, textAlign:"center" }}>
      <div style={{ fontSize:48 }}>⚠</div>
      <div style={{ fontFamily:"'Cinzel',serif", fontSize:15, color:C.red }}>
        Could not open EPUB
      </div>
      <div style={{ color:C.muted, fontSize:12, maxWidth:300 }}>{error}</div>
      <div style={{ color:C.dim, fontSize:11, maxWidth:300 }}>
        DRM-protected files cannot be opened. Try a DRM-free copy.
      </div>
      <button onClick={onClose} style={{
        marginTop:8, background:"transparent", border:`1px solid ${C.gold}`,
        borderRadius:8, padding:"10px 24px", color:C.gold,
        fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2,
        cursor:"pointer", textTransform:"uppercase",
      }}>Back to Library</button>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, zIndex:600, background:T.bg,
      display:"flex", flexDirection:"column", transition:"background 0.3s" }}>

      {/* ── TOP BAR ── */}
      <div style={{
        flexShrink:0, height:52, background:T.ui,
        borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", padding:"0 12px", gap:8,
        transition:"opacity 0.3s, transform 0.3s",
        opacity: showUI ? 1 : 0,
        transform: showUI ? "translateY(0)" : "translateY(-100%)",
        pointerEvents: showUI ? "auto" : "none",
        position:"relative", zIndex:2,
      }}>
        <button onClick={onClose} style={{
          background:"transparent", border:`1px solid ${T.border}`,
          borderRadius:8, color:T.text, padding:"7px 14px", cursor:"pointer",
          fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:1, flexShrink:0,
        }}>← Back</button>
        <div style={{
          flex:1, fontFamily:"'Cinzel',serif", fontSize:11, color:T.muted,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        }}>{title}</div>
        <button onClick={() => { setShowToc(t => !t); setShowUI(true); }} style={{
          background: showToc ? `${C.gold}22` : "transparent",
          border: `1px solid ${showToc ? C.gold : T.border}`,
          borderRadius:6, color: showToc ? C.gold : T.muted,
          width:34, height:34, cursor:"pointer", fontSize:16,
        }}>≡</button>
        <button onClick={() => { setShowSettings(true); setShowUI(true); }} style={{
          background:"transparent", border:`1px solid ${T.border}`,
          borderRadius:6, color:T.muted, width:34, height:34, cursor:"pointer", fontSize:16,
        }}>⚙</button>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

        {/* TOC sidebar */}
        {showToc && (
          <div style={{
            width:220, flexShrink:0, background:T.ui,
            borderRight:`1px solid ${T.border}`,
            overflowY:"auto", position:"absolute", top:0, left:0, bottom:0, zIndex:3,
          }}>
            <div style={{
              fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim,
              letterSpacing:3, textTransform:"uppercase", padding:"14px 16px 10px",
            }}>Contents</div>
            {toc.map((ch, i) => (
              <button key={i} onClick={() => goToHref(ch.href)} style={{
                display:"block", width:"100%", textAlign:"left",
                background:"transparent", border:"none",
                borderLeft:`2px solid transparent`,
                padding:"10px 16px", color:T.muted, fontSize:12,
                cursor:"pointer", lineHeight:1.3,
              }}
                onMouseEnter={e => e.currentTarget.style.color = C.gold}
                onMouseLeave={e => e.currentTarget.style.color = T.muted}
              >{ch.label}</button>
            ))}
          </div>
        )}

        {/* epub.js renders here */}
        {loading && (
          <div style={{
            position:"absolute", inset:0, zIndex:4, background:T.bg,
            display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:20,
          }}>
            <div style={{ fontSize:52, animation:"spin 2s linear infinite" }}>⚙</div>
            <div style={{
              fontFamily:"'Cinzel',serif", fontSize:13,
              color:C.goldDim, letterSpacing:3,
            }}>Decrypting tome…</div>
            <div style={{ color:C.muted, fontSize:12, fontStyle:"italic" }}>
              Parsing EPUB chapters
            </div>
          </div>
        )}

        <div
          ref={viewerRef}
          style={{ flex:1, height:"100%", background:T.bg }}
        />

        {/* Tap zones for prev/next (paginated) */}
        {settings.paginate && !showToc && (
          <>
            <div style={{ position:"absolute", top:0, left:0, width:"20%", height:"100%", cursor:"w-resize" }}
              onClick={e => { e.stopPropagation(); prevPage(); }} />
            <div style={{ position:"absolute", top:0, right:0, width:"20%", height:"100%", cursor:"e-resize" }}
              onClick={e => { e.stopPropagation(); nextPage(); }} />
          </>
        )}
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{
        flexShrink:0, background:T.ui, borderTop:`1px solid ${T.border}`,
        height:56, display:"flex", alignItems:"center",
        justifyContent:"space-between", padding:"0 16px",
        transition:"opacity 0.3s, transform 0.3s",
        opacity: showUI ? 1 : 0,
        transform: showUI ? "translateY(0)" : "translateY(100%)",
        pointerEvents: showUI ? "auto" : "none",
      }}>
        <button onClick={prevPage} style={{
          background:"transparent", border:`1px solid ${T.border}`,
          borderRadius:8, color:T.text, padding:"8px 18px", cursor:"pointer",
          fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
        }}>← Prev</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:T.muted }}>
            ✨ Tap gold words for lore
          </div>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim }}>
            Select any word for dictionary
          </div>
        </div>
        <button onClick={nextPage} style={{
          background:"transparent", border:`1px solid ${T.border}`,
          borderRadius:8, color:T.text, padding:"8px 18px", cursor:"pointer",
          fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1,
        }}>Next →</button>
      </div>

      {/* ── OVERLAYS ── */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={updateSetting}
          onClose={() => setShowSettings(false)}
        />
      )}
      {loreKey && (
        <LorePanel
          kwKey={loreKey}
          onClose={() => setLoreKey(null)}
          theme={settings.theme}
        />
      )}
      {dictWord && (
        <DictionaryPanel
          word={dictWord}
          onClose={() => setDictWord(null)}
          theme={settings.theme}
        />
      )}

      {/* ── GLOBAL STYLES (spin animation, slideUp, etc.) ── */}
      <style>{`
        @keyframes spin     { to { transform: rotate(360deg); } }
        @keyframes slideUp  { from { transform: translateY(30px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        @keyframes slideLeft{ from { transform: translateX(40px); opacity:0; } to { transform: translateX(0); opacity:1; } }
      `}</style>
    </div>
  );
}
