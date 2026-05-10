// src/components/EbookReader.jsx
import { useState, useEffect, useRef, useCallback } from "react";

const THEMES = {
  dark:  { bg:"#0f0d0a", surface:"#161410", text:"#d4cbb8", muted:"#7a7060", accent:"#c9a84c", border:"#2a2518", name:"Grimdark" },
  sepia: { bg:"#f4ede0", surface:"#ede0ca", text:"#2c1f0e", muted:"#7a6040", accent:"#8a5a20", border:"#c8a870", name:"Sepia" },
  light: { bg:"#fafafa", surface:"#f0f0f0", text:"#1a1a1a", muted:"#606060", accent:"#1a3d6b", border:"#e0e0e0", name:"Light" },
};
const FONTS = {
  georgia:  { label:"Georgia",  css:"'Georgia','Times New Roman',serif" },
  palatino: { label:"Palatino", css:"'Palatino Linotype','Book Antiqua',serif" },
  lora:     { label:"Lora",     css:"'Lora',Georgia,serif" },
  clean:    { label:"Sans",     css:"'Helvetica Neue',Arial,sans-serif" },
};
const MARGIN = { narrow:16, normal:32, wide:56 };

function useDictionary() {
  const [entry,setEntry] = useState(null);
  const [loading,setLoading] = useState(false);
  const lookup = useCallback(async(word)=>{
    const clean = word.replace(/[^a-zA-Z'-]/g,"").toLowerCase();
    if(!clean||clean.length<2) return;
    setLoading(true); setEntry(null);
    try {
      const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/"+clean);
      if(!r.ok){setEntry({word:clean,notFound:true});return;}
      const data = await r.json(); const d=data[0];
      setEntry({ word:d.word, phonetic:d.phonetic,
        meanings:d.meanings.slice(0,2).map(m=>({ pos:m.partOfSpeech,
          defs:m.definitions.slice(0,2).map(df=>({def:df.definition,example:df.example}))
        }))
      });
    } catch{setEntry({word:clean,notFound:true});}
    finally{setLoading(false);}
  },[]);
  return {entry,loading,lookup,clear:()=>setEntry(null)};
}

function DictPanel({entry,loading,theme,onClose}){
  const T=THEMES[theme]; if(!entry&&!loading) return null;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderTop:"2px solid "+T.accent,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:680,padding:"20px 24px 48px",maxHeight:"65vh",overflowY:"auto"}}>
        <div style={{width:36,height:4,background:T.border,borderRadius:2,margin:"0 auto 16px"}}/>
        {loading&&<div style={{color:T.muted,textAlign:"center",padding:20,fontFamily:"'Cinzel',serif",fontSize:13}}>Looking up...</div>}
        {entry&&!loading&&entry.notFound&&<div style={{color:T.muted,fontFamily:"'Cinzel',serif",fontSize:14}}>No definition found for "{entry.word}"</div>}
        {entry&&!loading&&!entry.notFound&&(
          <div>
            <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:16}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:T.text}}>{entry.word}</span>
              {entry.phonetic&&<span style={{color:T.muted,fontSize:14}}>{entry.phonetic}</span>}
            </div>
            {entry.meanings.map((m,mi)=>(
              <div key={mi} style={{marginBottom:14}}>
                <span style={{background:T.accent+"22",color:T.accent,fontSize:11,padding:"2px 8px",borderRadius:4,fontFamily:"'Cinzel',serif",letterSpacing:1}}>{m.pos}</span>
                {m.defs.map((d,di)=>(
                  <div key={di} style={{marginTop:8}}>
                    <div style={{color:T.text,fontSize:15,lineHeight:1.6}}>{d.def}</div>
                    {d.example&&<div style={{color:T.muted,fontSize:13,fontStyle:"italic",marginTop:4,paddingLeft:12,borderLeft:"2px solid "+T.accent+"40"}}>"{d.example}"</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Label({T,children}){
  return <div style={{fontSize:11,color:T.muted,fontFamily:"'Cinzel',serif",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{children}</div>;
}

function SettingsPanel({settings,onChange,theme,onClose}){
  const T=THEMES[theme];
  const s=(v,active)=>({flex:1,padding:"8px 4px",borderRadius:6,border:"1px solid "+(active?T.accent:T.border),background:active?T.accent+"22":"transparent",color:active?T.accent:T.muted,fontSize:11,cursor:"pointer",fontFamily:"'Cinzel',serif"});
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.4)"}}>
      <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:0,right:0,bottom:0,width:300,background:T.surface,borderLeft:"1px solid "+T.border,padding:"20px 16px",overflowY:"auto",display:"flex",flexDirection:"column",gap:22}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:T.accent,letterSpacing:3,textTransform:"uppercase",paddingBottom:12,borderBottom:"1px solid "+T.border}}>Display Settings</div>
        <div>
          <Label T={T}>Theme</Label>
          <div style={{display:"flex",gap:8}}>
            {Object.entries(THEMES).map(([k,t])=>(
              <button key={k} onClick={()=>onChange("theme",k)} style={{flex:1,padding:"10px 4px",borderRadius:8,border:"2px solid "+(settings.theme===k?T.accent:T.border),background:t.bg,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <span style={{fontSize:13,color:t.text,fontFamily:"'Cinzel',serif",fontWeight:700}}>Aa</span>
                <span style={{fontSize:8,color:t.muted,fontFamily:"'Cinzel',serif"}}>{t.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label T={T}>Font Size — {settings.fontSize}px</Label>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>onChange("fontSize",Math.max(14,settings.fontSize-1))} style={{padding:"6px 10px",borderRadius:6,border:"1px solid "+T.border,background:"transparent",color:T.accent,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:12}}>A-</button>
            <input type="range" min={14} max={26} step={1} value={settings.fontSize} onChange={e=>onChange("fontSize",+e.target.value)} style={{flex:1,accentColor:T.accent}}/>
            <button onClick={()=>onChange("fontSize",Math.min(26,settings.fontSize+1))} style={{padding:"6px 10px",borderRadius:6,border:"1px solid "+T.border,background:"transparent",color:T.accent,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:12}}>A+</button>
          </div>
        </div>
        <div>
          <Label T={T}>Line Spacing</Label>
          <div style={{display:"flex",gap:6}}>
            {[1.5,1.7,1.9,2.1].map(v=>(<button key={v} onClick={()=>onChange("lineHeight",v)} style={s(v,settings.lineHeight===v)}>{v}</button>))}
          </div>
        </div>
        <div>
          <Label T={T}>Font</Label>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {Object.entries(FONTS).map(([k,f])=>(
              <button key={k} onClick={()=>onChange("font",k)} style={{padding:"10px 14px",borderRadius:6,textAlign:"left",border:"1px solid "+(settings.font===k?T.accent:T.border),background:settings.font===k?T.accent+"18":"transparent",color:settings.font===k?T.accent:T.text,fontFamily:f.css,fontSize:14,cursor:"pointer"}}>
                {f.label} <span style={{fontSize:12,color:T.muted}}>— The quick brown fox</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label T={T}>Margin</Label>
          <div style={{display:"flex",gap:6}}>
            {["narrow","normal","wide"].map(m=>(<button key={m} onClick={()=>onChange("margin",m)} style={{...s(m,settings.margin===m),textTransform:"capitalize"}}>{m}</button>))}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderParagraph(para,idx,T,renderText,settings){
  if(!para) return null;
  const {type,text,level}=para;
  if(type==="heading"||level){
    const size=level===1?28:level===2?22:19;
    return <div key={idx} style={{fontSize:size,fontWeight:700,color:T.text,fontFamily:"'Cinzel Decorative','Cinzel',serif",marginTop:idx===0?0:40,marginBottom:16,letterSpacing:level===1?4:2,lineHeight:1.3}}>{renderText(text)}</div>;
  }
  if(type==="separator"||text==="* * *")
    return <div key={idx} style={{textAlign:"center",color:T.accent,margin:"32px 0",fontSize:16,letterSpacing:8}}>+ + +</div>;
  if(type==="quote"||type==="blockquote")
    return <blockquote key={idx} style={{borderLeft:"3px solid "+T.accent,marginLeft:0,paddingLeft:20,margin:"16px 0",color:T.muted,fontStyle:"italic",fontSize:settings.fontSize-1}}>{renderText(text)}</blockquote>;
  if(!text?.trim()) return <div key={idx} style={{height:settings.fontSize*settings.lineHeight}}/>;
  return <p key={idx} style={{margin:"0 0 0.9em",textIndent:idx>0?"1.5em":0,textAlign:"justify",hyphens:"auto"}}>{renderText(text)}</p>;
}

function defaultSettings(){
  return {theme:"dark",fontSize:18,lineHeight:1.8,font:"georgia",margin:"normal"};
}

export default function EbookReader({
  content, title, chapter, chapIndex, chapTotal, progress,
  loreWords, onBack, onPrevChap, onNextChap, onProgressChange
}){
  const [settings,setSettings] = useState(()=>{
    try{ const s=localStorage.getItem("wh40k_reader"); return s?JSON.parse(s):defaultSettings(); }
    catch{ return defaultSettings(); }
  });
  const [showUI,setShowUI] = useState(true);
  const [showSettings,setShowSettings] = useState(false);
  const uiTimer = useRef(null);
  const scrollRef = useRef(null);
  const touchStart = useRef(null);
  const dict = useDictionary();
  const T = THEMES[settings.theme];
  const fontCss = FONTS[settings.font]?.css||FONTS.georgia.css;
  const marginPx = MARGIN[settings.margin]||32;

  useEffect(()=>{
    try{ localStorage.setItem("wh40k_reader",JSON.stringify(settings)); }catch{}
  },[settings]);

  const resetUI = useCallback(()=>{
    setShowUI(true);
    clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(()=>setShowUI(false),3500);
  },[]);

  useEffect(()=>{ resetUI(); return()=>clearTimeout(uiTimer.current); },[]);

  useEffect(()=>{
    scrollRef.current?.scrollTo({top:0,behavior:"instant"});
    resetUI();
  },[chapIndex]);

  const handleScroll = useCallback(()=>{
    const el=scrollRef.current; if(!el||!onProgressChange) return;
    onProgressChange(el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight));
  },[onProgressChange]);

  const handleTouchStart = e=>{ touchStart.current=e.touches[0].clientX; resetUI(); };
  const handleTouchEnd = e=>{
    if(!touchStart.current) return;
    const diff=touchStart.current-e.changedTouches[0].clientX;
    if(Math.abs(diff)>80){
      if(diff>0&&chapIndex<chapTotal-1) onNextChap?.();
      else if(diff<0&&chapIndex>0) onPrevChap?.();
    }
    touchStart.current=null;
  };

  const handleTap = useCallback(e=>{
    if(showSettings) return;
    const sel=window.getSelection();
    if(sel&&sel.toString().trim().length>1){ dict.lookup(sel.toString().trim()); return; }
    const word=e.target.dataset?.word;
    if(word){ dict.lookup(word); return; }
    const range=document.caretRangeFromPoint?.(e.clientX,e.clientY);
    if(range){ range.expand("word"); const w=range.toString().trim(); if(w.length>1) dict.lookup(w); }
    resetUI();
  },[dict,showSettings,resetUI]);

  const renderText = useCallback((text)=>{
    if(!text||!loreWords?.size) return text;
    return text.split(/(s+|[.,!?;:'"()[]]+)/).map((seg,i)=>{
      const clean=seg.replace(/[^a-zA-Z']/g,"");
      if(clean&&loreWords.has(clean))
        return <span key={i} data-word={clean} style={{color:T.accent,cursor:"pointer",fontWeight:500}} onClick={ev=>{ev.stopPropagation();dict.lookup(clean);}}>{seg}</span>;
      return seg;
    });
  },[loreWords,T.accent,dict]);

  const pct = Math.round((progress||0)*100);
  const chg = k=>v=>setSettings(s=>({...s,[k]:v}));

  return(
    <div style={{position:"fixed",inset:0,zIndex:100,background:T.bg,display:"flex",flexDirection:"column",fontFamily:fontCss,userSelect:"text"}}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClick={handleTap}>

      {/* Progress line */}
      <div style={{position:"absolute",top:0,left:0,height:2,width:"100%",background:T.accent+"25",zIndex:10}}>
        <div style={{height:"100%",background:T.accent,width:pct+"%",transition:"width .5s ease"}}/>
      </div>

      {/* Header */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:20,opacity:showUI?1:0,transform:showUI?"translateY(0)":"translateY(-100%)",transition:"all .3s",background:"linear-gradient(to bottom,"+T.bg+"f5 60%,transparent)",pointerEvents:showUI?"auto":"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"14px 12px 20px",maxWidth:720,margin:"0 auto"}}>
          <button onClick={onBack} style={{background:"transparent",border:"1px solid "+T.border,borderRadius:8,color:T.muted,cursor:"pointer",padding:"8px 14px",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,flexShrink:0}}>
            Back
          </button>
          <div style={{flex:1,textAlign:"center",overflow:"hidden"}}>
            <div style={{fontSize:12,color:T.accent,fontFamily:"'Cinzel',serif",letterSpacing:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
            {chapter&&<div style={{fontSize:10,color:T.muted,marginTop:1}}>{chapter}</div>}
          </div>
          <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s);}} style={{background:"transparent",border:"1px solid "+T.border,borderRadius:8,color:T.muted,cursor:"pointer",padding:"8px 12px",fontSize:16,flexShrink:0}}>
            Aa
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} onScroll={handleScroll}
        style={{flex:1,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",paddingTop:64,paddingBottom:80,scrollbarWidth:"none"}}>
        <div style={{maxWidth:680,margin:"0 auto",padding:"24px "+marginPx+"px",fontSize:settings.fontSize,lineHeight:settings.lineHeight,color:T.text,fontFamily:fontCss,wordBreak:"break-word"}}>
          {(content||[]).map((p,i)=>renderParagraph(p,i,T,renderText,settings))}
          <div style={{display:"flex",gap:16,marginTop:48,paddingTop:24,borderTop:"1px solid "+T.border}}>
            {chapIndex>0&&<button onClick={onPrevChap} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",borderRadius:8,fontFamily:"'Cinzel',serif",fontSize:12,padding:"12px 16px"}}>Previous chapter</button>}
            <div style={{flex:1}}/>
            {chapIndex<chapTotal-1&&<button onClick={onNextChap} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",borderRadius:8,fontFamily:"'Cinzel',serif",fontSize:12,padding:"12px 16px"}}>Next chapter</button>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:20,opacity:showUI?1:0,transform:showUI?"translateY(0)":"translateY(100%)",transition:"all .3s",background:"linear-gradient(to top,"+T.bg+"f5 60%,transparent)",pointerEvents:showUI?"auto":"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",padding:"16px 20px 28px",fontSize:11,color:T.muted,fontFamily:"'Cinzel',serif",letterSpacing:1,maxWidth:720,margin:"0 auto"}}>
          <span>Ch {chapIndex+1}/{chapTotal}</span>
          <span>{pct}% complete</span>
          <span>{THEMES[settings.theme].name}</span>
        </div>
      </div>

      {showSettings&&<SettingsPanel settings={settings} onChange={(k,v)=>setSettings(s=>({...s,[k]:v}))} theme={settings.theme} onClose={()=>setShowSettings(false)}/>}
      <DictPanel entry={dict.entry} loading={dict.loading} theme={settings.theme} onClose={dict.clear}/>
    </div>
  );
}