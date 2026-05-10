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
  text:"#d4cbb8", muted:"#7a7060", dim:"#3a3428",
};
const FC = {
  "Space Marines":"#1e3d6e","Chaos":"#6e1a1a","Astra Militarum":"#3a5228",
  "Imperium":"#4a3a18","Adeptus Mechanicus":"#7a2218","Adepta Sororitas":"#5a2a4a",
  "Aeldari":"#1a4a5a","Drukhari":"#3a1a5a","Necrons":"#1a5a3a",
  "Tyranids":"#4a1a5a","Orks":"#3a4a1a","T'au":"#1a3a4a","Various":"#3a3428",
};

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
function BookDetail({ book, user, onBack, onOpenReader }) {
  const fc=FC[book.faction]||C.dim;
  const inp=useRef(null);
  const [ebookMeta,    setEbookMeta]    = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadMsg,    setUploadMsg]    = useState("");
  const [isRead,       setIsRead]       = useState(false);
  const [progress,     setProgress]     = useState(0);
  const [chapterIndex, setChapterIndex] = useState(0);

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
        <button onClick={()=>setIsRead(r=>!r)} style={{width:"100%",padding:"14px",borderRadius:10,background:isRead?`${C.gold}22`:"transparent",border:`1px solid ${isRead?C.gold:C.dim}`,color:isRead?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>
          {isRead?"✓ Marked as Read — tap to undo":"Mark as Read"}
        </button>
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

  useEffect(()=>{
    if(tab==="shelf"){
      setShelfLoading(true);
      sb.get("ebook_files","select=book_id,file_name,file_path,file_type").then(files=>{
        if(files?.length){ const ids=new Set(files.map(f=>f.book_id)); setShelfBooks(BOOKS.filter(b=>ids.has(b.id)).map(b=>({...b,_file:files.find(f=>f.book_id===b.id)}))); }
        else setShelfBooks([]);
        setShelfLoading(false);
      });
    }
  },[tab]);

  const handleOpenReader=({book,url,fileType,progress,chapterIndex})=>setReader({book,url,fileType,progress,chapterIndex});

  if(reader){
    const {book,url,fileType,progress,chapterIndex}=reader;
    if(fileType==="pdf") return <PdfReader url={url} title={book.title} onClose={()=>setReader(null)}/>;
    return <EpubReader url={url} title={book.title} bookId={book.id} userId={user?.id} initProgress={progress} initChapterIndex={chapterIndex||0} onProgress={()=>{}} onClose={()=>setReader(null)}/>;
  }
  if(detail) return <BookDetail book={detail} user={user} onBack={()=>setDetail(null)} onOpenReader={handleOpenReader}/>;

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
          {[{l:"Tomes",v:BOOKS.length},{l:"In Cloud",v:shelfBooks.length,gold:true}].map(s=>(<div key={s.l}><div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase"}}>{s.l}</div><div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:s.gold?C.gold:C.text}}>{s.v}</div></div>))}
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
              return(<div key={book.id} onClick={()=>setDetail(book)} style={{background:`linear-gradient(135deg,${fc2}22,${C.card})`,border:`1px solid ${fc2}55`,borderLeft:`3px solid ${fc2}`,borderRadius:8,padding:"14px 14px 12px",cursor:"pointer",display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:1,textTransform:"uppercase"}}>{book.series}{book.num>0?` #${book.num}`:""}</div>
                  <span style={{background:`${tc}22`,border:`1px solid ${tc}44`,borderRadius:4,padding:"2px 7px",fontFamily:"'Cinzel',serif",fontSize:9,color:tc,letterSpacing:1,flexShrink:0}}>{book.type}</span>
                </div>
                <div style={{fontSize:16,fontWeight:700,color:C.text,lineHeight:1.3,fontFamily:"'Cinzel',serif"}}>{book.title}</div>
                <div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{book.author}</div>
              </div>);
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
const FACTION_CARDS=[{name:"Space Marines",sub:"Adeptus Astartes",color:"#1e3d6e",icon:"⬡"},{name:"Chaos Space Marines",sub:"Heretic Astartes",color:"#6e1a1a",icon:"⛧"},{name:"Astra Militarum",sub:"The Imperial Guard",color:"#3a5228",icon:"✦"},{name:"Necrons",sub:"The Undying Legions",color:"#1a5a3a",icon:"☽"},{name:"Tyranids",sub:"The Great Devourer",color:"#4a1a5a",icon:"✸"},{name:"Orks",sub:"Waaagh!",color:"#3a4a1a",icon:"✌"}];
function HomePage({setSection}){
  return(<div style={{paddingBottom:80}}>
    <div style={{padding:"44px 20px 36px",textAlign:"center",background:`radial-gradient(ellipse at 50% 0%,${C.red}18,transparent 70%)`,borderBottom:`1px solid ${C.border}`,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,opacity:0.04,pointerEvents:"none",overflow:"hidden"}}>{Array.from({length:20},(_,i)=>(<div key={i} style={{position:"absolute",left:`${(i%5)*22+5}%`,top:`${Math.floor(i/5)*28}%`,width:70,height:70,border:`1px solid ${C.gold}`,clipPath:"polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",animation:`hexPulse ${3+(i%4)}s ease-in-out infinite`,animationDelay:`${(i*0.4)%3}s`}}/>))}</div>
      <div style={{position:"relative",zIndex:1}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:16,animation:"float 4s ease-in-out infinite"}}><svg width={68} height={68} viewBox="0 0 100 100"><text x="50" y="72" textAnchor="middle" fontSize="70" fill={C.gold} fontFamily="serif">⚜</text></svg></div>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:6,color:`${C.gold}99`,textTransform:"uppercase",marginBottom:14,borderTop:`1px solid ${C.gold}33`,borderBottom:`1px solid ${C.gold}33`,padding:"5px 0",display:"inline-block"}}>In the grim darkness of the far future</div>
        <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:38,fontWeight:900,color:C.text,margin:"12px 0 4px",lineHeight:1,textShadow:`0 0 40px ${C.gold}44`}}>WARHAMMER</h1>
        <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:38,fontWeight:900,color:C.gold,margin:"0 0 8px",lineHeight:1,textShadow:`0 0 40px ${C.gold}88`}}>40,000</h1>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:8,color:C.red,marginBottom:26,textTransform:"uppercase"}}>COMPANION</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>setSection("library")} style={{background:`linear-gradient(135deg,${C.gold},#8a6f28)`,border:"none",borderRadius:8,padding:"13px 26px",color:C.bg,fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:2,textTransform:"uppercase",fontWeight:700,cursor:"pointer"}}>Enter Library</button>
          <button onClick={()=>setSection("lore")} style={{background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,padding:"13px 26px",color:C.gold,fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>Factions</button>
        </div>
      </div>
    </div>
    <div style={{padding:"20px 16px 8px"}}>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:5,textTransform:"uppercase",marginBottom:12}}>Sections</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{id:"library",icon:"📚",label:"Library",sub:`${BOOKS.length}+ tomes`},{id:"lore",icon:"⚔️",label:"Lore",sub:"Lore & history"},{id:"reading",icon:"📖",label:"Reading Order",sub:"Where to start"},{id:"painting",icon:"🎨",label:"Painting",sub:"Citadel · AK · Vallejo"}].map(item=>(<button key={item.id} onClick={()=>setSection(item.id)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 14px",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:12,gridColumn:item.wide?"span 2":undefined}}><span style={{fontSize:22}}>{item.icon}</span><div><div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:C.text,fontWeight:700}}>{item.label}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{item.sub}</div></div></button>))}
      </div>
    </div>
    <div style={{padding:"16px 16px 8px"}}>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:5,textTransform:"uppercase",marginBottom:12}}>The Warring Powers</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{FACTION_CARDS.map(f=>(<div key={f.name} style={{background:`linear-gradient(135deg,${f.color}44,${C.card})`,border:`1px solid ${f.color}88`,borderRadius:10,padding:"13px 12px"}}><div style={{fontSize:20,marginBottom:4}}>{f.icon}</div><div style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:C.gold,marginBottom:2}}>{f.name}</div><div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{f.sub}</div></div>))}</div>
    </div>
    <div style={{padding:"16px 16px 8px"}}>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:5,textTransform:"uppercase",marginBottom:10}}>Universe</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{[{id:"40k",label:"Warhammer 40,000",active:true},{id:"aos",label:"Age of Sigmar",active:false},{id:"whf",label:"Warhammer Fantasy",active:false}].map(u=>(<div key={u.id} style={{background:u.active?`${C.gold}18`:C.card,border:`1px solid ${u.active?C.gold:C.dim}`,borderRadius:20,padding:"8px 14px",color:u.active?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,position:"relative",cursor:u.active?"pointer":"default"}}>{u.label}{!u.active&&<span style={{position:"absolute",top:-7,right:-7,background:C.surface,border:`1px solid ${C.dim}`,color:C.muted,fontSize:7,padding:"1px 4px",borderRadius:3,letterSpacing:1}}>SOON</span>}</div>))}</div>
    </div>
  </div>);
}

// ─── LORE DATA ─────────────────────────────────────────────────────────────
const FACTIONS_LORE=[
  {id:"space-marines",name:"Adeptus Astartes",sub:"Space Marines",color:"#1e3d6e",icon:"⬡",era:"All Eras",
   short:"Genetically enhanced superhuman warriors. 1,000 Chapters, each a brotherhood of ~1,000 warriors bearing the Emperor's gene-seed.",
   long:`The Adeptus Astartes are the finest warriors humanity has ever produced. Created from the Emperor's own genetic template, each Space Marine receives 19 gene-seed implants that transform baseline humans into towering warriors of supernatural ability — stronger, faster, and more resilient than any unaugmented soldier.\n\nOrganised into Chapters of roughly a thousand warriors, they are humanity's shock troops and champions. Each Chapter maintains its own culture, heraldry, homeworld, and interpretation of the Codex Astartes — the great tome of military doctrine written by the Primarch Roboute Guilliman after the Horus Heresy.\n\nFrom the stoic Ultramarines to the savage Space Wolves, from the death-seeking Dark Angels to the blood-hungry Blood Angels, each Chapter bears the strengths and flaws of its Primarch's lineage. They are simultaneously humanity's greatest protectors and its most dangerous servants.`,
   keyFacts:["~1,000 active Chapters","Each Marine receives 19 implants","Gene-seed drawn from 18 Primarchs","Created from Emperor's DNA blueprint","The Codex Astartes governs most Chapters"]},
  {id:"chaos",name:"Forces of Chaos",sub:"The Ruinous Powers",color:"#6e1a1a",icon:"⛧",era:"Horus Heresy onwards",
   short:"The four Chaos Gods — Khorne, Tzeentch, Nurgle, Slaanesh — and their mortal servants. Born from mortal emotion and fed by war.",
   long:`Chaos is the collective name for the malevolent entities of the Warp — a parallel dimension of pure psychic energy where mortal emotion becomes physical reality. Over billions of years, the strongest of these psychic echoes coalesced into four terrible gods: Khorne the Blood God who craves slaughter, Tzeentch the Architect of Fate who weaves endless schemes, Nurgle the Plague Father who offers rotten gifts of despair and resilience, and Slaanesh the Prince of Pleasure born from Eldar excess.\n\nChaos space marines are the Traitor Legions — nine of the original twenty Space Marine Legions who turned against the Emperor during the Horus Heresy. Some are still recognisable as Space Marines. Others have been transformed over millennia into something inhuman. The Word Bearers were the first to embrace Chaos. The Death Guard are now plague-ridden champions of Nurgle. The Thousand Sons are dust-filled automatons commanded by sorcerers.\n\nFrom within the Eye of Terror, a massive Warp rift near the galaxy's core, the Traitor Legions launch endless crusades against the Imperium they once served.`,
   keyFacts:["Four Chaos Gods: Khorne, Tzeentch, Nurgle, Slaanesh","Nine Traitor Legions from the Horus Heresy","Operate primarily from the Eye of Terror","Daemon Engines blend machine and daemonic essence","The Black Legion is the largest unified warband"]},
  {id:"necrons",name:"Necrons",sub:"The Undying Legions",color:"#1a5a3a",icon:"☽",era:"All Eras",
   short:"Sixty million years ago the Necrontyr traded flesh for metal immortality. Now they awaken from their tomb-world slumber to reclaim a galaxy they once ruled.",
   long:`The Necrontyr were a short-lived race tormented by radiation from their sun. Sixty million years ago, in desperation, they made a pact with godlike entities called the C'tan — the Star Gods who fed on stellar energy. The C'tan offered immortality: the Necrontyr would transfer their souls into bodies of living metal, becoming the Necrons.\n\nThe price was their very essence. During the biotransference, most Necrons lost their personalities, emotions, and individuality — becoming the cold, emotionless warriors known today. The C'tan themselves were later shattered by the Necrons into slivers of their former selves, imprisoned in tesseract labyrinths.\n\nFor sixty million years the Necrons have slept in tomb-worlds across the galaxy, waiting for the radiation of the War in Heaven to fade. Now they awaken. Dynasty by dynasty, Tomb World by Tomb World, the Necrons rise — sometimes confused, sometimes with full memory intact, but always unstoppable. Their living metal bodies self-repair from almost any damage, and their warriors dissolve when destroyed to reform later. To truly kill a Necron is no easy feat.`,
   keyFacts:["Sixty million years old","Living metal bodies (necrodermis) self-repair","Former masters of the C'tan Star Gods","Tomb Worlds scattered across the galaxy","Silent King Szarekh leads unified dynasties in M42"]},
  {id:"tyranids",name:"Tyranids",sub:"The Great Devourer",color:"#4a1a5a",icon:"✸",era:"41st Millennium onwards",
   short:"An extragalactic swarm that has consumed countless galaxies. Each hive fleet is a single organism driven by the Hive Mind's endless hunger.",
   long:`The Tyranids come from beyond the galaxy — from the cold void between galactic superclusters where they have spent aeons consuming everything in their path. They are not a civilisation but a single vast organism: the Hive Mind, a gestalt psychic consciousness that directs trillions of creatures across interstellar distances.\n\nEvery Tyranid creature is engineered for a purpose. Hormagaunts rush forward in tidal waves of chitinous death. Carnifexes are living siege engines. Hive Tyrants are the commanders. Genestealers infiltrate civilisations generations before the fleet arrives. The Shadow in the Warp — the psychic scream of the approaching fleet — blankets entire systems, cutting off psykers and devastating morale.\n\nWhat makes Tyranids truly terrifying is their adaptability. They consume all biomass from a world — every organism, every plant — and use it to create new, more perfectly-adapted organisms for the next campaign. They have no mercy, no compassion, no individual desire. There is only hunger. The Milky Way Galaxy is a feast they intend to consume entirely.`,
   keyFacts:["Extragalactic origin","Hive Mind controls all creatures telepathically","Multiple Hive Fleets: Behemoth, Kraken, Leviathan etc","Consume all biomass of conquered worlds","Shadow in the Warp disrupts psykers and communication"]},
  {id:"aeldari",name:"Aeldari",sub:"Children of the Stars",color:"#1a4a5a",icon:"◇",era:"All Eras",
   short:"An ancient race whose Fall birthed the Chaos God Slaanesh. Once masters of the galaxy, now a dying species aboard Craftworld ships.",
   long:`The Aeldari once ruled a galactic empire that made the Imperium of Man look provincial. For millions of years they were the dominant intelligent species in the galaxy — gifted with psychic power, supreme artistry, and technology beyond anything humanity could dream. Their civilisation touched every star system.\n\nBut success bred excess. Over millennia, the Aeldari descended into decadence. Their emotions became amplified by their psychic connection to the Warp, creating a growing darkness in that dimension. On the day of the Fall — the Fall of the Eldar — their collective debauchery and psychic emanation tore a hole in reality and birthed a new Chaos God: Slaanesh, who consumed most of the Aeldari in the moment of birth.\n\nSurvivors escaped on massive Craftworld ships, sealed off from the Warp behind psychic barriers of wraithbone. These Craftworld Aeldari follow strict Paths — structured lifestyles that prevent the dangerous obsessions of their species. Other Aeldari took different routes: the Exodites fled to maiden worlds, the Commorraghans retreated into a pocket dimension, and the Harlequins serve the Laughing God Cegorach.`,
   keyFacts:["Their Fall birthed Slaanesh c.M29","Craftworld Aeldari live aboard continent-sized ships","Psychic abilities far exceed human potential","Wraithbone is the primary construction material","The Harlequins serve the Laughing God"]},
  {id:"orks",name:"Orks",sub:"Da Biggest, da Strongest",color:"#3a4a1a",icon:"✌",era:"All Eras",
   short:"Fungi-based warrior organisms that exist for one purpose: war. The WAAAGH! is a psychic gestalt phenomenon that makes Ork beliefs literally real.",
   long:`Orks are the most numerous and widespread species in the galaxy. They are not born but grown from spores, and a dead Ork will seed an entire ecosystem of fungus, grots, squigs, and eventually new Orks wherever it falls. They are impossible to eradicate from any world they have occupied.\n\nOrkish technology should not work. Their guns are held together with string and wishful thinking. Their vehicles are cobbled from scrap. Yet through a remarkable psychic phenomenon called the WAAAGH field — a collective gestalt emanating from all Orks — their belief in something working is enough to make it work. An Ork's shoota fires because Orks believe it will fire. Their red vehicles go faster because Orks believe red things go faster.\n\nThe greatest Ork leaders are Warbosses, and the mightiest of all are Warlords who can unite thousands of Orks into a WAAAGH! — a tide of green violence that crashes across star systems. The biggest, most powerful Ork is always in charge. And Orks grow throughout their lives. The tales of ancient, mountain-sized Ork overlords are not myth.`,
   keyFacts:["Reproduce via spores — immortal as a species","WAAAGH field makes belief literally real","Grow throughout life — ancient Orks are enormous","Deathskulls, Goffs, Blood Axes, Evil Sunz are major clans","Ghazghkull Thraka is the greatest modern Warlord"]},
  {id:"tau",name:"T'au Empire",sub:"For the Greater Good",color:"#1a3a4a",icon:"◈",era:"41st Millennium onwards",
   short:"A young, rapidly expanding empire guided by the philosophy of the Greater Good. Advanced technology and skilled diplomacy — they even accept human worlds into their empire.",
   long:`The T'au are a young species by galactic standards — only six thousand years old — yet they have built one of the most sophisticated empires in the galaxy. Unlike most other factions, the T'au expand through diplomacy as much as conquest. Many human worlds have willingly joined the T'au Empire, attracted by their philosophy of the Greater Good — a collectivist ideal that emphasises cooperation over hierarchy and wisdom.\n\nT'au technology is genuinely impressive, particularly their battlesuit technology — the XV series of powered exo-armour ranging from XV8 Crisis Suits to the titan-class KX139 Ta'unar. Their railguns and ion weapons are among the most advanced ranged weapons in the galaxy.\n\nThe T'au are almost entirely without psychic ability, which has saved them from the worst depredations of Chaos but also limited their capabilities. They make up for this with six castes — Fire, Earth, Water, Air, and Ethereal — each bred for a specific role. The Ethereals are a mysterious caste whose calming presence commands absolute obedience from all other castes by an unknown mechanism.`,
   keyFacts:["~6,000 years old — youngest major faction","Greater Good philosophy attracts willing converts","Battlesuit technology rivals anything in the galaxy","No psychic ability — nearly immune to Chaos corruption","Ethereals command absolute loyalty through unknown means"]},
  {id:"astra-militarum",name:"Astra Militarum",sub:"The Imperial Guard",color:"#3a5228",icon:"✦",era:"All Eras",
   short:"Trillions of ordinary humans, the backbone of the Imperium's defence. They win through weight of numbers, logistics, and the stubborn refusal to die.",
   long:`If the Space Marines are the Emperor's right fist, the Astra Militarum is the Imperial boot that grinds enemies into the ground through sheer weight. Where Space Marines might be deployed in hundreds, the Astra Militarum fights in billions. Whole regiments of Cadian Shock Troops, Catachan Jungle Fighters, Valhallan Ice Warriors, and hundreds of other regimental traditions hold the line against enemies that would otherwise overwhelm any number of superhuman warriors.\n\nWhat makes the Astra Militarum formidable is not individual prowess but organisation, logistics, and industrial-scale firepower. A single Baneblade super-heavy tank carries enough firepower to level a city block. A massed artillery bombardment by the Astra Militarum will level the same city block ten thousand times over.\n\nCommissars walk alongside troops to maintain morale through inspiration — and if necessary, summary execution. Priests of the Ecclesiarchy preach faith that turns frightened soldiers into fanatics. Sanctioned psykers provide psychic support. Advisors from the Adeptus Mechanicus maintain the vehicles that are often decades or centuries old. It is an army of ordinary people doing extraordinary things.`,
   keyFacts:["Trillions of soldiers across the Imperium","Regiments draw from hundreds of worlds with unique cultures","Commissars enforce discipline with lethal authority","Titan Legions provide apocalyptic support","Cadian Gate — gateway to the Eye of Terror — destroyed in M41"]},
  {id:"adeptus-mechanicus",name:"Adeptus Mechanicus",sub:"The Machine Cult of Mars",color:"#7a2218",icon:"⚙",era:"All Eras",
   short:"The techno-priests of Mars who worship the Omnissiah — the Machine God. They guard humanity's technological secrets and maintain the machines of war.",
   long:`Long before the Imperium existed, Mars was already a separate technocratic civilisation — the Mechanicum. Their religion holds that all knowledge is sacred, that the universe follows mathematical laws set by the Omnissiah (whom they believe is either the Emperor or a separate divine intelligence), and that the fusion of flesh and machine is the path to enlightenment.\n\nThe Adeptus Mechanicus controls all major manufacturing facilities in the Imperium. Every Titan, every Astartes weapon, every warship — all require their blessing and participation. They jealously guard technological knowledge in the form of Standard Template Constructs (STCs) — templates from before the Age of Strife that contain the instructions to build everything humanity needs. To find an intact STC is the highest holy act a Tech-Priest can perform.\n\nSkitarii are their warrior legions — cyborg soldiers with extensive augmentations who serve as the military arm. Magos Biologis, Magos Explorator, Magos Dominus — each order of Tech-Priest serves a different function in the great quest to recover and preserve technological knowledge. And their Titan Legions — god-machines ranging from the Warhound scout to the Emperor-class Titan — are among the most powerful war engines in existence.`,
   keyFacts:["Control all major manufacturing in the Imperium","Standard Template Constructs (STCs) are holy relics","Biological flesh is replaced with machine augments over time","Titan Legions are the ultimate expression of their craft","The Omnissiah is believed to be the Machine God incarnate"]},
];

const TIMELINE_LORE=[
  {era:"M15–M24",name:"Age of Terra",color:"#4a3a18",icon:"🌍",
   summary:"Humanity spreads across the stars without FTL travel. The early human empire is vast but slow. The Warp remains mostly stable. This is the time before the Emperor walks openly among mankind."},
  {era:"M25–M30",name:"Age of Strife",color:"#6e1a1a",icon:"💀",
   summary:"The Warp storms, the birth of Slaanesh, and the fall of Eldar civilisation scatter humanity. Human worlds are isolated for thousands of years. Abominable Intelligences — AIs — turn on their creators in the Cybernetic Revolt. Psykers emerge en masse. Civilisation collapses galaxy-wide."},
  {era:"M30",name:"The Great Crusade",color:"#1e3d6e",icon:"⚔️",
   summary:"The Emperor emerges, already ancient beyond reckoning. With the Thunder Warriors and then the Space Marine Legions, He begins the Great Crusade to reunite humanity. The Primarchs are found one by one. In two centuries, the Imperium spans the galaxy. It is mankind's greatest age — and its last."},
  {era:"M31",name:"The Horus Heresy",color:"#8a2218",icon:"⛧",
   summary:"Horus, favoured son and Warmaster, falls to Chaos. Nine Legions follow him. Civil war tears the Imperium apart. Brother fights brother across every theatre of war. At the Siege of Terra, Horus is slain by the Emperor, who is mortally wounded in turn. The Emperor is interred in the Golden Throne — alive, but barely. The Imperium survives, but the dream of the Great Crusade dies forever."},
  {era:"M32–M40",name:"The Long Watch",color:"#3a3428",icon:"🏛️",
   summary:"The Imperium heals, hardens, and grows increasingly rigid and dogmatic. The Age of Apostasy sees civil war and madness. The War of the Beast nearly destroys the Imperium when the largest Ork WAAAGH! in history strikes Terra. Space Marines are reorganised into Chapters. The Inquisition grows powerful. Bureaucracy calcifies. The Imperium becomes a fortress holding against a galaxy that hates it."},
  {era:"M41",name:"The 41st Millennium",color:"#c9a84c",icon:"⚜",
   summary:"The Era of the Imperium most commonly depicted in WH40K. Hive Fleet Behemoth and the Battle of Macragge. The 13th Black Crusade of Abaddon destroys Cadia and shatters the Cadian Gate. The Great Rift — the Cicatrix Maledictum — tears the galaxy in two, plunging half of it into perpetual darkness. Roboute Guilliman is resurrected and becomes Lord Commander of the Imperium."},
  {era:"M42",name:"The Dark Imperium",color:"#b03030",icon:"🔥",
   summary:"The current era. The Great Rift divides the Imperium into Imperium Sanctus (with Astronomican, relatively stable) and Imperium Nihilus (cut off, in darkness). Guilliman leads the Indomitus Crusade — new Primaris Space Marines created from enhanced Astartes gene-seed push back the darkness. But the threats multiply. This is the age of endings and desperate last stands."},
];

const PRIMARCHS_LORE=[
  {num:"I",name:"Lion El'Jonson",legion:"Dark Angels",loyal:true,color:"#1a3a1a",icon:"🦁",status:"Returned",
   short:"The Lion — warrior-monk, strategist without equal. Secretive and proud. Found on the death world Caliban, raised by knights, never fully trusted by his brothers.",
   fate:"Mortally wounded by Luther (his closest companion turned traitor), placed in stasis within the Rock. Returned to fight in M42."},
  {num:"III",name:"Fulgrim",legion:"Emperor's Children",loyal:false,color:"#8a2a8a",icon:"🐍",status:"Daemon Prince",
   short:"The Phoenician — obsessive perfectionist, artist-warrior of supreme skill. His quest for perfection led him to Slaanesh.",
   fate:"Corrupted by a daemon sword, became a Daemon Prince of Slaanesh. Last seen in M42 during the Shadow Crusade."},
  {num:"IV",name:"Perturabo",legion:"Iron Warriors",loyal:false,color:"#4a4a4a",icon:"⚙",status:"Daemon Prince",
   short:"The Lord of Iron — genius siege-master, cold and calculating. Bitter about being used as a siege weapon while other Primarchs won glory.",
   fate:"Became Daemon Prince of Chaos Undivided after the Horus Heresy. Rules the Iron Fortress in the Eye of Terror."},
  {num:"V",name:"Jaghatai Khan",legion:"White Scars",loyal:true,color:"#e8e8e8",icon:"⚡",status:"Missing",
   short:"The Warhawk — lightning-fast cavalry master, supreme tactician of the mobile assault. Open and direct where many Primarchs were secretive.",
   fate:"Pursued Dark Eldar raiders into the Webway in ~M31/M32. Has not returned. The White Scars still seek him."},
  {num:"VI",name:"Leman Russ",legion:"Space Wolves",loyal:true,color:"#a0a8b8",icon:"🐺",status:"Missing",
   short:"The Wolf King — berserker warrior, cunning tactician, judge of the Emperor's enemies. Consumed mead with the best and tore Primarchs apart with the worst.",
   fate:"At the end of M41 Russ walked into the Eye of Terror to prepare for the Wolftime — the last battle. Has not returned."},
  {num:"VII",name:"Rogal Dorn",legion:"Imperial Fists",loyal:true,color:"#c8a830",icon:"🏰",status:"Deceased / Remains Disputed",
   short:"The Praetorian — supreme defender and fortress-builder. Stoic and unmovable. Designed Terra's defences for the Siege.",
   fate:"Disappeared fighting aboard a Chaos fleet during the Chaos Space Marine War. Only his fist was recovered."},
  {num:"VIII",name:"Konrad Curze",legion:"Night Lords",loyal:false,color:"#1a1a2a",icon:"🦇",status:"Deceased",
   short:"The Night Haunter — cursed with visions of the future, prophet of doom. Ruled through absolute terror.",
   fate:"Allowed himself to be assassinated by Callidus assassin M'Shen. Believed his death was foreseen and chosen."},
  {num:"IX",name:"Sanguinius",legion:"Blood Angels",loyal:true,color:"#b03030",icon:"🩸",status:"Deceased",
   short:"The Great Angel — most beloved of all Primarchs. Possessed of angelic wings and a compassion that stood against the darkness of the galaxy.",
   fate:"Slain by Horus at the Siege of Terra. His death created the Sanguinary curse — the Black Rage that afflicts Blood Angels."},
  {num:"X",name:"Ferrus Manus",legion:"Iron Hands",loyal:true,color:"#5a5a5a",icon:"🔩",status:"Deceased",
   short:"The Gorgon — Primarch of the Iron Hands, his flesh replaced with living metal. Brilliant craftsman, terrible temper.",
   fate:"Beheaded by Fulgrim at the Drop Site Massacre on Isstvan V. The Iron Hands still mourn him."},
  {num:"XII",name:"Angron",legion:"World Eaters",loyal:false,color:"#8a0000",icon:"⚔️",status:"Daemon Prince",
   short:"The Red Angel — enslaved and tortured on Nuceria, implanted with the Butcher's Nails neural devices. Incapable of experiencing anything but rage.",
   fate:"Became Daemon Prince of Khorne during the Scouring. Banished by Grey Knights at Armageddon, returned in M42."},
  {num:"XIII",name:"Roboute Guilliman",legion:"Ultramarines",loyal:true,color:"#1e5a9e",icon:"📜",status:"ALIVE — Lord Commander",
   short:"The Avenging Son — statesman-general who codified Space Marine doctrine in the Codex Astartes. The greatest administrator in human history.",
   fate:"Mortally wounded by Fulgrim and preserved in stasis for 10,000 years. Resurrected by Ynnari in M41. Now Lord Commander of the Imperium."},
  {num:"XIV",name:"Mortarion",legion:"Death Guard",loyal:false,color:"#3a5a28",icon:"☣",status:"Daemon Prince",
   short:"The Pale King — survivor and poisoner, grew up in an atmosphere that would kill normal men. Obsessed with purging weakness.",
   fate:"Daemon Prince of Nurgle after his fleet was becalmed in the Warp during the Heresy. Rules the Plague Planet."},
  {num:"XV",name:"Magnus the Red",legion:"Thousand Sons",loyal:false,color:"#8a3a18",icon:"🔮",status:"Daemon Prince",
   short:"The Red Cyclops — greatest psyker ever born, scholar without equal. His forbidden sorcery brought doom on Prospero.",
   fate:"Daemon Prince of Tzeentch after Prospero burned. Now wages the Rubric of Ahriman's aftermath from the Planet of Sorcerers."},
  {num:"XVI",name:"Horus Lupercal",legion:"Luna Wolves / Sons of Horus",loyal:false,color:"#2a2a2a",icon:"👑",status:"Deceased",
   short:"The Warmaster — most beloved son of the Emperor, greatest warrior and commander of the age. His fall broke the Imperium forever.",
   fate:"Slain by the Emperor at the Siege of Terra. His soul destroyed completely — even Chaos could not resurrect him."},
  {num:"XVII",name:"Lorgar Aurelian",legion:"Word Bearers",loyal:false,color:"#5a3818",icon:"📖",status:"Daemon Prince (Dormant)",
   short:"The First Heretic — the most devout worshipper first of the Emperor, then of Chaos. He was the one who converted Horus.",
   fate:"Daemon Prince of Chaos Undivided. Has entered a meditative coma within Colchis since the end of the Heresy."},
  {num:"XVIII",name:"Vulkan",legion:"Salamanders",loyal:true,color:"#1a4a2a",icon:"🔥",status:"Alive (Whereabouts Unknown)",
   short:"The Forge Father — master craftsman and compassionate warrior. The Salamanders' ethos of protecting civilians stems directly from him.",
   fate:"One of the Perpetuals — truly immortal, dying and returning. Last seen giving up his immortality to forge a weapon against Chaos."},
  {num:"XIX",name:"Corvus Corax",legion:"Raven Guard",loyal:true,color:"#1a1a1a",icon:"🦅",status:"Missing",
   short:"The Ravenlord — master of shadow warfare, guerrilla tactics, and liberation. Freed slave worlds and led the forgotten.",
   fate:"Flew into the Eye of Terror alone to wage a one-man war against Chaos after the Heresy. Has not returned."},
  {num:"XX",name:"Alpharius Omegon",legion:"Alpha Legion",loyal:"Unknown",color:"#1a3a2a",icon:"🐍",status:"Uncertain",
   short:"The Hydra — twin Primarchs sharing one identity. Masters of infiltration and subversion. Their true allegiance remains debated.",
   fate:"Alpharius reportedly slain by Dorn. Omegon's status unknown. The Alpha Legion continues, serving an agenda no one understands."},
];

function LoreSection(){
  const [tab,setTab]=useState("factions");
  const [expanded,setExpanded]=useState(null);
  const toggle=id=>setExpanded(e=>e===id?null:id);

  return(
    <div style={{paddingBottom:80}}>
      {/* Header */}
      <div style={{padding:"20px 16px 0",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:6}}>Warhammer 40,000</div>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.text,marginBottom:8}}>The Lore</h2>
        <div style={{color:C.muted,fontSize:12,lineHeight:1.5,marginBottom:14}}>In the grim darkness of the far future, there is only war.</div>
        <div style={{display:"flex",gap:0,marginBottom:0}}>
          {[{id:"factions",label:"Factions"},{id:"timeline",label:"Timeline"},{id:"primarchs",label:"Primarchs"}].map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setExpanded(null);}} style={{flex:1,padding:"10px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===t.id?C.gold:"transparent"}`,color:tab===t.id?C.gold:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* FACTIONS */}
      {tab==="factions"&&(
        <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:4}}>Tap a faction to learn more</div>
          {FACTIONS_LORE.map(f=>{
            const isOpen=expanded===f.id;
            return(
              <div key={f.id} style={{background:`linear-gradient(135deg,${f.color}28,${C.card})`,border:`1px solid ${isOpen?f.color+"88":f.color+"44"}`,borderLeft:`3px solid ${isOpen?f.color:f.color+"88"}`,borderRadius:10,overflow:"hidden",transition:"border-color 0.2s"}}>
                <button onClick={()=>toggle(f.id)} style={{width:"100%",background:"transparent",border:"none",padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                  <span style={{fontSize:24,flexShrink:0}}>{f.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.text,marginBottom:2}}>{f.name}</div>
                    <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{f.sub}</div>
                  </div>
                  <span style={{color:C.goldDim,fontSize:18,flexShrink:0,transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
                </button>
                {isOpen&&(
                  <div style={{padding:"0 16px 16px"}}>
                    <div style={{height:1,background:`linear-gradient(to right,${f.color}88,transparent)`,marginBottom:14}}/>
                    <div style={{color:C.text,fontSize:13,lineHeight:1.8,marginBottom:14,whiteSpace:"pre-line"}}>{f.long}</div>
                    <div style={{background:"#ffffff05",border:`1px solid ${f.color}44`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Key Facts</div>
                      {f.keyFacts.map((fact,i)=>(
                        <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
                          <span style={{color:f.color==="#3a4a1a"?C.gold:f.color,fontSize:10,marginTop:3,flexShrink:0}}>▪</span>
                          <span style={{color:C.muted,fontSize:12,lineHeight:1.5}}>{fact}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TIMELINE */}
      {tab==="timeline"&&(
        <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:0}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:16}}>History of the 41st Millennium</div>
          {TIMELINE_LORE.map((era,i)=>{
            const isOpen=expanded===era.era;
            return(
              <div key={era.era} style={{display:"flex",gap:0}}>
                {/* Timeline spine */}
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:32,flexShrink:0}}>
                  <div style={{width:12,height:12,borderRadius:"50%",background:era.color,border:`2px solid ${era.color}`,flexShrink:0,marginTop:16,zIndex:1}}/>
                  {i<TIMELINE_LORE.length-1&&<div style={{width:2,flex:1,background:`linear-gradient(to bottom,${era.color}88,${TIMELINE_LORE[i+1].color}44)`,minHeight:20}}/>}
                </div>
                {/* Content */}
                <div style={{flex:1,marginBottom:8,paddingLeft:12}}>
                  <button onClick={()=>toggle(era.era)} style={{width:"100%",background:isOpen?`${era.color}18`:"transparent",border:`1px solid ${isOpen?era.color+"66":"transparent"}`,borderRadius:8,padding:"12px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:18}}>{era.icon}</span>
                      <div>
                        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:era.color,letterSpacing:2,textTransform:"uppercase"}}>{era.era}</div>
                        <div style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,color:C.text}}>{era.name}</div>
                      </div>
                      <span style={{marginLeft:"auto",color:C.goldDim,fontSize:14,transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
                    </div>
                    {!isOpen&&<div style={{color:C.muted,fontSize:12,lineHeight:1.5}}>{era.summary.slice(0,100)}…</div>}
                    {isOpen&&<div style={{color:C.text,fontSize:13,lineHeight:1.8,marginTop:8}}>{era.summary}</div>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PRIMARCHS */}
      {tab==="primarchs"&&(
        <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:4}}>The Emperor's Twenty Sons</div>
          {/* Loyal / Traitor split */}
          {[{label:"Loyal Primarchs",filter:p=>p.loyal===true},{label:"Traitor Primarchs",filter:p=>p.loyal===false},{label:"Unknown Allegiance",filter:p=>p.loyal==="Unknown"}].map(group=>{
            const members=PRIMARCHS_LORE.filter(group.filter);
            if(!members.length) return null;
            return(
              <div key={group.label} style={{marginBottom:8}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:group.label.includes("Traitor")?C.red:group.label.includes("Unknown")?C.goldDim:C.gold,letterSpacing:3,textTransform:"uppercase",marginBottom:8,padding:"6px 4px",borderBottom:`1px solid ${C.border}`}}>{group.label}</div>
                {members.map(p=>{
                  const isOpen=expanded===p.num;
                  return(
                    <div key={p.num} style={{background:`linear-gradient(135deg,${p.color}28,${C.card})`,border:`1px solid ${isOpen?p.color+"88":p.color+"33"}`,borderRadius:8,marginBottom:6,overflow:"hidden"}}>
                      <button onClick={()=>toggle(p.num)} style={{width:"100%",background:"transparent",border:"none",padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
                        <div style={{width:36,height:36,borderRadius:"50%",background:p.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{p.icon}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                            <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:1}}>Primarch {p.num}</span>
                            <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:p.loyal===true?C.gold:p.loyal===false?C.red:C.muted,background:`${p.loyal===true?C.gold:p.loyal===false?C.red:C.muted}22`,borderRadius:3,padding:"1px 6px",border:`1px solid ${p.loyal===true?C.gold:p.loyal===false?C.red:C.muted}44`}}>{p.status}</span>
                          </div>
                          <div style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                          <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{p.legion}</div>
                        </div>
                        <span style={{color:C.goldDim,fontSize:14,flexShrink:0,transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
                      </button>
                      {isOpen&&(
                        <div style={{padding:"0 14px 14px"}}>
                          <div style={{height:1,background:`linear-gradient(to right,${p.color}88,transparent)`,marginBottom:12}}/>
                          <p style={{color:C.text,fontSize:13,lineHeight:1.75,marginBottom:12}}>{p.short}</p>
                          <div style={{background:"#ffffff05",border:`1px solid ${p.color}33`,borderRadius:8,padding:"10px 12px"}}>
                            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Fate</div>
                            <p style={{color:C.muted,fontSize:12,lineHeight:1.6,fontStyle:"italic"}}>{p.fate}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComingSoon({icon,title,sub}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:20,padding:32,textAlign:"center"}}><div style={{fontSize:60,animation:"float 3s ease-in-out infinite"}}>{icon}</div><div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.gold}}>{title}</div><div style={{color:C.muted,fontStyle:"italic",maxWidth:300,lineHeight:1.6,fontSize:14}}>{sub}</div><div style={{border:`1px solid ${C.gold}44`,borderRadius:20,padding:"8px 22px",color:`${C.gold}88`,fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:3,textTransform:"uppercase"}}>Coming Next Phase</div></div>);}

const NAV=[{id:"library",icon:"📚",label:"Library"},{id:"lore",icon:"⚔️",label:"Lore"},{id:"reading",icon:"📖",label:"Reading"},{id:"painting",icon:"🎨",label:"Painting"}];

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
  const [section,setSection]=useState("library");
  const mainRef=useRef(null);
  useEffect(()=>{ if(mainRef.current) mainRef.current.scrollTop=0; },[section]);
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
        <div style={{flexShrink:0,height:52,background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",gap:10,position:"relative"}}>
          <div style={{height:2,position:"absolute",top:0,left:0,right:0,background:`linear-gradient(to right,transparent,${C.red},transparent)`}}/>
          <button onClick={()=>setSection("library")} style={{background:"transparent",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,padding:0}}>
            <svg width={28} height={28} viewBox="0 0 100 100"><text x="50" y="72" textAnchor="middle" fontSize="70" fill={C.gold} fontFamily="serif">⚜</text></svg>
            <div><div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:12,fontWeight:900,color:C.text,letterSpacing:2,lineHeight:1.1}}>WH40K</div><div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:4,textTransform:"uppercase",marginTop:-1}}>Companion</div></div><div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>{user?(<div style={{display:"flex",alignItems:"center",gap:8}}>{user.user_metadata?.avatar_url&&<img src={user.user_metadata.avatar_url} alt="avatar" style={{width:26,height:26,borderRadius:"50%",border:"1px solid #c9a84c"}}/>}<button onClick={signOut} style={{background:"transparent",border:"1px solid #2a2518",borderRadius:6,color:"#7a7060",padding:"4px 10px",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,cursor:"pointer"}}>LOGOUT</button></div>):(<button onClick={signInWithGoogle} style={{background:"transparent",border:"1px solid #c9a84c",borderRadius:8,color:"#c9a84c",padding:"6px 12px",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,cursor:"pointer"}}>LOGIN</button>)}</div>
          </button>
          <div style={{flex:1}}/>
          {section!=="home"&&<div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.goldDim,letterSpacing:2,textTransform:"uppercase"}}>{NAV.find(n=>n.id===section)?.label||""}</div>}
        </div>
        <div ref={mainRef} style={{flex:1,overflowY:"auto",overscrollBehavior:"contain"}}>
          {section==="home"    &&<HomePage setSection={setSection}/>}
          {section==="library" &&<LibrarySection user={user}/>}
          {section==="lore"&&<LoreSection/>}
          {section==="reading" &&<ComingSoon icon="📖" title="Reading Order"    sub="Guided paths through the Black Library."/>}
          {section==="painting"&&<PaintingTracker user={user}/>}
          
        </div>
        <div style={{flexShrink:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",height:58}}>
          {NAV.map(n=>(<button key={n.id} onClick={()=>setSection(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",padding:0,borderTop:`2px solid ${section===n.id?C.gold:"transparent"}`,transition:"border-color 0.15s"}}><span style={{fontSize:20,lineHeight:1}}>{n.icon}</span><span style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,color:section===n.id?C.gold:C.muted,textTransform:"uppercase"}}>{n.label}</span></button>))}
        </div>
      </div>
    </>
  );
}
