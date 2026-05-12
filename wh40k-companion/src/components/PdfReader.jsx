import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../data/constants";

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
let _pdfjsPromise = null;

function loadPdfJs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement('script');
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

export default function PdfReader({ url, title, bookId, userId, onClose }) {
  useReaderViewport();

  const [pdfDoc, setPdfDoc]       = useState(null);
  const [pageNum, setPageNum]     = useState(() => {
    if (userId && bookId) {
      try {
        const p = JSON.parse(localStorage.getItem(`wh40k_prog_${userId}_${bookId}`) || '{}');
        return Math.max(1, p.page_index || 1);
      } catch {}
    }
    return 1;
  });
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState(null);
  const [showUI, setShowUI]         = useState(true);
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const hideUITimerRef = useRef(null);

  const revealUI = useCallback(() => {
    setShowUI(true);
    if (hideUITimerRef.current) clearTimeout(hideUITimerRef.current);
    hideUITimerRef.current = setTimeout(() => setShowUI(false), 4500);
  }, []);

  // Load PDF.js + document
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    loadPdfJs()
      .then(lib => lib.getDocument({ url, withCredentials:false }).promise)
      .then(doc => {
        if (cancelled) return;
        setPdfDoc(doc); setTotalPages(doc.numPages); setLoading(false);
      })
      .catch(e => { if (!cancelled) { setErr('Failed to load PDF: ' + e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url]);

  // Render page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
    pdfDoc.getPage(pageNum).then(page => {
      if (cancelled) return;
      const container = containerRef.current;
      const cw = container ? container.clientWidth - 32 : 600;
      const vp0 = page.getViewport({ scale:1 });
      const scale = Math.min(cw / vp0.width, 2.5);
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      const task = page.render({ canvasContext:ctx, viewport:vp });
      renderTaskRef.current = task;
      task.promise.catch(e => { if (e.name !== 'RenderingCancelledException') console.error(e); });
    });
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  // Save progress
  useEffect(() => {
    if (!userId || !bookId || totalPages < 1) return;
    const key = `wh40k_prog_${userId}_${bookId}`;
    const ex = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...ex, page_index:pageNum, progress_pct:Math.round((pageNum / totalPages) * 100), bookmarkedAt:new Date().toISOString() }));
  }, [pageNum, totalPages, userId, bookId]);

  // Keyboard navigation
  useEffect(() => {
    const handler = e => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); setPageNum(p => Math.min(totalPages, p + 1)); }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")  { e.preventDefault(); setPageNum(p => Math.max(1, p - 1)); }
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [totalPages, onClose]);

  const prev = () => setPageNum(p => Math.max(1, p - 1));
  const next = () => setPageNum(p => Math.min(totalPages, p + 1));

  const handleTap = useCallback(e => {
    if (e.target.closest('button')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const w = rect.width;
    if (relX < w * 0.30) { prev(); return; }
    if (relX > w * 0.70) { next(); return; }
    revealUI();
  }, [revealUI]);

  const pct = totalPages > 0 ? Math.round((pageNum / totalPages) * 100) : 0;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:600, background:"#0a0905", display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <div style={{
        flexShrink:0, height:52, background:C.surface, borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", padding:"0 16px", gap:12,
        transform: showUI ? "translateY(0)" : "translateY(-100%)",
        transition:"transform 0.22s ease",
        position:"absolute", top:0, left:0, right:0, zIndex:10,
        pointerEvents: showUI ? "auto" : "none",
      }}>
        <button onClick={onClose} style={{ background:"transparent", border:`1px solid ${C.dim}`, borderRadius:8, color:C.gold, padding:"7px 16px", cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:1 }}>← Back</button>
        <div style={{ flex:1, fontFamily:"'Cinzel',serif", fontSize:12, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</div>
        <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.red, letterSpacing:2, border:`1px solid ${C.red}55`, borderRadius:4, padding:"2px 7px" }}>PDF</span>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={{ position:"absolute", inset:0, overflowY:"auto", display:"flex", flexDirection:"column", alignItems:"center", padding:"16px 0", background:"#111" }} onClick={handleTap}>
        {loading && <div style={{ color:C.muted, marginTop:100, fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2 }}>Loading PDF…</div>}
        {err && <div style={{ color:C.red, margin:40, textAlign:"center", fontSize:13 }}>{err}</div>}
        {!loading && !err && <canvas ref={canvasRef} style={{ maxWidth:"100%", boxShadow:"0 4px 24px rgba(0,0,0,0.7)", borderRadius:2 }} />}
      </div>

      {/* Page nav footer */}
      <div style={{
        position:"absolute", bottom:0, left:0, right:0, zIndex:10,
        height:52, background:C.surface, borderTop:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", justifyContent:"center", gap:20,
        transform: showUI ? "translateY(0)" : "translateY(100%)",
        transition:"transform 0.22s ease",
        pointerEvents: showUI ? "auto" : "none",
      }}>
        <button onClick={prev} disabled={pageNum <= 1} style={{ background:"transparent", border:`1px solid ${pageNum <= 1 ? C.dim : C.gold}`, borderRadius:8, color:pageNum <= 1 ? C.muted : C.gold, padding:"7px 18px", cursor:pageNum <= 1 ? "default" : "pointer", fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:1 }}>‹</button>
        <span style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:C.muted, letterSpacing:1, minWidth:80, textAlign:"center" }}>{pageNum} / {totalPages}</span>
        <button onClick={next} disabled={pageNum >= totalPages} style={{ background:"transparent", border:`1px solid ${pageNum >= totalPages ? C.dim : C.gold}`, borderRadius:8, color:pageNum >= totalPages ? C.muted : C.gold, padding:"7px 18px", cursor:pageNum >= totalPages ? "default" : "pointer", fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:1 }}>›</button>
      </div>

      {/* Progress bar */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, zIndex:15, pointerEvents:"none" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(to right,${C.gold},${C.red})`, transition:"width 0.5s" }} />
      </div>
    </div>
  );
}
