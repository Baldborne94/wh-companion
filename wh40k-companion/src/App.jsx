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
    try{ const r=await fetch(`${SB_URL}/rest/v1/${t}?${q}`,{headers:await this._h()}); return r.ok?r.json():[]; } catch{return[];}
  },
  // conflict: comma-separated columns for ON CONFLICT (PostgREST ?on_conflict param)
  async upsert(t,d,conflict="user_id,book_id") {
    try{
      const r=await fetch(`${SB_URL}/rest/v1/${t}?on_conflict=${conflict}`,{
        method:"POST",
        headers:{...await this._h(),Prefer:"resolution=merge-duplicates,return=representation"},
        body:JSON.stringify(d)
      });
      return r.ok?r.json():null;
    } catch{return null;}
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
  want:   {label:"Da Leggere",  icon:"📋", color:"#c9a84c",bg:"#c9a84c18"},
  reading:{label:"In Lettura",  icon:"📖", color:"#4a8adc",bg:"#1a3a7022"},
  read:   {label:"Letto ✓",     icon:"✅", color:"#4aaa6a",bg:"#1a6a2a22"},
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

// ─── LORE DATABASE ────────────────────────────────────────────────────────────
const LORE_DB = {
  "horus":{ name:"Horus Lupercal",type:"character",subtitle:"Warmaster • Primarch of the Luna Wolves",icon:"👑",safe:"The favoured son of the Emperor and supreme Warmaster of the Imperium. Horus led the Great Crusade and was revered above all other Primarchs — a warrior of unmatched skill, charisma and tactical genius.",spoiler:"Mortally wounded at the Serpent Lodge on Davin, Horus was healed through Chaos corruption. He turned against the Emperor and ignited the Horus Heresy. He died during the Siege of Terra, slain by the Emperor himself.",spoilerFrom:"False Gods (Horus Heresy #2)" },
  "luna wolves":{ name:"Luna Wolves / Sons of Horus",type:"faction",subtitle:"XVI Legion",icon:"🐺",safe:"The XVI Space Marine Legion, personally commanded by Primarch Horus. Renowned throughout the Great Crusade as unstoppable shock troops.",spoiler:"After Horus's corruption the Legion was renamed the Sons of Horus, becoming vanguard of the traitor forces.",spoilerFrom:"False Gods (HH #2)" },
  "emperor":{ name:"The Emperor of Mankind",type:"character",subtitle:"The Master of Mankind",icon:"⚜",safe:"The immortal ruler of humanity, founder of the Imperium and creator of the Primarchs. The most powerful psyker in human history.",spoiler:"Mortally wounded by Horus at the Siege of Terra, the Emperor was interred within the Golden Throne — existing in a state of living death.",spoilerFrom:"The End and the Death (Siege of Terra)" },
  "primarch":{ name:"Primarchs",type:"concept",subtitle:"The Emperor's Demigod Sons",icon:"🧬",safe:"Twenty demigod warriors created by the Emperor from his own genetic material. Each was superhuman in power, intellect and force of personality — gene-fathers of the Space Marine Legions.",spoiler:"Nine sided with Horus (Traitor Legions), nine remained loyal. The conflict shattered the original Legion structure forever.",spoilerFrom:"Various (Horus Heresy series)" },
  "space marines":{ name:"Space Marines",type:"faction",subtitle:"Adeptus Astartes",icon:"⬡",safe:"Genetically enhanced superhuman warriors created from the Emperor's genetic blueprint. Each receives 19 gene-seed implants that transform them into towering warriors of superhuman ability.",spoiler:null,spoilerFrom:null },
  "chaos":{ name:"Chaos",type:"concept",subtitle:"The Ruinous Powers",icon:"⛧",safe:"The collective name for the malevolent energies of the Warp. Four major gods: Khorne (war), Tzeentch (change), Nurgle (decay), Slaanesh (excess). Chaos tempts, corrupts and destroys.",spoiler:null,spoilerFrom:null },
  "warp":{ name:"The Warp",type:"concept",subtitle:"The Immaterium",icon:"🌀",safe:"A parallel dimension of pure psychic energy. Source of all psychic power and medium for faster-than-light travel. Also home to daemons, Chaos Gods and malevolent entities that prey on mortal souls.",spoiler:null,spoilerFrom:null },
  "isstvan iii":{ name:"Isstvan III",type:"battle",subtitle:"The First Betrayal",icon:"☠",safe:"A planetary bombardment ordered by Horus. Loyalist Space Marines from the traitor legions were deployed to the surface, then bombarded with lethal virus bombs — killed by their own commanders.",spoiler:"Survivors led by Captain Garro fought back against the traitors. This event marked the first open act of the Heresy.",spoilerFrom:"Galaxy in Flames (HH #3)" },
  "isstvan v":{ name:"Isstvan V",type:"battle",subtitle:"The Drop Site Massacre",icon:"💀",safe:"A world in the Isstvan system where Horus's rebellion first became open war.",spoiler:"Three loyalist Legions were deployed to crush the traitors, only to be betrayed when four more supposedly loyal Legions turned their guns on them. Tens of thousands of Space Marines were killed.",spoilerFrom:"Fulgrim (HH #5)" },
  "great crusade":{ name:"The Great Crusade",type:"event",subtitle:"~800-005.M31",icon:"⚔️",safe:"The Emperor's grand campaign to reunite all of humanity under a single Imperium, conducted over two centuries. Led by the Primarchs and their Legions.",spoiler:null,spoilerFrom:null },
  "death guard":{ name:"Death Guard",type:"faction",subtitle:"XIV Legion",icon:"☣",safe:"The XIV Space Marine Legion, led by Primarch Mortarion. Known for their legendary endurance. Specialists in grinding, implacable warfare and siege combat.",spoiler:"During the Heresy the fleet became becalmed in the Warp. Nurgle offered salvation from a plague killing the entire fleet. Mortarion accepted — transforming the Legion into Plague Marines.",spoilerFrom:"The Buried Dagger (HH #54)" },
  "thousand sons":{ name:"Thousand Sons",type:"faction",subtitle:"XV Legion",icon:"🔮",safe:"The XV Space Marine Legion led by Magnus the Red. A Legion of prodigious psychic talent — virtually every warrior was a psyker. They pursued knowledge and sorcery with obsessive dedication.",spoiler:"Magnus made a catastrophic mistake using forbidden sorcery. As punishment the Space Wolves were sent to destroy Prospero. The Thousand Sons eventually fell to Tzeentch.",spoilerFrom:"A Thousand Sons (HH #12)" },
  "word bearers":{ name:"Word Bearers",type:"faction",subtitle:"XVII Legion",icon:"📖",safe:"The XVII Legion led by Lorgar Aurelian. The most devout of all the Legions — fervent missionaries who spread the Emperor's creed. They constructed vast temples demanding worship.",spoiler:"The Emperor publicly humiliated Lorgar for his religious devotion. This broke Lorgar, who found true gods in Chaos. The Word Bearers became the first Legion to turn traitor.",spoilerFrom:"The First Heretic (HH #14)" },
  "night lords":{ name:"Night Lords",type:"faction",subtitle:"VIII Legion",icon:"🦇",safe:"The VIII Legion led by Konrad Curze. Masters of terror and psychological warfare. They operated in darkness, spreading fear through brutal theatrical violence.",spoiler:null,spoilerFrom:null },
  "alpha legion":{ name:"Alpha Legion",type:"faction",subtitle:"XX Legion",icon:"🐍",safe:"The XX Legion — most secretive of all, masters of infiltration and subversion. Led by twin Primarchs Alpharius and Omegon. Their motto: 'I am Alpharius.'",spoiler:null,spoilerFrom:null },
  "inquisition":{ name:"The Inquisition",type:"faction",subtitle:"Ordo Malleus • Ordo Xenos • Ordo Hereticus",icon:"🔍",safe:"The secret organisation protecting the Imperium from threats within and without. Inquisitors wield near-unlimited authority, investigating heresy, daemon incursion and alien infiltration.",spoiler:null,spoilerFrom:null },
  "sanguinius":{ name:"Sanguinius",type:"character",subtitle:"Primarch of the Blood Angels",icon:"🩸",safe:"Primarch of the Blood Angels. Possessed of angelic wings and impossible beauty, considered by many to be the greatest of all the Primarchs. A warrior-poet of extraordinary compassion.",spoiler:"Sanguinius was slain by Horus at the Siege of Terra. His death created the Sanguinary curse — the Black Rage — that afflicts Blood Angels to this day.",spoilerFrom:"Fear to Tread (HH #21)" },
  "prospero":{ name:"Prospero",type:"battle",subtitle:"The Burning of Prospero",icon:"🔥",safe:"Homeworld of the Thousand Sons. A world of crystal cities and vast libraries of forbidden lore.",spoiler:"The Emperor dispatched the Space Wolves to destroy Prospero as punishment for Magnus's forbidden sorcery. Prospero burned, and Magnus made a pact with Tzeentch.",spoilerFrom:"A Thousand Sons (#12) / Prospero Burns (#15)" },
  "aeldari":{ name:"Aeldari (Eldar)",type:"faction",subtitle:"The Elder Race",icon:"◇",safe:"An ancient race whose Fall shattered their empire and birthed the Chaos God Slaanesh. Now a dying race, surviving Aeldari live aboard vast Craftworld ships.",spoiler:null,spoilerFrom:null },
  "necrons":{ name:"Necrons",type:"faction",subtitle:"The Undying Legions",icon:"☽",safe:"An ancient race of living metal warriors who slumbered for sixty million years. Once flesh-and-blood, the Necrontyr transferred their consciousnesses into indestructible metal bodies.",spoiler:null,spoilerFrom:null },
  "eisenhorn":{ name:"Gregor Eisenhorn",type:"character",subtitle:"Inquisitor • Ordo Xenos",icon:"🔍",safe:"One of the most renowned Inquisitors of his age. A skilled investigator, powerful psyker and relentless hunter of heresy and alien conspiracy.",spoiler:"Over decades Eisenhorn increasingly uses radical methods including daemonhosts. His colleagues brand him a radical and eventually a heretic.",spoilerFrom:"Malleus (Eisenhorn #2)" },
  "gaunt":{ name:"Ibram Gaunt",type:"character",subtitle:"Colonel-Commissar • Tanith First",icon:"🎖",safe:"Colonel-Commissar of the Tanith First-and-Only. A rare combination of field commander and political officer who earned fierce loyalty through competence and genuine care.",spoiler:null,spoilerFrom:null },
  "tanith":{ name:"Tanith First-and-Only",type:"faction",subtitle:"Gaunt's Ghosts",icon:"🎖",safe:"An Imperial Guard regiment from the destroyed world of Tanith. Unparalleled scouts and light infantry using stealth skills and camo-cloaks. They serve in the brutal Sabbat Worlds Crusade.",spoiler:null,spoilerFrom:null },
};

const KW_KEYS  = Object.keys(LORE_DB).sort((a,b)=>b.length-a.length);
const KW_REGEX = new RegExp(`\\b(${KW_KEYS.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})\\b`,"gi");

function highlightKeywords(html) {
  return html.split(/(<[^>]+>)/).map((part,i)=>{
    if(i%2===1||part.includes("lore-kw")) return part;
    return part.replace(KW_REGEX, m=>{
      const k=m.toLowerCase(); if(!LORE_DB[k]) return m;
      return `<span class="lore-kw" data-kw="${k}" style="color:#c9a84c;cursor:pointer;border-bottom:1px dotted #c9a84c66;font-style:normal;">${m}</span>`;
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
            <Btn label="Scroll" active={!settings.paginate} onClick={()=>onChange("paginate",false)}/>
          </div>
        </Row>
      </div>
    </div>
  );
}

// ─── EPUB READER ──────────────────────────────────────────────────────────────
function EpubReader({ url, title, bookId, userId, initProgress, initChapterIndex, onProgress, onClose }) {
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [chapters,  setChapters]  = useState([]);
  const [chIdx,     setChIdx]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [settings, setSettings] = useState({
    theme:"dark", fontIndex:0, fontSize:18, lineHeight:1.8, margin:24, paginate:true,
  });
  const updateSetting = (key,val) => setSettings(s=>({...s,[key]:val}));
  const T   = THEMES[settings.theme];
  const fnt = FONTS[settings.fontIndex];

  const outerRef    = useRef(null);
  const innerRef    = useRef(null);
  const [pageIndex, setPageIndex]   = useState(0);
  const [totalPages,setTotalPages]  = useState(1);
  const [pageWidth, setPageWidth]   = useState(0);
  const [pageHeight,setPageHeight]  = useState(0);

  const [showUI,       setShowUI]       = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc,      setShowToc]      = useState(false);
  const [loreKey,      setLoreKey]      = useState(null);
  const [dictWord,     setDictWord]     = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint,     setShowHint]     = useState(()=>!localStorage.getItem("wh40k_lore_hint"));
  const uiTimerRef  = useRef(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchMoved  = useRef(false);

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
  const measurePages = useCallback(()=>{
    if(!outerRef.current||!innerRef.current||!settings.paginate) return;
    const ow=outerRef.current.clientWidth;
    const oh=outerRef.current.clientHeight;
    setPageWidth(ow); setPageHeight(oh);
    setTimeout(()=>{
      if(innerRef.current){
        setTotalPages(Math.max(1,Math.round(innerRef.current.scrollWidth/ow)));
        setPageIndex(0);
      }
    },150);
  },[settings.paginate]);

  useEffect(()=>{ measurePages(); },[chIdx,settings,chapters,measurePages]);
  useEffect(()=>{
    if(!outerRef.current) return;
    const ro=new ResizeObserver(measurePages); ro.observe(outerRef.current); return()=>ro.disconnect();
  },[measurePages]);

  // ── Save progress (chapter + page) ────────────────────────────────────────
  useEffect(()=>{
    if(!chapters.length||!userId) return;
    const pct=(chIdx+(pageIndex/Math.max(1,totalPages)))/chapters.length;
    onProgress(pct);
    sb.upsert("reading_progress",{user_id:userId,book_id:bookId,chapter_index:chIdx,page_index:pageIndex,progress_pct:pct,last_read:new Date().toISOString()},"user_id,book_id");
    if(userId) localStorage.setItem(`wh40k_prog_${userId}_${bookId}`, JSON.stringify({progress_pct:pct,chapter_index:chIdx,page_index:pageIndex}));
  },[chIdx,pageIndex,chapters.length,totalPages]);

  useEffect(()=>{ setPageIndex(0); },[chIdx]);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(()=>{
    if(!document.fullscreenElement){ document.documentElement.requestFullscreen?.(); }
    else { document.exitFullscreen?.(); }
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

  // ── Auto-hide top/bottom bars ──────────────────────────────────────────────
  const resetUiTimer = useCallback(()=>{
    if(uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if(!showSettings&&!showToc&&!loreKey&&!dictWord)
      uiTimerRef.current=setTimeout(()=>setShowUI(false),4000);
  },[showSettings,showToc,loreKey,dictWord]);
  useEffect(()=>{ if(showUI) resetUiTimer(); return()=>{ if(uiTimerRef.current) clearTimeout(uiTimerRef.current); }; },[showUI,resetUiTimer]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const prevPage=useCallback(()=>{
    if(pageIndex>0){ setPageIndex(p=>p-1); setShowUI(true); }
    else if(chIdx>0){ setChIdx(c=>c-1); }
  },[pageIndex,chIdx]);

  const nextPage=useCallback(()=>{
    if(pageIndex<totalPages-1){ setPageIndex(p=>p+1); setShowUI(true); }
    else if(chIdx<chapters.length-1){ setChIdx(c=>c+1); }
  },[pageIndex,totalPages,chIdx,chapters.length]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(()=>{
    const handler=(e)=>{
      if(showSettings||loreKey||dictWord) return;
      if(e.key==="ArrowRight"||e.key==="ArrowDown"){ e.preventDefault(); nextPage(); setShowUI(true); return; }
      if(e.key==="ArrowLeft"||e.key==="ArrowUp"){ e.preventDefault(); prevPage(); setShowUI(true); return; }
      if(e.key===" "){ e.preventDefault(); nextPage(); setShowUI(true); return; }
      if(e.key==="Escape"){ if(showToc){setShowToc(false);}else{onClose();} return; }
      if(e.key==="f"||e.key==="F"){ toggleFullscreen(); return; }
      if(e.key==="t"||e.key==="T"){ setShowToc(v=>!v); setShowUI(true); return; }
    };
    document.addEventListener("keydown",handler);
    return()=>document.removeEventListener("keydown",handler);
  },[showSettings,showToc,loreKey,dictWord,nextPage,prevPage,onClose,toggleFullscreen]);

  // ── Scroll-mode progress tracking ────────────────────────────────────────
  const handleScroll=useCallback(()=>{
    if(!outerRef.current||settings.paginate||!chapters.length) return;
    const {scrollTop,scrollHeight,clientHeight}=outerRef.current;
    if(scrollHeight<=clientHeight) return;
    const scrollPct=scrollTop/(scrollHeight-clientHeight);
    const pct=(chIdx+scrollPct)/chapters.length;
    onProgress(pct);
  },[chIdx,chapters.length,settings.paginate,onProgress]);

  // ── Touch ─────────────────────────────────────────────────────────────────
  const onTouchStart=e=>{ touchStartX.current=e.touches[0].clientX; touchStartY.current=e.touches[0].clientY; touchMoved.current=false; };
  const onTouchMove =e=>{ if(Math.abs(e.touches[0].clientX-touchStartX.current)>10) touchMoved.current=true; };
  const onTouchEnd  =e=>{
    const dx=touchStartX.current-e.changedTouches[0].clientX;
    const dy=Math.abs(touchStartY.current-e.changedTouches[0].clientY);
    if(dy>40) return;
    if(dx>50){ nextPage(); return; }
    if(dx<-50){ prevPage(); return; }
    if(!touchMoved.current){
      const x=e.changedTouches[0].clientX;
      const W=window.innerWidth;
      if(x<W*0.25){ prevPage(); return; }
      if(x>W*0.75){ nextPage(); return; }
      setShowUI(u=>!u);
    }
  };

  // ── Lore click / dictionary selection ─────────────────────────────────────
  const handleContentClick=useCallback(e=>{
    const kw=e.target.getAttribute?.("data-kw");
    if(kw&&LORE_DB[kw]){ setLoreKey(kw); }
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

  return(
    <div style={{position:"fixed",inset:0,zIndex:600,background:T.bg,display:"flex",flexDirection:"column",transition:"background 0.3s"}}>

      {/* ── TOP BAR ── */}
      <div style={{flexShrink:0,height:52,background:T.ui,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 10px",gap:6,transition:"opacity 0.3s,transform 0.3s",opacity:showUI?1:0,transform:showUI?"translateY(0)":"translateY(-100%)",pointerEvents:showUI?"auto":"none",zIndex:2}}>
        <button onClick={onClose} title="Back (Esc)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"7px 12px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,flexShrink:0}}>← Back</button>
        <div style={{flex:1,fontFamily:"'Cinzel',serif",fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",padding:"0 4px"}}>{title}</div>
        {readingMinutes&&(
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:1,flexShrink:0,whiteSpace:"nowrap"}}>~{readingMinutes} min</div>
        )}
        <button onClick={()=>{
          // Salva segnalibro: posizione attuale già salvata in localStorage, mostra conferma
          if(userId&&bookId){
            const key=`wh40k_prog_${userId}_${bookId}`;
            const existing=localStorage.getItem(key);
            if(existing) localStorage.setItem(key,existing); // refresh timestamp visivo
          }
          setBookmarkSaved(true);
          setTimeout(()=>setBookmarkSaved(false),2000);
        }} title="Segna posizione (B)" style={{background:bookmarkSaved?`${C.gold}22`:"transparent",border:`1px solid ${bookmarkSaved?C.gold:T.border}`,borderRadius:6,color:bookmarkSaved?C.gold:T.muted,width:34,height:34,cursor:"pointer",fontSize:16,flexShrink:0,position:"relative"}}>
          🔖
          {bookmarkSaved&&<span style={{position:"absolute",top:-28,left:"50%",transform:"translateX(-50%)",background:C.gold,color:C.bg,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,padding:"3px 7px",borderRadius:4,whiteSpace:"nowrap",pointerEvents:"none"}}>Salvato ✓</span>}
        </button>
        <button onClick={()=>{setShowToc(t=>!t);setShowUI(true);}} title="Contents (T)" style={{background:showToc?`${C.gold}22`:"transparent",border:`1px solid ${showToc?C.gold:T.border}`,borderRadius:6,color:showToc?C.gold:T.muted,width:34,height:34,cursor:"pointer",fontSize:16,flexShrink:0}}>≡</button>
        <button onClick={toggleFullscreen} title="Fullscreen (F)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,color:isFullscreen?C.gold:T.muted,width:34,height:34,cursor:"pointer",fontSize:13,flexShrink:0}}>{isFullscreen?"⛶":"⛶"}</button>
        <button onClick={()=>{setShowSettings(true);setShowUI(true);}} title="Settings" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,color:T.muted,width:34,height:34,cursor:"pointer",fontSize:16,flexShrink:0}}>⚙</button>
      </div>

      {/* ── PROGRESS BAR ── */}
      <div style={{height:2,background:T.border,flexShrink:0,zIndex:2}}>
        <div style={{height:"100%",width:`${globalPct}%`,background:`linear-gradient(to right,${C.gold},${C.red})`,transition:"width 0.5s"}}/>
      </div>

      {/* ── READING AREA ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden",position:"relative"}}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={handleContentClick} onMouseUp={handleMouseUp}>

        {/* TOC sidebar */}
        {showToc&&(
          <div style={{width:220,flexShrink:0,background:T.ui,borderRight:`1px solid ${T.border}`,overflowY:"auto",position:"absolute",top:0,left:0,bottom:0,zIndex:3,animation:"slideLeft 0.2s ease"}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",padding:"14px 16px 10px",borderBottom:`1px solid ${T.border}`}}>Contents</div>
            {chapters.map((ch,i)=>(
              <button key={i} onClick={()=>{setChIdx(i);setPageIndex(0);setShowToc(false);setShowUI(true);}} style={{display:"block",width:"100%",textAlign:"left",background:i===chIdx?`${C.gold}18`:"transparent",border:"none",borderLeft:`3px solid ${i===chIdx?C.gold:"transparent"}`,padding:"10px 16px",color:i===chIdx?C.gold:T.muted,fontSize:12,cursor:"pointer",lineHeight:1.4,transition:"background 0.15s"}}>{ch.label}</button>
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
          // outerRef: provides vertical padding on EVERY page (top+bottom 24px)
          // boxSizing:border-box ensures height:"100%" doesn't overflow parent
          <div ref={outerRef} style={{flex:1,overflow:"hidden",position:"relative",height:"100%",paddingTop:"24px",paddingBottom:"24px",boxSizing:"border-box"}}>
            <div ref={innerRef} className="epub-col" style={{
              // Build style explicitly — don't spread readerStyle (its padding breaks columns)
              fontFamily:fnt.value,fontSize:settings.fontSize,lineHeight:settings.lineHeight,
              color:T.text,wordBreak:"break-word",hyphens:"auto",textAlign:"justify",
              // Horizontal margins: padding-left + column-gap trick gives margin on BOTH sides of every page
              // column-width = pageWidth - 2×margin  →  each column is exactly one page of readable text
              // column-gap   = 2×margin              →  half-gap = right-margin on current page, half-gap = left-margin on next page
              paddingLeft:`${settings.margin}px`,
              paddingRight:`${settings.margin}px`,
              columnWidth:`${Math.max(100,(pageWidth||300)-2*settings.margin)}px`,
              columnFill:"auto",
              columnGap:`${2*settings.margin}px`,
              // Height minus the 48px of outerRef vertical padding
              height:pageHeight?`${pageHeight-48}px`:"100%",
              transform:`translateX(-${pageIndex*(pageWidth||300)}px)`,
              transition:"transform 0.28s cubic-bezier(.4,0,.2,1)",
              willChange:"transform",
            }} dangerouslySetInnerHTML={{__html:chapters[chIdx]?.html||""}}/>
            <div style={{position:"absolute",top:0,left:0,width:"25%",height:"100%",cursor:"w-resize"}} onClick={e=>{e.stopPropagation();prevPage();setShowUI(true);}}/>
            <div style={{position:"absolute",top:0,right:0,width:"25%",height:"100%",cursor:"e-resize"}} onClick={e=>{e.stopPropagation();nextPage();setShowUI(true);}}/>
          </div>
        ) : (
          <div style={{flex:1,overflowY:"auto",position:"relative"}} ref={outerRef} onScroll={handleScroll}>
            <div ref={innerRef} style={readerStyle} dangerouslySetInnerHTML={{__html:chapters[chIdx]?.html||""}}/>
          </div>
        )}
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{flexShrink:0,background:T.ui,borderTop:`1px solid ${T.border}`,height:56,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",transition:"opacity 0.3s,transform 0.3s",opacity:showUI?1:0,transform:showUI?"translateY(0)":"translateY(100%)",pointerEvents:showUI?"auto":"none"}}>
        <button onClick={prevPage} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1}}>← Prev</button>
        <div style={{textAlign:"center"}}>
          {settings.paginate?(
            <>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.muted}}>p. {pageIndex+1} / {totalPages}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim}}>ch. {chIdx+1}/{chapters.length} · {globalPct}%</div>
            </>
          ):(
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.muted}}>ch. {chIdx+1} / {chapters.length} · {globalPct}%</div>
          )}
        </div>
        <button onClick={nextPage} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1}}>Next →</button>
      </div>

      {/* ── LORE HINT (first open only) ── */}
      {showHint&&(
        <div style={{position:"absolute",bottom:64,left:"50%",transform:"translateX(-50%)",background:`${T.ui}f0`,border:`1px solid ${C.gold}55`,borderRadius:20,padding:"6px 16px",whiteSpace:"nowrap",pointerEvents:"none",zIndex:5,animation:"slideUp 0.3s ease"}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:1}}>✨ Tap gold words for lore · Select text for dictionary</span>
        </div>
      )}

      {/* ── KEYBOARD HINT (desktop, fades after UI hides) ── */}
      {showUI&&!showHint&&(
        <div style={{position:"absolute",bottom:64,right:14,background:`${T.ui}cc`,border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 10px",pointerEvents:"none",opacity:0.55,zIndex:4}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:T.muted,letterSpacing:1}}>← → · Space · F fullscreen · T contents · Esc back</span>
        </div>
      )}

      {/* ── OVERLAYS ── */}
      {showSettings&&<SettingsPanel settings={settings} onChange={updateSetting} onClose={()=>setShowSettings(false)}/>}
      {loreKey&&<LorePanel kwKey={loreKey} onClose={()=>setLoreKey(null)} theme={settings.theme}/>}
      {dictWord&&<DictionaryPanel word={dictWord} onClose={()=>setDictWord(null)} theme={settings.theme}/>}
    </div>
  );
}

// ─── PDF READER ───────────────────────────────────────────────────────────────
function PdfReader({ url, title, onClose }) {
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
  const [progress,     setProgress]     = useState(0);
  const [chapterIndex, setChapterIndex] = useState(0);

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
      } else {
        const cp=localStorage.getItem(`wh40k_prog_${user.id}_${book.id}`);
        if(cp){ try{ const p=JSON.parse(cp); setProgress(p.progress_pct||0); setChapterIndex(p.chapter_index||0); }catch{} }
      }
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
      await sb.upsert("ebook_files",meta,"user_id,book_id");
      const lsKey = `wh40k_ebook_${user.id}_${book.id}`;
      localStorage.setItem(lsKey, JSON.stringify(meta));
      setEbookMeta(meta); setUploadMsg("✅ Uploaded!");
    } else { setUploadMsg("❌ Upload failed — check Supabase storage policy."); }
    setUploading(false); setTimeout(()=>setUploadMsg(""),3000);
  };

  const handleOpenReader=async()=>{
    if(!ebookMeta) return;
    setUploadMsg("Opening…");
    const url=await sb.storage.signedUrl(ebookMeta.file_path);
    if(!url){ setUploadMsg("❌ Could not open file — try re-uploading."); return; }
    setUploadMsg("");
    onOpenReader({book,url,fileType:ebookMeta.file_type,progress,chapterIndex});
  };

  return(
    <div style={{minHeight:"100%",background:C.bg}}>
      <div style={{position:"sticky",top:0,zIndex:10,background:C.surface,borderBottom:`1px solid ${C.border}`,height:52,display:"flex",alignItems:"center",padding:"0 16px",gap:12}}>
        <button onClick={onBack} style={{background:"transparent",border:`1px solid ${C.dim}`,borderRadius:8,color:C.gold,padding:"7px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:1}}>← Library</button>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.series}{book.num>0?` #${book.num}`:""}</div>
      </div>
      <div style={{background:`linear-gradient(160deg,${fc}55,${C.card})`,borderBottom:`1px solid ${fc}66`,padding:"28px 20px 24px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>{book.series}{book.num>0?` · Book ${book.num}`:""}</div>
        <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:"clamp(18px,5vw,26px)",color:C.text,lineHeight:1.2,marginBottom:6}}>{book.title}</h1>
        <div style={{color:C.muted,fontSize:14,fontStyle:"italic"}}>by {book.author}</div>
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
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase"}}>Reading Progress</span>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.gold}}>{Math.round(progress*100)}%</span>
                    </div>
                    <div style={{height:4,background:C.dim,borderRadius:2}}><div style={{height:"100%",width:`${progress*100}%`,background:`linear-gradient(to right,${C.gold},${C.red})`,borderRadius:2}}/></div>
                  </div>
                )}
                {uploadMsg&&<div style={{color:uploadMsg.startsWith("❌")?C.red:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,textAlign:"center",marginBottom:8}}>{uploadMsg}</div>}
                <button onClick={handleOpenReader} style={{width:"100%",padding:"16px",borderRadius:10,background:`linear-gradient(135deg,${C.gold},#8a6f28)`,border:"none",color:C.bg,fontFamily:"'Cinzel',serif",fontSize:15,letterSpacing:3,textTransform:"uppercase",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                  {progress>0?"📖 Continue Reading":"📖 Start Reading"}
                </button>
                <button onClick={()=>inp.current.click()} style={{marginTop:8,width:"100%",padding:"10px",borderRadius:8,background:"transparent",border:`1px solid ${C.dim}`,color:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer"}}>Replace file</button>
              </>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{color:C.muted,fontSize:13,lineHeight:1.6}}>Load your personal EPUB or PDF — saved to your private cloud, accessible from any device.</div>
                <div style={{background:"#ffffff06",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Reader features</div>
                  <div style={{color:C.dim,fontSize:12,lineHeight:1.8}}>📖 Page-flip or scroll mode<br/>🎨 Dark / Sepia / Paper themes<br/>🔤 Font & typography controls<br/>📚 Gold keywords → lore info<br/>📝 Select words → dictionary</div>
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
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>Stato di Lettura</div>
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
          {curStatus==='read'&&<div style={{marginTop:8,fontSize:11,color:STATUS_CFG.read.color,textAlign:"center",fontFamily:"'Cinzel',serif",letterSpacing:1}}>Questo libro è nella tua collezione dei completati!</div>}
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

function LibrarySection({ user }) {
  const [tab,setTab]=useState("catalogue");
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
  const [statuses,setStatuses]=useState({});

  const handleStatusChange=useCallback((bookId,newStatus)=>{
    setBookStatusLS(user?.id,bookId,newStatus);
    setStatuses(prev=>({...prev,[bookId]:getBookStatus(user?.id,bookId)}));
  },[user?.id]);

  // Carica statuses da localStorage al mount e quando cambia utente
  useEffect(()=>{ setStatuses(loadAllStatuses(user?.id)); },[user?.id]);

  // Carica subito da localStorage al mount (per il contatore IN CLOUD)
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

  useEffect(()=>{
    if(tab==="shelf"){
      setShelfLoading(true);
      sb.get("ebook_files","select=book_id,file_name,file_path,file_type").then(files=>{
        if(files?.length){
          const ids=new Set(files.map(f=>f.book_id));
          setShelfBooks(BOOKS.filter(b=>ids.has(b.id)).map(b=>({...b,_file:files.find(f=>f.book_id===b.id)})));
          setShelfLoading(false);
        } else {
          // Supabase vuoto (schema non configurato o RLS) → fallback localStorage
          if(user?.id){
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
            setShelfBooks(lsBooks);
          } else {
            setShelfBooks([]);
          }
          setShelfLoading(false);
        }
      });
    }
  },[tab, user?.id]);

  const handleOpenReader=({book,url,fileType,progress,chapterIndex})=>setReader({book,url,fileType,progress,chapterIndex});

  if(reader){
    const {book,url,fileType,progress,chapterIndex}=reader;
    if(fileType==="pdf") return <PdfReader url={url} title={book.title} onClose={()=>setReader(null)}/>;
    return <EpubReader url={url} title={book.title} bookId={book.id} userId={user?.id} initProgress={progress} initChapterIndex={chapterIndex||0} onProgress={()=>{}} onClose={()=>setReader(null)}/>;
  }
  if(detail) return <BookDetail book={detail} user={user} onBack={()=>setDetail(null)} onOpenReader={handleOpenReader} status={statuses[detail.id]} onStatusChange={handleStatusChange}/>;

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
            {l:"Letti",v:Object.values(statuses).filter(s=>s.status==='read').length,color:"#4aaa6a"},
            {l:"In Lettura",v:Object.values(statuses).filter(s=>s.status==='reading').length,color:"#4a8adc"},
            {l:"In Cloud",v:shelfBooks.length,color:C.gold},
          ].map(s=>(<div key={s.l}><div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase"}}>{s.l}</div><div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:s.color}}>{s.v}</div></div>))}
        </div>
        <div style={{display:"flex",gap:0}}>
          {[{id:"catalogue",label:"Catalogue"},{id:"shelf",label:`My Shelf${shelfBooks.length>0?` (${shelfBooks.length})`:""}`}].map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===t.id?C.gold:"transparent"}`,color:tab===t.id?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>{t.label}</button>))}
        </div>
      </div>

      {tab==="shelf"&&(
        <div style={{padding:"16px"}}>
          {shelfLoading?(<div style={{textAlign:"center",padding:40,color:C.muted,fontStyle:"italic"}}>Loading your shelf…</div>)
          :shelfBooks.length===0?(<div style={{textAlign:"center",padding:"60px 20px",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}><div style={{fontSize:52}}>📂</div><div style={{fontFamily:"'Cinzel',serif",fontSize:16,color:C.muted}}>Your shelf is empty</div><div style={{color:C.dim,fontSize:13,maxWidth:280,lineHeight:1.6}}>Go to Catalogue, find a book, tap it, and load your EPUB or PDF.</div><button onClick={()=>setTab("catalogue")} style={{background:`${C.gold}22`,border:`1px solid ${C.gold}`,borderRadius:8,padding:"10px 24px",color:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>Browse Catalogue</button></div>)
          :(<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {shelfBooks.map(book=>{
              const fc2=FC[book.faction]||C.dim;
              return(<div key={book.id} onClick={()=>setDetail(book)} style={{background:`linear-gradient(135deg,${fc2}22,${C.card})`,border:`1px solid ${C.gold}55`,borderLeft:`3px solid ${C.gold}`,borderRadius:8,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:28,flexShrink:0}}>📖</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.title}</div>
                  <div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{book.author}</div>
                </div>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.gold,letterSpacing:1,flexShrink:0}}>Read →</span>
              </div>);
            })}
          </div>)}
        </div>
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
          <div style={{padding:"8px 16px",display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setShowFilters(f=>!f)} style={{background:showFilters||isFiltered?`${C.gold}22`:"transparent",border:`1px solid ${showFilters||isFiltered?C.gold:C.dim}`,borderRadius:20,padding:"7px 14px",color:showFilters||isFiltered?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer"}}>⚙ Filters{isFiltered?" •":""}</button>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.muted}}>{filtered.length} tomes</span>
            {isFiltered&&<button onClick={()=>{setSeries("All");setFaction("All");setType("All");setEra("All");}} style={{background:"transparent",border:`1px solid ${C.red}55`,borderRadius:20,padding:"5px 12px",color:C.red,fontFamily:"'Cinzel',serif",fontSize:10,cursor:"pointer"}}>Reset</button>}
          </div>
          {showFilters&&(<div style={{padding:"0 16px 12px",borderBottom:`1px solid ${C.border}`}}>
            {[{label:"Series",value:series,set:setSeries,opts:ALL_SERIES.slice(0,22)},{label:"Faction",value:faction,set:setFaction,opts:ALL_FACTIONS},{label:"Type",value:type,set:setType,opts:ALL_TYPES},{label:"Era",value:era,set:setEra,opts:ALL_ERAS}].map(f=>(<div key={f.label} style={{marginBottom:10}}><div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>{f.label}</div><div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>{f.opts.map(o=><Chip key={o} label={o} active={f.value===o} onClick={()=>f.set(o)}/>)}</div></div>))}
          </div>)}
          <div style={{padding:"10px 16px",display:"flex",flexDirection:"column",gap:8}}>
            {filtered.length===0?(<div style={{textAlign:"center",padding:"60px 20px",color:C.muted,fontStyle:"italic"}}>No tomes found, Inquisitor.</div>)
            :filtered.map(book=>{
              const fc2=FC[book.faction]||C.dim; const tc=book.type==="Codex"?C.red:C.gold;
              const bst=statuses[book.id]?.status||'none';
              const bstCfg=STATUS_CFG[bst];
              const borderColor=bst!=='none'?bstCfg.color:fc2;
              return(<div key={book.id} onClick={()=>setDetail(book)} style={{background:`linear-gradient(135deg,${fc2}22,${C.card})`,border:`1px solid ${bst!=='none'?bstCfg.color+"44":fc2+"55"}`,borderLeft:`3px solid ${borderColor}`,borderRadius:8,padding:"14px 14px 12px",cursor:"pointer",display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:1,textTransform:"uppercase"}}>{book.series}{book.num>0?` #${book.num}`:""}</div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {bst!=='none'&&<span style={{fontSize:13}}>{bstCfg.icon}</span>}
                    <span style={{background:`${tc}22`,border:`1px solid ${tc}44`,borderRadius:4,padding:"2px 7px",fontFamily:"'Cinzel',serif",fontSize:9,color:tc,letterSpacing:1,flexShrink:0}}>{book.type}</span>
                  </div>
                </div>
                <div style={{fontSize:16,fontWeight:700,color:bst==='read'?C.muted:C.text,lineHeight:1.3,fontFamily:"'Cinzel',serif",opacity:bst==='read'?0.75:1}}>{book.title}</div>
                <div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{book.author}</div>
              </div>);
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── READING CRUSADE ──────────────────────────────────────────────────────────
function ReadingSection({user}){
  const [statuses,setStatuses]=useState(()=>loadAllStatuses(user?.id));
  const [expanded,setExpanded]=useState(null);

  useEffect(()=>{ setStatuses(loadAllStatuses(user?.id)); },[user?.id]);

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

  const activeSeries=seriesList.find(s=>s.readingCount>0);

  return(
    <div style={{paddingBottom:80}}>
      {/* Header stats */}
      <div style={{padding:"20px 16px 12px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:6}}>Black Library</div>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.text,marginBottom:14}}>La Tua Crociata</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          {[{label:"Letti",count:readCount,color:C.green},{label:"In Lettura",count:readingCount,color:C.blue},{label:"Da Leggere",count:wantCount,color:C.gold},{label:"Totali",count:BOOKS.length,color:C.muted}].map(s=>(
            <div key={s.label} style={{flex:"1 1 60px",background:C.card,border:`1px solid ${s.color}44`,borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:s.color,lineHeight:1}}>{s.count}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,letterSpacing:2,marginTop:4}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{height:6,background:C.dim,borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${BOOKS.length>0?(readCount/BOOKS.length)*100:0}%`,background:`linear-gradient(to right,${C.green},${C.gold})`,borderRadius:3,transition:"width 0.5s ease"}}/>
        </div>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.muted,letterSpacing:2,marginTop:6,textAlign:"right"}}>{BOOKS.length>0?Math.round((readCount/BOOKS.length)*100):0}% COMPLETATO</div>
      </div>

      {/* Continue reading suggestion */}
      {activeSeries&&(
        <div style={{margin:"14px 16px 0",background:`linear-gradient(135deg,${C.blue}22,${C.card})`,border:`1px solid ${C.blue}44`,borderLeft:`3px solid ${C.blue}`,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.blue,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>Continua la Lettura</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:15,color:C.text,marginBottom:4}}>{activeSeries.name}</div>
          <div style={{fontSize:12,color:C.muted}}>{activeSeries.readCount}/{activeSeries.total} letti · {activeSeries.readingCount} in corso</div>
          {activeSeries.nextBook&&<div style={{marginTop:6,fontSize:11,color:C.gold,fontStyle:"italic"}}>Prossimo: {activeSeries.nextBook.title}</div>}
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
                    <span style={{fontSize:10,color:C.muted}}>{serie.total} libri</span>
                  </div>
                </div>
                <span style={{color:C.goldDim,fontSize:16,flexShrink:0,transition:"transform 0.2s",transform:isExp?"rotate(90deg)":"none"}}>›</span>
              </div>
              {isExp&&(
                <div style={{borderTop:`1px solid ${C.border}`,padding:"8px 14px 10px",display:"flex",flexDirection:"column",gap:4}}>
                  {serie.books.map(b=>{
                    const bs=statuses[b.id]?.status||'none';
                    const cfg=STATUS_CFG[bs];
                    return(
                      <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                        <span style={{fontSize:13,flexShrink:0}}>{cfg.icon}</span>
                        <span style={{fontSize:12,color:bs==='none'?C.muted:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:cfg.color,letterSpacing:1}}>{b.num}</span>
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

// ─── LORE DATA ────────────────────────────────────────────────────────────────
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
  const [article,setArticle]=useState(null);
  const [search,setSearch]=useState("");
  const [cat,setCat]=useState("all");

  const ALL_ARTICLES=useMemo(()=>[
    ...FACTIONS_LORE.map(f=>({id:f.id,type:'faction',cat:'factions',name:f.name,sub:f.sub,color:f.color,icon:f.icon,era:f.era,short:f.short,long:f.long,keyFacts:f.keyFacts,infobox:FACTION_INFOBOXES[f.id]||[]})),
    ...TIMELINE_LORE.map(t=>({id:t.era,type:'timeline',cat:'timeline',name:t.name,sub:t.era,color:t.color,icon:t.icon,era:t.era,short:t.summary.slice(0,130)+'…',long:t.summary,keyFacts:[],infobox:[]})),
    ...PRIMARCHS_LORE.map(p=>({id:`primarch-${p.num}`,type:'primarch',cat:'primarchs',name:p.name,sub:p.legion,color:p.color,icon:p.icon,era:'Horus Heresy',short:p.short,long:p.short+'\n\n'+p.fate,keyFacts:[],infobox:[],status:p.status,loyal:p.loyal,num:p.num,fate:p.fate})),
  ],[]);

  const filtered=useMemo(()=>ALL_ARTICLES.filter(a=>{
    if(cat!=='all'&&a.cat!==cat)return false;
    if(search){const q=search.toLowerCase();return a.name.toLowerCase().includes(q)||a.sub.toLowerCase().includes(q)||a.short.toLowerCase().includes(q);}
    return true;
  }),[ALL_ARTICLES,cat,search]);

  if(article){
    const a=article;
    const paragraphs=a.long.split('\n\n').filter(Boolean);
    const loyalColor=a.loyal===true?C.gold:a.loyal===false?C.red:C.muted;
    return(
      <div style={{paddingBottom:80}}>
        <div style={{position:"sticky",top:0,zIndex:10,background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setArticle(null)} style={{background:"transparent",border:`1px solid ${C.dim}`,borderRadius:8,color:C.gold,padding:"7px 14px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:1,flexShrink:0}}>← Enciclopedia</button>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.cat==='factions'?'Fazione':a.cat==='primarchs'?'Primarch':a.era}</div>
        </div>
        <div style={{background:`linear-gradient(160deg,${a.color}99,${a.color}18)`,borderBottom:`1px solid ${a.color}66`,padding:"28px 20px 24px"}}>
          <div style={{fontSize:48,marginBottom:10}}>{a.icon}</div>
          <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:"clamp(18px,5vw,26px)",color:C.text,lineHeight:1.2,marginBottom:6}}>{a.name}</h1>
          <div style={{color:C.muted,fontSize:13,fontStyle:"italic",marginBottom:a.loyal!==undefined?12:0}}>{a.sub}</div>
          {a.loyal!==undefined&&(<span style={{display:"inline-block",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,padding:"3px 10px",borderRadius:4,border:`1px solid ${loyalColor}55`,color:loyalColor,background:`${loyalColor}18`}}>{a.loyal===true?'⚜ LEALE':a.loyal===false?'⛧ TRADITORE':'? SCONOSCIUTO'}{a.status?` · ${a.status}`:""}</span>)}
        </div>
        {a.infobox.length>0&&(
          <div style={{margin:"16px 16px 0",background:C.card,border:`1px solid ${a.color}44`,borderRadius:10,overflow:"hidden"}}>
            <div style={{background:`${a.color}22`,padding:"9px 14px",borderBottom:`1px solid ${a.color}33`}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:a.color,letterSpacing:3,textTransform:"uppercase"}}>Scheda</div>
            </div>
            {a.infobox.map((row,i)=>(
              <div key={i} style={{display:"flex",borderBottom:i<a.infobox.length-1?`1px solid ${C.border}`:"none",padding:"9px 14px",alignItems:"flex-start",gap:12}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase",minWidth:96,flexShrink:0,paddingTop:1}}>{row.label}</div>
                <div style={{color:C.text,fontSize:12,lineHeight:1.5}}>{row.value}</div>
              </div>
            ))}
          </div>
        )}
        {a.type==='primarch'&&(
          <div style={{margin:"16px 16px 0",background:C.card,border:`1px solid ${a.color}44`,borderRadius:10,overflow:"hidden"}}>
            <div style={{background:`${a.color}22`,padding:"9px 14px",borderBottom:`1px solid ${a.color}33`}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:a.color,letterSpacing:3,textTransform:"uppercase"}}>Scheda Primarch</div>
            </div>
            {[{label:"Numero",value:`Primarch ${a.num}`},{label:"Legione",value:a.sub},{label:"Alleanza",value:a.loyal===true?"Leale":(a.loyal===false?"Traditore":"Sconosciuto")},{label:"Destino",value:a.status}].map((row,i,arr)=>(
              <div key={i} style={{display:"flex",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none",padding:"9px 14px",alignItems:"flex-start",gap:12}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase",minWidth:96,flexShrink:0,paddingTop:1}}>{row.label}</div>
                <div style={{color:C.text,fontSize:12}}>{row.value}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{padding:"20px 16px"}}>
          <div style={{height:1,background:`linear-gradient(to right,${a.color}88,transparent)`,marginBottom:20}}/>
          {paragraphs.map((para,i)=>(<p key={i} style={{color:C.text,fontSize:14,lineHeight:1.9,marginBottom:18}}>{para}</p>))}
          {a.type==='primarch'&&a.fate&&(
            <div style={{marginTop:8,background:`${a.color}11`,border:`1px solid ${a.color}44`,borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:a.color,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>Destino</div>
              <p style={{color:C.muted,fontSize:13,lineHeight:1.7,fontStyle:"italic"}}>{a.fate}</p>
            </div>
          )}
          {a.keyFacts.length>0&&(
            <div style={{marginTop:16,background:`${a.color}11`,border:`1px solid ${a.color}33`,borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:a.color,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>Punti Chiave</div>
              {a.keyFacts.map((fact,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
                  <span style={{color:a.color,fontSize:10,marginTop:4,flexShrink:0}}>▪</span>
                  <span style={{color:C.muted,fontSize:13,lineHeight:1.6}}>{fact}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return(
    <div style={{paddingBottom:80}}>
      <div style={{padding:"20px 16px 12px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:6}}>Warhammer 40,000</div>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.text,marginBottom:12}}>Enciclopedia</h2>
        <div style={{position:"relative",marginBottom:10}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca fazioni, Primarchs, eventi…"
            style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,padding:"10px 36px 10px 40px",fontSize:14,outline:"none"}}/>
          <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>🔍</span>
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>×</button>}
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {[{id:"all",label:"Tutto"},{id:"factions",label:"Fazioni"},{id:"timeline",label:"Timeline"},{id:"primarchs",label:"Primarchs"}].map(c=>(
            <button key={c.id} onClick={()=>setCat(c.id)} style={{flexShrink:0,padding:"5px 14px",borderRadius:20,border:`1px solid ${cat===c.id?C.gold:C.dim}`,background:cat===c.id?`${C.gold}22`:"transparent",color:cat===c.id?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:1,cursor:"pointer"}}>{c.label}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"8px 16px 4px",fontFamily:"'Cinzel',serif",fontSize:9,color:C.muted,letterSpacing:2}}>{filtered.length} ARTICOLI</div>
      <div style={{padding:"4px 16px 16px",display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(a=>{
          const loyalColor=a.loyal===true?C.gold:a.loyal===false?C.red:C.muted;
          return(
            <div key={a.id} onClick={()=>setArticle(a)} style={{background:`linear-gradient(135deg,${a.color}22,${C.card})`,border:`1px solid ${a.color}44`,borderLeft:`3px solid ${a.color}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:28,flexShrink:0}}>{a.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,marginBottom:3,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:a.color,letterSpacing:2,textTransform:"uppercase"}}>{a.cat==='factions'?'Fazione':a.cat==='primarchs'?'Primarch':a.era}</span>
                  {a.loyal!==undefined&&(<span style={{fontFamily:"'Cinzel',serif",fontSize:8,padding:"1px 6px",borderRadius:3,border:`1px solid ${loyalColor}44`,color:loyalColor}}>{a.loyal===true?'Leale':a.loyal===false?'Traditore':'Incerto'}</span>)}
                  {a.status&&a.type==='primarch'&&(<span style={{fontFamily:"'Cinzel',serif",fontSize:8,padding:"1px 6px",borderRadius:3,background:C.dim,color:C.muted,border:`1px solid ${C.border}`}}>{a.status}</span>)}
                </div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                <div style={{fontSize:11,color:C.muted,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.sub}</div>
              </div>
              <span style={{color:C.goldDim,fontSize:18,flexShrink:0}}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComingSoon({icon,title,sub}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:20,padding:32,textAlign:"center"}}><div style={{fontSize:60,animation:"float 3s ease-in-out infinite"}}>{icon}</div><div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.gold}}>{title}</div><div style={{color:C.muted,fontStyle:"italic",maxWidth:300,lineHeight:1.6,fontSize:14}}>{sub}</div><div style={{border:`1px solid ${C.gold}44`,borderRadius:20,padding:"8px 22px",color:`${C.gold}88`,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:3,textTransform:"uppercase"}}>Coming Next Phase</div></div>);}

// ─── HOME PAGE (bookshelf) ─────────────────────────────────────────────────────
function HomePage({user,setSection}){
  const uid=user?.id||'anon';
  const statuses=useMemo(()=>loadAllStatuses(uid),[uid]);

  // scan localStorage for uploaded books
  const uploadedIds=useMemo(()=>{
    const ids=new Set();
    const prefix=`wh40k_ebook_${uid}_`;
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k?.startsWith(prefix)){const id=parseInt(k.slice(prefix.length));if(!isNaN(id))ids.add(id);}
    }
    return ids;
  },[uid]);

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
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:4}}>Benvenuto nel</div>
        <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:26,color:C.text,lineHeight:1.1,marginBottom:4}}>Scriptorium</h1>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:3}}>LA TUA BIBLIOTECA IMPERIALE</div>
      </div>

      {/* stats bar */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>
        {[
          {n:uploadedIds.size,l:"In Cloud",c:C.gold},
          {n:readingCount,l:"In Lettura",c:C.blue},
          {n:readCount,l:"Letti",c:C.green},
          {n:wantCount,l:"Wishlist",c:C.muted},
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
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.blue,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>📖 In Lettura</div>
          {activeBooks.map(b=>(
            <div key={b.id} onClick={()=>setSection('library')} style={{background:`linear-gradient(135deg,${C.blue}18,${C.card})`,border:`1px solid ${C.blue}44`,borderLeft:`3px solid ${C.blue}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:32,height:44,background:`linear-gradient(to right,${FC[b.faction]||C.dim}dd,${FC[b.faction]||C.dim}88)`,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"2px 2px 4px rgba(0,0,0,0.4)"}}>
                <div style={{writingMode:"vertical-rl",transform:"rotate(180deg)",fontFamily:"'Cinzel',serif",fontSize:5,color:"rgba(255,255,255,0.8)",letterSpacing:0.5,overflow:"hidden",maxHeight:"90%",padding:"2px 1px"}}>{b.series}</div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:C.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</div>
                <div style={{fontSize:11,color:C.muted}}>{b.series} #{b.num} · {b.author}</div>
              </div>
              <span style={{color:C.blue,fontSize:16}}>›</span>
            </div>
          ))}
        </div>
      )}

      {/* bookshelf */}
      <div style={{padding:"16px 0 0"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",padding:"0 16px",marginBottom:10}}>La Tua Libreria</div>
        {shelfBooks.length===0?(
          <div style={{padding:"24px 16px",textAlign:"center"}}>
            <div style={{color:C.muted,fontSize:13,fontStyle:"italic",marginBottom:12}}>Nessun libro sulla libreria ancora.</div>
            <button onClick={()=>setSection('library')} style={{background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,color:C.gold,padding:"8px 20px",fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,cursor:"pointer"}}>Vai alla Libreria →</button>
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
          {[{c:C.blue,l:"In Lettura"},{c:C.green,l:"Letto"},{c:C.gold,l:"Con Ebook"}].map(x=>(
            <div key={x.l} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:12,height:3,background:x.c,borderRadius:2}}/>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,letterSpacing:1}}>{x.l}</span>
            </div>
          ))}
        </div>
      )}

      {/* quick nav */}
      <div style={{padding:"16px 16px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{id:"library",icon:"📚",label:"Libreria",sub:`${BOOKS.length} titoli`},
          {id:"reading",icon:"📖",label:"Crociata",sub:`${readCount} completati`},
          {id:"lore",icon:"⚔️",label:"Enciclopedia",sub:"Fazioni & Primarchs"},
          {id:"painting",icon:"🎨",label:"Painting",sub:"Le tue miniature"},
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

const NAV=[{id:"home",icon:"🏛️",label:"Home"},{id:"library",icon:"📚",label:"Library"},{id:"lore",icon:"⚔️",label:"Lore"},{id:"reading",icon:"📖",label:"Reading"},{id:"painting",icon:"🎨",label:"Painting"}];

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
  const [section,setSection]=useState("home");
  const mainRef=useRef(null);
  useEffect(()=>{ if(mainRef.current) mainRef.current.scrollTop=0; },[section]);
  const curNav=NAV.find(n=>n.id===section);
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
          {section==="home"    &&<HomePage user={user} setSection={setSection}/>}
          {section==="library" &&<LibrarySection user={user}/>}
          {section==="lore"    &&<LoreSection/>}
          {section==="reading" &&<ReadingSection user={user}/>}
          {section==="painting"&&<PaintingTracker user={user}/>}
        </div>
        {/* ── BOTTOM NAV ── */}
        <div style={{flexShrink:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",height:56}}>
          {NAV.map(n=>(<button key={n.id} onClick={()=>setSection(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",padding:0,borderTop:`2px solid ${section===n.id?C.gold:"transparent"}`,transition:"border-color 0.15s"}}><span style={{fontSize:18,lineHeight:1}}>{n.icon}</span><span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,color:section===n.id?C.gold:C.muted,textTransform:"uppercase"}}>{n.label}</span></button>))}
        </div>
      </div>
    </>
  );
}
