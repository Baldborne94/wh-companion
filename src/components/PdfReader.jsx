import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { C } from "../data/constants";
import { useLang } from "../lib/i18n.jsx";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PDFJS   = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

// ── pdfjs singleton ───────────────────────────────────────────────────────────
let _lib = null;
function getPdfJs() {
  if (_lib) return _lib;
  _lib = new Promise((ok, fail) => {
    if (window.pdfjsLib) { ok(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`; ok(window.pdfjsLib); };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return _lib;
}

// ── helpers ───────────────────────────────────────────────────────────────────
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
      // epub_cfi stores the page number using the same "pdf:{n}" convention as bookmarks
      body: JSON.stringify({ user_id: userId, book_id: bookId, progress_pct: pct, epub_cfi: `pdf:${page}`, last_read: new Date().toISOString() }),
    });
  } catch {}
}

async function loadPdfProgressFromDB(userId, bookId) {
  if (!userId || !bookId) return null;
  try {
    const { data } = await supabase.from("reading_progress")
      .select("epub_cfi,progress_pct")
      .eq("user_id", userId).eq("book_id", bookId)
      .maybeSingle();
    if (!data) return null;
    if (data.epub_cfi?.startsWith("pdf:")) return parseInt(data.epub_cfi.slice(4), 10) || null;
    return null;
  } catch { return null; }
}

const bmKey = (uid, bid) => `wh40k_bm_${uid || "anon"}_${bid}`;
const loadBm = (uid, bid) => { try { return JSON.parse(localStorage.getItem(bmKey(uid, bid)) || "[]"); } catch { return []; } };
const saveBm = (uid, bid, bms) => localStorage.setItem(bmKey(uid, bid), JSON.stringify(bms));

// PDF bookmarks are stored in the bookmarks table using epub_cfi="pdf:{page}"
// so they share the table with EPUB bookmarks without needing a schema change.
async function loadPdfBmsFromDB(userId, bookId) {
  if (!userId || !bookId) return [];
  try {
    const { data } = await supabase.from("bookmarks")
      .select("epub_cfi,created_at")
      .eq("user_id", userId).eq("book_id", bookId)
      .like("epub_cfi", "pdf:%")
      .order("created_at", { ascending: true });
    return (data || [])
      .map(b => ({ page: parseInt(b.epub_cfi.slice(4), 10), addedAt: b.created_at }))
      .filter(b => b.page > 0);
  } catch { return []; }
}

async function savePdfBmsToDB(userId, bookId, bms) {
  if (!userId || !bookId) return;
  try {
    await supabase.from("bookmarks").delete().eq("user_id", userId).eq("book_id", bookId).like("epub_cfi", "pdf:%");
    if (bms.length) await supabase.from("bookmarks").insert(
      bms.map(b => ({ user_id: userId, book_id: bookId, epub_cfi: `pdf:${b.page}`, label: `Pagina ${b.page}`, progress: 0 }))
    );
  } catch {}
}

// Render one page onto a canvas, fit to available space × zoom
async function renderPage(doc, num, canvas, availW, availH, zoom, taskRef) {
  if (!doc || !canvas || num < 1 || num > doc.numPages) return;
  if (taskRef?.current) { try { taskRef.current.cancel(); } catch {} taskRef.current = null; }
  const pg   = await doc.getPage(num);
  const vp0  = pg.getViewport({ scale: 1 });
  const scale = Math.min(availW / vp0.width, availH / vp0.height) * zoom;
  const vp   = pg.getViewport({ scale });
  const dpr  = window.devicePixelRatio || 1;
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
export default function PdfReader({ arrayBuffer, url, title, bookId, userId, onClose, nowPlaying, musicPaused, onMusicClick, onStopMusic, onTogglePauseMusic }) {
  const { t, locale } = useLang();
  // Lock viewport to prevent browser zoom interfering
  useEffect(() => {
    const meta = document.querySelector("meta[name=viewport]");
    if (!meta) return;
    const prev = meta.content;
    meta.content = "width=device-width,initial-scale=1,user-scalable=no";
    return () => { meta.content = prev; };
  }, []);

  const initPage = (() => {
    try { return Math.max(1, JSON.parse(localStorage.getItem(`wh40k_prog_${userId}_${bookId}`) || "{}").page_index || 1); }
    catch { return 1; }
  })();

  // ── state ─────────────────────────────────────────────────────────────────
  const [doc,       setDoc]      = useState(null);
  const [total,     setTotal]    = useState(0);
  const [page,      setPage]     = useState(initPage);
  const [zoom,      setZoom]     = useState(1.0);
  const [viewMode,  setViewMode] = useState("single");
  const [err,       setErr]      = useState(null);
  const [rendering, setRendering]= useState(false);
  const [showNav,   setShowNav]  = useState(true);
  const [bookmarks, setBookmarks]= useState(() => loadBm(userId, bookId));
  const [showBm,    setShowBm]   = useState(false);

  // Sync bookmarks from DB on new device (localStorage empty)
  useEffect(() => {
    if (!userId || !bookId || localStorage.getItem(bmKey(userId, bookId))) return;
    loadPdfBmsFromDB(userId, bookId).then(dbBms => {
      if (!dbBms.length) return;
      setBookmarks(dbBms);
      saveBm(userId, bookId, dbBms);
    });
  }, [userId, bookId]);

  // ── refs ─────────────────────────────────────────────────────────────────
  const canvasRef  = useRef(null);
  const canvas2Ref = useRef(null);
  const wrapRef    = useRef(null);
  const scrollRef  = useRef(null);
  const task1      = useRef(null);
  const task2      = useRef(null);
  const saveTimer  = useRef(null);
  const navTimer   = useRef(null);
  const touchX     = useRef(null);
  const pinch      = useRef(null);
  const zoomRef    = useRef(zoom);
  const pageRef    = useRef(page);
  const viewRef    = useRef(viewMode);
  // Scroll mode page list: { wrapper, canvas, pageNum, rendered }
  const scrollPages = useRef([]);
  const scrollObs   = useRef(null);
  // Scroll mode per-page task map
  const scrollTasks = useRef(new Map());
  const isDesktop   = useRef(window.matchMedia("(pointer:fine)").matches).current;
  const pendingDbPage = useRef(null);

  // Keep refs in sync with state (used in event handlers / observers)
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { viewRef.current = viewMode; }, [viewMode]);

  // On new device (no localStorage), restore position from DB
  useEffect(() => {
    if (!userId || !bookId) return;
    const key = `wh40k_prog_${userId}_${bookId}`;
    if (localStorage.getItem(key)) return;
    loadPdfProgressFromDB(userId, bookId).then(pg => {
      if (!pg || pg <= 1) return;
      if (total > 0) goTo(pg);
      else pendingDbPage.current = pg;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, bookId]);

  // Apply pending DB page once the PDF is loaded and we know total pages
  useEffect(() => {
    if (!doc || !total || !pendingDbPage.current) return;
    const pg = pendingDbPage.current;
    pendingDbPage.current = null;
    if (pg > 1 && pg <= total) goTo(pg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, total]);

  // ── load PDF ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setErr(null); setDoc(null); setTotal(0);
    // Prefer ArrayBuffer (avoids CORS/signed-URL issues on tablet PWA)
    const src = arrayBuffer ? { data: new Uint8Array(arrayBuffer) } : { url, withCredentials: false };
    getPdfJs()
      .then(lib => lib.getDocument(src).promise)
      .then(d => { if (!cancelled) { setDoc(d); setTotal(d.numPages); } })
      .catch(e => { if (!cancelled) setErr(e?.message || t("reader.couldNotLoadPdf")); });
    return () => { cancelled = true; };
  }, [arrayBuffer, url]);

  // ── auto-hide nav (mobile) ────────────────────────────────────────────────
  const bumpNav = useCallback(() => {
    if (isDesktop) return;
    setShowNav(true);
    clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => setShowNav(false), 4000);
  }, [isDesktop]);

  useEffect(() => { if (!isDesktop) bumpNav(); }, []); // eslint-disable-line

  // ── navigation ────────────────────────────────────────────────────────────
  const goTo = useCallback((n) => {
    if (!total) return;
    const mode = viewRef.current;
    const raw  = mode === "dual" && n % 2 === 0 ? n - 1 : n;
    const p    = Math.min(Math.max(raw, 1), total);
    setPage(p);
    bumpNav();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProgress(userId, bookId, p, total), 1200);
  }, [total, userId, bookId, bumpNav]);

  // ── render single / dual ─────────────────────────────────────────────────
  useEffect(() => {
    if (!doc || viewMode === "scroll") return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cols = viewMode === "dual" ? 2 : 1;
    const gap  = cols === 2 ? 16 : 0;
    const W    = Math.floor((wrap.clientWidth  - 24 - gap) / cols);
    const H    = wrap.clientHeight - 24;
    setRendering(true);
    const p1 = renderPage(doc, page, canvasRef.current, W, H, zoom, task1).catch(() => {});
    const p2 = (viewMode === "dual" && page + 1 <= total)
      ? renderPage(doc, page + 1, canvas2Ref.current, W, H, zoom, task2).catch(() => {})
      : Promise.resolve();
    Promise.all([p1, p2]).finally(() => setRendering(false));
  }, [doc, page, zoom, viewMode, total]);

  // ── scroll mode setup — deps minimal, use refs inside ────────────────────
  useEffect(() => {
    if (viewMode !== "scroll" || !doc || !scrollRef.current) return;
    const container = scrollRef.current;
    container.innerHTML = "";
    scrollPages.current = [];
    scrollTasks.current.clear();
    if (scrollObs.current) scrollObs.current.disconnect();

    scrollObs.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const item = scrollPages.current.find(p => p.wrapper === entry.target);
        if (!item || item.rendered) return;
        item.rendered = true;
        const canvas  = document.createElement("canvas");
        canvas.style.cssText = "display:block;margin:0 auto;border-radius:2px;box-shadow:0 4px 24px rgba(0,0,0,.7)";
        item.wrapper.appendChild(canvas);
        item.canvas = canvas;
        const W = container.clientWidth - 32;
        const H = container.clientHeight;
        const taskRef = { current: null };
        scrollTasks.current.set(item.pageNum, taskRef);
        renderPage(doc, item.pageNum, canvas, W, H, zoomRef.current, taskRef).catch(() => {});
      });
    }, { root: container, rootMargin: "300px 0px" });

    for (let i = 1; i <= doc.numPages; i++) {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "margin:12px auto;max-width:calc(100% - 24px);min-height:180px;display:flex;align-items:center;justify-content:center";
      wrapper.dataset.page = i;
      container.appendChild(wrapper);
      scrollPages.current.push({ wrapper, canvas: null, pageNum: i, rendered: false });
      scrollObs.current.observe(wrapper);
    }

    // Scroll to saved page
    const target = scrollPages.current[initPage - 1];
    if (target) setTimeout(() => target.wrapper.scrollIntoView({ block: "start" }), 50);

    // Track current page
    const onScroll = () => {
      bumpNav();
      const mid = container.scrollTop + container.clientHeight / 2;
      for (const item of scrollPages.current) {
        const t = item.wrapper.offsetTop, b = t + item.wrapper.offsetHeight;
        if (mid >= t && mid < b) {
          const p = item.pageNum;
          setPage(p);
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => saveProgress(userId, bookId, p, doc.numPages), 1500);
          break;
        }
      }
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (scrollObs.current) scrollObs.current.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally minimal deps
  }, [viewMode, doc]);

  // ── zoom update for scroll mode (re-render rendered pages in place) ───────
  useEffect(() => {
    if (viewMode !== "scroll" || !doc || !scrollRef.current) return;
    const container = scrollRef.current;
    const W = container.clientWidth - 32;
    const H = container.clientHeight;
    scrollPages.current.forEach(item => {
      if (!item.rendered || !item.canvas) return;
      const taskRef = scrollTasks.current.get(item.pageNum) || { current: null };
      scrollTasks.current.set(item.pageNum, taskRef);
      renderPage(doc, item.pageNum, item.canvas, W, H, zoom, taskRef).catch(() => {});
    });
  }, [zoom, viewMode, doc]);

  // ── keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (viewRef.current === "scroll") return;
      const step = viewRef.current === "dual" ? 2 : 1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goTo(pageRef.current + step);
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   goTo(pageRef.current - step);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [goTo, onClose]);

  // ── touch: swipe (single/dual) + pinch zoom (all modes) ──────────────────
  useEffect(() => {
    const el = viewMode === "scroll" ? scrollRef.current : wrapRef.current;
    if (!el) return;

    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e) => {
      bumpNav();
      if (e.touches.length === 2) {
        pinch.current = { d: dist(e.touches), z: zoomRef.current };
        touchX.current = null;
        e.preventDefault();
      } else {
        pinch.current = null;
        const mode = viewRef.current;
        touchX.current = (mode !== "scroll" && zoomRef.current <= 1.0) ? e.touches[0].clientX : null;
      }
    };

    const onMove = (e) => {
      if (e.touches.length === 2 && pinch.current) {
        const newZ = Math.min(4, Math.max(0.5, Math.round(pinch.current.z * (dist(e.touches) / pinch.current.d) * 100) / 100));
        setZoom(newZ);
        e.preventDefault();
      }
    };

    const onEnd = (e) => {
      if (pinch.current) { pinch.current = null; touchX.current = null; return; }
      if (touchX.current === null || viewRef.current === "scroll") return;
      const startX = touchX.current;
      const dx = e.changedTouches[0].clientX - startX;
      touchX.current = null;
      const step = viewRef.current === "dual" ? 2 : 1;
      // Edge tap (≤15 px drag in left/right 70 px strip) → prev/next
      if (Math.abs(dx) <= 15) {
        const EDGE = 70;
        if (startX < EDGE)                     { goTo(pageRef.current - step); return; }
        if (startX > window.innerWidth - EDGE) { goTo(pageRef.current + step); return; }
        return;
      }
      // Swipe
      if (Math.abs(dx) > 40) goTo(pageRef.current + (dx < 0 ? step : -step));
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove",  onMove,  { passive: false });
    el.addEventListener("touchend",   onEnd,   { passive: true  });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove",  onMove);
      el.removeEventListener("touchend",   onEnd);
    };
  }, [viewMode, doc, goTo, bumpNav]);

  // ── bookmarks ─────────────────────────────────────────────────────────────
  const isBookmarked = bookmarks.some(b => b.page === page);
  const toggleBm = () => {
    const next = isBookmarked
      ? bookmarks.filter(b => b.page !== page)
      : [...bookmarks, { page, addedAt: new Date().toISOString() }].sort((a, b) => a.page - b.page);
    setBookmarks(next);
    saveBm(userId, bookId, next);
    savePdfBmsToDB(userId, bookId, next);
  };

  // ── toolbar button ────────────────────────────────────────────────────────
  const Btn = ({ label, onClick, active, disabled, title: tip }) => (
    <button title={tip} disabled={disabled} onClick={onClick} style={{
      background: active ? "rgba(201,168,76,.18)" : "transparent",
      border: active ? `1px solid ${C.gold}44` : "1px solid transparent",
      borderRadius: 6, cursor: disabled ? "default" : "pointer",
      color: disabled ? C.dim : active ? C.gold : C.text,
      fontSize: 14, padding: "4px 8px", lineHeight: 1,
      opacity: disabled ? 0.35 : 1,
    }}>
      {label}
    </button>
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
        }}>{t("reader.back")}</button>

        <div style={{ flex: 1, fontFamily: "'Cinzel',serif", fontSize: 10, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px" }}>
          {title}
        </div>

        {/* Page counter — desktop only */}
        {isDesktop && viewMode !== "scroll" && total > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <Btn label="‹" onClick={() => goTo(page - step)} disabled={page <= 1} />
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted, minWidth: 54, textAlign: "center" }}>
              {viewMode === "dual" ? `${page}–${Math.min(page + 1, total)}` : page} / {total}
            </span>
            <Btn label="›" onClick={() => goTo(page + step)} disabled={page + step - 1 >= total} />
          </div>
        )}
        {isDesktop && viewMode === "scroll" && total > 0 && (
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted, flexShrink: 0 }}>{page} / {total}</span>
        )}

        {isDesktop && <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />}

        {/* View mode */}
        <Btn label="▯"  onClick={() => setViewMode("single")} active={viewMode === "single"} title={t("reader.singlePage")} />
        <Btn label="▯▯" onClick={() => setViewMode("dual")}   active={viewMode === "dual"}   title={t("reader.dualPage")} />
        <Btn label="≡"  onClick={() => setViewMode("scroll")} active={viewMode === "scroll"} title={t("reader.scrollMode")} />

        <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />

        {/* Bookmarks */}
        <Btn label="🔖" onClick={e => { e.stopPropagation(); setShowBm(v => !v); }} active={showBm} title={t("reader.bookmarks")} />
        <Btn label={isBookmarked ? "★" : "☆"} onClick={e => { e.stopPropagation(); toggleBm(); }} active={isBookmarked} title={isBookmarked ? t("reader.removeBookmark") : t("reader.addBookmark")} />

        {/* Music indicator */}
        {nowPlaying && (
          <>
            <button onClick={e => { e.stopPropagation(); onMusicClick?.(); }} title={nowPlaying.title}
              style={{ background:"transparent", border:"none", cursor:"pointer",
                       padding:"4px 2px 4px 4px", display:"flex", alignItems:"center",
                       maxWidth:72, overflow:"hidden", flexShrink:0 }}>
              <span style={{ fontSize:9, color:"rgba(212,203,184,0.5)", overflow:"hidden",
                             textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {nowPlaying.title}
              </span>
            </button>
            <button onClick={e => { e.stopPropagation(); onTogglePauseMusic?.(); }} title={musicPaused?t("reader.resumeMusic"):t("reader.pauseMusic")}
              style={{ background:"transparent", border:"none", cursor:"pointer",
                       padding:"4px 4px", color:nowPlaying.type==="youtube"?"#FF4444":"#1DB954",
                       fontSize:12, lineHeight:1, flexShrink:0 }}>
              {musicPaused ? "▶" : "⏸"}
            </button>
            <button onClick={e => { e.stopPropagation(); onStopMusic?.(); }} title={t("reader.stopMusic")}
              style={{ background:"transparent", border:"none", cursor:"pointer",
                       padding:"4px 5px", color:"rgba(212,203,184,0.45)", fontSize:14,
                       lineHeight:1, flexShrink:0 }}>
              ✕
            </button>
          </>
        )}

        {/* Zoom — desktop only */}
        {isDesktop && (<>
          <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />
          <Btn label="−" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.5} />
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.dim, minWidth: 28, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <Btn label="+" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} disabled={zoom >= 4} />
          <Btn label="⊡" onClick={() => setZoom(1)} title={t("reader.resetZoom")} />
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.red, letterSpacing: 2,
                         border: `1px solid ${C.red}55`, borderRadius: 4, padding: "2px 5px", flexShrink: 0 }}>PDF</span>
        </>)}
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
            {t("reader.bookmarks").toUpperCase()}
          </div>
          <div style={{ padding: "7px 12px 6px", fontSize: 9, color: C.dim, fontFamily: "'Cinzel',serif",
                        lineHeight: 1.5, borderBottom: `1px solid ${C.border}22` }}>
            {t("reader.bookmarkHintPdf").split("{star}").flatMap((part, i) =>
              i === 0 ? [part] : [<span key={i} style={{ color: C.gold }}>☆</span>, part]
            )}
          </div>
          {bookmarks.length === 0 ? (
            <div style={{ padding: 16, fontFamily: "'Cinzel',serif", fontSize: 10, color: C.dim, textAlign: "center" }}>
              {t("reader.noBookmarks")}<br />{t("reader.pressStarToAdd")}
            </div>
          ) : bookmarks.map(bm => (
            <button key={bm.page} onClick={() => { goTo(bm.page); setShowBm(false); }} style={{
              background: bm.page === page ? "rgba(201,168,76,.1)" : "transparent",
              border: "none", borderBottom: `1px solid ${C.border}22`, cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 12px", color: bm.page === page ? C.gold : C.text,
              fontFamily: "'Cinzel',serif", fontSize: 10,
            }}>
              <span>{t("reader.page").replace("{n}", bm.page)}</span>
              <span style={{ fontSize: 8, color: C.dim }}>{new Date(bm.addedAt).toLocaleDateString(locale)}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Main area ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

        {/* Single / Dual */}
        {viewMode !== "scroll" && (
          <div ref={wrapRef} style={{
            width: "100%", height: "100%", overflow: "auto", background: "#1a1814",
            display: "flex", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent`,
          }}>
            {err ? (
              <div style={{ margin: "auto", color: C.red, fontFamily: "'Cinzel',serif", fontSize: 13, textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✕</div>
                <div>{t("reader.failedToLoadPdf")}</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>{err}</div>
              </div>
            ) : !doc ? (
              <div style={{ margin: "auto", color: C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 2 }}>{t("reader.loading")}</div>
            ) : (
              <div style={{ margin: "auto", padding: 12, display: "flex", gap: 8, flexShrink: 0 }}>
                <canvas ref={canvasRef} style={{ display: "block", borderRadius: 2, boxShadow: "0 8px 40px rgba(0,0,0,.8)", opacity: rendering ? 0.6 : 1, transition: "opacity .15s" }} />
                {viewMode === "dual" && page + 1 <= total && (
                  <canvas ref={canvas2Ref} style={{ display: "block", borderRadius: 2, boxShadow: "0 8px 40px rgba(0,0,0,.8)", opacity: rendering ? 0.6 : 1, transition: "opacity .15s" }} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Scroll */}
        {viewMode === "scroll" && (
          <div ref={scrollRef} style={{
            width: "100%", height: "100%", overflow: "auto", background: "#1a1814",
            scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent`,
          }}>
            {err && <div style={{ color: C.red, fontFamily: "'Cinzel',serif", fontSize: 13, textAlign: "center", padding: 40 }}>{t("reader.failedToLoadPdfWith").replace("{msg}", err)}</div>}
            {!doc && !err && <div style={{ color: C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 2, textAlign: "center", padding: 40 }}>{t("reader.loading")}</div>}
          </div>
        )}
      </div>

      {/* ── Mobile bottom bar (all modes) ── */}
      {!isDesktop && total > 0 && (
        <div style={{
          flexShrink: 0, height: 48, background: "#111009", borderTop: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", padding: "0 6px", gap: 4,
          opacity: navVisible ? 1 : 0, transition: "opacity 0.3s",
          pointerEvents: navVisible ? "auto" : "none",
        }}>
          {/* Zoom controls */}
          <Btn label="−" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.5} />
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.dim, minWidth: 30, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <Btn label="+" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} disabled={zoom >= 4} />
          <Btn label="⊡" onClick={() => setZoom(1)} title={t("reader.resetZoom")} />

          <div style={{ flex: 1 }} />

          {/* Page nav — single / dual */}
          {viewMode !== "scroll" && (<>
            <button onClick={() => goTo(page - step)} disabled={page <= 1} style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
              color: page <= 1 ? C.dim : C.gold, padding: "6px 14px",
              cursor: page <= 1 ? "default" : "pointer",
              fontFamily: "'Cinzel',serif", fontSize: 12, opacity: page <= 1 ? 0.3 : 1,
            }}>‹</button>
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted, minWidth: 46, textAlign: "center" }}>
              {viewMode === "dual" ? `${page}–${Math.min(page + 1, total)}` : page} / {total}
            </span>
            <button onClick={() => goTo(page + step)} disabled={page + step - 1 >= total} style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
              color: page + step - 1 >= total ? C.dim : C.gold, padding: "6px 14px",
              cursor: page + step - 1 >= total ? "default" : "pointer",
              fontFamily: "'Cinzel',serif", fontSize: 12, opacity: page + step - 1 >= total ? 0.3 : 1,
            }}>›</button>
          </>)}

          {/* Page counter — scroll */}
          {viewMode === "scroll" && (
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted }}>{page} / {total}</span>
          )}
        </div>
      )}
    </div>
  );
}
