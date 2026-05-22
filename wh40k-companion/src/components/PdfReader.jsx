import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { C } from "../data/constants";
import { Worker, Viewer, SpecialZoomLevel } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function saveProgress(userId, bookId, page, total) {
  if (!userId || !bookId) return;
  try {
    const pct = total > 1 ? Math.round((page / (total - 1)) * 100) : 0;
    const key = `wh40k_prog_${userId}_${bookId}`;
    const ex = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...ex, page_index: page, progress_pct: pct, bookmarkedAt: new Date().toISOString() }));
    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token ?? SB_KEY;
    await fetch(`${SB_URL}/rest/v1/reading_progress?on_conflict=user_id,book_id`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
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

  const savedPage = (() => {
    if (!userId || !bookId) return 0;
    try {
      const p = JSON.parse(localStorage.getItem(`wh40k_prog_${userId}_${bookId}`) || "{}");
      return Math.max(0, (p.page_index || 1) - 1); // react-pdf-viewer is 0-indexed
    } catch {}
    return 0;
  })();

  const saveTimer = useRef(null);
  const totalPagesRef = useRef(0);

  const handlePageChange = useCallback(({ currentPage }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProgress(userId, bookId, currentPage + 1, totalPagesRef.current);
    }, 1500);
  }, [userId, bookId]);

  const handleDocumentLoad = useCallback(({ doc }) => {
    totalPagesRef.current = doc.numPages;
  }, []);

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "#0a0905", display: "flex", flexDirection: "column" }}>
      <style>{`
        /* ── WH40K dark-theme overrides for react-pdf-viewer ── */
        .rpv-core__viewer { background: #111 !important; }
        .rpv-core__inner-page { padding: 8px !important; }
        .rpv-toolbar { background: #111009 !important; border-bottom: 1px solid #2a2518 !important; }
        .rpv-toolbar__item button,
        .rpv-toolbar__item input { color: #d4cbb8 !important; background: transparent !important; }
        .rpv-toolbar__item button:hover { background: rgba(201,168,76,0.12) !important; color: #c9a84c !important; }
        .rpv-toolbar__item input { border: 1px solid #2a2518 !important; border-radius: 4px !important; }
        .rpv-sidebar { background: #111009 !important; border-right: 1px solid #2a2518 !important; }
        .rpv-sidebar__tab { color: #7a7060 !important; }
        .rpv-sidebar__tab--selected { color: #c9a84c !important; border-bottom: 2px solid #c9a84c !important; }
        .rpv-thumbnail__container { background: #16140f !important; }
        .rpv-core__page-layer { background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.7) !important; }
        .rpv-zoom__popover-body { background: #111009 !important; border: 1px solid #2a2518 !important; }
        .rpv-zoom__popover-target-arrow,
        .rpv-zoom__popover-body button { color: #d4cbb8 !important; }
        .rpv-zoom__popover-body button:hover { background: rgba(201,168,76,0.12) !important; color: #c9a84c !important; }
        .rpv-search__popover { background: #111009 !important; border: 1px solid #2a2518 !important; }
        .rpv-search__popover input { background: #16140f !important; color: #d4cbb8 !important; border: 1px solid #2a2518 !important; }
        .rpv-core__minimal-button { color: #d4cbb8 !important; }
        .rpv-core__minimal-button:hover { background: rgba(201,168,76,0.12) !important; color: #c9a84c !important; }
        .rpv-scroll-mode__popover-body,
        .rpv-page-navigation__popover { background: #111009 !important; border: 1px solid #2a2518 !important; color: #d4cbb8 !important; }
        .rpv-core__tooltip-body { background: #16140f !important; border: 1px solid #2a2518 !important; color: #d4cbb8 !important; }
        .rpv-default-layout__container { height: 100% !important; }
        .rpv-default-layout__sidebar--opened { width: 220px !important; }
        .rpv-bookmark__title { color: #d4cbb8 !important; }
        .rpv-bookmark__title:hover { color: #c9a84c !important; }
        .rpv-attachment__item { color: #d4cbb8 !important; }
        .rpv-attachment__item:hover { background: rgba(201,168,76,0.12) !important; }
        /* Scrollbar */
        .rpv-core__viewer ::-webkit-scrollbar { width: 4px; height: 4px; }
        .rpv-core__viewer ::-webkit-scrollbar-track { background: #0a0905; }
        .rpv-core__viewer ::-webkit-scrollbar-thumb { background: #2a2518; border-radius: 2px; }
      `}</style>

      {/* ── Our header with Back button ── */}
      <div style={{
        flexShrink: 0, height: 48,
        background: "#111009", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", padding: "0 12px", gap: 12,
        zIndex: 10,
      }}>
        <button onClick={onClose}
          style={{ background: "transparent", border: `1px solid ${C.dim}`, borderRadius: 8,
                   color: C.gold, padding: "5px 14px", cursor: "pointer",
                   fontFamily: "'Cinzel',serif", fontSize: 12, letterSpacing: 1, flexShrink: 0 }}>
          ← Back
        </button>
        <div style={{ flex: 1, fontFamily: "'Cinzel',serif", fontSize: 12, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.red, letterSpacing: 2,
                       border: `1px solid ${C.red}55`, borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>
          PDF
        </span>
      </div>

      {/* ── PDF Viewer ── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <Worker workerUrl={workerUrl}>
          <Viewer
            fileUrl={url}
            theme="dark"
            initialPage={savedPage}
            defaultScale={SpecialZoomLevel.PageFit}
            onPageChange={handlePageChange}
            onDocumentLoad={handleDocumentLoad}
            plugins={[defaultLayoutPluginInstance]}
          />
        </Worker>
      </div>
    </div>
  );
}
