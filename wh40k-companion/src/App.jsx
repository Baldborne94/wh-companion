import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, signInWithGoogle, signOut } from "./lib/supabase";
import PaintingTracker from "./components/PaintingTracker";

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SB_URL = "https://xrcaxmoviaidghjeqedf.supabase.co";
const SB_KEY = "sb_publishable_vH3pVq00MZbjGKuf7ZH2Hw_Xr8WbKGx";
const SB_H   = { apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, "Content-Type":"application/json" };
const sb = {
  async get(t,q="")   { try{ const r=await fetch(`${SB_URL}/rest/v1/${t}?${q}`,{headers:SB_H}); return r.ok?r.json():[];} catch{return[];} },
  async upsert(t,d)   { try{ const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:"POST",headers:{...SB_H,Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(d)}); return r.ok?r.json():null;} catch{return null;} },
  storage:{
    async upload(path,file){ try{ const r=await fetch(`${SB_URL}/storage/v1/object/ebooks/${path}`,{method:"POST",headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,"x-upsert":"true"},body:file}); return r.ok;} catch{return false;} },
    url(path){ return `${SB_URL}/storage/v1/object/public/ebooks/${path}`; },
  },
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
  const chapters=await Promise.all(hrefs.map(async(href,idx)=>{
    const file=zip.file(opfDir+href)||zip.file(href); if(!file) return null;
    let html=await file.async("text");
    for(const m of [...html.matchAll(/src="([^"]+)"/g)]){
      const imgFile=zip.file(opfDir+m[1]);
      if(imgFile){const b64=await imgFile.async("base64"); const ext=m[1].split(".").pop().toLowerCase(); const mime=ext==="png"?"image/png":ext==="gif"?"image/gif":"image/jpeg"; html=html.replace(m[0],`src="data:${mime};base64,${b64}"`);}
    }
    const tMatch=html.match(/<title[^>]*>([^<]+)<\/title>/i)||html.match(/<h[123][^>]*>([^<]+)<\/h[123]>/i);
    return { html:highlightKeywords(html), label:tMatch?tMatch[1].trim():`Chapter ${idx+1}` };
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
function EpubReader({ url, title, bookId, initProgress, onProgress, onClose }) {
  const [chapters,  setChapters]  = useState([]);
  const [chIdx,     setChIdx]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Reader settings
  const [settings, setSettings] = useState({
    theme:"dark", fontIndex:0, fontSize:18, lineHeight:1.8, margin:24, paginate:true,
  });
  const updateSetting = (key,val) => setSettings(s=>({...s,[key]:val}));
  const T   = THEMES[settings.theme];
  const fnt = FONTS[settings.fontIndex];

  // Pagination
  const outerRef    = useRef(null);
  const innerRef    = useRef(null);
  const [pageIndex, setPageIndex]   = useState(0);
  const [totalPages,setTotalPages]  = useState(1);
  const [pageWidth, setPageWidth]   = useState(0);
  const [pageHeight,setPageHeight]  = useState(0);

  // UI
  const [showUI,       setShowUI]       = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc,      setShowToc]      = useState(false);
  const [loreKey,      setLoreKey]      = useState(null);
  const [dictWord,     setDictWord]     = useState(null);
  const uiTimerRef = useRef(null);

  // Touch
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchMoved  = useRef(false);

  // Load EPUB
  useEffect(()=>{
    let cancelled=false;
    parseEpub(url).then(chs=>{
      if(cancelled) return;
      setChapters(chs);
      setChIdx(Math.min(Math.floor((initProgress||0)*chs.length),Math.max(0,chs.length-1)));
      setLoading(false);
    }).catch(e=>{ if(!cancelled){setError(e.message);setLoading(false);} });
    return()=>{cancelled=true;};
  },[url]);

  // Load custom fonts
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

  // Measure pages after render
  const measurePages = useCallback(()=>{
    if(!outerRef.current||!innerRef.current||!settings.paginate) return;
    const ow=outerRef.current.clientWidth;
    const oh=outerRef.current.clientHeight;
    setPageWidth(ow); setPageHeight(oh);
    setTimeout(()=>{
      if(innerRef.current){
        const sw=innerRef.current.scrollWidth;
        setTotalPages(Math.max(1,Math.round(sw/ow)));
        setPageIndex(0);
      }
    },150);
  },[settings.paginate]);

  useEffect(()=>{ measurePages(); },[chIdx,settings,chapters,measurePages]);

  useEffect(()=>{
    if(!outerRef.current) return;
    const ro=new ResizeObserver(measurePages); ro.observe(outerRef.current); return()=>ro.disconnect();
  },[measurePages]);

  // Save progress
  useEffect(()=>{
    if(chapters.length>0){
      const pct=chIdx/chapters.length; onProgress(pct);
      sb.upsert("reading_progress",{book_id:bookId,chapter_index:chIdx,progress_pct:pct,last_read:new Date().toISOString()});
    }
  },[chIdx,chapters.length]);

  // Reset page on chapter change
  useEffect(()=>{ setPageIndex(0); },[chIdx]);

  // Auto-hide UI after 4 seconds
  const resetUiTimer = useCallback(()=>{
    if(uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if(!showSettings&&!showToc&&!loreKey&&!dictWord){
      uiTimerRef.current=setTimeout(()=>setShowUI(false),4000);
    }
  },[showSettings,showToc,loreKey,dictWord]);

  useEffect(()=>{ if(showUI) resetUiTimer(); return()=>{ if(uiTimerRef.current) clearTimeout(uiTimerRef.current); }; },[showUI,resetUiTimer]);

  // Navigation
  const prevPage=()=>{ if(pageIndex>0){ setPageIndex(p=>p-1); setShowUI(true); } else if(chIdx>0){ setChIdx(c=>c-1); } };
  const nextPage=()=>{ if(pageIndex<totalPages-1){ setPageIndex(p=>p+1); setShowUI(true); } else if(chIdx<chapters.length-1){ setChIdx(c=>c+1); } };

  // Touch handlers
  const onTouchStart=e=>{ touchStartX.current=e.touches[0].clientX; touchStartY.current=e.touches[0].clientY; touchMoved.current=false; };
  const onTouchMove =e=>{ if(Math.abs(e.touches[0].clientX-touchStartX.current)>10) touchMoved.current=true; };
  const onTouchEnd  =e=>{
    const dx=touchStartX.current-e.changedTouches[0].clientX;
    const dy=Math.abs(touchStartY.current-e.changedTouches[0].clientY);
    if(dy>40) return; // vertical scroll
    if(dx>50){ nextPage(); return; }
    if(dx<-50){ prevPage(); return; }
    if(!touchMoved.current){ // tap
      const x=e.changedTouches[0].clientX;
      const W=window.innerWidth;
      if(x<W*0.25){ prevPage(); return; }
      if(x>W*0.75){ nextPage(); return; }
      setShowUI(u=>!u); // center tap = toggle UI
    }
  };

  // Clicks on lore keywords or for dictionary
  const handleContentClick=useCallback(e=>{
    const kw=e.target.getAttribute?.("data-kw");
    if(kw&&LORE_DB[kw]){ setLoreKey(kw); return; }
  },[]);

  // Text selection → dictionary
  const handleMouseUp=useCallback(()=>{
    const sel=window.getSelection(); if(!sel||sel.isCollapsed) return;
    const word=sel.toString().trim().replace(/[^a-zA-Z'-]/g,"");
    if(word.length<2||word.includes(" ")) return;
    if(LORE_DB[word.toLowerCase()]) return;
    setDictWord(word);
    sel.removeAllRanges();
  },[]);

  const pct       = chapters.length>1 ? Math.round((chIdx/(chapters.length-1))*100) : 100;
  const globalPct = chapters.length>0  ? Math.round(((chIdx*100+(pageIndex/Math.max(1,totalPages-1))*100)/(chapters.length))|0) : 0;

  const readerStyle = {
    fontFamily:    fnt.value,
    fontSize:      settings.fontSize,
    lineHeight:    settings.lineHeight,
    color:         T.text,
    padding:       `24px ${settings.margin}px 24px`,
    wordBreak:     "break-word",
    hyphens:       "auto",
    textAlign:     "justify",
    maxWidth:      "100%",
  };

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
      <div style={{color:C.dim,fontSize:11,maxWidth:300}}>DRM-protected files cannot be opened. Try a DRM-free copy.</div>
      <button onClick={onClose} style={{marginTop:8,background:"transparent",border:`1px solid ${C.gold}`,borderRadius:8,padding:"10px 24px",color:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>Back to Library</button>
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,zIndex:600,background:T.bg,display:"flex",flexDirection:"column",transition:"background 0.3s"}}>

      {/* ── TOP BAR (auto-hides) ── */}
      <div style={{flexShrink:0,height:52,background:T.ui,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 12px",gap:8,transition:"opacity 0.3s, transform 0.3s",opacity:showUI?1:0,transform:showUI?"translateY(0)":"translateY(-100%)",pointerEvents:showUI?"auto":"none",position:"relative",zIndex:2}}>
        <button onClick={onClose} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"7px 14px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:1,flexShrink:0}}>← Back</button>
        <div style={{flex:1,fontFamily:"'Cinzel',serif",fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
        <button onClick={()=>{setShowToc(t=>!t);setShowUI(true);}} style={{background:showToc?`${C.gold}22`:"transparent",border:`1px solid ${showToc?C.gold:T.border}`,borderRadius:6,color:showToc?C.gold:T.muted,width:34,height:34,cursor:"pointer",fontSize:16}}>≡</button>
        <button onClick={()=>{setShowSettings(true);setShowUI(true);}} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,color:T.muted,width:34,height:34,cursor:"pointer",fontSize:16}}>⚙</button>
      </div>

      {/* ── PROGRESS BAR ── */}
      <div style={{height:2,background:T.border,flexShrink:0,position:"relative",zIndex:2}}>
        <div style={{height:"100%",width:`${globalPct}%`,background:`linear-gradient(to right,${C.gold},${C.red})`,transition:"width 0.5s"}}/>
      </div>

      {/* ── MAIN READING AREA ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden",position:"relative"}}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={handleContentClick} onMouseUp={handleMouseUp}>

        {/* TOC sidebar */}
        {showToc&&(
          <div style={{width:200,flexShrink:0,background:T.ui,borderRight:`1px solid ${T.border}`,overflowY:"auto",position:"absolute",top:0,left:0,bottom:0,zIndex:3}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",padding:"14px 16px 10px"}}>Contents</div>
            {chapters.map((ch,i)=>(
              <button key={i} onClick={()=>{setChIdx(i);setShowToc(false);setShowUI(true);}} style={{display:"block",width:"100%",textAlign:"left",background:i===chIdx?`${C.gold}18`:"transparent",border:"none",borderLeft:`2px solid ${i===chIdx?C.gold:"transparent"}`,padding:"10px 16px",color:i===chIdx?C.gold:T.muted,fontSize:12,cursor:"pointer",lineHeight:1.3}}>{ch.label}</button>
            ))}
          </div>
        )}

        {settings.paginate ? (
          /* ── PAGINATED MODE ── */
          <div ref={outerRef} style={{flex:1,overflow:"hidden",position:"relative",height:"100%"}}>
            <div ref={innerRef} style={{
              ...readerStyle,
              columnWidth:`${pageWidth||300}px`,
              columnFill:"auto",
              columnGap:0,
              height:pageHeight?`${pageHeight}px`:"100%",
              transform:`translateX(-${pageIndex*pageWidth}px)`,
              transition:"transform 0.3s ease",
              willChange:"transform",
              padding:`24px ${settings.margin}px`,
            }}
              dangerouslySetInnerHTML={{__html:chapters[chIdx]?.html||""}}
            />
            {/* Tap zones */}
            <div style={{position:"absolute",top:0,left:0,width:"25%",height:"100%",cursor:"w-resize"}}
              onClick={e=>{e.stopPropagation();prevPage();setShowUI(true);}}/>
            <div style={{position:"absolute",top:0,right:0,width:"25%",height:"100%",cursor:"e-resize"}}
              onClick={e=>{e.stopPropagation();nextPage();setShowUI(true);}}/>
          </div>
        ) : (
          /* ── SCROLL MODE ── */
          <div style={{flex:1,overflowY:"auto",position:"relative"}} ref={outerRef}>
            <div ref={innerRef} style={readerStyle} dangerouslySetInnerHTML={{__html:chapters[chIdx]?.html||""}}/>
          </div>
        )}
      </div>

      {/* ── BOTTOM BAR (auto-hides) ── */}
      <div style={{flexShrink:0,background:T.ui,borderTop:`1px solid ${T.border}`,height:56,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",transition:"opacity 0.3s, transform 0.3s",opacity:showUI?1:0,transform:showUI?"translateY(0)":"translateY(100%)",pointerEvents:showUI?"auto":"none"}}>
        <button onClick={prevPage} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 18px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1}}>← Prev</button>
        <div style={{textAlign:"center"}}>
          {settings.paginate?(
            <>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.muted}}>p. {pageIndex+1}/{totalPages}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim}}>ch. {chIdx+1}/{chapters.length}</div>
            </>
          ):(
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:T.muted}}>{chIdx+1} / {chapters.length}</div>
          )}
        </div>
        <button onClick={nextPage} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 18px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1}}>Next →</button>
      </div>

      {/* Keyword hint (first time) */}
      {showUI&&(
        <div style={{position:"absolute",bottom:64,left:"50%",transform:"translateX(-50%)",background:`${T.ui}ee`,border:`1px solid ${C.gold}33`,borderRadius:20,padding:"5px 14px",whiteSpace:"nowrap",pointerEvents:"none",transition:"opacity 0.3s",opacity:showUI?0.8:0}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.goldDim,letterSpacing:1}}>✨ Tap gold words for lore • Select words for dictionary</span>
        </div>
      )}

      {/* Overlays */}
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
function BookDetail({ book, onBack, onOpenReader }) {
  const fc=FC[book.faction]||C.dim;
  const inp=useRef(null);
  const [ebookMeta,setEbookMeta]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [uploadMsg,setUploadMsg]=useState("");
  const [isRead,   setIsRead]   =useState(false);
  const [progress, setProgress] =useState(0);

  useEffect(()=>{
    (async()=>{
      const [files,progData]=await Promise.all([sb.get("ebook_files",`book_id=eq.${book.id}&limit=1`),sb.get("reading_progress",`book_id=eq.${book.id}&limit=1`)]);
      if(files?.length) setEbookMeta(files[0]);
      if(progData?.length) setProgress(progData[0].progress_pct||0);
    })();
  },[book.id]);

  const handleFileSelect=async e=>{
    const file=e.target.files[0]; if(!file) return;
    setUploading(true); setUploadMsg("Uploading to cloud…");
    const path=`${book.id}/${file.name}`;
    const ok=await sb.storage.upload(path,file);
    if(ok){
      const meta={book_id:book.id,file_name:file.name,file_path:path,file_type:file.name.endsWith(".pdf")?"pdf":"epub"};
      await sb.upsert("ebook_files",meta);
      setEbookMeta(meta); setUploadMsg("✅ Uploaded!");
    } else { setUploadMsg("❌ Upload failed — check Supabase storage policy."); }
    setUploading(false); setTimeout(()=>setUploadMsg(""),3000);
  };

  const handleOpenReader=()=>{
    if(!ebookMeta) return;
    onOpenReader({book,url:sb.storage.url(ebookMeta.file_path),fileType:ebookMeta.file_type,progress});
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
            {ebookMeta?(
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

function LibrarySection() {
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

  const handleOpenReader=({book,url,fileType,progress})=>setReader({book,url,fileType,progress});

  if(reader){
    const {book,url,fileType,progress}=reader;
    if(fileType==="pdf") return <PdfReader url={url} title={book.title} onClose={()=>setReader(null)}/>;
    return <EpubReader url={url} title={book.title} bookId={book.id} initProgress={progress} onProgress={()=>{}} onClose={()=>setReader(null)}/>;
  }
  if(detail) return <BookDetail book={detail} onBack={()=>setDetail(null)} onOpenReader={handleOpenReader}/>;

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
          {section==="library" &&<LibrarySection/>}
          {section==="lore"&&<ComingSoon icon="⚔️" title="Factions & Lore"  sub="Deep dives into every faction, Primarch and Chapter."/>}
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
