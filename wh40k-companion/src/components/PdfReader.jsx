import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { C } from "../data/constants";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PDFJS   = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

// ── pdfjs loader ─────────────────────────────────────────────────────────────
let _pdfPromise = null;
function getPdfJs() {
  if (_pdfPromise) return _pdfPromise;
  _pdfPromise = new Promise((ok, fail) => {
    if (window.pdfjsLib) { ok(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`; ok(window.pdfjsLib); };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return _pdfPromise;
}

// ── progress ─────────────────────────────────────────────────────────────────
async function saveProgress(userId, bookId, page, total) {
  if (!userId || !bookId) return;
  try {
    const pct = total > 1 ? Math.round(((page - 1) / (total - 1)) * 100) : 100;
    localStorage.setItem(`wh40k_prog_${userId}_${bookId}`, JSON.stringify({ page_index: page, progress_pct: pct }));
    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token ?? SB_KEY;
    await fetch(`${SB_URL}/rest/v1/reading_progress?on_conflict=user_id,book_id`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: userId, book_id: bookId, page_index: page, progress_pct: pct, last_read: new Date().toISOString() }),
    });
  } catch {}
}

// ── bookmarks ─────────────────────────────────────────────────────────────────
function bmKey(userId, bookId) { return `wh40k_bm_${userId || "anon"}_${bookId}`; }
function loadBookmarks(userId, bookId) {
  try { return JSON.parse(localStorage.getItem(bmKey(userId, bookId)) || "[]"); } catch { return []; }
}
function persistBookmarks(userId, bookId, bms) {
  localStorage.setItem(bmKey(userId, bookId), JSON.stringify(bms));
}

// ── viewport lock ─────────────────────────────────────────────────────────────
function useViewport() {
  useEffect(() => {
    const meta = document.querySelector("meta[name=viewport]");
    if (!meta) return;
    const prev = meta.content;
    meta.content = "width=device-width,initial-scale=1,user-scalable=no";
    return () => { meta.content = prev; };
  }, []);
}

// ── canvas render helper ──────────────────────────────────────────────────────
async function renderPage(doc, pageNum, canvas, containerW, containerH, zoom, taskRef) {
  if (!doc || !canvas || pageNum < 1 || pageNum > doc.numPages) return;
  if (taskRef?.current) { try { taskRef.current.cancel(); } catch {} taskRef.current = null; }
  const pg  = await doc.getPage(pageNum);
  const vp0 = pg.getViewport({ scale: 1 });
  const scaleW = containerW / vp0.width;
  const scaleH = containerH / vp0.height;
  const base   = Math.min(scaleW, scaleH);
  const scale  = base * zoom;
  const vp     = pg.getViewport({ scale });
  const dpr    = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(vp.width  * dpr);
  canvas.height = Math.floor(vp.height * dpr);
  canvas.style.width  = `${vp.width}px`;
  canvas.style.height = `${vp.height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const task = pg.render({ canvasContext: ctx, viewport: vp });
  if (taskRef) taskRef.current = task;
  await task.promise;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PdfReader({ url, title, bookId, userId, onClose }) {
  useViewport();

  const initPage = (() => {
    try { return Math.max(1, JSON.parse(localStorage.getItem(`wh40k_prog_${userId}_${bookId}`) || "{}").page_index || 1); }
    catch { return 1; }
  })();

  // ── state ─────────────────────────────────────────────────────────────────
  const [doc,          setDoc]         = useState(null);
  const [total,        setTotal]       = useState(0);
  const [page,         setPage]        = useState(initPage);
  const [zoom,         setZoom]        = useState(1.0);
  const [viewMode,     setViewMode]    = useState("single"); // "single"|"dual"|"scroll"
  const [err,          setErr]         = useState(null);
  const [rendering,    setRendering]   = useState(false);
  const [showNav,      setShowNav]     = useState(true);
  const [bookmarks,    setBookmarks]   = useState(() => loadBookmarks(userId, bookId));
  const [showBm,       setShowBm]      = useState(false);

  // ── refs ─────────────────────────────────────────────────────────────────
  const canvasRef    = useRef(null);  // single / dual left
  const canvas2Ref   = useRef(null);  // dual right
  const wrapRef      = useRef(null);
  const scrollRef    = useRef(null);
  const taskRef      = useRef(null);
  const task2Ref     = useRef(null);
  const saveTimer    = useRef(null);
  const navTimer     = useRef(null);
  const touchX       = useRef(null);
  const pinchRef     = useRef(null);   // { dist, zoom } for pinch-to-zoom
  const zoomRef      = useRef(zoom);
  const scrollPages  = useRef([]);    // array of {canvas, pageNum} for scroll mode
  const observerRef  = useRef(null);
  const isDesktop    = useRef(window.matchMedia("(pointer:fine)").matches).current;

  // ── load PDF ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setErr(null); setDoc(null); setTotal(0);
    getPdfJs()
      .then(lib => lib.getDocument({ url, withCredentials: false }).promise)
      .then(d => { if (!cancelled) { setDoc(d); setTotal(d.numPages); } })
      .catch(e => { if (!cancelled) setErr(e?.message || "Could not load PDF"); });
    return () => { cancelled = true; };
  }, [url]);

  // ── auto-hide nav ─────────────────────────────────────────────────────────
  const bumpNav = useCallback(() => {
    if (isDesktop) return;
    setShowNav(true);
    clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => setShowNav(false), 3500);
  }, [isDesktop]);

  useEffect(() => { if (!isDesktop) bumpNav(); }, [bumpNav, isDesktop]);

  // ── navigation ────────────────────────────────────────────────────────────
  const goTo = useCallback((n, skipSave) => {
    if (!total) return;
    const step  = viewMode === "dual" ? (n % 2 === 0 ? n - 1 : n) : n;
    const clamped = Math.min(Math.max(step, 1), total);
    setPage(clamped);
    bumpNav();
    if (skipSave) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProgress(userId, bookId, clamped, total), 1200);
  }, [total, viewMode, userId, bookId, bumpNav]);

  // ── render single / dual pages ────────────────────────────────────────────
  useEffect(() => {
    if (!doc || viewMode === "scroll") return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const W = wrap.clientWidth  - (viewMode === "dual" ? 32 : 24);
    const H = wrap.clientHeight - 24;
    const colW = viewMode === "dual" ? Math.floor(W / 2) - 4 : W;

    setRendering(true);
    const p1 = renderPage(doc, page, canvasRef.current, colW, H, zoom, taskRef)
      .catch(() => {});
    const p2 = viewMode === "dual" && page + 1 <= total
      ? renderPage(doc, page + 1, canvas2Ref.current, colW, H, zoom, task2Ref).catch(() => {})
      : Promise.resolve();
    Promise.all([p1, p2]).finally(() => setRendering(false));
  }, [doc, page, zoom, viewMode, total]);

  // ── scroll mode: build page list + lazy render ────────────────────────────
  useEffect(() => {
    if (viewMode !== "scroll" || !doc || !scrollRef.current) return;
    const container = scrollRef.current;
    container.innerHTML = "";
    scrollPages.current = [];
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const item = scrollPages.current.find(p => p.wrapper === entry.target);
        if (!item || item.rendered) return;
        item.rendered = true;
        const canvas = document.createElement("canvas");
        canvas.style.display = "block";
        canvas.style.margin = "0 auto";
        canvas.style.borderRadius = "2px";
        canvas.style.boxShadow = "0 4px 24px rgba(0,0,0,0.7)";
        item.wrapper.appendChild(canvas);
        const W = container.clientWidth - 32;
        const H = container.clientHeight - 32;
        renderPage(doc, item.pageNum, canvas, W, H, zoom, null).catch(() => {});
      });
    }, { root: container, rootMargin: "200px 0px" });

    for (let i = 1; i <= doc.numPages; i++) {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = `margin: 12px auto; max-width: calc(100% - 24px); min-height: 200px; display: flex; align-items: center; justify-content: center;`;
      wrapper.dataset.page = i;
      container.appendChild(wrapper);
      const item = { wrapper, pageNum: i, rendered: false };
      scrollPages.current.push(item);
      observerRef.current.observe(wrapper);
    }

    // Scroll to saved page
    const target = scrollPages.current[initPage - 1];
    if (target) target.wrapper.scrollIntoView({ block: "start" });

    // Track current page via scroll
    const onScroll = () => {
      const mid = container.scrollTop + container.clientHeight / 2;
      for (const item of scrollPages.current) {
        const t = item.wrapper.offsetTop;
        const b = t + item.wrapper.offsetHeight;
        if (mid >= t && mid < b) {
          const p = item.pageNum;
          setPage(p);
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => saveProgress(userId, bookId, p, doc.numPages), 1500);
          break;
        }
      }
      bumpNav();
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [viewMode, doc, zoom, userId, bookId, bumpNav, initPage]);

  // ── keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (viewMode === "scroll") return;
      const step = viewMode === "dual" ? 2 : 1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown")  goTo(page + step);
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")    goTo(page - step);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [page, viewMode, goTo, onClose]);

  // ── keep zoomRef in sync ──────────────────────────────────────────────────
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // ── touch: swipe (1 finger) + pinch-to-zoom (2 fingers) ──────────────────
  // Native non-passive listeners so we can call preventDefault during pinch.
  useEffect(() => {
    const el = viewMode === "scroll" ? scrollRef.current : wrapRef.current;
    if (!el) return;

    const pinchDist = (t) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onStart = (e) => {
      bumpNav();
      if (e.touches.length === 2) {
        pinchRef.current = { dist: pinchDist(e.touches), zoom: zoomRef.current };
        touchX.current = null;
        e.preventDefault();
      } else {
        pinchRef.current = null;
        // When zoomed in, let the browser handle native pan scrolling
        touchX.current = zoomRef.current <= 1.0 ? e.touches[0].clientX : null;
      }
    };

    const onMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        const ratio   = pinchDist(e.touches) / pinchRef.current.dist;
        const newZoom = Math.min(4, Math.max(0.5, Math.round(pinchRef.current.zoom * ratio * 100) / 100));
        setZoom(newZoom);
        e.preventDefault();
      }
    };

    const onEnd = (e) => {
      if (pinchRef.current) { pinchRef.current = null; touchX.current = null; return; }
      if (touchX.current === null || viewMode === "scroll") return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      touchX.current = null;
      const step = viewMode === "dual" ? 2 : 1;
      if (Math.abs(dx) > 40) goTo(page + (dx < 0 ? step : -step));
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove",  onMove,  { passive: false });
    el.addEventListener("touchend",   onEnd,   { passive: true  });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove",  onMove);
      el.removeEventListener("touchend",   onEnd);
    };
  }, [viewMode, doc, page, goTo, bumpNav]);

  // ── bookmarks ─────────────────────────────────────────────────────────────
  const isBookmarked = bookmarks.some(b => b.page === page);
  const toggleBookmark = () => {
    const next = isBookmarked
      ? bookmarks.filter(b => b.page !== page)
      : [...bookmarks, { page, addedAt: new Date().toISOString() }].sort((a, b) => a.page - b.page);
    setBookmarks(next);
    persistBookmarks(userId, bookId, next);
  };

  // ── toolbar button helper ─────────────────────────────────────────────────
  const Btn = ({ label, onClick, active, disabled, title: tip }) => (
    <button
      title={tip} disabled={disabled} onClick={onClick}
      style={{
        background: active ? "rgba(201,168,76,0.18)" : "transparent",
        border: active ? `1px solid ${C.gold}44` : "1px solid transparent",
        borderRadius: 6, cursor: disabled ? "default" : "pointer",
        color: disabled ? C.dim : active ? C.gold : C.text,
        fontSize: 14, padding: "4px 8px", lineHeight: 1,
        opacity: disabled ? 0.35 : 1, transition: "background 0.15s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = active ? "rgba(201,168,76,0.25)" : "rgba(201,168,76,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(201,168,76,0.18)" : "transparent"; }}
    >{label}</button>
  );

  const navVisible = isDesktop || showNav;
  const step = viewMode === "dual" ? 2 : 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "#0a0905", display: "flex", flexDirection: "column", userSelect: "none" }}
      onClick={bumpNav}
    >

      {/* ── Header ── */}
      <div style={{
        flexShrink: 0, height: 48, background: "#111009", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", padding: "0 6px", gap: 4, zIndex: 20,
        opacity: navVisible ? 1 : 0, transition: "opacity 0.3s",
        pointerEvents: navVisible ? "auto" : "none",
      }}>

        <button onClick={onClose} style={{
          background: "transparent", border: `1px solid ${C.dim}`, borderRadius: 8,
          color: C.gold, padding: "5px 10px", cursor: "pointer",
          fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, flexShrink: 0,
        }}>← Back</button>

        <div style={{ flex: 1, fontFamily: "'Cinzel',serif", fontSize: 10, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px" }}>
          {title}
        </div>

        {/* Page counter + nav arrows (hidden in scroll mode) */}
        {viewMode !== "scroll" && total > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <Btn label="‹" onClick={() => goTo(page - step)} disabled={page <= 1} />
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted, minWidth: 54, textAlign: "center" }}>
              {viewMode === "dual" ? `${page}–${Math.min(page + 1, total)}` : page} / {total}
            </span>
            <Btn label="›" onClick={() => goTo(page + step)} disabled={page + step - 1 >= total} />
          </div>
        )}

        {/* Scroll page indicator */}
        {viewMode === "scroll" && total > 0 && (
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted, flexShrink: 0 }}>
            {page} / {total}
          </span>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />

        {/* View mode toggles */}
        <Btn label="▯"    onClick={() => setViewMode("single")} active={viewMode === "single"} title="Single page" />
        <Btn label="▯▯"   onClick={() => setViewMode("dual")}   active={viewMode === "dual"}   title="Dual page" />
        <Btn label="≡"    onClick={() => setViewMode("scroll")} active={viewMode === "scroll"} title="Scroll" />

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />

        {/* Bookmark */}
        <Btn label="🔖" onClick={(e) => { e.stopPropagation(); setShowBm(v => !v); }} active={showBm} title="Bookmarks" />
        <Btn label={isBookmarked ? "★" : "☆"} onClick={(e) => { e.stopPropagation(); toggleBookmark(); }}
             active={isBookmarked} title={isBookmarked ? "Remove bookmark" : "Add bookmark"} />

        {/* Zoom (hidden in scroll) */}
        {viewMode !== "scroll" && (
          <>
            <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />
            <Btn label="−" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.5} />
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.dim, minWidth: 28, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
            <Btn label="+" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} disabled={zoom >= 4} />
            <Btn label="⊡" onClick={() => setZoom(1)} title="Reset zoom" />
          </>
        )}

        <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.red, letterSpacing: 2,
                       border: `1px solid ${C.red}55`, borderRadius: 4, padding: "2px 5px", flexShrink: 0 }}>
          PDF
        </span>
      </div>

      {/* ── Bookmarks panel ── */}
      {showBm && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "absolute", top: 48, right: 0, width: 220, maxHeight: "60vh",
          background: "#111009", border: `1px solid ${C.border}`, borderTop: "none",
          zIndex: 30, overflowY: "auto", display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "10px 12px 6px", fontFamily: "'Cinzel',serif", fontSize: 10,
                        color: C.goldDim, letterSpacing: 2, borderBottom: `1px solid ${C.border}` }}>
            BOOKMARKS
          </div>
          {bookmarks.length === 0 ? (
            <div style={{ padding: 16, fontFamily: "'Cinzel',serif", fontSize: 10, color: C.dim, textAlign: "center" }}>
              No bookmarks yet.<br />Press ☆ to add one.
            </div>
          ) : bookmarks.map(bm => (
            <button key={bm.page} onClick={() => { goTo(bm.page, true); setShowBm(false); }} style={{
              background: bm.page === page ? "rgba(201,168,76,0.1)" : "transparent",
              border: "none", borderBottom: `1px solid ${C.border}22`, cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 12px", color: bm.page === page ? C.gold : C.text,
              fontFamily: "'Cinzel',serif", fontSize: 10,
            }}>
              <span>Page {bm.page}</span>
              <span style={{ fontSize: 8, color: C.dim }}>
                {new Date(bm.addedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

        {/* Single / Dual mode canvas area */}
        {viewMode !== "scroll" && (
          <div ref={wrapRef}
            style={{ width: "100%", height: "100%", overflow: "auto", background: "#1a1814",
                     display: "flex", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}
          >
            {err ? (
              <div style={{ margin: "auto", color: C.red, fontFamily: "'Cinzel',serif", fontSize: 13, textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✕</div>
                <div>Failed to load PDF</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>{err}</div>
              </div>
            ) : !doc ? (
              <div style={{ margin: "auto", color: C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 2 }}>Loading…</div>
            ) : (
              <div style={{ margin: "auto", padding: 12, display: "flex", gap: 8, flexShrink: 0 }}>
                <canvas ref={canvasRef} style={{ display: "block", borderRadius: 2, boxShadow: "0 8px 40px rgba(0,0,0,0.8)", opacity: rendering ? 0.6 : 1, transition: "opacity 0.15s" }} />
                {viewMode === "dual" && page + 1 <= total && (
                  <canvas ref={canvas2Ref} style={{ display: "block", borderRadius: 2, boxShadow: "0 8px 40px rgba(0,0,0,0.8)", opacity: rendering ? 0.6 : 1, transition: "opacity 0.15s" }} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Scroll mode */}
        {viewMode === "scroll" && (
          <div ref={scrollRef}
            style={{ width: "100%", height: "100%", overflowY: "auto", background: "#1a1814",
                     scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}
          >
            {err && (
              <div style={{ color: C.red, fontFamily: "'Cinzel',serif", fontSize: 13, textAlign: "center", padding: 40 }}>
                Failed to load PDF: {err}
              </div>
            )}
            {!doc && !err && (
              <div style={{ color: C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 2, textAlign: "center", padding: 40 }}>
                Loading…
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile bottom nav (single/dual) ── */}
      {!isDesktop && viewMode !== "scroll" && total > 0 && (
        <div style={{
          flexShrink: 0, height: 48, background: "#111009", borderTop: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px",
          opacity: navVisible ? 1 : 0, transition: "opacity 0.3s",
          pointerEvents: navVisible ? "auto" : "none",
        }}>
          <button onClick={() => goTo(page - step)} disabled={page <= 1} style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
            color: page <= 1 ? C.dim : C.gold, padding: "8px 18px", cursor: page <= 1 ? "default" : "pointer",
            fontFamily: "'Cinzel',serif", fontSize: 12, opacity: page <= 1 ? 0.3 : 1,
          }}>‹ Prev</button>
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted }}>
            {viewMode === "dual" ? `${page}–${Math.min(page + 1, total)}` : page} / {total}
          </span>
          <button onClick={() => goTo(page + step)} disabled={page + step - 1 >= total} style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
            color: page + step - 1 >= total ? C.dim : C.gold, padding: "8px 18px",
            cursor: page + step - 1 >= total ? "default" : "pointer",
            fontFamily: "'Cinzel',serif", fontSize: 12, opacity: page + step - 1 >= total ? 0.3 : 1,
          }}>Next ›</button>
        </div>
      )}
    </div>
  );
}
