import { useState, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { sb } from "../lib/sb";
import { signInWithGoogle } from "../lib/supabase";
import { STATUS_CFG } from "../data/constants";
import { AOS_ESSENTIAL, findAoSGuideBook } from "../data/aosGuide";
import CoverImage from "./CoverImage";
import { getBookRating } from "../lib/bookStatus";
import { AOS, AOS_BOOKS } from "../data/aosBooks";
import { UPCOMING_RELEASES, RELEASES_UPDATED } from "../data/releases";

export { AOS, AOS_BOOKS };

const EpubReader = lazy(() => import("./EpubReader"));
const PdfReader  = lazy(() => import("./PdfReader"));

// Series spine colours for shelf display
const SC = {
  "The Realmgate Wars":             "#5a8fc5",
  "Hallowed Knights":               "#4080a0",
  "Eight Lamentations":             "#7a5aaa",
  "Gotrek and Felix":               "#a07838",
  "Hamilcar":                       "#C9A227",
  "Callis and Toll":                "#607080",
  "Blacktalon":                     "#3a8a6a",
  "Drekki Flynt":                   "#5a708a",
  "Neferata":                       "#8a3070",
  "Warcry":                         "#8B2020",
  "Warhammer Underworlds":          "#4a4a8a",
  "BL Novella Series":              "#6a5040",
  "Warhammer Horror":               "#2a1040",
  "Battletome":                     "#2a3850",
};
const spineColor = (b) => SC[b.series] || "#4a6a8a";

// Chronological saga reading order — sagas are grouped by era/edition.
// AoS sagas largely run in parallel, so eras give the macro reading order;
// within an era the order is roughly interchangeable.
const SAGA_ERAS = [
  { key:"old", label:"Old World", sub:"The World-That-Was" },
  { key:"e1",  label:"1st Edition", sub:"The Realmgate Wars" },
  { key:"e2",  label:"2nd Edition", sub:"Soul Wars & the Necroquake" },
  { key:"e3",  label:"3rd Edition", sub:"Era of the Beast" },
  { key:"other", label:"Other Sagas", sub:"Standalone & side stories" },
];
const SAGA_ERA = {
  "The Legend of Sigmar":"old", "Nagash":"old", "Tyrion & Teclis":"old",
  "Malus Darkblade":"old", "Von Carstein":"old", "Genevieve":"old", "Gotrek and Felix":"old",
  "The Realmgate Wars":"e1",
  "Hallowed Knights":"e2", "Eight Lamentations":"e2", "Neferata":"e2",
  "Callis and Toll":"e2", "Blacktalon":"e2", "Hamilcar":"e2", "Warcry":"e2",
  "Warhammer Underworlds":"e2", "BL Novella Series":"e2", "Warhammer Horror":"e2",
  "Drekki Flynt":"e3",
};


const AOS_SERIES = ["All", ...new Set(AOS_BOOKS.map(b => b.series).filter(Boolean))];
const AOS_TYPES  = ["All", ...new Set(AOS_BOOKS.map(b => b.type))];

// ─── READING STATUS HELPERS ───────────────────────────────────────────────────
function getAoSBookStatus(uid, bid) {
  try { return JSON.parse(localStorage.getItem(`wh40k_status_${uid||'anon'}_${bid}`)) || {status:'none'}; }
  catch { return {status:'none'}; }
}
function setAoSBookStatusLS(uid, bid, s) {
  const e = getAoSBookStatus(uid, bid), now = new Date().toISOString();
  const d = {...e, status:s, updatedAt:now};
  if (s==='reading' && !e.startedAt) d.startedAt = now;
  if (s==='read') { d.completedAt = now; if (!d.startedAt) d.startedAt = now; }
  localStorage.setItem(`wh40k_status_${uid||'anon'}_${bid}`, JSON.stringify(d));
  return d;
}

// ─── NEXT-BOOK SUGGESTION ────────────────────────────────────────────────────
function getAoSAllNextSuggestions(statuses) {
  const seriesNames = [...new Set(AOS_BOOKS.filter(b => b.series && b.num > 0).map(b => b.series))];
  const candidates = seriesNames.map(s => {
    const books = AOS_BOOKS.filter(b => b.series === s && b.num > 0).sort((a,b) => a.num - b.num);
    const isReading = books.some(b => statuses[b.id]?.status === 'reading');
    const readCount = books.filter(b => statuses[b.id]?.status === 'read').length;
    if (!isReading && readCount === 0) return null;
    const next = books.find(b => { const st = statuses[b.id]?.status; return !st || st === 'none' || st === 'want'; });
    if (!next) return null;
    return { name:s, books, isReading, readCount, next };
  }).filter(Boolean);

  if (!candidates.length) return [];

  candidates.sort((a,b) => {
    if (a.isReading && !b.isReading) return -1;
    if (b.isReading && !a.isReading) return 1;
    return b.readCount - a.readCount;
  });

  return candidates.map(c => ({ book:c.next, reason:`Next in ${c.name}`, seriesProgress:`${c.readCount}/${c.books.length} read` }));
}

// ─── AoS BOOK DETAIL ─────────────────────────────────────────────────────────
function AoSBookDetail({ book, user, onBack, onOpenReader, status, onStatusChange }) {
  const inp = useRef(null);
  const sc = spineColor(book);
  const [ebookMeta,     setEbookMeta]     = useState(null);
  const [uploading,     setUploading]     = useState(false);
  const [uploadMsg,     setUploadMsg]     = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [curStatus,     setCurStatus]     = useState(status?.status || 'none');
  const [progress,      setProgress]      = useState(0);
  const [chapterIndex,  setChapterIndex]  = useState(0);
  const [pageIndex,     setPageIndex]     = useState(0);
  const [bookmarkInfo,  setBookmarkInfo]  = useState(null);
  const [bookmarksList, setBookmarksList] = useState([]);

  useEffect(() => { setCurStatus(status?.status || 'none'); }, [status]);

  const changeStatus = (s) => {
    setCurStatus(s);
    if (user?.id) setAoSBookStatusLS(user.id, book.id, s);
    onStatusChange?.(book.id, s);
  };

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [files, progData] = await Promise.all([
        sb.get("ebook_files", `book_id=eq.${book.id}&limit=1`),
        sb.get("reading_progress", `book_id=eq.${book.id}&limit=1`),
      ]);
      if (files?.length && !files._error) {
        setEbookMeta(files[0]);
      } else {
        const cached = localStorage.getItem(`wh40k_ebook_${user.id}_${book.id}`);
        if (cached) { try { setEbookMeta(JSON.parse(cached)); } catch {} }
      }
      if (progData?.length && !progData._error) {
        setProgress(progData[0].progress_pct || 0);
        setChapterIndex(progData[0].chapter_index || 0);
        setPageIndex(progData[0].page_index || 0);
        if (progData[0].progress_pct > 0)
          setBookmarkInfo({ chapter_index:progData[0].chapter_index||0, page_index:progData[0].page_index||0, progress_pct:progData[0].progress_pct||0 });
      } else {
        const cp = localStorage.getItem(`wh40k_prog_${user.id}_${book.id}`);
        if (cp) { try {
          const p = JSON.parse(cp);
          setProgress(p.progress_pct || 0);
          setChapterIndex(p.chapter_index || 0);
          setPageIndex(p.page_index || 0);
          if (p.bookmarked || p.progress_pct > 0 || p.chapter_index > 0 || p.page_index > 0)
            setBookmarkInfo({ chapter_index:p.chapter_index||0, page_index:p.page_index||0, bookmarkedAt:p.bookmarkedAt||p.last_read||null, progress_pct:p.progress_pct||0 });
        } catch {} }
      }
      try {
        const bms = JSON.parse(localStorage.getItem(`wh40k_bm_${user.id}_${book.id}`) || '[]');
        setBookmarksList(bms);
      } catch {}
    })();
  }, [book.id, user?.id]);

  const handleFileSelect = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (!user?.id) { setUploadMsg("❌ Sign in to upload ebooks."); return; }
    setUploading(true); setUploadMsg("Uploading to cloud…");
    const path = `${user.id}/${book.id}/${file.name}`;
    const ok = await sb.storage.upload(path, file);
    if (ok) {
      const meta = { user_id:user.id, book_id:book.id, file_name:file.name, file_path:path, file_type:file.name.toLowerCase().endsWith(".pdf")?"pdf":"epub" };
      const dbResult = await sb.upsert("ebook_files", meta, "user_id,book_id");
      localStorage.setItem(`wh40k_ebook_${user.id}_${book.id}`, JSON.stringify(meta));
      setEbookMeta(meta);
      if (dbResult?._error) {
        setUploadMsg(`⚠️ File saved but DB error ${dbResult._error}: ${dbResult._body?.slice(0,80)}`);
      } else {
        setUploadMsg("✅ Uploaded & synced!");
      }
    } else { setUploadMsg("❌ Upload failed — check Supabase storage policy."); }
    setUploading(false);
    setTimeout(() => setUploadMsg(""), 3000);
  };

  const handleOpenReader = async () => {
    if (!ebookMeta) return;
    setUploadMsg("Opening…");
    const url = await sb.storage.signedUrl(ebookMeta.file_path);
    if (!url) { setUploadMsg("❌ Could not open file — try re-uploading."); return; }
    setUploadMsg("");
    onOpenReader({ book, url, fileType:ebookMeta.file_type, progress, chapterIndex, pageIndex });
  };

  const handleDeleteEbook = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 4000); return; }
    setDeleteConfirm(false);
    setUploadMsg("Removing…");
    if (ebookMeta?.file_path) await sb.storage.remove(ebookMeta.file_path);
    if (user?.id) await sb.del("ebook_files", `user_id=eq.${user.id}&book_id=eq.${book.id}`);
    if (user?.id) localStorage.removeItem(`wh40k_ebook_${user.id}_${book.id}`);
    setEbookMeta(null);
    setUploadMsg("✅ Ebook removed.");
    setTimeout(() => setUploadMsg(""), 2500);
  };

  return (
    <div style={{ minHeight:"100%", background:AOS.bg }}>
      {/* Sticky header */}
      <div style={{ position:"sticky", top:0, zIndex:10, background:AOS.surface, borderBottom:`1px solid ${AOS.border}`, height:52, display:"flex", alignItems:"center", padding:"0 16px", gap:12 }}>
        <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${AOS.dim}`, borderRadius:8, color:AOS.gold, padding:"7px 16px", cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:1 }}>← Library</button>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:AOS.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.series || book.type}{book.num > 0 ? ` #${book.num}` : ""}</div>
      </div>

      {/* Cover section */}
      <div style={{ background:`linear-gradient(160deg,${sc}55,${AOS.card})`, borderBottom:`1px solid ${sc}66`, padding:"28px 20px 24px", display:"flex", gap:16, alignItems:"flex-start" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:10 }}>{book.series || "Standalone"}{book.num > 0 ? ` · Book ${book.num}` : ""}</div>
          <h1 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:"clamp(16px,5vw,24px)", color:AOS.text, lineHeight:1.2, marginBottom:6 }}>{book.title}</h1>
          <div style={{ color:AOS.muted, fontSize:14, fontStyle:"italic" }}>by {book.author}</div>
        </div>
        <CoverImage book={book} width={80} height={120} radius={5} accentColor={sc} style={{ flexShrink:0, boxShadow:"0 4px 16px rgba(0,0,0,0.5)" }}/>
      </div>

      <div style={{ padding:"20px 16px", display:"flex", flexDirection:"column", gap:14 }}>
        {/* Metadata */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[{ l:"Type", v:book.type }, { l:"Series", v:book.series || "Standalone" }].map(m => (
            <div key={m.l} style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:8, padding:"10px" }}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:2, textTransform:"uppercase", marginBottom:3 }}>{m.l}</div>
              <div style={{ color:AOS.text, fontSize:12, lineHeight:1.2 }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Description + BL link */}
        <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:10, padding:"12px 14px" }}>
          {book.desc && (
            <>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>About this book</div>
              <div style={{ fontSize:12, color:AOS.muted, lineHeight:1.75, marginBottom:10 }}>{book.desc}</div>
            </>
          )}
          <a href={`https://www.google.com/search?q=${encodeURIComponent('"'+book.title+'" site:blacklibrary.com')}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize:11, color:AOS.blue, textDecoration:"underline", fontFamily:"'Cinzel',serif", letterSpacing:1 }}>
            Find on Black Library ›
          </a>
        </div>

        {/* Ebook card */}
        <div style={{ background:AOS.card, border:`2px solid ${ebookMeta ? AOS.gold : AOS.border}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ background:ebookMeta ? `${AOS.gold}18` : AOS.surface, padding:"14px 16px", borderBottom:`1px solid ${ebookMeta ? AOS.gold+"44" : AOS.border}`, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>{ebookMeta ? "📖" : "📂"}</span>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:ebookMeta ? AOS.gold : AOS.muted, fontWeight:700, letterSpacing:1 }}>{ebookMeta ? "Ebook Ready" : "No Ebook Loaded"}</div>
              {ebookMeta && <div style={{ fontSize:11, color:AOS.goldDim, marginTop:1 }}>{ebookMeta.file_name}</div>}
            </div>
          </div>
          <div style={{ padding:"16px" }}>
            {!user ? (
              <div style={{ textAlign:"center", padding:"24px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                <div style={{ fontSize:36 }}>🔐</div>
                <div style={{ color:AOS.muted, fontSize:13, lineHeight:1.6, maxWidth:260 }}>Sign in to upload and access your ebooks across any device.</div>
                <button onClick={signInWithGoogle} style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}`, borderRadius:8, padding:"10px 24px", color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2, cursor:"pointer", textTransform:"uppercase" }}>Sign in with Google</button>
              </div>
            ) : ebookMeta ? (
              <>
                {/* Progress bar */}
                {progress > 0 && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, textTransform:"uppercase" }}>Progress</span>
                      <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.gold }}>{Math.round(progress * 100)}%</span>
                    </div>
                    <div style={{ height:4, background:AOS.dim, borderRadius:2 }}>
                      <div style={{ height:"100%", width:`${progress*100}%`, background:`linear-gradient(to right,${AOS.gold},${AOS.blue})`, borderRadius:2 }}/>
                    </div>
                  </div>
                )}
                {/* Last read position */}
                {bookmarkInfo && (
                  <div style={{ marginBottom:12, background:AOS.surface, border:`1px solid ${AOS.border}`, borderRadius:8, padding:"10px 12px", display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>📍</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.muted, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>Last read position</div>
                      <div style={{ fontSize:12, color:AOS.text }}>{Math.round((bookmarkInfo.progress_pct||0)*100)}%{bookmarkInfo.chapter_index > 0 ? ` · Ch. ${bookmarkInfo.chapter_index+1}` : ""}</div>
                      {bookmarkInfo.bookmarkedAt && <div style={{ fontSize:10, color:AOS.muted, marginTop:1 }}>{new Date(bookmarkInfo.bookmarkedAt).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'})}</div>}
                    </div>
                  </div>
                )}
                {/* Manual bookmarks */}
                {bookmarksList.length > 0 && (
                  <div style={{ marginBottom:12, background:AOS.surface, border:`1px solid ${AOS.gold}33`, borderRadius:8, overflow:"hidden" }}>
                    <div style={{ padding:"8px 12px 6px", borderBottom:`1px solid ${AOS.border}`, display:"flex", alignItems:"center", gap:6 }}>
                      <span>🔖</span>
                      <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.gold, letterSpacing:2, textTransform:"uppercase" }}>Bookmarks ({bookmarksList.length})</span>
                    </div>
                    {bookmarksList.slice(0,5).map((bm,i) => (
                      <div key={bm.id} style={{ padding:"8px 12px", borderBottom:i<Math.min(bookmarksList.length,5)-1?`1px solid ${AOS.border}55`:"none", display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, color:AOS.text, fontFamily:"'Cinzel',serif" }}>{bm.label}</div>
                          <div style={{ fontSize:10, color:AOS.muted }}>{bm.pct != null ? bm.pct : Math.round((bm.progress_pct||0)*100)}% · {new Date(bm.createdAt).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</div>
                        </div>
                      </div>
                    ))}
                    {bookmarksList.length > 5 && <div style={{ padding:"6px 12px", fontSize:10, color:AOS.muted, fontStyle:"italic" }}>+{bookmarksList.length-5} more bookmarks in reader</div>}
                  </div>
                )}
                {uploadMsg && <div style={{ color:uploadMsg.startsWith("❌")?AOS.red:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:12, textAlign:"center", marginBottom:8 }}>{uploadMsg}</div>}
                <button onClick={handleOpenReader} style={{ width:"100%", padding:"16px", borderRadius:10, background:`linear-gradient(135deg,${AOS.gold},#7a6015)`, border:"none", color:AOS.bg, fontFamily:"'Cinzel',serif", fontSize:15, letterSpacing:3, textTransform:"uppercase", fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                  {bookmarkInfo || progress > 0 ? "📖 Continue Reading" : "📖 Start Reading"}
                </button>
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button onClick={() => inp.current.click()} style={{ flex:1, padding:"10px", borderRadius:8, background:"transparent", border:`1px solid ${AOS.dim}`, color:AOS.muted, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer" }}>Replace file</button>
                  <button onClick={handleDeleteEbook} style={{ flex:1, padding:"10px", borderRadius:8, background:deleteConfirm?`${AOS.red}22`:"transparent", border:`1px solid ${deleteConfirm?AOS.red:AOS.dim}`, color:deleteConfirm?AOS.red:AOS.muted, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer", transition:"all 0.2s" }}>
                    {deleteConfirm ? "⚠️ Confirm delete" : "🗑 Remove ebook"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ color:AOS.muted, fontSize:13, lineHeight:1.6 }}>Load your personal EPUB or PDF — saved to your private cloud, accessible from any device.</div>
                <div style={{ background:"#ffffff06", borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>Reader features</div>
                  <div style={{ color:AOS.dim, fontSize:12, lineHeight:1.8 }}>📖 Pages or scroll mode<br/>🎨 Dark / Sepia / Paper theme<br/>🔤 Font &amp; typography<br/>📄 Single or two-page spread<br/>📝 Select words → dictionary</div>
                </div>
                {(uploading || uploadMsg) && <div style={{ color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:12, textAlign:"center" }}>{uploadMsg || "Uploading…"}</div>}
                <button onClick={() => inp.current.click()} disabled={uploading} style={{ width:"100%", padding:"16px", borderRadius:10, background:"transparent", border:`2px dashed ${AOS.goldDim}`, color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:14, letterSpacing:2, textTransform:"uppercase", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, opacity:uploading?0.5:1 }}>
                  📂 Load EPUB or PDF
                </button>
              </div>
            )}
            <input ref={inp} type="file" accept=".epub,.pdf" style={{ display:"none" }} onChange={handleFileSelect}/>
          </div>
        </div>

        {/* Reading Status */}
        <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:10 }}>Reading Status</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {['want','reading','read'].map(s => {
              const cfg = STATUS_CFG[s]; const active = curStatus === s;
              return (
                <button key={s} onClick={() => changeStatus(s)} style={{ padding:"12px 4px", borderRadius:8, border:`1px solid ${active?cfg.color:AOS.dim}`, background:active?cfg.bg:"transparent", color:active?cfg.color:AOS.muted, fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all 0.2s" }}>
                  <span style={{ fontSize:20 }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              );
            })}
          </div>
          {curStatus === 'read' && <div style={{ marginTop:8, fontSize:11, color:STATUS_CFG.read.color, textAlign:"center", fontFamily:"'Cinzel',serif", letterSpacing:1 }}>This book is in your completed collection!</div>}
        </div>
      </div>
    </div>
  );
}

// ─── AoS HOME PAGE ────────────────────────────────────────────────────────────
export function AoSHomePage({ user, setSection, statuses = {}, onOpenBook, onOpenDetail, onShowHelp }) {
  const uid = user?.id || 'anon';

  const [uploadedIds, setUploadedIds] = useState(() => {
    const ids = new Set();
    const prefix = `wh40k_ebook_${uid}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) {
        const bid = k.slice(prefix.length);
        if (AOS_BOOKS.some(b => b.id === bid)) ids.add(bid);
      }
    }
    return ids;
  });

  useEffect(() => {
    if (!user?.id) return;
    sb.get("ebook_files", `user_id=eq.${user.id}&select=book_id`).then(files => {
      if (files?.length && !files._error) {
        const dbIds = new Set(files.map(f => f.book_id).filter(id => AOS_BOOKS.some(b => b.id === id)));
        setUploadedIds(dbIds);
      }
    });
  }, [user?.id]);

  const readCount    = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'read').length;
  const readingCount = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'reading').length;

  const shelfBooks = useMemo(() => {
    return AOS_BOOKS.filter(b => uploadedIds.has(b.id) || statuses[b.id]?.status === 'read')
      .sort((a,b) => (a.series || 'zzz').localeCompare(b.series || 'zzz') || a.num - b.num);
  }, [uploadedIds, statuses]);

  const shelfBySeries = useMemo(() => {
    const groups = []; const seen = {};
    shelfBooks.forEach(b => {
      const key = b.series || 'Standalone';
      if (!seen[key]) { seen[key] = []; groups.push({ series:key, books:seen[key] }); }
      seen[key].push(b);
    });
    return groups;
  }, [shelfBooks]);

  const activeBooks = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'reading');
  const allSuggestions = useMemo(() => getAoSAllNextSuggestions(statuses), [statuses]);
  const suggestions = allSuggestions.filter(s => !activeBooks.some(b => b.id === s.book.id));

  const [opening, setOpening] = useState(false);
  const openBookHandle = async (book) => {
    if (uploadedIds.has(book.id) && onOpenBook) {
      setOpening(true);
      const ok = await onOpenBook(book);
      setOpening(false);
      if (ok === true) return;
    }
    if (onOpenDetail) onOpenDetail(book);
    else setSection('library');
  };

  const ShelfRow = ({ books, label }) => {
    if (!books.length) return null;
    return (
      <div style={{ marginBottom:8 }}>
        {label && <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", padding:"0 16px", marginBottom:4 }}>{label}</div>}
        <div style={{ position:"relative", overflowX:"auto", overflowY:"visible", paddingBottom:10 }}>
          <div style={{ display:"flex", gap:3, padding:"0 16px", minWidth:"max-content", alignItems:"flex-end" }}>
            {books.map(b => {
              const sc = spineColor(b);
              const isUploaded = uploadedIds.has(b.id);
              const bst = statuses[b.id]?.status || 'none';
              return (
                <div key={b.id}
                  onClick={() => openBookHandle(b)}
                  title={`${b.title} — ${b.author}`}
                  style={{
                    flexShrink:0, width:isUploaded?30:20, height:isUploaded?120:110,
                    background:`linear-gradient(to right,${sc}dd,${sc}88,${sc}cc)`,
                    borderRadius:"2px 2px 0 0", cursor:"pointer", position:"relative",
                    boxShadow:`inset -2px 0 4px rgba(0,0,0,0.4),2px 0 3px rgba(0,0,0,0.3)`,
                    border:`1px solid ${sc}`, borderBottom:"none",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    overflow:"hidden", transition:"transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform="translateY(-4px)"; e.currentTarget.style.boxShadow=`inset -2px 0 4px rgba(0,0,0,0.4),4px 4px 8px rgba(0,0,0,0.5)`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=`inset -2px 0 4px rgba(0,0,0,0.4),2px 0 3px rgba(0,0,0,0.3)`; }}
                >
                  <div style={{ writingMode:"vertical-rl", transform:"rotate(180deg)", fontFamily:"'Cinzel',serif", fontSize:isUploaded?6:5, color:"rgba(255,255,255,0.85)", letterSpacing:0.8, overflow:"hidden", maxHeight:"90%", padding:"4px 2px", textShadow:"0 1px 2px rgba(0,0,0,0.9)", lineHeight:1.1 }}>
                    {b.title}
                  </div>
                  {bst === 'reading' && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:AOS.blue }}/>}
                  {bst === 'read'    && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:AOS.green }}/>}
                  {isUploaded        && <div style={{ position:"absolute", inset:0, border:`1px solid ${AOS.gold}88`, borderRadius:"2px 2px 0 0", pointerEvents:"none" }}/>}
                </div>
              );
            })}
          </div>
          <div style={{ height:8, background:"linear-gradient(to bottom,#4a3510,#2a1f08)", margin:"0 16px", borderRadius:"0 0 4px 4px", boxShadow:"0 3px 6px rgba(0,0,0,0.5)" }}/>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      <style>{`@keyframes aosGlow{0%,100%{opacity:0.4;}50%{opacity:0.9;}}`}</style>

      {/* Hero */}
      <div style={{ padding:"24px 16px 20px", borderBottom:`1px solid ${AOS.border}`, background:`linear-gradient(180deg,${AOS.surface},${AOS.bg})`, position:"relative" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(to right,transparent,${AOS.gold},transparent)`, animation:"aosGlow 3s ease-in-out infinite" }}/>
        {onShowHelp && (
          <button onClick={onShowHelp} style={{ position:"absolute", top:16, right:16, width:28, height:28, borderRadius:"50%", background:"transparent", border:`1px solid ${AOS.border}`, color:AOS.muted, fontSize:13, fontFamily:"'Cinzel',serif", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>?</button>
        )}
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5, color:AOS.goldDim, textTransform:"uppercase", marginBottom:4 }}>Age of Sigmar</div>
        <h1 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:26, color:AOS.text, lineHeight:1.1, marginBottom:4 }}>Mortal Realms</h1>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.goldDim, letterSpacing:3 }}>YOUR LIBRARY</div>
        {user && (
          <div style={{ marginTop:14, display:"flex", alignItems:"center", gap:10 }}>
            {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} alt="" style={{ width:28, height:28, borderRadius:"50%", border:`1px solid ${AOS.gold}55` }}/>}
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.muted }}>{user.user_metadata?.full_name || user.email}</div>
          </div>
        )}
      </div>

      {/* Stats bar — 3 columns like 40K */}
      <div style={{ display:"flex", borderBottom:`1px solid ${AOS.border}` }}>
        {[
          { n:readingCount,   l:"Reading", c:AOS.blue  },
          { n:readCount,      l:"Read",    c:AOS.green  },
          { n:AOS_BOOKS.length, l:"Total", c:AOS.muted  },
        ].map(s => (
          <div key={s.l} style={{ flex:1, padding:"12px 4px", textAlign:"center", borderRight:`1px solid ${AOS.border}` }}>
            <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:22, color:s.c, lineHeight:1 }}>{s.n}</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:7, color:AOS.muted, letterSpacing:2, marginTop:3, textTransform:"uppercase" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Currently Reading */}
      {activeBooks.length > 0 && (
        <div style={{ padding:"14px 16px 0" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.blue, letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>📖 Currently Reading</div>
          {activeBooks.map(b => {
            const hasEbook = uploadedIds.has(b.id);
            return (
              <button key={b.id} type="button" onClick={() => hasEbook && onOpenBook ? onOpenBook(b) : setSection('library')}
                style={{ background:`linear-gradient(135deg,${AOS.blue}18,${AOS.card})`, border:`1px solid ${AOS.blue}44`, borderLeft:`3px solid ${AOS.blue}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", marginBottom:8, display:"flex", alignItems:"center", gap:12, width:"100%", textAlign:"left" }}>
                <CoverImage book={b} width={36} height={50} radius={3} accentColor={spineColor(b)}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.title}</div>
                  <div style={{ fontSize:11, color:AOS.muted }}>{b.series}{b.num > 0 ? ` #${b.num}` : ""} · {b.author}</div>
                </div>
                {hasEbook
                  ? <span style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}55`, borderRadius:6, padding:"4px 8px", fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.gold, letterSpacing:1, flexShrink:0 }}>READ ›</span>
                  : <span style={{ color:AOS.blue, fontSize:16, flexShrink:0 }}>›</span>
                }
              </button>
            );
          })}
        </div>
      )}

      {/* Next Up — one card per active AoS saga */}
      {suggestions.length > 0 && (
        <div style={{ padding:"14px 16px 0" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.gold, letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>⚔ Next Up</div>
          {suggestions.map(s => (
            <div key={s.book.id} style={{ background:`linear-gradient(135deg,${AOS.gold}12,${AOS.card})`, border:`1px solid ${AOS.gold}44`, borderLeft:`3px solid ${AOS.gold}`, borderRadius:10, padding:"12px 14px", display:"flex", gap:12, alignItems:"center", marginBottom:8 }}>
              <CoverImage book={s.book} width={36} height={54} radius={3} accentColor={spineColor(s.book)} style={{ boxShadow:"0 2px 8px rgba(0,0,0,0.5)" }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:1, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {s.reason.toUpperCase()}{s.seriesProgress ? ` · ${s.seriesProgress}` : ""}
                </div>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, marginBottom:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.book.title}</div>
                <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic" }}>{s.book.author}</div>
              </div>
              <button onClick={() => openBookHandle(s.book)} disabled={opening}
                style={{ flexShrink:0, padding:"6px 10px", borderRadius:6, background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}55`, color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1, cursor:"pointer" }}>
                {opening ? "…" : "›"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Shelf */}
      <div style={{ padding:"16px 0 0" }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", padding:"0 16px", marginBottom:10 }}>Your Shelf</div>
        {shelfBySeries.length === 0 ? (
          <div style={{ padding:"40px 20px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
            <div style={{ fontSize:48 }}>📚</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:15, color:AOS.muted }}>Your shelf is empty</div>
            <div style={{ fontSize:12, color:AOS.muted, maxWidth:260, lineHeight:1.6, textAlign:"center" }}>
              Go to the Library, upload ebooks or mark books as read to build your shelf.
            </div>
            <button onClick={() => setSection('library')} style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}`, borderRadius:8, padding:"10px 24px", color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:2, cursor:"pointer" }}>
              Go to Library →
            </button>
          </div>
        ) : shelfBySeries.map(({ series, books }) => (
          <ShelfRow key={series} books={books} label={series}/>
        ))}
      </div>
    </div>
  );
}

// ─── AoS LIBRARY SECTION ─────────────────────────────────────────────────────
export function AoSLibrarySection({ user, statuses = {}, onStatusChange, openDetailBook, onDetailConsumed }) {
  const [tab,         setTab]         = useState("catalogue");
  const [viewMode,    setViewMode]    = useState("card"); // card | list | shelf
  const [search,      setSearch]      = useState("");
  const [series,      setSeries]      = useState("All");
  const [type,        setType]        = useState("All");
  const [status,      setStatus]      = useState("All");
  const [sort,        setSort]        = useState("default");
  const [showFilters, setShowFilters] = useState(false);
  const [detail,      setDetail]      = useState(null);
  const [reader,      setReader]      = useState(null);
  const [shelfBooks,  setShelfBooks]  = useState([]);
  const [shelfLoading,setShelfLoading]= useState(false);

  // Deep-link: open a specific book's detail when navigated here (e.g. Home shelf).
  useEffect(() => {
    if (openDetailBook) { setDetail(openDetailBook); onDetailConsumed?.(); }
  }, [openDetailBook]);

  // Pre-load shelf from localStorage cache on mount
  useEffect(() => {
    if (!user?.id) return;
    const lsBooks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`wh40k_ebook_${user.id}_`)) {
        try {
          const meta = JSON.parse(localStorage.getItem(key));
          if (meta?.book_id) {
            const book = AOS_BOOKS.find(b => b.id === meta.book_id);
            if (book) lsBooks.push({...book, _file:meta});
          }
        } catch {}
      }
    }
    if (lsBooks.length > 0) setShelfBooks(lsBooks);
  }, [user?.id]);

  // Load shelf books from DB (or re-load when tab switches to shelf)
  useEffect(() => {
    if (!user?.id) { setShelfBooks([]); setShelfLoading(false); return; }
    if (tab === "shelf") setShelfLoading(true);
    sb.get("ebook_files", `user_id=eq.${user.id}&select=book_id,file_name,file_path,file_type`).then(files => {
      if (files?.length && !files._error) {
        const ids = new Set(files.map(f => f.book_id));
        setShelfBooks(AOS_BOOKS.filter(b => ids.has(b.id)).map(b => ({...b, _file:files.find(f => f.book_id === b.id)})));
      } else if (tab === "shelf") {
        const lsBooks = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(`wh40k_ebook_${user.id}_`)) {
            try {
              const meta = JSON.parse(localStorage.getItem(key));
              if (meta?.book_id) { const book = AOS_BOOKS.find(b => b.id === meta.book_id); if (book) lsBooks.push({...book, _file:meta}); }
            } catch {}
          }
        }
        setShelfBooks(lsBooks);
      }
      setShelfLoading(false);
    });
  }, [tab, user?.id]);

  const handleOpenReader = ({book, url, fileType, progress, chapterIndex, pageIndex}) => {
    setDetail(null);
    setReader({book, url, fileType, progress, chapterIndex, pageIndex:pageIndex||0});
  };

  const readCount    = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'read').length;
  const readingCount = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'reading').length;

  const filtered = AOS_BOOKS.filter(b => {
    if (series !== "All" && b.series !== series) return false;
    if (type   !== "All" && b.type   !== type)   return false;
    if (status !== "All") {
      const bst = statuses[b.id]?.status || 'none';
      if (status === "unread" ? bst !== 'none' : bst !== status) return false;
    }
    if (search) { const q = search.toLowerCase(); return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.series.toLowerCase().includes(q); }
    return true;
  });

  // Sorting — applied after filtering. "default" keeps the curated AOS_BOOKS order.
  // Declared before the early returns below so the hook order stays stable.
  const sorted = useMemo(() => {
    if (sort === "default") return filtered;
    const arr = [...filtered];
    if (sort === "title")       arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "author") arr.sort((a, b) => a.author.localeCompare(b.author));
    else if (sort === "rating") arr.sort((a, b) => getBookRating(user?.id, b.id) - getBookRating(user?.id, a.id));
    return arr;
  }, [filtered, sort, user?.id]);

  const isFiltered = series !== "All" || type !== "All" || status !== "All" || sort !== "default";

  if (reader) {
    const {book, url, fileType, progress, chapterIndex} = reader;
    return (
      <Suspense fallback={<div style={{ position:"fixed", inset:0, background:AOS.bg, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ fontSize:48, animation:"spin 2s linear infinite" }}>⚙</div></div>}>
        {fileType === "pdf"
          ? <PdfReader  url={url} title={book.title} bookId={book.id} userId={user?.id} onClose={() => setReader(null)}/>
          : <EpubReader url={url} title={book.title} bookId={book.id} userId={user?.id} initProgress={progress||0} initChapterIndex={chapterIndex||0} initPageIndex={reader.pageIndex||0} onProgress={() => {}} onClose={() => setReader(null)}/>
        }
      </Suspense>
    );
  }

  if (detail) return <AoSBookDetail book={detail} user={user} onBack={() => setDetail(null)} onOpenReader={handleOpenReader} status={statuses[detail.id]} onStatusChange={onStatusChange}/>;

  const TABS = [
    { id:"catalogue", label:"Catalogue" },
    { id:"shelf",     label:`My Shelf${shelfBooks.length > 0 ? ` (${shelfBooks.length})` : ""}` },
    { id:"upcoming",  label:"Upcoming" },
  ];

  const Chip = ({label, active, onClick, color}) => (
    <button onClick={onClick} style={{ background:active?`${color||AOS.gold}22`:"transparent", border:`1px solid ${active?(color||AOS.gold):AOS.dim}`, borderRadius:20, padding:"6px 14px", color:active?(color||AOS.gold):AOS.muted, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer", whiteSpace:"nowrap" }}>{label}</button>
  );

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      {/* Header */}
      <div style={{ padding:"20px 16px 0", borderBottom:`1px solid ${AOS.border}` }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5, color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>Black Library</div>
        <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:12 }}>The Library</h2>
        <div style={{ display:"flex", gap:20, marginBottom:14, flexWrap:"wrap" }}>
          {[
            { l:"Tomes",   v:AOS_BOOKS.length, color:AOS.text  },
            { l:"Read",    v:readCount,         color:AOS.green },
            { l:"Reading", v:readingCount,      color:AOS.blue  },
            { l:"Ebook",   v:shelfBooks.length, color:AOS.gold  },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, textTransform:"uppercase" }}>{s.l}</div>
              <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:20, color:s.color }}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:"10px", background:"transparent", border:"none", borderBottom:`2px solid ${tab === t.id ? AOS.gold : "transparent"}`, color:tab === t.id ? AOS.gold : AOS.muted, fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2, cursor:"pointer", textTransform:"uppercase" }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* MY SHELF */}
      {tab === "shelf" && (
        <>
          {shelfLoading ? (
            <div style={{ textAlign:"center", padding:40, color:AOS.muted, fontStyle:"italic" }}>Loading…</div>
          ) : shelfBooks.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
              <div style={{ fontSize:52 }}>📂</div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:16, color:AOS.muted }}>No ebooks loaded</div>
              <div style={{ color:AOS.muted, fontSize:13, maxWidth:280, lineHeight:1.6, textAlign:"center" }}>Go to Catalogue, select a book and upload your EPUB or PDF file to add it here.</div>
              <button onClick={() => setTab("catalogue")} style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}`, borderRadius:8, padding:"10px 24px", color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2, cursor:"pointer", textTransform:"uppercase" }}>Go to Catalogue →</button>
            </div>
          ) : (
            <>
              {/* search shelf */}
              <div style={{ padding:"12px 16px 0" }}>
                <div style={{ position:"relative" }}>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your ebooks..."
                    style={{ width:"100%", background:AOS.surface, border:`1px solid ${AOS.border}`, borderRadius:10, color:AOS.text, padding:"12px 40px 12px 44px", fontSize:15, outline:"none" }}/>
                  <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:AOS.muted, fontSize:18, pointerEvents:"none" }}>🔍</span>
                  {search && <button onClick={() => setSearch("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:AOS.muted, cursor:"pointer", fontSize:20, lineHeight:1 }}>×</button>}
                </div>
              </div>
              {/* view toggle + count */}
              <div style={{ padding:"8px 16px", display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.muted, flex:1 }}>
                  {shelfBooks.filter(b => !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase())).length} ebook
                </span>
                <div style={{ display:"flex", gap:2, background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:8, padding:2 }}>
                  {[{m:"card",icon:"▦"},{m:"list",icon:"☰"},{m:"shelf",icon:"📚"}].map(v => (
                    <button key={v.m} onClick={() => setViewMode(v.m)}
                      style={{ background:viewMode===v.m?`${AOS.gold}33`:"transparent", border:"none", borderRadius:6, width:28, height:26, cursor:"pointer", color:viewMode===v.m?AOS.gold:AOS.muted, fontSize:viewMode===v.m?13:12, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {v.icon}
                    </button>
                  ))}
                </div>
              </div>
              {/* books — same view modes as catalogue */}
              {(()=>{
                const sfilt = shelfBooks.filter(b => !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.series.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase()));
                if (sfilt.length === 0) return <div style={{ textAlign:"center", padding:"40px 20px", color:AOS.muted, fontStyle:"italic" }}>No results.</div>;

                if (viewMode === "card") return (
                  <div style={{ padding:"10px 16px", display:"flex", flexDirection:"column", gap:8 }}>
                    {sfilt.map(book => {
                      const sc = spineColor(book);
                      const bst = statuses[book.id]?.status || 'none';
                      const bstCfg = STATUS_CFG[bst];
                      return (
                        <button key={book.id} type="button" onClick={() => setDetail(book)}
                          style={{ background:`linear-gradient(135deg,${sc}22,${AOS.card})`, border:`1px solid ${AOS.gold}55`, borderLeft:`3px solid ${AOS.gold}`, borderRadius:8, padding:"10px", cursor:"pointer", display:"flex", gap:10, alignItems:"flex-start", width:"100%", textAlign:"left", transition:"transform 0.18s ease, box-shadow 0.18s ease" }}
                          onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=`0 6px 18px ${AOS.gold}22`; }}
                          onMouseLeave={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}
                          onTouchStart={e=>{ e.currentTarget.style.transform="scale(0.985)"; e.currentTarget.style.boxShadow=`0 0 0 1px ${AOS.gold}55`; }}
                          onTouchEnd={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}
                          onTouchCancel={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
                          <CoverImage book={book} width={54} height={80} radius={3} accentColor={sc}/>
                          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:3 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                              <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.goldDim, letterSpacing:1, textTransform:"uppercase", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.series}{book.num > 0 ? ` #${book.num}` : ""}</div>
                              <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
                                {bst !== 'none' && <span style={{ fontSize:13 }}>{bstCfg.icon}</span>}
                                <span style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}44`, borderRadius:4, padding:"2px 7px", fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.gold, letterSpacing:1 }}>EPUB</span>
                              </div>
                            </div>
                            <div style={{ fontSize:14, fontWeight:700, color:AOS.text, lineHeight:1.3, fontFamily:"'Cinzel',serif" }}>{book.title}</div>
                            <div style={{ fontSize:12, color:AOS.muted, fontStyle:"italic" }}>{book.author}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );

                if (viewMode === "list") return (
                  <div style={{ padding:"6px 16px 16px" }}>
                    {sfilt.map(book => {
                      const sc = spineColor(book);
                      const bst = statuses[book.id]?.status || 'none';
                      const bstCfg = STATUS_CFG[bst];
                      return (
                        <button key={book.id} type="button" onClick={() => setDetail(book)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", cursor:"pointer", width:"100%", textAlign:"left", border:"none", borderBottom:`1px solid ${AOS.border}44`, background:"transparent" }}>
                          <CoverImage book={book} width={36} height={52} radius={2} accentColor={sc}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.title}</div>
                            <div style={{ fontSize:10, color:AOS.muted, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.series}{book.num > 0 ? ` #${book.num}` : ""} · {book.author}</div>
                          </div>
                          {bst !== 'none' && <span style={{ fontSize:14, flexShrink:0 }}>{bstCfg.icon}</span>}
                          <span style={{ color:AOS.dim, fontSize:14, flexShrink:0 }}>›</span>
                        </button>
                      );
                    })}
                  </div>
                );

                // shelf view
                const seriesMap = {};
                sfilt.forEach(b => { if (!seriesMap[b.series]) seriesMap[b.series] = []; seriesMap[b.series].push(b); });
                return (
                  <div style={{ padding:"8px 0 16px" }}>
                    {Object.entries(seriesMap).map(([sName, books]) => (
                      <div key={sName} style={{ marginBottom:6 }}>
                        <div style={{ padding:"6px 16px 4px", fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.gold, letterSpacing:2 }}>{sName}</div>
                        <div style={{ overflowX:"auto", paddingBottom:2 }}>
                          <div style={{ display:"flex", gap:2, padding:"0 16px", minWidth:"max-content", alignItems:"flex-end" }}>
                            {[...books].sort((a,b) => a.num - b.num).map(book => {
                              const sc = spineColor(book);
                              const bst = statuses[book.id]?.status || 'none';
                              const bstCfg = STATUS_CFG[bst];
                              return (
                                <button key={book.id} type="button" onClick={() => setDetail(book)} title={book.title}
                                  style={{ flexShrink:0, width:24, height:110, background:`linear-gradient(to right,${sc}ee,${sc}88,${sc}bb)`, borderRadius:"3px 3px 0 0", cursor:"pointer", position:"relative", boxShadow:`inset -2px 0 3px rgba(0,0,0,0.4),2px 0 2px rgba(0,0,0,0.3)`, border:`1px solid ${AOS.gold}66`, borderBottom:"none", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", transition:"transform 0.12s", padding:0 }}
                                  onMouseEnter={e => e.currentTarget.style.transform="translateY(-5px)"}
                                  onMouseLeave={e => e.currentTarget.style.transform="none"}>
                                  <div style={{ writingMode:"vertical-rl", transform:"rotate(180deg)", fontFamily:"'Cinzel',serif", fontSize:6, color:"rgba(255,255,255,0.85)", letterSpacing:0.8, overflow:"hidden", maxHeight:"90%", padding:"3px 2px", textShadow:"0 1px 2px rgba(0,0,0,0.9)", lineHeight:1.1, textAlign:"center" }}>
                                    {book.num > 0 ? `#${book.num} `+book.title.split(' ').slice(0,3).join(' ') : book.title.split(' ').slice(0,3).join(' ')}
                                  </div>
                                  {bst !== 'none' && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:bstCfg.color }}/>}
                                  <div style={{ position:"absolute", inset:0, border:`1px solid ${AOS.gold}44`, borderRadius:"3px 3px 0 0", pointerEvents:"none" }}/>
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ height:8, background:"linear-gradient(to bottom,#5a3a1a,#3a2010)", margin:"0 16px", borderRadius:"0 0 3px 3px", boxShadow:"0 2px 5px rgba(0,0,0,0.5)" }}/>
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

      {/* UPCOMING */}
      {tab === "upcoming" && (
        <div style={{ paddingBottom:20 }}>
          <div style={{ padding:"12px 16px 8px", display:"flex", alignItems:"baseline", gap:8 }}>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.muted, letterSpacing:1 }}>
              Updated as of {new Date(RELEASES_UPDATED).toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'})}
            </div>
            <a href="https://www.blacklibrary.com" target="_blank" rel="noopener noreferrer"
              style={{ marginLeft:"auto", fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.blue, letterSpacing:1, textDecoration:"none", flexShrink:0 }}>
              blacklibrary.com ›
            </a>
          </div>
          {UPCOMING_RELEASES.map(group => {
            const aosItems = group.items.filter(i => i.universe === 'aos');
            if (!aosItems.length) return null;
            return (
              <div key={group.month} style={{ marginBottom:14 }}>
                <div style={{ padding:"6px 16px 8px", fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.gold, letterSpacing:3, textTransform:"uppercase", borderBottom:`1px solid ${AOS.border}` }}>{group.month}</div>
                <div style={{ padding:"6px 16px", display:"flex", flexDirection:"column", gap:6 }}>
                  {aosItems.map((item,i) => {
                    const typeColor = item.type==='Novel' ? AOS.text : item.type==='Anthology' ? AOS.blue : AOS.goldDim;
                    return (
                      <div key={i} style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderLeft:`3px solid ${AOS.gold}44`, borderRadius:8, padding:"10px 12px", display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                            <span style={{ background:`${typeColor}18`, border:`1px solid ${typeColor}33`, borderRadius:4, padding:"1px 5px", fontFamily:"'Cinzel',serif", fontSize:8, color:typeColor, letterSpacing:1, flexShrink:0 }}>{item.type}</span>
                            {item.faction && <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.muted, letterSpacing:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.faction}</span>}
                          </div>
                          <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</div>
                          <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic", marginTop:2 }}>by {item.author}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CATALOGUE */}
      {tab === "catalogue" && (
        <>
          <div style={{ padding:"12px 16px 0" }}>
            <div style={{ position:"relative" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search titles, authors, series…"
                style={{ width:"100%", background:AOS.surface, border:`1px solid ${AOS.border}`, borderRadius:10, color:AOS.text, padding:"12px 40px 12px 44px", fontSize:15, outline:"none" }}/>
              <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:AOS.muted, fontSize:18, pointerEvents:"none" }}>🔍</span>
              {search && <button onClick={() => setSearch("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:AOS.muted, cursor:"pointer", fontSize:20, lineHeight:1 }}>×</button>}
            </div>
          </div>
          {/* filter + view toggle bar */}
          <div style={{ padding:"8px 16px", display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={() => setShowFilters(f => !f)} style={{ background:showFilters||isFiltered?`${AOS.gold}22`:"transparent", border:`1px solid ${showFilters||isFiltered?AOS.gold:AOS.dim}`, borderRadius:20, padding:"7px 14px", color:showFilters||isFiltered?AOS.gold:AOS.muted, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer" }}>⚙ Filters{isFiltered?" •":""}</button>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.muted, flex:1 }}>{filtered.length} titles</span>
            {isFiltered && <button onClick={() => { setSeries("All"); setType("All"); setStatus("All"); setSort("default"); }} style={{ background:"transparent", border:`1px solid ${AOS.red}55`, borderRadius:20, padding:"5px 12px", color:AOS.red, fontFamily:"'Cinzel',serif", fontSize:10, cursor:"pointer" }}>Reset</button>}
            {/* view mode toggle */}
            <div style={{ display:"flex", gap:2, background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:8, padding:2 }}>
              {[{m:"card",icon:"▦",title:"Card"},{m:"list",icon:"☰",title:"List"},{m:"shelf",icon:"📚",title:"Shelf"}].map(v => (
                <button key={v.m} onClick={() => setViewMode(v.m)} title={v.title}
                  style={{ background:viewMode===v.m?`${AOS.gold}33`:"transparent", border:"none", borderRadius:6, width:28, height:26, cursor:"pointer", color:viewMode===v.m?AOS.gold:AOS.muted, fontSize:viewMode===v.m?13:12, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {v.icon}
                </button>
              ))}
            </div>
          </div>
          {showFilters && (
            <div style={{ padding:"0 16px 12px", borderBottom:`1px solid ${AOS.border}` }}>
              <div style={{ marginBottom:10 }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:6 }}>Status</div>
                <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
                  {[{ v:"All", l:"All" }, { v:"want", l:"📋 To Read" }, { v:"reading", l:"📖 Reading" }, { v:"read", l:"✅ Read" }, { v:"unread", l:"Unread" }].map(o => (
                    <Chip key={o.v} label={o.l} active={status===o.v} onClick={() => setStatus(o.v)}/>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:6 }}>Sort by</div>
                <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
                  {[{ v:"default", l:"Default" }, { v:"title", l:"Title A–Z" }, { v:"author", l:"Author A–Z" }, { v:"rating", l:"Rating ★" }].map(o => (
                    <Chip key={o.v} label={o.l} active={sort===o.v} onClick={() => setSort(o.v)} color={AOS.blue}/>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:6 }}>Series</div>
                <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
                  {AOS_SERIES.slice(0,15).map(o => <Chip key={o} label={o} active={series===o} onClick={() => setSeries(o)}/>)}
                </div>
              </div>
              <div>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:6 }}>Type</div>
                <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
                  {AOS_TYPES.map(o => <Chip key={o} label={o} active={type===o} onClick={() => setType(o)} color={AOS.blue}/>)}
                </div>
              </div>
            </div>
          )}

          {/* VIEW: CARD */}
          {viewMode === "card" && (
            <div style={{ padding:"10px 16px", display:"flex", flexDirection:"column", gap:8 }}>
              {sorted.length === 0 ? (
                <div style={{ textAlign:"center", padding:"60px 20px", color:AOS.muted, fontStyle:"italic" }}>No tomes found, Warrior.</div>
              ) : sorted.map(book => {
                const sc = spineColor(book);
                const tc = book.type === "Codex" ? AOS.red : AOS.gold;
                const bst = statuses[book.id]?.status || 'none';
                const bstCfg = STATUS_CFG[bst];
                const borderColor = bst !== 'none' ? bstCfg.color : sc;
                return (
                  <div key={book.id} onClick={() => setDetail(book)}
                    style={{ background:`linear-gradient(135deg,${sc}18,${AOS.card})`, border:`1px solid ${bst!=='none'?bstCfg.color+"44":sc+"44"}`, borderLeft:`3px solid ${borderColor}`, borderRadius:8, padding:"10px", cursor:"pointer", display:"flex", gap:10, alignItems:"flex-start" }}>
                    <CoverImage book={book} width={54} height={80} radius={3} accentColor={sc}/>
                    <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:3 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:4 }}>
                        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:1, textTransform:"uppercase", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.series}{book.num > 0 ? ` #${book.num}` : ""}</div>
                        <div style={{ display:"flex", gap:4, alignItems:"center", flexShrink:0 }}>
                          {bst !== 'none' && <span style={{ fontSize:12 }}>{bstCfg.icon}</span>}
                          <span style={{ background:`${tc}22`, border:`1px solid ${tc}44`, borderRadius:4, padding:"2px 6px", fontFamily:"'Cinzel',serif", fontSize:8, color:tc, letterSpacing:1 }}>{book.type}</span>
                        </div>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:bst==='read'?AOS.muted:AOS.text, lineHeight:1.3, fontFamily:"'Cinzel',serif", opacity:bst==='read'?0.75:1 }}>{book.title}</div>
                      <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic" }}>{book.author}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW: LIST */}
          {viewMode === "list" && (
            <div style={{ padding:"6px 16px 16px" }}>
              {sorted.length === 0 ? (
                <div style={{ textAlign:"center", padding:"60px 20px", color:AOS.muted, fontStyle:"italic" }}>No tomes found, Warrior.</div>
              ) : sorted.map(book => {
                const sc = spineColor(book);
                const bst = statuses[book.id]?.status || 'none';
                const bstCfg = STATUS_CFG[bst];
                return (
                  <div key={book.id} onClick={() => setDetail(book)}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${AOS.border}44`, cursor:"pointer" }}>
                    <CoverImage book={book} width={36} height={52} radius={2} accentColor={sc}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:bst==='read'?AOS.muted:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", opacity:bst==='read'?0.7:1 }}>{book.title}</div>
                      <div style={{ fontSize:10, color:AOS.muted, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.series}{book.num > 0 ? ` #${book.num}` : ""} · {book.author}</div>
                    </div>
                    {bst !== 'none' && <span style={{ fontSize:14, flexShrink:0 }}>{bstCfg.icon}</span>}
                    <span style={{ color:AOS.dim, fontSize:14, flexShrink:0 }}>›</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW: SHELF (by series) */}
          {viewMode === "shelf" && (()=>{
            if (filtered.length === 0) return <div style={{ textAlign:"center", padding:"60px 20px", color:AOS.muted, fontStyle:"italic" }}>No tomes found, Warrior.</div>;
            const seriesMap = {};
            filtered.forEach(b => { if (!seriesMap[b.series]) seriesMap[b.series] = []; seriesMap[b.series].push(b); });
            const seriesEntries = Object.entries(seriesMap).sort((a,b) => b[1].length - a[1].length);
            return (
              <div style={{ padding:"8px 0 16px" }}>
                {seriesEntries.map(([sName, books]) => {
                  const readC    = books.filter(b => statuses[b.id]?.status === 'read').length;
                  const readingC = books.filter(b => statuses[b.id]?.status === 'reading').length;
                  return (
                    <div key={sName} style={{ marginBottom:6 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:8, padding:"6px 16px 4px" }}>
                        <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.gold, letterSpacing:2, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sName}</div>
                        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.muted, letterSpacing:1, flexShrink:0 }}>
                          {readC > 0 && <span style={{ color:AOS.green }}>✅{readC} </span>}
                          {readingC > 0 && <span style={{ color:AOS.blue }}>📖{readingC} </span>}
                          <span>{books.length} books</span>
                        </div>
                      </div>
                      <div style={{ overflowX:"auto", paddingBottom:2 }}>
                        <div style={{ display:"flex", gap:2, padding:"0 16px", minWidth:"max-content", alignItems:"flex-end" }}>
                          {[...books].sort((a,b) => a.num - b.num).map(book => {
                            const sc = spineColor(book);
                            const bst = statuses[book.id]?.status || 'none';
                            const bstCfg = STATUS_CFG[bst];
                            return (
                              <div key={book.id} onClick={() => setDetail(book)}
                                title={`${book.title}${book.num > 0 ? ' #'+book.num : ''}`}
                                style={{ flexShrink:0, width:24, height:110, background:`linear-gradient(to right,${sc}ee,${sc}88,${sc}bb)`, borderRadius:"3px 3px 0 0", cursor:"pointer", position:"relative", boxShadow:`inset -2px 0 3px rgba(0,0,0,0.4),2px 0 2px rgba(0,0,0,0.3)`, border:`1px solid ${bst!=='none'?bstCfg.color+'aa':sc+'88'}`, borderBottom:"none", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", transition:"transform 0.12s" }}
                                onMouseEnter={e => e.currentTarget.style.transform="translateY(-5px)"}
                                onMouseLeave={e => e.currentTarget.style.transform="none"}>
                                <div style={{ writingMode:"vertical-rl", transform:"rotate(180deg)", fontFamily:"'Cinzel',serif", fontSize:6, color:"rgba(255,255,255,0.85)", letterSpacing:0.8, overflow:"hidden", maxHeight:"90%", padding:"3px 2px", textShadow:"0 1px 2px rgba(0,0,0,0.9)", lineHeight:1.1, textAlign:"center" }}>
                                  {book.num > 0 ? `#${book.num} `+book.title.split(' ').slice(0,3).join(' ') : book.title.split(' ').slice(0,3).join(' ')}
                                </div>
                                {bst !== 'none' && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:bstCfg.color }}/>}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ height:8, background:"linear-gradient(to bottom,#5a3a1a,#3a2010)", margin:"0 16px", borderRadius:"0 0 3px 3px", boxShadow:"0 2px 5px rgba(0,0,0,0.5)" }}/>
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

// ─── AoS GETTING STARTED GUIDE ────────────────────────────────────────────────
function findAoSBook(entry) {
  if (entry.aos_id) return AOS_BOOKS.find(b => b.id === entry.aos_id);
  return AOS_BOOKS.find(b => b.title.toLowerCase() === entry.t.toLowerCase());
}

const AOS_STARTER_GUIDE = [
  {
    id:"s1", step:"Step 1", title:"The Essential Introduction",
    note:"Hammerhal is a short novella by Josh Reynolds that was specifically designed to introduce readers to both Warhammer Age of Sigmar and Black Library fiction. It's the #1 recommended entry point — also available in the Hammerhal & Other Stories anthology.",
    books:[
      { t:"Hammerhal", a:"Josh Reynolds", type:"novella", aos_id:"aos68" },
    ],
  },
  {
    id:"s2", step:"Step 2", title:"Deepen the World",
    note:"Both are ideal second reads, each showing a different face of the Mortal Realms. City of Secrets grounds you in ordinary mortal life. Spear of Shadows is an epic multi-faction quest — described by David Guymer as 'the complete starter text for any Age of Sigmar fan'.",
    pickOne:true,
    options:[
      { label:"Mortals & Mystery", color:"#607080",
        note:"Follows ordinary humans in Hammerhal, a free city of the Mortal Realms. No cosmic knowledge needed — the most grounded entry point.",
        books:[
          { t:"City of Secrets", a:"Nick Horth", type:"novel", aos_id:"aos27" },
        ]},
      { label:"Epic Quest", color:"#7a5aaa",
        note:"A multi-faction adventure across the Mortal Realms hunting legendary weapons. Perfect for readers who want the big fantasy-quest feel immediately.",
        books:[
          { t:"Eight Lamentations: Spear of Shadows", a:"Josh Reynolds", type:"novel", aos_id:"aos17" },
        ]},
    ],
  },
  {
    id:"s3", step:"Step 3", title:"The Grand Narrative",
    note:"Soul Wars is the launch novel for Age of Sigmar 2nd edition — the Necroquake reshapes the Mortal Realms and Nagash's power surges. Essential for understanding the current shape of the setting.",
    books:[
      { t:"Soul Wars", a:"Josh Reynolds", type:"novel", aos_id:"aos42" },
    ],
  },
  {
    id:"s4", step:"Step 4", title:"Choose Your Path",
    note:"Now dive deep into whichever faction or style of story speaks to you.",
    pickOne:true,
    options:[
      { label:"Stormcast Eternals", color:"#5a8fc5",
        note:"Sigmar's reforged warriors of lightning — the heart of the AoS setting. The Hallowed Knights are the definitive Stormcast series.",
        books:[
          { t:"Hallowed Knights: Plague Garden", a:"Josh Reynolds", type:"novel", aos_id:"aos14" },
          { t:"Hallowed Knights: Black Pyramid",  a:"Josh Reynolds", type:"novel", aos_id:"aos15" },
        ]},
      { label:"Gotrek and Felix", color:"#a07838",
        note:"The full saga of Gotrek Gurnisson and Felix Jaeger. The first 16 novels are set in the Old World (ending with the End Times); the saga then continues in the Age of Sigmar. To stay purely in AoS, jump straight to Ghoulslayer — no prior knowledge needed.",
        books:[
          { t:"Trollslayer",                          a:"William King",   type:"novel", aos_id:"aos89",  era:"old" },
          { t:"Skavenslayer",                         a:"William King",   type:"novel", aos_id:"aos90",  era:"old" },
          { t:"Daemonslayer",                         a:"William King",   type:"novel", aos_id:"aos91",  era:"old" },
          { t:"Dragonslayer",                         a:"William King",   type:"novel", aos_id:"aos92",  era:"old" },
          { t:"Beastslayer",                          a:"William King",   type:"novel", aos_id:"aos93",  era:"old" },
          { t:"Vampireslayer",                        a:"William King",   type:"novel", aos_id:"aos94",  era:"old" },
          { t:"Giantslayer",                          a:"William King",   type:"novel", aos_id:"aos95",  era:"old" },
          { t:"Orcslayer",                            a:"Nathan Long",    type:"novel", aos_id:"aos96",  era:"old" },
          { t:"Manslayer",                            a:"Nathan Long",    type:"novel", aos_id:"aos97",  era:"old" },
          { t:"Elfslayer",                            a:"Nathan Long",    type:"novel", aos_id:"aos98",  era:"old" },
          { t:"Shamanslayer",                         a:"Nathan Long",    type:"novel", aos_id:"aos99",  era:"old" },
          { t:"Zombieslayer",                         a:"Nathan Long",    type:"novel", aos_id:"aos100", era:"old" },
          { t:"Road of Skulls",                       a:"Josh Reynolds",  type:"novel", aos_id:"aos101", era:"old" },
          { t:"City of the Damned",                   a:"David Guymer",   type:"novel", aos_id:"aos102", era:"old" },
          { t:"Kinslayer",                            a:"David Guymer",   type:"novel", aos_id:"aos103", era:"old" },
          { t:"Slayer",                               a:"David Guymer",   type:"novel", aos_id:"aos104", era:"old" },
          { t:"Realmslayer",                          a:"David Guymer",   type:"audio", aos_id:"aos19",  era:"aos" },
          { t:"Realmslayer: Blood of the Old World",  a:"David Guymer",   type:"audio", aos_id:"aos20",  era:"aos" },
          { t:"Ghoulslayer",                          a:"Darius Hinks",   type:"novel", aos_id:"aos21",  era:"aos" },
          { t:"Gitslayer",                            a:"Darius Hinks",   type:"novel", aos_id:"aos22",  era:"aos" },
          { t:"Soulslayer",                           a:"Darius Hinks",   type:"novel", aos_id:"aos23",  era:"aos" },
          { t:"Blightslayer",                         a:"Richard Strachan", type:"novel", aos_id:"aos24", era:"aos" },
          { t:"Realmslayer: Legend of the Doomseeker", a:"David Guymer",  type:"audio", aos_id:"aos67",  era:"aos" },
        ]},
      { label:"Callis & Toll", color:"#607080",
        note:"Continuing from City of Secrets — a witch hunter and a disgraced soldier chase mystery and intrigue across the free cities.",
        books:[
          { t:"Callis and Toll: The Silver Shard", a:"Nick Horth", type:"novel", aos_id:"aos28" },
          { t:"Callis and Toll",                   a:"Nick Horth", type:"novel", aos_id:"aos29" },
        ]},
      { label:"Kharadron Overlords", color:"#5a708a",
        note:"Sky-pirates, duardin engineers and aether-gold. The Drekki Flynt series brings swashbuckling adventure to the Mortal Realms.",
        books:[
          { t:"The Arkanaut's Oath",       a:"Guy Haley",      type:"novel", aos_id:"aos32" },
          { t:"The Ghosts of Barak-Minoz", a:"Guy Haley",      type:"novel", aos_id:"aos33" },
          { t:"Profit's Ruin",             a:"Josh Reynolds",  type:"novel", aos_id:"aos66" },
        ]},
    ],
  },
  {
    id:"s5", step:"Further Reading", title:"Explore the Mortal Realms",
    note:"Once you know the setting well, these expand into other factions and darker corners of the Mortal Realms.",
    books:[
      { t:"Dominion",                   a:"Darius Hinks",   type:"novel",   aos_id:"aos51", opt:true },
      { t:"Hamilcar: Champion of the Gods", a:"David Guymer", type:"novel", aos_id:"aos25", opt:true },
      { t:"Blacktalon: First Mark",     a:"Andy Clark",     type:"novel",   aos_id:"aos30", opt:true },
      { t:"Nagash: The Undying King",   a:"Josh Reynolds",  type:"novel",   aos_id:"aos41", opt:true },
      { t:"Godeater's Son",             a:"Noah Van Nguyen", type:"novel",  aos_id:"aos72", opt:true },
    ],
  },
  {
    id:"s6", step:"Old World", title:"Explore the Old World",
    note:"The Mortal Realms were born from the ashes of the Old World — Warhammer Fantasy. These sagas predate Age of Sigmar and give deep lore context. All set before the End Times.",
    pickOne:true,
    options:[
      { label:"The Legend of Sigmar", color:"#c9a84c",
        note:"How a mortal barbarian chieftain became the god-king who would forge the Stormcast Eternals. Essential AoS backstory.",
        books:[
          { t:"Heldenhammer", a:"Graham McNeill", type:"novel", aos_id:"ow1", era:"old" },
          { t:"Empire",       a:"Graham McNeill", type:"novel", aos_id:"ow2", era:"old" },
          { t:"God King",     a:"Graham McNeill", type:"novel", aos_id:"ow3", era:"old" },
        ]},
      { label:"Nagash", color:"#7a4aaa",
        note:"The rise of the Great Necromancer who would become the supreme lord of the undead — and AoS's most powerful villain. Essential backstory for Death factions.",
        books:[
          { t:"Nagash the Sorcerer", a:"Mike Lee", type:"novel", aos_id:"ow4", era:"old" },
          { t:"Nagash the Unbroken", a:"Mike Lee", type:"novel", aos_id:"ow5", era:"old" },
          { t:"Nagash Immortal",     a:"Mike Lee", type:"novel", aos_id:"ow6", era:"old" },
        ]},
      { label:"Malus Darkblade", color:"#8a3030",
        note:"A dark elf warrior possessed by a daemon — brutal sword-and-sorcery across Naggaroth. One of Black Library's best character studies.",
        books:[
          { t:"The Daemon's Curse", a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow10", era:"old" },
          { t:"Bloodstorm",         a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow11", era:"old" },
          { t:"Reaper of Souls",    a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow12", era:"old" },
          { t:"Warpsword",     a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow13", era:"old" },
          { t:"Lord of Ruin", a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow14", era:"old" },
        ]},
      { label:"Von Carstein", color:"#6a1a1a",
        note:"The vampire counts of Sylvania — Vlad von Carstein and his dynasty wage war on the Empire. Gothic horror at its finest.",
        books:[
          { t:"Inheritance",  a:"Steven Savile", type:"novel", aos_id:"ow15", era:"old" },
          { t:"Dominion",     a:"Steven Savile", type:"novel", aos_id:"ow16", era:"old" },
          { t:"Retribution",  a:"Steven Savile", type:"novel", aos_id:"ow17", era:"old" },
        ]},
      { label:"Tyrion & Teclis", color:"#5a708a",
        note:"The twin phoenix lords of the High Elves — an epic trilogy spanning millennia of elven history. Directly relevant to AoS's Lumineth Realm-lords.",
        books:[
          { t:"Blood of Aenarion", a:"William King", type:"novel", aos_id:"ow7", era:"old" },
          { t:"Sword of Caledor",  a:"William King", type:"novel", aos_id:"ow8", era:"old" },
          { t:"Bane of Malekith",  a:"William King", type:"novel", aos_id:"ow9", era:"old" },
        ]},
      { label:"Genevieve", color:"#7a3a5a",
        note:"A vampire navigating the Empire's underworld — gothic noir by Jack Yeovil (Kim Newman). The most literary of Black Library's Old World fiction.",
        books:[
          { t:"Drachenfels",      a:"Jack Yeovil", type:"novel",     aos_id:"ow18", era:"old" },
          { t:"Genevieve Undead", a:"Jack Yeovil", type:"novel",     aos_id:"ow19", era:"old" },
          { t:"Beasts in Velvet", a:"Jack Yeovil", type:"novel",     aos_id:"ow20", era:"old" },
          { t:"Silver Nails",     a:"Jack Yeovil", type:"anthology", aos_id:"ow21", era:"old" },
        ]},
    ],
  },
];

function AoSBookRow({ entry, statuses, isLast }) {
  const book = findAoSBook(entry);
  const status = book ? statuses[book.id]?.status || 'none' : null;
  const stCfg = status && status !== 'none' ? STATUS_CFG[status] : null;
  const type = entry.type || 'novel';
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:isLast?"none":`1px solid ${AOS.border}22`, opacity:type==='audio'?0.72:1 }}>
      <span style={{ fontSize:11, flexShrink:0, width:18, textAlign:"center" }}>
        {type==='audio'?'🎧':type==='novella'?'📑':'📖'}
      </span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color:entry.opt?AOS.muted:AOS.text, fontStyle:entry.opt?"italic":"normal", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Cinzel',serif" }}>
          {entry.t}
          {entry.opt && <span style={{ fontSize:9, color:AOS.muted, marginLeft:4 }}>(optional)</span>}
        </div>
        <div style={{ fontSize:10, color:AOS.muted, display:"flex", alignItems:"center", gap:6 }}>
          {entry.era && <span style={{ fontSize:8, fontFamily:"'Cinzel',serif", letterSpacing:1, textTransform:"uppercase", color:entry.era==='aos'?AOS.gold:AOS.blue, border:`1px solid ${entry.era==='aos'?AOS.gold:AOS.blue}55`, borderRadius:4, padding:"1px 5px", flexShrink:0 }}>{entry.era==='aos'?'Age of Sigmar':'Old World'}</span>}
          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{entry.a}</span>
        </div>
      </div>
      {stCfg && <span style={{ fontSize:13, flexShrink:0 }}>{stCfg.icon}</span>}
    </div>
  );
}

function AoSGetStartedSection({ statuses }) {
  const [open, setOpen] = useState(new Set(['s1']));
  const toggle = id => setOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const [arcOpen, setArcOpen] = useState(new Set(['ae1']));
  const toggleArc = id => setArcOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const StepCard = ({ step }) => {
    const isOpen = open.has(step.id);
    const allBooks = step.pickOne ? (step.options||[]).flatMap(o => o.books||[]) : (step.books||[]);
    const matched = allBooks.map(e => findAoSBook(e)).filter(Boolean);
    const readCount = matched.filter(b => statuses[b.id]?.status === 'read').length;
    const allRead = matched.length > 0 && readCount === matched.length;
    return (
      <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderLeft:`3px solid ${allRead?AOS.green:AOS.dim}`, borderRadius:10, overflow:"hidden" }}>
        <div onClick={() => toggle(step.id)} style={{ padding:"11px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:3 }}>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, flexShrink:0 }}>{step.step}</span>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{step.title}</span>
            </div>
            <div style={{ fontSize:10, color:AOS.muted }}>
              {step.pickOne ? "Pick one path" : `${allBooks.length} book${allBooks.length!==1?"s":""}`}
              {matched.length>0&&readCount>0&&<span style={{ color:allRead?AOS.green:AOS.blue, marginLeft:6 }}>{allRead?"✅":""}{readCount}/{matched.length} read</span>}
            </div>
          </div>
          <span style={{ color:AOS.goldDim, fontSize:16, flexShrink:0, transition:"transform 0.2s", transform:isOpen?"rotate(90deg)":"none" }}>›</span>
        </div>
        {isOpen && (
          <div style={{ borderTop:`1px solid ${AOS.border}`, padding:"10px 14px 12px" }}>
            {step.note && (
              <div style={{ fontSize:11, color:AOS.gold, fontStyle:"italic", marginBottom:10, padding:"6px 10px", background:`${AOS.gold}0a`, borderRadius:6, borderLeft:`2px solid ${AOS.gold}44` }}>
                {step.note}
              </div>
            )}
            {step.pickOne ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(step.options||[]).map((opt,oi) => (
                  <div key={oi} style={{ background:AOS.surface, border:`1px solid ${AOS.border}`, borderLeft:`3px solid ${opt.color||AOS.gold}`, borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:opt.color||AOS.gold, letterSpacing:2, marginBottom:opt.note?4:6 }}>{opt.label.toUpperCase()}</div>
                    {opt.note && <div style={{ fontSize:10, color:AOS.muted, fontStyle:"italic", marginBottom:6 }}>💡 {opt.note}</div>}
                    {(opt.books||[]).map((e,i) => <AoSBookRow key={i} entry={e} statuses={statuses} isLast={i===opt.books.length-1}/>)}
                  </div>
                ))}
              </div>
            ) : (
              (step.books||[]).map((e,i) => <AoSBookRow key={i} entry={e} statuses={statuses} isLast={i===step.books.length-1}/>)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ padding:"12px 16px 10px", borderBottom:`1px solid ${AOS.border}`, background:`linear-gradient(180deg,${AOS.surface},${AOS.bg})` }}>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:18, color:AOS.text, marginBottom:4 }}>Getting Started Guide</div>
        <div style={{ fontSize:11, color:AOS.muted, marginBottom:6 }}>
          For newcomers to Age of Sigmar — your guided first steps into the Mortal Realms, with branching picks for every taste. Based on{' '}
          <a href="https://www.trackofwords.com/2018/09/12/getting-started-with-black-library-age-of-sigmar/" target="_blank" rel="noopener noreferrer" style={{ color:AOS.blue, textDecoration:"underline", textDecorationColor:`${AOS.blue}66` }}>Track of Words</a>
        </div>
      </div>
      <div style={{ padding:"10px 16px 16px", display:"flex", flexDirection:"column", gap:6 }}>
        {AOS_STARTER_GUIDE.map(step => <StepCard key={step.id} step={step}/>)}
        <div style={{ marginTop:8, padding:"10px 12px", background:AOS.surface, border:`1px solid ${AOS.border}`, borderRadius:8, fontSize:10, color:AOS.muted, lineHeight:1.6, textAlign:"center" }}>
          Guide based on recommendations by{' '}
          <a href="https://www.trackofwords.com/tag/where-to-start-with-black-library/" target="_blank" rel="noopener noreferrer" style={{ color:AOS.blue, textDecoration:"underline" }}>Track of Words</a>
        </div>
        <div style={{ marginTop:16, borderTop:`1px solid ${AOS.border}`, paddingTop:14 }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:4 }}>📖 Main Story Arc</div>
          <div style={{ fontSize:11, color:AOS.muted, marginBottom:10 }}>The chronological backbone of the Mortal Realms — from Sigmar's dawn to the Dawnbringers.</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {AOS_ESSENTIAL.map(part => (
              <AoSPartCard key={part.id} part={part} isOpen={arcOpen.has(part.id)} onToggle={() => toggleArc(part.id)} statuses={statuses}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AoSPartCard({ part, isOpen, onToggle, statuses }) {
  const mainBooks = part.books || [];
  const novelEntries = mainBooks.filter(b => !b.type || b.type === 'novel' || b.type === 'novella');
  const extraEntries = mainBooks.filter(b => b.type === 'short' || b.type === 'audio' || b.type === 'anthology');
  const novelMatched = novelEntries.map(e => findAoSGuideBook(e)).filter(Boolean);
  const readCount = novelMatched.filter(b => statuses[b.id]?.status === 'read').length;
  const allRead = novelMatched.length > 0 && readCount === novelMatched.length;
  return (
    <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderLeft:`3px solid ${allRead?AOS.green:AOS.dim}`, borderRadius:10, overflow:"hidden" }}>
      <button type="button" onClick={onToggle} style={{ padding:"11px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", background:"transparent", border:"none" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:3 }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, flexShrink:0 }}>{part.label}</span>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{part.title}</span>
          </div>
          <div style={{ fontSize:10, color:AOS.muted }}>
            {novelEntries.length > 0 && `${novelEntries.length} novel${novelEntries.length!==1?"s":""}`}
            {extraEntries.length > 0 && ` + ${extraEntries.length} more`}
            {novelMatched.length > 0 && readCount > 0 && <span style={{ color:allRead?AOS.green:AOS.blue, marginLeft:6 }}>{allRead?"✅":""}{readCount}/{novelMatched.length} read</span>}
          </div>
        </div>
        <span style={{ color:AOS.goldDim, fontSize:16, flexShrink:0, transition:"transform 0.2s", transform:isOpen?"rotate(90deg)":"none" }}>›</span>
      </button>
      {isOpen && (
        <div style={{ borderTop:`1px solid ${AOS.border}`, padding:"10px 14px 12px" }}>
          {part.note && <div style={{ fontSize:11, color:AOS.gold, fontStyle:"italic", marginBottom:10, padding:"6px 10px", background:`${AOS.gold}0a`, borderRadius:6, borderLeft:`2px solid ${AOS.gold}44` }}>{part.note}</div>}
          {mainBooks.map((entry, i) => <AoSBookRow key={i} entry={entry} statuses={statuses} isLast={i===mainBooks.length-1}/>)}
        </div>
      )}
    </div>
  );
}

// ─── AoS PATH TO GLORY ────────────────────────────────────────────────────────
export function AoSCrusadeSection({ user, statuses: propStatuses }) {
  const [tab,            setTab]          = useState('overview');
  const [localStatuses,  setLocalStatuses] = useState({});
  const [expanded,       setExpanded]     = useState(null);
  const statuses = propStatuses ?? localStatuses;

  useEffect(() => {
    if (propStatuses !== undefined) return;
    const uid = user?.id || 'anon';
    const prefix = `wh40k_status_${uid}_`;
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) {
        const id = k.slice(prefix.length);
        if (id.startsWith('aos')) try { out[id] = JSON.parse(localStorage.getItem(k)); } catch {}
      }
    }
    setLocalStatuses(out);
  }, [user?.id, propStatuses]);

  const nonCodex = useMemo(() => AOS_BOOKS.filter(b => b.type !== 'Codex'), []);
  const readCount    = useMemo(() => nonCodex.filter(b => statuses[b.id]?.status === 'read').length,    [statuses, nonCodex]);
  const readingCount = useMemo(() => nonCodex.filter(b => statuses[b.id]?.status === 'reading').length, [statuses, nonCodex]);
  const wantCount    = useMemo(() => nonCodex.filter(b => statuses[b.id]?.status === 'want').length,    [statuses, nonCodex]);
  const total        = nonCodex.length;

  const seriesList = useMemo(() => {
    const map = {};
    nonCodex.filter(b => b.series).forEach(b => { if (!map[b.series]) map[b.series] = []; map[b.series].push(b); });
    return Object.entries(map).map(([name, books]) => {
      const sorted = [...books].sort((a,b) => a.num - b.num);
      const rc = sorted.filter(b => statuses[b.id]?.status === 'read').length;
      const nc = sorted.filter(b => statuses[b.id]?.status === 'reading').length;
      return { name, books:sorted, total:sorted.length, readCount:rc, readingCount:nc };
    }).sort((a,b) => {
      if (a.readingCount>0&&!b.readingCount) return -1;
      if (b.readingCount>0&&!a.readingCount) return 1;
      if (b.readCount!==a.readCount) return b.readCount-a.readCount;
      return b.total-a.total;
    });
  }, [statuses, nonCodex]);

  const seriesByEra = useMemo(() =>
    SAGA_ERAS.map(era => ({
      era,
      sagas: seriesList.filter(s => (SAGA_ERA[s.name] || "other") === era.key),
    })).filter(g => g.sagas.length > 0),
  [seriesList]);

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      {/* Tab bar */}
      <div style={{ display:"flex", borderBottom:`1px solid ${AOS.border}`, background:AOS.surface, position:"sticky", top:0, zIndex:5 }}>
        {[{ id:"overview", label:"Overview" }, { id:"guide", label:"🌟 Getting Started" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:"12px 4px", background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===t.id?AOS.gold:"transparent"}`,
            color:tab===t.id?AOS.gold:AOS.muted,
            fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1,
            cursor:"pointer", textTransform:"uppercase", transition:"color 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {tab==="guide" && <AoSGetStartedSection statuses={statuses}/>}

      {tab==="overview" && <>
        {/* Header + stats */}
        <div style={{ padding:"22px 16px 12px", borderBottom:`1px solid ${AOS.border}` }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5, color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>Black Library</div>
          <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:14 }}>Path to Glory</h2>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            {[
              { label:"Read",    count:readCount,    color:AOS.green },
              { label:"Reading", count:readingCount, color:AOS.blue  },
              { label:"To Read", count:wantCount,    color:AOS.gold  },
              { label:"Total",   count:total,        color:AOS.muted },
            ].map(s => (
              <div key={s.label} style={{ flex:"1 1 60px", background:AOS.card, border:`1px solid ${s.color}44`, borderRadius:10, padding:"10px 14px", textAlign:"center" }}>
                <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:20, color:s.color, lineHeight:1 }}>{s.count}</div>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.muted, letterSpacing:2, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ height:6, background:AOS.dim, borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${total>0?(readCount/total)*100:0}%`, background:`linear-gradient(to right,${AOS.green},${AOS.gold})`, borderRadius:3, transition:"width 0.5s ease" }}/>
          </div>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.muted, letterSpacing:2, marginTop:6, textAlign:"right" }}>
            {total>0?Math.round((readCount/total)*100):0}% COMPLETE
          </div>
        </div>

        {/* Series list — grouped by chronological era */}
        <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:14 }}>
          {seriesByEra.map(({ era, sagas }) => (
            <div key={era.key} style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, paddingBottom:2, borderBottom:`1px solid ${AOS.border}` }}>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:AOS.gold, letterSpacing:3, textTransform:"uppercase" }}>{era.label}</span>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.muted, letterSpacing:1, fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{era.sub}</span>
              </div>
              {sagas.map(serie => {
            const pct = serie.total>0?(serie.readCount/serie.total)*100:0;
            const isExp = expanded===serie.name;
            return (
              <div key={serie.name} style={{ background:AOS.card, border:`1px solid ${serie.readingCount>0?AOS.blue:AOS.border}`, borderLeft:`3px solid ${serie.readingCount>0?AOS.blue:serie.readCount===serie.total&&serie.total>0?AOS.green:AOS.dim}`, borderRadius:10, overflow:"hidden" }}>
                <div onClick={() => setExpanded(isExp?null:serie.name)} style={{ padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, fontWeight:700, color:AOS.text, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{serie.name}</div>
                    <div style={{ height:4, background:AOS.dim, borderRadius:2, overflow:"hidden", marginTop:6 }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:pct>=100?AOS.green:AOS.gold, borderRadius:2 }}/>
                    </div>
                    <div style={{ display:"flex", gap:10, marginTop:5 }}>
                      {serie.readCount>0&&<span style={{ fontSize:10, color:AOS.green }}>✅ {serie.readCount}</span>}
                      {serie.readingCount>0&&<span style={{ fontSize:10, color:AOS.blue }}>📖 {serie.readingCount}</span>}
                      <span style={{ fontSize:10, color:AOS.muted }}>{serie.total} books</span>
                    </div>
                  </div>
                  <span style={{ color:AOS.goldDim, fontSize:16, flexShrink:0, transition:"transform 0.2s", transform:isExp?"rotate(90deg)":"none" }}>›</span>
                </div>
                {isExp && (
                  <div style={{ borderTop:`1px solid ${AOS.border}`, padding:"8px 14px 10px", display:"flex", flexDirection:"column", gap:4 }}>
                    {serie.books.map((b,bi) => {
                      const st = statuses[b.id]?.status||'none';
                      const stCfg = st!=='none'?STATUS_CFG[st]:null;
                      return (
                        <div key={b.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:bi<serie.books.length-1?`1px solid ${AOS.border}22`:"none" }}>
                          <span style={{ fontSize:11, flexShrink:0, width:18, textAlign:"center" }}>
                            {b.type==='Audio Drama'?'🎧':b.type==='Anthology'?'📚':b.type==='Novella'?'📑':'📖'}
                          </span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Cinzel',serif" }}>
                              {b.title}{b.num>0&&<span style={{ fontSize:9, color:AOS.goldDim, marginLeft:4 }}>#{b.num}</span>}
                            </div>
                            <div style={{ fontSize:10, color:AOS.muted }}>{b.author}</div>
                          </div>
                          {stCfg&&<span style={{ fontSize:13, flexShrink:0 }}>{stCfg.icon}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
              })}
            </div>
          ))}
        </div>

      </>}
    </div>
  );
}
