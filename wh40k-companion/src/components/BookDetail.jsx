import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { supabase, signInWithGoogle } from "../lib/supabase";
import { sb } from "../lib/sb";
import { C, FC, STATUS_CFG } from "../data/constants";
import CoverImage from "./CoverImage";
import { getBookRating, setBookRatingLS, getBookNotes, setBookNotesLS, setBookStatusLS } from "../lib/bookStatus";

const EpubReader = lazy(() => import("./EpubReader"));
const PdfReader  = lazy(() => import("./PdfReader"));

export default function BookDetail({ book, user, onBack, onOpenReader, status, onStatusChange }) {
  const fc = FC[book.faction] || C.dim;
  const inp = useRef(null);
  const [ebookMeta,    setEbookMeta]    = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadMsg,    setUploadMsg]    = useState("");
  const [curStatus,    setCurStatus]    = useState(status?.status || 'none');
  const [progress,     setProgress]     = useState(0);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [pageIndex,    setPageIndex]    = useState(0);
  const [bookmarkInfo, setBookmarkInfo] = useState(null);
  const [bookmarksList,setBookmarksList]= useState([]);
  const [rating,    setRating]    = useState(() => getBookRating(user?.id, book.id));
  const [notes,     setNotes]     = useState(() => getBookNotes(user?.id, book.id));
  const [notesSaved,setNotesSaved]= useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => { setCurStatus(status?.status || 'none'); }, [status]);

  const changeStatus = (s) => {
    setCurStatus(s);
    setBookStatusLS(user?.id, book.id, s);
    onStatusChange?.(book.id, s);
  };

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [filesRes, progData] = await Promise.all([
        supabase.from("ebook_files").select("*").eq("user_id", user.id).eq("book_id", book.id).limit(1),
        sb.get("reading_progress", `book_id=eq.${book.id}&limit=1`),
      ]);
      const files = filesRes.data || [];
      if (files.length) {
        setEbookMeta(files[0]);
      } else {
        const cached = localStorage.getItem(`wh40k_ebook_${user.id}_${book.id}`);
        if (cached) { try { setEbookMeta(JSON.parse(cached)); } catch {} }
      }
      if (progData?.length) {
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
      localStorage.setItem(`wh40k_ebook_${user.id}_${book.id}`, JSON.stringify(meta));
      setEbookMeta(meta);
      const { error:upsertErr } = await supabase.from("ebook_files").upsert(meta, { onConflict:"user_id,book_id" });
      if (upsertErr) {
        await supabase.from("ebook_files").delete().eq("user_id", user.id).eq("book_id", book.id);
        const { error:insErr } = await supabase.from("ebook_files").insert(meta);
        if (insErr) { setUploadMsg(`⚠️ File saved locally but DB error: ${insErr.message?.slice(0,80)}`); }
        else { setUploadMsg("✅ Uploaded & synced!"); }
      } else { setUploadMsg("✅ Uploaded & synced!"); }
    } else { setUploadMsg("❌ Upload failed — check Supabase storage policy."); }
    setUploading(false); setTimeout(() => setUploadMsg(""), 3000);
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
    if (user?.id) await supabase.from("ebook_files").delete().eq("user_id", user.id).eq("book_id", book.id);
    if (user?.id) localStorage.removeItem(`wh40k_ebook_${user.id}_${book.id}`);
    setEbookMeta(null);
    setUploadMsg("✅ Ebook removed.");
    setTimeout(() => setUploadMsg(""), 2500);
  };

  return (
    <div style={{minHeight:"100%", background:C.bg}}>
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
                {progress>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase"}}>Progress</span>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.gold}}>{Math.round(progress*100)}%</span>
                    </div>
                    <div style={{height:4,background:C.dim,borderRadius:2}}><div style={{height:"100%",width:`${progress*100}%`,background:`linear-gradient(to right,${C.gold},${C.red})`,borderRadius:2}}/></div>
                  </div>
                )}
                {bookmarkInfo&&(
                  <div style={{marginBottom:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:16,flexShrink:0}}>📍</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:2}}>Last read position</div>
                      <div style={{fontSize:12,color:C.text}}>{Math.round((bookmarkInfo.progress_pct||0)*100)}%{bookmarkInfo.chapter_index>0?` · Ch. ${bookmarkInfo.chapter_index+1}`:""}</div>
                      {bookmarkInfo.bookmarkedAt&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{new Date(bookmarkInfo.bookmarkedAt).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'})}</div>}
                    </div>
                  </div>
                )}
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
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>Reading Status</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {['want','reading','read'].map(s=>{
              const cfg = STATUS_CFG[s]; const active = curStatus===s;
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
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
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
