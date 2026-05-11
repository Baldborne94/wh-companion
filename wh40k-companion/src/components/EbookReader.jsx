import { useState, useEffect, useRef, useCallback } from "react";

const C = { bg:"#0f0d0a", surface:"#1a1814", text:"#d4cbb8", accent:"#c9a84c", muted:"#7a7060", border:"#2a2518" };
const THEMES = { dark:{bg:"#0f0d0a",text:"#d4cbb8"}, sepia:{bg:"#f4ede0",text:"#2c1f0e"}, light:{bg:"#fafafa",text:"#1a1a1a"} };

// Load epub.js dynamically — avoids race condition with CDN
function loadEpubJs() {
  return new Promise((resolve, reject) => {
    if(window.ePub) { resolve(); return; }
    const existing = document.querySelector('script[src*="epubjs"]');
    if(existing) { existing.addEventListener("load", resolve); existing.addEventListener("error", reject); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function useDictionary(){
  const[entry,setEntry]=useState(null);const[loading,setLoading]=useState(false);
  const lookup=useCallback(async(word)=>{
    const w=word.replace(/[^a-zA-Z'-]/g,"").toLowerCase();if(!w||w.length<2)return;
    setLoading(true);setEntry(null);
    try{const r=await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/"+w);
      if(!r.ok){setEntry({word:w,notFound:true});return;}
      const data=await r.json();const d=data[0];
      setEntry({word:d.word,phonetic:d.phonetic,meanings:d.meanings.slice(0,2).map(m=>({pos:m.partOfSpeech,defs:m.definitions.slice(0,2).map(x=>({def:x.definition,ex:x.example}))}))});
    }catch{setEntry({word:w,notFound:true});}finally{setLoading(false);}
  },[]);
  return{entry,loading,lookup,clear:()=>setEntry(null)};
}

function buildCSS(th,fs,lh,fnt){
  const t=THEMES[th];
  return{
    "body":{"background":t.bg+"!important","color":t.text+"!important","font-family":fnt+"!important","font-size":fs+"px!important","line-height":String(lh)+"!important","padding":"0 2.5em!important","max-width":"none!important","margin":"0!important"},
    "p":{"margin":"0 0 0.9em!important","text-align":"justify!important","hyphens":"auto!important","text-indent":"1.4em!important"},
    "p:first-child":{"text-indent":"0!important"},
    "h1,h2,h3,h4":{"font-family":"Georgia,serif!important","letter-spacing":"1px!important","margin":"1em 0 0.5em!important"},
    "a":{"color":"#c9a84c!important","text-decoration":"none!important"},
    "img":{"max-width":"100%!important"},
  };
}

export default function EbookReader({url,title,bookId,initProgress,onProgress,onClose}){
  const viewerRef=useRef(null);const bookRef=useRef(null);const renRef=useRef(null);
  const[ready,setReady]=useState(false);const[error,setError]=useState(null);
  const[chapter,setChapter]=useState("");const[progress,setProgress]=useState(initProgress||0);
  const[showUI,setShowUI]=useState(true);const[showSettings,setShowSettings]=useState(false);
  const[fontSize,setFontSize]=useState(18);const[lineHeight,setLineHeight]=useState(1.8);
  const[theme,setTheme]=useState("dark");const[font,setFont]=useState("Georgia,serif");
  const uiTimer=useRef(null);const dict=useDictionary();

  useEffect(()=>{
    if(!url||!viewerRef.current)return;
    let book,rendition;
    loadEpubJs().then(()=>{
      if(!viewerRef.current)return;
      book=window.ePub(url);bookRef.current=book;
      rendition=book.renderTo(viewerRef.current,{
        width:"100%",height:"100%",
        spread:"none",flow:"paginated",
        allowScriptedContent:false,
      });
      renRef.current=rendition;
      rendition.themes.default(buildCSS(theme,fontSize,lineHeight,font));
      return rendition.display();
    }).then(()=>{
      setReady(true);setError(null);
      book.locations.generate(1024).then(()=>{});
      rendition.on("locationChanged",loc=>{
        if(!loc?.start)return;
        setChapter(loc.start.href?.split("/").pop()?.replace(/.x?html.*/i,"")||"");
        if(book.locations?.length()){
          const pct=book.locations.percentageFromCfi(loc.start.cfi)||0;
          setProgress(pct);onProgress?.(pct);
        }
      });
      rendition.on("selected",(cfi,contents)=>{
        const sel=contents?.window?.getSelection()?.toString().trim();
        if(sel&&sel.length>1&&sel.length<50)dict.lookup(sel);
      });
    }).catch(err=>{
      console.error("EbookReader error:",err);
      setError("Could not load book. Check the file URL.");
      setReady(true);
    });
    return()=>{ try{book?.destroy();}catch{} };
  },[url]);

  useEffect(()=>{
    if(!renRef.current||!ready)return;
    renRef.current.themes.default(buildCSS(theme,fontSize,lineHeight,font));
  },[theme,fontSize,lineHeight,font,ready]);

  const resetUI=useCallback(()=>{setShowUI(true);clearTimeout(uiTimer.current);uiTimer.current=setTimeout(()=>setShowUI(false),4500);},[]);
  useEffect(()=>{resetUI();return()=>clearTimeout(uiTimer.current);},[]);
  const nav=dir=>{if(!renRef.current)return;dir==="next"?renRef.current.next():renRef.current.prev();resetUI();};

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const[isFullscreen,setIsFullscreen]=useState(false);
  useEffect(()=>{
    const onChange=()=>setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange",onChange);
    return()=>document.removeEventListener("fullscreenchange",onChange);
  },[]);
  const toggleFullscreen=useCallback(()=>{
    if(!document.fullscreenElement){
      document.documentElement.requestFullscreen?.().catch(()=>{});
    } else {
      document.exitFullscreen?.().catch(()=>{});
    }
  },[]);
  // Exit fullscreen when reader closes
  useEffect(()=>()=>{if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});},[]);

  const T=THEMES[theme];const pct=Math.round(progress*100);

  return(
    <div style={{position:"fixed",inset:0,zIndex:100,background:T.bg,display:"flex",flexDirection:"column"}}
         onClick={()=>{if(!showSettings)resetUI();}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:C.accent+"30",zIndex:10}}>
        <div style={{height:"100%",background:C.accent,width:pct+"%",transition:"width 0.5s"}}/>
      </div>
      <div style={{display:"flex",alignItems:"center",padding:"0 12px",height:46,background:T.bg,borderBottom:"1px solid "+C.border,flexShrink:0,gap:8,zIndex:5}}>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.accent,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,padding:"4px 8px",flexShrink:0}}>← Back</button>
        <div style={{flex:1,textAlign:"center",color:C.accent,fontSize:12,letterSpacing:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Cinzel',serif"}}>{title}</div>
        <button onClick={e=>{e.stopPropagation();toggleFullscreen();}} title={isFullscreen?"Exit fullscreen":"Fullscreen"} style={{background:isFullscreen?C.accent+"22":"transparent",border:"1px solid "+(isFullscreen?C.accent:C.border),color:isFullscreen?C.accent:C.muted,cursor:"pointer",fontSize:10,padding:"5px 9px",borderRadius:4,flexShrink:0,fontFamily:"'Cinzel',serif",letterSpacing:1}}>{isFullscreen?"EXIT FS":"FULL"}</button>
        <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s);}} style={{background:"transparent",border:"1px solid "+C.border,color:C.muted,cursor:"pointer",fontSize:11,padding:"5px 10px",borderRadius:4,fontFamily:"'Cinzel',serif",letterSpacing:1,flexShrink:0}}>Settings</button>
      </div>
      <div ref={viewerRef} style={{flex:1,overflow:"hidden",position:"relative",minHeight:0}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 16px 10px",background:T.bg,borderTop:"1px solid "+C.border,flexShrink:0,zIndex:5}}>
        <button onClick={()=>nav("prev")} style={{background:"transparent",border:"1px solid "+C.border,color:C.muted,cursor:"pointer",padding:"8px 20px",borderRadius:4,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1}}>← Prev</button>
        <span style={{color:C.muted,fontSize:10,letterSpacing:2,fontFamily:"'Cinzel',serif"}}>{chapter&&chapter+" — "}{pct}%</span>
        <button onClick={()=>nav("next")} style={{background:"transparent",border:"1px solid "+C.border,color:C.muted,cursor:"pointer",padding:"8px 20px",borderRadius:4,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1}}>Next →</button>
      </div>
      {showSettings&&(
        <div onClick={()=>setShowSettings(false)} style={{position:"fixed",inset:0,zIndex:150,background:"rgba(0,0,0,0.5)"}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:46,right:0,bottom:0,width:260,background:C.surface,borderLeft:"1px solid "+C.border,padding:"20px",overflowY:"auto",display:"flex",flexDirection:"column",gap:18}}>
            <div style={{color:C.accent,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:3}}>DISPLAY SETTINGS</div>
            <div>
              <div style={{color:C.muted,fontSize:9,letterSpacing:2,marginBottom:8,fontFamily:"'Cinzel',serif"}}>THEME</div>
              <div style={{display:"flex",gap:6}}>
                {Object.entries(THEMES).map(([k,t])=>(
                  <button key={k} onClick={()=>setTheme(k)} style={{flex:1,padding:"10px 4px",borderRadius:6,border:"2px solid "+(theme===k?C.accent:C.border),background:t.bg,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <span style={{fontSize:11,color:t.text,fontFamily:"Georgia,serif"}}>Aa</span>
                    <span style={{fontSize:8,color:t.text+"88",fontFamily:"'Cinzel',serif"}}>{k}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{color:C.muted,fontSize:9,letterSpacing:2,marginBottom:8,fontFamily:"'Cinzel',serif"}}>FONT SIZE — {fontSize}px</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setFontSize(f=>Math.max(13,f-1))} style={{padding:"6px 10px",border:"1px solid "+C.border,background:"transparent",color:C.accent,cursor:"pointer",borderRadius:4,fontFamily:"'Cinzel',serif"}}>A−</button>
                <input type="range" min={13} max={26} value={fontSize} onChange={e=>setFontSize(+e.target.value)} style={{flex:1,accentColor:C.accent}}/>
                <button onClick={()=>setFontSize(f=>Math.min(26,f+1))} style={{padding:"6px 10px",border:"1px solid "+C.border,background:"transparent",color:C.accent,cursor:"pointer",borderRadius:4,fontFamily:"'Cinzel',serif"}}>A+</button>
              </div>
            </div>
            <div>
              <div style={{color:C.muted,fontSize:9,letterSpacing:2,marginBottom:8,fontFamily:"'Cinzel',serif"}}>LINE SPACING</div>
              <div style={{display:"flex",gap:6}}>
                {[1.5,1.7,1.9,2.1].map(v=>(
                  <button key={v} onClick={()=>setLineHeight(v)} style={{flex:1,padding:"7px 4px",borderRadius:4,border:"1px solid "+(lineHeight===v?C.accent:C.border),background:lineHeight===v?C.accent+"22":"transparent",color:lineHeight===v?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>{v}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{color:C.muted,fontSize:9,letterSpacing:2,marginBottom:8,fontFamily:"'Cinzel',serif"}}>FONT</div>
              {[["Georgia,serif","Georgia"],["Palatino Linotype,serif","Palatino"],["Helvetica Neue,sans-serif","Sans"]].map(([v,label])=>(
                <button key={v} onClick={()=>setFont(v)} style={{display:"block",width:"100%",marginBottom:6,padding:"10px 12px",borderRadius:4,textAlign:"left",border:"1px solid "+(font===v?C.accent:C.border),background:font===v?C.accent+"18":"transparent",color:font===v?C.accent:T.text,fontFamily:v,fontSize:13,cursor:"pointer"}}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {(dict.entry||dict.loading)&&(
        <div onClick={dict.clear} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderTop:"2px solid "+C.accent,borderRadius:"14px 14px 0 0",width:"100%",maxWidth:600,padding:"20px 22px 40px",maxHeight:"55vh",overflowY:"auto"}}>
            <div style={{width:32,height:4,background:C.border,borderRadius:2,margin:"0 auto 14px"}}/>
            {dict.loading&&<div style={{color:C.muted,textAlign:"center",padding:20,fontFamily:"'Cinzel',serif",fontSize:12}}>Looking up...</div>}
            {dict.entry&&!dict.loading&&(
              dict.entry.notFound
                ?<div style={{color:C.text,fontFamily:"'Cinzel',serif",fontSize:15}}>Not found: "{dict.entry.word}"</div>
                :<div>
                  <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:14}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,color:C.text}}>{dict.entry.word}</span>
                    {dict.entry.phonetic&&<span style={{color:C.muted,fontSize:13}}>{dict.entry.phonetic}</span>}
                  </div>
                  {dict.entry.meanings.map((m,i)=>(
                    <div key={i} style={{marginBottom:12}}>
                      <div style={{display:"inline-block",background:C.accent+"22",color:C.accent,fontSize:10,padding:"2px 8px",borderRadius:4,fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:6}}>{m.pos}</div>
                      {m.defs.map((d,j)=>(
                        <div key={j} style={{marginBottom:6}}>
                          <div style={{color:C.text,fontSize:14,lineHeight:1.6}}>{d.def}</div>
                          {d.ex&&<div style={{color:C.muted,fontSize:12,fontStyle:"italic",paddingLeft:10,borderLeft:"2px solid "+C.accent+"40",marginTop:3}}>"{d.ex}"</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
            )}
          </div>
        </div>
      )}
      {!ready&&(
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:T.bg,zIndex:5,gap:16}}>
          {error
            ?<><div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:"#b03030",letterSpacing:1,textAlign:"center",padding:"0 24px"}}>{error}</div>
              <button onClick={onClose} style={{background:"transparent",border:"1px solid "+C.border,color:C.muted,padding:"8px 20px",borderRadius:4,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>← Back</button></>
            :<><div style={{width:32,height:32,border:"2px solid "+C.accent+"40",borderTop:"2px solid "+C.accent,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.muted,letterSpacing:3}}>Loading book...</div></>
          }
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}