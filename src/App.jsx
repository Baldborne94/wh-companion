import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { supabase, signOut } from "./lib/supabase";
import { sb } from "./lib/sb";
import { resolveBookUrl } from "./lib/openBook";
import { useLang } from "./lib/i18n.jsx";
import { C } from "./data/constants";
import { BOOKS } from "./data/books";
import MusicPlayer from "./components/MusicPlayer";
import LoginPage from "./components/LoginPage";
import UniverseSelector from "./components/UniverseSelector";
import { AOS, AOS_BOOKS } from "./data/aosBooks";
import ErrorBoundary from "./components/ErrorBoundary";
import { loadAllStatuses, loadAoSStatuses, setBookStatusLS } from "./lib/bookStatus";
import { shouldShowReleaseReminder, dismissReleaseReminder } from "./data/releases";
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
const BackupModal       = lazy(() => import("./components/BackupModal"));
const AchievementPopup  = lazy(() => import("./components/AchievementPopup"));
const OnboardingModal   = lazy(() => import("./components/OnboardingModal"));
const HomePage          = lazy(() => import("./components/HomePage"));
const LibrarySection    = lazy(() => import("./components/LibrarySection"));
const ReadingSection    = lazy(() => import("./components/ReadingSection"));
const LoreSection       = lazy(() => import("./components/LoreSection"));
const AoSHomePage       = lazy(() => import("./components/AoSApp").then(m => ({ default: m.AoSHomePage })));
const AoSLibrarySection = lazy(() => import("./components/AoSApp").then(m => ({ default: m.AoSLibrarySection })));
const AoSCrusadeSection = lazy(() => import("./components/AoSApp").then(m => ({ default: m.AoSCrusadeSection })));

const NAV=[{id:"home",icon:"🏛️",label:"Home"},{id:"library",icon:"📚",label:"Library"},{id:"lore",icon:"⚔️",label:"Lore"},{id:"reading",icon:"📖",label:"Crusade"},{id:"painting",icon:"🎨",label:"Painting"},{id:"music",icon:"🎵",label:"Music"}];

export default function App(){
  const { lang, toggle:toggleLang, t }=useLang();
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  useEffect(()=>{
    const timer = setTimeout(()=>setAuthLoading(false), 8000);
    supabase.auth.getSession()
      .then(({data:{session}})=>setUser(session?.user??null))
      .finally(()=>{ clearTimeout(timer); setAuthLoading(false); });
    // Don't clear the user if offline — a failed token refresh should not log the user out.
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{
      if(s?.user) setUser(s.user);
      else if(navigator.onLine) setUser(null);
    });
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
  const [showBackup,          setShowBackup]          = useState(false);

  useEffect(() => {
    if (!user?.id) { setUnlockedIds([]); setUnlockedIdsLoaded(false); didInitialAosCheck.current = false; return; }
    loadUnlockedIds(supabase, user.id).then(ids => { setUnlockedIds(ids); setUnlockedIdsLoaded(true); });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !unlockedIdsLoaded || didInitialAosCheck.current) return;
    didInitialAosCheck.current = true;
    const nowUnlocked = computeAoSReadingAchievements(aosStatuses, AOS_BOOKS);
    setUnlockedIds(prev => {
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

  // Onboarding — shown once on first launch, re-openable via ? button in Home
  const [showOnboarding,setShowOnboarding]=useState(false);

  // Landing page shown on first visit; auto-entered once user is authenticated.
  // appStarted persists in localStorage so the PWA re-enters directly when reopened offline.
  const [appStarted,setAppStarted]=useState(()=>
    sessionStorage.getItem('wh_started')==='1' || localStorage.getItem('wh_app_started')==='1'
  );
  // Auto-enter as soon as we know the user is authenticated.
  // This handles OAuth redirects where sessionStorage is lost (Custom Tab / new tab on tablet).
  useEffect(()=>{ if(user) setAppStarted(true); },[user]);
  const startApp=useCallback(()=>{
    sessionStorage.setItem('wh_started','1');
    localStorage.setItem('wh_app_started','1');
    sessionStorage.setItem('wh_fresh_login','1'); // tells the DB-restore effect to skip
    localStorage.removeItem('wh_universe');
    setUniverse(null);
    setAppStarted(true);
  },[]);

  const [universe,setUniverse]=useState(()=>localStorage.getItem('wh_universe')||null);

  // On a new device where localStorage has no universe, restore the saved preference from DB.
  // Skip when wh_fresh_login is set (user just clicked Start → they should see the selector).
  useEffect(()=>{
    if(!user?.id||localStorage.getItem('wh_universe')) return;
    if(sessionStorage.getItem('wh_fresh_login')==='1'){
      sessionStorage.removeItem('wh_fresh_login');
      return;
    }
    sb.get("user_settings",`user_id=eq.${user.id}&select=universe`).then(rows=>{
      if(!rows?.length||rows._error) return;
      const u=rows[0]?.universe;
      if(u){ localStorage.setItem('wh_universe',u); setUniverse(u); }
    });
  },[user?.id]);

  // Show onboarding the first time the app fully loads (after universe selection)
  useEffect(()=>{
    if(universe&&!localStorage.getItem('wh40k_onboarding_done')) setShowOnboarding(true);
  },[universe]);

  const selectUniverse=(u)=>{
    localStorage.setItem('wh_universe',u);
    setUniverse(u);
    if(user?.id) sb.upsert("user_settings",{user_id:user.id,universe:u,updated_at:new Date().toISOString()},"user_id");
  };
  const handleLogout=()=>{ localStorage.removeItem('wh_universe'); localStorage.removeItem('wh_app_started'); sessionStorage.removeItem('wh_started'); setUniverse(null); setAppStarted(false); signOut(); };

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
  const navLabel=(id)=>t(id==="reading"?(universe==='aos'?"nav.pathToGlory":"nav.crusade"):`nav.${id}`);
  const curNavLabel=curNav?navLabel(curNav.id):"";

  // ── App-level reader (opened from Home page) ──────────────────────────────
  const [appReader,setAppReader]=useState(null);
  const [pendingDetailBook,setPendingDetailBook]=useState(null);
  const openBookDetail=useCallback((book)=>{ setPendingDetailBook(book); setSection("library"); },[]);
  const openBook=useCallback(async(book)=>{
    const uid=user?.id; if(!uid) return;
    const result = await resolveBookUrl({ uid, book, supabase, sb });
    if(result.error){
      console.error("[openBook]", result.error, "book:", book.id);
      return result.error;
    }
    let progress=0,chapterIndex=0,pageIndex=0;
    try{
      const p=JSON.parse(localStorage.getItem(`wh40k_prog_${uid}_${book.id}`)||'null');
      if(p){ progress=p.progress_pct||0; chapterIndex=p.chapter_index||0; pageIndex=p.page_index||0; }
    }catch{}
    setAppReader({book, arrayBuffer:result.arrayBuffer, fileType:result.meta.file_type||'epub', progress, chapterIndex, pageIndex});
    return true;
  },[user?.id]);

  // ── Release reminder ─────────────────────────────────────────────────────
  const [showReleaseReminder, setShowReleaseReminder] = useState(() => shouldShowReleaseReminder());

  // ── Offline detection ─────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const go   = () => setIsOnline(true);
    const stop = () => setIsOnline(false);
    window.addEventListener('online',  go);
    window.addEventListener('offline', stop);
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', stop); };
  }, []);

  // ── Session refresh on foreground (tablet PWA: JS timers stop in background) ─
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') supabase.auth.refreshSession().catch(()=>{}); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if(!appStarted) return <LoginPage onEnter={startApp} user={user} authLoading={authLoading}/>;
  if(authLoading) return <LoginPage authLoading/>;
  if(!user) return <LoginPage/>;
  if(!universe) return <UniverseSelector onSelect={selectUniverse}/>;
  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700;900&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{height:100%;background:${universe==='aos'?AOS.bg:C.bg};color:${universe==='aos'?AOS.text:C.text};font-family:system-ui,-apple-system,sans-serif;}
        input,select,button{font-family:inherit;}
        button{touch-action:manipulation;}
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
              <button onClick={()=>selectUniverse(null)} title={t("header.switchUniverse")} style={{background:"transparent",border:"none",cursor:"pointer",padding:"0 8px 0 0",color:hMuted,fontSize:18,lineHeight:1,flexShrink:0}}>‹</button>
              <button onClick={()=>setSection("home")} style={{background:"transparent",border:"none",cursor:"pointer",padding:0,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
                <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:universe==='aos'?10:13,fontWeight:900,color:hText,letterSpacing:2,lineHeight:1}}>{hLabel}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:7,color:hGoldDim,letterSpacing:4,textTransform:"uppercase"}}>{t("header.companion")}</div>
              </button>
              <div style={{flex:1,textAlign:"center"}}>
                {section!=="home"&&<span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:hGoldDim,letterSpacing:3,textTransform:"uppercase"}}>{curNavLabel}</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {nowPlaying&&section!=="music"&&!appReader&&(<>
                  <button onClick={()=>setSection("music")} title={nowPlaying.title}
                    style={{background:"transparent",border:"none",cursor:"pointer",padding:"3px 2px",maxWidth:72,overflow:"hidden",flexShrink:0}}>
                    <span style={{fontSize:9,color:nowPlaying.type==="youtube"?"#FF4444":"#1DB954",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>
                      {nowPlaying.title}
                    </span>
                  </button>
                  <button onClick={toggleMusicPause} title={musicPaused?t("header.resume"):t("header.pause")}
                    style={{background:"transparent",border:"none",cursor:"pointer",color:nowPlaying.type==="youtube"?"#FF4444":"#1DB954",fontSize:13,lineHeight:1,padding:"3px 3px",flexShrink:0}}>
                    {musicPaused?"▶":"⏸"}
                  </button>
                  <button onClick={()=>{musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}} title={t("header.stopMusic")}
                    style={{background:"transparent",border:"none",cursor:"pointer",color:`${hMuted}99`,fontSize:14,lineHeight:1,padding:"3px 4px",flexShrink:0}}>
                    ✕
                  </button>
                </>)}
                <button onClick={()=>setShowStats(true)} title={t("header.achievements")}
                  style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hGold,padding:"4px 8px",fontSize:14,lineHeight:1,cursor:"pointer"}}>🏆</button>
                <button onClick={()=>setShowBackup(true)} title={t("header.backup")}
                  style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hGold,padding:"4px 8px",fontSize:14,lineHeight:1,cursor:"pointer"}}>💾</button>
                <button onClick={toggleLang} title={t("language.toggle")}
                  style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hGold,padding:"4px 7px",fontFamily:"'Cinzel',serif",fontSize:9,fontWeight:700,letterSpacing:1,lineHeight:1,cursor:"pointer"}}>{lang.toUpperCase()}</button>
                {user.user_metadata?.avatar_url&&<img src={user.user_metadata.avatar_url} alt="" style={{width:26,height:26,borderRadius:"50%",border:`1px solid ${hGold}55`}}/>}
                <button onClick={handleLogout} style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hMuted,padding:"4px 10px",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,cursor:"pointer"}}>{t("header.logout")}</button>
              </div>
            </div>
          );
        })()}
        {/* ── OFFLINE BANNER ── */}
        {!isOnline&&(
          <div style={{flexShrink:0,background:"#b0302299",borderBottom:"1px solid #ff444466",padding:"6px 16px",textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:11,color:"#ffaaaa",letterSpacing:1}}>
            📡 {t("header.offline")}
          </div>
        )}
        {/* ── RELEASE REMINDER ── */}
        {showReleaseReminder&&(
          <div style={{flexShrink:0,background:`${C.gold}18`,borderBottom:`1px solid ${C.gold}55`,padding:"8px 16px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16,flexShrink:0}}>📅</span>
            <div style={{flex:1,fontFamily:"'Cinzel',serif",fontSize:10,color:C.gold,letterSpacing:1}}>
              BL release list not updated in 6 months — ask Claude to update it!
            </div>
            <button onClick={()=>{dismissReleaseReminder();setShowReleaseReminder(false);}}
              style={{background:"transparent",border:`1px solid ${C.gold}55`,borderRadius:6,color:C.goldDim,padding:"4px 10px",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,cursor:"pointer",flexShrink:0}}>
              OK
            </button>
          </div>
        )}
        {/* ── CONTENT ── */}
        <div style={{flex:1,overflow:"hidden",position:"relative"}}>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",zIndex:section==="music"&&!appReader?2:0,pointerEvents:section==="music"&&!appReader?"auto":"none"}}>
            <MusicPlayer ref={musicRef} onNowPlaying={(v)=>{setNowPlaying(v);setMusicPaused(false);}}/>
          </div>
          {appReader&&(
            <div style={{position:"absolute",inset:0,zIndex:3}}>
              <Suspense fallback={<div style={{position:"fixed",inset:0,background:"#0f0e09",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:48,animation:"spin 2s linear infinite"}}>⚙</div></div>}>
                {appReader.fileType==="pdf"
                  ?<PdfReader arrayBuffer={appReader.arrayBuffer} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} onClose={()=>setAppReader(null)} nowPlaying={nowPlaying} musicPaused={musicPaused} onMusicClick={()=>{setAppReader(null);setSection("music");}} onStopMusic={()=>{musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}} onTogglePauseMusic={toggleMusicPause}/>
                  :<EpubReader arrayBuffer={appReader.arrayBuffer} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} initProgress={appReader.progress} initChapterIndex={appReader.chapterIndex} initPageIndex={appReader.pageIndex} onProgress={()=>{}} onClose={()=>setAppReader(null)} nowPlaying={nowPlaying} musicPaused={musicPaused} onMusicClick={()=>{setAppReader(null);setSection("music");}} onStopMusic={()=>{musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}} onTogglePauseMusic={toggleMusicPause}/>
                }
              </Suspense>
            </div>
          )}
          {!appReader&&section!=="music"&&(
            <div ref={mainRef} style={{position:"absolute",inset:0,zIndex:1,overflowY:"auto",overscrollBehavior:"contain",background:universe==='aos'?AOS.bg:C.bg}}>
              <div key={section} className="section-fade">
              <ErrorBoundary>
                <Suspense fallback={null}>
                  {section==="home"    &&universe==='40k'&&<HomePage user={user} setSection={setSection} statuses={statuses} onOpenBook={openBook} onOpenDetail={openBookDetail} onShowHelp={()=>setShowOnboarding(true)}/>}
                  {section==="home"    &&universe==='aos'&&<AoSHomePage user={user} setSection={setSection} statuses={aosStatuses} onOpenBook={openBook} onOpenDetail={openBookDetail} onShowHelp={()=>setShowOnboarding(true)}/>}
                  {section==="library" &&universe==='40k'&&<LibrarySection user={user} statuses={statuses} onStatusChange={updateStatus} openDetailBook={pendingDetailBook} onDetailConsumed={()=>setPendingDetailBook(null)}/>}
                  {section==="library" &&universe==='aos'&&<AoSLibrarySection user={user} statuses={aosStatuses} onStatusChange={updateAoSStatus} openDetailBook={pendingDetailBook} onDetailConsumed={()=>setPendingDetailBook(null)}/>}
                  {section==="lore"    &&<LoreSection universe={universe}/>}
                  {section==="reading" &&universe==='40k'&&<ReadingSection user={user} statuses={statuses} onOpenBook={openBook} setSection={setSection}/>}
                  {section==="reading" &&universe==='aos'&&<AoSCrusadeSection user={user} statuses={aosStatuses}/>}
                  {section==="painting"&&<PaintingTracker user={user} universe={universe}
                    onAchievement={defs=>setPendingAchievements(q=>[...q,...defs])}
                    unlockedIds={unlockedIds}
                    onUpdateUnlocked={merged=>{setUnlockedIds(merged);if(user?.id)saveUnlockedIds(supabase,user.id,merged);}}
                  />}
                </Suspense>
              </ErrorBoundary>
              </div>
            </div>
          )}
        </div>
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
        {/* ── ONBOARDING MODAL ── */}
        {showOnboarding&&(
          <Suspense fallback={null}>
            <OnboardingModal onClose={()=>{ setShowOnboarding(false); localStorage.setItem('wh40k_onboarding_done','1'); }}/>
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
        {/* ── BACKUP MODAL ── */}
        {showBackup&&(
          <Suspense fallback={null}>
            <BackupModal user={user} onClose={()=>setShowBackup(false)}/>
          </Suspense>
        )}
        {/* ── BOTTOM NAV ── */}
        {(()=>{
          const nBg=universe==='aos'?AOS.surface:C.surface;
          const nBorder=universe==='aos'?AOS.border:C.border;
          const nGold=universe==='aos'?AOS.gold:C.gold;
          const nMuted=universe==='aos'?AOS.muted:C.muted;
          const navItems=NAV.map(n=>({...n,label:navLabel(n.id)}));
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
