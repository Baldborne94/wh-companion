import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { supabase } from "../lib/supabase";
import { C, FC, STATUS_CFG } from "../data/constants";
import { BOOKS, ALL_SERIES, ALL_FACTIONS, ALL_TYPES, ALL_ERAS } from "../data/books";
import { UPCOMING_RELEASES, RELEASES_UPDATED } from "../data/releases";
import CoverImage from "./CoverImage";
import BookDetail from "./BookDetail";
import { getBookRating } from "../lib/bookStatus";
import { cacheListIds } from "../lib/ebookCache";
import { useLang } from "../lib/i18n.jsx";

const EpubReader = lazy(() => import("./EpubReader"));
const PdfReader  = lazy(() => import("./PdfReader"));

const PAGE_SIZE = 40;
const LOAD_MORE = 30;

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function LibrarySection({ user, statuses = {}, onStatusChange, openDetailBook, onDetailConsumed }) {
  const { t, locale } = useLang();
  const [tab,         setTab]         = useState("catalogue");
  const [viewMode,    setViewMode]    = useState("card");
  const [search,      setSearch]      = useState("");
  const [series,      setSeries]      = useState("All");
  const [faction,     setFaction]     = useState("All");
  const [type,        setType]        = useState("All");
  const [era,         setEra]         = useState("All");
  const [status,      setStatus]      = useState("All");
  const [sort,        setSort]        = useState("default");
  const [showFilters, setShowFilters] = useState(false);
  const [detail,      setDetail]      = useState(null);
  const [reader,      setReader]      = useState(null);
  const [shelfBooks,  setShelfBooks]  = useState([]);
  const [shelfLoading,setShelfLoading]= useState(false);
  const [readingProgress, setReadingProgress] = useState({});
  const [cachedIds, setCachedIds] = useState(() => new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  const dSearch = useDebounce(search, 250);

  // Deep-link: open a specific book's detail when navigated here from elsewhere (e.g. Home shelf).
  useEffect(() => {
    if (openDetailBook) { setDetail(openDetailBook); onDetailConsumed?.(); }
  }, [openDetailBook]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [dSearch, series, faction, type, era, status, sort]);

  // IntersectionObserver — load 30 more when sentinel enters viewport
  // No dep array: runs after every render so the observer always tracks the current sentinel element.
  // The sentinel is only rendered when hasMore is true, so this self-throttles naturally.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisibleCount(v => v + LOAD_MORE); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  });

  useEffect(() => {
    if (!user?.id || !navigator.onLine) return;
    supabase.from("reading_progress").select("book_id,progress_pct").eq("user_id", user.id)
      .then(({ data }) => {
        if (!data?.length) return;
        const map = {};
        data.forEach(r => { if (r.book_id && r.progress_pct != null) map[r.book_id] = r.progress_pct; });
        setReadingProgress(map);
      })
      .catch(() => {});
  }, [user?.id]);

  // Pre-load shelf from localStorage cache on mount
  useEffect(() => {
    if (!user?.id) return;
    const lsBooks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`wh40k_ebook_${user.id}_`)) {
        try {
          const meta = JSON.parse(localStorage.getItem(key));
          if (meta?.book_id) { const book = BOOKS.find(b => b.id === Number(meta.book_id)); if (book) lsBooks.push({ ...book, _file: meta }); }
        } catch {}
      }
    }
    if (lsBooks.length > 0) setShelfBooks(lsBooks);
  }, [user?.id]);

  const [shelfSeed, setShelfSeed] = useState(0);
  const refreshShelf = () => setShelfSeed(s => s + 1);

  // Build the shelf from purely local sources: localStorage meta + IndexedDB cache.
  // A book appears if we have its meta OR its file is cached for offline reading.
  const buildLocalShelf = async () => {
    const metas = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`wh40k_ebook_${user.id}_`)) {
        try { const m = JSON.parse(localStorage.getItem(key)); if (m?.book_id) metas[Number(m.book_id)] = m; } catch {}
      }
    }
    const cached = await cacheListIds(user.id);
    const ids = new Set([...Object.keys(metas).map(Number), ...cached]);
    return BOOKS.filter(b => ids.has(b.id)).map(b => ({ ...b, _file: metas[b.id] || { book_id: b.id, file_type: 'epub' } }));
  };

  // Which ebooks are downloaded to IndexedDB (readable offline). Refresh after
  // uploads/opens (shelfSeed) and when returning from the reader (reader === null).
  useEffect(() => {
    if (!user?.id) { setCachedIds(new Set()); return; }
    cacheListIds(user.id).then(setCachedIds);
  }, [user?.id, shelfSeed, reader]);

  // Load shelf books whenever tab switches to shelf (or after an upload).
  // Offline: skip the network entirely and build from local sources so the
  // shelf never hangs on a request that can't complete.
  useEffect(() => {
    if (!user?.id) { setShelfBooks([]); setShelfLoading(false); return; }
    if (tab === "shelf") setShelfLoading(true);
    if (!navigator.onLine) {
      buildLocalShelf().then(b => { setShelfBooks(b); setShelfLoading(false); });
      return;
    }
    supabase.from("ebook_files").select("book_id,file_name,file_path,file_type").eq("user_id", user.id)
      .then(async ({ data: files }) => {
        if (files?.length) {
          const ids = new Set(files.map(f => Number(f.book_id)));
          setShelfBooks(BOOKS.filter(b => ids.has(b.id)).map(b => ({ ...b, _file: files.find(f => Number(f.book_id) === b.id) })));
        } else {
          setShelfBooks(await buildLocalShelf());
        }
        setShelfLoading(false);
      })
      .catch(async () => { setShelfBooks(await buildLocalShelf()); setShelfLoading(false); });
  }, [tab, user?.id, shelfSeed]);

  const handleOpenReader = ({ book, arrayBuffer, fileType, progress, chapterIndex, pageIndex }) =>
    setReader({ book, arrayBuffer, fileType, progress, chapterIndex, pageIndex: pageIndex || 0 });

  const filtered = useMemo(() => BOOKS.filter(b => {
    if (series  !== "All" && b.series  !== series)  return false;
    if (faction !== "All" && b.faction !== faction) return false;
    if (type    !== "All" && b.type    !== type)    return false;
    if (era     !== "All" && b.era     !== era)     return false;
    if (status  !== "All") {
      const bst = statuses[b.id]?.status || 'none';
      if (status === "unread" ? bst !== 'none' : bst !== status) return false;
    }
    if (dSearch) { const q = dSearch.toLowerCase(); return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.series.toLowerCase().includes(q); }
    return true;
  }), [series, faction, type, era, status, dSearch, statuses]);

  // Sorting — applied after filtering. "default" keeps the curated BOOKS order
  // (series → number), which is meaningful for reading guides.
  const sorted = useMemo(() => {
    if (sort === "default") return filtered;
    const arr = [...filtered];
    if (sort === "title")       arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "author") arr.sort((a, b) => a.author.localeCompare(b.author));
    else if (sort === "rating") arr.sort((a, b) => getBookRating(user?.id, b.id) - getBookRating(user?.id, a.id));
    return arr;
  }, [filtered, sort, user?.id]);

  const sfilt = useMemo(() => {
    if (!dSearch) return shelfBooks;
    const q = dSearch.toLowerCase();
    return shelfBooks.filter(b => b.title.toLowerCase().includes(q) || b.series.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
  }, [shelfBooks, dSearch]);

  if (reader) {
    const { book, arrayBuffer, fileType, progress, chapterIndex } = reader;
    return (
      <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "#0f0e09", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 48, animation: "spin 2s linear infinite" }}>⚙</div></div>}>
        {fileType === "pdf"
          ? <PdfReader arrayBuffer={arrayBuffer} title={book.title} bookId={book.id} userId={user?.id} onClose={() => setReader(null)} />
          : <EpubReader arrayBuffer={arrayBuffer} title={book.title} bookId={book.id} userId={user?.id} initProgress={progress} initChapterIndex={chapterIndex || 0} initPageIndex={reader.pageIndex || 0} onProgress={() => {}} onClose={() => setReader(null)} />
        }
      </Suspense>
    );
  }
  if (detail) return <BookDetail book={detail} user={user} onBack={() => setDetail(null)} onOpenReader={handleOpenReader} status={statuses[detail.id]} onStatusChange={onStatusChange} onEbookUploaded={refreshShelf} />;

  const isFiltered = series !== "All" || faction !== "All" || type !== "All" || era !== "All" || status !== "All" || sort !== "default";
  const Chip = ({ label, active, onClick }) => (
    <button onClick={onClick} style={{ background: active ? `${C.gold}22` : "transparent", border: `1px solid ${active ? C.gold : C.dim}`, borderRadius: 20, padding: "6px 14px", color: active ? C.gold : C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
  );

  const visibleFiltered = sorted.slice(0, visibleCount);
  const hasMore = sorted.length > visibleCount;

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: "20px 16px 0", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 5, color: C.goldDim, textTransform: "uppercase", marginBottom: 6 }}>{t("library.eyebrow")}</div>
        <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 24, color: C.text, marginBottom: 12 }}>{t("library.title")}</h2>
        <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
          {[{ l: t("library.stats.tomes"), v: BOOKS.length, color: C.text }, { l: t("library.stats.read"), v: Object.values(statuses).filter(s => s.status === 'read').length, color: "#4aaa6a" }, { l: t("library.stats.reading"), v: Object.values(statuses).filter(s => s.status === 'reading').length, color: "#4a8adc" }, { l: t("library.stats.ebook"), v: shelfBooks.length, color: C.gold }].map(s => (
            <div key={s.l}><div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 2, textTransform: "uppercase" }}>{s.l}</div><div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 20, color: s.color }}>{s.v}</div></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {[{ id: "catalogue", label: t("library.tabs.catalogue") }, { id: "shelf", label: `${t("library.tabs.shelf")}${shelfBooks.length > 0 ? ` (${shelfBooks.length})` : ""}` }, { id: "upcoming", label: t("library.tabs.upcoming") }].map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{ flex: 1, padding: "10px", background: "transparent", border: "none", borderBottom: `2px solid ${tab === tb.id ? C.gold : "transparent"}`, color: tab === tb.id ? C.gold : C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 2, cursor: "pointer", textTransform: "uppercase" }}>{tb.label}</button>
          ))}
        </div>
      </div>

      {tab === "shelf" && (
        <>
          {shelfLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted, fontStyle: "italic" }}>{t("library.shelf.loading")}</div>
          ) : shelfBooks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 52 }}>📂</div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 16, color: C.muted }}>{t("library.shelf.emptyTitle")}</div>
              <div style={{ color: C.muted, fontSize: 13, maxWidth: 280, lineHeight: 1.6, textAlign: "center" }}>{t("library.shelf.emptyDesc")}</div>
              <button onClick={() => setTab("catalogue")} style={{ background: `${C.gold}22`, border: `1px solid ${C.gold}`, borderRadius: 8, padding: "10px 24px", color: C.gold, fontFamily: "'Cinzel',serif", fontSize: 12, letterSpacing: 2, cursor: "pointer", textTransform: "uppercase" }}>{t("library.shelf.goToCatalogue")}</button>
            </div>
          ) : (
            <>
              <div style={{ padding: "12px 16px 0" }}>
                <div style={{ position: "relative" }}>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("library.shelf.searchPlaceholder")}
                    style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "12px 40px 12px 44px", fontSize: 15, outline: "none" }} />
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 18, pointerEvents: "none" }}>🔍</span>
                  {search && <button onClick={() => setSearch("")} aria-label="Clear search" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>}
                </div>
              </div>
              <div style={{ padding: "8px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.muted, flex: 1 }}>{sfilt.length} {t("library.shelf.count")}</span>
                <div style={{ display: "flex", gap: 2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2 }}>
                  {[{ m: "card", icon: "▦" }, { m: "list", icon: "☰" }, { m: "shelf", icon: "📚" }].map(v => (
                    <button key={v.m} onClick={() => setViewMode(v.m)}
                      style={{ background: viewMode === v.m ? `${C.gold}33` : "transparent", border: "none", borderRadius: 6, width: 28, height: 26, cursor: "pointer", color: viewMode === v.m ? C.gold : C.muted, fontSize: viewMode === v.m ? 13 : 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {v.icon}
                    </button>
                  ))}
                </div>
              </div>
              {(() => {
                if (sfilt.length === 0) return <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted, fontStyle: "italic" }}>{t("library.shelf.noResults")}</div>;
                if (viewMode === "card") return (
                  <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {sfilt.map(book => {
                      const fc2 = FC[book.faction] || C.dim;
                      const bst = statuses[book.id]?.status || 'none';
                      const bstCfg = STATUS_CFG[bst];
                      return (
                        <button key={book.id} type="button" onClick={() => setDetail(book)}
                          style={{ background: `linear-gradient(135deg,${fc2}22,${C.card})`, border: `1px solid ${C.gold}55`, borderLeft: `3px solid ${C.gold}`, borderRadius: 8, padding: "10px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", width: "100%", textAlign: "left", transition: "transform 0.18s ease, box-shadow 0.18s ease" }}
                          onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=`0 6px 18px ${C.gold}22`; }}
                          onMouseLeave={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}
                          onTouchStart={e=>{ e.currentTarget.style.transform="scale(0.985)"; e.currentTarget.style.boxShadow=`0 0 0 1px ${C.gold}55`; }}
                          onTouchEnd={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}
                          onTouchCancel={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
                          <CoverImage book={book} width={54} height={80} radius={3} accentColor={fc2} />
                          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.goldDim, letterSpacing: 1, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.series}{book.num > 0 ? ` #${book.num}` : ""}</div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                                {cachedIds.has(book.id) && <span title={t("library.offlineTitle")} style={{ background: `${C.green}22`, border: `1px solid ${C.green}55`, borderRadius: 4, padding: "2px 6px", fontFamily: "'Cinzel',serif", fontSize: 8, color: C.green, letterSpacing: 1 }}>⬇ {t("library.offline")}</span>}
                                {bst !== 'none' && <span style={{ fontSize: 13 }}>{bstCfg.icon}</span>}
                                <span style={{ background: `${C.gold}22`, border: `1px solid ${C.gold}44`, borderRadius: 4, padding: "2px 7px", fontFamily: "'Cinzel',serif", fontSize: 9, color: C.gold, letterSpacing: 1 }}>EPUB</span>
                              </div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3, fontFamily: "'Cinzel',serif" }}>{book.title}</div>
                            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>{book.author}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
                if (viewMode === "list") return (
                  <div style={{ padding: "6px 16px 16px" }}>
                    {sfilt.map(book => {
                      const fc2 = FC[book.faction] || C.dim;
                      const bst = statuses[book.id]?.status || 'none';
                      const bstCfg = STATUS_CFG[bst];
                      return (
                        <button key={book.id} type="button" onClick={() => setDetail(book)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer", width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${C.border}44`, background: "transparent" }}>
                          <CoverImage book={book} width={36} height={52} radius={2} accentColor={fc2} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.title}</div>
                            <div style={{ fontSize: 10, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.series}{book.num > 0 ? ` #${book.num}` : ""} · {book.author}</div>
                          </div>
                          {cachedIds.has(book.id) && <span title={t("library.offlineTitle")} style={{ fontSize: 12, color: C.green, flexShrink: 0 }}>⬇</span>}
                          {bst !== 'none' && <span style={{ fontSize: 14, flexShrink: 0 }}>{bstCfg.icon}</span>}
                          <span style={{ color: C.dim, fontSize: 14, flexShrink: 0 }}>›</span>
                        </button>
                      );
                    })}
                  </div>
                );
                // shelf view
                const seriesMap = {};
                sfilt.forEach(b => { if (!seriesMap[b.series]) seriesMap[b.series] = []; seriesMap[b.series].push(b); });
                return (
                  <div style={{ padding: "8px 0 16px" }}>
                    {Object.entries(seriesMap).map(([sName, books]) => (
                      <div key={sName} style={{ marginBottom: 6 }}>
                        <div style={{ padding: "6px 16px 4px", fontFamily: "'Cinzel',serif", fontSize: 10, color: C.gold, letterSpacing: 2 }}>{sName}</div>
                        <div style={{ overflowX: "auto", paddingBottom: 2 }}>
                          <div style={{ display: "flex", gap: 2, padding: "0 16px", minWidth: "max-content", alignItems: "flex-end" }}>
                            {[...books].sort((a, b) => a.num - b.num).map(book => {
                              const sc = FC[book.faction] || C.dim;
                              const bst = statuses[book.id]?.status || 'none';
                              const bstCfg = STATUS_CFG[bst];
                              return (
                                <button key={book.id} type="button" onClick={() => setDetail(book)} title={book.title}
                                  style={{ flexShrink: 0, width: 24, height: 110, background: `linear-gradient(to right,${sc}ee,${sc}88,${sc}bb)`, borderRadius: "3px 3px 0 0", cursor: "pointer", position: "relative", boxShadow: `inset -2px 0 3px rgba(0,0,0,0.4),2px 0 2px rgba(0,0,0,0.3)`, border: `1px solid ${C.gold}66`, borderBottom: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", transition: "transform 0.12s", padding: 0 }}
                                  onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
                                  onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: "'Cinzel',serif", fontSize: 6, color: "rgba(255,255,255,0.85)", letterSpacing: 0.8, overflow: "hidden", maxHeight: "90%", padding: "3px 2px", textShadow: "0 1px 2px rgba(0,0,0,0.9)", lineHeight: 1.1, textAlign: "center" }}>
                                    {book.num > 0 ? `#${book.num} ` + book.title.split(' ').slice(0, 3).join(' ') : book.title.split(' ').slice(0, 3).join(' ')}
                                  </div>
                                  {bst !== 'none' && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: bstCfg.color }} />}
                                  <div style={{ position: "absolute", inset: 0, border: `1px solid ${C.gold}44`, borderRadius: "3px 3px 0 0", pointerEvents: "none" }} />
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ height: 8, background: "linear-gradient(to bottom,#5a3a1a,#3a2010)", margin: "0 16px", borderRadius: "0 0 3px 3px", boxShadow: "0 2px 5px rgba(0,0,0,0.5)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}

      {tab === "upcoming" && (
        <div style={{ paddingBottom: 20 }}>
          <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted, letterSpacing: 1 }}>
              {t("library.upcoming.updatedAsOf")} {new Date(RELEASES_UPDATED).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <a href="https://www.blacklibrary.com" target="_blank" rel="noopener noreferrer"
              style={{ marginLeft: "auto", fontFamily: "'Cinzel',serif", fontSize: 9, color: C.blue, letterSpacing: 1, textDecoration: "none", flexShrink: 0 }}>
              blacklibrary.com ›
            </a>
          </div>
          {UPCOMING_RELEASES.map(group => (
            <div key={group.month} style={{ marginBottom: 14 }}>
              <div style={{ padding: "6px 16px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: C.gold, letterSpacing: 3, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{group.month}</div>
              <div style={{ padding: "6px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {group.items.map((item, i) => {
                  const typeColor = item.type === 'Novel' ? C.text : item.type === 'Anthology' ? C.blue : C.goldDim;
                  const uLabel = item.universe === 'aos' ? 'AoS' : '40K';
                  const uColor = item.universe === 'aos' ? '#4aaa6a' : C.red;
                  return (
                    <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${item.universe === 'aos' ? '#4aaa6a44' : C.gold + '44'}`, borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ background: `${uColor}22`, border: `1px solid ${uColor}55`, borderRadius: 4, padding: "1px 5px", fontFamily: "'Cinzel',serif", fontSize: 8, color: uColor, letterSpacing: 1, flexShrink: 0 }}>{uLabel}</span>
                          <span style={{ background: `${typeColor}18`, border: `1px solid ${typeColor}33`, borderRadius: 4, padding: "1px 5px", fontFamily: "'Cinzel',serif", fontSize: 8, color: typeColor, letterSpacing: 1, flexShrink: 0 }}>{item.type}</span>
                          {item.faction && <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.muted, letterSpacing: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.faction}</span>}
                        </div>
                        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: 2 }}>{t("library.upcoming.by")} {item.author}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "catalogue" && (
        <>
          <div style={{ padding: "12px 16px 0" }}>
            <div style={{ position: "relative" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("library.catalogue.searchPlaceholder")} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "12px 40px 12px 44px", fontSize: 15, outline: "none" }} />
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 18, pointerEvents: "none" }}>🔍</span>
              {search && <button onClick={() => setSearch("")} aria-label="Clear search" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>}
            </div>
          </div>
          <div style={{ padding: "8px 16px", display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setShowFilters(f => !f)} style={{ background: showFilters || isFiltered ? `${C.gold}22` : "transparent", border: `1px solid ${showFilters || isFiltered ? C.gold : C.dim}`, borderRadius: 20, padding: "7px 14px", color: showFilters || isFiltered ? C.gold : C.muted, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 1, cursor: "pointer" }}>⚙ {t("library.catalogue.filters")}{isFiltered ? " •" : ""}</button>
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.muted, flex: 1 }}>{filtered.length} {t("library.catalogue.titlesCount")}</span>
            {isFiltered && <button onClick={() => { setSeries("All"); setFaction("All"); setType("All"); setEra("All"); setStatus("All"); setSort("default"); }} style={{ background: "transparent", border: `1px solid ${C.red}55`, borderRadius: 20, padding: "5px 12px", color: C.red, fontFamily: "'Cinzel',serif", fontSize: 10, cursor: "pointer" }}>{t("library.catalogue.reset")}</button>}
            <div style={{ display: "flex", gap: 2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2 }}>
              {[{ m: "card", icon: "▦", title: t("library.viewTitles.card") }, { m: "list", icon: "☰", title: t("library.viewTitles.list") }, { m: "shelf", icon: "📚", title: t("library.viewTitles.shelf") }].map(v => (
                <button key={v.m} onClick={() => setViewMode(v.m)} title={v.title}
                  style={{ background: viewMode === v.m ? `${C.gold}33` : "transparent", border: "none", borderRadius: 6, width: 28, height: 26, cursor: "pointer", color: viewMode === v.m ? C.gold : C.muted, fontSize: viewMode === v.m ? 13 : 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {v.icon}
                </button>
              ))}
            </div>
          </div>
          {showFilters && (
            <div style={{ padding: "0 16px 12px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>{t("library.filterLabels.status")}</div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {[{ v: "All", l: t("library.statusFilter.all") }, { v: "want", l: t("library.statusFilter.want") }, { v: "reading", l: t("library.statusFilter.reading") }, { v: "read", l: t("library.statusFilter.read") }, { v: "unread", l: t("library.statusFilter.unread") }].map(o => (
                    <Chip key={o.v} label={o.l} active={status === o.v} onClick={() => setStatus(o.v)} />
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>{t("library.filterLabels.sortBy")}</div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {[{ v: "default", l: t("library.sortFilter.default") }, { v: "title", l: t("library.sortFilter.title") }, { v: "author", l: t("library.sortFilter.author") }, { v: "rating", l: t("library.sortFilter.rating") }].map(o => (
                    <Chip key={o.v} label={o.l} active={sort === o.v} onClick={() => setSort(o.v)} />
                  ))}
                </div>
              </div>
              {[{ key: "series", label: t("library.filterLabels.series"), value: series, set: setSeries, opts: ALL_SERIES.slice(0, 22) }, { key: "faction", label: t("library.filterLabels.faction"), value: faction, set: setFaction, opts: ALL_FACTIONS }, { key: "type", label: t("library.filterLabels.type"), value: type, set: setType, opts: ALL_TYPES }, { key: "era", label: t("library.filterLabels.era"), value: era, set: setEra, opts: ALL_ERAS }].map(f => (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>{f.label}</div>
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                    {f.opts.map(o => <Chip key={o} label={o === "All" ? t("library.statusFilter.all") : o} active={f.value === o} onClick={() => f.set(o)} />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── VIEW: CARD ── */}
          {viewMode === "card" && (
            <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.length === 0
                ? <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontStyle: "italic" }}>{t("library.catalogue.empty")}</div>
                : visibleFiltered.map(book => {
                  const fc2 = FC[book.faction] || C.dim;
                  const tc  = book.type === "Codex" ? C.red : C.gold;
                  const bst = statuses[book.id]?.status || 'none';
                  const bstCfg = STATUS_CFG[bst];
                  const borderColor = bst !== 'none' ? bstCfg.color : fc2;
                  const pct = readingProgress[book.id] || 0;
                  const pctPct = Math.round(pct * 100);
                  return (
                    <div key={book.id} onClick={() => setDetail(book)}
                      style={{ background: `linear-gradient(135deg,${fc2}18,${C.card})`, border: `1px solid ${bst !== 'none' ? bstCfg.color + "44" : fc2 + "44"}`, borderLeft: `3px solid ${borderColor}`, borderRadius: 8, padding: "10px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", position: "relative", overflow: "hidden", transition: "transform 0.18s ease, box-shadow 0.18s ease" }}
                      onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=`0 6px 18px ${C.gold}22`; }}
                      onMouseLeave={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}
                      onTouchStart={e=>{ e.currentTarget.style.transform="scale(0.985)"; e.currentTarget.style.boxShadow=`0 0 0 1px ${C.gold}55`; }}
                      onTouchEnd={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}
                      onTouchCancel={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
                      {pctPct > 0 && pctPct < 100 && <div style={{ position: "absolute", bottom: 0, left: 0, width: `${pctPct}%`, height: 2, background: "#4a8adc88", pointerEvents: "none" }} />}
                      {pctPct >= 100 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "#4aaa6a88", pointerEvents: "none" }} />}
                      <CoverImage book={book} width={54} height={80} radius={3} accentColor={fc2} />
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 1, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.series}{book.num > 0 ? ` #${book.num}` : ""}</div>
                          <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                            {pctPct > 0 && pctPct < 100 && <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: "#4a8adc" }}>{pctPct}%</span>}
                            {bst !== 'none' && <span style={{ fontSize: 12 }}>{bstCfg.icon}</span>}
                            <span style={{ background: `${tc}22`, border: `1px solid ${tc}44`, borderRadius: 4, padding: "2px 6px", fontFamily: "'Cinzel',serif", fontSize: 8, color: tc, letterSpacing: 1 }}>{book.type}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: bst === 'read' ? C.muted : C.text, lineHeight: 1.3, fontFamily: "'Cinzel',serif", opacity: bst === 'read' ? 0.75 : 1 }}>{book.title}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>{book.author}</div>
                        <div style={{ fontSize: 10, color: FC[book.faction] || C.dim, marginTop: 2, fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>{book.faction}</div>
                        {(() => { const r = getBookRating(user?.id, book.id); return r > 0 ? <div style={{ fontSize: 11, color: C.gold, letterSpacing: 2, marginTop: 2 }}>{'★'.repeat(r) + '☆'.repeat(5 - r)}</div> : null; })()}
                      </div>
                    </div>
                  );
                })}
              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            </div>
          )}

          {/* ── VIEW: LIST ── */}
          {viewMode === "list" && (
            <div style={{ padding: "6px 16px 16px" }}>
              {filtered.length === 0
                ? <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontStyle: "italic" }}>{t("library.catalogue.empty")}</div>
                : visibleFiltered.map(book => {
                  const fc2 = FC[book.faction] || C.dim;
                  const bst = statuses[book.id]?.status || 'none';
                  const bstCfg = STATUS_CFG[bst];
                  const pct = readingProgress[book.id] || 0;
                  const pctPct = Math.round(pct * 100);
                  return (
                    <div key={book.id} onClick={() => setDetail(book)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}44`, cursor: "pointer", position: "relative" }}>
                      <CoverImage book={book} width={36} height={52} radius={2} accentColor={fc2} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: bst === 'read' ? C.muted : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: bst === 'read' ? 0.7 : 1 }}>{book.title}</div>
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.series}{book.num > 0 ? ` #${book.num}` : ""} · {book.author}</div>
                      </div>
                      {pctPct > 0 && pctPct < 100 && <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: "#4a8adc", flexShrink: 0 }}>{pctPct}%</span>}
                      {bst !== 'none' && <span style={{ fontSize: 14, flexShrink: 0 }}>{bstCfg.icon}</span>}
                      <span style={{ color: C.dim, fontSize: 14, flexShrink: 0 }}>›</span>
                      {pctPct > 0 && pctPct < 100 && <div style={{ position: "absolute", bottom: 0, left: 0, width: `${pctPct}%`, height: 1, background: "#4a8adc88", pointerEvents: "none" }} />}
                      {pctPct >= 100 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "#4aaa6a88", pointerEvents: "none" }} />}
                    </div>
                  );
                })}
              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            </div>
          )}

          {/* ── VIEW: SHELF (by series) ── */}
          {viewMode === "shelf" && (()=> {
            if (filtered.length === 0) return <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontStyle: "italic" }}>{t("library.catalogue.empty")}</div>;
            const seriesMap = {};
            filtered.forEach(b => { if (!seriesMap[b.series]) seriesMap[b.series] = []; seriesMap[b.series].push(b); });
            const seriesEntries = Object.entries(seriesMap).sort((a, b) => b[1].length - a[1].length);
            return (
              <div style={{ padding: "8px 0 16px" }}>
                {seriesEntries.map(([sName, books]) => {
                  const readC   = books.filter(b => statuses[b.id]?.status === 'read').length;
                  const readingC= books.filter(b => statuses[b.id]?.status === 'reading').length;
                  return (
                    <div key={sName} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 16px 4px" }}>
                        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.gold, letterSpacing: 2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sName}</div>
                        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.muted, letterSpacing: 1, flexShrink: 0 }}>
                          {readC > 0 && <span style={{ color: C.green }}>✅{readC} </span>}
                          {readingC > 0 && <span style={{ color: C.blue }}>📖{readingC} </span>}
                          <span>{books.length} {t("library.upcoming.booksCount")}</span>
                        </div>
                      </div>
                      <div style={{ overflowX: "auto", paddingBottom: 2 }}>
                        <div style={{ display: "flex", gap: 2, padding: "0 16px", minWidth: "max-content", alignItems: "flex-end" }}>
                          {[...books].sort((a, b) => a.num - b.num).map(book => {
                            const sc = FC[book.faction] || C.dim;
                            const bst = statuses[book.id]?.status || 'none';
                            const bstCfg = STATUS_CFG[bst];
                            const pct = readingProgress[book.id] || 0;
                            const pctPct = Math.round(pct * 100);
                            return (
                              <div key={book.id} onClick={() => setDetail(book)}
                                title={`${book.title}${book.num > 0 ? ' #' + book.num : ''}${pctPct > 0 ? ' — ' + pctPct + '%' : ''}`}
                                style={{ flexShrink: 0, width: 24, height: 110, background: `linear-gradient(to right,${sc}ee,${sc}88,${sc}bb)`, borderRadius: "3px 3px 0 0", cursor: "pointer", position: "relative", boxShadow: `inset -2px 0 3px rgba(0,0,0,0.4),2px 0 2px rgba(0,0,0,0.3)`, border: `1px solid ${bst !== 'none' ? bstCfg.color + 'aa' : sc + '88'}`, borderBottom: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", transition: "transform 0.12s" }}
                                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
                                onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                                <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: "'Cinzel',serif", fontSize: 6, color: "rgba(255,255,255,0.85)", letterSpacing: 0.8, overflow: "hidden", maxHeight: "90%", padding: "3px 2px", textShadow: "0 1px 2px rgba(0,0,0,0.9)", lineHeight: 1.1, textAlign: "center" }}>
                                  {book.num > 0 ? `#${book.num} ` + book.title.split(' ').slice(0, 3).join(' ') : book.title.split(' ').slice(0, 3).join(' ')}
                                </div>
                                {bst !== 'none' && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: bstCfg.color }} />}
                                {pctPct > 0 && pctPct < 100 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${pctPct}%`, background: "rgba(74,138,220,0.25)", pointerEvents: "none" }} />}
                                {pctPct >= 100 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "100%", background: "rgba(74,170,106,0.2)", pointerEvents: "none" }} />}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ height: 8, background: "linear-gradient(to bottom,#5a3a1a,#3a2010)", margin: "0 16px", borderRadius: "0 0 3px 3px", boxShadow: "0 2px 5px rgba(0,0,0,0.5)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
