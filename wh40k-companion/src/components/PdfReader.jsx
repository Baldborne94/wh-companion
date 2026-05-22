import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { C } from "../data/constants";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
let _pdfjsPromise = null;

function loadPdfJs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = `${PDFJS_CDN}/pdf.min.js`;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}

async function saveProgressToDb(userId, bookId, page, total) {
  if (!userId || !bookId) return;
  try {
    const pct = total > 1 ? Math.round((page / (total - 1)) * 100) : 0;
    const key = `wh40k_prog_${userId}_${bookId}`;
    const ex = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...ex, page_index: page, progress_pct: pct, bookmarkedAt: new Date().toISOString() }));
    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token ?? SB_KEY;
    const headers = { apikey: SB_KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" };
    await fetch(`${SB_URL}/rest/v1/reading_progress?on_conflict=user_id,book_id`, {
      method: "POST", headers,
      body: JSON.stringify({ user_id: userId, book_id: bookId, page_index: page, progress_pct: pct, last_read: new Date().toISOString() }),
    });
  } catch {}
}

function useReaderViewport() {
  useEffect(() => {
    const meta = document.querySelector("meta[name=viewport]");
    if (!meta) return;
    const prev = meta.content;
    meta.content = "width=device-width,initial-scale=1,user-scalable=no";
    return () => { meta.content = prev; };
  }, []);
}

export default function PdfReader({ url, title, bookId, userId, onClose }) {
  useReaderViewport();

  const isDesktop = useRef(typeof window !== "undefined" && !window.matchMedia("(pointer:coarse)").matches).current;

  const [pdfDoc, setPdfDoc]           = useState(null);
  const [pageNum, setPageNum]         = useState(() => {
    if (userId && bookId) {
      try {
        const p = JSON.parse(localStorage.getItem(`wh40k_prog_${userId}_${bookId}`) || "{}");
        return Math.max(1, p.page_index || 1);
      } catch {}
    }
    return 1;
  });
  const [totalPages, setTotalPages]   = useState(0);
  const [loading, setLoading]         = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [err, setErr]                 = useState(null);
  const [showUI, setShowUI]           = useState(true);
  const [zoomMode, setZoomMode]       = useState("width"); // "width" | "page"
  const [twoPage, setTwoPage]         = useState(() => typeof window !== "undefined" && window.innerWidth >= 900);
  const [showPageInput, setShowPageInput] = useState(false);
  const [pageInputVal, setPageInputVal]   = useState("");

  const canvasRef      = useRef(null);
  const canvasRef2     = useRef(null);
  const containerRef   = useRef(null);
  const renderTask1    = useRef(null);
  const renderTask2    = useRef(null);
  const hideUITimer    = useRef(null);
  const saveTimer      = useRef(null);

  const revealUI = useCallback(() => {
    setShowUI(true);
    if (isDesktop) return;
    if (hideUITimer.current) clearTimeout(hideUITimer.current);
    hideUITimer.current = setTimeout(() => setShowUI(false), 4500);
  }, [isDesktop]);

  // Load PDF.js + document
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    loadPdfJs()
      .then(lib => lib.getDocument({ url, withCredentials: false }).promise)
      .then(doc => {
        if (cancelled) return;
        setPdfDoc(doc); setTotalPages(doc.numPages); setLoading(false);
      })
      .catch(e => { if (!cancelled) { setErr("Failed to load PDF: " + e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url]);

  // Render a page onto a canvas element
  const renderOnCanvas = useCallback(async (doc, num, canvas, taskRef) => {
    if (!doc || !canvas || num < 1 || num > doc.numPages) return;
    if (taskRef.current) { try { taskRef.current.cancel(); } catch {} taskRef.current = null; }
    const page = await doc.getPage(num);
    const container = containerRef.current;
    const availW = container ? container.clientWidth : window.innerWidth;
    const availH = container ? container.clientHeight - 24 : window.innerHeight - 128;
    const cols = twoPage && doc.numPages > 1 ? 2 : 1;
    const colW = Math.floor(availW / cols) - (cols === 2 ? 12 : 24);
    const vp0  = page.getViewport({ scale: 1 });
    let scale = colW / vp0.width;
    if (zoomMode === "page") scale = Math.min(scale, availH / vp0.height);
    scale = Math.min(Math.max(scale, 0.25), 3.5);
    const vp  = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    canvas.width        = Math.round(vp.width  * dpr);
    canvas.height       = Math.round(vp.height * dpr);
    canvas.style.width  = vp.width  + "px";
    canvas.style.height = vp.height + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const task = page.render({ canvasContext: ctx, viewport: vp });
    taskRef.current = task;
    return task.promise.catch(e => { if (e.name !== "RenderingCancelledException") console.error(e); });
  }, [twoPage, zoomMode]);

  // Render current page(s) whenever they change
  useEffect(() => {
    if (!pdfDoc) return;
    setPageLoading(true);
    const p2num = twoPage && pageNum + 1 <= totalPages ? pageNum + 1 : null;
    const tasks = [renderOnCanvas(pdfDoc, pageNum, canvasRef.current, renderTask1)];
    if (p2num) tasks.push(renderOnCanvas(pdfDoc, p2num, canvasRef2.current, renderTask2));
    Promise.allSettled(tasks).finally(() => setPageLoading(false));
  }, [pdfDoc, pageNum, twoPage, zoomMode, renderOnCanvas, totalPages]);

  // Save progress (debounced 1.5 s)
  useEffect(() => {
    if (!pdfDoc || totalPages < 1) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProgressToDb(userId, bookId, pageNum, totalPages), 1500);
  }, [pageNum, pdfDoc, totalPages, userId, bookId]);

  // Keyboard navigation
  useEffect(() => {
    const handler = e => {
      if (showPageInput) {
        if (e.key === "Escape") { setShowPageInput(false); setPageInputVal(""); }
        return;
      }
      const step = twoPage ? 2 : 1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault(); setPageNum(p => Math.min(totalPages, p + step));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault(); setPageNum(p => Math.max(1, p - step));
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [totalPages, onClose, twoPage, showPageInput]);

  // Resize: update twoPage
  useEffect(() => {
    const onResize = () => setTwoPage(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const step = twoPage ? 2 : 1;
  const prev = useCallback(() => setPageNum(p => Math.max(1, p - step)), [step]);
  const next = useCallback(() => setPageNum(p => Math.min(totalPages, p + step)), [step, totalPages]);

  const handleTap = useCallback(e => {
    if (e.target.closest("button,input,form")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const w = rect.width;
    if (relX < w * 0.25) { prev(); return; }
    if (relX > w * 0.75) { next(); return; }
    revealUI();
  }, [prev, next, revealUI]);

  const handleJumpSubmit = e => {
    e.preventDefault();
    const n = parseInt(pageInputVal, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      // in two-page mode snap to odd pages (left page)
      setPageNum(twoPage && n % 2 === 0 ? n - 1 : n);
    }
    setPageInputVal("");
    setShowPageInput(false);
  };

  const pct = totalPages > 0 ? Math.round((pageNum / totalPages) * 100) : 0;
  const uiVisible = isDesktop || showUI;
  const showSecond = twoPage && pageNum + 1 <= totalPages;

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "#0a0905",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <style>{`@keyframes pdfSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 36, height: 36, border: "2px solid #2a2518", borderTopColor: C.gold,
                    borderRadius: "50%", animation: "pdfSpin 1s linear infinite" }} />
      <p style={{ fontFamily: "'Cinzel',serif", color: C.muted, fontSize: 12, letterSpacing: 2, margin: 0 }}>Loading PDF…</p>
    </div>
  );

  if (err) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "#0a0905",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
      <p style={{ color: C.gold, fontFamily: "'Cinzel',serif", fontSize: 14, margin: 0 }}>Failed to load PDF</p>
      <p style={{ color: C.muted, fontSize: 12, margin: 0, textAlign: "center" }}>{err}</p>
      <button onClick={onClose} style={{ marginTop: 8, background: "transparent", border: `1px solid ${C.border}`,
        borderRadius: 8, color: C.muted, padding: "8px 20px", cursor: "pointer", fontFamily: "'Cinzel',serif", fontSize: 12 }}>
        Close
      </button>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "#0a0905", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes pdfSpin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ── */}
      <div style={{
        flexShrink: 0, height: 52,
        background: "rgba(17,16,9,0.97)", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", padding: "0 12px", gap: 10,
        opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? "auto" : "none",
        transition: "opacity .22s ease",
      }}>
        <button onClick={onClose}
          style={{ background: "transparent", border: `1px solid ${C.dim}`, borderRadius: 8,
                   color: C.gold, padding: "6px 14px", cursor: "pointer",
                   fontFamily: "'Cinzel',serif", fontSize: 12, letterSpacing: 1, flexShrink: 0 }}>
          ← Back
        </button>
        <div style={{ flex: 1, fontFamily: "'Cinzel',serif", fontSize: 12, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          <button onClick={() => setZoomMode(z => z === "width" ? "page" : "width")}
            title={zoomMode === "width" ? "Fit page height" : "Fit page width"}
            style={{ background: "transparent", border: `1px solid ${C.dim}`, borderRadius: 6,
                     color: C.muted, padding: "5px 10px", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>
            {zoomMode === "width" ? "↕" : "↔"}
          </button>
          {window.innerWidth >= 700 && (
            <button onClick={() => setTwoPage(t => !t)}
              title={twoPage ? "Single page" : "Two-page spread"}
              style={{ background: twoPage ? `${C.gold}22` : "transparent",
                       border: `1px solid ${twoPage ? C.gold : C.dim}`, borderRadius: 6,
                       color: twoPage ? C.gold : C.muted, padding: "5px 9px", cursor: "pointer",
                       fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1 }}>
              {twoPage ? "2P" : "1P"}
            </button>
          )}
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.red, letterSpacing: 2,
                         border: `1px solid ${C.red}55`, borderRadius: 4, padding: "2px 7px" }}>
            PDF
          </span>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div ref={containerRef}
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "#111",
                 display: "flex", flexDirection: "column", alignItems: "center",
                 padding: isDesktop ? "12px 0" : "4px 0",
                 position: "relative" }}
        onClick={handleTap}
      >
        {pageLoading && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                        zIndex: 5, pointerEvents: "none" }}>
            <div style={{ width: 28, height: 28, border: "2px solid #2a2518", borderTopColor: C.gold,
                          borderRadius: "50%", animation: "pdfSpin .8s linear infinite" }} />
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "4px 8px" }}>
          <canvas ref={canvasRef}
            style={{ display: "block", boxShadow: "0 4px 24px rgba(0,0,0,0.8)", borderRadius: 2,
                     opacity: pageLoading ? 0.6 : 1, transition: "opacity .15s" }} />
          {showSecond && (
            <canvas ref={canvasRef2}
              style={{ display: "block", boxShadow: "0 4px 24px rgba(0,0,0,0.8)", borderRadius: 2,
                       opacity: pageLoading ? 0.6 : 1, transition: "opacity .15s" }} />
          )}
        </div>
      </div>

      {/* ── Footer nav ── */}
      <div style={{
        flexShrink: 0, height: 56,
        background: "rgba(17,16,9,0.97)", borderTop: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 16px",
        opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? "auto" : "none",
        transition: "opacity .22s ease",
      }}>
        <button onClick={prev} disabled={pageNum <= 1}
          style={{ background: "transparent", border: `1px solid ${pageNum <= 1 ? C.dim : C.gold}`,
                   borderRadius: 8, color: pageNum <= 1 ? C.dim : C.gold, padding: "7px 18px",
                   cursor: pageNum <= 1 ? "default" : "pointer", fontFamily: "'Cinzel',serif", fontSize: 13 }}>
          ‹
        </button>

        {showPageInput ? (
          <form onSubmit={handleJumpSubmit} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              autoFocus
              value={pageInputVal}
              onChange={e => setPageInputVal(e.target.value)}
              onBlur={() => { setShowPageInput(false); setPageInputVal(""); }}
              placeholder={String(pageNum)}
              style={{ width: 54, background: "#1a1810", border: `1px solid ${C.gold}`,
                       borderRadius: 6, color: C.text, padding: "5px 8px", textAlign: "center",
                       fontFamily: "'Cinzel',serif", fontSize: 12, outline: "none" }}
            />
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: C.muted, letterSpacing: 1 }}>
              / {totalPages}
            </span>
          </form>
        ) : (
          <button onClick={() => { setPageInputVal(""); setShowPageInput(true); }}
            title="Click to jump to page"
            style={{ background: "transparent", border: "none", cursor: "pointer",
                     fontFamily: "'Cinzel',serif", fontSize: 11, color: C.muted, letterSpacing: 1,
                     minWidth: 96, textAlign: "center", padding: "6px 8px", borderRadius: 6 }}>
            {showSecond ? `${pageNum}–${pageNum + 1} / ${totalPages}` : `${pageNum} / ${totalPages}`}
          </button>
        )}

        <button onClick={next} disabled={pageNum >= totalPages}
          style={{ background: "transparent", border: `1px solid ${pageNum >= totalPages ? C.dim : C.gold}`,
                   borderRadius: 8, color: pageNum >= totalPages ? C.dim : C.gold, padding: "7px 18px",
                   cursor: pageNum >= totalPages ? "default" : "pointer", fontFamily: "'Cinzel',serif", fontSize: 13 }}>
          ›
        </button>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, zIndex: 20, pointerEvents: "none" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(to right,${C.gold},${C.red})`,
                      transition: "width .5s" }} />
      </div>
    </div>
  );
}
