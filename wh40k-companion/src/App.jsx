import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { supabase, signInWithGoogle, signOut } from "./lib/supabase";
import { sb } from "./lib/sb";
import { C, FC, STATUS_CFG } from "./data/constants";
import { BOOKS, ALL_SERIES, ALL_FACTIONS, ALL_TYPES, ALL_ERAS } from "./data/books";
import { HH_FULL, HH_OPTIONAL, HH_MIN, findHHBook } from "./data/hhGuide";
import MusicPlayer from "./components/MusicPlayer";
import LoginPage from "./components/LoginPage";
import UniverseSelector from "./components/UniverseSelector";
import { AOS, AOS_BOOKS } from "./data/aosBooks";
import CoverImage from "./components/CoverImage";
import {
  achievementFromId,
  computeReadingAchievements,
  computeAoSReadingAchievements,
  diffAchievements,
  loadUnlockedIds,
  saveUnlockedIds,
} from "./lib/achievements";

const EpubReader        = lazy(() => import("./components/EpubReader"));
const PdfReader         = lazy(() => import("./components/PdfReader"));
const PaintingTracker   = lazy(() => import("./components/PaintingTracker"));
const StatsModal        = lazy(() => import("./components/StatsModal"));
const AchievementPopup  = lazy(() => import("./components/AchievementPopup"));
const AoSHomePage       = lazy(() => import("./components/AoSApp").then(m => ({ default: m.AoSHomePage })));
const AoSLibrarySection = lazy(() => import("./components/AoSApp").then(m => ({ default: m.AoSLibrarySection })));
const AoSCrusadeSection = lazy(() => import("./components/AoSApp").then(m => ({ default: m.AoSCrusadeSection })));

// ─── READING STATUS SYSTEM ────────────────────────────────────────────────────
function getBookStatus(uid,bid){
  try{return JSON.parse(localStorage.getItem(`wh40k_status_${uid||'anon'}_${bid}`))||{status:'none'};}
  catch{return{status:'none'};}
}
function setBookStatusLS(uid,bid,s){
  const e=getBookStatus(uid,bid),now=new Date().toISOString(),d={...e,status:s,updatedAt:now};
  if(s==='reading'&&!e.startedAt)d.startedAt=now;
  if(s==='read'){d.completedAt=now;if(!d.startedAt)d.startedAt=now;}
  localStorage.setItem(`wh40k_status_${uid||'anon'}_${bid}`,JSON.stringify(d));
  return d;
}
function loadAllStatuses(uid){
  const out={},prefix=`wh40k_status_${uid||'anon'}_`;
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k?.startsWith(prefix)){const id=parseInt(k.slice(prefix.length));if(!isNaN(id))try{out[id]=JSON.parse(localStorage.getItem(k));}catch{}}
  }
  return out;
}
function loadAoSStatuses(uid){
  const out={},prefix=`wh40k_status_${uid||'anon'}_`;
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k?.startsWith(prefix)){const id=k.slice(prefix.length);if(id.startsWith('aos'))try{out[id]=JSON.parse(localStorage.getItem(k));}catch{}}
  }
  return out;
}

function getBookRating(uid, bid) {
  return parseInt(localStorage.getItem(`wh40k_rating_${uid||'anon'}_${bid}`) || '0') || 0;
}
function setBookRatingLS(uid, bid, r) {
  localStorage.setItem(`wh40k_rating_${uid||'anon'}_${bid}`, String(r));
}
function getBookNotes(uid, bid) {
  return localStorage.getItem(`wh40k_notes_${uid||'anon'}_${bid}`) || '';
}
function setBookNotesLS(uid, bid, n) {
  if (n) localStorage.setItem(`wh40k_notes_${uid||'anon'}_${bid}`, n);
  else localStorage.removeItem(`wh40k_notes_${uid||'anon'}_${bid}`);
}

// ─── BOOK DETAIL ──────────────────────────────────────────────────────────────
function BookDetail({ book, user, onBack, onOpenReader, status, onStatusChange }) {
  const fc=FC[book.faction]||C.dim;
  const inp=useRef(null);
  const [ebookMeta,    setEbookMeta]    = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadMsg,    setUploadMsg]    = useState("");
  const [curStatus,    setCurStatus]    = useState(status?.status||'none');
  const [progress,      setProgress]      = useState(0);
  const [chapterIndex,  setChapterIndex]  = useState(0);
  const [pageIndex,     setPageIndex]     = useState(0);
  const [bookmarkInfo,  setBookmarkInfo]  = useState(null);
  const [bookmarksList, setBookmarksList] = useState([]); // manual bookmarks array
  const [rating,    setRating]    = useState(() => getBookRating(user?.id, book.id));
  const [notes,     setNotes]     = useState(() => getBookNotes(user?.id, book.id));
  const [notesSaved, setNotesSaved] = useState(false);

  useEffect(()=>{ setCurStatus(status?.status||'none'); },[status]);

  const changeStatus=(s)=>{
    setCurStatus(s);
    setBookStatusLS(user?.id, book.id, s);
    onStatusChange?.(book.id, s);
  };

  useEffect(()=>{
    if(!user?.id) return; // RLS needs an authenticated user
    (async()=>{
      const [filesRes,progData]=await Promise.all([
        supabase.from("ebook_files").select("*").eq("user_id",user.id).eq("book_id",book.id).limit(1),
        sb.get("reading_progress",`book_id=eq.${book.id}&limit=1`),
      ]);
      const files=filesRes.data||[];
      if(files.length){
        setEbookMeta(files[0]);
      } else {
        const cached=localStorage.getItem(`wh40k_ebook_${user.id}_${book.id}`);
        if(cached){ try{ setEbookMeta(JSON.parse(cached)); }catch{} }
      }
      if(progData?.length){
        setProgress(progData[0].progress_pct||0);
        setChapterIndex(progData[0].chapter_index||0);
        setPageIndex(progData[0].page_index||0);
        if(progData[0].progress_pct>0)
          setBookmarkInfo({chapter_index:progData[0].chapter_index||0,page_index:progData[0].page_index||0,progress_pct:progData[0].progress_pct||0});
      } else {
        const cp=localStorage.getItem(`wh40k_prog_${user.id}_${book.id}`);
        if(cp){ try{
          const p=JSON.parse(cp);
          setProgress(p.progress_pct||0);
          setChapterIndex(p.chapter_index||0);
          setPageIndex(p.page_index||0);
          if(p.bookmarked||p.progress_pct>0||p.chapter_index>0||p.page_index>0)
            setBookmarkInfo({chapter_index:p.chapter_index||0,page_index:p.page_index||0,bookmarkedAt:p.bookmarkedAt||p.last_read||null,progress_pct:p.progress_pct||0});
        }catch{} }
      }
      // Load manual bookmarks array
      try{
        const bms=JSON.parse(localStorage.getItem(`wh40k_bm_${user.id}_${book.id}`)||'[]');
        setBookmarksList(bms);
      }catch{}
    })();
  },[book.id, user?.id]);

  const handleFileSelect=async e=>{
    const file=e.target.files[0]; if(!file) return;
    if(!user?.id){ setUploadMsg("❌ Sign in to upload ebooks."); return; }
    setUploading(true); setUploadMsg("Uploading to cloud…");
    // Path includes user.id so storage RLS policy matches: (foldername)[1] = auth.uid()
    const path=`${user.id}/${book.id}/${file.name}`;
    const ok=await sb.storage.upload(path,file);
    if(ok){
      const meta={user_id:user.id,book_id:book.id,file_name:file.name,file_path:path,file_type:file.name.toLowerCase().endsWith(".pdf")?"pdf":"epub"};
      const lsKey = `wh40k_ebook_${user.id}_${book.id}`;
      localStorage.setItem(lsKey, JSON.stringify(meta));
      setEbookMeta(meta);
      const { error:upsertErr } = await supabase.from("ebook_files").upsert(meta, { onConflict:"user_id,book_id" });
      if(upsertErr){
        // No unique constraint — fall back to delete + insert
        await supabase.from("ebook_files").delete().eq("user_id",user.id).eq("book_id",book.id);
        const { error:insErr } = await supabase.from("ebook_files").insert(meta);
        if(insErr){ setUploadMsg(`⚠️ File saved locally but DB error: ${insErr.message?.slice(0,80)}`); }
        else { setUploadMsg("✅ Uploaded & synced!"); }
      } else {
        setUploadMsg("✅ Uploaded & synced!");
      }
    } else { setUploadMsg("❌ Upload failed — check Supabase storage policy."); }
    setUploading(false); setTimeout(()=>setUploadMsg(""),3000);
  };

  const handleOpenReader=async()=>{
    if(!ebookMeta) return;
    setUploadMsg("Opening…");
    const url=await sb.storage.signedUrl(ebookMeta.file_path);
    if(!url){ setUploadMsg("❌ Could not open file — try re-uploading."); return; }
    setUploadMsg("");
    onOpenReader({book,url,fileType:ebookMeta.file_type,progress,chapterIndex,pageIndex});
  };

  const [deleteConfirm,setDeleteConfirm]=useState(false);
  const handleDeleteEbook=async()=>{
    if(!deleteConfirm){ setDeleteConfirm(true); setTimeout(()=>setDeleteConfirm(false),4000); return; }
    setDeleteConfirm(false);
    setUploadMsg("Removing…");
    // Delete from Storage
    if(ebookMeta?.file_path) await sb.storage.remove(ebookMeta.file_path);
    // Delete from DB
    if(user?.id) await supabase.from("ebook_files").delete().eq("user_id",user.id).eq("book_id",book.id);
    // Clear localStorage cache
    if(user?.id) localStorage.removeItem(`wh40k_ebook_${user.id}_${book.id}`);
    setEbookMeta(null);
    setUploadMsg("✅ Ebook removed.");
    setTimeout(()=>setUploadMsg(""),2500);
  };

  return(
    <div style={{minHeight:"100%",background:C.bg}}>
      <div style={{position:"sticky",top:0,zIndex:10,background:C.surface,borderBottom:`1px solid ${C.border}`,height:52,display:"flex",alignItems:"center",padding:"0 16px",gap:12}}>
        <button onClick={onBack} style={{background:"transparent",border:`1px solid ${C.dim}`,borderRadius:8,color:C.gold,padding:"7px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:1}}>← Library</button>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series}{book.num>0?` #${book.num}`:""}</div>
      </div>
      <div style={{background:`linear-gradient(160deg,${fc}55,${C.card})`,borderBottom:`1px solid ${fc}66`,padding:"28px 20px 24px",display:"flex",gap:16,alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>{book.series}{book.num>0?` · Book ${book.num}`:""}</div>
          <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:"clamp(18px,5vw,26px)",color:C.text,lineHeight:1.2,marginBottom:6}}>{book.title}</h1>
          <div style={{color:C.muted,fontSize:14,fontStyle:"italic"}}>by {book.author}</div>
        </div>
        <CoverImage book={book} width={80} height={120} radius={5} accentColor={fc} style={{flexShrink:0,boxShadow:`0 4px 16px rgba(0,0,0,0.5)`}}/>
      </div>
      <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[{l:"Type",v:book.type},{l:"Era",v:book.era},{l:"Faction",v:book.faction}].map(m=>(
            <div key={m.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>{m.l}</div>
              <div style={{color:C.text,fontSize:12,lineHeight:1.2}}>{m.v}</div>
            </div>
          ))}
        </div>
        <div style={{background:C.card,border:`2px solid ${ebookMeta?C.gold:C.border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{background:ebookMeta?`${C.gold}18`:C.surface,padding:"14px 16px",borderBottom:`1px solid ${ebookMeta?C.gold+"44":C.border}`,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>{ebookMeta?"📖":"📂"}</span>
            <div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:ebookMeta?C.gold:C.muted,fontWeight:700,letterSpacing:1}}>{ebookMeta?"Ebook Ready":"No Ebook Loaded"}</div>
              {ebookMeta&&<div style={{fontSize:11,color:C.goldDim,marginTop:1}}>{ebookMeta.file_name}</div>}
            </div>
          </div>
          <div style={{padding:"16px"}}>
            {!user?(
              <div style={{textAlign:"center",padding:"24px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
                <div style={{fontSize:36}}>🔐</div>
                <div style={{color:C.muted,fontSize:13,lineHeight:1.6,maxWidth:260}}>Sign in to upload and access your ebooks across any device.</div>
                <button onClick={signInWithGoogle} style={{background:`${C.gold}22`,border:`1px solid ${C.gold}`,borderRadius:8,padding:"10px 24px",color:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>Sign in with Google</button>
              </div>
            ):ebookMeta?(
              <>
                {/* Progress bar */}
                {progress>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase"}}>Progress</span>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.gold}}>{Math.round(progress*100)}%</span>
                    </div>
                    <div style={{height:4,background:C.dim,borderRadius:2}}><div style={{height:"100%",width:`${progress*100}%`,background:`linear-gradient(to right,${C.gold},${C.red})`,borderRadius:2}}/></div>
                  </div>
                )}
                {/* Last read position (auto-save) */}
                {bookmarkInfo&&(
                  <div style={{marginBottom:12,background:`${C.surface}`,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:16,flexShrink:0}}>📍</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:2}}>Last read position</div>
                      <div style={{fontSize:12,color:C.text}}>{Math.round((bookmarkInfo.progress_pct||0)*100)}%{bookmarkInfo.chapter_index>0?` · Ch. ${bookmarkInfo.chapter_index+1}`:""}</div>
                      {bookmarkInfo.bookmarkedAt&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{new Date(bookmarkInfo.bookmarkedAt).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'})}</div>}
                    </div>
                  </div>
                )}
                {/* Manual bookmarks */}
                {bookmarksList.length>0&&(
                  <div style={{marginBottom:12,background:C.surface,border:`1px solid ${C.gold}33`,borderRadius:8,overflow:"hidden"}}>
                    <div style={{padding:"8px 12px 6px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6}}>
                      <span>🔖</span>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.gold,letterSpacing:2,textTransform:"uppercase"}}>Bookmarks ({bookmarksList.length})</span>
                    </div>
                    {bookmarksList.slice(0,5).map((bm,i)=>(
                      <div key={bm.id} style={{padding:"8px 12px",borderBottom:i<Math.min(bookmarksList.length,5)-1?`1px solid ${C.border}55`:"none",display:"flex",alignItems:"center",gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,color:C.text,fontFamily:"'Cinzel',serif"}}>{bm.label}</div>
                          <div style={{fontSize:10,color:C.muted}}>{bm.pct!=null?bm.pct:Math.round((bm.progress_pct||0)*100)}% · {new Date(bm.createdAt).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</div>
                        </div>
                      </div>
                    ))}
                    {bookmarksList.length>5&&<div style={{padding:"6px 12px",fontSize:10,color:C.muted,fontStyle:"italic"}}>+{bookmarksList.length-5} more bookmarks in reader</div>}
                  </div>
                )}
                {uploadMsg&&<div style={{color:uploadMsg.startsWith("❌")?C.red:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,textAlign:"center",marginBottom:8}}>{uploadMsg}</div>}
                <button onClick={handleOpenReader} style={{width:"100%",padding:"16px",borderRadius:10,background:`linear-gradient(135deg,${C.gold},#8a6f28)`,border:"none",color:C.bg,fontFamily:"'Cinzel',serif",fontSize:15,letterSpacing:3,textTransform:"uppercase",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                  {bookmarkInfo||progress>0?"📖 Continue Reading":"📖 Start Reading"}
                </button>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button onClick={()=>inp.current.click()} style={{flex:1,padding:"10px",borderRadius:8,background:"transparent",border:`1px solid ${C.dim}`,color:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer"}}>Replace file</button>
                  <button onClick={handleDeleteEbook} style={{flex:1,padding:"10px",borderRadius:8,background:deleteConfirm?`${C.red}22`:"transparent",border:`1px solid ${deleteConfirm?C.red:C.dim}`,color:deleteConfirm?C.red:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer",transition:"all 0.2s"}}>
                    {deleteConfirm?"⚠️ Confirm delete":"🗑 Remove ebook"}
                  </button>
                </div>
              </>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{color:C.muted,fontSize:13,lineHeight:1.6}}>Load your personal EPUB or PDF — saved to your private cloud, accessible from any device.</div>
                <div style={{background:"#ffffff06",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Reader features</div>
                  <div style={{color:C.dim,fontSize:12,lineHeight:1.8}}>📖 Pages or scroll mode<br/>🎨 Dark / Sepia / Paper theme<br/>🔤 Font &amp; typography<br/>📄 Single or two-page spread<br/>🔵 WH40K terms → Fandom Wiki<br/>📝 Select words → dictionary</div>
                </div>
                {(uploading||uploadMsg)&&<div style={{color:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,textAlign:"center"}}>{uploadMsg||"Uploading…"}</div>}
                <button onClick={()=>inp.current.click()} disabled={uploading} style={{width:"100%",padding:"16px",borderRadius:10,background:"transparent",border:`2px dashed ${C.goldDim}`,color:C.gold,fontFamily:"'Cinzel',serif",fontSize:14,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:uploading?0.5:1}}>
                  📂 Load EPUB or PDF
                </button>
              </div>
            )}
            <input ref={inp} type="file" accept=".epub,.pdf" style={{display:"none"}} onChange={handleFileSelect}/>
          </div>
        </div>
        {/* Reading Status Selector */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>Reading Status</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {['want','reading','read'].map(s=>{
              const cfg=STATUS_CFG[s];const active=curStatus===s;
              return(
                <button key={s} onClick={()=>changeStatus(s)} style={{padding:"12px 4px",borderRadius:8,border:`1px solid ${active?cfg.color:C.dim}`,background:active?cfg.bg:"transparent",color:active?cfg.color:C.muted,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all 0.2s"}}>
                  <span style={{fontSize:20}}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              );
            })}
          </div>
          {curStatus==='read'&&(
            <div style={{marginTop:12,display:"flex",justifyContent:"center",gap:4}}>
              {[1,2,3,4,5].map(i=>(
                <span key={i} onClick={()=>{setRating(i);setBookRatingLS(user?.id,book.id,i);}}
                  style={{fontSize:26,cursor:"pointer",color:i<=rating?C.gold:C.dim,transition:"color 0.15s",lineHeight:1}}>
                  ★
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Notes */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginTop:0}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>Personal Notes</div>
          <textarea
            value={notes}
            onChange={e=>setNotes(e.target.value)}
            onBlur={()=>{setBookNotesLS(user?.id,book.id,notes);setNotesSaved(true);setTimeout(()=>setNotesSaved(false),1500);}}
            placeholder="Your thoughts on this book…"
            style={{width:"100%",minHeight:80,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:12,fontFamily:"'Cinzel',serif",resize:"vertical",boxSizing:"border-box",outline:"none",lineHeight:1.5}}
          />
          {notesSaved&&<div style={{fontSize:10,color:C.green,marginTop:4,fontFamily:"'Cinzel',serif",letterSpacing:1}}>✓ Saved</div>}
        </div>
      </div>
    </div>
  );
}

// ─── LIBRARY ──────────────────────────────────────────────────────────────────
function LibrarySection({ user, statuses={}, onStatusChange }) {
  const [tab,setTab]=useState("catalogue");
  const [viewMode,setViewMode]=useState("card"); // card | list | shelf
  const [search,setSearch]=useState("");
  const [series,setSeries]=useState("All");
  const [faction,setFaction]=useState("All");
  const [type,setType]=useState("All");
  const [era,setEra]=useState("All");
  const [showFilters,setShowFilters]=useState(false);
  const [detail,setDetail]=useState(null);
  const [reader,setReader]=useState(null);
  const [shelfBooks,setShelfBooks]=useState([]);
  const [shelfLoading,setShelfLoading]=useState(false);
  const [readingProgress,setReadingProgress]=useState({});
  useEffect(()=>{
    if(!user?.id) return;
    supabase.from("reading_progress").select("book_id,progress_pct").eq("user_id",user.id)
      .then(({ data })=>{
        if(!data?.length) return;
        const map={};
        data.forEach(r=>{ if(r.book_id&&r.progress_pct!=null) map[r.book_id]=r.progress_pct; });
        setReadingProgress(map);
      });
  },[user?.id]);
  // Pre-load shelf from localStorage cache on mount
  useEffect(()=>{
    if(!user?.id) return;
    const lsBooks=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&key.startsWith(`wh40k_ebook_${user.id}_`)){
        try{
          const meta=JSON.parse(localStorage.getItem(key));
          if(meta?.book_id){
            const book=BOOKS.find(b=>b.id===meta.book_id);
            if(book) lsBooks.push({...book,_file:meta});
          }
        }catch{}
      }
    }
    if(lsBooks.length>0) setShelfBooks(lsBooks);
  },[user?.id]);

  // Load shelf books from DB on mount AND whenever tab switches to shelf
  useEffect(()=>{
    if(!user?.id){ setShelfBooks([]); setShelfLoading(false); return; }
    if(tab==="shelf") setShelfLoading(true);
    supabase.from("ebook_files").select("book_id,file_name,file_path,file_type").eq("user_id",user.id)
      .then(({ data:files })=>{
        if(files?.length){
          const ids=new Set(files.map(f=>f.book_id));
          setShelfBooks(BOOKS.filter(b=>ids.has(b.id)).map(b=>({...b,_file:files.find(f=>f.book_id===b.id)})));
        } else {
          // Fallback to localStorage cache
          const lsBooks=[];
          for(let i=0;i<localStorage.length;i++){
            const key=localStorage.key(i);
            if(key?.startsWith(`wh40k_ebook_${user.id}_`)){
              try{
                const meta=JSON.parse(localStorage.getItem(key));
                if(meta?.book_id){ const book=BOOKS.find(b=>b.id===meta.book_id); if(book) lsBooks.push({...book,_file:meta}); }
              }catch{}
            }
          }
          setShelfBooks(lsBooks);
        }
        setShelfLoading(false);
      });
  },[tab, user?.id]);

  const handleOpenReader=({book,url,fileType,progress,chapterIndex,pageIndex})=>setReader({book,url,fileType,progress,chapterIndex,pageIndex:pageIndex||0});

  const filtered=useMemo(()=>BOOKS.filter(b=>{
    if(series!=="All"&&b.series!==series) return false;
    if(faction!=="All"&&b.faction!==faction) return false;
    if(type!=="All"&&b.type!==type) return false;
    if(era!=="All"&&b.era!==era) return false;
    if(search){const q=search.toLowerCase();return b.title.toLowerCase().includes(q)||b.author.toLowerCase().includes(q)||b.series.toLowerCase().includes(q);}
    return true;
  }),[series,faction,type,era,search]);

  const sfilt=useMemo(()=>{
    if(!search) return shelfBooks;
    const q=search.toLowerCase();
    return shelfBooks.filter(b=>b.title.toLowerCase().includes(q)||b.series.toLowerCase().includes(q)||b.author.toLowerCase().includes(q));
  },[shelfBooks,search]);

  if(reader){
    const {book,url,fileType,progress,chapterIndex}=reader;
    return(
      <Suspense fallback={<div style={{position:"fixed",inset:0,background:"#0f0e09",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:48,animation:"spin 2s linear infinite"}}>⚙</div></div>}>
        {fileType==="pdf"
          ?<PdfReader url={url} title={book.title} bookId={book.id} userId={user?.id} onClose={()=>setReader(null)}/>
          :<EpubReader url={url} title={book.title} bookId={book.id} userId={user?.id} initProgress={progress} initChapterIndex={chapterIndex||0} initPageIndex={reader.pageIndex||0} onProgress={()=>{}} onClose={()=>setReader(null)}/>
        }
      </Suspense>
    );
  }
  if(detail) return <BookDetail book={detail} user={user} onBack={()=>setDetail(null)} onOpenReader={handleOpenReader} status={statuses[detail.id]} onStatusChange={onStatusChange}/>;

  const isFiltered=series!=="All"||faction!=="All"||type!=="All"||era!=="All";
  const Chip=({label,active,onClick})=>(<button onClick={onClick} style={{background:active?`${C.gold}22`:"transparent",border:`1px solid ${active?C.gold:C.dim}`,borderRadius:20,padding:"6px 14px",color:active?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer",whiteSpace:"nowrap"}}>{label}</button>);

  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"20px 16px 0",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:6}}>Black Library</div>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.text,marginBottom:12}}>The Library</h2>
        <div style={{display:"flex",gap:20,marginBottom:14,flexWrap:"wrap"}}>
          {[
            {l:"Tomes",v:BOOKS.length,color:C.text},
            {l:"Read",v:Object.values(statuses).filter(s=>s.status==='read').length,color:"#4aaa6a"},
            {l:"Reading",v:Object.values(statuses).filter(s=>s.status==='reading').length,color:"#4a8adc"},
            {l:"Ebook",v:shelfBooks.length,color:C.gold},
          ].map(s=>(<div key={s.l}><div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase"}}>{s.l}</div><div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:s.color}}>{s.v}</div></div>))}
        </div>
        <div style={{display:"flex",gap:0}}>
          {[{id:"catalogue",label:"Catalogue"},{id:"shelf",label:`My Shelf${shelfBooks.length>0?` (${shelfBooks.length})`:""}`}].map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===t.id?C.gold:"transparent"}`,color:tab===t.id?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>{t.label}</button>))}
        </div>
      </div>

      {tab==="shelf"&&(
        <>
          {shelfLoading?(
            <div style={{textAlign:"center",padding:40,color:C.muted,fontStyle:"italic"}}>Loading…</div>
          ):shelfBooks.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
              <div style={{fontSize:52}}>📂</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:16,color:C.muted}}>No ebooks loaded</div>
              <div style={{color:C.muted,fontSize:13,maxWidth:280,lineHeight:1.6,textAlign:"center"}}>Go to Catalogue, select a book and upload your EPUB or PDF file to add it here.</div>
              <button onClick={()=>setTab("catalogue")} style={{background:`${C.gold}22`,border:`1px solid ${C.gold}`,borderRadius:8,padding:"10px 24px",color:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>Go to Catalogue →</button>
            </div>
          ):(
            <>
              {/* search shelf */}
              <div style={{padding:"12px 16px 0"}}>
                <div style={{position:"relative"}}>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your ebooks..."
                    style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,padding:"12px 40px 12px 44px",fontSize:15,outline:"none"}}/>
                  <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:18,pointerEvents:"none"}}>🔍</span>
                  {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>}
                </div>
              </div>
              {/* view toggle + count */}
              <div style={{padding:"8px 16px",display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.muted,flex:1}}>
                  {sfilt.length} ebook
                </span>
                <div style={{display:"flex",gap:2,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:2}}>
                  {[{m:"card",icon:"▦"},{m:"list",icon:"☰"},{m:"shelf",icon:"📚"}].map(v=>(
                    <button key={v.m} onClick={()=>setViewMode(v.m)}
                      style={{background:viewMode===v.m?`${C.gold}33`:"transparent",border:"none",borderRadius:6,width:28,height:26,cursor:"pointer",color:viewMode===v.m?C.gold:C.muted,fontSize:viewMode===v.m?13:12,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {v.icon}
                    </button>
                  ))}
                </div>
              </div>
              {/* books — reuses same view modes as catalogue */}
              {(()=>{
                if(sfilt.length===0) return <div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontStyle:"italic"}}>No results.</div>;

                if(viewMode==="card") return(
                  <div style={{padding:"10px 16px",display:"flex",flexDirection:"column",gap:8}}>
                    {sfilt.map(book=>{
                      const fc2=FC[book.faction]||C.dim;
                      const bst=statuses[book.id]?.status||'none';
                      const bstCfg=STATUS_CFG[bst];
                      return(
                        <div key={book.id} onClick={()=>setDetail(book)}
                          style={{background:`linear-gradient(135deg,${fc2}22,${C.card})`,border:`1px solid ${C.gold}55`,borderLeft:`3px solid ${C.gold}`,borderRadius:8,padding:"10px",cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start"}}>
                          <CoverImage book={book} width={54} height={80} radius={3} accentColor={fc2}/>
                          <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:3}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                              <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:1,textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series}{book.num>0?` #${book.num}`:""}</div>
                              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                                {bst!=='none'&&<span style={{fontSize:13}}>{bstCfg.icon}</span>}
                                <span style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:4,padding:"2px 7px",fontFamily:"'Cinzel',serif",fontSize:9,color:C.gold,letterSpacing:1}}>EPUB</span>
                              </div>
                            </div>
                            <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.3,fontFamily:"'Cinzel',serif"}}>{book.title}</div>
                            <div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{book.author}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );

                if(viewMode==="list") return(
                  <div style={{padding:"6px 16px 16px"}}>
                    {sfilt.map(book=>{
                      const fc2=FC[book.faction]||C.dim;
                      const bst=statuses[book.id]?.status||'none';
                      const bstCfg=STATUS_CFG[bst];
                      return(
                        <div key={book.id} onClick={()=>setDetail(book)}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}44`,cursor:"pointer"}}>
                          <CoverImage book={book} width={36} height={52} radius={2} accentColor={fc2}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.title}</div>
                            <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series}{book.num>0?` #${book.num}`:""} · {book.author}</div>
                          </div>
                          {bst!=='none'&&<span style={{fontSize:14,flexShrink:0}}>{bstCfg.icon}</span>}
                          <span style={{color:C.dim,fontSize:14,flexShrink:0}}>›</span>
                        </div>
                      );
                    })}
                  </div>
                );

                // shelf view
                const seriesMap={};
                sfilt.forEach(b=>{if(!seriesMap[b.series])seriesMap[b.series]=[];seriesMap[b.series].push(b);});
                return(
                  <div style={{padding:"8px 0 16px"}}>
                    {Object.entries(seriesMap).map(([sName,books])=>(
                      <div key={sName} style={{marginBottom:6}}>
                        <div style={{padding:"6px 16px 4px",fontFamily:"'Cinzel',serif",fontSize:10,color:C.gold,letterSpacing:2}}>{sName}</div>
                        <div style={{overflowX:"auto",paddingBottom:2}}>
                          <div style={{display:"flex",gap:2,padding:"0 16px",minWidth:"max-content",alignItems:"flex-end"}}>
                            {[...books].sort((a,b)=>a.num-b.num).map(book=>{
                              const sc=FC[book.faction]||C.dim;
                              const bst=statuses[book.id]?.status||'none';
                              const bstCfg=STATUS_CFG[bst];
                              return(
                                <div key={book.id} onClick={()=>setDetail(book)} title={book.title}
                                  style={{flexShrink:0,width:24,height:110,background:`linear-gradient(to right,${sc}ee,${sc}88,${sc}bb)`,borderRadius:"3px 3px 0 0",cursor:"pointer",position:"relative",boxShadow:`inset -2px 0 3px rgba(0,0,0,0.4),2px 0 2px rgba(0,0,0,0.3)`,border:`1px solid ${C.gold}66`,borderBottom:"none",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",transition:"transform 0.12s"}}
                                  onMouseEnter={e=>e.currentTarget.style.transform="translateY(-5px)"}
                                  onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                                  <div style={{writingMode:"vertical-rl",transform:"rotate(180deg)",fontFamily:"'Cinzel',serif",fontSize:6,color:"rgba(255,255,255,0.85)",letterSpacing:0.8,overflow:"hidden",maxHeight:"90%",padding:"3px 2px",textShadow:"0 1px 2px rgba(0,0,0,0.9)",lineHeight:1.1,textAlign:"center"}}>
                                    {book.num>0?`#${book.num} `+book.title.split(' ').slice(0,3).join(' '):book.title.split(' ').slice(0,3).join(' ')}
                                  </div>
                                  {bst!=='none'&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:bstCfg.color}}/>}
                                  <div style={{position:"absolute",inset:0,border:`1px solid ${C.gold}44`,borderRadius:"3px 3px 0 0",pointerEvents:"none"}}/>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{height:8,background:"linear-gradient(to bottom,#5a3a1a,#3a2010)",margin:"0 16px",borderRadius:"0 0 3px 3px",boxShadow:"0 2px 5px rgba(0,0,0,0.5)"}}/>
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

      {tab==="catalogue"&&(
        <>
          <div style={{padding:"12px 16px 0"}}>
            <div style={{position:"relative"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search titles, authors, series…" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,padding:"12px 40px 12px 44px",fontSize:15,outline:"none"}}/>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:18,pointerEvents:"none"}}>🔍</span>
              {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>}
            </div>
          </div>
          {/* ── filter + view toggle bar ── */}
          <div style={{padding:"8px 16px",display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setShowFilters(f=>!f)} style={{background:showFilters||isFiltered?`${C.gold}22`:"transparent",border:`1px solid ${showFilters||isFiltered?C.gold:C.dim}`,borderRadius:20,padding:"7px 14px",color:showFilters||isFiltered?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer"}}>⚙ Filters{isFiltered?" •":""}</button>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.muted,flex:1}}>{filtered.length} titles</span>
            {isFiltered&&<button onClick={()=>{setSeries("All");setFaction("All");setType("All");setEra("All");}} style={{background:"transparent",border:`1px solid ${C.red}55`,borderRadius:20,padding:"5px 12px",color:C.red,fontFamily:"'Cinzel',serif",fontSize:10,cursor:"pointer"}}>Reset</button>}
            {/* view mode toggle */}
            <div style={{display:"flex",gap:2,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:2}}>
              {[{m:"card",icon:"▦",title:"Card"},{m:"list",icon:"☰",title:"List"},{m:"shelf",icon:"📚",title:"Shelf"}].map(v=>(
                <button key={v.m} onClick={()=>setViewMode(v.m)} title={v.title}
                  style={{background:viewMode===v.m?`${C.gold}33`:"transparent",border:"none",borderRadius:6,width:28,height:26,cursor:"pointer",color:viewMode===v.m?C.gold:C.muted,fontSize:viewMode===v.m?13:12,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {v.icon}
                </button>
              ))}
            </div>
          </div>
          {showFilters&&(<div style={{padding:"0 16px 12px",borderBottom:`1px solid ${C.border}`}}>
            {[{label:"Series",value:series,set:setSeries,opts:ALL_SERIES.slice(0,22)},{label:"Faction",value:faction,set:setFaction,opts:ALL_FACTIONS},{label:"Type",value:type,set:setType,opts:ALL_TYPES},{label:"Era",value:era,set:setEra,opts:ALL_ERAS}].map(f=>(<div key={f.label} style={{marginBottom:10}}><div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>{f.label}</div><div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>{f.opts.map(o=><Chip key={o} label={o} active={f.value===o} onClick={()=>f.set(o)}/>)}</div></div>))}
          </div>)}

          {/* ── VIEW: CARD ── */}
          {viewMode==="card"&&(
            <div style={{padding:"10px 16px",display:"flex",flexDirection:"column",gap:8}}>
              {filtered.length===0?(<div style={{textAlign:"center",padding:"60px 20px",color:C.muted,fontStyle:"italic"}}>No tomes found, Inquisitor.</div>)
              :filtered.map(book=>{
                const fc2=FC[book.faction]||C.dim; const tc=book.type==="Codex"?C.red:C.gold;
                const bst=statuses[book.id]?.status||'none';
                const bstCfg=STATUS_CFG[bst];
                const borderColor=bst!=='none'?bstCfg.color:fc2;
                const pct=readingProgress[book.id]||0;
                const pctPct=Math.round(pct*100);
                return(<div key={book.id} onClick={()=>setDetail(book)} style={{background:`linear-gradient(135deg,${fc2}18,${C.card})`,border:`1px solid ${bst!=='none'?bstCfg.color+"44":fc2+"44"}`,borderLeft:`3px solid ${borderColor}`,borderRadius:8,padding:"10px",cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start",position:"relative",overflow:"hidden"}}>
                  {pctPct>0&&pctPct<100&&<div style={{position:"absolute",bottom:0,left:0,width:`${pctPct}%`,height:2,background:"#4a8adc88",pointerEvents:"none"}}/>}
                  {pctPct>=100&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"#4aaa6a88",pointerEvents:"none"}}/>}
                  <CoverImage book={book} width={54} height={80} radius={3} accentColor={fc2}/>
                  <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:3}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:4}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:1,textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series}{book.num>0?` #${book.num}`:""}</div>
                      <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                        {pctPct>0&&pctPct<100&&<span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:"#4a8adc"}}>{pctPct}%</span>}
                        {bst!=='none'&&<span style={{fontSize:12}}>{bstCfg.icon}</span>}
                        <span style={{background:`${tc}22`,border:`1px solid ${tc}44`,borderRadius:4,padding:"2px 6px",fontFamily:"'Cinzel',serif",fontSize:8,color:tc,letterSpacing:1}}>{book.type}</span>
                      </div>
                    </div>
                    <div style={{fontSize:14,fontWeight:700,color:bst==='read'?C.muted:C.text,lineHeight:1.3,fontFamily:"'Cinzel',serif",opacity:bst==='read'?0.75:1}}>{book.title}</div>
                    <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{book.author}</div>
                    <div style={{fontSize:10,color:FC[book.faction]||C.dim,marginTop:2,fontFamily:"'Cinzel',serif",letterSpacing:1}}>{book.faction}</div>
                    {(()=>{const r=getBookRating(user?.id,book.id);return r>0?(<div style={{fontSize:11,color:C.gold,letterSpacing:2,marginTop:2}}>{'★'.repeat(r)+'☆'.repeat(5-r)}</div>):null;})()}
                  </div>
                </div>);
              })}
            </div>
          )}

          {/* ── VIEW: LIST ── */}
          {viewMode==="list"&&(
            <div style={{padding:"6px 16px 16px"}}>
              {filtered.length===0?(<div style={{textAlign:"center",padding:"60px 20px",color:C.muted,fontStyle:"italic"}}>No tomes found, Inquisitor.</div>)
              :filtered.map((book,i)=>{
                const fc2=FC[book.faction]||C.dim;
                const bst=statuses[book.id]?.status||'none';
                const bstCfg=STATUS_CFG[bst];
                const pct=readingProgress[book.id]||0;
                const pctPct=Math.round(pct*100);
                return(
                  <div key={book.id} onClick={()=>setDetail(book)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}44`,cursor:"pointer",position:"relative"}}>
                    <CoverImage book={book} width={36} height={52} radius={2} accentColor={fc2}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:bst==='read'?C.muted:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:bst==='read'?0.7:1}}>{book.title}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series}{book.num>0?` #${book.num}`:""} · {book.author}</div>
                    </div>
                    {pctPct>0&&pctPct<100&&<span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:"#4a8adc",flexShrink:0}}>{pctPct}%</span>}
                    {bst!=='none'&&<span style={{fontSize:14,flexShrink:0}}>{bstCfg.icon}</span>}
                    <span style={{color:C.dim,fontSize:14,flexShrink:0}}>›</span>
                    {pctPct>0&&pctPct<100&&<div style={{position:"absolute",bottom:0,left:0,width:`${pctPct}%`,height:1,background:"#4a8adc88",pointerEvents:"none"}}/>}
                    {pctPct>=100&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:"#4aaa6a88",pointerEvents:"none"}}/>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── VIEW: SHELF (by series) ── */}
          {viewMode==="shelf"&&(()=>{
            if(filtered.length===0) return <div style={{textAlign:"center",padding:"60px 20px",color:C.muted,fontStyle:"italic"}}>No tomes found, Inquisitor.</div>;
            // group by series
            const seriesMap={};
            filtered.forEach(b=>{if(!seriesMap[b.series])seriesMap[b.series]=[];seriesMap[b.series].push(b);});
            const seriesEntries=Object.entries(seriesMap).sort((a,b)=>b[1].length-a[1].length);
            return(
              <div style={{padding:"8px 0 16px"}}>
                {seriesEntries.map(([sName,books])=>{
                  const readC=books.filter(b=>statuses[b.id]?.status==='read').length;
                  const readingC=books.filter(b=>statuses[b.id]?.status==='reading').length;
                  return(
                    <div key={sName} style={{marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"baseline",gap:8,padding:"6px 16px 4px"}}>
                        <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.gold,letterSpacing:2,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sName}</div>
                        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,letterSpacing:1,flexShrink:0}}>
                          {readC>0&&<span style={{color:C.green}}>✅{readC} </span>}
                          {readingC>0&&<span style={{color:C.blue}}>📖{readingC} </span>}
                          <span>{books.length} books</span>
                        </div>
                      </div>
                      {/* spines row */}
                      <div style={{overflowX:"auto",paddingBottom:2}}>
                        <div style={{display:"flex",gap:2,padding:"0 16px",minWidth:"max-content",alignItems:"flex-end"}}>
                          {[...books].sort((a,b)=>a.num-b.num).map(book=>{
                            const sc=FC[book.faction]||C.dim;
                            const bst=statuses[book.id]?.status||'none';
                            const bstCfg=STATUS_CFG[bst];
                            const pct=readingProgress[book.id]||0;
                            const pctPct=Math.round(pct*100);
                            return(
                              <div key={book.id} onClick={()=>setDetail(book)}
                                title={`${book.title}${book.num>0?' #'+book.num:''}${pctPct>0?' — '+pctPct+'%':''}`}
                                style={{flexShrink:0,width:24,height:110,
                                  background:`linear-gradient(to right,${sc}ee,${sc}88,${sc}bb)`,
                                  borderRadius:"3px 3px 0 0",cursor:"pointer",position:"relative",
                                  boxShadow:`inset -2px 0 3px rgba(0,0,0,0.4),2px 0 2px rgba(0,0,0,0.3)`,
                                  border:`1px solid ${bst!=='none'?bstCfg.color+'aa':sc+'88'}`,
                                  borderBottom:"none",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",
                                  transition:"transform 0.12s",
                                }}
                                onMouseEnter={e=>e.currentTarget.style.transform="translateY(-5px)"}
                                onMouseLeave={e=>e.currentTarget.style.transform="none"}
                              >
                                <div style={{writingMode:"vertical-rl",transform:"rotate(180deg)",fontFamily:"'Cinzel',serif",fontSize:6,color:"rgba(255,255,255,0.85)",letterSpacing:0.8,overflow:"hidden",maxHeight:"90%",padding:"3px 2px",textShadow:"0 1px 2px rgba(0,0,0,0.9)",lineHeight:1.1,textAlign:"center"}}>
                                  {book.num>0?`#${book.num} `+book.title.split(' ').slice(0,3).join(' '):book.title.split(' ').slice(0,3).join(' ')}
                                </div>
                                {bst!=='none'&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:bstCfg.color}}/>}
                                {pctPct>0&&pctPct<100&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:`${pctPct}%`,background:"rgba(74,138,220,0.25)",pointerEvents:"none"}}/>}
                                {pctPct>=100&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:"100%",background:"rgba(74,170,106,0.2)",pointerEvents:"none"}}/>}
                              </div>
                            );
                          })}
                        </div>
                        {/* plank */}
                        <div style={{height:8,background:"linear-gradient(to bottom,#5a3a1a,#3a2010)",margin:"0 16px",borderRadius:"0 0 3px 3px",boxShadow:"0 2px 5px rgba(0,0,0,0.5)"}}/>
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

function HHBookRow({entry,statuses,isLast}){
  const book=findHHBook(entry);
  const status=book?statuses[book.id]?.status||'none':null;
  const stCfg=status&&status!=='none'?STATUS_CFG[status]:null;
  const type=entry.type||'novel';
  const isSecondary=type==='short'||type==='audio';
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:isLast?"none":`1px solid ${C.border}22`,opacity:isSecondary?0.72:1}}>
      <span style={{fontSize:11,flexShrink:0,width:18,textAlign:"center"}}>
        {type==='audio'?'🎧':type==='short'?'📄':type==='novella'?'📑':'📖'}
      </span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:entry.opt?C.muted:C.text,fontStyle:entry.opt?'italic':'normal',overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:type==='novel'||type==='novella'?"'Cinzel',serif":undefined}}>
          {entry.t}
          {entry.n>0&&<span style={{fontSize:9,color:C.goldDim,marginLeft:4}}>#{entry.n}</span>}
          {entry.opt&&<span style={{fontSize:9,color:C.muted,marginLeft:4}}>(optional)</span>}
        </div>
        <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {entry.a}{entry.src&&<span style={{color:C.dim}}> · {entry.src}</span>}
        </div>
      </div>
      {stCfg&&<span style={{fontSize:13,flexShrink:0}}>{stCfg.icon}</span>}
    </div>
  );
}

function HHGuideSection({statuses}){
  const [mode,setMode]=useState('minimalist');
  const [open,setOpen]=useState(new Set(['m1']));
  const toggle=id=>setOpen(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});

  const parts=mode==='minimalist'?HH_MIN:HH_FULL;

  const PartCard=({part,dimmed})=>{
    const isOpen=open.has(part.id);
    const mainBooks=(part.books||[]).filter(b=>!b.b40k);
    const novelCount=mainBooks.filter(b=>!b.type||b.type==='novel'||b.type==='novella').length;
    const extraCount=mainBooks.length-novelCount;
    // Progress counts novels/novellas only (shorts live in anthologies — not individually trackable)
    const novelEntries=mainBooks.filter(b=>!b.type||b.type==='novel'||b.type==='novella');
    const novelMatched=novelEntries.map(e=>findHHBook(e)).filter(Boolean);
    const readCount=novelMatched.filter(b=>statuses[b.id]?.status==='read').length;
    const allRead=novelMatched.length>0&&readCount===novelMatched.length;
    const accentColor=dimmed?C.dim:allRead?C.green:C.dim;
    return(
      <div style={{background:C.card,border:`1px solid ${dimmed?C.dim+"33":C.border}`,borderLeft:`3px solid ${accentColor}`,borderRadius:10,overflow:"hidden",opacity:dimmed?0.85:1}}>
        <div onClick={()=>toggle(part.id)} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:3}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:dimmed?C.muted:C.goldDim,letterSpacing:2,flexShrink:0}}>{part.label}</span>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:13,color:dimmed?C.muted:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{part.title}</span>
            </div>
            <div style={{fontSize:10,color:C.muted}}>
              {part.pickOne?<span>Pick one path · 4 options</span>:<>
                {novelCount>0&&`${novelCount} novel${novelCount!==1?'s':''}`}
                {extraCount>0&&` + ${extraCount} shorts/audio`}
                {novelMatched.length>0&&readCount>0&&<span style={{color:allRead?C.green:C.blue,marginLeft:6}}>{allRead?'✅':''}{readCount}/{novelMatched.length} read</span>}
              </>}
            </div>
          </div>
          <span style={{color:C.goldDim,fontSize:16,flexShrink:0,transition:"transform 0.2s",transform:isOpen?"rotate(90deg)":"none"}}>›</span>
        </div>
        {isOpen&&(
          <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 14px 12px"}}>
            {part.note&&<div style={{fontSize:11,color:C.gold,fontStyle:"italic",marginBottom:10,padding:"6px 10px",background:`${C.gold}0a`,borderRadius:6,borderLeft:`2px solid ${C.gold}44`}}>{part.note}</div>}
            {part.pickOne?(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {part.options.map((opt,oi)=>(
                  <div key={oi} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${opt.color||C.gold}`,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:opt.color||C.gold,letterSpacing:2,marginBottom:opt.note?4:6}}>{opt.label.toUpperCase()}</div>
                    {opt.note&&<div style={{fontSize:10,color:C.muted,fontStyle:"italic",marginBottom:6}}>💡 {opt.note}</div>}
                    {opt.books.map((e,i)=><HHBookRow key={i} entry={e} statuses={statuses} isLast={i===opt.books.length-1}/>)}
                  </div>
                ))}
              </div>
            ):(
              <>
                {mainBooks.map((entry,i)=><HHBookRow key={i} entry={entry} statuses={statuses} isLast={i===mainBooks.length-1}/>)}
                {(()=>{const b40k=(part.books||[]).filter(b=>b.b40k);if(!b40k.length)return null;return(
                  <div style={{marginTop:10,background:`${C.gold}08`,border:`1px solid ${C.gold}22`,borderRadius:6,padding:"6px 10px"}}>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:2,marginBottom:6}}>🌌 BONUS 40K READS</div>
                    {b40k.map((e,i)=><HHBookRow key={i} entry={e} statuses={statuses} isLast={i===b40k.length-1}/>)}
                  </div>
                );})()}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return(
    <div>
      {/* header + toggle */}
      <div style={{padding:"12px 16px 10px",borderBottom:`1px solid ${C.border}`,background:`linear-gradient(180deg,${C.surface},${C.bg})`}}>
        <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:18,color:C.text,marginBottom:4}}>Heresy Reading Guide</div>
        <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Curated by Reddit user <span style={{color:C.gold}}>cd8d</span> — organises 60+ books into readable story arcs</div>
        <div style={{display:"flex",gap:4,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:2,alignSelf:"flex-start",width:"fit-content"}}>
          {[{id:'minimalist',label:'⚡ Essential (~25 books)'},{id:'full',label:'📚 Full Guide'}].map(m=>(
            <button key={m.id} onClick={()=>{setMode(m.id);setOpen(new Set([m.id==='minimalist'?'m1':'p0']));}}
              style={{background:mode===m.id?`${C.gold}33`:"transparent",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",color:mode===m.id?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:1,whiteSpace:"nowrap"}}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {/* parts */}
      <div style={{padding:"10px 16px 16px",display:"flex",flexDirection:"column",gap:6}}>
        {parts.map(part=><PartCard key={part.id} part={part}/>)}
        {mode==='full'&&(
          <>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,letterSpacing:3,textTransform:"uppercase",marginTop:10,marginBottom:4,padding:"0 2px"}}>Optional Arcs</div>
            {HH_OPTIONAL.map(part=><PartCard key={part.id} part={part} dimmed/>)}
          </>
        )}
        <div style={{marginTop:8,padding:"10px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,fontSize:10,color:C.muted,lineHeight:1.6,textAlign:"center"}}>
          Guide by <span style={{color:C.gold}}>u/cd8d</span> · Full article on{' '}
          <a href="https://www.polygon.com/warhammer-40k/522708/warhammer-40k-horus-heresy-reading-guide-cd8d-redditor/" target="_blank" rel="noopener noreferrer" style={{color:C.blue,textDecoration:"underline",textDecorationColor:`${C.blue}66`}}>Polygon (Feb 2025)</a>
        </div>
      </div>
    </div>
  );
}

// ─── NEXT BOOK SUGGESTION ─────────────────────────────────────────────────────
// Returns { book, reason, seriesProgress } or null
// Walk an HH guide (HH_FULL or HH_MIN) and return first unread novel/novella that exists in BOOKS
function getHHNextFromGuide(guide, statuses){
  const isUnread=id=>{const s=statuses[id]?.status||'none';return s==='none'||s==='want';};
  for(const part of guide){
    if(part.pickOne) continue; // skip prologue choose-one block
    const entries=part.books||[];
    for(const entry of entries){
      const t=entry.type||'novel';
      if(t==='short'||t==='audio') continue; // novels & novellas only
      if(entry.b40k) continue; // skip 40K-era bonus books
      const book=findHHBook(entry);
      if(book&&isUnread(book.id)){
        const hhRead=guide.flatMap(p=>p.books||[])
          .filter(e=>{const et=e.type||'novel';return et!=='short'&&et!=='audio'&&!e.b40k;})
          .map(e=>findHHBook(e)).filter(Boolean)
          .filter(b=>statuses[b.id]?.status==='read').length;
        const hhTotal=guide.flatMap(p=>p.books||[])
          .filter(e=>{const et=e.type||'novel';return et!=='short'&&et!=='audio'&&!e.b40k;})
          .map(e=>findHHBook(e)).filter(Boolean).length;
        return{book,reason:'Next in Horus Heresy',seriesProgress:`${hhRead}/${hhTotal} read`,priority:0};
      }
    }
  }
  return null;
}

function getNextSuggestion(statuses, hhMode='full') {
  const COLD_STARTS = ["Horus Rising","Eisenhorn","Gaunt's Ghosts","Ultramarines: The Omnibus","Night Lords: The Omnibus"];

  // P0 — HH guide suggestion (takes priority when user has read any HH book)
  const hasReadAnyHH=BOOKS.some(b=>b.series==='Horus Heresy'&&statuses[b.id]?.status==='read');
  if(hasReadAnyHH||BOOKS.some(b=>b.series==='Horus Heresy'&&statuses[b.id]?.status==='reading')){
    const guide=hhMode==='essential'?HH_MIN:HH_FULL;
    const hhNext=getHHNextFromGuide(guide,statuses);
    if(hhNext) return hhNext;
  }

  // Build per-series info
  const seriesMap = {};
  BOOKS.forEach(b => {
    if(!seriesMap[b.series]) seriesMap[b.series] = [];
    seriesMap[b.series].push(b);
  });
  Object.values(seriesMap).forEach(arr => arr.sort((a,b)=>a.num-b.num));

  const st = id => statuses[id]?.status || 'none';
  const isUnread = id => { const s=st(id); return s==='none'||s==='want'; };

  // P1 — next after a book you're currently reading
  const readingIds = BOOKS.filter(b=>st(b.id)==='reading').map(b=>b.id);
  for(const rid of readingIds){
    const rb = BOOKS.find(b=>b.id===rid);
    if(!rb) continue;
    const series = seriesMap[rb.series] || [];
    const readCount = series.filter(b=>st(b.id)==='read').length;
    const next = series.find(b=>b.num > rb.num && isUnread(b.id));
    if(next) return { book:next, reason:`Next in ${rb.series}`, seriesProgress:`${readCount}/${series.length} read`, priority:1 };
  }

  // P2 — next after the furthest-read book in any in-progress series
  const seriesProgress = {};
  BOOKS.forEach(b=>{ if(st(b.id)==='read'){ if(!seriesProgress[b.series]) seriesProgress[b.series]=0; seriesProgress[b.series]=Math.max(seriesProgress[b.series],b.num); } });
  // sort by most progress descending
  const progressEntries = Object.entries(seriesProgress).sort((a,b)=>b[1]-a[1]);
  for(const [sName, maxNum] of progressEntries){
    const series = seriesMap[sName] || [];
    const next = series.find(b=>b.num>maxNum && isUnread(b.id));
    const readCount = series.filter(b=>st(b.id)==='read').length;
    if(next) return { book:next, reason:`Continue ${sName}`, seriesProgress:`${readCount}/${series.length} read`, priority:2 };
  }

  // P3 — cold start recommendation
  for(const title of COLD_STARTS){
    const book = BOOKS.find(b=>b.title===title);
    if(book && isUnread(book.id)){
      const series = seriesMap[book.series] || [];
      return { book, reason:`Recommended start`, seriesProgress:`${series.length} book series`, priority:3 };
    }
  }
  return null;
}

// ─── READING CRUSADE ──────────────────────────────────────────────────────────
function ReadingSection({user, statuses={}, onOpenBook, setSection}){
  const [crusadeTab,setCrusadeTab]=useState('overview'); // 'overview'|'guide'
  const [expanded,setExpanded]=useState(null);

  const readCount=useMemo(()=>Object.values(statuses).filter(s=>s.status==='read').length,[statuses]);
  const readingCount=useMemo(()=>Object.values(statuses).filter(s=>s.status==='reading').length,[statuses]);
  const wantCount=useMemo(()=>Object.values(statuses).filter(s=>s.status==='want').length,[statuses]);

  const seriesList=useMemo(()=>{
    const map={};
    BOOKS.forEach(b=>{if(!map[b.series])map[b.series]=[];map[b.series].push(b);});
    return Object.entries(map).map(([name,books])=>{
      const sorted=[...books].sort((a,b)=>a.num-b.num);
      const rc=sorted.filter(b=>statuses[b.id]?.status==='read').length;
      const nc=sorted.filter(b=>statuses[b.id]?.status==='reading').length;
      const next=sorted.find(b=>{const s=statuses[b.id]?.status;return !s||s==='none'||s==='want';});
      return{name,books:sorted,total:sorted.length,readCount:rc,readingCount:nc,nextBook:next};
    }).sort((a,b)=>{
      if(a.readingCount>0&&!b.readingCount)return -1;
      if(b.readingCount>0&&!a.readingCount)return 1;
      if(b.readCount!==a.readCount)return b.readCount-a.readCount;
      return b.total-a.total;
    });
  },[statuses]);

  const [hhMode,setHhMode]=useState(()=>localStorage.getItem('wh40k_hh_mode')||'full');

  // Sync HH mode from DB on first load (new device)
  useEffect(()=>{
    if(!user?.id) return;
    sb.get("user_settings",`user_id=eq.${user.id}&select=hh_mode`).then(rows=>{
      if(!rows?.length||rows._error) return;
      const m=rows[0]?.hh_mode;
      if(m&&m!==hhMode){ localStorage.setItem('wh40k_hh_mode',m); setHhMode(m); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id]);

  const setHhModeSync=(m)=>{
    localStorage.setItem('wh40k_hh_mode',m);
    setHhMode(m);
    if(user?.id) sb.upsert("user_settings",{user_id:user.id,hh_mode:m,updated_at:new Date().toISOString()},"user_id");
  };

  const suggestion = useMemo(()=>getNextSuggestion(statuses,hhMode),[statuses,hhMode]);
  const [opening,setOpening] = useState(false);

  const handleReadNext = async(book) => {
    if(!onOpenBook||!setSection) return setSection?.('library');
    setOpening(true);
    const ok = await onOpenBook(book);
    setOpening(false);
    if(!ok) setSection('library');
  };

  return(
    <div style={{paddingBottom:80}}>
      {/* Tab bar */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,position:"sticky",top:0,zIndex:5}}>
        {[{id:"overview",label:"Overview"},{id:"guide",label:"⚔ Heresy Guide"}].map(t=>(
          <button key={t.id} onClick={()=>setCrusadeTab(t.id)} style={{flex:1,padding:"12px 4px",background:"transparent",border:"none",borderBottom:`2px solid ${crusadeTab===t.id?C.gold:"transparent"}`,color:crusadeTab===t.id?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer",textTransform:"uppercase",transition:"color 0.15s"}}>
            {t.label}
          </button>
        ))}
      </div>
      {crusadeTab==="guide"&&<HHGuideSection statuses={statuses}/>}
      {crusadeTab==="overview"&&<>
      {/* Header stats */}
      <div style={{padding:"20px 16px 12px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:6}}>Black Library</div>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.text,marginBottom:14}}>Your Crusade</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          {[{label:"Read",count:readCount,color:C.green},{label:"Reading",count:readingCount,color:C.blue},{label:"To Read",count:wantCount,color:C.gold},{label:"Total",count:BOOKS.length,color:C.muted}].map(s=>(
            <div key={s.label} style={{flex:"1 1 60px",background:C.card,border:`1px solid ${s.color}44`,borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:s.color,lineHeight:1}}>{s.count}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,letterSpacing:2,marginTop:4}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{height:6,background:C.dim,borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${BOOKS.length>0?(readCount/BOOKS.length)*100:0}%`,background:`linear-gradient(to right,${C.green},${C.gold})`,borderRadius:3,transition:"width 0.5s ease"}}/>
        </div>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.muted,letterSpacing:2,marginTop:6,textAlign:"right"}}>{BOOKS.length>0?Math.round((readCount/BOOKS.length)*100):0}% COMPLETE</div>
      </div>

      {/* ── Next Up suggestion ── */}
      {suggestion&&(
        <div style={{margin:"14px 16px 0",background:`linear-gradient(135deg,${C.gold}12,${C.card})`,border:`1px solid ${C.gold}44`,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"10px 14px 0",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.gold,letterSpacing:3,textTransform:"uppercase"}}>⚔ Next Up</span>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:1}}>· {suggestion.reason}</span>
            {suggestion.seriesProgress&&<span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,marginLeft:"auto"}}>{suggestion.seriesProgress}</span>}
          </div>
          <div style={{padding:"10px 14px 14px",display:"flex",gap:14,alignItems:"center"}}>
            <CoverImage book={suggestion.book} width={64} height={96} radius={4} accentColor={FC[suggestion.book.faction]||C.dim} style={{boxShadow:"0 4px 12px rgba(0,0,0,0.5)",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:1,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{suggestion.book.series}{suggestion.book.num>0?` #${suggestion.book.num}`:""}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:15,color:C.text,lineHeight:1.3,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{suggestion.book.title}</div>
              <div style={{fontSize:12,color:C.muted,fontStyle:"italic",marginBottom:10}}>{suggestion.book.author}</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>handleReadNext(suggestion.book)} disabled={opening}
                  style={{flex:1,padding:"9px 10px",borderRadius:8,background:`linear-gradient(135deg,${C.gold},#8a6f28)`,border:"none",color:C.bg,fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,cursor:"pointer",fontWeight:700}}>
                  {opening?"Opening…":"📖 Read Next"}
                </button>
                <button onClick={()=>setSection?.('library')}
                  style={{padding:"9px 12px",borderRadius:8,background:"transparent",border:`1px solid ${C.dim}`,color:C.muted,fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:1,cursor:"pointer"}}>
                  Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Series list */}
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:8}}>
        {seriesList.map(serie=>{
          const pct=serie.total>0?(serie.readCount/serie.total)*100:0;
          const isExp=expanded===serie.name;
          return(
            <div key={serie.name} style={{background:C.card,border:`1px solid ${serie.readingCount>0?C.blue:C.border}`,borderLeft:`3px solid ${serie.readingCount>0?C.blue:serie.readCount===serie.total&&serie.total>0?C.green:C.dim}`,borderRadius:10,overflow:"hidden"}}>
              <div onClick={()=>setExpanded(isExp?null:serie.name)} style={{padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,color:C.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{serie.name}</div>
                  <div style={{height:4,background:C.dim,borderRadius:2,overflow:"hidden",marginTop:6}}>
                    <div style={{height:"100%",width:`${pct}%`,background:pct>=100?C.green:C.gold,borderRadius:2}}/>
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:5}}>
                    {serie.readCount>0&&<span style={{fontSize:10,color:C.green}}>✅ {serie.readCount}</span>}
                    {serie.readingCount>0&&<span style={{fontSize:10,color:C.blue}}>📖 {serie.readingCount}</span>}
                    <span style={{fontSize:10,color:C.muted}}>{serie.total} books</span>
                  </div>
                </div>
                <span style={{color:C.goldDim,fontSize:16,flexShrink:0,transition:"transform 0.2s",transform:isExp?"rotate(90deg)":"none"}}>›</span>
              </div>
              {isExp&&(
                <div style={{borderTop:`1px solid ${C.border}`,padding:"8px 14px 10px",display:"flex",flexDirection:"column",gap:4}}>
                  {serie.books.map(b=>{
                    const bs=statuses[b.id]?.status||'none';
                    const cfg=STATUS_CFG[bs];
                    const isNext=serie.nextBook?.id===b.id;
                    return(
                      <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",background:isNext?`${C.gold}0a`:"transparent",borderRadius:6,paddingLeft:isNext?6:0}}>
                        <span style={{fontSize:13,flexShrink:0}}>{cfg.icon}</span>
                        <span style={{fontSize:12,color:bs==='none'?C.muted:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</span>
                        {isNext&&<span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:C.gold,background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:4,padding:"1px 5px",letterSpacing:1,flexShrink:0}}>NEXT</span>}
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:cfg.color,letterSpacing:1,flexShrink:0}}>{b.num>0?`#${b.num}`:""}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}

const AOS_REALMS=[
  {name:"Realm of Aqshy", sub:"Fire",    color:"#C0392B",icon:"🔥"},
  {name:"Realm of Ghyran",sub:"Life",    color:"#4aaa6a",icon:"🌿"},
  {name:"Realm of Shyish",sub:"Death",   color:"#7a5aaa",icon:"💀"},
  {name:"Realm of Azyr",  sub:"Heavens", color:"#5a8fc5",icon:"⭐"},
  {name:"Realm of Chamon",sub:"Metal",   color:"#8a8a4a",icon:"⚙️"},
  {name:"Realm of Ghur",  sub:"Beasts",  color:"#8a5a2a",icon:"🦴"},
  {name:"Realm of Ulgu",  sub:"Shadow",  color:"#4a4a6a",icon:"🌑"},
  {name:"Realm of Hysh",  sub:"Light",   color:"#aaa060",icon:"✨"},
];

function LoreSection({ universe }){
  const [wikiSearch,setWikiSearch]=useState("");
  const isAoS=universe==='aos';

  const openWikiSearch=()=>{
    const q=wikiSearch.trim();
    if(!q) return;
    if(isAoS) window.open(`https://ageofsigmar.lexicanum.com/wiki/Special:Search?search=${encodeURIComponent(q)}`,'_blank','noopener');
    else window.open(`https://warhammer40k.fandom.com/wiki/Special:Search?query=${encodeURIComponent(q)}`,'_blank','noopener');
  };

  const QUICK_LINKS=isAoS?[
    {label:"Stormcast Eternals", wiki:"Stormcast_Eternals",         icon:"⚡"},
    {label:"Sigmar",             wiki:"Sigmar",                     icon:"🔱"},
    {label:"Chaos",              wiki:"Chaos",                      icon:"⛧"},
    {label:"Nagash",             wiki:"Nagash",                     icon:"💀"},
    {label:"Destruction",        wiki:"Destruction_Grand_Alliance", icon:"💪"},
    {label:"Sylvaneth",          wiki:"Sylvaneth",                  icon:"🌿"},
    {label:"Skaven",             wiki:"Skaven",                     icon:"🐀"},
    {label:"Mortal Realms",      wiki:"Mortal_Realms",              icon:"🌍"},
    {label:"Ossiarch",           wiki:"Ossiarch_Bonereapers",       icon:"🦴"},
    {label:"Fyreslayers",        wiki:"Fyreslayers",                icon:"🔥"},
    {label:"Idoneth",            wiki:"Idoneth_Deepkin",            icon:"🌊"},
    {label:"Lumineth",           wiki:"Lumineth_Realm-lords",       icon:"✨"},
  ]:[
    {label:"Space Marines",   wiki:"Space_Marines",           icon:"⚔️"},
    {label:"Chaos",           wiki:"Chaos_(Warhammer)",       icon:"⛧"},
    {label:"Necrons",         wiki:"Necrons",                 icon:"💀"},
    {label:"Tyranids",        wiki:"Tyranids",                icon:"🦑"},
    {label:"Aeldari",         wiki:"Aeldari",                 icon:"🌙"},
    {label:"Orks",            wiki:"Orks",                    icon:"💪"},
    {label:"T'au",            wiki:"T%27au_Empire",           icon:"🔵"},
    {label:"Primarchs",       wiki:"Primarch",                icon:"🧬"},
    {label:"Horus Heresy",    wiki:"Horus_Heresy",            icon:"🔥"},
    {label:"Astra Militarum", wiki:"Astra_Militarum",         icon:"🪖"},
    {label:"Inquisition",     wiki:"Inquisition",             icon:"🔍"},
    {label:"Ad. Mechanicus",  wiki:"Adeptus_Mechanicus",      icon:"⚙️"},
  ];

  const LinkCard=({title,icon,desc,url,color,badge})=>(
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{display:"block",textDecoration:"none",background:`linear-gradient(135deg,${color}22,${C.card})`,border:`1px solid ${color}55`,borderLeft:`3px solid ${color}`,borderRadius:12,padding:"18px 18px",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <span style={{fontSize:32}}>{icon}</span>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <span style={{fontFamily:"'Cinzel Decorative',serif",fontSize:16,color:C.text,fontWeight:700}}>{title}</span>
            {badge&&<span style={{fontFamily:"'Cinzel',serif",fontSize:8,padding:"2px 8px",borderRadius:4,background:`${color}33`,border:`1px solid ${color}55`,color,letterSpacing:1}}>{badge}</span>}
          </div>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{desc}</div>
        </div>
        <span style={{color,fontSize:20,flexShrink:0}}>↗</span>
      </div>
    </a>
  );

  return(
    <div style={{paddingBottom:80}}>
      {/* header */}
      <div style={{padding:"22px 16px 16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:6}}>{isAoS?"Warhammer: Age of Sigmar":"Warhammer 40,000"}</div>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.text,marginBottom:6}}>Lore & Resources</h2>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{isAoS?"Accesso diretto alle migliori enciclopedie online dei Mortal Realms.":"Direct access to the best online encyclopedias. WH40K lore is vast — let the experts handle it."}</p>
      </div>

      {/* search bar → apre wiki */}
      <div style={{padding:"16px 16px 0"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>{isAoS?"Cerca su Lexicanum AoS":"Search on Fandom Wiki"}</div>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1,position:"relative"}}>
            <input value={wikiSearch} onChange={e=>setWikiSearch(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&openWikiSearch()}
              placeholder={isAoS?"Sigmar, Stormcast, Nagash…":"Space Marines, Horus, Aeldari…"}
              style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,padding:"11px 12px 11px 40px",fontSize:14,outline:"none"}}/>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:16,pointerEvents:"none"}}>🔍</span>
          </div>
          <button onClick={openWikiSearch}
            style={{background:`${C.gold}22`,border:`1px solid ${C.gold}`,borderRadius:10,color:C.gold,padding:"0 18px",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer",flexShrink:0}}>Search ↗</button>
        </div>
      </div>

      {/* main link cards */}
      <div style={{padding:"20px 16px 4px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:12}}>Main Resources</div>
        {isAoS?(
          <>
            <LinkCard
              title="Lexicanum AoS"
              icon="📖"
              desc="L'enciclopedia più completa per Age of Sigmar: fazioni, Mortal Realms, personaggi e storia. Aggiornata dalla community."
              url="https://ageofsigmar.lexicanum.com/wiki/Main_Page"
              color={C.gold}
              badge="LEXICANUM"
            />
            <LinkCard
              title="Sigmar Wiki"
              icon="🔱"
              desc="La storia di Sigmar Heldenhammer, dal guerriero mortale al dio-re dei Mortal Realms. Lore profondo su Fandom."
              url="https://warhammerfantasy.fandom.com/wiki/Sigmar"
              color="#4a7fb5"
              badge="FANDOM"
            />
          </>
        ):(
          <>
            <LinkCard
              title="Warhammer 40k Wiki"
              icon="📖"
              desc="The most complete wiki: factions, characters, events, battles, planets. Thousands of articles continuously updated by the community."
              url="https://warhammer40k.fandom.com/wiki/Warhammer_40k_Wiki"
              color={C.gold}
              badge="FANDOM"
            />
            <LinkCard
              title="Lexicanum"
              icon="📜"
              desc="Encyclopedic and technical reference. Great for equipment details, units, dates and chronology."
              url="https://wh40k.lexicanum.com"
              color={C.blue}
              badge="LEXICANUM"
            />
          </>
        )}
      </div>

      {/* quick links grid */}
      <div style={{padding:"8px 16px 16px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>Quick Access</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {QUICK_LINKS.map(q=>(
            <a key={q.wiki} href={isAoS?`https://ageofsigmar.lexicanum.com/wiki/${q.wiki}`:`https://warhammer40k.fandom.com/wiki/${q.wiki}`} target="_blank" rel="noopener noreferrer"
              style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",textDecoration:"none",cursor:"pointer"}}>
              <span style={{fontSize:18,flexShrink:0}}>{q.icon}</span>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.text,letterSpacing:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.label}</span>
              <span style={{color:C.goldDim,fontSize:10,marginLeft:"auto",flexShrink:0}}>↗</span>
            </a>
          ))}
        </div>
      </div>

      {/* Mortal Realms grid — AoS only */}
      {isAoS&&(
        <div style={{padding:"8px 16px 16px"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:12}}>The Mortal Realms</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {AOS_REALMS.map(r=>(
              <div key={r.name} onClick={()=>window.open('https://ageofsigmar.lexicanum.com/wiki/'+r.name.replace(/ /g,'_'),'_blank')}
                style={{background:`linear-gradient(135deg,${r.color}18,${C.card})`,border:`1px solid ${r.color}44`,borderLeft:`3px solid ${r.color}`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                <span style={{fontSize:22}}>{r.icon}</span>
                <div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:C.text}}>{r.name}</div>
                  <div style={{fontSize:10,color:r.color,letterSpacing:0.5}}>{r.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* reader hint */}
      <div style={{margin:"0 16px 16px",background:`${C.blue}11`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:"12px 14px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.blue,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>In the Reader</div>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.6}}>While reading, {isAoS?"AoS":"WH40K"} terms appear <span style={{color:C.blue,borderBottom:`1px solid ${C.blue}55`}}>underlined in blue</span>. Tap them to open the wiki page directly.</p>
      </div>
    </div>
  );
}

function ComingSoon({icon,title,sub}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:20,padding:32,textAlign:"center"}}><div style={{fontSize:60,animation:"float 3s ease-in-out infinite"}}>{icon}</div><div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.gold}}>{title}</div><div style={{color:C.muted,fontStyle:"italic",maxWidth:300,lineHeight:1.6,fontSize:14}}>{sub}</div><div style={{border:`1px solid ${C.gold}44`,borderRadius:20,padding:"8px 22px",color:`${C.gold}88`,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:3,textTransform:"uppercase"}}>Coming Next Phase</div></div>);}

// ─── HOME PAGE (bookshelf) ─────────────────────────────────────────────────────
function NextUpCard({statuses,activeBooks,onOpenBook,setSection,userId}){
  const [hhMode,setHhMode]=useState(()=>localStorage.getItem('wh40k_hh_mode')||'full');

  useEffect(()=>{
    if(!userId) return;
    sb.get("user_settings",`user_id=eq.${userId}&select=hh_mode`).then(rows=>{
      if(!rows?.length||rows._error) return;
      const m=rows[0]?.hh_mode;
      if(m&&m!==hhMode){ localStorage.setItem('wh40k_hh_mode',m); setHhMode(m); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[userId]);

  const toggleHhMode=()=>{
    const next=hhMode==='full'?'essential':'full';
    setHhMode(next);
    localStorage.setItem('wh40k_hh_mode',next);
    if(userId) sb.upsert("user_settings",{user_id:userId,hh_mode:next,updated_at:new Date().toISOString()},"user_id");
  };
  const suggestion=useMemo(()=>getNextSuggestion(statuses,hhMode),[statuses,hhMode]);
  const [opening,setOpening]=useState(false);
  const isHH=suggestion?.reason==='Next in Horus Heresy';
  if(!suggestion) return null;
  if(activeBooks.some(b=>b.id===suggestion.book.id)) return null;
  const handle=async()=>{
    if(!onOpenBook) return setSection('library');
    setOpening(true);
    const ok=await onOpenBook(suggestion.book);
    setOpening(false);
    if(!ok) setSection('library');
  };
  return(
    <div style={{padding:"14px 16px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.gold,letterSpacing:3,textTransform:"uppercase"}}>⚔ Next Up</div>
        {isHH&&(
          <button onClick={toggleHhMode} style={{background:"transparent",border:`1px solid ${C.gold}55`,borderRadius:20,padding:"3px 10px",cursor:"pointer",display:"flex",gap:0,overflow:"hidden",flexShrink:0}}>
            {['full','essential'].map(m=>(
              <span key={m} style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,color:hhMode===m?C.bg:C.muted,background:hhMode===m?C.gold:"transparent",padding:"2px 8px",borderRadius:12,transition:"all 0.15s"}}>{m==='full'?'Full':'Essential'}</span>
            ))}
          </button>
        )}
      </div>
      <div style={{background:`linear-gradient(135deg,${C.gold}12,${C.card})`,border:`1px solid ${C.gold}44`,borderLeft:`3px solid ${C.gold}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
        <CoverImage book={suggestion.book} width={44} height={64} radius={3} accentColor={FC[suggestion.book.faction]||C.dim} style={{boxShadow:"0 2px 8px rgba(0,0,0,0.5)"}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:1,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{suggestion.reason.toUpperCase()}{suggestion.seriesProgress?` · ${suggestion.seriesProgress}`:""}</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:C.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{suggestion.book.title}</div>
          <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{suggestion.book.author}</div>
        </div>
      </div>
    </div>
  );
}

function HomePage({user,setSection,statuses={},onOpenBook}){
  const uid=user?.id||'anon';

  // Load uploaded book IDs: DB first, fall back to localStorage
  const [uploadedIds,setUploadedIds]=useState(()=>{
    const ids=new Set();
    const prefix=`wh40k_ebook_${uid}_`;
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k?.startsWith(prefix)){const id=parseInt(k.slice(prefix.length));if(!isNaN(id))ids.add(id);}
    }
    return ids;
  });
  useEffect(()=>{
    if(!user?.id) return;
    supabase.from("ebook_files").select("book_id").eq("user_id",user.id).then(({ data:files })=>{
      if(files?.length){
        setUploadedIds(new Set(files.map(f=>{ const n=parseInt(f.book_id,10); return isNaN(n)?f.book_id:n; })));
      }
    });
  },[user?.id]);

  const readCount=Object.values(statuses).filter(s=>s.status==='read').length;
  const readingCount=Object.values(statuses).filter(s=>s.status==='reading').length;

  // books to show on shelf: uploaded OR marked as read, sorted by series then number
  const shelfBooks=useMemo(()=>{
    return BOOKS.filter(b=>uploadedIds.has(b.id)||statuses[b.id]?.status==='read')
      .sort((a,b)=>a.series.localeCompare(b.series)||(a.num-b.num));
  },[uploadedIds,statuses]);

  // group by series for display
  const shelfBySeries=useMemo(()=>{
    const groups=[];
    const seen={};
    shelfBooks.forEach(b=>{
      if(!seen[b.series]){seen[b.series]=[];groups.push({series:b.series,books:seen[b.series]});}
      seen[b.series].push(b);
    });
    return groups;
  },[shelfBooks]);

  // currently reading
  const activeBooks=BOOKS.filter(b=>statuses[b.id]?.status==='reading');

  // spine color by faction
  const spineColor=(b)=>{
    const base=FC[b.faction]||C.dim;
    return base;
  };

  const ShelfRow=({books,label})=>{
    if(!books.length)return null;
    return(
      <div style={{marginBottom:8}}>
        {label&&<div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",padding:"0 16px",marginBottom:4}}>{label}</div>}
        {/* shelf plank */}
        <div style={{position:"relative",overflowX:"auto",overflowY:"visible",paddingBottom:10}}>
          <div style={{display:"flex",gap:3,padding:"0 16px 0 16px",minWidth:"max-content",alignItems:"flex-end"}}>
            {books.map(b=>{
              const sc=spineColor(b);
              const isUploaded=uploadedIds.has(b.id);
              const bst=statuses[b.id]?.status||'none';
              const isReading=bst==='reading';
              const isRead=bst==='read';
              return(
                <div key={b.id} onClick={()=>onOpenBook?onOpenBook(b):setSection('library')} title={`${b.title} — ${b.author}`}
                  style={{
                    flexShrink:0,
                    width:isUploaded?32:22,
                    height:isUploaded?130:120,
                    background:`linear-gradient(to right,${sc}dd,${sc}99,${sc}cc)`,
                    borderRadius:"2px 2px 0 0",
                    cursor:"pointer",
                    position:"relative",
                    boxShadow:`inset -2px 0 4px rgba(0,0,0,0.4), 2px 0 3px rgba(0,0,0,0.3)`,
                    border:`1px solid ${sc}`,
                    borderBottom:"none",
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"center",
                    overflow:"hidden",
                    transition:"transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow=`inset -2px 0 4px rgba(0,0,0,0.4), 4px 4px 8px rgba(0,0,0,0.5)`;}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=`inset -2px 0 4px rgba(0,0,0,0.4), 2px 0 3px rgba(0,0,0,0.3)`;}}
                >
                  {/* spine text */}
                  <div style={{
                    writingMode:"vertical-rl",
                    textOrientation:"mixed",
                    transform:"rotate(180deg)",
                    fontFamily:"'Cinzel',serif",
                    fontSize:isUploaded?7:6,
                    color:"rgba(255,255,255,0.85)",
                    letterSpacing:1,
                    overflow:"hidden",
                    maxHeight:"90%",
                    padding:"4px 2px",
                    textShadow:"0 1px 2px rgba(0,0,0,0.8)",
                    lineHeight:1.1,
                  }}>{b.title}</div>
                  {/* status indicator top */}
                  {isReading&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:C.blue}}/>}
                  {isRead&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:C.green}}/>}
                  {/* uploaded glow */}
                  {isUploaded&&<div style={{position:"absolute",inset:0,border:`1px solid ${C.gold}88`,borderRadius:"2px 2px 0 0",pointerEvents:"none"}}/>}
                </div>
              );
            })}
          </div>
          {/* shelf plank */}
          <div style={{height:10,background:`linear-gradient(to bottom,#5a3a1a,#3a2010)`,marginLeft:16,marginRight:16,borderRadius:"0 0 4px 4px",boxShadow:"0 3px 6px rgba(0,0,0,0.5)"}}/>
        </div>
      </div>
    );
  };

  return(
    <div style={{paddingBottom:80}}>
      {/* hero */}
      <div style={{padding:"24px 16px 20px",borderBottom:`1px solid ${C.border}`,background:`linear-gradient(180deg,${C.surface},${C.bg})`}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:4}}>Welcome to the</div>
        <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:26,color:C.text,lineHeight:1.1,marginBottom:4}}>Scriptorium</h1>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:3}}>YOUR IMPERIAL LIBRARY</div>
      </div>

      {/* stats bar */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>
        {[
          {n:readingCount,l:"Reading",c:C.blue},
          {n:readCount,l:"Read",c:C.green},
          {n:BOOKS.length,l:"Total",c:C.muted},
        ].map(s=>(
          <div key={s.l} style={{flex:1,padding:"12px 4px",textAlign:"center",borderRight:`1px solid ${C.border}`}}>
            <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:22,color:s.c,lineHeight:1}}>{s.n}</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:7,color:C.muted,letterSpacing:2,marginTop:3,textTransform:"uppercase"}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* currently reading */}
      {activeBooks.length>0&&(
        <div style={{padding:"14px 16px 0"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.blue,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>📖 Reading</div>
          {activeBooks.map(b=>{
            const hasEbook=uploadedIds.has(b.id);
            return(
            <div key={b.id} onClick={()=>hasEbook&&onOpenBook?onOpenBook(b):setSection('library')}
              style={{background:`linear-gradient(135deg,${C.blue}18,${C.card})`,border:`1px solid ${C.blue}44`,borderLeft:`3px solid ${C.blue}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <CoverImage book={b} width={36} height={50} radius={3} accentColor={FC[b.faction]||C.dim}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:C.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</div>
                <div style={{fontSize:11,color:C.muted}}>{b.series}{b.num>0?` #${b.num}`:""} · {b.author}</div>
              </div>
              {hasEbook
                ?<span style={{background:`${C.gold}22`,border:`1px solid ${C.gold}55`,borderRadius:6,padding:"4px 8px",fontFamily:"'Cinzel',serif",fontSize:9,color:C.gold,letterSpacing:1,flexShrink:0}}>READ ›</span>
                :<span style={{color:C.blue,fontSize:16,flexShrink:0}}>›</span>
              }
            </div>
            );
          })}
        </div>
      )}

      {/* ── Next Up suggestion ── */}
      <NextUpCard statuses={statuses} activeBooks={activeBooks} onOpenBook={onOpenBook} setSection={setSection} userId={user?.id}/>

      {/* bookshelf */}
      <div style={{padding:"16px 0 0"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",padding:"0 16px",marginBottom:10}}>Your Shelf</div>
        {shelfBooks.length===0?(
          <div style={{padding:"24px 16px",textAlign:"center"}}>
            <div style={{color:C.muted,fontSize:13,fontStyle:"italic",marginBottom:12}}>No ebooks uploaded yet.</div>
            <button onClick={()=>setSection('library')} style={{background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,color:C.gold,padding:"8px 20px",fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,cursor:"pointer"}}>Go to Library →</button>
          </div>
        ):(
          <>
            {shelfBySeries.map(({series,books})=>(
              <ShelfRow key={series} books={books} label={series}/>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const NAV=[{id:"home",icon:"🏛️",label:"Home"},{id:"library",icon:"📚",label:"Library"},{id:"lore",icon:"⚔️",label:"Lore"},{id:"reading",icon:"📖",label:"Crusade"},{id:"painting",icon:"🎨",label:"Painting"},{id:"music",icon:"🎵",label:"Music"}];

export default function App(){
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user??null);setAuthLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setUser(s?.user??null));
    return ()=>subscription.unsubscribe();
  },[]);

  // ── Global statuses — single source of truth ──────────────────────────────
  const [statuses,setStatuses]=useState({});
  const [aosStatuses,setAosStatuses]=useState({});

  // Bidirectional sync helper: merges local + DB (newest wins), pushes local-only entries up
  const syncStatuses = useCallback(async (uid, localMap, isAoS) => {
    const rows = await sb.get("reading_status",`user_id=eq.${uid}&select=book_id,status,updated_at,started_at,completed_at`);
    const dbMap = {};
    if(rows && !rows._error && rows.length) {
      rows.forEach(r => { dbMap[r.book_id] = r; });
    }
    // Merge: DB wins if newer, local wins otherwise — filter by universe to prevent cross-contamination
    const merged = {...localMap};
    Object.entries(dbMap).forEach(([bid, dbRow]) => {
      if(isAoS && !String(bid).startsWith('aos')) return;
      if(!isAoS && String(bid).startsWith('aos')) return;
      const local = merged[bid];
      if(!local || !local.updatedAt || new Date(dbRow.updated_at) > new Date(local.updatedAt)) {
        merged[bid] = { status:dbRow.status, updatedAt:dbRow.updated_at, startedAt:dbRow.started_at, completedAt:dbRow.completed_at };
        localStorage.setItem(`wh40k_status_${uid}_${bid}`, JSON.stringify(merged[bid]));
      }
    });
    // Push local entries not in DB or where local is newer
    const toSync = Object.entries(localMap).filter(([bid, local]) => {
      if(!local?.status || local.status === 'none') return false;
      if(isAoS && !String(bid).startsWith('aos')) return false;
      if(!isAoS && String(bid).startsWith('aos')) return false;
      const db = dbMap[bid];
      if(!db) return true;
      if(!local.updatedAt) return false;
      return new Date(local.updatedAt) > new Date(db.updated_at);
    });
    toSync.forEach(([bookId, st]) => sb.upsert("reading_status", {
      user_id:uid, book_id:bookId, status:st.status,
      updated_at: st.updatedAt || new Date().toISOString(),
      ...(st.startedAt ? {started_at:st.startedAt} : {}),
      ...(st.completedAt ? {completed_at:st.completedAt} : {}),
    }, "user_id,book_id"));
    return merged;
  }, []);

  useEffect(()=>{
    const uid=user?.id;
    const local = loadAoSStatuses(uid);
    setAosStatuses(local);
    if(!uid) return;
    syncStatuses(uid, local, true).then(merged => setAosStatuses(merged));
  },[user?.id, syncStatuses]);
  useEffect(()=>{
    const uid=user?.id;
    const local = loadAllStatuses(uid);
    setStatuses(local);
    if(!uid) return;
    syncStatuses(uid, local, false).then(merged => setStatuses(merged));
  },[user?.id, syncStatuses]);

  // ── Refs for cross-universe achievement checks (avoids stale closures) ────────
  const statusesRef    = useRef({});
  const aosStatusesRef = useRef({});
  useEffect(() => { statusesRef.current    = statuses;    }, [statuses]);
  useEffect(() => { aosStatusesRef.current = aosStatuses; }, [aosStatuses]);
  const didInitialAosCheck = useRef(false);

  // ── Achievement state ─────────────────────────────────────────────────────
  const [unlockedIds,         setUnlockedIds]         = useState([]);
  const [unlockedIdsLoaded,   setUnlockedIdsLoaded]   = useState(false);
  const [pendingAchievements, setPendingAchievements] = useState([]);
  const [showStats,           setShowStats]           = useState(false);

  useEffect(() => {
    if (!user?.id) { setUnlockedIds([]); setUnlockedIdsLoaded(false); didInitialAosCheck.current = false; return; }
    loadUnlockedIds(supabase, user.id).then(ids => { setUnlockedIds(ids); setUnlockedIdsLoaded(true); });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !unlockedIdsLoaded || didInitialAosCheck.current) return;
    didInitialAosCheck.current = true;
    const nowUnlocked = computeAoSReadingAchievements(aosStatuses, AOS_BOOKS);
    setUnlockedIds(prev => {
      // Rebuild: keep non-AoS IDs + only legitimately earned AoS IDs
      const nonAos  = prev.filter(id => !id.startsWith('aos_') && !id.startsWith('aos_series:'));
      const corrected = [...new Set([...nonAos, ...nowUnlocked])];
      const changed = corrected.length !== prev.length || corrected.some(id => !prev.includes(id)) || prev.some(id => !corrected.includes(id));
      if (!changed) return prev;
      saveUnlockedIds(supabase, user.id, corrected);
      return corrected;
    });
  }, [user?.id, unlockedIdsLoaded, aosStatuses]);

  const checkReadingAchievements = useCallback((wh40kStatuses) => {
    if (!user?.id) return;
    const nowUnlocked = computeReadingAchievements(wh40kStatuses, BOOKS);
    setUnlockedIds(prev => {
      const newIds = diffAchievements(prev, nowUnlocked);
      if (!newIds.length) return prev;
      const merged = [...prev, ...newIds];
      saveUnlockedIds(supabase, user.id, merged);
      const defs = newIds.map(id => achievementFromId(id)).filter(Boolean)
                         .map(d => ({...d, _universe: 'wh40k'}));
      setPendingAchievements(q => [...q, ...defs]);
      return merged;
    });
  }, [user?.id]);

  const checkAoSReadingAchievements = useCallback((aosStatuses) => {
    if (!user?.id) return;
    const nowUnlocked = computeAoSReadingAchievements(aosStatuses, AOS_BOOKS);
    setUnlockedIds(prev => {
      const newIds = diffAchievements(prev, nowUnlocked);
      if (!newIds.length) return prev;
      const merged = [...prev, ...newIds];
      saveUnlockedIds(supabase, user.id, merged);
      const defs = newIds.map(id => achievementFromId(id)).filter(Boolean)
                         .map(d => ({...d, _universe: 'aos'}));
      setPendingAchievements(q => [...q, ...defs]);
      return merged;
    });
  }, [user?.id]);

  const updateStatus=useCallback((bookId,newStatus)=>{
    const uid=user?.id;
    const updated=setBookStatusLS(uid,bookId,newStatus);
    setStatuses(prev=>{
      const next={...prev,[bookId]:updated};
      if(newStatus==='read') checkReadingAchievements(next);
      return next;
    });
    if(uid){
      sb.upsert("reading_status",{
        user_id:uid,book_id:bookId,status:newStatus,
        updated_at:new Date().toISOString(),
        ...(newStatus==='reading'&&!updated.startedAt?{started_at:new Date().toISOString()}:{}),
        ...(newStatus==='read'?{completed_at:new Date().toISOString()}:{}),
      },"user_id,book_id");
    }
  },[user?.id, checkReadingAchievements]);

  const updateAoSStatus=useCallback((bookId,newStatus)=>{
    const uid=user?.id;
    const updated=setBookStatusLS(uid,bookId,newStatus);
    setAosStatuses(prev=>{
      const next={...prev,[bookId]:updated};
      if(newStatus==='read') checkAoSReadingAchievements(next);
      return next;
    });
    if(uid){
      sb.upsert("reading_status",{
        user_id:uid,book_id:bookId,status:newStatus,
        updated_at:new Date().toISOString(),
        ...(newStatus==='reading'&&!updated.startedAt?{started_at:new Date().toISOString()}:{}),
        ...(newStatus==='read'?{completed_at:new Date().toISOString()}:{}),
      },"user_id,book_id");
    }
  },[user?.id, checkAoSReadingAchievements]);

  // Landing page: always shown first on each fresh session.
  // sessionStorage persists across Google OAuth redirects but resets on tab close.
  const [appStarted,setAppStarted]=useState(()=>sessionStorage.getItem('wh_started')==='1');
  const startApp=useCallback(()=>{ sessionStorage.setItem('wh_started','1'); localStorage.removeItem('wh_universe'); setUniverse(null); setAppStarted(true); },[]);

  const [universe,setUniverse]=useState(()=>localStorage.getItem('wh_universe')||null);

  // Load universe from DB when no local preference exists (e.g. new device)
  useEffect(()=>{
    if(!user?.id||localStorage.getItem('wh_universe')) return;
    sb.get("user_settings",`user_id=eq.${user.id}&select=universe`).then(rows=>{
      if(!rows?.length||rows._error) return;
      const u=rows[0]?.universe;
      if(u){ localStorage.setItem('wh_universe',u); setUniverse(u); }
    });
  },[user?.id]);

  const selectUniverse=(u)=>{
    localStorage.setItem('wh_universe',u);
    setUniverse(u);
    if(user?.id) sb.upsert("user_settings",{user_id:user.id,universe:u,updated_at:new Date().toISOString()},"user_id");
  };
  const handleLogout=()=>{ localStorage.removeItem('wh_universe'); sessionStorage.removeItem('wh_started'); setUniverse(null); setAppStarted(false); signOut(); };

  // If Spotify OAuth is returning, open Music section directly
  const [section,setSection]=useState(()=>{
    const p=new URLSearchParams(window.location.search);
    return p.get("state")==="spotify_auth"?"music":"home";
  });
  const [nowPlaying,setNowPlaying]=useState(null);
  const [musicPaused,setMusicPaused]=useState(false);
  const musicRef=useRef(null);
  const mainRef=useRef(null);
  const toggleMusicPause=useCallback(()=>{
    if(musicPaused){musicRef.current?.resume();setMusicPaused(false);}
    else{musicRef.current?.pause();setMusicPaused(true);}
  },[musicPaused]);
  useEffect(()=>{ if(mainRef.current) mainRef.current.scrollTop=0; },[section]);
  const curNav=NAV.find(n=>n.id===section);
  const curNavLabel=curNav?(curNav.id==="reading"&&universe==='aos'?"Path to Glory":curNav.label):"";

  // ── App-level reader (opened from Home page) ──────────────────────────────
  const [appReader,setAppReader]=useState(null);
  const openBook=useCallback(async(book)=>{
    const uid=user?.id; if(!uid) return;
    // 1. Get ebook meta — localStorage first, then DB
    let meta=null;
    try{ meta=JSON.parse(localStorage.getItem(`wh40k_ebook_${uid}_${book.id}`)||'null'); }catch{}
    if(!meta){
      const { data:files } = await supabase.from("ebook_files").select("*").eq("user_id",uid).eq("book_id",book.id).limit(1);
      if(files?.length) meta=files[0];
    }
    if(!meta) return;
    // 2. Signed URL
    const url=await sb.storage.signedUrl(meta.file_path);
    if(!url) return;
    // 3. Last reading position
    let progress=0,chapterIndex=0,pageIndex=0;
    try{
      const p=JSON.parse(localStorage.getItem(`wh40k_prog_${uid}_${book.id}`)||'null');
      if(p){ progress=p.progress_pct||0; chapterIndex=p.chapter_index||0; pageIndex=p.page_index||0; }
    }catch{}
    setAppReader({book,url,fileType:meta.file_type||'epub',progress,chapterIndex,pageIndex});
    return true;
  },[user?.id]);
  // Step 1: always show the landing/welcome page first
  if(!appStarted) return <LoginPage onEnter={startApp} user={user} authLoading={authLoading}/>;
  // Step 2: if auth is still loading (post-OAuth redirect) show spinner
  if(authLoading) return <LoginPage authLoading/>;
  // Step 3: if not logged in (cancelled OAuth), show login page
  if(!user) return <LoginPage/>;
  // Step 4: choose universe
  if(!universe) return <UniverseSelector onSelect={selectUniverse}/>;
  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700;900&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{height:100%;background:${universe==='aos'?AOS.bg:C.bg};color:${universe==='aos'?AOS.text:C.text};font-family:system-ui,-apple-system,sans-serif;}
        input,select,button{font-family:inherit;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-thumb{background:${C.dim};border-radius:2px;}
        @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
        @keyframes hexPulse{0%,100%{opacity:.2;}50%{opacity:.8;}}
        @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
        @keyframes slideLeft{from{transform:translateX(100%);}to{transform:translateX(0);}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
      `}</style>
      <div style={{display:"flex",flexDirection:"column",height:"100%",maxWidth:1100,margin:"0 auto",background:universe==='aos'?AOS.bg:C.bg}}>
        {/* ── HEADER ── */}
        {(()=>{
          const hBg=universe==='aos'?AOS.surface:C.surface;
          const hBorder=universe==='aos'?AOS.border:C.border;
          const hAccent=universe==='aos'?AOS.gold:C.red;
          const hText=universe==='aos'?AOS.text:C.text;
          const hGoldDim=universe==='aos'?AOS.goldDim:C.goldDim;
          const hMuted=universe==='aos'?AOS.muted:C.muted;
          const hDim=universe==='aos'?AOS.dim:C.dim;
          const hGold=universe==='aos'?AOS.gold:C.gold;
          const hLabel=universe==='aos'?"AGE OF SIGMAR":"WH40K";
          return(
            <div style={{flexShrink:0,height:50,background:hBg,borderBottom:`1px solid ${hBorder}`,display:"flex",alignItems:"center",padding:"0 16px",gap:0,position:"relative"}}>
              <div style={{height:2,position:"absolute",top:0,left:0,right:0,background:`linear-gradient(to right,transparent,${hAccent},transparent)`}}/>
              {/* universe switch */}
              <button onClick={()=>selectUniverse(null)} title="Switch Universe" style={{background:"transparent",border:"none",cursor:"pointer",padding:"0 8px 0 0",color:hMuted,fontSize:18,lineHeight:1,flexShrink:0}}>‹</button>
              {/* title */}
              <button onClick={()=>setSection("home")} style={{background:"transparent",border:"none",cursor:"pointer",padding:0,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
                <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:universe==='aos'?10:13,fontWeight:900,color:hText,letterSpacing:2,lineHeight:1}}>{hLabel}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:7,color:hGoldDim,letterSpacing:4,textTransform:"uppercase"}}>Companion</div>
              </button>
              {/* section label center */}
              <div style={{flex:1,textAlign:"center"}}>
                {section!=="home"&&<span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:hGoldDim,letterSpacing:3,textTransform:"uppercase"}}>{curNavLabel}</span>}
              </div>
              {/* auth right */}
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>setShowStats(true)} title="Achievements & Stats"
                  style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hGold,padding:"4px 8px",fontSize:14,lineHeight:1,cursor:"pointer"}}>🏆</button>
                {user.user_metadata?.avatar_url&&<img src={user.user_metadata.avatar_url} alt="" style={{width:26,height:26,borderRadius:"50%",border:`1px solid ${hGold}55`}}/>}
                <button onClick={handleLogout} style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hMuted,padding:"4px 10px",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,cursor:"pointer"}}>LOGOUT</button>
              </div>
            </div>
          );
        })()}
        {/* ── CONTENT ── */}
        <div style={{flex:1,overflow:"hidden",position:"relative"}}>
          {/* MusicPlayer always in DOM — never unmounted, so iframe keeps playing even when reader opens */}
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",zIndex:section==="music"&&!appReader?2:0,pointerEvents:section==="music"&&!appReader?"auto":"none"}}>
            <MusicPlayer ref={musicRef} onNowPlaying={(v)=>{setNowPlaying(v);setMusicPaused(false);}}/>
          </div>
          {/* Reader on top (z-index 3) when open */}
          {appReader&&(
            <div style={{position:"absolute",inset:0,zIndex:3}}>
              <Suspense fallback={<div style={{position:"fixed",inset:0,background:"#0f0e09",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:48,animation:"spin 2s linear infinite"}}>⚙</div></div>}>
                {appReader.fileType==="pdf"
                  ?<PdfReader url={appReader.url} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} onClose={()=>setAppReader(null)} nowPlaying={nowPlaying} musicPaused={musicPaused} onMusicClick={()=>{setAppReader(null);setSection("music");}} onStopMusic={()=>{musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}} onTogglePauseMusic={toggleMusicPause}/>
                  :<EpubReader url={appReader.url} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} initProgress={appReader.progress} initChapterIndex={appReader.chapterIndex} initPageIndex={appReader.pageIndex} onProgress={()=>{}} onClose={()=>setAppReader(null)} nowPlaying={nowPlaying} musicPaused={musicPaused} onMusicClick={()=>{setAppReader(null);setSection("music");}} onStopMusic={()=>{musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}} onTogglePauseMusic={toggleMusicPause}/>
                }
              </Suspense>
            </div>
          )}
          {/* Other sections on top (z-index 1) with solid background covering MusicPlayer beneath */}
          {!appReader&&section!=="music"&&(
            <div ref={mainRef} style={{position:"absolute",inset:0,zIndex:1,overflowY:"auto",overscrollBehavior:"contain",background:universe==='aos'?AOS.bg:C.bg}}>
              {section==="home"    &&universe==='40k'&&<HomePage user={user} setSection={setSection} statuses={statuses} onOpenBook={openBook}/>}
              {section==="home"    &&universe==='aos'&&<Suspense fallback={null}><AoSHomePage user={user} setSection={setSection} statuses={aosStatuses} onOpenBook={openBook}/></Suspense>}
              {section==="library" &&universe==='40k'&&<LibrarySection user={user} statuses={statuses} onStatusChange={updateStatus}/>}
              {section==="library" &&universe==='aos'&&<Suspense fallback={null}><AoSLibrarySection user={user} statuses={aosStatuses} onStatusChange={updateAoSStatus}/></Suspense>}
              {section==="lore"    &&<LoreSection universe={universe}/>}
              {section==="reading" &&universe==='40k'&&<ReadingSection user={user} statuses={statuses} onOpenBook={openBook} setSection={setSection}/>}
              {section==="reading" &&universe==='aos'&&<Suspense fallback={null}><AoSCrusadeSection user={user} statuses={aosStatuses}/></Suspense>}
              {section==="painting"&&<Suspense fallback={null}><PaintingTracker user={user} universe={universe}
                onAchievement={defs=>setPendingAchievements(q=>[...q,...defs])}
                unlockedIds={unlockedIds}
                onUpdateUnlocked={merged=>{setUnlockedIds(merged);if(user?.id)saveUnlockedIds(supabase,user.id,merged);}}
              /></Suspense>}
            </div>
          )}
        </div>
        {/* ── MINI PLAYER ── */}
        {nowPlaying&&section!=="music"&&!appReader&&(
          /* Normal mode: full bar above nav */
          <div onClick={()=>setSection("music")}
            style={{position:"fixed",bottom:"var(--nav-h,56px)",left:0,right:0,zIndex:9999,maxWidth:1100,margin:"0 auto",background:C.surface,borderTop:`2px solid ${nowPlaying.type==="youtube"?"#FF000066":"#1DB95466"}`,display:"flex",alignItems:"center",gap:10,padding:"8px 14px",cursor:"pointer",boxShadow:"0 -2px 12px rgba(0,0,0,0.6)"}}>
            {nowPlaying.type==="spotify"&&nowPlaying.albumArt&&<img src={nowPlaying.albumArt} width={36} height={36} style={{borderRadius:4,flexShrink:0}}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.title}</div>
              {nowPlaying.subtitle&&<div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.subtitle}</div>}
            </div>
            <button
              onClick={(e)=>{e.stopPropagation();toggleMusicPause();}}
              style={{background:"transparent",border:"none",color:nowPlaying.type==="youtube"?"#FF4444":"#1DB954",cursor:"pointer",
                      fontSize:16,lineHeight:1,padding:"4px 6px",flexShrink:0}}
              title={musicPaused?"Resume":"Pause"}
            >{musicPaused?"▶":"⏸"}</button>
            <button
              onClick={(e)=>{e.stopPropagation();musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}}
              style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",
                      fontSize:18,lineHeight:1,padding:"4px 6px",flexShrink:0}}
              title="Stop music"
            >✕</button>
          </div>
        )}
        {/* ── ACHIEVEMENT POPUP ── */}
        {pendingAchievements.length>0&&(
          <Suspense fallback={null}>
            <AchievementPopup
              key={pendingAchievements[0].id}
              achievement={pendingAchievements[0]}
              type={["paint","monthly_painter","army"].some(p=>pendingAchievements[0].id.startsWith(p))?"painting":"reading"}
              universe={pendingAchievements[0]._universe||'wh40k'}
              onDismiss={()=>setPendingAchievements(q=>q.slice(1))}
            />
          </Suspense>
        )}
        {/* ── STATS MODAL ── */}
        {showStats&&(
          <Suspense fallback={null}>
            <StatsModal
              user={user}
              statuses={statuses}
              aosStatuses={aosStatuses}
              unlockedIds={unlockedIds}
              onClose={()=>setShowStats(false)}
            />
          </Suspense>
        )}
        {/* ── BOTTOM NAV ── */}
        {(()=>{
          const nBg=universe==='aos'?AOS.surface:C.surface;
          const nBorder=universe==='aos'?AOS.border:C.border;
          const nGold=universe==='aos'?AOS.gold:C.gold;
          const nMuted=universe==='aos'?AOS.muted:C.muted;
          const navItems=NAV.map(n=>n.id==="reading"?{...n,label:universe==='aos'?"Path to Glory":"Crusade"}:n);
          return(
            <div style={{flexShrink:0,background:nBg,borderTop:`1px solid ${nBorder}`,display:"flex",height:56}}>
              {navItems.map(n=>(<button key={n.id} onClick={()=>setSection(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",padding:0,borderTop:`2px solid ${section===n.id?nGold:"transparent"}`,transition:"border-color 0.15s"}}><span style={{fontSize:18,lineHeight:1}}>{n.icon}</span><span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,color:section===n.id?nGold:nMuted,textTransform:"uppercase"}}>{n.label}</span></button>))}
            </div>
          );
        })()}
      </div>
    </>
  );
}
