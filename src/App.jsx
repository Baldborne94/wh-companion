import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { supabase, signOut } from "./lib/supabase";
import { sb } from "./lib/sb";
import { resolveBookUrl } from "./lib/openBook";
import { useLang } from "./lib/i18n.jsx";
import { useMusicPlayer } from "./lib/useMusicPlayer";
import { useBookStatuses } from "./lib/useBookStatuses";
import { C } from "./data/constants";
import { BOOKS } from "./data/books";
import MusicPlayer from "./components/MusicPlayer";
import MiniPlayer from "./components/MiniPlayer";
import LoginPage from "./components/LoginPage";
import UniverseSelector from "./components/UniverseSelector";
import { AOS, AOS_BOOKS } from "./data/aosBooks";
import ErrorBoundary from "./components/ErrorBoundary";
import { shouldShowReleaseReminder, dismissReleaseReminder } from "./data/releases";
import { saveUnlockedIds } from "./lib/achievements";

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

// Neutral loading splash for returning users while the auth session resolves —
// matches the target universe's background so we don't flash the login/landing
// page ("as if accessing for the first time") on every cold start.
function AppSplash({ universe }){
  const bg=universe==='aos'?AOS.bg:C.bg;
  const accent=universe==='aos'?AOS.gold:C.gold;
  return(
    <>
      <style>{`@keyframes appSplashSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <div style={{position:"fixed",inset:0,background:bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:40,height:40,borderRadius:"50%",border:`2px solid ${accent}22`,borderTopColor:accent,animation:"appSplashSpin 1s linear infinite"}}/>
      </div>
    </>
  );
}

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

  const { musicRef, nowPlaying, setNowPlaying, musicPaused, setMusicPaused, toggleMusicPause } = useMusicPlayer();
  const { statuses, aosStatuses, updateStatus, updateAoSStatus, unlockedIds, setUnlockedIds, pendingAchievements, setPendingAchievements } = useBookStatuses({ userId: user?.id });

  const [showStats,  setShowStats]  = useState(false);
  const [showBackup, setShowBackup] = useState(false);

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

  const [section,setSection]=useState("home");
  // Newcomer "where to start" CTA on Home routes into the reading section's
  // starter tab (40K: Getting Started · AoS: the guide). Consumed once on arrival.
  const [readingInitialTab,setReadingInitialTab]=useState(null);
  const startGuide=useCallback(()=>{ setReadingInitialTab(universe==='aos'?'guide':'start'); setSection('reading'); },[universe]);
  const mainRef=useRef(null);
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
  // Returning user (app already started): show a neutral splash — not the login
  // page — while the session resolves, so it doesn't look like a first access.
  if(authLoading) return <AppSplash universe={universe}/>;
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
      <div style={{display:"flex",flexDirection:"column",height:"100%",maxWidth:1600,margin:"0 auto",background:universe==='aos'?AOS.bg:C.bg}}>
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
              <button onClick={()=>selectUniverse(null)} title={t("header.switchUniverse")} aria-label="Switch universe" style={{background:"transparent",border:"none",cursor:"pointer",padding:"0 8px 0 0",color:hMuted,fontSize:18,lineHeight:1,flexShrink:0}}>‹</button>
              <button onClick={()=>setSection("home")} style={{background:"transparent",border:"none",cursor:"pointer",padding:0,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
                <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:universe==='aos'?10:13,fontWeight:900,color:hText,letterSpacing:2,lineHeight:1}}>{hLabel}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:7,color:hGoldDim,letterSpacing:4,textTransform:"uppercase"}}>{t("header.companion")}</div>
              </button>
              <div style={{flex:1,textAlign:"center"}}>
                {section!=="home"&&<span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:hGoldDim,letterSpacing:3,textTransform:"uppercase"}}>{curNavLabel}</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                {nowPlaying&&section!=="music"&&!appReader&&(
                  <MiniPlayer nowPlaying={nowPlaying} musicPaused={musicPaused} mutedColor={hMuted}
                    onOpen={()=>setSection("music")} onTogglePause={toggleMusicPause}
                    onStop={()=>{musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}}/>
                )}
                <button onClick={()=>setShowStats(true)} title={t("header.achievements")} aria-label="Achievements and stats"
                  style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hGold,padding:"4px 8px",fontSize:14,lineHeight:1,cursor:"pointer"}}>🏆</button>
                <button onClick={()=>setShowBackup(true)} title={t("header.backup")}
                  style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hGold,padding:"4px 8px",fontSize:14,lineHeight:1,cursor:"pointer"}}>💾</button>
                <button onClick={toggleLang} title={t("language.toggle")}
                  style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hGold,padding:"4px 7px",fontFamily:"'Cinzel',serif",fontSize:9,fontWeight:700,letterSpacing:1,lineHeight:1,cursor:"pointer"}}>{lang.toUpperCase()}</button>
                <button onClick={handleLogout} title={t("header.logout")} aria-label={t("header.logout")} style={{background:"transparent",border:`1px solid ${hDim}`,borderRadius:6,color:hMuted,padding:"4px 8px",fontSize:14,lineHeight:1,cursor:"pointer"}}>⏻</button>
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
              {t("header.releaseReminder")}
            </div>
            <button onClick={()=>{dismissReleaseReminder();setShowReleaseReminder(false);}}
              style={{background:"transparent",border:`1px solid ${C.gold}55`,borderRadius:6,color:C.goldDim,padding:"4px 10px",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,cursor:"pointer",flexShrink:0}}>
              {t("header.releaseOk")}
            </button>
          </div>
        )}
        {/* ── CONTENT ── */}
        <div style={{flex:1,overflow:"hidden",position:"relative"}}>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",zIndex:section==="music"&&!appReader?2:0,pointerEvents:section==="music"&&!appReader?"auto":"none"}}>
            <MusicPlayer ref={musicRef} onNowPlaying={(v)=>{setNowPlaying(v);setMusicPaused(false);}}/>
          </div>
          {appReader&&(
            <div style={{position:"absolute",inset:0,zIndex:3,background:"#0f0e09"}}>
              <ErrorBoundary title="Could not open this book">
                <Suspense fallback={<div style={{position:"fixed",inset:0,background:"#0f0e09",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:48,animation:"spin 2s linear infinite"}}>⚙</div></div>}>
                  {appReader.fileType==="pdf"
                    ?<PdfReader arrayBuffer={appReader.arrayBuffer} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} onClose={()=>setAppReader(null)} nowPlaying={nowPlaying} musicPaused={musicPaused} onMusicClick={()=>{setAppReader(null);setSection("music");}} onStopMusic={()=>{musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}} onTogglePauseMusic={toggleMusicPause}/>
                    :<EpubReader arrayBuffer={appReader.arrayBuffer} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} initProgress={appReader.progress} initChapterIndex={appReader.chapterIndex} initPageIndex={appReader.pageIndex} onProgress={()=>{}} onClose={()=>setAppReader(null)} nowPlaying={nowPlaying} musicPaused={musicPaused} onMusicClick={()=>{setAppReader(null);setSection("music");}} onStopMusic={()=>{musicRef.current?.stop();setNowPlaying(null);setMusicPaused(false);}} onTogglePauseMusic={toggleMusicPause}/>
                  }
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
          {!appReader&&section!=="music"&&(
            <div ref={mainRef} style={{position:"absolute",inset:0,zIndex:1,overflowY:"auto",overscrollBehavior:"contain",background:universe==='aos'?AOS.bg:C.bg}}>
              <div key={section} className="section-fade">
              <ErrorBoundary>
                <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"50vh"}}><div style={{fontSize:34,color:C.goldDim,animation:"spin 1.4s linear infinite"}}>⚙</div></div>}>
                  {section==="home"    &&universe==='40k'&&<HomePage user={user} setSection={setSection} statuses={statuses} onOpenBook={openBook} onOpenDetail={openBookDetail} onShowHelp={()=>setShowOnboarding(true)} onStartGuide={startGuide}/>}
                  {section==="home"    &&universe==='aos'&&<AoSHomePage user={user} setSection={setSection} statuses={aosStatuses} onOpenBook={openBook} onOpenDetail={openBookDetail} onShowHelp={()=>setShowOnboarding(true)} onStartGuide={startGuide}/>}
                  {section==="library" &&universe==='40k'&&<LibrarySection user={user} statuses={statuses} onStatusChange={updateStatus} openDetailBook={pendingDetailBook} onDetailConsumed={()=>setPendingDetailBook(null)}/>}
                  {section==="library" &&universe==='aos'&&<AoSLibrarySection user={user} statuses={aosStatuses} onStatusChange={updateAoSStatus} openDetailBook={pendingDetailBook} onDetailConsumed={()=>setPendingDetailBook(null)}/>}
                  {section==="lore"    &&<LoreSection universe={universe}/>}
                  {section==="reading" &&universe==='40k'&&<ReadingSection user={user} statuses={statuses} onOpenBook={openBook} setSection={setSection} initialTab={readingInitialTab} onTabConsumed={()=>setReadingInitialTab(null)}/>}
                  {section==="reading" &&universe==='aos'&&<AoSCrusadeSection user={user} statuses={aosStatuses} initialTab={readingInitialTab} onTabConsumed={()=>setReadingInitialTab(null)}/>}
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
              {navItems.map(n=>(<button key={n.id} onClick={()=>setSection(n.id)} aria-label={n.label} aria-current={section===n.id?"page":undefined} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",padding:0,borderTop:`2px solid ${section===n.id?nGold:"transparent"}`,transition:"border-color 0.15s"}}><span aria-hidden="true" style={{fontSize:18,lineHeight:1}}>{n.icon}</span><span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,color:section===n.id?nGold:nMuted,textTransform:"uppercase"}}>{n.label}</span></button>))}
            </div>
          );
        })()}
      </div>
    </>
  );
}
