import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { C, THEMES } from "../data/constants";
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

// Render one page onto a canvas, fit to available space × zoom.
// fit="width" fills the available width (page can run taller than the viewport and
// is scrolled vertically) — far more readable on phones than fitting the whole page;
// fit="page" keeps the whole page visible.
async function renderPage(doc, num, canvas, availW, availH, zoom, taskRef, fit = "page") {
  if (!doc || !canvas || num < 1 || num > doc.numPages) return;
  if (taskRef?.current) { try { taskRef.current.cancel(); } catch {} taskRef.current = null; }
  const pg   = await doc.getPage(num);
  const vp0  = pg.getViewport({ scale: 1 });
  const base = fit === "width" ? availW / vp0.width
                               : Math.min(availW / vp0.width, availH / vp0.height);
  const scale = base * zoom;
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

  // Match the surround to the active reader theme (the PDF page itself is left
  // untouched — only the mat behind it + the cover frame are themed). Read the same
  // localStorage settings the EPUB reader writes so the two stay consistent.
  const theme = (() => {
    try { return THEMES[JSON.parse(localStorage.getItem("wh40k_reader_v2") || "{}").themeId] || THEMES.dark; }
    catch { return THEMES.dark; }
  })();
  const isLight   = theme.id !== "dark";
  const matBg     = isLight ? theme.surface : "#1a1814";

  // Lock viewport to prevent browser zoom interfering
  useEffect(() => {
    const meta = document.querySelector("meta[name=viewport]");
    if (!meta) return;
    const prev = meta.content;
    meta.content = "width=device-width,initial-scale=1,user-scalable=no";
    return () => { meta.content = prev; };
  }, []);

  // Keep the screen awake while reading. Re-acquire on visibilitychange since the
  // browser releases the lock when the tab is hidden. Best-effort and silent.
  useEffect(() => {
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && navigator.wakeLock) {
          lock = await navigator.wakeLock.request("screen");
          if (cancelled) { lock.release?.(); lock = null; }
        }
      } catch {}
    };
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      try { lock?.release?.(); } catch {}
    };
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
  // Fit-to-width by default on touch devices (readable text on phones); whole-page
  // on desktop where the viewport is large enough to read a full page comfortably.
  const [fitMode,   setFitMode]  = useState(() =>
    window.matchMedia("(pointer:fine)").matches ? "page" : "width");
  const [err,       setErr]      = useState(null);
  const [rendering, setRendering]= useState(false);
  const [showNav,   setShowNav]  = useState(true);
  const [bookmarks, setBookmarks]= useState(() => loadBm(userId, bookId));
  const [showBm,    setShowBm]   = useState(false);
  const [isFs,      setIsFs]     = useState(false);
  // Lateral page-turn: the outgoing page is copied (pixel-blit, no image encoding)
  // into a persistent overlay canvas that slides off-screen, revealing the new page.
  const [slide,     setSlide]    = useState(null);   // { dir } | null
  const [slideOut,  setSlideOut] = useState(false);
  // Night brightness: 0 = off, 1 = dim, 2 = dimmer. Persisted app-wide.
  const [dim,       setDim]      = useState(() => {
    const v = parseInt(localStorage.getItem("wh_pdf_dim") || "0", 10);
    return v >= 0 && v <= 2 ? v : 0;
  });
  // Page being scrubbed on the navigation slider (null when not dragging).
  const [scrubPage, setScrubPage] = useState(null);

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
  const rootRef    = useRef(null);
  const mainRef    = useRef(null);
  const canvasRef  = useRef(null);
  const canvas2Ref = useRef(null);
  const slideCanvasRef = useRef(null);
  const wrapRef    = useRef(null);
  const scrollRef  = useRef(null);
  const task1      = useRef(null);
  const task2      = useRef(null);
  const saveTimer  = useRef(null);
  const navTimer   = useRef(null);
  const touchX     = useRef(null);
  const touchY     = useRef(null);
  const tapStart   = useRef(null);
  const pinch      = useRef(null);
  const zoomRef    = useRef(zoom);
  const pageRef    = useRef(page);
  const viewRef    = useRef(viewMode);
  const fitRef     = useRef(fitMode);
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
  useEffect(() => { fitRef.current = fitMode; }, [fitMode]);

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

  // ── fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFs = useCallback(() => {
    try {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else rootRef.current?.requestFullscreen?.();
    } catch {}
  }, []);

  // ── nav bars: manual show/hide via centre tap (reclaims full-screen space) ──
  // No auto-hide — the bars stay as the user left them; a centre tap toggles them.
  // Kept as a no-op callback so existing call sites (goTo, scroll, touch) are inert.
  const bumpNav = useCallback(() => {}, []);
  const toggleNav = useCallback(() => { if (!isDesktop) setShowNav(v => !v); }, [isDesktop]);

  // ── navigation ────────────────────────────────────────────────────────────
  // Copy what's on screen (mat + current page canvases) into the persistent overlay
  // canvas with a fast canvas→canvas blit (no toDataURL/image decode = no hitch).
  // Captures the visible viewport, so tall fit-width pages slide cleanly too.
  const paintSlideCanvas = useCallback(() => {
    const main = mainRef.current, sc = slideCanvasRef.current;
    if (!main || !sc) return false;
    const mr  = main.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    sc.width  = Math.max(1, Math.floor(mr.width  * dpr));
    sc.height = Math.max(1, Math.floor(mr.height * dpr));
    sc.style.width  = `${mr.width}px`;
    sc.style.height = `${mr.height}px`;
    const ctx = sc.getContext("2d");
    if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = matBg;
    ctx.fillRect(0, 0, mr.width, mr.height);
    [canvasRef.current, canvas2Ref.current].forEach(cv => {
      if (!cv || !cv.width) return;
      const cr = cv.getBoundingClientRect();
      ctx.drawImage(cv, cr.left - mr.left, cr.top - mr.top, cr.width, cr.height);
    });
    return true;
  }, [matBg]);

  const goTo = useCallback((n) => {
    if (!total) return;
    const mode = viewRef.current;
    const raw  = mode === "dual" && n % 2 === 0 ? n - 1 : n;
    const p    = Math.min(Math.max(raw, 1), total);
    if (p === pageRef.current) return;
    if (mode !== "scroll" && paintSlideCanvas()) {
      setSlide({ dir: p > pageRef.current ? 1 : -1 });
    }
    setPage(p);
    bumpNav();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProgress(userId, bookId, p, total), 1200);
  }, [total, userId, bookId, bumpNav, paintSlideCanvas]);

  const cycleDim = useCallback(() => {
    setDim(d => { const n = (d + 1) % 3; localStorage.setItem("wh_pdf_dim", String(n)); return n; });
  }, []);

  // Jump straight to a page (navigation slider) — scrolls in scroll mode, paginates
  // otherwise. No slide animation for big jumps; that's for adjacent turns.
  const jumpToPage = useCallback((p) => {
    const pg = Math.min(Math.max(p, 1), total);
    if (viewRef.current === "scroll") {
      const item = scrollPages.current[pg - 1];
      if (item) item.wrapper.scrollIntoView({ block: "start" });
      setPage(pg);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveProgress(userId, bookId, pg, total), 1000);
    } else {
      goTo(pg);
    }
  }, [total, userId, bookId, goTo]);

  // Drive the slide: start at translateX(0), then animate the overlay canvas off-screen
  // in the reading direction, then hide it once the new page is rendered underneath.
  useEffect(() => {
    if (!slide) return;
    setSlideOut(false);
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setSlideOut(true)));
    const tm = setTimeout(() => { setSlide(null); setSlideOut(false); }, 340);
    return () => { cancelAnimationFrame(r); clearTimeout(tm); };
  }, [slide]);

  // ── render single / dual ─────────────────────────────────────────────────
  useEffect(() => {
    if (!doc || viewMode === "scroll") return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cols = viewMode === "dual" ? 2 : 1;
    const gap  = cols === 2 ? 12 : 0;
    const W    = Math.floor((wrap.clientWidth  - 8 - gap) / cols);
    const H    = wrap.clientHeight - 8;
    // Fit-to-width only makes sense single page; dual fits both pages whole.
    const fit  = viewMode === "single" ? fitMode : "page";
    setRendering(true);
    const p1 = renderPage(doc, page, canvasRef.current, W, H, zoom, task1, fit).catch(() => {});
    const p2 = (viewMode === "dual" && page + 1 <= total)
      ? renderPage(doc, page + 1, canvas2Ref.current, W, H, zoom, task2, "page").catch(() => {})
      : Promise.resolve();
    Promise.all([p1, p2]).finally(() => setRendering(false));
  }, [doc, page, zoom, viewMode, total, fitMode]);

  // On page turn in single/dual, jump back to the top of the page (fit-width pages
  // run taller than the viewport, so a new page should start at its top, not wherever
  // the previous one was scrolled to).
  useEffect(() => {
    if (viewMode !== "scroll") wrapRef.current?.scrollTo({ top: 0, left: 0 });
  }, [page, viewMode]);

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
        const W = container.clientWidth - 8;
        const H = container.clientHeight;
        const taskRef = { current: null };
        scrollTasks.current.set(item.pageNum, taskRef);
        renderPage(doc, item.pageNum, canvas, W, H, zoomRef.current, taskRef, fitRef.current).catch(() => {});
      });
    }, { root: container, rootMargin: "300px 0px" });

    for (let i = 1; i <= doc.numPages; i++) {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "margin:8px auto;max-width:calc(100% - 8px);min-height:180px;display:flex;align-items:center;justify-content:center";
      wrapper.dataset.page = i;
      container.appendChild(wrapper);
      scrollPages.current.push({ wrapper, canvas: null, pageNum: i, rendered: false });
      scrollObs.current.observe(wrapper);
    }

    // Jump to the page we were already on (so switching into scroll keeps your place,
    // not the page the reader was opened at).
    const target = scrollPages.current[(pageRef.current || initPage) - 1];
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
      renderPage(doc, item.pageNum, item.canvas, W, H, zoom, taskRef, fitMode).catch(() => {});
    });
  }, [zoom, viewMode, doc, fitMode]);

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
      if (e.touches.length === 2) {
        pinch.current = { d: dist(e.touches), z: zoomRef.current };
        touchX.current = null;
        tapStart.current = null;
        e.preventDefault();
      } else {
        pinch.current = null;
        const mode = viewRef.current;
        touchX.current = (mode !== "scroll" && zoomRef.current <= 1.0) ? e.touches[0].clientX : null;
        touchY.current = e.touches[0].clientY;
        // Track every single-finger start (independent of the swipe gate) so a plain
        // tap can be detected in any mode — used to toggle the nav bars.
        tapStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
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
      if (pinch.current) { pinch.current = null; touchX.current = null; tapStart.current = null; return; }
      const ts = tapStart.current;
      tapStart.current = null;
      const ex = e.changedTouches[0].clientX;
      const ey = e.changedTouches[0].clientY;
      const tdx = ts ? ex - ts.x : 999;
      const tdy = ts ? ey - ts.y : 999;
      const isTap = Math.abs(tdx) <= 15 && Math.abs(tdy) <= 15;
      const step = viewRef.current === "dual" ? 2 : 1;

      if (isTap && ts) {
        const EDGE = 70;
        // Edge tap (single/dual only) → prev/next; centre tap (any mode) → toggle bars.
        if (viewRef.current !== "scroll" && ts.x < EDGE)                     { touchX.current = null; goTo(pageRef.current - step); return; }
        if (viewRef.current !== "scroll" && ts.x > window.innerWidth - EDGE) { touchX.current = null; goTo(pageRef.current + step); return; }
        touchX.current = null;
        toggleNav();
        return;
      }

      // Horizontal swipe → page turn (single/dual; ignore mostly-vertical = scrolling).
      if (touchX.current !== null && viewRef.current !== "scroll") {
        const dx = ex - touchX.current;
        const dy = ts ? ey - ts.y : 0;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) goTo(pageRef.current + (dx < 0 ? step : -step));
      }
      touchX.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove",  onMove,  { passive: false });
    el.addEventListener("touchend",   onEnd,   { passive: true  });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove",  onMove);
      el.removeEventListener("touchend",   onEnd);
    };
  }, [viewMode, doc, goTo, toggleNav]);

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
    <button title={tip} aria-label={tip} disabled={disabled} onClick={onClick} style={{
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
  const dispPage = scrubPage ?? page;

  return (
    <div ref={rootRef} style={{ position: "fixed", inset: 0, zIndex: 600, background: "#0a0905", userSelect: "none" }}>
      {/* ── Header (overlay — toggled by centre tap to reclaim full-screen space) ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 48, background: "#111009", borderBottom: `1px solid ${C.border}`,
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

        {/* Fit width / whole page (not meaningful in dual) */}
        {viewMode !== "dual" && (
          <Btn label="↔" onClick={() => setFitMode(m => m === "width" ? "page" : "width")}
               active={fitMode === "width"} title={fitMode === "width" ? t("reader.fitPage") : t("reader.fitWidth")} />
        )}

        {/* Fullscreen */}
        <Btn label={isFs ? "⤢" : "⛶"} onClick={e => { e.stopPropagation(); toggleFs(); }}
             active={isFs} title={isFs ? t("reader.exitFullscreen") : t("reader.fullscreen")} />

        {/* Night brightness (cycles off / dim / dimmer) */}
        <Btn label={dim === 0 ? "☼" : "🌙"} onClick={e => { e.stopPropagation(); cycleDim(); }}
             active={dim > 0} title={t("reader.brightness")} />

        <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />

        {/* Bookmarks */}
        <Btn label="🔖" onClick={e => { e.stopPropagation(); setShowBm(v => !v); }} active={showBm} title={t("reader.bookmarks")} />
        <Btn label={isBookmarked ? "★" : "☆"} onClick={e => { e.stopPropagation(); toggleBm(); }} active={isBookmarked} title={isBookmarked ? t("reader.removeBookmark") : t("reader.addBookmark")} />

        {/* Music indicator */}
        {nowPlaying && (
          <>
            <button onClick={e => { e.stopPropagation(); onMusicClick?.(); }} title={nowPlaying.title} aria-label={`Now playing: ${nowPlaying.title}. Open music section`}
              style={{ background:"transparent", border:"none", cursor:"pointer",
                       padding:"4px 2px 4px 4px", display:"flex", alignItems:"center",
                       maxWidth:72, overflow:"hidden", flexShrink:0 }}>
              <span style={{ fontSize:9, color:"rgba(212,203,184,0.5)", overflow:"hidden",
                             textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {nowPlaying.title}
              </span>
            </button>
            <button onClick={e => { e.stopPropagation(); onTogglePauseMusic?.(); }} title={musicPaused?t("reader.resumeMusic"):t("reader.pauseMusic")} aria-label={musicPaused?"Resume music":"Pause music"}
              style={{ background:"transparent", border:"none", cursor:"pointer",
                       padding:"4px 4px", color:nowPlaying.type==="youtube"?"#FF4444":"#1DB954",
                       fontSize:12, lineHeight:1, flexShrink:0 }}>
              {musicPaused ? "▶" : "⏸"}
            </button>
            <button onClick={e => { e.stopPropagation(); onStopMusic?.(); }} title={t("reader.stopMusic")} aria-label="Stop music"
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
          <Btn label="−" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.5} title="Zoom out" />
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.dim, minWidth: 28, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <Btn label="+" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} disabled={zoom >= 4} title="Zoom in" />
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

      {/* ── Main area (full-screen — bars overlay on top) ── */}
      <div ref={mainRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>

        {/* Single / Dual */}
        {viewMode !== "scroll" && (
          <div ref={wrapRef} style={{
            width: "100%", height: "100%", overflow: "auto", background: matBg,
            display: "flex", alignItems: "safe center", justifyContent: "safe center",
            scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent`,
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
              <div style={{ margin: 0, padding: 4, display: "flex", gap: 8, flexShrink: 0 }}>
                <canvas ref={canvasRef} style={{ display: "block", borderRadius: 2, boxShadow: "0 8px 40px rgba(0,0,0,.8)" }} />
                {viewMode === "dual" && page + 1 <= total && (
                  <canvas ref={canvas2Ref} style={{ display: "block", borderRadius: 2, boxShadow: "0 8px 40px rgba(0,0,0,.8)" }} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Scroll */}
        {viewMode === "scroll" && (
          <div ref={scrollRef} style={{
            width: "100%", height: "100%", overflow: "auto", background: matBg,
            scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent`,
          }}>
            {err && <div style={{ color: C.red, fontFamily: "'Cinzel',serif", fontSize: 13, textAlign: "center", padding: 40 }}>{t("reader.failedToLoadPdfWith").replace("{msg}", err)}</div>}
            {!doc && !err && <div style={{ color: C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 2, textAlign: "center", padding: 40 }}>{t("reader.loading")}</div>}
          </div>
        )}

        {/* Lateral page-turn — the outgoing page is blitted into this always-mounted
            overlay canvas (no image encode = no hitch) and slid off in the reading
            direction, revealing the freshly-rendered new page. pointerEvents:none so
            it never blocks the next gesture. */}
        <canvas ref={slideCanvasRef} aria-hidden="true" style={{
          position: "absolute", top: 0, left: 0, zIndex: 6, pointerEvents: "none",
          display: slide ? "block" : "none",
          transform: slideOut && slide ? `translateX(${slide.dir > 0 ? "-100%" : "100%"})` : "translateX(0)",
          transition: slideOut ? "transform 0.32s cubic-bezier(0.33,0.0,0.2,1)" : "none",
          boxShadow: slide && slide.dir > 0
            ? "8px 0 24px -6px rgba(0,0,0,0.5)"
            : "-8px 0 24px -6px rgba(0,0,0,0.5)",
        }} />

        {/* Night brightness veil — dims the page for night reading. Sits above the
            page/slide (zIndex 15) but below the bars (20) so controls stay legible.
            pointerEvents:none so gestures pass through. */}
        {dim > 0 && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 15, pointerEvents: "none",
            background: "#000", opacity: dim === 1 ? 0.26 : 0.46, transition: "opacity 0.25s",
          }} />
        )}

      </div>

      {/* ── Mobile bottom bar (overlay, all modes) ── */}
      {!isDesktop && total > 0 && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 48, background: "#111009", borderTop: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", padding: "0 6px", gap: 4, zIndex: 20,
          opacity: navVisible ? 1 : 0, transition: "opacity 0.3s",
          pointerEvents: navVisible ? "auto" : "none",
        }}>
          {/* Zoom controls */}
          <Btn label="−" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.5} title="Zoom out" />
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.dim, minWidth: 30, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <Btn label="+" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} disabled={zoom >= 4} title="Zoom in" />
          <Btn label="⊡" onClick={() => setZoom(1)} title={t("reader.resetZoom")} />

          {/* Navigation slider — drag to jump anywhere (handy on long PDFs) */}
          {total > 1 && (
            <input
              type="range" min={1} max={total} step={1} value={Math.min(dispPage, total)}
              aria-label={t("reader.jumpToPage")}
              onChange={e => setScrubPage(parseInt(e.target.value, 10))}
              onPointerUp={() => { if (scrubPage != null) { jumpToPage(scrubPage); setScrubPage(null); } }}
              onPointerCancel={() => setScrubPage(null)}
              onTouchEnd={() => { if (scrubPage != null) { jumpToPage(scrubPage); setScrubPage(null); } }}
              style={{ flex: 1, minWidth: 60, height: 22, accentColor: C.gold, cursor: "pointer" }}
            />
          )}
          {total <= 1 && <div style={{ flex: 1 }} />}

          {/* Page nav — single / dual */}
          {viewMode !== "scroll" && (<>
            <button onClick={() => goTo(page - step)} disabled={page <= 1} aria-label="Previous page" style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
              color: page <= 1 ? C.dim : C.gold, padding: "6px 12px",
              cursor: page <= 1 ? "default" : "pointer",
              fontFamily: "'Cinzel',serif", fontSize: 12, opacity: page <= 1 ? 0.3 : 1,
            }}>‹</button>
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: scrubPage != null ? C.gold : C.muted, minWidth: 46, textAlign: "center" }}>
              {viewMode === "dual" ? `${dispPage}–${Math.min(dispPage + 1, total)}` : dispPage} / {total}
            </span>
            <button onClick={() => goTo(page + step)} disabled={page + step - 1 >= total} aria-label="Next page" style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
              color: page + step - 1 >= total ? C.dim : C.gold, padding: "6px 12px",
              cursor: page + step - 1 >= total ? "default" : "pointer",
              fontFamily: "'Cinzel',serif", fontSize: 12, opacity: page + step - 1 >= total ? 0.3 : 1,
            }}>›</button>
          </>)}

          {/* Page counter — scroll */}
          {viewMode === "scroll" && (
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: scrubPage != null ? C.gold : C.muted, minWidth: 46, textAlign: "center" }}>{dispPage} / {total}</span>
          )}
        </div>
      )}
    </div>
  );
}
