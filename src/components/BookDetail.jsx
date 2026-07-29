import { useState, useEffect, useRef } from "react";
import { supabase, signInWithGoogle } from "../lib/supabase";
import { sb } from "../lib/sb";
import { C, FC, STATUS_CFG } from "../data/constants";
import { AOS } from "../data/aosBooks";
import CoverImage from "./CoverImage";
import { getBookRating, setBookRatingLS, getBookNotes, setBookNotesLS, setBookStatusLS } from "../lib/bookStatus";
import { resolveBookUrl } from "../lib/openBook";
import { cacheHas, cacheRemove } from "../lib/ebookCache";
import { captureError } from "../lib/errorTracking";
import { useLang } from "../lib/i18n.jsx";

// Shared by BOTH universes: 40K passes nothing extra; AoS passes universe="aos"
// and an accent (its series spine colour). Palette keys are shape-identical.
export default function BookDetail({ book, user, onBack, onOpenReader, status, onStatusChange, onEbookUploaded, universe = "40k", accent }) {
  const { t, locale } = useLang();
  const P = universe === "aos" ? AOS : C;
  const fc = accent || FC[book.faction] || P.dim;
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
  const [isCached,      setIsCached]      = useState(false);

  useEffect(() => { setCurStatus(status?.status || 'none'); }, [status]);

  useEffect(() => {
    if (user?.id) cacheHas(user.id, book.id).then(setIsCached);
  }, [user?.id, book.id]);

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
    if (!user?.id) { setUploadMsg(t("library.detail.msg.signInToUpload")); return; }
    setUploading(true); setUploadMsg(t("library.detail.msg.uploadingToCloud"));
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
        if (insErr) {
          // This exact path surfaced the drifted ebook_files unique constraint —
          // report it so schema drift shows up in telemetry, not screenshots.
          captureError(new Error(`ebook upload DB error: ${insErr.message}`), { where: 'ebook-upload', bookId: book.id });
          setUploadMsg(`${t("library.detail.msg.savedLocallyDbError")}${insErr.message?.slice(0,80)}`);
        }
        else { setUploadMsg(t("library.detail.msg.uploadedSynced")); onEbookUploaded?.(); }
      } else { setUploadMsg(t("library.detail.msg.uploadedSynced")); onEbookUploaded?.(); }
    } else { setUploadMsg(t("library.detail.msg.uploadFailed")); }
    setUploading(false); setTimeout(() => setUploadMsg(""), 3000);
  };

  const handleOpenReader = async () => {
    if (!ebookMeta && !isCached) return;
    setUploadMsg(isCached ? t("library.detail.msg.openingFromCache") : t("library.detail.msg.downloadingSaving"));
    const result = await resolveBookUrl({ uid: user.id, book, supabase, sb });
    if (result.error) {
      setUploadMsg(result.error === 'offline_no_cache'
        ? t("library.detail.msg.offlineNoCache")
        : t("library.detail.msg.couldNotOpen"));
      return;
    }
    if (!isCached) setIsCached(true);
    setUploadMsg("");
    onOpenReader({ book, arrayBuffer: result.arrayBuffer, fileType: result.meta.file_type || 'epub', progress, chapterIndex, pageIndex });
  };

  const handleDeleteEbook = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 4000); return; }
    setDeleteConfirm(false);
    setUploadMsg(t("library.detail.msg.removing"));
    if (ebookMeta?.file_path) await sb.storage.remove(ebookMeta.file_path);
    if (user?.id) await supabase.from("ebook_files").delete().eq("user_id", user.id).eq("book_id", book.id);
    if (user?.id) { localStorage.removeItem(`wh40k_ebook_${user.id}_${book.id}`); cacheRemove(user.id, book.id); }
    setEbookMeta(null);
    setIsCached(false);
    setUploadMsg(t("library.detail.msg.ebookRemoved"));
    setTimeout(() => setUploadMsg(""), 2500);
  };

  return (
    <div style={{minHeight:"100%", background:P.bg}}>
      <div style={{position:"sticky",top:0,zIndex:10,background:P.surface,borderBottom:`1px solid ${P.border}`,height:52,display:"flex",alignItems:"center",padding:"0 16px",gap:12}}>
        <button onClick={onBack} style={{background:"transparent",border:`1px solid ${P.dim}`,borderRadius:8,color:P.gold,padding:"7px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:1}}>{t("library.detail.back")}</button>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:P.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series||book.type}{book.num>0?` #${book.num}`:""}</div>
      </div>
      <div style={{background:`linear-gradient(160deg,${fc}55,${P.card})`,borderBottom:`1px solid ${fc}66`,padding:"28px 20px 24px",display:"flex",gap:16,alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:P.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>{book.series||book.type}{book.num>0?` · ${t("library.detail.book")} ${book.num}`:""}</div>
          <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:"clamp(18px,5vw,26px)",color:P.text,lineHeight:1.2,marginBottom:6}}>{book.title}</h1>
          <div style={{color:P.muted,fontSize:14,fontStyle:"italic"}}>{t("library.detail.by")} {book.author}</div>
        </div>
        <CoverImage book={book} width={80} height={120} radius={5} accentColor={fc} style={{flexShrink:0,boxShadow:`0 4px 16px rgba(0,0,0,0.5)`}}/>
      </div>
      <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${[book.type,book.era,book.faction,(!book.era&&!book.faction)?book.series:null].filter(Boolean).length||1},1fr)`,gap:8}}>
          {[{l:t("library.detail.meta.type"),v:book.type},{l:t("library.detail.meta.era"),v:book.era},{l:t("library.detail.meta.faction"),v:book.faction},{l:t("library.detail.meta.series"),v:(!book.era&&!book.faction)?book.series:null}].filter(m=>m.v).map(m=>(
            <div key={m.l} style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:8,padding:"10px"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:P.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>{m.l}</div>
              <div style={{color:P.text,fontSize:12,lineHeight:1.2}}>{m.v}</div>
            </div>
          ))}
        </div>
        <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:10,padding:"12px 14px"}}>
          {book.desc && (
            <>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:P.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{t("library.detail.aboutTitle")}</div>
              <div style={{fontSize:12,color:P.muted,lineHeight:1.75,marginBottom:10}}>{book.desc}</div>
            </>
          )}
          <a href={`https://www.google.com/search?q=${encodeURIComponent('"'+book.title+'" site:blacklibrary.com')}`} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11,color:P.blue,textDecoration:"underline",fontFamily:"'Cinzel',serif",letterSpacing:1}}>
            {t("library.detail.findOnBlackLibrary")}
          </a>
        </div>
        <div style={{background:P.card,border:`2px solid ${(ebookMeta||isCached)?P.gold:P.border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{background:(ebookMeta||isCached)?`${P.gold}18`:P.surface,padding:"14px 16px",borderBottom:`1px solid ${(ebookMeta||isCached)?P.gold+"44":P.border}`,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>{(ebookMeta||isCached)?"📖":"📂"}</span>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:(ebookMeta||isCached)?P.gold:P.muted,fontWeight:700,letterSpacing:1}}>{ebookMeta?t("library.detail.ebookReady"):isCached?t("library.detail.availableOffline"):t("library.detail.noEbookLoaded")}</div>
                {isCached&&<div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:P.green,letterSpacing:1,background:`${P.green}18`,border:`1px solid ${P.green}44`,borderRadius:4,padding:"2px 6px"}}>{t("library.detail.offlineBadge")}</div>}
              </div>
              {ebookMeta&&<div style={{fontSize:11,color:P.goldDim,marginTop:1}}>{ebookMeta.file_name}</div>}
            </div>
          </div>
          <div style={{padding:"16px"}}>
            {!user?(
              <div style={{textAlign:"center",padding:"24px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
                <div style={{fontSize:36}}>🔐</div>
                <div style={{color:P.muted,fontSize:13,lineHeight:1.6,maxWidth:260}}>{t("library.detail.signInPrompt")}</div>
                <button onClick={signInWithGoogle} style={{background:`${P.gold}22`,border:`1px solid ${P.gold}`,borderRadius:8,padding:"10px 24px",color:P.gold,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>{t("library.detail.signInWithGoogle")}</button>
              </div>
            ):(ebookMeta||isCached)?(
              <>
                {progress>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:P.goldDim,letterSpacing:2,textTransform:"uppercase"}}>{t("library.detail.progress")}</span>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:P.gold}}>{Math.round(progress*100)}%</span>
                    </div>
                    <div style={{height:4,background:P.dim,borderRadius:2}}><div style={{height:"100%",width:`${progress*100}%`,background:`linear-gradient(to right,${P.gold},${universe==="aos"?P.blue:P.red})`,borderRadius:2}}/></div>
                  </div>
                )}
                {bookmarkInfo&&(
                  <div style={{marginBottom:12,background:P.surface,border:`1px solid ${P.border}`,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:16,flexShrink:0}}>📍</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:P.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:2}}>{t("library.detail.lastReadPosition")}</div>
                      <div style={{fontSize:12,color:P.text}}>{Math.round((bookmarkInfo.progress_pct||0)*100)}%{bookmarkInfo.chapter_index>0?` · ${t("library.detail.chapterAbbrev")} ${bookmarkInfo.chapter_index+1}`:""}</div>
                      {bookmarkInfo.bookmarkedAt&&<div style={{fontSize:10,color:P.muted,marginTop:1}}>{new Date(bookmarkInfo.bookmarkedAt).toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'})}</div>}
                    </div>
                  </div>
                )}
                {bookmarksList.length>0&&(
                  <div style={{marginBottom:12,background:P.surface,border:`1px solid ${P.gold}33`,borderRadius:8,overflow:"hidden"}}>
                    <div style={{padding:"8px 12px 6px",borderBottom:`1px solid ${P.border}`,display:"flex",alignItems:"center",gap:6}}>
                      <span>🔖</span>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:P.gold,letterSpacing:2,textTransform:"uppercase"}}>{t("library.detail.bookmarks")} ({bookmarksList.length})</span>
                    </div>
                    {bookmarksList.slice(0,5).map((bm,i)=>(
                      <div key={bm.id} style={{padding:"8px 12px",borderBottom:i<Math.min(bookmarksList.length,5)-1?`1px solid ${P.border}55`:"none",display:"flex",alignItems:"center",gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,color:P.text,fontFamily:"'Cinzel',serif"}}>{bm.label}</div>
                          <div style={{fontSize:10,color:P.muted}}>{bm.pct!=null?bm.pct:Math.round((bm.progress_pct||0)*100)}% · {new Date(bm.createdAt).toLocaleDateString(locale,{day:'numeric',month:'short'})}</div>
                        </div>
                      </div>
                    ))}
                    {bookmarksList.length>5&&<div style={{padding:"6px 12px",fontSize:10,color:P.muted,fontStyle:"italic"}}>+{bookmarksList.length-5} {t("library.detail.moreBookmarks")}</div>}
                  </div>
                )}
                {uploadMsg&&<div style={{color:uploadMsg.startsWith("❌")?P.red:P.gold,fontFamily:"'Cinzel',serif",fontSize:12,textAlign:"center",marginBottom:8}}>{uploadMsg}</div>}
                <button onClick={handleOpenReader} style={{width:"100%",padding:"16px",borderRadius:10,background:`linear-gradient(135deg,${P.gold},${P.goldDim})`,border:"none",color:P.bg,fontFamily:"'Cinzel',serif",fontSize:15,letterSpacing:3,textTransform:"uppercase",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                  {bookmarkInfo||progress>0?t("library.detail.continueReading"):ebookMeta?t("library.detail.startReading"):t("library.detail.openCachedBook")}
                </button>
                {ebookMeta?(
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    <button onClick={()=>inp.current.click()} style={{flex:1,padding:"10px",borderRadius:8,background:"transparent",border:`1px solid ${P.dim}`,color:P.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer"}}>{t("library.detail.replaceFile")}</button>
                    <button onClick={handleDeleteEbook} style={{flex:1,padding:"10px",borderRadius:8,background:deleteConfirm?`${P.red}22`:"transparent",border:`1px solid ${deleteConfirm?P.red:P.dim}`,color:deleteConfirm?P.red:P.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer",transition:"all 0.2s"}}>
                      {deleteConfirm?t("library.detail.confirmDelete"):t("library.detail.removeEbook")}
                    </button>
                  </div>
                ):(
                  <button onClick={()=>inp.current.click()} style={{marginTop:8,width:"100%",padding:"10px",borderRadius:8,background:"transparent",border:`1px solid ${P.dim}`,color:P.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer"}}>{t("library.detail.loadFromDevice")}</button>
                )}
              </>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{color:P.muted,fontSize:13,lineHeight:1.6}}>{t("library.detail.uploadIntro")}</div>
                <div style={{background:"#ffffff06",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:P.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{t("library.detail.readerFeatures")}</div>
                  <div style={{color:P.dim,fontSize:12,lineHeight:1.8}}>{t("library.detail.feature1")}<br/>{t("library.detail.feature2")}<br/>{t("library.detail.feature3")}<br/>{t("library.detail.feature4")}<br/>{t("library.detail.feature5")}<br/>{t("library.detail.feature6")}</div>
                </div>
                {(uploading||uploadMsg)&&<div style={{color:P.gold,fontFamily:"'Cinzel',serif",fontSize:12,textAlign:"center"}}>{uploadMsg||t("library.detail.msg.uploadingShort")}</div>}
                <button onClick={()=>inp.current.click()} disabled={uploading} style={{width:"100%",padding:"16px",borderRadius:10,background:"transparent",border:`2px dashed ${P.goldDim}`,color:P.gold,fontFamily:"'Cinzel',serif",fontSize:14,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:uploading?0.5:1}}>
                  {t("library.detail.loadEpubOrPdf")}
                </button>
              </div>
            )}
            <input ref={inp} type="file" accept=".epub,.pdf" style={{display:"none"}} onChange={handleFileSelect}/>
          </div>
        </div>
        <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:P.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>{t("library.detail.readingStatus")}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {['want','reading','read'].map(s=>{
              const cfg = STATUS_CFG[s]; const active = curStatus===s;
              return(
                <button key={s} onClick={()=>changeStatus(s)} style={{padding:"12px 4px",borderRadius:8,border:`1px solid ${active?cfg.color:P.dim}`,background:active?cfg.bg:"transparent",color:active?cfg.color:P.muted,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all 0.2s"}}>
                  <span style={{fontSize:20}}>{cfg.icon}</span>
                  {t(`library.detail.statusLabels.${s}`)}
                </button>
              );
            })}
          </div>
          {curStatus==='read'&&(
            <div style={{marginTop:12,display:"flex",justifyContent:"center",gap:4}}>
              {[1,2,3,4,5].map(i=>(
                <span key={i} onClick={()=>{setRating(i);setBookRatingLS(user?.id,book.id,i);}}
                  style={{fontSize:26,cursor:"pointer",color:i<=rating?P.gold:P.dim,transition:"color 0.15s",lineHeight:1}}>
                  ★
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:P.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>{t("library.detail.personalNotes")}</div>
          <textarea
            value={notes}
            onChange={e=>setNotes(e.target.value)}
            onBlur={()=>{setBookNotesLS(user?.id,book.id,notes);setNotesSaved(true);setTimeout(()=>setNotesSaved(false),1500);}}
            placeholder={t("library.detail.notesPlaceholder")}
            style={{width:"100%",minHeight:80,background:P.surface,border:`1px solid ${P.border}`,borderRadius:8,padding:"10px 12px",color:P.text,fontSize:12,fontFamily:"'Cinzel',serif",resize:"vertical",boxSizing:"border-box",outline:"none",lineHeight:1.5}}
          />
          {notesSaved&&<div style={{fontSize:10,color:P.green,marginTop:4,fontFamily:"'Cinzel',serif",letterSpacing:1}}>{t("library.detail.notesSaved")}</div>}
        </div>
      </div>
    </div>
  );
}
