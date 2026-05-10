import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  bg:"#0f0d0a", surface:"#1a1814", text:"#d4cbb8",
  accent:"#c9a84c", muted:"#7a7060", border:"#2a2518"
};

function useDictionary() {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const lookup = useCallback(async (word) => {
    const w = word.replace(/[^a-zA-Z'-]/g,"").toLowerCase();
    if(!w||w.length<2) return;
    setLoading(true); setEntry(null);
    try {
      const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/"+w);
      if(!r.ok){setEntry({word:w,notFound:true});return;}
      const data=await r.json(); const d=data[0];
      setEntry({word:d.word,phonetic:d.phonetic,meanings:d.meanings.slice(0,2).map(m=>({pos:m.partOfSpeech,defs:m.definitions.slice(0,2).map(x=>({def:x.definition,ex:x.example}))}))});
    } catch{setEntry({word:w,notFound:true});}
    finally{setLoading(false);}
  },[]);
  return {entry,loading,lookup,clear:()=>setEntry(null)};
}

export default function EbookReader({url, title, bookId, initProgress, onProgress, onClose}) {
  const viewerRef = useRef(null);
  const bookRef   = useRef(null);
  const renRef    = useRef(null);

  const [ready,    setReady]    = useState(false);
  const [chapter,  setChapter]  = useState("");
  const [progress, setProgress] = useState(initProgress||0);
  const [showUI,   setShowUI]   = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight,setLineHeight]=useState(1.8);
  const [theme,    setTheme]    = useState("dark");
  const [font,     setFont]     = useState("Georgia, serif");
  const uiTimer = useRef(null);
  const dict = useDictionary();

  const THEMES = {
    dark:  {bg:"#0f0d0a", text:"#d4cbb8"},
    sepia: {bg:"#f4ede0", text:"#2c1f0e"},
    light: {bg:"#ffffff", text:"#1a1a1a"},
  };

  // ── Init epub.js ──────────────────────────────────────────────
  useEffect(() => {
    if(!url || !window.ePub || !viewerRef.current) return;
    const book = window.ePub(url);
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width:"100%", height:"100%",
      flow:"paginated",
      manager:"default",
    });
    renRef.current = rendition;

    // Apply initial theme
    applyTheme(rendition, theme, fontSize, lineHeight, font);

    rendition.display(initProgress ? book.locations.cfiFromPercentage(initProgress) : undefined)
      .then(() => setReady(true));

    // Track location changes
    rendition.on("locationChanged", loc => {
      setChapter(loc.start?.href?.split("/").pop()?.replace(".html","") || "");
      if(book.locations.length()) {
        const pct = book.locations.percentageFromCfi(loc.start.cfi);
        setProgress(pct);
        onProgress?.(pct);
      }
    });

    // Generate locations for progress
    book.ready.then(() => book.locations.generate(1024));

    // Dictionary on text selection
    rendition.on("selected", (cfiRange, contents) => {
      const sel = contents.window.getSelection()?.toString().trim();
      if(sel && sel.length > 1 && sel.length < 40) dict.lookup(sel);
    });

    return () => { book.destroy(); };
  }, [url]);

  // ── Apply theme to rendition ──────────────────────────────────
  function applyTheme(ren, th, fs, lh, fnt) {
    if(!ren) return;
    const t = THEMES[th];
    ren.themes.default({
      "body": {
        "background":  t.bg    + " !important",
        "color":       t.text  + " !important",
        "font-family": fnt     + " !important",
        "font-size":   fs+"px" + " !important",
        "line-height": lh      + " !important",
        "padding": "0 24px !important",
        "max-width": "680px !important",
        "margin": "0 auto !important",
      },
      "p": { "margin": "0 0 0.8em !important", "text-align": "justify !important" },
      "h1,h2,h3": { "font-family": "'Cinzel','Georgia',serif !important" },
      "a": { "color": "#c9a84c !important" },
    });
    ren.views().forEach(v => v.pane ? v.pane.render() : null);
  }

  // Re-apply when settings change
  useEffect(() => { applyTheme(renRef.current, theme, fontSize, lineHeight, font); }, [theme, fontSize, lineHeight, font]);

  // ── Auto-hide UI ──────────────────────────────────────────────
  const resetUI = useCallback(() => {
    setShowUI(true);
    clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => setShowUI(false), 4000);
  },[]);
  useEffect(() => { resetUI(); return () => clearTimeout(uiTimer.current); },[]);

  const nav = (dir) => {
    if(!renRef.current) return;
    dir==="next" ? renRef.current.next() : renRef.current.prev();
    resetUI();
  };

  const T = THEMES[theme];
  const pct = Math.round(progress * 100);

  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:T.bg,display:"flex",flexDirection:"column"}}
         onClick={() => { if(!showSettings) resetUI(); }}>

      {/* Progress bar */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:C.accent+"30",zIndex:10}}>
        <div style={{height:"100%",background:C.accent,width:pct+"%",transition:"width 0.5s"}}/>
      </div>

      {/* Header */}
      <div style={{
        position:"absolute",top:0,left:0,right:0,zIndex:20,
        opacity:showUI?1:0, transform:showUI?"translateY(0)":"translateY(-100%)",
        transition:"opacity 0.3s,transform 0.3s",
        background:"linear-gradient(to bottom,"+T.bg+"ee,transparent)",
        pointerEvents:showUI?"auto":"none",
      }}>
        <div style={{display:"flex",alignItems:"center",padding:"12px 16px",gap:8}}>
          <button onClick={onClose}
            style={{background:"transparent",border:"none",color:C.accent,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1}}>
            ← Back
          </button>
          <div style={{flex:1,textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:12,color:C.accent,letterSpacing:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {title}
          </div>
          <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s);}}
            style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>
            ⚙
          </button>
        </div>
      </div>

      {/* epub.js viewer */}
      <div ref={viewerRef} style={{flex:1,overflow:"hidden",marginTop:44,marginBottom:52}}/>

      {/* Tap zones */}
      <div onClick={()=>nav("prev")} style={{position:"absolute",left:0,top:"10%",bottom:"10%",width:"15%",zIndex:5,cursor:"pointer"}}/>
      <div onClick={()=>nav("next")} style={{position:"absolute",right:0,top:"10%",bottom:"10%",width:"15%",zIndex:5,cursor:"pointer"}}/>

      {/* Footer */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,zIndex:20,
        opacity:showUI?1:0, transform:showUI?"translateY(0)":"translateY(100%)",
        transition:"opacity 0.3s,transform 0.3s",
        background:"linear-gradient(to top,"+T.bg+"ee,transparent)",
        pointerEvents:showUI?"auto":"none",
      }}>
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 20px 20px",fontFamily:"'Cinzel',serif",fontSize:11,color:C.muted,letterSpacing:1}}>
          <button onClick={()=>nav("prev")} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>← Prev</button>
          <span>{chapter} — {pct}%</span>
          <button onClick={()=>nav("next")} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>Next →</button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div onClick={()=>setShowSettings(false)} style={{position:"fixed",inset:0,zIndex:150,background:"rgba(0,0,0,0.4)"}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:0,right:0,bottom:0,width:280,background:C.surface,borderLeft:"1px solid "+C.border,padding:"24px 20px",overflowY:"auto",display:"flex",flexDirection:"column",gap:20}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:C.accent,letterSpacing:3,borderBottom:"1px solid "+C.border,paddingBottom:10}}>DISPLAY</div>

            {/* Theme */}
            <div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"'Cinzel',serif",letterSpacing:2,marginBottom:8}}>THEME</div>
              <div style={{display:"flex",gap:8}}>
                {Object.entries(THEMES).map(([k,t])=>(
                  <button key={k} onClick={()=>setTheme(k)} style={{flex:1,padding:"10px 4px",borderRadius:6,border:"2px solid "+(theme===k?C.accent:C.border),background:t.bg,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <span style={{fontSize:11,color:t.text,fontFamily:"'Cinzel',serif"}}>Aa</span>
                    <span style={{fontSize:9,color:t.text+"99"}}>{k}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"'Cinzel',serif",letterSpacing:2,marginBottom:8}}>FONT SIZE — {fontSize}px</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setFontSize(f=>Math.max(13,f-1))} style={{padding:"6px 10px",border:"1px solid "+C.border,background:"transparent",color:C.accent,cursor:"pointer",borderRadius:4}}>A−</button>
                <input type="range" min={13} max={26} value={fontSize} onChange={e=>setFontSize(+e.target.value)} style={{flex:1,accentColor:C.accent}}/>
                <button onClick={()=>setFontSize(f=>Math.min(26,f+1))} style={{padding:"6px 10px",border:"1px solid "+C.border,background:"transparent",color:C.accent,cursor:"pointer",borderRadius:4}}>A+</button>
              </div>
            </div>

            {/* Line height */}
            <div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"'Cinzel',serif",letterSpacing:2,marginBottom:8}}>LINE SPACING</div>
              <div style={{display:"flex",gap:6}}>
                {[1.5,1.7,1.9,2.1].map(v=>(
                  <button key={v} onClick={()=>setLineHeight(v)} style={{flex:1,padding:"7px 4px",borderRadius:4,border:"1px solid "+(lineHeight===v?C.accent:C.border),background:lineHeight===v?C.accent+"22":"transparent",color:lineHeight===v?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>{v}</button>
                ))}
              </div>
            </div>

            {/* Font */}
            <div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"'Cinzel',serif",letterSpacing:2,marginBottom:8}}>FONT</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[["Georgia, serif","Georgia"],["Palatino Linotype, serif","Palatino"],["Helvetica Neue, sans-serif","Sans"]].map(([v,label])=>(
                  <button key={v} onClick={()=>setFont(v)} style={{padding:"9px 12px",borderRadius:4,textAlign:"left",border:"1px solid "+(font===v?C.accent:C.border),background:font===v?C.accent+"18":"transparent",color:font===v?C.accent:C.text,fontFamily:v,fontSize:13,cursor:"pointer"}}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dictionary popup */}
      {(dict.entry||dict.loading) && (
        <div onClick={dict.clear} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderTop:"2px solid "+C.accent,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:680,padding:"20px 24px 40px",maxHeight:"60vh",overflowY:"auto"}}>
            <div style={{width:36,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
            {dict.loading&&<div style={{color:C.muted,textAlign:"center",padding:20,fontFamily:"'Cinzel',serif",fontSize:13}}>Looking up...</div>}
            {dict.entry&&!dict.loading&&(
              dict.entry.notFound
                ? <div style={{color:C.text,fontFamily:"'Cinzel',serif",fontSize:15}}>Not found: "{dict.entry.word}"</div>
                : <div>
                    <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:16}}>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,color:C.text}}>{dict.entry.word}</span>
                      {dict.entry.phonetic&&<span style={{color:C.muted,fontSize:14}}>{dict.entry.phonetic}</span>}
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

      {!ready && (
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,zIndex:5}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:C.muted,letterSpacing:3}}>Loading...</div>
        </div>
      )}
    </div>
  );
}