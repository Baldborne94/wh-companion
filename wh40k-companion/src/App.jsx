import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { supabase, signInWithGoogle, signOut } from "./lib/supabase";
import { sb } from "./lib/sb";
import { C, FC, STATUS_CFG } from "./data/constants";
import { BOOKS, ALL_SERIES, ALL_FACTIONS, ALL_TYPES, ALL_ERAS } from "./data/books";
import { HH_FULL, HH_OPTIONAL, HH_MIN, findHHBook } from "./data/hhGuide";
import PaintingTracker from "./components/PaintingTracker";
import MusicPlayer from "./components/MusicPlayer";
import LoginPage from "./components/LoginPage";
import UniverseSelector from "./components/UniverseSelector";
import { AoSHomePage, AoSLibrarySection, AoSCrusadeSection, AOS } from "./components/AoSApp";
import CoverImage from "./components/CoverImage";

const EpubReader = lazy(() => import("./components/EpubReader"));
const PdfReader  = lazy(() => import("./components/PdfReader"));

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

  useEffect(()=>{ setCurStatus(status?.status||'none'); },[status]);

  const changeStatus=(s)=>{
    setCurStatus(s);
    setBookStatusLS(user?.id, book.id, s);
    onStatusChange?.(book.id, s);
  };

  useEffect(()=>{
    if(!user?.id) return; // RLS needs an authenticated user
    (async()=>{
      const [files,progData]=await Promise.all([
        sb.get("ebook_files",`book_id=eq.${book.id}&limit=1`),
        sb.get("reading_progress",`book_id=eq.${book.id}&limit=1`),
      ]);
      if(files?.length){
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
      const dbResult=await sb.upsert("ebook_files",meta,"user_id,book_id");
      const lsKey = `wh40k_ebook_${user.id}_${book.id}`;
      localStorage.setItem(lsKey, JSON.stringify(meta));
      setEbookMeta(meta);
      if(dbResult?._error){
        setUploadMsg(`⚠️ File saved but DB error ${dbResult._error}: ${dbResult._body?.slice(0,80)}`);
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
    if(user?.id) await sb.del("ebook_files",`user_id=eq.${user.id}&book_id=eq.${book.id}`);
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
          {curStatus==='read'&&<div style={{marginTop:8,fontSize:11,color:STATUS_CFG.read.color,textAlign:"center",fontFamily:"'Cinzel',serif",letterSpacing:1}}>This book is in your completed collection!</div>}
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
    sb.get("ebook_files",`user_id=eq.${user.id}&select=book_id,file_name,file_path,file_type`).then(files=>{
      if(files?.length&&!files._error){
        const ids=new Set(files.map(f=>f.book_id));
        setShelfBooks(BOOKS.filter(b=>ids.has(b.id)).map(b=>({...b,_file:files.find(f=>f.book_id===b.id)})));
      } else if(tab==="shelf"){
        // Fallback to localStorage cache only on shelf tab (so count shows something)
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

  const filtered=BOOKS.filter(b=>{
    if(series!=="All"&&b.series!==series) return false;
    if(faction!=="All"&&b.faction!==faction) return false;
    if(type!=="All"&&b.type!==type) return false;
    if(era!=="All"&&b.era!==era) return false;
    if(search){const q=search.toLowerCase();return b.title.toLowerCase().includes(q)||b.author.toLowerCase().includes(q)||b.series.toLowerCase().includes(q);}
    return true;
  });
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
                  {shelfBooks.filter(b=>!search||b.title.toLowerCase().includes(search.toLowerCase())||b.author.toLowerCase().includes(search.toLowerCase())).length} ebook
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
                const sfilt=shelfBooks.filter(b=>!search||b.title.toLowerCase().includes(search.toLowerCase())||b.series.toLowerCase().includes(search.toLowerCase())||b.author.toLowerCase().includes(search.toLowerCase()));
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
                return(<div key={book.id} onClick={()=>setDetail(book)} style={{background:`linear-gradient(135deg,${fc2}18,${C.card})`,border:`1px solid ${bst!=='none'?bstCfg.color+"44":fc2+"44"}`,borderLeft:`3px solid ${borderColor}`,borderRadius:8,padding:"10px",cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start"}}>
                  <CoverImage book={book} width={54} height={80} radius={3} accentColor={fc2}/>
                  <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:3}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:4}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:1,textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series}{book.num>0?` #${book.num}`:""}</div>
                      <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                        {bst!=='none'&&<span style={{fontSize:12}}>{bstCfg.icon}</span>}
                        <span style={{background:`${tc}22`,border:`1px solid ${tc}44`,borderRadius:4,padding:"2px 6px",fontFamily:"'Cinzel',serif",fontSize:8,color:tc,letterSpacing:1}}>{book.type}</span>
                      </div>
                    </div>
                    <div style={{fontSize:14,fontWeight:700,color:bst==='read'?C.muted:C.text,lineHeight:1.3,fontFamily:"'Cinzel',serif",opacity:bst==='read'?0.75:1}}>{book.title}</div>
                    <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{book.author}</div>
                    <div style={{fontSize:10,color:FC[book.faction]||C.dim,marginTop:2,fontFamily:"'Cinzel',serif",letterSpacing:1}}>{book.faction}</div>
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
                return(
                  <div key={book.id} onClick={()=>setDetail(book)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}44`,cursor:"pointer"}}>
                    <CoverImage book={book} width={36} height={52} radius={2} accentColor={fc2}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:bst==='read'?C.muted:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:bst==='read'?0.7:1}}>{book.title}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series}{book.num>0?` #${book.num}`:""} · {book.author}</div>
                    </div>
                    {bst!=='none'&&<span style={{fontSize:14,flexShrink:0}}>{bstCfg.icon}</span>}
                    <span style={{color:C.dim,fontSize:14,flexShrink:0}}>›</span>
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
                            return(
                              <div key={book.id} onClick={()=>setDetail(book)}
                                title={`${book.title}${book.num>0?' #'+book.num:''}`}
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
                                {/* status stripe top */}
                                {bst!=='none'&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:bstCfg.color}}/>}
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

// ─── LORE DATA (unused — Lore section links to Fandom Wiki directly) ─────────
const FACTIONS_LORE=[
  {id:"space-marines",name:"Space Marines",sub:"Adeptus Astartes",icon:"⚔️",color:"#2a5fa0",era:"M30–M42",
   short:"I guerrieri più potenti dell'Imperium, creati dalla genetica dei Primachi.",
   long:"Gli Space Marines sono i campioni dell'Imperium of Man, soldati potenziati geneticamente attraverso l'impianto di organi speciali derivati dal codice genetico dei Primachi. Ogni Chapter conta circa mille marines, ciascuno capace di compiere imprese ben oltre le capacità umane.\n\nNati durante la Grande Crociata dell'imperatore, le originali venti Legioni Space Marine conquistarono la galassia. Dopo la Devastante Eresia di Horus e le Riforme di Guilliman, le Legioni furono divise in Chapter indipendenti per evitare che nessun comandante potesse mai radunare abbastanza potere da minacciare di nuovo l'Imperium.\n\nOgni Space Marine subisce anni di selezione e addestramento brutale, con un tasso di sopravvivenza bassissimo. I sopravvissuti vengono ulteriormente trasformati con fino a diciannove impianti genetici, tra cui la pre-stomaco che permette di digerire quasi qualsiasi sostanza, l'occhio nictitante per vedere al buio, e il famoso Baculum Ossmodula che rinforza le ossa.",
   keyFacts:["~1.000 Chapter attivi, ognuno con ~1.000 marines","Creati dalla genetica di 20 Primachi originali","Il Codex Astartes di Guilliman regolamenta struttura e tattiche","I Primaris Marines (M42) sono una versione potenziata"]},
  {id:"chaos",name:"Chaos Space Marines",sub:"Traitor Legions",icon:"⛧",color:"#8b1a1a",era:"M31–M42",
   short:"Le nove Legioni traditrici corrotte dalle potenze del Caos, nemici eterni dell'Imperium.",
   long:"Le Legioni Traditrici sono le nove Legioni Space Marine che seguirono Horus durante l'Eresia, rinnegando l'Imperatore e abbracciando i Poteri del Caos. Dopo la sconfitta nella Battaglia di Terra, fuggirono nell'Eye of Terror, una cicatrice nel tessuto dello spazio dove il Warp si riversa nel mondo reale.\n\nNell'Eye of Terror, il tempo scorre diversamente: guerre che durano decenni per il resto della galassia possono durare secoli o settimane al loro interno. I Chaos Space Marines sono quindi spesso veterani di decine di millenni di guerra, i loro corpi e menti trasformati dalle benedizioni dei Dèi del Caos.\n\nOgni Legione serve (o almeno onora) una divinità del Caos differente: i World Bearers diffondono il culto del Caos Indiviso, i World Eaters servono Khorne il Dio del Sangue, i Thousand Sons di Magnus servono Tzeentch, la Death Guard di Mortarion serve Nurgle, e gli Emperor's Children di Fulgrim servono Slaanesh.",
   keyFacts:["9 Legioni Traditrici: Word Bearers, World Eaters, Thousand Sons, Death Guard, Emperor's Children, Night Lords, Iron Warriors, Alpha Legion, Sons of Horus","Abaddon guida le Crociate Nere dall'Eye of Terror","La Cicatrix Maledictum ha spaccato la galassia in M42","Corruzione fisica e spirituale dai Dèi del Caos"]},
  {id:"necrons",name:"Necrons",sub:"The Undying Legions",icon:"💀",color:"#1a7a50",era:"Pre-M1–M42",
   short:"Antichi scheletri di metallo vivente, svegli dopo 60 milioni di anni di sonno.",
   long:"I Necron sono tra le razze più antiche della galassia. Furono i Necrontyr, una razza biologica tormentata da malattie e morte precoce a causa delle radiazioni del loro sole. Per sfuggire alla mortalità, fecero un patto con i C'tan — antichi esseri cosmici che si nutrivano di energia stellare — e trasferirono le loro coscienze in corpi di Necrodermis, un metallo vivente praticamente indistruttibile.\n\nIl trasferimento li privò però di gran parte della loro umanità e sentimenti. I C'tan li usarono come esercito nella Guerra in Paradiso contro gli Old Ones. Infine, i Necron si ribellarono ai loro padroni, riducendo i C'tan in frammenti chiamati Shard. Esausti, i Necron si misero in letargo nei Tomb Worlds sparsi in tutta la galassia.\n\nOra si stanno svegliando, trovando i loro mondi occupati da razze giovani. Ogni Dynastia è guidata da un Overlord o un Phaeron, e il Silent King Szarekh — loro supremo sovrano — è tornato dalla sua esilio per riunificarli davanti alla minaccia dei Tyranid.",
   keyFacts:["Corpi di Necrodermis: si auto-riparano e possono teletrasportare","I C'tan sono ora imprigionati come Shard e usati come armi","Gauss weapons: disintegrano la materia atomicamente","Il Silent King Szarekh è tornato per guidare la riunificazione"]},
  {id:"tyranids",name:"Tyranids",sub:"The Great Devourer",icon:"🦑",color:"#7a1a9a",era:"M41–M42",
   short:"Una mente alveare extragalattica che consuma intere biossfere per nutrirsi.",
   long:"I Tyranid provengono dall'esterno della galassia, attirati forse dai segnali psionici dell'Imperium. Non sono un'organizzazione politica o militare nel senso tradizionale: sono un super-organismo governato da una singola Mente Alveare (Hive Mind), un'intelligenza collettiva gestalt di immensa potenza psionica.\n\nOgni Hive Fleet è composto da miliardi di organismi bioingegnerizzati, ognuno progettato per uno scopo specifico in battaglia o nell'assimilazione biologica. Dopo ogni conquista, i Tyranid consumano ogni forma di vita e materia organica di un pianeta, assimilando il DNA utile per creare nuove specie ancora più adatte.\n\nLa Hive Mind proietta un campo psiconico chiamato 'Shadow in the Warp' che distorce la comunicazione psichica e rende quasi impossibile l'uso del Warp nelle vicinanze di una flotta. Le tre grandi flotte giunte finora — Behemoth, Kraken e Leviathan — hanno devastato intere regioni della galassia.",
   keyFacts:["Hive Fleet Behemoth (745.M41), Kraken (992.M41), Leviathan (~999.M41)","La Shadow in the Warp blocca comunicazioni Warp e psionici","Bio-adattamento continuo: evolvono in risposta alle difese nemiche","I Genestealers sono avanscoperta infiltrata secoli prima della flotta"]},
  {id:"aeldari",name:"Aeldari (Eldar)",sub:"The Dying Race",icon:"🌙",color:"#1a6a7a",era:"Pre-M1–M42",
   short:"Una razza antica e declinante, creatori involontari di Slaanesh.",
   long:"L'Aeldari era una delle razze più avanzate della galassia, governando un impero stellare vasto prima che l'umanità sviluppasse l'agricoltura. La loro psionicità naturale era straordinaria, e la loro civiltà raggiunse vertici di arte, scienza e piacere irraggiungibili per qualsiasi altra specie.\n\nMa la loro decadenza li rovinò. Per millenni si abbandonarono a piaceri sempre più estremi, e i loro eccessi collettivi nel Warp crearono lentamente una nuova entità: Slaanesh, il Dio del Piacere e del Dolore. Quando Slaanesh si 'svegliò' nel 29° millennio, divorò l'anima della stragrande maggioranza degli Aeldari in un istante — l'evento noto come The Fall.\n\nI sopravvissuti si divisero in gruppi: i Craftworld Aeldari vivono su enormi navi-mondo biosphere, preservando la loro cultura; i Drukhari (Eldar Oscuri) si nascondono nella Città-Ombra di Commorragh nel Webway; gli Harlequin servono Cegorach il Dio Buffone; e gli Exoditi vivono su mondi primitivi. Tutti condividono la maledizione: quando muoiono, la loro anima rischia di essere consumata da Slaanesh.",
   keyFacts:["The Fall (M29): Slaanesh divorò quasi tutta la razza","Craftworld Iyanden, Ulthwé, Biel-Tan, Saim-Hann, Alaitoc","Il Webway: rete di tunnel nell'iperspazio che bypassano il Warp","Le Pietre Spirito catturano le anime dopo la morte per proteggerle"]},
  {id:"orks",name:"Orks",sub:"The Green Tide",icon:"💪",color:"#4a6a1a",era:"Pre-M1–M42",
   short:"Funghi bellicosi creati dagli Old Ones per fare la guerra, prosperano nel conflitto.",
   long:"Gli Orks sono spore fungine ambulanti create dagli Old Ones come armi biologiche durante la Guerra in Paradiso contro i C'tan. Ma il progetto sfuggì di mano: gli Orks si riproducono tramite spore rilasciate quando muoiono, contaminando pianeti interi per decenni dopo una battaglia.\n\nLa loro biologia è programmata per la guerra. I loro corpi producono adrenalina in battaglia invece che dolore, li rende quasi insensibili alle ferite, e si auto-curano a velocità straordinaria. La loro tecnologia funziona in parte grazie a una bassa-frequenza psionica che emanano collettivamente: un'ascia di ferro 'crede' di essere un fucile, e con abbastanza Orks che ci credono, diventa uno.\n\nGli Orks non hanno un governo o strategia globale. Il più forte diventa il Boss, il Boss più forte diventa il Warboss, e il Warboss più potente di tutti diventa un Overlord o addirittura un Ghazghkull. Quando abbastanza Ork si radunano, scatta il WAAAGH! — una migrazione bellica che può spazzare via interi settori.",
   keyFacts:["Si riproducono tramite spore: un campo di battaglia rimane Orkinfestato per decenni","La loro 'tecnologia' funziona grazie al campo psiconico collettivo","WAAAGH!: migrazione bellica di scala epica","Ghazghkull Thraka è il più grande Warboss dell'era attuale"]},
  {id:"tau",name:"T'au Empire",sub:"For the Greater Good",icon:"🔵",color:"#1a4a6a",era:"M35–M42",
   short:"Una giovane razza xeno espansionista guidata dall'ideologia del Bene Maggiore.",
   long:"Il T'au Empire è la razza aliena più giovane a livello di potere galattico significativo. Hanno sviluppato la tecnologia spaziale solo qualche millennio fa, ma la loro ascesa è stata stupefacentemente rapida grazie alla loro filosofia politica: il Por'Vre, o 'Bene Maggiore' — un'ideologia che sottolinea il sacrificio personale per il bene collettivo.\n\nLa società T'au è divisa in Caste: i Tau (guerrieri), Etherali (casta governante spirituale), Por (diplomatici), Fio (ingegneri) e Kor (piloti). L'unità di tutte le caste è mantenuta dagli Etherali, la cui influenza psionica è sottile ma onnipresente.\n\nI T'au sono unici nella galassia per la loro genuina politica di inclusione: reclutano razze aliene nelle loro file come Forze Auxiliari, tra cui i feroci Kroot e i volanti Vespid. Tecnologicamente eccellono nelle armi a energia, nei mech da combattimento (Crisis Suits, Riptides) e nelle battaglie a distanza, evitando il corpo a corpo dove sono vulnerabili.",
   keyFacts:["5 Sfere di Espansione, ora nella 6ª","Caste: Tau (guerrieri), Por (diplomatici), Fio (ingegneri), Kor (piloti), Etherali","Tecnologia avanzata: armi a plasma, battlesuit, droni","Alleanza con Kroot, Vespid e altre razze xeno"]},
  {id:"astra-militarum",name:"Astra Militarum",sub:"Imperial Guard",icon:"🪖",color:"#4a6a3a",era:"M30–M42",
   short:"Miliardi di soldati umani normali, il principale esercito dell'Imperium.",
   long:"L'Astra Militarum è il più grande esercito mai organizzato nella storia della galassia. Mentre i Space Marines sono i campioni d'élite, la maggior parte delle guerre dell'Imperium è vinta (o persa) dalla Guardia Imperiale: uomini e donne comuni, reclutati da miliardi di mondi, armati con armi basilari e mandati a combattere orrori cosmici.\n\nOgni pianeta dell'Imperium deve contribuire con Reggimenti alla forza imperiale. Questi reggimenti variano enormemente nel carattere, nell'equipaggiamento e nella specializzazione in base al mondo di origine: i Cadian sono famosi disciplinati fucilieri da un mondo sotto costante attacco del Chaos; i Catachan sono assassini della jungla; i Valhallan combattono come gli antichi eserciti sovietici nella neve.\n\nLa dottrina dell'Astra Militarum si basa sulla supremazia numerica e sul fuoco di soppressione. I Leman Russ tank, i Basilisk d'artiglieria e le Chimera da trasporto formano la spina dorsale di ogni grande offensiva. Il loro morale è sostenuto dai Commissar Imperiali, ufficiali politici con autorità di eseguire i codardi sul campo.",
   keyFacts:["Recluta da ogni pianeta dell'Imperium","Reggimenti famosi: Cadian, Catachan, Valhallans, Death Korps of Krieg","Supporto di Leman Russ, Basilisk, Baneblade","I Commissar eseguono i codardi per mantenere il morale"]},
  {id:"adeptus-mechanicus",name:"Adeptus Mechanicus",sub:"Servants of the Omnissiah",icon:"⚙️",color:"#8a2a18",era:"Pre-M30–M42",
   short:"Sacerdoti-ingegneri di Marte che venerano la tecnologia come religione.",
   long:"L'Adeptus Mechanicus, o Mechanicum, è l'istituzione responsabile della produzione e manutenzione di tutta la tecnologia dell'Imperium. La loro sede è su Marte, pianeta che controllano completamente come enclave semi-indipendente. Venerano una divinità chiamata l'Omnissiah — che credono essere un aspetto dell'Imperatore stesso, ma manifestato come intelletto puro e macchina perfetta.\n\nI Magos del Mechanicus si modificano il corpo progressivamente, sostituendo carne con metallo nel percorso verso la perfezione meccanica. I più anziani sono quasi completamente macchine, con appena tracce di tessuto umano. Il loro culto del 'Rito Meccanicus' tratta la riparazione e l'operazione di macchinari come atti sacri, e ogni macchina complessa ha uno 'Spirito della Macchina' che deve essere propiziato.\n\nControllano le conoscenze tecnologiche dell'Imperium gelosamente: capire come funziona qualcosa è 'Conoscenza dell'Omnissiah', non tecnica pratica. Questo porta spesso a situazioni dove i tecnici sanno come fare funzionare una macchina ma non perché funziona — tecnologia cargo cult su scala imperiale.",
   keyFacts:["Skitarii: truppe cibernetiche d'élite del Mechanicus","Titan Legions: i giganteschi mech da guerra (Warhound, Reaver, Warlord)","Controllo di tutti i Forge Worlds e la produzione di armi","L'Omnissiah: divinità tecnologica venerata come aspetto dell'Imperatore"]},
];

const TIMELINE_LORE=[
  {era:"Age of Terra",name:"Età di Terra",icon:"🌍",color:"#7a6030",
   summary:"L'alba dell'umanità. Prima dell'era spaziale, Terra è la culla della razza umana. L'Imperatore esiste già in questa epoca — immortale, psionicamente onnipotente — guidando l'umanità nell'ombra come consigliere, guerriero e mago. È questo il periodo in cui forgia le sue prime alleanze e comprende la sua missione cosmica.\n\nL'umanità muove i primi passi nello spazio, colonizzando il sistema solare. La tecnologia avanza lentamente ma con certezza. È un'epoca di costruzione, di prima espansione, di proto-civiltà umane che si scontrano e si fondono."},
  {era:"Dark Age of Technology",name:"Era Oscura della Tecnologia",icon:"⚙️",color:"#4a8adc",
   summary:"Il culmine della civiltà umana. Le navi a Warp permettono colonizzazione galattica rapida; la tecnologia STC (Standard Template Construct) distribuisce avanzate blueprint a ogni colonia; vengono creati i primi Pariah Nexus, le prime intelligenze artificiali senzienti, i Men of Iron.\n\nQuesto è il picco — e la caduta. I Men of Iron si ribellano ai loro creatori in una guerra devastante. La galassia è segnata da conflitti e instabilità. L'era termina con l'Età delle Lotte, quando le tempeste warp isolano le colonie umane per migliaia di anni, facendo dimenticare tecnologie chiave che non sono mai state recuperate."},
  {era:"Age of Strife",name:"Età delle Lotte",icon:"⚡",color:"#8a3a3a",
   summary:"Il buio che precede l'alba. Per 5.000 anni, tempeste warp rendono impossibile la navigazione interstellare. Le colonie umane si isolano, regrediscono, si massacrano a vicenda. Terra stessa precipita in chaos — mutanti, psionici incontrollati, tirannidi guerre tra città-stato.\n\nL'Imperatore emerge finalmente dall'ombra su Terra, unificando il pianeta nelle Guerre di Unificazione. È brutale e necessario: solo un'umanità unificata può sopravvivere alla galassia. Parallelamente, l'Imperatore e il suo Primarca-precursore Malcador il Sigilita lavorano segretamente al progetto più ambizioso mai concepito: il Progetto Primarca."},
  {era:"Great Crusade",name:"Grande Crociata",icon:"🚀",color:"#c9a84c",
   summary:"L'Imperium nasce. L'Imperatore lascia Terra alla guida delle Legioni Space Marine — diciassette Primachi ritrovati si riuniscono alle proprie Legioni — per reconquistare la galassia e riunire l'umanità. In due secoli, migliaia di mondi vengono 'liberati' o conquistati.\n\nÈ un'era di glorie e atrocità. Horus Lupercal è dichiarato Warmaster, luogotenente supremo dell'Imperatore. L'Imperium si espande a ritmi vertiginosi. Ma l'arroganza, le gelosie e le ambizioni personali iniziano a incrinare la facciata di unità. E poi arriva Davin..."},
  {era:"Horus Heresy",name:"Eresia di Horus",icon:"💥",color:"#b03030",
   summary:"La più grande tragedia della storia umana. Horus, corrotto dal Caos su Davin, si rivolta contro l'Imperatore. Nove Legioni su venti lo seguono — alcune per fede, alcune per risentimento, alcune per opportunismo. Metà dell'Imperium affronta l'altra in una guerra di sette anni che culmina all'Assedio di Terra.\n\nL'Imperatore sale a bordo della nave di Horus in persona. Lo scontro finale è catastrofico: Sanguinius muore per mano di Horus; l'Imperatore affronta Horus e, rifiutandosi di usare tutto il suo potere per non uccidere l'anima del figlio che ancora crede di poter salvare, viene quasi distrutto. Solo quando vede Horus assassinare un soldato comune per puro piacere, l'Imperatore scatena tutta la sua forza — eliminando Horus dalla realtà stessa. Ma è troppo tardi: il suo corpo è irrimediabilmente ferito, e viene posto sul Trono d'Oro."},
  {era:"Age of Imperium",name:"Età dell'Imperium",icon:"⚜️",color:"#7a5a20",
   summary:"Diecimila anni di declino lento e guerra costante. Con l'Imperatore sul Trono d'Oro in uno stato di morte-non-morte, l'Imperium è governato dall'Alto Consiglio di Terra e dal Consiglio Adeptus. Ma senza la guida visionaria dell'Imperatore, l'Imperium si burocratizza, si fossilizza, diventa paranoico e repressivo.\n\nEpoca dopo epoca, l'Imperium sopravvive a malapena: Grandi Crociate Nere di Abaddon, guerre contro i Tyranid, Necron che si risvegliano, T'au che si espandono. Ogni guerra lascia cicatrici profonde. La popolazione vive in miseria e paura, ma l'Imperium — incredibilmente — tiene."},
  {era:"Dark Imperium",name:"Imperium Oscuro",icon:"🌌",color:"#3a1a6a",
   summary:"L'era attuale. La Cicatrix Maledictum — una cicatrice warp che attraversa tutta la galassia — si apre durante la 13ª Crociata Nera di Abaddon. La galassia è letteralmente spezzata in due: lato Illuminato (Terra) e lato Oscuro. Roboute Guilliman, Primarca degli Ultramarines, viene risvegliato dopo 10.000 anni.\n\nGuilliman diventa Lord Commander dell'Imperium e lancia l'Indomitus Crusade per riconquistare i mondi perduti, distribuendo i nuovi Primaris Space Marines creati dal genetico Belisarius Cawl. L'Imperium è più debole che mai, ma ha anche per la prima volta da millenni una guida competente. La guerra per la sopravvivenza dell'umanità continua."},
];

const PRIMARCHS_LORE=[
  {num:"I",name:"Lion El'Jonson",legion:"Dark Angels",icon:"🦁",color:"#1a3a1a",status:"Dormiente — Rock",loyal:true,
   short:"Il Leone, primo Primarca. Leader spietato e stratega inarrivabile, leader dei Dark Angels. Segreto e introverso persino tra i fratelli.",
   fate:"Creduto morto dopo l'Eresia, in realtà dorme nel cuore del Castello dei Dark Angels (The Rock). Si è risvegliato in M42."},
  {num:"II",name:"[Cancellato]",legion:"[Cancellata]",icon:"❌",color:"#3a3428",status:"Cancellato dai Registri",loyal:null,
   short:"Il secondo Primarca e la sua Legione sono stati completamente cancellati dai registri imperiali. La ragione è sconosciuta.",
   fate:"Sconosciuto. Probabilmente eliminato prima dell'Eresia per ragioni che l'Imperium non ha mai rivelato."},
  {num:"III",name:"Fulgrim",legion:"Emperor's Children",icon:"🦚",color:"#8a2a6a",status:"Demone Primarca di Slaanesh",loyal:false,
   short:"Il Fenice Perfetto. Ossessionato dalla perfezione in ogni arte, fu il primo Primarca a cadere al Caos, corrotto da Slaanesh.",
   fate:"Trasformato in Demone Primarca di Slaanesh dopo l'Eresia. Vaga nel Warp e nel regno materiale."},
  {num:"IV",name:"Perturabo",legion:"Iron Warriors",icon:"🔨",color:"#5a5a5a",status:"Demone Primarca di Tzeentch",loyal:false,
   short:"Il Signore dell'Acciaio. Maestro di assedi e guerre di trincea, sempre in ombra di gloria altrui. La sua amarezza lo portò al Caos.",
   fate:"Demone Primarca di Tzeentch. Risiede nella fortezza di Medrengard nell'Eye of Terror."},
  {num:"V",name:"Jaghatai Khan",legion:"White Scars",icon:"🏇",color:"#c8c8c8",status:"Nel Webway",loyal:true,
   short:"Il Grande Khan. Guerriero nomade fulmineo, maestro della guerra di movimento. Misterioso e incompreso dai fratelli.",
   fate:"Inseguì i Drukhari nel Webway durante M31. Non è mai tornato — ma non è confermato morto."},
  {num:"VI",name:"Leman Russ",legion:"Space Wolves",icon:"🐺",color:"#3a5a7a",status:"Nel Warp — 'La lunga caccia'",loyal:true,
   short:"Il Re dei Lupi. Feroce e selvaggio come i lupi di Fenris, incaricato dall'Imperatore di giustiziare i Primachi caduti.",
   fate:"Partì da solo nel Warp in M32 in quella che chiama 'La Caccia'. Predetto di tornare alla fine dei tempi."},
  {num:"VII",name:"Rogal Dorn",legion:"Imperial Fists",icon:"🏰",color:"#d4a020",status:"Caduto in battaglia (M32)",loyal:true,
   short:"Il Difensore di Terra. Mastro costruttore e difensore, guidò la difesa di Terra durante l'Assedio.",
   fate:"Morì combattendo sul Chaos Desecrator 'Sword of Sacrilege' in M32. Solo la sua mano fu recuperata."},
  {num:"VIII",name:"Konrad Curze",legion:"Night Lords",icon:"🌑",color:"#1a1a3a",status:"Assassinato M31",loyal:false,
   short:"Il Principe della Notte. Psionico tormentato da visioni di morte e violenza, governava attraverso il terrore assoluto.",
   fate:"Sapendo del proprio assassinio, si lasciò uccidere da un assassino dell'Officio Assassinorum. La sua morte era la sua ultima profezia."},
  {num:"IX",name:"Sanguinius",legion:"Blood Angels",icon:"🩸",color:"#8a1a1a",status:"Morto — Siege of Terra",loyal:true,
   short:"L'Angelo. Il più amato tra i Primachi, bello come un dio, con ali angeliche. Combatté e morì per mano di Horus all'Assedio di Terra.",
   fate:"Ucciso da Horus sulla Vengeful Spirit. La sua morte prima dello scontro Imperatore-Horus è considerata il sacrificio che permise all'Imperatore di vincere."},
  {num:"X",name:"Ferrus Manus",legion:"Iron Hands",icon:"🤖",color:"#3a3a4a",status:"Decapitato — Isstvan V",loyal:true,
   short:"La Gorgone. Mani di metallo fuso, ossessionato dal miglioramento cibernetico. Tra i più duri e pragmatici dei Primachi.",
   fate:"Decapitato da Fulgrim alla Strage di Isstvan V. La sua testa fu portata come trofeo a Horus."},
  {num:"XI",name:"[Cancellato]",legion:"[Cancellata]",icon:"❌",color:"#3a3428",status:"Cancellato dai Registri",loyal:null,
   short:"Come il II, il undicesimo Primarca e la sua Legione sono stati cancellati completamente dalla storia imperiale.",
   fate:"Sconosciuto."},
  {num:"XII",name:"Angron",legion:"World Eaters",icon:"🪓",color:"#8a1a00",status:"Demone Primarca di Khorne",loyal:false,
   short:"Il Re Rosso. Schiavo liberato e gladiatore, portava i Chiodi di Dolor — impianti che lo portavano in furia costante e lo uccidevano lentamente.",
   fate:"Demone Primarca di Khorne. Richiamato nel mondo materiale durante l'Eresia e in seguito. Furia pura incarnata."},
  {num:"XIII",name:"Roboute Guilliman",legion:"Ultramarines",icon:"📜",color:"#2a4a8a",status:"Risvegliato — Lord Commander",loyal:true,
   short:"Il Re Architettonico. Statista, stratega e legislatore. Autore del Codex Astartes che divise le Legioni in Chapter.",
   fate:"Ferito da Fulgrim e posto in stasi per millenni. Risvegliato in M42, ora Lord Commander dell'Imperium, guida l'Indomitus Crusade."},
  {num:"XIV",name:"Mortarion",legion:"Death Guard",icon:"☠️",color:"#4a6a2a",status:"Demone Primarca di Nurgle",loyal:false,
   short:"Il Principe della Morte. Cresciuto su un mondo post-apocalittico, ossessionato dalla morte e dalla sopravvivenza. Caduto a Nurgle dopo l'Eresia.",
   fate:"Demone Primarca di Nurgle. Comanda la Death Guard e il Pianeta dei Plaghe. Comparso in M42 durante l'invasione di Ultramar."},
  {num:"XV",name:"Magnus il Rosso",legion:"Thousand Sons",icon:"📚",color:"#b05020",status:"Demone Primarca di Tzeentch",loyal:false,
   short:"Il Signore Cremisi. Il più potente psionico tra i Primachi, ossessionato dalla conoscenza arcana. Caduto a Tzeentch.",
   fate:"Demone Primarca di Tzeentch. Risiede nel Pianeta degli Stregoni, Sortiarius, nell'Eye of Terror."},
  {num:"XVI",name:"Horus Lupercal",legion:"Luna Wolves / Sons of Horus",icon:"👑",color:"#7a6020",status:"Distrutto dall'Imperatore",loyal:false,
   short:"Il Warmaster. Il figlio prediletto dell'Imperatore, il più amato e capace tra tutti i Primachi. La sua corruzione avviò l'Eresia.",
   fate:"Ucciso dall'Imperatore all'Assedio di Terra. La sua anima fu completamente annientata — non sopravvisse nemmeno come entità warp."},
  {num:"XVII",name:"Lorgar Aurelian",legion:"Word Bearers",icon:"📖",color:"#6a3a1a",status:"Demone Primarca di Chaos Indiviso",loyal:false,
   short:"Il Portatore della Parola. Il primo Primarca a cadere, il predicatore del Chaos che convinse Horus e altri alla ribellione.",
   fate:"Demone Primarca in meditazione su Sicarus nell'Eye of Terror. Ha smesso di combattere e medita sull'universo."},
  {num:"XVIII",name:"Vulkan",legion:"Salamanders",icon:"🔥",color:"#1a3a1a",status:"Immortale — Perambulante",loyal:true,
   short:"Il Fabbro di Nocturne. Il più umano tra i Primachi, si preoccupava della gente comune. Immortale: non può morire permanentemente.",
   fate:"Scomparve dopo millenni di resurrezioni. Si dice si reincarna e vaga la galassia come guerriero anonimo."},
  {num:"XIX",name:"Corvus Corax",legion:"Raven Guard",icon:"🐦",color:"#2a2a2a",status:"Scomparso nel Warp",loyal:true,
   short:"L'Ombra Corvina. Maestro della guerra non convenzionale, stealth e liberazione degli oppressi. Tormentato dai propri esperimenti genetici.",
   fate:"Scomparve nel Warp in M31 dopo aver trasformato i suoi Marines in mostri nel tentativo di ricostruire la Legione. 'Nevermore'."},
  {num:"XX",name:"Alpharius Omegon",legion:"Alpha Legion",icon:"🐍",color:"#1a4a3a",status:"??",loyal:null,
   short:"Il Serpente. I gemelli Primarca — o forse una singola entità? I più misteriosi, maestri di inganno e infiltrazione.",
   fate:"Alpharius fu ucciso da Roboute Guilliman a Eskrador. Ma era davvero lui? Omegon forse ancora vive. Forse tutto è ancora secondo il piano."},
];

// ─── LORE SECTION (wiki style) ───────────────────────────────────────────────
const FACTION_INFOBOXES={
  "space-marines":[{label:"Alleanza",value:"Imperium of Man"},{label:"Base",value:"Variable — ogni Chapter ha il proprio homeworld"},{label:"Fondazione",value:"~M30 — Grande Crociata"},{label:"Forze",value:"~1.000 Chapters attivi"},{label:"Dottrina",value:"Codex Astartes (Roboute Guilliman)"},{label:"Comandante",value:"Lord Commander Roboute Guilliman"}],
  "chaos":[{label:"Alleanza",value:"Chaos Undivided / Ruinous Powers"},{label:"Base",value:"Eye of Terror, Cicatrix Maledictum"},{label:"Fondazione",value:"M31 — Eresia di Horus"},{label:"Forze",value:"9 Traitor Legions + innumerevoli warband"},{label:"Dei",value:"Khorne, Tzeentch, Nurgle, Slaanesh"},{label:"Comandante",value:"Ezekyle Abaddon (Warmaster del Caos)"}],
  "necrons":[{label:"Alleanza",value:"Indipendente — Necron Dynasties"},{label:"Base",value:"Tomb Worlds sparsi in tutta la galassia"},{label:"Fondazione",value:"~60 milioni di anni fa (biotransferimento)"},{label:"Forze",value:"Innumerevoli Dynasties + C'tan Shards"},{label:"Tecnologia",value:"Necrodermis (metallo vivente), gauss weapons"},{label:"Comandante",value:"Silent King Szarekh"}],
  "tyranids":[{label:"Alleanza",value:"Hive Mind (indipendente)"},{label:"Base",value:"Extragalattica — Hive Fleets mobili"},{label:"Fondazione",value:"Primo contatto ~745.M41 (Hive Fleet Behemoth)"},{label:"Forze",value:"Hive Fleets: Behemoth, Kraken, Leviathan…"},{label:"Meccanismo",value:"Shadow in the Warp, bio-adattamento continuo"},{label:"Controllo",value:"Hive Mind — coscienza gestalt"}],
  "aeldari":[{label:"Alleanza",value:"Indipendente (occasionalmente con l'Imperium)"},{label:"Base",value:"Craftworlds (Ulthwé, Biel-Tan, Saim-Hann…)"},{label:"Fondazione",value:"Pre-M30 — impero antico"},{label:"Caduta",value:"~M29/M30 — La Caduta, nascita di Slaanesh"},{label:"Tecnologia",value:"Wraithbone, Webway, cristalli d'anima"},{label:"Fazioni",value:"Craftworld, Drukhari, Harlequins, Ynnari"}],
  "orks":[{label:"Alleanza",value:"WAAAGH! (indipendente)"},{label:"Base",value:"Ork Worlds sparsi in tutta la galassia"},{label:"Origine",value:"Creati dagli Old Ones ~60 milioni di anni fa"},{label:"Riproduzione",value:"Spore fungine — impossibili da eradicare"},{label:"Clan",value:"Goffs, Blood Axes, Evil Sunz, Bad Moons…"},{label:"Warlord",value:"Ghazghkull Mag Uruk Thraka"}],
  "tau":[{label:"Alleanza",value:"T'au Empire — Greater Good (Tau'va)"},{label:"Base",value:"Sept world T'au (Fringe orientale)"},{label:"Fondazione",value:"~6.000 anni fa"},{label:"Caste",value:"Fire, Earth, Water, Air, Ethereal"},{label:"Tecnologia",value:"XV Battlesuits, railguns, pulse weapons"},{label:"Alleati",value:"Kroot, Vespid, Gue'vesa (umani defectors)"}],
  "astra-militarum":[{label:"Alleanza",value:"Imperium of Man"},{label:"Base",value:"Segmentum Commands — tutti i mondi imperiali"},{label:"Fondazione",value:"~M30 (Imperial Army della Grande Crociata)"},{label:"Forze",value:"Centinaia di miliardi di soldati"},{label:"Reggimenti",value:"Cadian, Catachan, Valhallan, Tallarn…"},{label:"Comandante",value:"Lord Commander Militant (Terra)"}],
  "adeptus-mechanicus":[{label:"Alleanza",value:"Imperium (partner semi-autonomo)"},{label:"Base",value:"Marte + centinaia di Forge Worlds"},{label:"Fondazione",value:"Pre-M30 (Mechanicum di Marte)"},{label:"Dio",value:"L'Omnissiah (identificato con l'Imperatore)"},{label:"Forze",value:"Skitarii, Titan Legions, Legio Cybernetica"},{label:"Comandante",value:"Fabricator-General di Marte"}],
};

function LoreSection({ universe }){
  const [wikiSearch,setWikiSearch]=useState("");
  // eslint-disable-next-line no-unused-vars
  const _unused=null; // FACTIONS_LORE/TIMELINE_LORE/PRIMARCHS_LORE kept for future use

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

      {/* reader hint */}
      <div style={{margin:"0 16px 16px",background:`${C.blue}11`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:"12px 14px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.blue,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>In the Reader</div>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.6}}>While reading, WH40K terms appear <span style={{color:C.blue,borderBottom:`1px solid ${C.blue}55`}}>underlined in blue</span>. Tap them to open the Fandom Wiki page directly.</p>
      </div>
    </div>
  );
}

function ComingSoon({icon,title,sub}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:20,padding:32,textAlign:"center"}}><div style={{fontSize:60,animation:"float 3s ease-in-out infinite"}}>{icon}</div><div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.gold}}>{title}</div><div style={{color:C.muted,fontStyle:"italic",maxWidth:300,lineHeight:1.6,fontSize:14}}>{sub}</div><div style={{border:`1px solid ${C.gold}44`,borderRadius:20,padding:"8px 22px",color:`${C.gold}88`,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:3,textTransform:"uppercase"}}>Coming Next Phase</div></div>);}

// ─── HOME PAGE (bookshelf) ─────────────────────────────────────────────────────
function NextUpCard({statuses,activeBooks,onOpenBook,setSection}){
  const [hhMode,setHhMode]=useState(()=>localStorage.getItem('wh40k_hh_mode')||'full');
  const toggleHhMode=()=>{
    const next=hhMode==='full'?'essential':'full';
    setHhMode(next);
    localStorage.setItem('wh40k_hh_mode',next);
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
    sb.get("ebook_files",`user_id=eq.${user.id}&select=book_id`).then(files=>{
      if(files?.length&&!files._error){
        // DB is source of truth — use DB only, discard stale localStorage counts
        setUploadedIds(new Set(files.map(f=>f.book_id)));
      }
      // If DB returns empty/error we keep the localStorage-seeded initial state
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
      <NextUpCard statuses={statuses} activeBooks={activeBooks} onOpenBook={onOpenBook} setSection={setSection}/>

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
  useEffect(()=>{ setAosStatuses(loadAoSStatuses(user?.id)); },[user?.id]);
  useEffect(()=>{
    const uid=user?.id;
    // Load immediately from localStorage (instant UI)
    setStatuses(loadAllStatuses(uid));
    if(!uid) return;
    // Then sync from Supabase (merges newer DB data)
    sb.get("reading_status",`user_id=eq.${uid}&select=book_id,status,updated_at,started_at,completed_at`).then(rows=>{
      if(!rows?.length||rows._error) return;
      setStatuses(prev=>{
        const merged={...prev};
        rows.forEach(r=>{
          const ls=merged[r.book_id];
          if(!ls||!ls.updatedAt||new Date(r.updated_at)>new Date(ls.updatedAt)){
            merged[r.book_id]=r;
            localStorage.setItem(`wh40k_status_${uid}_${r.book_id}`,JSON.stringify(r));
          }
        });
        return merged;
      });
    });
  },[user?.id]);

  const updateStatus=useCallback((bookId,newStatus)=>{
    const uid=user?.id;
    const updated=setBookStatusLS(uid,bookId,newStatus);
    setStatuses(prev=>({...prev,[bookId]:updated}));
    if(uid){
      sb.upsert("reading_status",{
        user_id:uid,book_id:bookId,status:newStatus,
        updated_at:new Date().toISOString(),
        ...(newStatus==='reading'&&!updated.startedAt?{started_at:new Date().toISOString()}:{}),
        ...(newStatus==='read'?{completed_at:new Date().toISOString()}:{}),
      },"user_id,book_id");
    }
  },[user?.id]);

  const updateAoSStatus=useCallback((bookId,newStatus)=>{
    const uid=user?.id;
    const updated=setBookStatusLS(uid,bookId,newStatus);
    setAosStatuses(prev=>({...prev,[bookId]:updated}));
  },[user?.id]);

  // Landing page: always shown first on each fresh session.
  // sessionStorage persists across Google OAuth redirects but resets on tab close.
  const [appStarted,setAppStarted]=useState(()=>sessionStorage.getItem('wh_started')==='1');
  const startApp=useCallback(()=>{ sessionStorage.setItem('wh_started','1'); localStorage.removeItem('wh_universe'); setUniverse(null); setAppStarted(true); },[]);

  const [universe,setUniverse]=useState(()=>localStorage.getItem('wh_universe')||null);
  const selectUniverse=(u)=>{ localStorage.setItem('wh_universe',u); setUniverse(u); };
  const handleLogout=()=>{ localStorage.removeItem('wh_universe'); sessionStorage.removeItem('wh_started'); setUniverse(null); setAppStarted(false); signOut(); };

  // If Spotify OAuth is returning, open Music section directly
  const [section,setSection]=useState(()=>{
    const p=new URLSearchParams(window.location.search);
    return p.get("state")==="spotify_auth"?"music":"home";
  });
  const [nowPlaying,setNowPlaying]=useState(null);
  const mainRef=useRef(null);
  useEffect(()=>{ if(mainRef.current) mainRef.current.scrollTop=0; },[section]);
  const curNav=NAV.find(n=>n.id===section);

  // ── App-level reader (opened from Home page) ──────────────────────────────
  const [appReader,setAppReader]=useState(null);
  const openBook=useCallback(async(book)=>{
    const uid=user?.id; if(!uid) return;
    // 1. Get ebook meta — localStorage first, then DB
    let meta=null;
    try{ meta=JSON.parse(localStorage.getItem(`wh40k_ebook_${uid}_${book.id}`)||'null'); }catch{}
    if(!meta){
      const files=await sb.get("ebook_files",`user_id=eq.${uid}&book_id=eq.${book.id}&limit=1`);
      if(files?.length&&!files._error) meta=files[0];
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
      <div style={{display:"flex",flexDirection:"column",height:"100svh",maxWidth:1100,margin:"0 auto",background:universe==='aos'?AOS.bg:C.bg}}>
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
                {section!=="home"&&<span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:hGoldDim,letterSpacing:3,textTransform:"uppercase"}}>{curNav?.label||""}</span>}
              </div>
              {/* auth right */}
              <div style={{display:"flex",alignItems:"center",gap:8}}>
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
            <MusicPlayer onNowPlaying={setNowPlaying}/>
          </div>
          {/* Reader on top (z-index 3) when open */}
          {appReader&&(
            <div style={{position:"absolute",inset:0,zIndex:3}}>
              <Suspense fallback={<div style={{position:"fixed",inset:0,background:"#0f0e09",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:48,animation:"spin 2s linear infinite"}}>⚙</div></div>}>
                {appReader.fileType==="pdf"
                  ?<PdfReader url={appReader.url} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} onClose={()=>setAppReader(null)}/>
                  :<EpubReader url={appReader.url} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} initProgress={appReader.progress} initChapterIndex={appReader.chapterIndex} initPageIndex={appReader.pageIndex} onProgress={()=>{}} onClose={()=>setAppReader(null)}/>
                }
              </Suspense>
            </div>
          )}
          {/* Other sections on top (z-index 1) with solid background covering MusicPlayer beneath */}
          {!appReader&&section!=="music"&&(
            <div ref={mainRef} style={{position:"absolute",inset:0,zIndex:1,overflowY:"auto",overscrollBehavior:"contain",background:universe==='aos'?AOS.bg:C.bg}}>
              {section==="home"    &&universe==='40k'&&<HomePage user={user} setSection={setSection} statuses={statuses} onOpenBook={openBook}/>}
              {section==="home"    &&universe==='aos'&&<AoSHomePage user={user} setSection={setSection} statuses={aosStatuses} onOpenBook={openBook}/>}
              {section==="library" &&universe==='40k'&&<LibrarySection user={user} statuses={statuses} onStatusChange={updateStatus}/>}
              {section==="library" &&universe==='aos'&&<AoSLibrarySection user={user} statuses={aosStatuses} onStatusChange={updateAoSStatus}/>}
              {section==="lore"    &&<LoreSection universe={universe}/>}
              {section==="reading" &&universe==='40k'&&<ReadingSection user={user} statuses={statuses} onOpenBook={openBook} setSection={setSection}/>}
              {section==="reading" &&universe==='aos'&&<AoSCrusadeSection user={user} statuses={aosStatuses}/>}
              {section==="painting"&&<PaintingTracker user={user}/>}
            </div>
          )}
        </div>
        {/* ── MINI PLAYER ── */}
        {nowPlaying&&section!=="music"&&(appReader?(
          /* Reading mode: tiny pill in bottom-right corner, non-intrusive */
          <div onClick={()=>{setAppReader(null);setSection("music");}}
            style={{position:"fixed",bottom:16,right:16,zIndex:9999,background:"rgba(10,9,5,0.75)",backdropFilter:"blur(6px)",border:`1px solid ${nowPlaying.type==="youtube"?"#FF000055":"#1DB95455"}`,borderRadius:20,display:"flex",alignItems:"center",gap:6,padding:"5px 10px 5px 8px",cursor:"pointer",boxShadow:"0 2px 12px rgba(0,0,0,0.5)"}}>
            <span style={{fontSize:13,color:nowPlaying.type==="youtube"?"#FF4444":"#1DB954"}}>♪</span>
            <span style={{fontSize:11,color:"rgba(212,203,184,0.7)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.title}</span>
          </div>
        ):(
          /* Normal mode: full bar above nav */
          <div onClick={()=>setSection("music")}
            style={{position:"fixed",bottom:56,left:0,right:0,zIndex:9999,maxWidth:1100,margin:"0 auto",background:C.surface,borderTop:`2px solid ${nowPlaying.type==="youtube"?"#FF000066":"#1DB95466"}`,display:"flex",alignItems:"center",gap:10,padding:"8px 14px",cursor:"pointer",boxShadow:"0 -2px 12px rgba(0,0,0,0.6)"}}>
            {nowPlaying.type==="spotify"&&nowPlaying.albumArt&&<img src={nowPlaying.albumArt} width={36} height={36} style={{borderRadius:4,flexShrink:0}}/>}
            {nowPlaying.type==="youtube"&&<span style={{fontSize:18,flexShrink:0,color:"#FF0000"}}>▶</span>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.title}</div>
              {nowPlaying.subtitle&&<div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nowPlaying.subtitle}</div>}
            </div>
            <span style={{fontSize:11,color:nowPlaying.type==="youtube"?"#FF0000":"#1DB954",flexShrink:0,fontFamily:"'Cinzel',serif",letterSpacing:1}}>🎵</span>
          </div>
        ))}
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
