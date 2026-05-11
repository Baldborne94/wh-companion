import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase, signInWithGoogle, signOut } from "./lib/supabase";
import PaintingTracker from "./components/PaintingTracker";

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sb = {
  // Always get the current session JWT; fallback to anon key if not signed in
  async _h() {
    const { data:{ session } } = await supabase.auth.getSession();
    const tok = session?.access_token ?? SB_KEY;
    return { apikey:SB_KEY, Authorization:`Bearer ${tok}`, "Content-Type":"application/json" };
  },
  async get(t,q="") {
    try{
      const r=await fetch(`${SB_URL}/rest/v1/${t}?${q}`,{headers:await this._h()});
      if(!r.ok){ const body=await r.text(); console.error(`[sb.get] ${t} → HTTP ${r.status}`,body); return {_error:r.status,_body:body}; }
      return r.json();
    } catch(e){ console.error(`[sb.get] ${t} exception`,e); return []; }
  },
  // conflict: comma-separated columns for ON CONFLICT (PostgREST ?on_conflict param)
  async upsert(t,d,conflict="user_id,book_id") {
    try{
      const r=await fetch(`${SB_URL}/rest/v1/${t}?on_conflict=${conflict}`,{
        method:"POST",
        headers:{...await this._h(),Prefer:"resolution=merge-duplicates,return=representation"},
        body:JSON.stringify(d)
      });
      if(!r.ok){ const body=await r.text(); console.error(`[sb.upsert] ${t} → HTTP ${r.status}`,body); return {_error:r.status,_body:body}; }
      return r.json();
    } catch(e){ console.error(`[sb.upsert] ${t} exception`,e); return null; }
  },
  async del(t,q="") {
    try{
      const r=await fetch(`${SB_URL}/rest/v1/${t}?${q}`,{method:"DELETE",headers:await this._h()});
      return r.ok;
    } catch(e){ console.error(`[sb.del] ${t} exception`,e); return false; }
  },
  storage:{
    async upload(path,file){
      try{
        const { data:{ session } } = await supabase.auth.getSession();
        const tok = session?.access_token ?? SB_KEY;
        const r=await fetch(`${SB_URL}/storage/v1/object/ebooks/${path}`,{method:"POST",headers:{apikey:SB_KEY,Authorization:`Bearer ${tok}`,"x-upsert":"true"},body:file});
        return r.ok;
      } catch{return false;}
    },
    // Returns a 2-hour signed URL for private bucket access
    async signedUrl(path){
      try{
        const {data}=await supabase.storage.from("ebooks").createSignedUrl(path,7200);
        return data?.signedUrl??null;
      } catch{return null;}
    },
    async remove(path){
      try{
        const {error}=await supabase.storage.from("ebooks").remove([path]);
        return !error;
      } catch{return false;}
    },
    url(path){ return `${SB_URL}/storage/v1/object/public/ebooks/${path}`; }
  }
};

// ─── READER THEMES ───────────────────────────────────────────────────────────
const THEMES = {
  dark:  { id:"dark",  label:"Grimdark",  bg:"#0f0e09", text:"#c8bfa8", surface:"#1a1810", border:"#2a2518", muted:"#7a7060", ui:"rgba(15,14,9,0.95)" },
  sepia: { id:"sepia", label:"Sepia",     bg:"#f2e8d0", text:"#3c2a1a", surface:"#e8dcbf", border:"#d4c49c", muted:"#8a6a4a", ui:"rgba(242,232,208,0.97)" },
  paper: { id:"paper", label:"Paper",     bg:"#f8f7f2", text:"#1a1a16", surface:"#f0efea", border:"#d8d8d0", muted:"#888880", ui:"rgba(248,247,242,0.97)" },
};

// ─── READER FONTS ────────────────────────────────────────────────────────────
const FONTS = [
  { name:"Georgia",      value:"Georgia, 'Times New Roman', serif",         import:null },
  { name:"Lora",         value:"'Lora', Georgia, serif",                    import:"Lora:ital,wght@0,400;0,700;1,400" },
  { name:"Merriweather", value:"'Merriweather', Georgia, serif",            import:"Merriweather:ital,wght@0,400;0,700;1,400" },
  { name:"Open Sans",    value:"'Open Sans', Arial, sans-serif",            import:"Open+Sans:ital,wght@0,400;0,600;1,400" },
];

// ─── APP COLOURS ─────────────────────────────────────────────────────────────
const C = {
  bg:"#0a0905", surface:"#111009", card:"#16140f", border:"#2a2518",
  gold:"#c9a84c", goldDim:"#7a6330", red:"#b03030",
  blue:"#4a8adc", green:"#4aaa6a",
  text:"#d4cbb8", muted:"#7a7060", dim:"#3a3428",
};
const FC = {
  "Space Marines":"#1e3d6e","Chaos":"#6e1a1a","Astra Militarum":"#3a5228",
  "Imperium":"#4a3a18","Adeptus Mechanicus":"#7a2218","Adepta Sororitas":"#5a2a4a",
  "Aeldari":"#1a4a5a","Drukhari":"#3a1a5a","Necrons":"#1a5a3a",
  "Tyranids":"#4a1a5a","Orks":"#3a4a1a","T'au":"#1a3a4a","Various":"#3a3428",
};

// ─── READING STATUS SYSTEM ────────────────────────────────────────────────────
const STATUS_CFG={
  none:   {label:"—",           icon:"·",  color:"#3a3428",bg:"transparent"},
  want:   {label:"To Read",   icon:"📋", color:"#c9a84c",bg:"#c9a84c18"},
  reading:{label:"Reading",   icon:"📖", color:"#4a8adc",bg:"#1a3a7022"},
  read:   {label:"Read ✓",    icon:"✅", color:"#4aaa6a",bg:"#1a6a2a22"},
};
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

// ─── LORE KEYWORDS → FANDOM WIKI ─────────────────────────────────────────────
// Each entry: keyword (lowercase) → { name, wiki: fandom page slug }
const LORE_DB = {
  "horus":            { name:"Horus Lupercal",              wiki:"Horus_Lupercal" },
  "luna wolves":      { name:"Luna Wolves",                 wiki:"Luna_Wolves" },
  "sons of horus":    { name:"Sons of Horus",               wiki:"Sons_of_Horus" },
  "emperor":          { name:"Emperor of Mankind",          wiki:"Emperor_of_Mankind" },
  "primarch":         { name:"Primarchs",                   wiki:"Primarch" },
  "primarchs":        { name:"Primarchs",                   wiki:"Primarch" },
  "space marines":    { name:"Space Marines",               wiki:"Space_Marines" },
  "chaos":            { name:"Chaos",                       wiki:"Chaos_(Warhammer)" },
  "warp":             { name:"The Warp",                    wiki:"Warp" },
  "isstvan iii":      { name:"Isstvan III",                 wiki:"Isstvan_III_Atrocity" },
  "isstvan v":        { name:"Isstvan V",                   wiki:"Drop_Site_Massacre" },
  "great crusade":    { name:"Great Crusade",               wiki:"Great_Crusade" },
  "horus heresy":     { name:"Horus Heresy",                wiki:"Horus_Heresy" },
  "death guard":      { name:"Death Guard",                 wiki:"Death_Guard" },
  "thousand sons":    { name:"Thousand Sons",               wiki:"Thousand_Sons" },
  "word bearers":     { name:"Word Bearers",                wiki:"Word_Bearers" },
  "night lords":      { name:"Night Lords",                 wiki:"Night_Lords" },
  "alpha legion":     { name:"Alpha Legion",                wiki:"Alpha_Legion" },
  "iron warriors":    { name:"Iron Warriors",               wiki:"Iron_Warriors" },
  "world eaters":     { name:"World Eaters",                wiki:"World_Eaters" },
  "inquisition":      { name:"The Inquisition",             wiki:"Inquisition" },
  "sanguinius":       { name:"Sanguinius",                  wiki:"Sanguinius" },
  "prospero":         { name:"Prospero",                    wiki:"Prospero_(World)" },
  "aeldari":          { name:"Aeldari",                     wiki:"Aeldari" },
  "eldar":            { name:"Aeldari (Eldar)",             wiki:"Aeldari" },
  "necrons":          { name:"Necrons",                     wiki:"Necrons" },
  "tyranids":         { name:"Tyranids",                    wiki:"Tyranids" },
  "orks":             { name:"Orks",                        wiki:"Orks" },
  "tau":              { name:"T'au Empire",                 wiki:"T%27au_Empire" },
  "eisenhorn":        { name:"Gregor Eisenhorn",            wiki:"Gregor_Eisenhorn" },
  "gaunt":            { name:"Ibram Gaunt",                 wiki:"Ibram_Gaunt" },
  "tanith":           { name:"Tanith First-and-Only",       wiki:"Tanith_First-and-Only" },
  "adeptus mechanicus":{ name:"Adeptus Mechanicus",         wiki:"Adeptus_Mechanicus" },
  "astra militarum":  { name:"Astra Militarum",             wiki:"Astra_Militarum" },
  "space wolves":     { name:"Space Wolves",                wiki:"Space_Wolves" },
  "dark angels":      { name:"Dark Angels",                 wiki:"Dark_Angels" },
  "blood angels":     { name:"Blood Angels",                wiki:"Blood_Angels" },
  "ultramarines":     { name:"Ultramarines",                wiki:"Ultramarines" },
  "imperial fists":   { name:"Imperial Fists",              wiki:"Imperial_Fists" },
  "salamanders":      { name:"Salamanders",                 wiki:"Salamanders_(Chapter)" },
  "raven guard":      { name:"Raven Guard",                 wiki:"Raven_Guard" },
  "white scars":      { name:"White Scars",                 wiki:"White_Scars" },
  "golden throne":    { name:"Golden Throne",               wiki:"Golden_Throne" },
  "guilliman":        { name:"Roboute Guilliman",           wiki:"Roboute_Guilliman" },
  "roboute guilliman":{ name:"Roboute Guilliman",           wiki:"Roboute_Guilliman" },
  "angron":           { name:"Angron",                      wiki:"Angron" },
  "magnus":           { name:"Magnus the Red",              wiki:"Magnus_the_Red" },
  "mortarion":        { name:"Mortarion",                   wiki:"Mortarion" },
  "fulgrim":          { name:"Fulgrim",                     wiki:"Fulgrim" },
  "lorgar":           { name:"Lorgar",                      wiki:"Lorgar" },
  "perturabo":        { name:"Perturabo",                   wiki:"Perturabo" },
  "konrad curze":     { name:"Konrad Curze",                wiki:"Konrad_Curze" },
  "lion el'jonson":   { name:"Lion El'Jonson",              wiki:"Lion_El%27Jonson" },
  "rogal dorn":       { name:"Rogal Dorn",                  wiki:"Rogal_Dorn" },
  "ferrus manus":     { name:"Ferrus Manus",                wiki:"Ferrus_Manus" },
  "vulkan":           { name:"Vulkan",                      wiki:"Vulkan" },
  "corax":            { name:"Corvus Corax",                wiki:"Corvus_Corax" },
  "jaghatai khan":    { name:"Jaghatai Khan",               wiki:"Jaghatai_Khan" },
  "leman russ":       { name:"Leman Russ",                  wiki:"Leman_Russ_(Primarch)" },
  "alpharius":        { name:"Alpharius",                   wiki:"Alpharius_Omegon" },
  "siege of terra":   { name:"Siege of Terra",              wiki:"Siege_of_Terra" },
  "abaddon":          { name:"Abaddon the Despoiler",       wiki:"Abaddon_the_Despoiler" },
  "eye of terror":    { name:"Eye of Terror",               wiki:"Eye_of_Terror" },
  "webway":           { name:"Webway",                      wiki:"Webway" },
  "codex astartes":   { name:"Codex Astartes",              wiki:"Codex_Astartes" },
  "black library":    { name:"The Black Library",           wiki:"Black_Library_(Craftworld)" },
  "indomitus crusade":{ name:"Indomitus Crusade",           wiki:"Indomitus_Crusade" },
  "cicatrix maledictum":{ name:"Cicatrix Maledictum",       wiki:"Cicatrix_Maledictum" },
};

function wikiUrl(key){ return `https://warhammer40k.fandom.com/wiki/${LORE_DB[key]?.wiki||encodeURIComponent(LORE_DB[key]?.name||key)}`; }

const KW_KEYS  = Object.keys(LORE_DB).sort((a,b)=>b.length-a.length);
const KW_REGEX = new RegExp(`\\b(${KW_KEYS.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})\\b`,"gi");

function highlightKeywords(html) {
  return html.split(/(<[^>]+>)/).map((part,i)=>{
    if(i%2===1||part.includes("lore-kw")) return part;
    return part.replace(KW_REGEX, m=>{
      const k=m.toLowerCase(); if(!LORE_DB[k]) return m;
      return `<span class="lore-kw" data-kw="${k}" style="color:#4a8adc;cursor:pointer;border-bottom:1px solid #4a8adc55;font-style:normal;" title="Open on Fandom Wiki ↗">${m}</span>`;
    });
  }).join("");
}

// ─── PATH RESOLVER (handles ../relative EPUB paths) ──────────────────────────
function resolveEpubPath(base, rel) {
  if(!rel || rel.startsWith("data:") || /^https?:\/\//.test(rel)) return rel;
  const parts = base.split("/"); parts.pop(); // strip filename, keep dir
  for(const seg of rel.split("/")) {
    if(seg==="..") { if(parts.length) parts.pop(); }
    else if(seg && seg!==".") parts.push(seg);
  }
  return parts.join("/");
}

// ─── EPUB PARSER ──────────────────────────────────────────────────────────────
async function parseEpub(url) {
  if(!window.JSZip){
    await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
  }
  const buf=await(await fetch(url)).arrayBuffer();
  const zip=await window.JSZip.loadAsync(buf);
  const px=new DOMParser();
  const cXml=await zip.file("META-INF/container.xml").async("text");
  const opfPath=px.parseFromString(cXml,"application/xml").querySelector("rootfile").getAttribute("full-path");
  const opfDir=opfPath.includes("/")?opfPath.substring(0,opfPath.lastIndexOf("/")+1):"";
  const opfDoc=px.parseFromString(await zip.file(opfPath).async("text"),"application/xml");
  const manifest={}; opfDoc.querySelectorAll("manifest item").forEach(i=>{manifest[i.getAttribute("id")]=i.getAttribute("href");});
  const hrefs=[...opfDoc.querySelectorAll("spine itemref")].map(i=>manifest[i.getAttribute("idref")]).filter(Boolean);

  // ── Read TOC labels from NCX (EPUB2) or nav (EPUB3) ──
  const tocLabels={};
  try{
    const ncxItem=opfDoc.querySelector('item[media-type="application/x-dtbncx+xml"]');
    const navItem=opfDoc.querySelector('item[properties~="nav"],item[properties="nav"]');
    if(ncxItem){
      const ncxText=await zip.file(opfDir+ncxItem.getAttribute("href"))?.async("text");
      if(ncxText){
        const ncxDoc=px.parseFromString(ncxText,"application/xml");
        ncxDoc.querySelectorAll("navPoint").forEach(np=>{
          const src=np.querySelector("content")?.getAttribute("src");
          const label=np.querySelector("navLabel text")?.textContent?.trim();
          if(src&&label){ tocLabels[src.split("#")[0]]=label; tocLabels[src.split("#")[0].split("/").pop()]=label; }
        });
      }
    } else if(navItem){
      const navText=await zip.file(opfDir+navItem.getAttribute("href"))?.async("text");
      if(navText){
        const navDoc=new DOMParser().parseFromString(navText,"text/html");
        navDoc.querySelectorAll("nav a").forEach(a=>{
          const href=a.getAttribute("href")?.split("#")[0];
          const label=a.textContent?.trim();
          if(href&&label){ tocLabels[href]=label; tocLabels[href.split("/").pop()]=label; }
        });
      }
    }
  }catch(e){}

  const chapters=await Promise.all(hrefs.map(async(href,idx)=>{
    const chapterPath=opfDir+href;
    const file=zip.file(chapterPath)||zip.file(href); if(!file) return null;
    let html=await file.async("text");
    // Fix images: handle both quote styles, ../relative paths, and path variations
    for(const m of [...html.matchAll(/(?:src|href)=["']([^"'#][^"']*\.(jpe?g|png|gif|webp|svg))["']/gi)]){
      const rawSrc=m[1];
      if(rawSrc.startsWith("data:")) continue;
      const resolved=resolveEpubPath(chapterPath,rawSrc);
      const imgFile=zip.file(resolved)||zip.file(opfDir+rawSrc)||zip.file(rawSrc);
      if(imgFile){
        const b64=await imgFile.async("base64");
        const ext=rawSrc.split(".").pop().toLowerCase().replace(/[?#].*/,"");
        const mime=ext==="png"?"image/png":ext==="gif"?"image/gif":ext==="webp"?"image/webp":(ext==="svg"||ext==="svgz")?"image/svg+xml":"image/jpeg";
        html=html.replace(m[0], m[0].replace(rawSrc, `data:${mime};base64,${b64}`));
      }
    }
    const hrefBase=href.split("/").pop();
    const tocLabel=tocLabels[href]||tocLabels[hrefBase];
    const tMatch=html.match(/<title[^>]*>([^<]+)<\/title>/i)||html.match(/<h[123][^>]*>([^<]+)<\/h[123]>/i);
    const rawLabel=tMatch?.[1]?.trim()||"";
    // Prefer NCX/nav label; fall back to HTML; only use filename as last resort
    const label=tocLabel||(rawLabel&&rawLabel.length<80&&!/\.x?html?$/i.test(rawLabel)?rawLabel:null)||`Chapter ${idx+1}`;
    return { html:highlightKeywords(html), label };
  }));
  return chapters.filter(Boolean);
}

// ─── DICTIONARY PANEL ─────────────────────────────────────────────────────────
function DictionaryPanel({ word, onClose, theme }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const T = THEMES[theme];

  useEffect(()=>{
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
      .then(r=>r.json())
      .then(d=>{ setData(Array.isArray(d)&&d[0]?d[0]:null); setLoading(false); })
      .catch(()=>{ setError(true); setLoading(false); });
  },[word]);

  const meaning = data?.meanings?.[0];
  const def     = meaning?.definitions?.[0];

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:`2px solid ${C.gold}`,borderRadius:"16px 16px 0 0",padding:"20px 20px 48px",width:"100%",maxWidth:600,maxHeight:"60vh",overflowY:"auto",animation:"slideUp 0.2s ease"}}>
        <div style={{width:36,height:4,background:T.border,borderRadius:2,margin:"0 auto 16px"}}/>
        {loading&&<div style={{textAlign:"center",padding:24,color:T.muted,fontStyle:"italic"}}>Looking up "{word}"…</div>}
        {error&&<div style={{textAlign:"center",padding:24,color:T.muted,fontStyle:"italic"}}>No definition found for "{word}"</div>}
        {!loading&&!error&&data&&(
          <>
            <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:4}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:T.text}}>{data.word}</span>
              {data.phonetics?.[0]?.text&&<span style={{color:T.muted,fontSize:14}}>{data.phonetics[0].text}</span>}
            </div>
            {meaning&&<div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{meaning.partOfSpeech}</div>}
            {def&&(
              <>
                <p style={{color:T.text,fontSize:15,lineHeight:1.7,marginBottom:10}}>{def.definition}</p>
                {def.example&&<p style={{color:T.muted,fontSize:13,lineHeight:1.6,fontStyle:"italic",borderLeft:`2px solid ${C.gold}44`,paddingLeft:12}}>"{def.example}"</p>}
              </>
            )}
            {data.meanings?.length>1&&(
              <div style={{marginTop:14}}>
                {data.meanings.slice(1,3).map((m,i)=>(
                  <div key={i} style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{m.partOfSpeech}</div>
                    <p style={{color:T.text,fontSize:13,lineHeight:1.6}}>{m.definitions[0]?.definition}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── LORE PANEL ───────────────────────────────────────────────────────────────
function LorePanel({ kwKey, onClose, theme }) {
  const entry=LORE_DB[kwKey]; if(!entry) return null;
  const [showSpoiler,setShowSpoiler]=useState(false);
  const T=THEMES[theme];
  const typeColor={character:"#c9a84c",faction:"#1e6e3e",concept:"#6e3a1e",battle:"#6e1a1a",event:"#1a3a6e"};
  const tc=typeColor[entry.type]||C.goldDim;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${C.gold}55`,borderTop:`2px solid ${C.gold}`,borderRadius:"16px 16px 0 0",padding:"20px 20px 48px",width:"100%",maxWidth:600,maxHeight:"75vh",overflowY:"auto",animation:"slideUp 0.25s ease"}}>
        <div style={{width:36,height:4,background:T.border,borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{fontSize:32}}>{entry.icon}</div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
              <span style={{fontFamily:"'Cinzel Decorative',serif",fontSize:18,color:T.text,fontWeight:700}}>{entry.name}</span>
              <span style={{background:`${tc}33`,border:`1px solid ${tc}66`,borderRadius:4,padding:"1px 7px",fontFamily:"'Cinzel',serif",fontSize:9,color:tc,textTransform:"uppercase",letterSpacing:1}}>{entry.type}</span>
            </div>
            {entry.subtitle&&<div style={{color:T.muted,fontSize:12,fontStyle:"italic"}}>{entry.subtitle}</div>}
          </div>
        </div>
        <div style={{height:1,background:`linear-gradient(to right,${C.gold}66,transparent)`,marginBottom:16}}/>
        <div style={{marginBottom:16}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>✅ Safe Info</div>
          <p style={{color:T.text,lineHeight:1.75,fontSize:14}}>{entry.safe}</p>
        </div>
        {entry.spoiler&&(
          <div style={{background:T.bg==="paper"?"#fff8f8":"#ffffff05",border:`1px solid ${showSpoiler?"#cc3333":"#cc333444"}`,borderRadius:10,padding:"14px 16px"}}>
            {!showSpoiler?(
              <>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:18}}>⚠️</span>
                  <div><div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.red,letterSpacing:1}}>Spoiler Available</div><div style={{fontSize:11,color:T.muted,marginTop:2}}>From: <em>{entry.spoilerFrom}</em></div></div>
                </div>
                <button onClick={()=>setShowSpoiler(true)} style={{width:"100%",padding:"10px",borderRadius:8,background:"transparent",border:`1px solid ${C.red}88`,color:C.red,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>I accept spoilers — Show full info</button>
              </>
            ):(
              <>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:"#cc3333",letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>⚠️ Spoiler — {entry.spoilerFrom}</div>
                <p style={{color:T.text,lineHeight:1.75,fontSize:14}}>{entry.spoiler}</p>
                <button onClick={()=>setShowSpoiler(false)} style={{marginTop:10,background:"transparent",border:"none",color:T.muted,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>Hide spoiler</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function SettingsPanel({ settings, onChange, onClose }) {
  const T=THEMES[settings.theme];
  const Row=({label,children})=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:12,color:T.text,letterSpacing:1}}>{label}</span>
      {children}
    </div>
  );
  const Btn=({label,active,onClick})=>(
    <button onClick={onClick} style={{background:active?`${C.gold}22`:"transparent",border:`1px solid ${active?C.gold:T.border}`,borderRadius:6,padding:"6px 12px",color:active?C.gold:T.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer"}}>
      {label}
    </button>
  );
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:800,background:"rgba(0,0,0,0.5)"}}>
      <div onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:0,bottom:0,width:Math.min(320,window.innerWidth),background:T.surface,borderLeft:`1px solid ${T.border}`,padding:"20px 20px 40px",overflowY:"auto",animation:"slideLeft 0.25s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontFamily:"'Cinzel Decorative',serif",fontSize:16,color:T.text}}>Reading Settings</span>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,color:T.muted,width:32,height:32,cursor:"pointer",fontSize:16}}>✕</button>
        </div>

        {/* Theme */}
        <div style={{marginBottom:4,fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase"}}>Theme</div>
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {Object.values(THEMES).map(th=>(
            <button key={th.id} onClick={()=>onChange("theme",th.id)} style={{
              flex:1,padding:"14px 8px",borderRadius:8,cursor:"pointer",
              background:th.bg,border:`2px solid ${settings.theme===th.id?C.gold:T.border}`,
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,
            }}>
              <div style={{width:20,height:20,borderRadius:"50%",background:th.text}}/>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:th.text,letterSpacing:1}}>{th.label}</span>
            </button>
          ))}
        </div>

        {/* Font family */}
        <div style={{marginBottom:4,fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase"}}>Font</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:20}}>
          {FONTS.map((f,i)=>(
            <button key={i} onClick={()=>onChange("fontIndex",i)} style={{padding:"10px 8px",borderRadius:6,background:"transparent",border:`1px solid ${settings.fontIndex===i?C.gold:T.border}`,color:settings.fontIndex===i?C.gold:T.muted,fontFamily:f.value,fontSize:13,cursor:"pointer"}}>{f.name}</button>
          ))}
        </div>

        {/* Font size */}
        <Row label={`Size — ${settings.fontSize}px`}>
          <div style={{display:"flex",gap:6}}>
            {[14,16,18,20,22,24].map(s=><Btn key={s} label={s} active={settings.fontSize===s} onClick={()=>onChange("fontSize",s)}/>)}
          </div>
        </Row>

        {/* Line height */}
        <Row label={`Line height — ${settings.lineHeight}×`}>
          <div style={{display:"flex",gap:6}}>
            {[1.5,1.7,1.9,2.1].map(v=><Btn key={v} label={v} active={settings.lineHeight===v} onClick={()=>onChange("lineHeight",v)}/>)}
          </div>
        </Row>

        {/* Margin */}
        <Row label="Margins">
          <div style={{display:"flex",gap:6}}>
            {[{l:"Narrow",v:12},{l:"Normal",v:24},{l:"Wide",v:40}].map(m=><Btn key={m.v} label={m.l} active={settings.margin===m.v} onClick={()=>onChange("margin",m.v)}/>)}
          </div>
        </Row>

        {/* Reading mode */}
        <Row label="Reading mode">
          <div style={{display:"flex",gap:6}}>
            <Btn label="Pages" active={settings.paginate}  onClick={()=>onChange("paginate",true)}/>
            <Btn label="Scroll" active={!settings.paginate} onClick={()=>{onChange("paginate",false);onChange("twoPage",false);}}/>
          </div>
        </Row>

        {/* Two-page spread — only in paginated mode */}
        {settings.paginate&&(
          <Row label="Layout">
            <div style={{display:"flex",gap:6}}>
              <Btn label="Single" active={!settings.twoPage} onClick={()=>onChange("twoPage",false)}/>
              <Btn label="Two-page" active={settings.twoPage}  onClick={()=>onChange("twoPage",true)}/>
            </div>
          </Row>
        )}
      </div>
    </div>
  );
}

// ─── EPUB READER ──────────────────────────────────────────────────────────────
function EpubReader({ url, title, bookId, userId, initProgress, initChapterIndex, initPageIndex, onProgress, onClose }) {
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [chapters,  setChapters]  = useState([]);
  const [chIdx,     setChIdx]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [settings, setSettings] = useState({
    theme:"dark", fontIndex:0, fontSize:18, lineHeight:1.8, margin:24, paginate:true, twoPage:false,
  });
  const updateSetting = (key,val) => setSettings(s=>({...s,[key]:val}));
  const T   = THEMES[settings.theme];
  const fnt = FONTS[settings.fontIndex];

  const outerRef       = useRef(null);
  const innerRef       = useRef(null);
  const pendingPageRef = useRef(initPageIndex||0); // deferred page restore after layout
  const [pageIndex, setPageIndex]   = useState(0);
  const [totalPages,setTotalPages]  = useState(1);
  const [pageWidth, setPageWidth]   = useState(0);
  const [pageHeight,setPageHeight]  = useState(0);

  const [showSettings,  setShowSettings]  = useState(false);
  const [showToc,       setShowToc]       = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [loreKey,       setLoreKey]       = useState(null);
  const [dictWord,      setDictWord]      = useState(null);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  const [showHint,      setShowHint]      = useState(()=>!localStorage.getItem("wh40k_lore_hint"));
  const measureTimerRef  = useRef(null);
  const scrollSaveTimer  = useRef(null);
  const [scrollPct, setScrollPct] = useState(Math.round((initProgress||0)*100));

  // ── Bookmarks — load from localStorage then sync from Supabase ───────────
  const [bookmarks, setBookmarks] = useState(()=>{
    if(!userId||!bookId) return [];
    try{ return JSON.parse(localStorage.getItem(`wh40k_bm_${userId}_${bookId}`)||'[]'); }
    catch{ return []; }
  });
  useEffect(()=>{
    if(!userId||!bookId) return;
    sb.get("bookmarks",`user_id=eq.${userId}&book_id=eq.${bookId}&order=created_at.desc`).then(rows=>{
      if(rows?.length&&!rows._error){
        const bms=rows.map(r=>({id:r.id,chapter_index:r.chapter_index,page_index:r.page_index,scroll_top:r.scroll_top||0,progress_pct:r.progress_pct,label:r.label,createdAt:r.created_at}));
        setBookmarks(bms);
        localStorage.setItem(`wh40k_bm_${userId}_${bookId}`,JSON.stringify(bms));
      }
    });
  },[userId,bookId]);

  // ── Load EPUB ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    let cancelled=false;
    parseEpub(url).then(chs=>{
      if(cancelled) return;
      setChapters(chs);
      // Prefer exact chapter_index from DB; fall back to percentage estimate
      const startCh = initChapterIndex > 0
        ? Math.min(initChapterIndex, chs.length-1)
        : Math.min(Math.floor((initProgress||0)*chs.length), Math.max(0,chs.length-1));
      setChIdx(startCh);
      // Don't call setPageIndex here — layout hasn't been measured yet.
      // pendingPageRef will be applied in measurePages once totalPages is known.
      setLoading(false);
    }).catch(e=>{ if(!cancelled){setError(e.message);setLoading(false);} });
    return()=>{cancelled=true;};
  },[url]);

  // ── Load custom fonts lazily ───────────────────────────────────────────────
  useEffect(()=>{
    if(!fnt.import) return;
    const id=`font-${settings.fontIndex}`;
    if(!document.getElementById(id)){
      const link=document.createElement("link");
      link.id=id; link.rel="stylesheet";
      link.href=`https://fonts.googleapis.com/css2?family=${fnt.import}&display=swap`;
      document.head.appendChild(link);
    }
  },[settings.fontIndex]);

  // ── Measure columns for paginated mode ────────────────────────────────────
  // measureTimerRef debounces multiple rapid calls so only ONE fires and
  // pendingPageRef (saved page restore) is applied exactly once.
  const measurePages = useCallback(()=>{
    if(!outerRef.current||!innerRef.current||!settings.paginate) return;
    const ow=outerRef.current.clientWidth;
    const oh=outerRef.current.clientHeight;
    setPageWidth(ow); setPageHeight(oh);
    if(measureTimerRef.current) clearTimeout(measureTimerRef.current);
    measureTimerRef.current = setTimeout(()=>{
      if(!innerRef.current) return;
      const tp=Math.max(1,Math.round(innerRef.current.scrollWidth/ow));
      setTotalPages(tp);
      if(pendingPageRef.current>0){
        setPageIndex(Math.min(pendingPageRef.current,tp-1));
        pendingPageRef.current=0;
      } else {
        setPageIndex(prev=>Math.min(prev,Math.max(0,tp-1)));
      }
    },200);
  },[settings.paginate]);

  useEffect(()=>{ measurePages(); },[chIdx,settings,chapters,measurePages]);
  useEffect(()=>{
    if(!outerRef.current) return;
    const ro=new ResizeObserver(measurePages); ro.observe(outerRef.current); return()=>ro.disconnect();
  },[measurePages]);

  // ── Save progress — paginated mode only (scroll mode saves in handleScroll) ─
  useEffect(()=>{
    if(!chapters.length||!userId||!settings.paginate) return;
    const pct=(chIdx+(pageIndex/Math.max(1,totalPages)))/chapters.length;
    onProgress(pct);
    sb.upsert("reading_progress",{user_id:userId,book_id:bookId,chapter_index:chIdx,page_index:pageIndex,progress_pct:pct,last_read:new Date().toISOString()},"user_id,book_id");
    localStorage.setItem(`wh40k_prog_${userId}_${bookId}`, JSON.stringify({progress_pct:pct,chapter_index:chIdx,page_index:pageIndex}));
  },[chIdx,pageIndex,chapters.length,totalPages,settings.paginate]);

  useEffect(()=>{ setPageIndex(0); },[chIdx]);

  // ── Scroll mode: restore saved scroll position after chapters render ───────
  useEffect(()=>{
    if(settings.paginate||!chapters.length||!outerRef.current) return;
    // Try to restore exact scroll_top saved from last session
    try{
      const saved=JSON.parse(localStorage.getItem(`wh40k_prog_${userId}_${bookId}`)||'{}');
      if(saved.scroll_top>0){
        requestAnimationFrame(()=>{ if(outerRef.current) outerRef.current.scrollTop=saved.scroll_top; });
      } else if(initChapterIndex>0){
        // Fallback: scroll to the chapter heading element
        requestAnimationFrame(()=>{
          const el=document.getElementById(`epub-ch-${bookId}-${initChapterIndex}`);
          if(el&&outerRef.current) outerRef.current.scrollTop=el.offsetTop-48;
        });
      }
    }catch{}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[settings.paginate,chapters.length]); // only re-run when chapters load or mode changes

  // ── Fullscreen / Cinema mode ───────────────────────────────────────────────
  // Native fullscreen works on desktop + Android Chrome.
  // iOS Safari doesn't support the API → fall back to cinema mode
  // (hide the reader's own top/bottom bars for maximum reading area).
  const toggleFullscreen = useCallback(()=>{
    if(document.fullscreenEnabled){
      if(!document.fullscreenElement){ document.documentElement.requestFullscreen().catch(()=>setIsFullscreen(f=>!f)); }
      else { document.exitFullscreen(); }
    } else {
      // Fallback: cinema mode — toggle our own bars
      setIsFullscreen(f=>!f);
    }
  },[]);
  useEffect(()=>{
    const h=()=>setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange",h);
    return()=>document.removeEventListener("fullscreenchange",h);
  },[]);

  // ── Lore hint: show once, then persist to localStorage ───────────────────
  useEffect(()=>{
    if(!showHint) return;
    const t=setTimeout(()=>{ setShowHint(false); localStorage.setItem("wh40k_lore_hint","1"); },5000);
    return()=>clearTimeout(t);
  },[showHint]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const prevPage=useCallback(()=>{
    if(pageIndex>0){ setPageIndex(p=>p-1); }
    else if(chIdx>0){ pendingPageRef.current=0; setChIdx(c=>c-1); }
  },[pageIndex,chIdx]);

  const nextPage=useCallback(()=>{
    if(pageIndex<totalPages-1){ setPageIndex(p=>p+1); }
    else if(chIdx<chapters.length-1){ pendingPageRef.current=0; setChIdx(c=>c+1); }
  },[pageIndex,totalPages,chIdx,chapters.length]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(()=>{
    const handler=(e)=>{
      if(showSettings||loreKey||dictWord) return;
      if(e.key==="ArrowRight"||e.key==="ArrowDown"){ e.preventDefault(); nextPage(); return; }
      if(e.key==="ArrowLeft"||e.key==="ArrowUp"){ e.preventDefault(); prevPage(); return; }
      if(e.key===" "){ e.preventDefault(); nextPage(); return; }
      if(e.key==="Escape"){
        if(showBookmarks){setShowBookmarks(false);}
        else if(showToc){setShowToc(false);}
        else{onClose();}
        return;
      }
      if(e.key==="f"||e.key==="F"){ toggleFullscreen(); return; }
      if(e.key==="t"||e.key==="T"){ setShowToc(v=>!v); return; }
    };
    document.addEventListener("keydown",handler);
    return()=>document.removeEventListener("keydown",handler);
  },[showSettings,showToc,showBookmarks,loreKey,dictWord,nextPage,prevPage,onClose,toggleFullscreen]);

  // ── Scroll-mode: track progress + debounce-save position ─────────────────
  const handleScroll=useCallback(()=>{
    if(!outerRef.current||settings.paginate||!chapters.length) return;
    const {scrollTop,scrollHeight,clientHeight}=outerRef.current;
    if(scrollHeight<=clientHeight) return;
    const pct=scrollTop/(scrollHeight-clientHeight);
    onProgress(pct);
    setScrollPct(Math.round(pct*100));
    // Debounced save to localStorage (includes scroll_top for exact restore)
    if(scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current=setTimeout(()=>{
      if(userId&&bookId){
        localStorage.setItem(`wh40k_prog_${userId}_${bookId}`,JSON.stringify({
          progress_pct:pct,chapter_index:0,page_index:0,scroll_top:scrollTop,
        }));
        // Sync to Supabase
        sb.upsert("reading_progress",{user_id:userId,book_id:bookId,chapter_index:0,page_index:0,progress_pct:pct,last_read:new Date().toISOString()},"user_id,book_id");
      }
    },800);
  },[chapters.length,settings.paginate,onProgress,userId,bookId]);

  // ── Save bookmark (manual) ────────────────────────────────────────────────
  const saveBookmark=useCallback(()=>{
    if(userId&&bookId){
      let pct, curChIdx, curPageIndex, scrollTop=0;
      if(!settings.paginate && outerRef.current){
        // Scroll mode: read actual scroll position from DOM
        scrollTop = outerRef.current.scrollTop;
        const {scrollHeight, clientHeight} = outerRef.current;
        pct = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
        // Find which chapter the viewport is currently in
        curChIdx = 0;
        for(let i = chapters.length - 1; i >= 0; i--){
          const el = document.getElementById(`epub-ch-${bookId}-${i}`);
          if(el && el.offsetTop <= scrollTop + 80){ curChIdx = i; break; }
        }
        curPageIndex = 0;
      } else {
        pct = chapters.length > 0 ? (chIdx + (pageIndex / Math.max(1, totalPages))) / chapters.length : 0;
        curChIdx = chIdx;
        curPageIndex = pageIndex;
        scrollTop = 0;
      }
      const bmData={user_id:userId,book_id:bookId,chapter_index:curChIdx,page_index:curPageIndex,scroll_top:scrollTop,progress_pct:pct,label:chapters[curChIdx]?.label||`Chapter ${curChIdx+1}`};
      // Save to Supabase and get back the real id
      sb.upsert("bookmarks",bmData,"id").then(res=>{
        const dbId=Array.isArray(res)?res[0]?.id:res?.id;
        const bm={id:dbId||Date.now(),chapter_index:curChIdx,page_index:curPageIndex,scroll_top:scrollTop,progress_pct:pct,label:bmData.label,createdAt:new Date().toISOString()};
        const updated=[bm,...bookmarks.filter(b=>b.id!==bm.id)].slice(0,30);
        setBookmarks(updated);
        localStorage.setItem(`wh40k_bm_${userId}_${bookId}`,JSON.stringify(updated));
      });
      // Also update the auto-save key so BookDetail can show it
      localStorage.setItem(`wh40k_prog_${userId}_${bookId}`,JSON.stringify({
        progress_pct:pct,chapter_index:curChIdx,page_index:curPageIndex,
        scroll_top:scrollTop,bookmarked:true,bookmarkedAt:new Date().toISOString(),
      }));
    }
    setBookmarkSaved(true);
    setTimeout(()=>setBookmarkSaved(false),2000);
  },[userId,bookId,chapters,chIdx,pageIndex,totalPages,bookmarks,settings.paginate]);

  // ── Lore click (keywords only — no tap-to-navigate) ───────────────────────
  const handleContentClick=useCallback(e=>{
    const kw=e.target.getAttribute?.("data-kw");
    if(kw&&LORE_DB[kw]){ window.open(wikiUrl(kw),'_blank','noopener'); }
  },[]);

  const handleMouseUp=useCallback(()=>{
    const sel=window.getSelection(); if(!sel||sel.isCollapsed) return;
    const word=sel.toString().trim().replace(/[^a-zA-Z'-]/g,"");
    if(word.length<2||word.includes(" ")) return;
    if(LORE_DB[word.toLowerCase()]) return;
    setDictWord(word);
    sel.removeAllRanges();
  },[]);

  // ── Reading time estimate for current chapter ─────────────────────────────
  const readingMinutes=useMemo(()=>{
    if(!chapters[chIdx]) return null;
    const words=chapters[chIdx].html.replace(/<[^>]+>/g,"").trim().split(/\s+/).filter(Boolean).length;
    const mins=Math.ceil(words/250);
    return mins<1?null:mins;
  },[chapters,chIdx]);

  const globalPct=chapters.length>0?Math.round(((chIdx+(pageIndex/Math.max(1,totalPages)))/chapters.length)*100):0;

  const readerStyle={
    fontFamily:fnt.value,fontSize:settings.fontSize,lineHeight:settings.lineHeight,
    color:T.text,padding:`24px ${settings.margin}px`,wordBreak:"break-word",
    hyphens:"auto",textAlign:"justify",maxWidth:"100%",
  };

  // ── Loading / Error screens ────────────────────────────────────────────────
  if(loading) return(
    <div style={{position:"fixed",inset:0,zIndex:600,background:THEMES.dark.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20}}>
      <div style={{fontSize:52,animation:"spin 2s linear infinite"}}>⚙</div>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:C.goldDim,letterSpacing:3}}>Decrypting tome…</div>
      <div style={{color:C.muted,fontSize:12,fontStyle:"italic"}}>Parsing EPUB chapters</div>
    </div>
  );

  if(error) return(
    <div style={{position:"fixed",inset:0,zIndex:600,background:THEMES.dark.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:32,textAlign:"center"}}>
      <div style={{fontSize:48}}>⚠</div>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:15,color:C.red}}>Could not open EPUB</div>
      <div style={{color:C.muted,fontSize:12,maxWidth:300}}>{error}</div>
      <div style={{color:C.dim,fontSize:11,maxWidth:300,marginTop:4}}>DRM-protected files cannot be opened. Try a DRM-free copy.</div>
      <button onClick={onClose} style={{marginTop:12,background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,padding:"10px 24px",color:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>← Back to Library</button>
    </div>
  );

  // ── Layout helpers ────────────────────────────────────────────────────────
  const arrowBtn=(disabled)=>({
    position:"absolute",top:"50%",transform:"translateY(-50%)",
    background:`${T.surface}cc`,border:`1px solid ${T.border}`,
    borderRadius:8,color:disabled?T.border:T.text,
    width:36,height:64,cursor:disabled?"default":"pointer",
    fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",
    zIndex:2,transition:"opacity 0.2s",opacity:disabled?0.25:0.75,
    flexShrink:0,userSelect:"none",
  });
  // In two-page mode arrows are hidden — navigation via bottom bar Prev/Next
  const sideArrows = settings.paginate && !settings.twoPage;
  // Horizontal indent: leave room for side arrows when shown
  const hPad = settings.twoPage ? settings.margin : settings.margin + 44;
  // Column width for paginated layout
  const colWidth = settings.twoPage
    ? Math.max(80, Math.floor((pageWidth - 2*settings.margin - 48) / 2)) // 48px gutter between pages
    : Math.max(100, pageWidth - 2*hPad);
  const colGap = settings.twoPage ? 48 : 2*hPad;
  const atStart = pageIndex===0 && chIdx===0;
  const atEnd   = pageIndex>=totalPages-1 && chIdx>=chapters.length-1;

  return(
    <div style={{position:"fixed",inset:0,zIndex:600,background:T.bg,display:"flex",flexDirection:"column",transition:"background 0.3s"}}>

      {/* ── TOP BAR — hidden in cinema/fullscreen mode ── */}
      <div style={{flexShrink:0,height:isFullscreen?0:52,overflow:"hidden",background:T.ui,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:isFullscreen?"0":"0 10px",gap:6,zIndex:2,transition:"height 0.2s"}}>
        <button onClick={onClose} title="Back (Esc)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"7px 12px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,flexShrink:0}}>← Back</button>
        <div style={{flex:1,fontFamily:"'Cinzel',serif",fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",padding:"0 4px"}}>{title}</div>
        {readingMinutes&&<div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:1,flexShrink:0,whiteSpace:"nowrap"}}>~{readingMinutes} min</div>}

        {/* Add bookmark */}
        <button onClick={saveBookmark} title="Add bookmark" style={{background:bookmarkSaved?`${C.gold}22`:"transparent",border:`1px solid ${bookmarkSaved?C.gold:T.border}`,borderRadius:6,color:bookmarkSaved?C.gold:T.muted,width:34,height:34,cursor:"pointer",fontSize:16,flexShrink:0,position:"relative"}}>
          🔖
          {bookmarkSaved&&<span style={{position:"absolute",top:-28,left:"50%",transform:"translateX(-50%)",background:C.gold,color:C.bg,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,padding:"3px 7px",borderRadius:4,whiteSpace:"nowrap",pointerEvents:"none"}}>Saved ✓</span>}
        </button>

        {/* Bookmark list */}
        <button onClick={()=>setShowBookmarks(v=>!v)} title="Bookmarks" style={{background:showBookmarks?`${C.gold}22`:"transparent",border:`1px solid ${showBookmarks?C.gold:T.border}`,borderRadius:6,color:showBookmarks?C.gold:T.muted,width:34,height:34,cursor:"pointer",fontSize:14,flexShrink:0,position:"relative"}}>
          🔖
          {bookmarks.length>0&&<span style={{position:"absolute",top:-4,right:-4,background:C.gold,color:C.bg,borderRadius:10,fontSize:8,minWidth:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",fontWeight:"bold",padding:"0 2px",pointerEvents:"none"}}>{bookmarks.length}</span>}
        </button>

        <button onClick={()=>setShowToc(t=>!t)} title="Contents (T)" style={{background:showToc?`${C.gold}22`:"transparent",border:`1px solid ${showToc?C.gold:T.border}`,borderRadius:6,color:showToc?C.gold:T.muted,width:34,height:34,cursor:"pointer",fontSize:16,flexShrink:0}}>≡</button>
        <button onClick={toggleFullscreen} title="Fullscreen (F)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,color:isFullscreen?C.gold:T.muted,width:34,height:34,cursor:"pointer",fontSize:13,flexShrink:0}}>⛶</button>
        <button onClick={()=>setShowSettings(true)} title="Settings" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,color:T.muted,width:34,height:34,cursor:"pointer",fontSize:16,flexShrink:0}}>⚙</button>
      </div>

      {/* ── PROGRESS BAR ── */}
      <div style={{height:2,background:T.border,flexShrink:0,zIndex:2}}>
        <div style={{height:"100%",width:`${settings.paginate?globalPct:scrollPct}%`,background:`linear-gradient(to right,${C.gold},${C.red})`,transition:"width 0.5s"}}/>
      </div>

      {/* ── READING AREA ── */}
      {/* In cinema mode, tap the top strip to restore bars */}
      {isFullscreen&&!document.fullscreenElement&&(
        <div onClick={toggleFullscreen} style={{position:"absolute",top:0,left:0,right:0,height:36,zIndex:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:`${T.ui}dd`,border:`1px solid ${T.border}`,borderRadius:12,padding:"4px 14px",fontFamily:"'Cinzel',serif",fontSize:9,color:T.muted,letterSpacing:2,pointerEvents:"none"}}>TAP TO RESTORE</div>
        </div>
      )}
      <div style={{flex:1,display:"flex",overflow:"hidden",position:"relative"}}
        onClick={handleContentClick} onMouseUp={handleMouseUp}>

        {/* TOC sidebar */}
        {showToc&&(
          <div style={{width:220,flexShrink:0,background:T.ui,borderRight:`1px solid ${T.border}`,overflowY:"auto",position:"absolute",top:0,left:0,bottom:0,zIndex:4,animation:"slideLeft 0.2s ease"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px 10px",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase"}}>Contents</span>
              <button onClick={()=>setShowToc(false)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
            </div>
            {chapters.map((ch,i)=>(
              <button key={i} onClick={()=>{
                if(!settings.paginate && outerRef.current){
                  // Scroll mode: scroll to the chapter's DOM element
                  const el=document.getElementById(`epub-ch-${bookId}-${i}`);
                  if(el) requestAnimationFrame(()=>{ if(outerRef.current) outerRef.current.scrollTop=el.offsetTop-48; });
                } else {
                  pendingPageRef.current=0; setChIdx(i); setPageIndex(0);
                }
                setShowToc(false);
              }} style={{display:"block",width:"100%",textAlign:"left",background:i===chIdx?`${C.gold}18`:"transparent",border:"none",borderLeft:`3px solid ${i===chIdx?C.gold:"transparent"}`,padding:"10px 16px",color:i===chIdx?C.gold:T.muted,fontSize:12,cursor:"pointer",lineHeight:1.4,transition:"background 0.15s"}}>{ch.label}</button>
            ))}
          </div>
        )}

        {/* Bookmarks sidebar */}
        {showBookmarks&&(
          <div style={{width:240,flexShrink:0,background:T.ui,borderRight:`1px solid ${T.border}`,overflowY:"auto",position:"absolute",top:0,left:0,bottom:0,zIndex:4,animation:"slideLeft 0.2s ease"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px 10px",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase"}}>Bookmarks</span>
              <button onClick={()=>setShowBookmarks(false)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
            </div>
            {bookmarks.length===0&&(
              <div style={{padding:"20px 16px",color:T.muted,fontSize:12,fontStyle:"italic",textAlign:"center"}}>No bookmarks yet.<br/>Press 🔖 to add one.</div>
            )}
            {bookmarks.map((bm,i)=>(
              <div key={bm.id} style={{borderBottom:`1px solid ${T.border}55`,padding:"10px 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
                <div style={{flex:1,minWidth:0}}>
                  <button onClick={()=>{
                    if(!settings.paginate && bm.scroll_top>=0 && outerRef.current){
                      // Scroll mode: restore exact scroll position
                      requestAnimationFrame(()=>{ if(outerRef.current) outerRef.current.scrollTop=bm.scroll_top; });
                    } else {
                      // Paginated mode: navigate to saved chapter/page
                      pendingPageRef.current=bm.page_index||0;
                      setChIdx(bm.chapter_index||0);
                      setPageIndex(0);
                    }
                    setShowBookmarks(false);
                  }} style={{background:"none",border:"none",textAlign:"left",cursor:"pointer",padding:0,width:"100%"}}>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:i===0?C.gold:T.text,marginBottom:2}}>
                      {i===0&&<span style={{fontSize:9,color:C.gold,marginRight:4}}>●</span>}
                      {bm.label}
                    </div>
                    <div style={{fontSize:10,color:T.muted}}>
                      {settings.paginate ? `p. ${bm.page_index+1} · ` : ''}{Math.round((bm.progress_pct||0)*100)}%
                    </div>
                    <div style={{fontSize:9,color:T.muted,marginTop:1}}>{new Date(bm.createdAt).toLocaleDateString('en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                  </button>
                </div>
                <button onClick={()=>{
                  const u=[...bookmarks];u.splice(i,1);
                  setBookmarks(u);
                  localStorage.setItem(`wh40k_bm_${userId}_${bookId}`,JSON.stringify(u));
                  // Delete from Supabase if we have a numeric id (from DB)
                  if(bm.id&&typeof bm.id==='number'&&bm.id>1000000000000) {/* temp local id, skip */}
                  else if(bm.id) sb.del("bookmarks",`id=eq.${bm.id}&user_id=eq.${userId}`);
                }} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:14,padding:"2px 4px",flexShrink:0}} title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Extra CSS injected for column breaks */}
        <style>{`
          .epub-col img{break-inside:avoid;max-width:100%;height:auto;}
          .epub-col h1,.epub-col h2,.epub-col h3{break-after:avoid;}
          .epub-col p{orphans:3;widows:3;}
        `}</style>

        {settings.paginate ? (
          <div ref={outerRef} style={{flex:1,overflow:"hidden",position:"relative",height:"100%",paddingTop:"24px",paddingBottom:"24px",boxSizing:"border-box"}}>
            {/* Side arrows — only in single-page mode */}
            {sideArrows&&<button onClick={prevPage} disabled={atStart} style={{...arrowBtn(atStart),left:4}}>‹</button>}
            {sideArrows&&<button onClick={nextPage} disabled={atEnd}   style={{...arrowBtn(atEnd),right:4}}>›</button>}

            <div ref={innerRef} className="epub-col" style={{
              fontFamily:fnt.value,fontSize:settings.fontSize,lineHeight:settings.lineHeight,
              color:T.text,wordBreak:"break-word",hyphens:"auto",textAlign:"justify",
              paddingLeft:`${hPad}px`,
              paddingRight:`${hPad}px`,
              columnWidth:`${colWidth}px`,
              columnFill:"auto",
              columnGap:`${colGap}px`,
              height:pageHeight?`${pageHeight-48}px`:"100%",
              transform:`translateX(-${pageIndex*(pageWidth||300)}px)`,
              transition:"transform 0.28s cubic-bezier(.4,0,.2,1)",
              willChange:"transform",
            }} dangerouslySetInnerHTML={{__html:chapters[chIdx]?.html||""}}/>
          </div>
        ) : (
          /* Scroll mode: all chapters rendered as one continuous document */
          <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",position:"relative"}} ref={outerRef} onScroll={handleScroll}>
            <div ref={innerRef}>
              {chapters.map((ch,i)=>(
                <div key={i} id={`epub-ch-${bookId}-${i}`}>
                  {/* Chapter divider (shown between chapters, not before first) */}
                  {i>0&&(
                    <div style={{margin:"40px 0 0",padding:`16px ${settings.margin}px 12px`,borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",flexShrink:0}}>Chapter {i+1}</span>
                      <span style={{flex:1,height:1,background:T.border}}/>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"60%"}}>{ch.label}</span>
                    </div>
                  )}
                  <div style={readerStyle} dangerouslySetInnerHTML={{__html:ch.html}}/>
                </div>
              ))}
              {/* End of book marker */}
              <div style={{padding:`32px ${settings.margin}px 60px`,textAlign:"center"}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:4,textTransform:"uppercase"}}>— End of Book —</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM BAR — paginated mode only, hidden in fullscreen ── */}
      {settings.paginate&&!isFullscreen&&(
        <div style={{flexShrink:0,background:T.ui,borderTop:`1px solid ${T.border}`,height:48,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",zIndex:2}}>
          {/* Prev/Next only in two-page mode — single-page uses side arrows */}
          {settings.twoPage
            ? <button onClick={prevPage} disabled={atStart} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:atStart?T.border:T.text,padding:"6px 14px",cursor:atStart?"default":"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,minWidth:66}}>← Prev</button>
            : <div style={{minWidth:66}}/>
          }
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.muted}}>ch. {chIdx+1}/{chapters.length} · {globalPct}%</div>
            {settings.twoPage&&<div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim}}>spread {pageIndex+1}/{totalPages}</div>}
          </div>
          {settings.twoPage
            ? <button onClick={nextPage} disabled={atEnd} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:atEnd?T.border:T.text,padding:"6px 14px",cursor:atEnd?"default":"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,minWidth:66}}>Next →</button>
            : <div style={{minWidth:66}}/>
          }
        </div>
      )}

      {/* ── SCROLL MODE — floating mini progress indicator ── */}
      {!settings.paginate&&(
        <div style={{position:"absolute",bottom:8,right:10,background:`${T.ui}cc`,border:`1px solid ${T.border}`,borderRadius:12,padding:"3px 10px",fontFamily:"'Cinzel',serif",fontSize:9,color:T.muted,pointerEvents:"none",zIndex:3}}>
          {scrollPct}% complete
        </div>
      )}

      {/* ── LORE HINT (first open only) ── */}
      {showHint&&(
        <div style={{position:"absolute",bottom:settings.paginate?56:20,left:"50%",transform:"translateX(-50%)",background:`${T.ui}f0`,border:`1px solid ${C.gold}55`,borderRadius:20,padding:"6px 16px",whiteSpace:"nowrap",pointerEvents:"none",zIndex:5,animation:"slideUp 0.3s ease"}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:1}}>🔵 Blue terms → Fandom Wiki · Select text → Dictionary</span>
        </div>
      )}

      {/* ── OVERLAYS ── */}
      {showSettings&&<SettingsPanel settings={settings} onChange={updateSetting} onClose={()=>setShowSettings(false)}/>}
      {dictWord&&<DictionaryPanel word={dictWord} onClose={()=>setDictWord(null)} theme={settings.theme}/>}
    </div>
  );
}

// ─── PDF READER ───────────────────────────────────────────────────────────────
function PdfReader({ url, title, bookId, userId, onClose }) {
  // Save "last opened" timestamp on mount
  useEffect(()=>{
    if(userId&&bookId){
      const key=`wh40k_prog_${userId}_${bookId}`;
      const existing=JSON.parse(localStorage.getItem(key)||'{}');
      localStorage.setItem(key,JSON.stringify({...existing,bookmarkedAt:new Date().toISOString(),progress_pct:existing.progress_pct||0,chapter_index:0,page_index:0}));
    }
  },[]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:600,background:"#0a0905",display:"flex",flexDirection:"column"}}>
      <div style={{flexShrink:0,height:52,background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",gap:12}}>
        <button onClick={onClose} style={{background:"transparent",border:`1px solid ${C.dim}`,borderRadius:8,color:C.gold,padding:"7px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:1}}>← Back</button>
        <div style={{flex:1,fontFamily:"'Cinzel',serif",fontSize:12,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
        <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.red,letterSpacing:2,border:`1px solid ${C.red}55`,borderRadius:4,padding:"2px 7px"}}>PDF</span>
      </div>
      <iframe src={url} style={{flex:1,border:"none",width:"100%"}} title={title}/>
    </div>
  );
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
        if(progData[0].chapter_index>0||progData[0].page_index>0)
          setBookmarkInfo({chapter_index:progData[0].chapter_index||0,page_index:progData[0].page_index||0,progress_pct:progData[0].progress_pct||0});
      } else {
        const cp=localStorage.getItem(`wh40k_prog_${user.id}_${book.id}`);
        if(cp){ try{
          const p=JSON.parse(cp);
          setProgress(p.progress_pct||0);
          setChapterIndex(p.chapter_index||0);
          setPageIndex(p.page_index||0);
          if(p.bookmarked||p.chapter_index>0||p.page_index>0)
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
        <CoverImage book={book} width={80} height={120} radius={5} style={{flexShrink:0,boxShadow:`0 4px 16px rgba(0,0,0,0.5)`}}/>
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
                      <div style={{fontSize:12,color:C.text}}>Ch. {bookmarkInfo.chapter_index+1} · p. {bookmarkInfo.page_index+1} · {Math.round((bookmarkInfo.progress_pct||0)*100)}%</div>
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
                          <div style={{fontSize:10,color:C.muted}}>p. {bm.page_index+1} · {Math.round((bm.progress_pct||0)*100)}% · {new Date(bm.createdAt).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</div>
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
const BOOKS=[
  {id:1,title:"Horus Rising",series:"Horus Heresy",num:1,author:"Dan Abnett",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:2,title:"False Gods",series:"Horus Heresy",num:2,author:"Graham McNeill",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:3,title:"Galaxy in Flames",series:"Horus Heresy",num:3,author:"Ben Counter",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:4,title:"The Flight of the Eisenstein",series:"Horus Heresy",num:4,author:"James Swallow",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:5,title:"Fulgrim",series:"Horus Heresy",num:5,author:"Graham McNeill",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:6,title:"Descent of Angels",series:"Horus Heresy",num:6,author:"Mitchel Scanlon",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:7,title:"Legion",series:"Horus Heresy",num:7,author:"Dan Abnett",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:8,title:"Battle for the Abyss",series:"Horus Heresy",num:8,author:"Ben Counter",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:9,title:"Mechanicum",series:"Horus Heresy",num:9,author:"Graham McNeill",type:"Novel",faction:"Adeptus Mechanicus",era:"Horus Heresy"},
  {id:10,title:"Tales of Heresy",series:"Horus Heresy",num:10,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:11,title:"Fallen Angels",series:"Horus Heresy",num:11,author:"Mike Lee",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:12,title:"A Thousand Sons",series:"Horus Heresy",num:12,author:"Graham McNeill",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:13,title:"Nemesis",series:"Horus Heresy",num:13,author:"James Swallow",type:"Novel",faction:"Imperium",era:"Horus Heresy"},
  {id:14,title:"The First Heretic",series:"Horus Heresy",num:14,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:15,title:"Prospero Burns",series:"Horus Heresy",num:15,author:"Dan Abnett",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:16,title:"Age of Darkness",series:"Horus Heresy",num:16,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:17,title:"The Outcast Dead",series:"Horus Heresy",num:17,author:"Graham McNeill",type:"Novel",faction:"Imperium",era:"Horus Heresy"},
  {id:18,title:"Deliverance Lost",series:"Horus Heresy",num:18,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:19,title:"Know No Fear",series:"Horus Heresy",num:19,author:"Dan Abnett",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:20,title:"The Primarchs",series:"Horus Heresy",num:20,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:21,title:"Fear to Tread",series:"Horus Heresy",num:21,author:"James Swallow",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:22,title:"Shadows of Treachery",series:"Horus Heresy",num:22,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:23,title:"Angel Exterminatus",series:"Horus Heresy",num:23,author:"Graham McNeill",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:24,title:"Betrayer",series:"Horus Heresy",num:24,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:25,title:"Mark of Calth",series:"Horus Heresy",num:25,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:26,title:"Vulkan Lives",series:"Horus Heresy",num:26,author:"Nick Kyme",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:27,title:"The Unremembered Empire",series:"Horus Heresy",num:27,author:"Dan Abnett",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:28,title:"Scars",series:"Horus Heresy",num:28,author:"Chris Wraight",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:29,title:"Vengeful Spirit",series:"Horus Heresy",num:29,author:"Graham McNeill",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:30,title:"The Damnation of Pythos",series:"Horus Heresy",num:30,author:"David Annandale",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:31,title:"Legacies of Betrayal",series:"Horus Heresy",num:31,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:32,title:"Deathfire",series:"Horus Heresy",num:32,author:"Nick Kyme",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:33,title:"War Without End",series:"Horus Heresy",num:33,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:34,title:"Pharos",series:"Horus Heresy",num:34,author:"Guy Haley",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:35,title:"Eye of Terra",series:"Horus Heresy",num:35,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:36,title:"The Path of Heaven",series:"Horus Heresy",num:36,author:"Chris Wraight",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:37,title:"The Silent War",series:"Horus Heresy",num:37,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:38,title:"Angels of Caliban",series:"Horus Heresy",num:38,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:39,title:"Praetorian of Dorn",series:"Horus Heresy",num:39,author:"John French",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:40,title:"Corax",series:"Horus Heresy",num:40,author:"Gav Thorpe",type:"Anthology",faction:"Space Marines",era:"Horus Heresy"},
  {id:41,title:"The Master of Mankind",series:"Horus Heresy",num:41,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Imperium",era:"Horus Heresy"},
  {id:42,title:"Garro",series:"Horus Heresy",num:42,author:"James Swallow",type:"Anthology",faction:"Space Marines",era:"Horus Heresy"},
  {id:43,title:"Shattered Legions",series:"Horus Heresy",num:43,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:44,title:"The Crimson King",series:"Horus Heresy",num:44,author:"Graham McNeill",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:45,title:"Tallarn",series:"Horus Heresy",num:45,author:"John French",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:46,title:"Ruinstorm",series:"Horus Heresy",num:46,author:"David Annandale",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:47,title:"Old Earth",series:"Horus Heresy",num:47,author:"Nick Kyme",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:48,title:"The Burden of Loyalty",series:"Horus Heresy",num:48,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:49,title:"Wolfsbane",series:"Horus Heresy",num:49,author:"Guy Haley",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:50,title:"Born of Flame",series:"Horus Heresy",num:50,author:"Nick Kyme",type:"Anthology",faction:"Space Marines",era:"Horus Heresy"},
  {id:51,title:"Slaves to Darkness",series:"Horus Heresy",num:51,author:"John French",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:52,title:"Heralds of the Siege",series:"Horus Heresy",num:52,author:"Various",type:"Anthology",faction:"Various",era:"Horus Heresy"},
  {id:53,title:"Titandeath",series:"Horus Heresy",num:53,author:"Guy Haley",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:54,title:"The Buried Dagger",series:"Horus Heresy",num:54,author:"James Swallow",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:55,title:"The Solar War",series:"Siege of Terra",num:1,author:"John French",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:56,title:"The Lost and the Damned",series:"Siege of Terra",num:2,author:"Guy Haley",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:57,title:"The First Wall",series:"Siege of Terra",num:3,author:"Gav Thorpe",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:58,title:"Saturnine",series:"Siege of Terra",num:4,author:"Dan Abnett",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:59,title:"Mortis",series:"Siege of Terra",num:5,author:"John French",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:60,title:"Warhawk",series:"Siege of Terra",num:6,author:"Chris Wraight",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:61,title:"Echoes of Eternity",series:"Siege of Terra",num:7,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:62,title:"The End and the Death: Volume I",series:"Siege of Terra",num:8,author:"Dan Abnett",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:63,title:"The End and the Death: Volume II",series:"Siege of Terra",num:9,author:"Dan Abnett",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:64,title:"The End and the Death: Volume III",series:"Siege of Terra",num:10,author:"Dan Abnett",type:"Novel",faction:"Various",era:"Horus Heresy"},
  {id:65,title:"Roboute Guilliman: Lord of Ultramar",series:"Primarchs",num:1,author:"David Annandale",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:66,title:"Leman Russ: The Great Wolf",series:"Primarchs",num:2,author:"Chris Wraight",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:67,title:"Magnus the Red: Master of Prospero",series:"Primarchs",num:3,author:"Graham McNeill",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:68,title:"Perturabo: The Hammer of Olympia",series:"Primarchs",num:4,author:"Guy Haley",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:69,title:"Lorgar: Bearer of the Word",series:"Primarchs",num:5,author:"Gav Thorpe",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:70,title:"Fulgrim: The Palatine Phoenix",series:"Primarchs",num:6,author:"Josh Reynolds",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:71,title:"Ferrus Manus: The Gorgon of Medusa",series:"Primarchs",num:7,author:"David Guymer",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:72,title:"Jaghatai Khan: Warhawk of Chogoris",series:"Primarchs",num:8,author:"Chris Wraight",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:73,title:"Vulkan: Lord of Drakes",series:"Primarchs",num:9,author:"David Annandale",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:74,title:"Corax: Lord of Shadows",series:"Primarchs",num:10,author:"Guy Haley",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:75,title:"Angron: Slave of Nuceria",series:"Primarchs",num:11,author:"Ian St. Martin",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:76,title:"Konrad Curze: The Night Haunter",series:"Primarchs",num:12,author:"Guy Haley",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:77,title:"Lion El'Jonson: Lord of the First",series:"Primarchs",num:13,author:"David Guymer",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:78,title:"Alpharius: Head of the Hydra",series:"Primarchs",num:14,author:"Mike Brooks",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:79,title:"Mortarion: The Pale King",series:"Primarchs",num:15,author:"David Annandale",type:"Novel",faction:"Chaos",era:"Horus Heresy"},
  {id:80,title:"Rogal Dorn: The Emperor's Crusader",series:"Primarchs",num:16,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:81,title:"Sanguinius: The Great Angel",series:"Primarchs",num:17,author:"Chris Wraight",type:"Novel",faction:"Space Marines",era:"Horus Heresy"},
  {id:82,title:"First and Only",series:"Gaunt's Ghosts",num:1,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:83,title:"Ghostmaker",series:"Gaunt's Ghosts",num:2,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:84,title:"Necropolis",series:"Gaunt's Ghosts",num:3,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:85,title:"Honour Guard",series:"Gaunt's Ghosts",num:4,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:86,title:"The Guns of Tanith",series:"Gaunt's Ghosts",num:5,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:87,title:"Straight Silver",series:"Gaunt's Ghosts",num:6,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:88,title:"Sabbat Martyr",series:"Gaunt's Ghosts",num:7,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:89,title:"Traitor General",series:"Gaunt's Ghosts",num:8,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:90,title:"His Last Command",series:"Gaunt's Ghosts",num:9,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:91,title:"The Armour of Contempt",series:"Gaunt's Ghosts",num:10,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:92,title:"Only in Death",series:"Gaunt's Ghosts",num:11,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:93,title:"Blood Pact",series:"Gaunt's Ghosts",num:12,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:94,title:"Salvation's Reach",series:"Gaunt's Ghosts",num:13,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:95,title:"The Warmaster",series:"Gaunt's Ghosts",num:14,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:96,title:"The Anarch",series:"Gaunt's Ghosts",num:15,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:97,title:"The Vincula Insurgency",series:"Gaunt's Ghosts",num:16,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:98,title:"Xenos",series:"Eisenhorn",num:1,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:99,title:"Malleus",series:"Eisenhorn",num:2,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:100,title:"Hereticus",series:"Eisenhorn",num:3,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:101,title:"The Magos",series:"Eisenhorn",num:4,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:102,title:"Ravenor",series:"Ravenor",num:1,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:103,title:"Ravenor Returned",series:"Ravenor",num:2,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:104,title:"Ravenor Rogue",series:"Ravenor",num:3,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:105,title:"Pariah: Ravenor vs Eisenhorn",series:"Bequin",num:1,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:106,title:"Penitent",series:"Bequin",num:2,author:"Dan Abnett",type:"Novel",faction:"Imperium",era:"41st Millennium"},
  {id:107,title:"Soul Hunter",series:"Night Lords",num:1,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:108,title:"Blood Reaver",series:"Night Lords",num:2,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:109,title:"Void Stalker",series:"Night Lords",num:3,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:110,title:"For the Emperor",series:"Ciaphas Cain",num:1,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:111,title:"Caves of Ice",series:"Ciaphas Cain",num:2,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:112,title:"The Traitor's Hand",series:"Ciaphas Cain",num:3,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:113,title:"Death or Glory",series:"Ciaphas Cain",num:4,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:114,title:"Duty Calls",series:"Ciaphas Cain",num:5,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:115,title:"Cain's Last Stand",series:"Ciaphas Cain",num:6,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:116,title:"The Emperor's Finest",series:"Ciaphas Cain",num:7,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:117,title:"The Last Ditch",series:"Ciaphas Cain",num:8,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:118,title:"The Greater Good",series:"Ciaphas Cain",num:9,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:119,title:"Choose Your Enemies",series:"Ciaphas Cain",num:10,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:120,title:"Vainglorious",series:"Ciaphas Cain",num:11,author:"Sandy Mitchell",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:121,title:"Dark Imperium",series:"Dark Imperium",num:1,author:"Guy Haley",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:122,title:"Plague War",series:"Dark Imperium",num:2,author:"Guy Haley",type:"Novel",faction:"Chaos",era:"Dark Imperium"},
  {id:123,title:"Godblight",series:"Dark Imperium",num:3,author:"Guy Haley",type:"Novel",faction:"Chaos",era:"Dark Imperium"},
  {id:124,title:"Avenging Son",series:"Dawn of Fire",num:1,author:"Guy Haley",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:125,title:"The Gate of Bones",series:"Dawn of Fire",num:2,author:"Andy Clark",type:"Novel",faction:"Various",era:"Dark Imperium"},
  {id:126,title:"The Wolftime",series:"Dawn of Fire",num:3,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:127,title:"Throne of Light",series:"Dawn of Fire",num:4,author:"Guy Haley",type:"Novel",faction:"Various",era:"Dark Imperium"},
  {id:128,title:"The Iron Kingdom",series:"Dawn of Fire",num:5,author:"Nick Kyme",type:"Novel",faction:"Various",era:"Dark Imperium"},
  {id:129,title:"The Martyr's Tomb",series:"Dawn of Fire",num:6,author:"Marc Collins",type:"Novel",faction:"Various",era:"Dark Imperium"},
  {id:130,title:"Sea of Souls",series:"Dawn of Fire",num:7,author:"Chris Wraight",type:"Novel",faction:"Various",era:"Dark Imperium"},
  {id:131,title:"Hand of Abaddon",series:"Dawn of Fire",num:8,author:"Nick Kyme",type:"Novel",faction:"Various",era:"Dark Imperium"},
  {id:132,title:"Angels of Darkness",series:"Dark Angels",num:1,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:133,title:"Ravenwing",series:"Dark Angels",num:2,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:134,title:"Master of Sanctity",series:"Dark Angels",num:3,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:135,title:"The Unforgiven",series:"Dark Angels",num:4,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:136,title:"Azrael",series:"Dark Angels",num:5,author:"Gav Thorpe",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:137,title:"The Lion: Son of the Forest",series:"Dark Angels",num:6,author:"Mike Brooks",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:138,title:"Cypher: Lord of the Fallen",series:"Dark Angels",num:7,author:"John French",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:139,title:"Lazarus: Enmity's Edge",series:"Dark Angels",num:8,author:"Gary Kloster",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:140,title:"Deus Encarmine",series:"Blood Angels",num:1,author:"James Swallow",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:141,title:"Deus Sanguinius",series:"Blood Angels",num:2,author:"James Swallow",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:142,title:"Red Fury",series:"Blood Angels",num:3,author:"James Swallow",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:143,title:"Black Tide",series:"Blood Angels",num:4,author:"James Swallow",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:144,title:"Dante",series:"Blood Angels",num:5,author:"Guy Haley",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:145,title:"Devastation of Baal",series:"Blood Angels",num:6,author:"Guy Haley",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:146,title:"Darkness in the Blood",series:"Blood Angels",num:7,author:"Guy Haley",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:147,title:"Space Wolf",series:"Space Wolves",num:1,author:"William King",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:148,title:"Ragnar's Claw",series:"Space Wolves",num:2,author:"William King",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:149,title:"Grey Hunter",series:"Space Wolves",num:3,author:"William King",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:150,title:"Wolfblade",series:"Space Wolves",num:4,author:"William King",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:151,title:"Sons of Fenris",series:"Space Wolves",num:5,author:"Lee Lighter",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:152,title:"Wolf's Honour",series:"Space Wolves",num:6,author:"Lee Lighter",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:153,title:"Nightbringer",series:"Ultramarines",num:1,author:"Graham McNeill",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:154,title:"Warriors of Ultramar",series:"Ultramarines",num:2,author:"Graham McNeill",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:155,title:"Dead Sky, Black Sun",series:"Ultramarines",num:3,author:"Graham McNeill",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:156,title:"The Killing Ground",series:"Ultramarines",num:4,author:"Graham McNeill",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:157,title:"Courage and Honour",series:"Ultramarines",num:5,author:"Graham McNeill",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:158,title:"The Chapter's Due",series:"Ultramarines",num:6,author:"Graham McNeill",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:159,title:"The Talon of Horus",series:"Black Legion",num:1,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:160,title:"Black Legion",series:"Black Legion",num:2,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:161,title:"Ahriman: Exile",series:"Ahriman",num:1,author:"John French",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:162,title:"Ahriman: Sorcerer",series:"Ahriman",num:2,author:"John French",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:163,title:"Ahriman: Unchanged",series:"Ahriman",num:3,author:"John French",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:164,title:"Ahriman: Eternal",series:"Ahriman",num:4,author:"John French",type:"Novel",faction:"Chaos",era:"Dark Imperium"},
  {id:165,title:"The Carrion Throne",series:"Vaults of Terra",num:1,author:"Chris Wraight",type:"Novel",faction:"Imperium",era:"Dark Imperium"},
  {id:166,title:"The Hollow Mountain",series:"Vaults of Terra",num:2,author:"Chris Wraight",type:"Novel",faction:"Imperium",era:"Dark Imperium"},
  {id:167,title:"The Dark City",series:"Vaults of Terra",num:3,author:"Chris Wraight",type:"Novel",faction:"Imperium",era:"Dark Imperium"},
  {id:168,title:"Resurrection",series:"Covenant",num:1,author:"John French",type:"Novel",faction:"Imperium",era:"Dark Imperium"},
  {id:169,title:"Incarnation",series:"Covenant",num:2,author:"John French",type:"Novel",faction:"Imperium",era:"Dark Imperium"},
  {id:170,title:"Grey Knights",series:"Grey Knights",num:1,author:"Ben Counter",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:171,title:"Dark Adeptus",series:"Grey Knights",num:2,author:"Ben Counter",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:172,title:"Hammer of Daemons",series:"Grey Knights",num:3,author:"Ben Counter",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:173,title:"The Emperor's Gift",series:"Grey Knights",num:4,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:174,title:"Priests of Mars",series:"Adeptus Mechanicus",num:1,author:"Graham McNeill",type:"Novel",faction:"Adeptus Mechanicus",era:"41st Millennium"},
  {id:175,title:"Lords of Mars",series:"Adeptus Mechanicus",num:2,author:"Graham McNeill",type:"Novel",faction:"Adeptus Mechanicus",era:"41st Millennium"},
  {id:176,title:"Gods of Mars",series:"Adeptus Mechanicus",num:3,author:"Graham McNeill",type:"Novel",faction:"Adeptus Mechanicus",era:"41st Millennium"},
  {id:177,title:"Skitarius",series:"Adeptus Mechanicus",num:4,author:"Rob Sanders",type:"Novel",faction:"Adeptus Mechanicus",era:"41st Millennium"},
  {id:178,title:"Tech-Priest",series:"Adeptus Mechanicus",num:5,author:"Rob Sanders",type:"Novel",faction:"Adeptus Mechanicus",era:"41st Millennium"},
  {id:179,title:"Belisarius Cawl: The Great Work",series:"Adeptus Mechanicus",num:6,author:"Guy Haley",type:"Novel",faction:"Adeptus Mechanicus",era:"Dark Imperium"},
  {id:180,title:"Day of Ascension",series:"Adeptus Mechanicus",num:7,author:"Adrian Tchaikovsky",type:"Novel",faction:"Adeptus Mechanicus",era:"Dark Imperium"},
  {id:181,title:"Faith and Fire",series:"Adepta Sororitas",num:1,author:"James Swallow",type:"Novel",faction:"Adepta Sororitas",era:"41st Millennium"},
  {id:182,title:"Hammer and Anvil",series:"Adepta Sororitas",num:2,author:"James Swallow",type:"Novel",faction:"Adepta Sororitas",era:"41st Millennium"},
  {id:183,title:"Requiem Infernal",series:"Adepta Sororitas",num:3,author:"Peter Fehervari",type:"Novel",faction:"Adepta Sororitas",era:"Dark Imperium"},
  {id:184,title:"Mark of Faith",series:"Adepta Sororitas",num:4,author:"Rachel Harrison",type:"Novel",faction:"Adepta Sororitas",era:"Dark Imperium"},
  {id:185,title:"Pilgrims of Fire",series:"Adepta Sororitas",num:5,author:"Justin D. Hill",type:"Novel",faction:"Adepta Sororitas",era:"Dark Imperium"},
  {id:186,title:"Fifteen Hours",series:"Astra Militarum",num:0,author:"Mitchel Scanlon",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:187,title:"Death World",series:"Astra Militarum",num:0,author:"Steve Lyons",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:188,title:"Cadian Blood",series:"Astra Militarum",num:0,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:189,title:"Dead Men Walking",series:"Astra Militarum",num:0,author:"Steve Lyons",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:190,title:"Baneblade",series:"Astra Militarum",num:0,author:"Guy Haley",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:191,title:"Shadowsword",series:"Astra Militarum",num:0,author:"Guy Haley",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:192,title:"Honourbound",series:"Astra Militarum",num:0,author:"Rachel Harrison",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:193,title:"Cadia Stands",series:"Astra Militarum",num:0,author:"Justin D. Hill",type:"Novel",faction:"Astra Militarum",era:"Dark Imperium"},
  {id:194,title:"Cadian Honour",series:"Astra Militarum",num:0,author:"Justin D. Hill",type:"Novel",faction:"Astra Militarum",era:"Dark Imperium"},
  {id:195,title:"Catachan Devil",series:"Astra Militarum",num:0,author:"Justin Woolley",type:"Novel",faction:"Astra Militarum",era:"Dark Imperium"},
  {id:196,title:"The Fall of Cadia",series:"Astra Militarum",num:0,author:"Robert Rath",type:"Novel",faction:"Astra Militarum",era:"Dark Imperium"},
  {id:197,title:"Krieg",series:"Astra Militarum",num:0,author:"Steve Lyons",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:198,title:"Steel Tread",series:"Astra Militarum",num:0,author:"Andy Clark",type:"Novel",faction:"Astra Militarum",era:"Dark Imperium"},
  {id:199,title:"Imperial Creed",series:"Yarrick",num:1,author:"David Annandale",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:200,title:"The Pyres of Armageddon",series:"Yarrick",num:2,author:"David Annandale",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:201,title:"Path of the Warrior",series:"Path of the Eldar",num:1,author:"Gav Thorpe",type:"Novel",faction:"Aeldari",era:"41st Millennium"},
  {id:202,title:"Path of the Seer",series:"Path of the Eldar",num:2,author:"Gav Thorpe",type:"Novel",faction:"Aeldari",era:"41st Millennium"},
  {id:203,title:"Path of the Outcast",series:"Path of the Eldar",num:3,author:"Gav Thorpe",type:"Novel",faction:"Aeldari",era:"41st Millennium"},
  {id:204,title:"Asurmen: Hand of Asuryan",series:"Path of the Eldar",num:4,author:"Gav Thorpe",type:"Novel",faction:"Aeldari",era:"41st Millennium"},
  {id:205,title:"Jain Zar: The Storm of Silence",series:"Path of the Eldar",num:5,author:"Gav Thorpe",type:"Novel",faction:"Aeldari",era:"41st Millennium"},
  {id:206,title:"Path of the Renegade",series:"Dark Eldar",num:1,author:"Andy Chambers",type:"Novel",faction:"Drukhari",era:"41st Millennium"},
  {id:207,title:"Path of the Incubus",series:"Dark Eldar",num:2,author:"Andy Chambers",type:"Novel",faction:"Drukhari",era:"41st Millennium"},
  {id:208,title:"Path of the Archon",series:"Dark Eldar",num:3,author:"Andy Chambers",type:"Novel",faction:"Drukhari",era:"41st Millennium"},
  {id:209,title:"Helsreach",series:"Black Templars",num:1,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:210,title:"Helbrecht: Knight of the Throne",series:"Black Templars",num:2,author:"Marc Collins",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:211,title:"Dark Apostle",series:"Word Bearers",num:1,author:"Anthony Reynolds",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:212,title:"Dark Disciple",series:"Word Bearers",num:2,author:"Anthony Reynolds",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:213,title:"Dark Creed",series:"Word Bearers",num:3,author:"Anthony Reynolds",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:214,title:"The Lords of Silence",series:"Death Guard",num:1,author:"Chris Wraight",type:"Novel",faction:"Chaos",era:"Dark Imperium"},
  {id:215,title:"Shroud of Night",series:"Alpha Legion",num:1,author:"Andy Clark",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:216,title:"Sons of the Hydra",series:"Alpha Legion",num:2,author:"Rob Sanders",type:"Novel",faction:"Chaos",era:"41st Millennium"},
  {id:217,title:"Renegades: Harrowmaster",series:"Alpha Legion",num:3,author:"Mike Brooks",type:"Novel",faction:"Chaos",era:"Dark Imperium"},
  {id:218,title:"Spear of the Emperor",series:"Standalone",num:0,author:"Aaron Dembski-Bowden",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:219,title:"Valdor: Birth of the Imperium",series:"Standalone",num:0,author:"Chris Wraight",type:"Novel",faction:"Imperium",era:"Horus Heresy"},
  {id:220,title:"Double Eagle",series:"Standalone",num:0,author:"Dan Abnett",type:"Novel",faction:"Astra Militarum",era:"41st Millennium"},
  {id:221,title:"Titanicus",series:"Titan Legions",num:1,author:"Dan Abnett",type:"Novel",faction:"Adeptus Mechanicus",era:"Horus Heresy"},
  {id:222,title:"Warlord: Fury of the God-Machine",series:"Titan Legions",num:2,author:"David Annandale",type:"Novel",faction:"Adeptus Mechanicus",era:"41st Millennium"},
  {id:223,title:"Imperator: Wrath of the Omnissiah",series:"Titan Legions",num:3,author:"Gav Thorpe",type:"Novel",faction:"Adeptus Mechanicus",era:"41st Millennium"},
  {id:224,title:"Kingsblade",series:"Imperial Knights",num:1,author:"Andy Clark",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:225,title:"Knightsblade",series:"Imperial Knights",num:2,author:"Andy Clark",type:"Novel",faction:"Space Marines",era:"Dark Imperium"},
  {id:226,title:"Deathwatch",series:"Deathwatch",num:1,author:"Steve Parker",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:227,title:"Shadowbreaker",series:"Deathwatch",num:2,author:"Steve Parker",type:"Novel",faction:"Space Marines",era:"41st Millennium"},
  {id:228,title:"Rites of Passage",series:"Rogue Trader",num:1,author:"Mike Brooks",type:"Novel",faction:"Imperium",era:"Dark Imperium"},
  {id:229,title:"Codex: Space Marines",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Space Marines",era:"10th Edition"},
  {id:230,title:"Codex: Chaos Space Marines",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Chaos",era:"10th Edition"},
  {id:231,title:"Codex: Necrons",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Necrons",era:"10th Edition"},
  {id:232,title:"Codex: Tyranids",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Tyranids",era:"10th Edition"},
  {id:233,title:"Codex: Astra Militarum",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Astra Militarum",era:"10th Edition"},
  {id:234,title:"Codex: Orks",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Orks",era:"10th Edition"},
  {id:235,title:"Codex: Aeldari",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Aeldari",era:"10th Edition"},
  {id:236,title:"Codex: Death Guard",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Chaos",era:"10th Edition"},
  {id:237,title:"Codex: T'au Empire",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"T'au",era:"10th Edition"},
  {id:238,title:"Codex: Drukhari",series:"Codex",num:0,author:"Games Workshop",type:"Codex",faction:"Drukhari",era:"10th Edition"},
];

const ALL_SERIES   = ["All",...new Set(BOOKS.map(b=>b.series))];
const ALL_FACTIONS = ["All",...new Set(BOOKS.map(b=>b.faction))].sort((a,b)=>a==="All"?-1:a.localeCompare(b));
const ALL_TYPES    = ["All",...new Set(BOOKS.map(b=>b.type))];
const ALL_ERAS     = ["All",...new Set(BOOKS.map(b=>b.era))];

// ─── COVER IMAGE ─────────────────────────────────────────────────────────────
const COVER_CACHE_PREFIX = "wh40k_cover_";

async function fetchBookCover(book) {
  const key = COVER_CACHE_PREFIX + book.id;
  const cached = localStorage.getItem(key);
  if(cached !== null) return cached; // "" = confirmed not found; url = cover

  // 1. Try Open Library (better Black Library coverage, free, no key)
  try{
    const t = encodeURIComponent(book.title);
    const a = encodeURIComponent(book.author);
    const r = await fetch(`https://openlibrary.org/search.json?title=${t}&author=${a}&limit=1&fields=cover_i`);
    if(r.ok){
      const d = await r.json();
      const coverId = d.docs?.[0]?.cover_i;
      if(coverId){
        const url = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
        localStorage.setItem(key, url);
        return url;
      }
    }
  }catch{ /* fall through to Google Books */ }

  // 2. Fallback: Google Books
  try{
    const q = encodeURIComponent(`"${book.title}" ${book.author}`);
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&fields=items(volumeInfo/imageLinks)`);
    if(!r.ok){ return r.status>=500 ? null : (localStorage.setItem(key,""), ""); }
    const d = await r.json();
    const thumb = d.items?.[0]?.volumeInfo?.imageLinks?.thumbnail || "";
    const url = thumb.replace("http://","https://").replace("&edge=curl","").replace("zoom=1","zoom=2");
    localStorage.setItem(key, url);
    return url;
  }catch{ return null; }
}

function CoverImage({ book, width=60, height=90, radius=4, style={} }){
  const fc = FC[book.faction]||C.dim;
  const [url, setUrl] = useState(()=> localStorage.getItem(COVER_CACHE_PREFIX+book.id) ?? null);
  const ref = useRef(null);
  useEffect(()=>{
    if(url !== null) return;
    const obs = new IntersectionObserver(([e])=>{
      if(e.isIntersecting){ obs.disconnect(); fetchBookCover(book).then(v=>{ if(v!==null) setUrl(v); }); }
    },{rootMargin:"300px"});
    if(ref.current) obs.observe(ref.current);
    return ()=>obs.disconnect();
  },[book.id]);

  const base = { width, height, borderRadius:radius, overflow:"hidden", flexShrink:0, ...style };

  if(url === null){
    // Not yet fetched — placeholder with IntersectionObserver ref
    return(
      <div ref={ref} style={{...base, background:`linear-gradient(160deg,${fc}cc,${fc}55)`, display:"flex", alignItems:"center", justifyContent:"center", padding:4}}>
        <span style={{fontFamily:"'Cinzel',serif", fontSize:Math.max(6,width*0.12), color:"rgba(255,255,255,0.75)", lineHeight:1.3, textAlign:"center", wordBreak:"break-word", overflow:"hidden"}}>{book.title}</span>
      </div>
    );
  }
  if(url===""){
    // Fetched but no cover found — static faction-coloured block
    return <div style={{...base, background:`linear-gradient(160deg,${fc}cc,${fc}55)`, display:"flex", alignItems:"center", justifyContent:"center", padding:4}}><span style={{fontFamily:"'Cinzel',serif", fontSize:Math.max(6,width*0.12), color:"rgba(255,255,255,0.6)", lineHeight:1.3, textAlign:"center", wordBreak:"break-word", overflow:"hidden"}}>{book.title}</span></div>;
  }
  return(
    <div ref={ref} style={base}>
      <img src={url} alt={book.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={()=>setUrl("")}/>
    </div>
  );
}

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
    if(fileType==="pdf") return <PdfReader url={url} title={book.title} bookId={book.id} userId={user?.id} onClose={()=>setReader(null)}/>;
    return <EpubReader url={url} title={book.title} bookId={book.id} userId={user?.id} initProgress={progress} initChapterIndex={chapterIndex||0} initPageIndex={reader.pageIndex||0} onProgress={()=>{}} onClose={()=>setReader(null)}/>;
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
                          <CoverImage book={book} width={54} height={80} radius={3}/>
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
                          <CoverImage book={book} width={36} height={52} radius={2}/>
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
                  <CoverImage book={book} width={54} height={80} radius={3}/>
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
                    <CoverImage book={book} width={36} height={52} radius={2}/>
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

// ─── NEXT BOOK SUGGESTION ─────────────────────────────────────────────────────
// Returns { book, reason, seriesProgress } or null
function getNextSuggestion(statuses) {
  const COLD_STARTS = ["Horus Rising","Eisenhorn","Gaunt's Ghosts","Ultramarines: The Omnibus","Night Lords: The Omnibus"];

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

  const suggestion = useMemo(()=>getNextSuggestion(statuses),[statuses]);
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
            <CoverImage book={suggestion.book} width={64} height={96} radius={4} style={{boxShadow:"0 4px 12px rgba(0,0,0,0.5)",flexShrink:0}}/>
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

function LoreSection(){
  const [wikiSearch,setWikiSearch]=useState("");
  // eslint-disable-next-line no-unused-vars
  const _unused=null; // FACTIONS_LORE/TIMELINE_LORE/PRIMARCHS_LORE kept for future use

  const openWikiSearch=()=>{
    const q=wikiSearch.trim();
    if(!q) return;
    window.open(`https://warhammer40k.fandom.com/wiki/Special:Search?query=${encodeURIComponent(q)}`,'_blank','noopener');
  };

  const QUICK_LINKS=[
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
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:6}}>Warhammer 40,000</div>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.text,marginBottom:6}}>Lore & Resources</h2>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.6}}>Direct access to the best online encyclopedias. WH40K lore is vast — let the experts handle it.</p>
      </div>

      {/* search bar → apre wiki */}
      <div style={{padding:"16px 16px 0"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>Search on Fandom Wiki</div>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1,position:"relative"}}>
            <input value={wikiSearch} onChange={e=>setWikiSearch(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&openWikiSearch()}
              placeholder="Space Marines, Horus, Aeldari…"
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
      </div>

      {/* quick links grid */}
      <div style={{padding:"8px 16px 16px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>Quick Access</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {QUICK_LINKS.map(q=>(
            <a key={q.wiki} href={`https://warhammer40k.fandom.com/wiki/${q.wiki}`} target="_blank" rel="noopener noreferrer"
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
  const suggestion=useMemo(()=>getNextSuggestion(statuses),[statuses]);
  const [opening,setOpening]=useState(false);
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
      <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.gold,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>⚔ Next Up</div>
      <div style={{background:`linear-gradient(135deg,${C.gold}12,${C.card})`,border:`1px solid ${C.gold}44`,borderLeft:`3px solid ${C.gold}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
        <CoverImage book={suggestion.book} width={44} height={64} radius={3} style={{boxShadow:"0 2px 8px rgba(0,0,0,0.5)"}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:1,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{suggestion.reason.toUpperCase()}{suggestion.seriesProgress?` · ${suggestion.seriesProgress}`:""}</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:C.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{suggestion.book.title}</div>
          <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{suggestion.book.author}</div>
        </div>
        <button onClick={handle} disabled={opening}
          style={{flexShrink:0,padding:"8px 12px",borderRadius:8,background:`linear-gradient(135deg,${C.gold},#8a6f28)`,border:"none",color:C.bg,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,cursor:"pointer",fontWeight:700}}>
          {opening?"…":"READ ›"}
        </button>
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
  const wantCount=Object.values(statuses).filter(s=>s.status==='want').length;

  // books to show on shelf: uploaded first, then reading, then want, then read
  const shelfBooks=useMemo(()=>{
    const uploaded=BOOKS.filter(b=>uploadedIds.has(b.id));
    const reading=BOOKS.filter(b=>!uploadedIds.has(b.id)&&statuses[b.id]?.status==='reading');
    const want=BOOKS.filter(b=>!uploadedIds.has(b.id)&&statuses[b.id]?.status==='want');
    const read=BOOKS.filter(b=>!uploadedIds.has(b.id)&&statuses[b.id]?.status==='read');
    return [...uploaded,...reading,...want,...read].slice(0,40);
  },[uploadedIds,statuses]);

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
              const titleChars=b.title.split('');
              const isReading=bst==='reading';
              const isRead=bst==='read';
              return(
                <div key={b.id} onClick={()=>setSection('library')} title={`${b.title} — ${b.author}`}
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
          {n:uploadedIds.size,l:"Ebook",c:C.gold},
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
              <CoverImage book={b} width={36} height={50} radius={3}/>
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
            <div style={{color:C.muted,fontSize:13,fontStyle:"italic",marginBottom:12}}>No books on the shelf yet.</div>
            <button onClick={()=>setSection('library')} style={{background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,color:C.gold,padding:"8px 20px",fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,cursor:"pointer"}}>Go to Library →</button>
          </div>
        ):(
          <>
            {/* chunk books into rows of ~12 */}
            {[0,1,2].map(row=>{
              const rowBooks=shelfBooks.slice(row*13,(row+1)*13);
              if(!rowBooks.length)return null;
              return <ShelfRow key={row} books={rowBooks}/>;
            })}
          </>
        )}
      </div>

      {/* legend */}
      {shelfBooks.length>0&&(
        <div style={{padding:"12px 16px",display:"flex",gap:16,flexWrap:"wrap",borderTop:`1px solid ${C.border}`,marginTop:8}}>
          {[{c:C.blue,l:"Reading"},{c:C.green,l:"Read"},{c:C.gold,l:"With Ebook"}].map(x=>(
            <div key={x.l} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:12,height:3,background:x.c,borderRadius:2}}/>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,letterSpacing:1}}>{x.l}</span>
            </div>
          ))}
        </div>
      )}

      {/* quick nav */}
      <div style={{padding:"16px 16px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{id:"library",icon:"📚",label:"Library",sub:`${BOOKS.length} titles`},
          {id:"reading",icon:"📖",label:"Crusade",sub:`${readCount} completed`},
          {id:"lore",icon:"⚔️",label:"Encyclopedia",sub:"Factions & Primarchs"},
          {id:"painting",icon:"🎨",label:"Painting",sub:"Your miniatures"},
        ].map(n=>(
          <button key={n.id} onClick={()=>setSection(n.id)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:22,flexShrink:0}}>{n.icon}</span>
            <div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.text,letterSpacing:1}}>{n.label}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,letterSpacing:1,marginTop:2}}>{n.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const NAV=[{id:"home",icon:"🏛️",label:"Home"},{id:"library",icon:"📚",label:"Library"},{id:"lore",icon:"⚔️",label:"Lore"},{id:"reading",icon:"📖",label:"Crusade"},{id:"painting",icon:"🎨",label:"Painting"}];

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

  const [section,setSection]=useState("home");
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
  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700;900&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{height:100%;background:${C.bg};color:${C.text};font-family:system-ui,-apple-system,sans-serif;}
        input,select,button{font-family:inherit;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-thumb{background:${C.dim};border-radius:2px;}
        @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
        @keyframes hexPulse{0%,100%{opacity:.2;}50%{opacity:.8;}}
        @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
        @keyframes slideLeft{from{transform:translateX(100%);}to{transform:translateX(0);}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
      `}</style>
      <div style={{display:"flex",flexDirection:"column",height:"100svh",maxWidth:600,margin:"0 auto",background:C.bg}}>
        {/* ── HEADER ── */}
        <div style={{flexShrink:0,height:50,background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",gap:0,position:"relative"}}>
          <div style={{height:2,position:"absolute",top:0,left:0,right:0,background:`linear-gradient(to right,transparent,${C.red},transparent)`}}/>
          {/* title */}
          <button onClick={()=>setSection("home")} style={{background:"transparent",border:"none",cursor:"pointer",padding:0,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
            <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:13,fontWeight:900,color:C.text,letterSpacing:2,lineHeight:1}}>WH40K</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:7,color:C.goldDim,letterSpacing:4,textTransform:"uppercase"}}>Companion</div>
          </button>
          {/* section label center */}
          <div style={{flex:1,textAlign:"center"}}>
            {section!=="home"&&<span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:3,textTransform:"uppercase"}}>{curNav?.label||""}</span>}
          </div>
          {/* auth right */}
          {user?(
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {user.user_metadata?.avatar_url&&<img src={user.user_metadata.avatar_url} alt="" style={{width:26,height:26,borderRadius:"50%",border:`1px solid ${C.gold}55`}}/>}
              <button onClick={signOut} style={{background:"transparent",border:`1px solid ${C.dim}`,borderRadius:6,color:C.muted,padding:"4px 10px",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,cursor:"pointer"}}>LOGOUT</button>
            </div>
          ):(
            <button onClick={signInWithGoogle} style={{background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,color:C.gold,padding:"5px 12px",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,cursor:"pointer"}}>LOGIN</button>
          )}
        </div>
        {/* ── CONTENT ── */}
        <div ref={mainRef} style={{flex:1,overflowY:"auto",overscrollBehavior:"contain"}}>
          {appReader?(
            appReader.fileType==="pdf"
              ?<PdfReader url={appReader.url} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} onClose={()=>setAppReader(null)}/>
              :<EpubReader url={appReader.url} title={appReader.book.title} bookId={appReader.book.id} userId={user?.id} initProgress={appReader.progress} initChapterIndex={appReader.chapterIndex} initPageIndex={appReader.pageIndex} onProgress={()=>{}} onClose={()=>setAppReader(null)}/>
          ):(
            <>
              {section==="home"    &&<HomePage user={user} setSection={setSection} statuses={statuses} onOpenBook={openBook}/>}
              {section==="library" &&<LibrarySection user={user} statuses={statuses} onStatusChange={updateStatus}/>}
              {section==="lore"    &&<LoreSection/>}
              {section==="reading" &&<ReadingSection user={user} statuses={statuses} onOpenBook={openBook} setSection={setSection}/>}
              {section==="painting"&&<PaintingTracker user={user}/>}
            </>
          )}
        </div>
        {/* ── BOTTOM NAV ── */}
        <div style={{flexShrink:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",height:56}}>
          {NAV.map(n=>(<button key={n.id} onClick={()=>setSection(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",padding:0,borderTop:`2px solid ${section===n.id?C.gold:"transparent"}`,transition:"border-color 0.15s"}}><span style={{fontSize:18,lineHeight:1}}>{n.icon}</span><span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,color:section===n.id?C.gold:C.muted,textTransform:"uppercase"}}>{n.label}</span></button>))}
        </div>
      </div>
    </>
  );
}
