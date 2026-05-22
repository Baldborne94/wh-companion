import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { C } from "../data/constants";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PDFJS   = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

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

async function saveProgress(userId, bookId, page, total) {
  if (!userId || !bookId) return;
  try {
    const pct = total > 1 ? Math.round(((page - 1) / (total - 1)) * 100) : 100;
    const key = `wh40k_prog_${userId}_${bookId}`;
    localStorage.setItem(key, JSON.stringify({ page_index: page, progress_pct: pct }));
    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token ?? SB_KEY;
    await fetch(`${SB_URL}/rest/v1/reading_progress?on_conflict=user_id,book_id`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: userId, book_id: bookId, page_index: page, progress_pct: pct, last_read: new Date().toISOString() }),
    });
  } catch {}
}

function useViewport(active) {
  useEffect(() => {
    if (!active) return;
    const meta = document.querySelector("meta[name=viewport]");
    if (!meta) return;
    const prev = meta.content;
    meta.content = "width=device-width,initial-scale=1,user-scalable=no";
    return () => { meta.content = prev; };
  }, [active]);
}

export default function PdfReader({ url, title, bookId, userId, onClose }) {
  useViewport(true);

  const initPage = (() => {
    try {
      const p = JSON.parse(localStorage.getItem(`wh40k_prog_${userId}_${bookId}`) || "{}");
      return Math.max(1, p.page_index || 1);
    } catch { return 1; }
  })();

  const [doc,         setDoc]         = useState(null);
  const [page,        setPage]        = useState(initPage);
  const [total,       setTotal]       = useState(0);
  const [zoom,        setZoom]        = useState(1.0); // multiplier on top of fit-width
  const [err,         setErr]         = useState(null);
  const [rendering,   setRendering]   = useState(false);
  const [showNav,     setShowNav]     = useState(true);

  const canvasRef   = useRef(null);
  const wrapRef     = useRef(null);
  const taskRef     = useRef(null);
  const saveTimer   = useRef(null);
  const navTimer    = useRef(null);
  const touchX      = useRef(null);
  const isDesktop   = useRef(window.matchMedia("(pointer:fine)").matches).current;

  // ── Load PDF document ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setErr(null); setDoc(null); setTotal(0);
    getPdfJs()
      .then(lib => lib.getDocument({ url, withCredentials: false }).promise)
      .then(d => { if (!cancelled) { setDoc(d); setTotal(d.numPages); } })
      .catch(e => { if (!cancelled) setErr(e?.message || "Could not load PDF"); });
    return () => { cancelled = true; };
  }, [url]);

  // ── Render current page ────────────────────────────────────────────────────
  useEffect(() => {
    if (!doc || !canvasRef.current || !wrapRef.current) return;
    if (taskRef.current) { try { taskRef.current.cancel(); } catch {} taskRef.current = null; }

    let cancelled = false;
    setRendering(true);

    (async () => {
      try {
        const pg   = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        const wrap  = wrapRef.current;
        const availW = wrap.clientWidth  - 24;
        const availH = wrap.clientHeight - 24;
        const vp0   = pg.getViewport({ scale: 1 });
        const scaleW = availW  / vp0.width;
        const scaleH = availH  / vp0.height;
        const base   = Math.min(scaleW, scaleH);
        const scale  = base * zoom;
        const vp     = pg.getViewport({ scale });
        const dpr    = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        canvas.width  = Math.floor(vp.width  * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width  = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        const task = pg.render({ canvasContext: ctx, viewport: vp });
        taskRef.current = task;
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (e) {
        if (!cancelled && e?.name !== "RenderingCancelledException") setRendering(false);
      }
    })();

    return () => { cancelled = true; };
  }, [doc, page, zoom]);

  // ── Auto-hide nav on mobile ────────────────────────────────────────────────
  const bumpNav = useCallback(() => {
    if (isDesktop) return;
    setShowNav(true);
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => setShowNav(false), 3500);
  }, [isDesktop]);

  useEffect(() => { if (!isDesktop) bumpNav(); }, [bumpNav, isDesktop]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goTo = useCallback((n) => {
    if (!doc) return;
    const clamped = Math.min(Math.max(n, 1), doc.numPages);
    setPage(clamped);
    bumpNav();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProgress(userId, bookId, clamped, doc.numPages), 1200);
  }, [doc, userId, bookId, bumpNav]);

  // ── Touch swipe ────────────────────────────────────────────────────────────
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; bumpNav(); };
  const onTouchEnd   = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) goTo(page + (dx < 0 ? 1 : -1));
  };

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown")  { goTo(page + 1); }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")    { goTo(page - 1); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [page, goTo, onClose]);

  const btn = (label, action, disabled) => (
    <button disabled={disabled} onClick={action} style={{
      background: "transparent", border: "none", cursor: disabled ? "default" : "pointer",
      color: disabled ? C.dim : C.gold, fontSize: 18, lineHeight: 1,
      padding: "6px 10px", borderRadius: 6, opacity: disabled ? 0.3 : 1,
      transition: "background 0.15s",
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "rgba(201,168,76,0.12)"; }}
    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >{label}</button>
  );

  const navVisible = isDesktop || showNav;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 600, background: "#0a0905",
               display: "flex", flexDirection: "column", userSelect: "none" }}
      onClick={bumpNav}
    >
      {/* ── Header ── */}
      <div style={{
        flexShrink: 0, height: 48, background: "#111009",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", padding: "0 8px", gap: 6,
        zIndex: 10,
        opacity: navVisible ? 1 : 0, transition: "opacity 0.3s",
        pointerEvents: navVisible ? "auto" : "none",
      }}>
        <button onClick={onClose} style={{
          background: "transparent", border: `1px solid ${C.dim}`, borderRadius: 8,
          color: C.gold, padding: "5px 12px", cursor: "pointer",
          fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 1, flexShrink: 0,
        }}>← Back</button>

        <div style={{ flex: 1, fontFamily: "'Cinzel',serif", fontSize: 11, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px" }}>
          {title}
        </div>

        {/* Page navigator */}
        {total > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {btn("‹", () => goTo(page - 1), page <= 1)}
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.muted,
                           minWidth: 52, textAlign: "center" }}>
              {page} / {total}
            </span>
            {btn("›", () => goTo(page + 1), page >= total)}
          </div>
        )}

        {/* Zoom controls */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {btn("−", () => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2))), zoom <= 0.5)}
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.dim, minWidth: 32, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          {btn("+", () => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2))), zoom >= 4)}
          {btn("⊡", () => setZoom(1.0), false)}
        </div>

        <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.red, letterSpacing: 2,
                       border: `1px solid ${C.red}55`, borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>
          PDF
        </span>
      </div>

      {/* ── Canvas area ── */}
      <div ref={wrapRef}
        style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center",
                 justifyContent: "center", background: "#1a1814",
                 scrollbarWidth: "thin", scrollbarColor: "#2a2518 transparent" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {err ? (
          <div style={{ color: C.red, fontFamily: "'Cinzel',serif", fontSize: 13,
                        textAlign: "center", padding: 32, maxWidth: 400 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✕</div>
            <div>Failed to load PDF</div>
            <div style={{ fontSize: 10, color: C.dim, marginTop: 8, wordBreak: "break-all" }}>{err}</div>
          </div>
        ) : !doc ? (
          <div style={{ color: C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 2 }}>
            Loading…
          </div>
        ) : (
          <div style={{ position: "relative", lineHeight: 0 }}>
            <canvas ref={canvasRef} style={{
              display: "block", borderRadius: 2,
              boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
              opacity: rendering ? 0.5 : 1, transition: "opacity 0.15s",
            }} />
          </div>
        )}
      </div>

      {/* ── Footer prev/next (mobile tap zones) ── */}
      {!isDesktop && total > 0 && (
        <div style={{
          flexShrink: 0, height: 48, background: "#111009", borderTop: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px",
          opacity: navVisible ? 1 : 0, transition: "opacity 0.3s",
          pointerEvents: navVisible ? "auto" : "none",
        }}>
          <button onClick={() => goTo(page - 1)} disabled={page <= 1} style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
            color: page <= 1 ? C.dim : C.gold, padding: "8px 20px", cursor: page <= 1 ? "default" : "pointer",
            fontFamily: "'Cinzel',serif", fontSize: 13, opacity: page <= 1 ? 0.3 : 1,
          }}>‹ Prev</button>

          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.muted }}>
            {page} / {total}
          </span>

          <button onClick={() => goTo(page + 1)} disabled={page >= total} style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
            color: page >= total ? C.dim : C.gold, padding: "8px 20px", cursor: page >= total ? "default" : "pointer",
            fontFamily: "'Cinzel',serif", fontSize: 13, opacity: page >= total ? 0.3 : 1,
          }}>Next ›</button>
        </div>
      )}
    </div>
  );
}
