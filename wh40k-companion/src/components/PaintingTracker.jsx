// src/components/PaintingTracker.jsx
// ══════════════════════════════════════════════════════════════════════════
// WH40K Companion — Painting Tracker
// Features: Community Gallery, My Collection, Add/Edit modal,
//           Citadel paint picker, photo upload, AI color recommendations
// ══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { db, storage } from "../lib/supabase";

// ─── THEME ────────────────────────────────────────────────────────────────

const C = {
  bg: "#0a0905", surface: "#111009", card: "#16140f", border: "#2a2518",
  gold: "#c9a84c", goldDim: "#7a6330", red: "#b03030",
  text: "#d4cbb8", muted: "#7a7060", dim: "#3a3428",
};

// ─── STATUS CONFIG ────────────────────────────────────────────────────────

const STATUS = [
  { id: "owned",      icon: "📦", label: "Owned",      color: "#4a4a4a" },
  { id: "assembled",  icon: "🔧", label: "Assembled",  color: "#2a5a6a" },
  { id: "base_coat",  icon: "🎨", label: "Base Coat",  color: "#5a2a7a" },
  { id: "painted",    icon: "🖌️", label: "Painted",    color: "#7a5a10" },
  { id: "completed",  icon: "✅", label: "Completed",  color: "#1a6a2a" },
];

const statusIndex = (s) => STATUS.findIndex((x) => x.id === s);

// ─── CITADEL PAINTS DATABASE ──────────────────────────────────────────────

const CITADEL_PAINTS = [
  // Base
  { name:"Abaddon Black",         hex:"#111111", range:"Base" },
  { name:"Corax White",           hex:"#eeeeee", range:"Base" },
  { name:"Mephiston Red",         hex:"#9c1515", range:"Base" },
  { name:"Khorne Red",            hex:"#6e1a1a", range:"Base" },
  { name:"Macragge Blue",         hex:"#1a3d6b", range:"Base" },
  { name:"Kantor Blue",           hex:"#0e2a5a", range:"Base" },
  { name:"Caliban Green",         hex:"#0e4a1f", range:"Base" },
  { name:"Castellan Green",       hex:"#2a4a1a", range:"Base" },
  { name:"Death Guard Green",     hex:"#6b7a40", range:"Base" },
  { name:"Leadbelcher",           hex:"#787878", range:"Base" },
  { name:"Retributor Armour",     hex:"#c9a84c", range:"Base" },
  { name:"Balthasar Gold",        hex:"#8a6030", range:"Base" },
  { name:"Wraithbone",            hex:"#d4c5a0", range:"Base" },
  { name:"Zandri Dust",           hex:"#a89060", range:"Base" },
  { name:"XV-88",                 hex:"#9a7a30", range:"Base" },
  { name:"Steel Legion Drab",     hex:"#7a6040", range:"Base" },
  { name:"Bugman's Glow",         hex:"#8a4a38", range:"Base" },
  { name:"Rakarth Flesh",         hex:"#b09878", range:"Base" },
  { name:"Celestra Grey",         hex:"#8a9090", range:"Base" },
  { name:"Mechanicus Standard Grey",hex:"#4a5058",range:"Base" },
  { name:"Daemonette Hide",       hex:"#6a4a6a", range:"Base" },
  { name:"Incubi Darkness",       hex:"#0e3a38", range:"Base" },
  // Shade
  { name:"Nuln Oil",              hex:"#0a0a14", range:"Shade" },
  { name:"Agrax Earthshade",      hex:"#5a3a18", range:"Shade" },
  { name:"Reikland Fleshshade",   hex:"#7a3018", range:"Shade" },
  { name:"Carroburg Crimson",     hex:"#6e1a2a", range:"Shade" },
  { name:"Drakenhof Nightshade",  hex:"#1a2a5a", range:"Shade" },
  { name:"Biel-Tan Green",        hex:"#1a4a28", range:"Shade" },
  { name:"Seraphim Sepia",        hex:"#6a4a18", range:"Shade" },
  { name:"Druchii Violet",        hex:"#4a1a5a", range:"Shade" },
  { name:"Athonian Camoshade",    hex:"#3a4a18", range:"Shade" },
  { name:"Fuegan Orange",         hex:"#8a3a0a", range:"Shade" },
  // Layer
  { name:"Evil Sunz Scarlet",     hex:"#c03020", range:"Layer" },
  { name:"Wild Rider Red",        hex:"#e04020", range:"Layer" },
  { name:"Altdorf Guard Blue",    hex:"#1a4a8a", range:"Layer" },
  { name:"Calgar Blue",           hex:"#2a5a9a", range:"Layer" },
  { name:"Teclis Blue",           hex:"#3a6aaa", range:"Layer" },
  { name:"Skarsnik Green",        hex:"#3a8a30", range:"Layer" },
  { name:"Warpstone Glow",        hex:"#2a8a20", range:"Layer" },
  { name:"Yriel Yellow",          hex:"#e0b820", range:"Layer" },
  { name:"Flash Gitz Yellow",     hex:"#f0d030", range:"Layer" },
  { name:"Ushabti Bone",          hex:"#c0a870", range:"Layer" },
  { name:"Screaming Skull",       hex:"#d0c090", range:"Layer" },
  { name:"Runefang Steel",        hex:"#b8b8b8", range:"Layer" },
  { name:"Ironbreaker",           hex:"#909090", range:"Layer" },
  { name:"Auric Armour Gold",     hex:"#d0a840", range:"Layer" },
  { name:"Gehenna's Gold",        hex:"#c09030", range:"Layer" },
  { name:"Cadian Fleshtone",      hex:"#c07858", range:"Layer" },
  { name:"Kislev Flesh",          hex:"#d09070", range:"Layer" },
  { name:"Lugganath Orange",      hex:"#d07050", range:"Layer" },
  // Dry
  { name:"Necron Compound",       hex:"#c0c0c0", range:"Dry" },
  { name:"Praxeti White",         hex:"#e8e8e8", range:"Dry" },
  { name:"Longbeard Grey",        hex:"#a0a8a8", range:"Dry" },
  { name:"Ryza Rust",             hex:"#b05020", range:"Dry" },
  { name:"Terminatus Stone",      hex:"#b8a880", range:"Dry" },
  // Contrast
  { name:"Black Templar",         hex:"#1a1a2a", range:"Contrast" },
  { name:"Blood Angels Red",      hex:"#c02020", range:"Contrast" },
  { name:"Ultramarines Blue",     hex:"#1a3a7a", range:"Contrast" },
  { name:"Militarum Green",       hex:"#3a5a28", range:"Contrast" },
  { name:"Skeleton Horde",        hex:"#c8a860", range:"Contrast" },
  { name:"Plaguebearer Flesh",    hex:"#8a9a40", range:"Contrast" },
  { name:"Gore-grunta Fur",       hex:"#6a3a18", range:"Contrast" },
  { name:"Basilicanum Grey",      hex:"#505060", range:"Contrast" },
  { name:"Space Wolves Grey",     hex:"#6a7a88", range:"Contrast" },
  { name:"Snakebite Leather",     hex:"#8a5a20", range:"Contrast" },
  { name:"Guilliman Flesh",       hex:"#b87060", range:"Contrast" },
  { name:"Magos Purple",          hex:"#5a2a6a", range:"Contrast" },
  { name:"Talassar Blue",         hex:"#1a5a7a", range:"Contrast" },
  { name:"Cygor Brown",           hex:"#5a3a1a", range:"Contrast" },
  // Technical
  { name:"Agrellan Earth",        hex:"#8a6040", range:"Technical" },
  { name:"Typhus Corrosion",      hex:"#3a3828", range:"Technical" },
  { name:"Nihilakh Oxide",        hex:"#409080", range:"Technical" },
  { name:"Blood for the Blood God",hex:"#8a1010",range:"Technical" },
  { name:"Waystone Green",        hex:"#408040", range:"Technical" },
  { name:"Hexwraith Flame",       hex:"#40a040", range:"Technical" },
];

const PAINT_RANGES = ["Base","Shade","Layer","Dry","Contrast","Technical"];
const USAGE_TYPES  = ["base","layer","shade","highlight","drybrush","technical","contrast"];

// ─── PINTEREST ────────────────────────────────────────────────────────────
function pinterestUrl(faction, unit) {
  const q = encodeURIComponent(`${unit || faction} warhammer 40k miniature painting`);
  return `https://it.pinterest.com/search/pins/?q=${q}`;
}

// ─── WH40K FACTIONS & UNITS ───────────────────────────────────────────────

const FACTIONS = {
  "Space Marines":        ["Intercessors","Hellblasters","Aggressors","Terminators","Assault Marines","Devastators","Chaplain","Librarian","Captain","Ancient","Redemptor Dreadnought"],
  "Blood Angels":         ["Death Company","Sanguinary Guard","Sanguinary Priest","Mephiston","Dante","Lemartes"],
  "Dark Angels":          ["Deathwing Terminators","Ravenwing Black Knights","Interrogator-Chaplain","Azrael","Belial"],
  "Space Wolves":         ["Blood Claws","Grey Hunters","Long Fangs","Wolf Guard","Thunderwolf Cavalry","Bjorn"],
  "Black Templars":       ["Crusader Squad","Emperor's Champion","Grimaldus"],
  "Chaos Space Marines":  ["Chaos Warriors","Terminators","Obliterators","Havocs","Daemon Prince","Chaos Lord"],
  "Death Guard":          ["Plague Marines","Blightlord Terminators","Mortarion","Daemon Prince of Nurgle","Foetid Bloat-drone"],
  "Thousand Sons":        ["Rubric Marines","Scarab Occult Terminators","Magnus the Red","Ahriman"],
  "World Eaters":         ["Berzerkers","Jakhals","Angron","Eightbound"],
  "Emperor's Children":   ["Noise Marines","Fulgrim","Lucius the Eternal"],
  "Night Lords":          ["Chaos Space Marines","Raptors","Konrad Curze"],
  "Iron Warriors":        ["Obliterators","Warsmith","Perturabo"],
  "Astra Militarum":      ["Infantry Squad","Veterans","Rough Riders","Leman Russ","Commissar","Sentinel"],
  "Adeptus Mechanicus":   ["Skitarii Rangers","Skitarii Vanguard","Kataphron","Onager Dunecrawler","Tech-Priest"],
  "Adepta Sororitas":     ["Battle Sisters","Celestians","Retributors","Penitent Engine","Cannoness","Repentia"],
  "Grey Knights":         ["Strike Squad","Terminators","Nemesis Dreadknight","Grand Master"],
  "Necrons":              ["Necron Warriors","Immortals","Lychguard","Triarch Praetorians","Overlord","C'tan"],
  "Tyranids":             ["Hormagaunts","Termagants","Genestealers","Warriors","Hive Tyrant","Carnifex","Trygon"],
  "Orks":                 ["Boyz","Nobz","Mega Nobz","Warboss","Deff Dread","Gretchin","Flash Gitz"],
  "T'au Empire":          ["Fire Warriors","Pathfinders","Crisis Battlesuit","Riptide","Commander","Ghostkeel"],
  "Aeldari":              ["Guardians","Dire Avengers","Howling Banshees","Wraithguard","Avatar of Khaine","Farseer"],
  "Drukhari":             ["Kabalite Warriors","Wyches","Incubi","Grotesques","Archon"],
  "Custodes":             ["Custodian Guard","Allarus Custodians","Vertus Praetors","Shield-Captain"],
  "Leagues of Votann":    ["Hearthkyn Warriors","Hearthguard","Sagitaur","Einhyr Champion"],
  "Genestealer Cults":    ["Neophyte Hybrids","Acolyte Hybrids","Aberrants","Patriarch"],
};

// ─── AI RECOMMENDATIONS ───────────────────────────────────────────────────

async function getAiRecommendations(faction, unit) {
  const prompt = `Sei un esperto di pittura di miniature Warhammer 40K. 
Fornisci uno schema colori Citadel per ${unit} della fazione ${faction}.
Rispondi SOLO con un JSON array, nessun markdown o testo extra.
Formato: [{"part":"nome parte","steps":[{"type":"base|shade|layer|highlight","paint":"nome colore Citadel","hex":"#hexcode"}]}]
Usa colori Citadel reali. Max 4-5 parti, 2-4 step per parte.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await resp.json();
  const text = data.content?.map((i) => i.text || "").join("") ?? "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── SUB-COMPONENTS ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── STATUS STEPPER ───────────────────────────────────────────────────────

function StatusStepper({ value, onChange }) {
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {STATUS.map((s, i) => {
        const active = value === s.id;
        const past   = i <= statusIndex(value);
        return (
          <button key={s.id} onClick={() => onChange(s.id)}
            style={{
              flex: "1 1 auto",
              padding: "8px 4px",
              borderRadius: 8,
              border: `1px solid ${active ? s.color : C.border}`,
              background: active ? `${s.color}33` : past ? `${s.color}11` : "transparent",
              color: active ? "#fff" : past ? C.text : C.muted,
              fontFamily: "'Cinzel',serif",
              fontSize: 10,
              letterSpacing: 1,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              transition: "all 0.2s",
            }}>
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── PAINT PICKER ─────────────────────────────────────────────────────────

function PaintPicker({ onSelect, onClose }) {
  const [search, setSearch]   = useState("");
  const [range,  setRange]    = useState("All");

  const filtered = CITADEL_PAINTS.filter((p) => {
    const matchRange  = range === "All" || p.range === range;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchRange && matchSearch;
  });

  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,0.7)",
               display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background:C.surface, border:`1px solid ${C.border}`,
                 borderTop:`2px solid ${C.gold}`, borderRadius:"16px 16px 0 0",
                 padding:"16px 16px 40px", width:"100%", maxWidth:600,
                 maxHeight:"70vh", display:"flex", flexDirection:"column" }}>
        <div style={{ width:36, height:4, background:C.border, borderRadius:2, margin:"0 auto 12px" }}/>

        {/* Search */}
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca colore Citadel…"
          style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
                   padding:"10px 14px", color:C.text, fontFamily:"'Cinzel',serif",
                   fontSize:13, width:"100%", boxSizing:"border-box", marginBottom:10 }}
        />

        {/* Range filter */}
        <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:8, marginBottom:10 }}>
          {["All",...PAINT_RANGES].map((r) => (
            <button key={r} onClick={() => setRange(r)}
              style={{ flexShrink:0, padding:"4px 10px", borderRadius:20,
                       border:`1px solid ${range===r ? C.gold : C.border}`,
                       background: range===r ? `${C.gold}22` : "transparent",
                       color: range===r ? C.gold : C.muted,
                       fontFamily:"'Cinzel',serif", fontSize:10, cursor:"pointer" }}>
              {r}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={{ overflowY:"auto", flex:1 }}>
          {filtered.length === 0 && (
            <div style={{ color:C.muted, fontSize:13, textAlign:"center", padding:24 }}>
              Nessun colore trovato
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {filtered.map((p) => (
              <button key={p.name} onClick={() => onSelect(p)}
                style={{ display:"flex", alignItems:"center", gap:10,
                         padding:"10px 12px", borderRadius:8, cursor:"pointer",
                         background:C.card, border:`1px solid ${C.border}`,
                         textAlign:"left", transition:"border-color 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = C.gold}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}>
                <div style={{ width:28, height:28, borderRadius:6, background:p.hex,
                              border:"1px solid rgba(255,255,255,0.15)", flexShrink:0 }}/>
                <div>
                  <div style={{ color:C.text, fontSize:11, fontWeight:600, lineHeight:1.2 }}>
                    {p.name}
                  </div>
                  <div style={{ color:C.muted, fontSize:9, fontFamily:"'Cinzel',serif",
                                letterSpacing:1, marginTop:2 }}>
                    {p.range}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAINT ROW (colore aggiunto alla mini) ────────────────────────────────

function PaintRow({ paint, onRemove }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8,
                  background:C.card, border:`1px solid ${C.border}`,
                  borderRadius:8, padding:"8px 12px" }}>
      <div style={{ width:22, height:22, borderRadius:4, background:paint.paint_hex || "#555",
                    border:"1px solid rgba(255,255,255,0.15)", flexShrink:0 }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ color:C.text, fontSize:12, fontWeight:600,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {paint.paint_name}
        </div>
        <div style={{ color:C.muted, fontSize:10 }}>
          {paint.part_name && <span>{paint.part_name} · </span>}
          <span style={{ fontFamily:"'Cinzel',serif", letterSpacing:1 }}>
            {paint.usage_type} · {paint.paint_range}
          </span>
        </div>
      </div>
      <button onClick={onRemove}
        style={{ background:"transparent", border:"none", color:C.muted,
                 cursor:"pointer", fontSize:16, padding:"2px 4px" }}>
        ×
      </button>
    </div>
  );
}

// ─── PHOTO LIGHTBOX ───────────────────────────────────────────────────────

function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,0.92)",
               display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <img src={src} alt={alt}
        style={{ maxWidth:"100%", maxHeight:"90vh", objectFit:"contain",
                 borderRadius:8, boxShadow:"0 8px 40px rgba(0,0,0,0.8)" }}
        onClick={e => e.stopPropagation()}/>
      <button onClick={onClose}
        style={{ position:"absolute", top:16, right:16, background:"rgba(0,0,0,0.6)",
                 border:`1px solid ${C.border}`, borderRadius:"50%", color:"#fff",
                 width:36, height:36, fontSize:18, cursor:"pointer",
                 display:"flex", alignItems:"center", justifyContent:"center" }}>
        ✕
      </button>
    </div>
  );
}

// ─── MINI CARD ────────────────────────────────────────────────────────────

function MiniCard({ mini, paints = [], isOwner, onEdit, onClick, onLightbox }) {
  const st       = STATUS.find((s) => s.id === mini.status) || STATUS[0];
  const faction  = mini.faction || "";

  return (
    <div onClick={onClick}
      style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12,
               overflow:"hidden", cursor:"pointer", transition:"border-color 0.2s" }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = C.gold}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}>

      {/* Photo / Placeholder */}
      <div style={{ height:140, background:`${C.surface}`, position:"relative",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    overflow:"hidden" }}>
        {mini.photo_url ? (
          <img src={mini.photo_url} alt={mini.name}
            onClick={e => { e.stopPropagation(); onLightbox?.(mini.photo_url, mini.name); }}
            style={{ width:"100%", height:"100%", objectFit:"cover", cursor:"zoom-in" }}/>
        ) : (
          <div style={{ fontSize:40, opacity:0.2 }}>⚙</div>
        )}
        {/* Status badge */}
        <div style={{ position:"absolute", top:8, right:8,
                      background:`${st.color}dd`, borderRadius:20,
                      padding:"3px 8px", display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:11 }}>{st.icon}</span>
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:"#fff",
                         letterSpacing:1 }}>
            {st.label}
          </span>
        </div>
        {/* Edit button (owner only) */}
        {isOwner && (
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{ position:"absolute", top:8, left:8, background:"rgba(0,0,0,0.6)",
                     border:`1px solid ${C.border}`, borderRadius:6, color:C.gold,
                     padding:"4px 8px", fontFamily:"'Cinzel',serif", fontSize:10,
                     cursor:"pointer" }}>
            Edit
          </button>
        )}
      </div>

      <div style={{ padding:"12px 12px 14px" }}>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13,
                      color:C.text, marginBottom:4, lineHeight:1.3,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {mini.name}
        </div>
        {faction && (
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.gold,
                        letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>
            {faction}{mini.unit_type && ` · ${mini.unit_type}`}
          </div>
        )}
        {/* Color swatches */}
        {paints.length > 0 && (
          <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
            {paints.slice(0,8).map((p, i) => (
              <div key={i}
                title={`${p.paint_name} (${p.part_name || p.usage_type})`}
                style={{ width:16, height:16, borderRadius:3, background:p.paint_hex || "#555",
                         border:"1px solid rgba(255,255,255,0.1)" }}/>
            ))}
            {paints.length > 8 && (
              <div style={{ width:16, height:16, borderRadius:3, background:C.dim,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:8, color:C.muted }}>
                +{paints.length - 8}
              </div>
            )}
          </div>
        )}
        {/* Pinterest link */}
        {faction && (
          <a href={pinterestUrl(faction, mini.unit_type)} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ display:"inline-flex", alignItems:"center", gap:4, textDecoration:"none",
                     background:"#e6000022", border:"1px solid #e6000055", borderRadius:6,
                     padding:"3px 8px", fontSize:9, color:"#e06060",
                     fontFamily:"'Cinzel',serif", letterSpacing:1 }}>
            📌 Pinterest
          </a>
        )}
      </div>
    </div>
  );
}

// ─── AI RECOMMENDATIONS PANEL ─────────────────────────────────────────────

function AiRecommendations({ faction, unit, onApply }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = async () => {
    if (!faction) { setError("Seleziona una fazione prima"); return; }
    setLoading(true); setError(null);
    try {
      const result = await getAiRecommendations(faction, unit || faction);
      setData(result);
    } catch (e) {
      setError("Errore nella chiamata AI. Controlla la console.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const USAGE_COLOR = {
    base:"#4a4a4a", shade:"#1a2a5a", layer:"#7a5a10",
    highlight:"#c9a84c", drybrush:"#5a3a1a",
  };

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.gold}44`,
                  borderRadius:12, overflow:"hidden" }}>
      <div style={{ background:`${C.gold}11`, borderBottom:`1px solid ${C.gold}33`,
                    padding:"12px 16px", display:"flex", alignItems:"center",
                    justifyContent:"space-between" }}>
        <div>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:C.gold,
                        letterSpacing:2 }}>
            ⚡ AI Color Advisor
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
            Schema colori Citadel generato da Claude
          </div>
        </div>
        <button onClick={load} disabled={loading}
          style={{ background:loading ? C.dim : `${C.gold}22`,
                   border:`1px solid ${C.gold}`, borderRadius:8,
                   color:C.gold, padding:"8px 14px", fontFamily:"'Cinzel',serif",
                   fontSize:11, letterSpacing:1, cursor:loading ? "default" : "pointer",
                   opacity:loading ? 0.6 : 1 }}>
          {loading ? "⚙ Calcolo…" : data ? "⟳ Rigenera" : "✦ Genera Schema"}
        </button>
      </div>

      {error && (
        <div style={{ padding:"12px 16px", color:C.red, fontSize:12 }}>{error}</div>
      )}

      {data && (
        <div style={{ padding:"12px 16px" }}>
          {data.map((part, pi) => (
            <div key={pi} style={{ marginBottom:14 }}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:C.gold,
                            letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>
                {part.part}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {part.steps?.map((step, si) => {
                  const citadel = CITADEL_PAINTS.find(
                    (p) => p.name.toLowerCase() === step.paint?.toLowerCase()
                  );
                  const hex = citadel?.hex || step.hex || "#555";
                  return (
                    <div key={si}
                      style={{ display:"flex", alignItems:"center", gap:8,
                               background:C.card, borderRadius:6, padding:"6px 10px" }}>
                      <div style={{ width:18, height:18, borderRadius:3, background:hex,
                                    border:"1px solid rgba(255,255,255,0.1)", flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <span style={{ color:C.text, fontSize:12 }}>{step.paint}</span>
                        <span style={{ background:`${USAGE_COLOR[step.type] || "#333"}55`,
                                       borderRadius:4, padding:"1px 6px", fontSize:9,
                                       color:"#ccc", marginLeft:8,
                                       fontFamily:"'Cinzel',serif", letterSpacing:1 }}>
                          {step.type}
                        </span>
                      </div>
                      <button
                        title="Aggiungi al mio schema"
                        onClick={() => onApply({
                          paint_name: step.paint,
                          paint_hex:  hex,
                          paint_range: citadel?.range || "",
                          part_name:  part.part,
                          usage_type: step.type,
                          paint_brand:"Citadel",
                        })}
                        style={{ background:"transparent", border:`1px solid ${C.gold}55`,
                                 borderRadius:4, color:C.gold, cursor:"pointer",
                                 fontSize:11, padding:"2px 8px" }}>
                        +
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── MINI MODAL (Add / Edit) ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function MiniModal({ mini, userId, onSave, onClose }) {
  const isEdit = !!mini;
  const photoInput = useRef(null);

  const [form, setForm]       = useState({
    name:               mini?.name ?? "",
    faction:            mini?.faction ?? "",
    unit_type:          mini?.unit_type ?? "",
    status:             mini?.status ?? "owned",
    notes:              mini?.notes ?? "",
    color_scheme_notes: mini?.color_scheme_notes ?? "",
    photo_url:          mini?.photo_url ?? "",
    is_public:          mini?.is_public ?? true,
  });
  const [paints,      setPaints]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [photoLoading,setPhotoLoading]= useState(false);
  const [showPicker,  setShowPicker]  = useState(false);
  const [pendingPaint,setPendingPaint]= useState(null); // paint selected but not yet part-annotated
  const [partInput,   setPartInput]   = useState("");
  const [usageInput,  setUsageInput]  = useState("base");

  // Load existing paints if editing
  useEffect(() => {
    if (!mini?.id) return;
    db.get("miniature_paints", `miniature_id=eq.${mini.id}`)
      .then(setPaints);
  }, [mini?.id]);

  const units = FACTIONS[form.faction] ?? [];

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    try {
      const path = `${userId}/${Date.now()}_${file.name}`;
      await storage.upload("miniatures", path, file);
      const url = storage.url("miniatures", path);
      setForm((f) => ({ ...f, photo_url: url }));
    } catch (err) {
      alert("Errore upload foto: " + err.message);
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSelectPaint = (p) => {
    setPendingPaint(p);
    setShowPicker(false);
  };

  const handleAddPaint = () => {
    if (!pendingPaint) return;
    const entry = {
      id: crypto.randomUUID(),  // temp id for local state
      _new: true,
      paint_name:  pendingPaint.name,
      paint_hex:   pendingPaint.hex,
      paint_range: pendingPaint.range,
      paint_brand: "Citadel",
      part_name:   partInput || "",
      usage_type:  usageInput,
      sort_order:  paints.length,
    };
    setPaints((ps) => [...ps, entry]);
    setPendingPaint(null);
    setPartInput("");
    setUsageInput("base");
  };

  const handleApplyAi = (paint) => {
    const entry = {
      id: crypto.randomUUID(),
      _new: true,
      ...paint,
      sort_order: paints.length,
    };
    setPaints((ps) => [...ps, entry]);
  };

  const handleRemovePaint = (id) => {
    setPaints((ps) => ps.filter((p) => p.id !== id));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert("Nome obbligatorio!"); return; }
    setLoading(true);
    try {
      let miniId = mini?.id;
      const payload = { ...form, user_id: userId };

      if (isEdit) {
        await db.update("miniatures", miniId, payload);
      } else {
        const created = await db.insert("miniatures", payload);
        miniId = created.id;
      }

      // Sync paints: delete all, re-insert
      // (simple approach — for a production app you'd diff)
      if (miniId) {
        // Delete old paints for this mini (via RLS the user can only delete their own)
        const existing = await db.get("miniature_paints", `miniature_id=eq.${miniId}`);
        for (const p of existing) {
          await db.delete("miniature_paints", p.id);
        }
        // Insert all current paints
        for (const p of paints) {
          // eslint-disable-next-line no-unused-vars
          const { id: _id, _new, ...rest } = p;
          await db.insert("miniature_paints", { ...rest, miniature_id: miniId });
        }
      }

      onSave();
    } catch (err) {
      alert("Errore nel salvataggio: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const Label = ({ children }) => (
    <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim,
                  letterSpacing:3, textTransform:"uppercase", marginBottom:6, marginTop:14 }}>
      {children}
    </div>
  );

  const Input = ({ value, onChange, placeholder, multiline }) => {
    const s = {
      background: C.card, border:`1px solid ${C.border}`, borderRadius:8,
      padding:"10px 14px", color:C.text, fontSize:13, width:"100%",
      boxSizing:"border-box", fontFamily:"inherit", resize:"vertical",
    };
    return multiline
      ? <textarea rows={3} value={value} onChange={onChange} placeholder={placeholder} style={s}/>
      : <input value={value} onChange={onChange} placeholder={placeholder} style={s}/>;
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:800,
                  background:"rgba(0,0,0,0.8)", overflowY:"auto",
                  display:"flex", justifyContent:"center", alignItems:"flex-start" }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`,
                    borderRadius:16, width:"100%", maxWidth:600,
                    margin:"16px 16px 60px", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`,
                      padding:"16px 20px", display:"flex",
                      justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:16, color:C.text }}>
            {isEdit ? "Modifica Miniatura" : "Aggiungi Miniatura"}
          </span>
          <button onClick={onClose}
            style={{ background:"transparent", border:`1px solid ${C.dim}`,
                     borderRadius:6, color:C.muted, width:32, height:32,
                     cursor:"pointer", fontSize:16 }}>
            ✕
          </button>
        </div>

        <div style={{ padding:"16px 20px 24px" }}>
          {/* Name */}
          <Label>Nome Miniatura</Label>
          <Input value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="es. Space Marine Sergeant"/>

          {/* Faction + Unit */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:4 }}>
            <div>
              <Label>Fazione</Label>
              <select value={form.faction}
                onChange={(e) => setForm((f) => ({ ...f, faction:e.target.value, unit_type:"" }))}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
                         padding:"10px 14px", color:form.faction ? C.text : C.muted,
                         fontSize:13, width:"100%", boxSizing:"border-box" }}>
                <option value="">— Fazione —</option>
                {Object.keys(FACTIONS).map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <Label>Unità / Tipo</Label>
              <select value={form.unit_type}
                onChange={(e) => setForm((f) => ({ ...f, unit_type:e.target.value }))}
                disabled={!units.length}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
                         padding:"10px 14px", color:form.unit_type ? C.text : C.muted,
                         fontSize:13, width:"100%", boxSizing:"border-box",
                         opacity:units.length ? 1 : 0.5 }}>
                <option value="">— Unità —</option>
                {units.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Pinterest inspiration link */}
          {form.faction && (
            <a href={pinterestUrl(form.faction, form.unit_type)} target="_blank" rel="noopener noreferrer"
              style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none",
                       background:"#e6000015", border:"1px solid #e6000044", borderRadius:8,
                       padding:"10px 14px", marginTop:8, color:"#e07070",
                       fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1 }}>
              📌 Cerca ispirazione su Pinterest →
              <span style={{ fontSize:10, color:"#e07070aa", marginLeft:"auto" }}>
                {form.unit_type || form.faction}
              </span>
            </a>
          )}

          {/* Status */}
          <Label>Stato di avanzamento</Label>
          <StatusStepper value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status:v }))}/>

          {/* Photo */}
          <Label>Foto</Label>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            {form.photo_url && (
              <img src={form.photo_url} alt="preview"
                style={{ width:80, height:80, objectFit:"cover",
                         borderRadius:8, border:`1px solid ${C.border}` }}/>
            )}
            <button onClick={() => photoInput.current.click()} disabled={photoLoading}
              style={{ flex:1, padding:"12px", borderRadius:8,
                       background:"transparent", border:`2px dashed ${C.goldDim}`,
                       color:C.gold, fontFamily:"'Cinzel',serif", fontSize:11,
                       letterSpacing:2, cursor:"pointer",
                       opacity:photoLoading ? 0.5 : 1 }}>
              {photoLoading ? "⚙ Upload…" : "📷 Carica Foto"}
            </button>
            <input ref={photoInput} type="file" accept="image/*"
              style={{ display:"none" }} onChange={handlePhoto}/>
          </div>

          {/* Notes */}
          <Label>Note generali</Label>
          <Input multiline value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes:e.target.value }))}
            placeholder="Ispirazione, base, conversioni…"/>

          {/* ── COLOR SCHEME ────────────────────────────────────────── */}
          <Label>Schema Colori</Label>

          {/* Existing paints */}
          {paints.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:10 }}>
              {paints.map((p) => (
                <PaintRow key={p.id} paint={p}
                  onRemove={() => handleRemovePaint(p.id)}/>
              ))}
            </div>
          )}

          {/* Pending paint annotator */}
          {pendingPaint && (
            <div style={{ background:C.card, border:`1px solid ${C.gold}55`,
                          borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <div style={{ width:24, height:24, borderRadius:4,
                              background:pendingPaint.hex,
                              border:"1px solid rgba(255,255,255,0.15)" }}/>
                <span style={{ color:C.text, fontSize:13, fontWeight:600 }}>
                  {pendingPaint.name}
                </span>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:9,
                               color:C.goldDim, letterSpacing:1 }}>
                  {pendingPaint.range}
                </span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8,
                            marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.muted,
                                letterSpacing:1, marginBottom:4 }}>PARTE</div>
                  <input value={partInput}
                    onChange={(e) => setPartInput(e.target.value)}
                    placeholder="es. Armatura, Pelle…"
                    style={{ background:C.surface, border:`1px solid ${C.border}`,
                             borderRadius:6, padding:"8px 10px", color:C.text,
                             fontSize:12, width:"100%", boxSizing:"border-box" }}/>
                </div>
                <div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.muted,
                                letterSpacing:1, marginBottom:4 }}>USO</div>
                  <select value={usageInput}
                    onChange={(e) => setUsageInput(e.target.value)}
                    style={{ background:C.surface, border:`1px solid ${C.border}`,
                             borderRadius:6, padding:"8px 10px", color:C.text,
                             fontSize:12, width:"100%", boxSizing:"border-box" }}>
                    {USAGE_TYPES.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={handleAddPaint}
                  style={{ flex:1, padding:"10px", borderRadius:8,
                           background:`${C.gold}22`, border:`1px solid ${C.gold}`,
                           color:C.gold, fontFamily:"'Cinzel',serif",
                           fontSize:11, letterSpacing:2, cursor:"pointer" }}>
                  ✓ Aggiungi Colore
                </button>
                <button onClick={() => setPendingPaint(null)}
                  style={{ padding:"10px 14px", borderRadius:8, background:"transparent",
                           border:`1px solid ${C.dim}`, color:C.muted, cursor:"pointer" }}>
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Add paint button */}
          {!pendingPaint && (
            <button onClick={() => setShowPicker(true)}
              style={{ width:"100%", padding:"12px", borderRadius:8,
                       background:"transparent", border:`1px dashed ${C.goldDim}`,
                       color:C.goldDim, fontFamily:"'Cinzel',serif",
                       fontSize:12, letterSpacing:2, cursor:"pointer", marginBottom:10 }}>
              + Aggiungi Colore Citadel
            </button>
          )}

          {/* AI Recommendations */}
          {(form.faction || form.unit_type) && (
            <AiRecommendations
              faction={form.faction}
              unit={form.unit_type || form.faction}
              onApply={handleApplyAi}
            />
          )}

          {/* Color scheme notes */}
          <Label>Note schema colori</Label>
          <Input multiline value={form.color_scheme_notes}
            onChange={(e) => setForm((f) => ({ ...f, color_scheme_notes:e.target.value }))}
            placeholder="Note libere sullo schema, tecniche usate, ispirazione…"/>

          {/* Public toggle */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        marginTop:16, padding:"12px 14px", background:C.card,
                        borderRadius:8, border:`1px solid ${C.border}` }}>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:C.text,
                            letterSpacing:1 }}>
                Pubblica nella Gallery
              </div>
              <div style={{ color:C.muted, fontSize:11, marginTop:2 }}>
                Visibile a tutti gli utenti
              </div>
            </div>
            <button onClick={() => setForm((f) => ({ ...f, is_public:!f.is_public }))}
              style={{ width:46, height:26, borderRadius:13,
                       background: form.is_public ? C.gold : C.dim,
                       border:"none", cursor:"pointer", position:"relative",
                       transition:"background 0.2s" }}>
              <div style={{ width:20, height:20, borderRadius:10, background:"#fff",
                            position:"absolute", top:3,
                            left: form.is_public ? 23 : 3,
                            transition:"left 0.2s" }}/>
            </button>
          </div>

          {/* Save */}
          <button onClick={handleSave} disabled={loading}
            style={{ width:"100%", padding:"16px", borderRadius:10, marginTop:20,
                     background: loading
                       ? C.dim
                       : `linear-gradient(135deg,${C.gold},#8a6f28)`,
                     border:"none", color:C.bg, fontFamily:"'Cinzel',serif",
                     fontSize:15, letterSpacing:3, textTransform:"uppercase",
                     fontWeight:700, cursor:loading ? "default" : "pointer",
                     opacity:loading ? 0.7 : 1 }}>
            {loading ? "⚙ Salvataggio…" : isEdit ? "💾 Salva Modifiche" : "✦ Aggiungi Miniatura"}
          </button>
        </div>
      </div>

      {showPicker && (
        <PaintPicker
          onSelect={handleSelectPaint}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── MAIN COMPONENT: PaintingTracker ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── BATTLE LOG ───────────────────────────────────────────────────────────────
const BATTLE_RESULTS=[
  {id:"W",label:"Vittoria",icon:"⚔️",color:"#4aaa6a"},
  {id:"L",label:"Sconfitta",icon:"💀",color:"#b03030"},
  {id:"D",label:"Pareggio", icon:"⚖️",color:"#c9a84c"},
];

function BattleLog({userId}){
  const lsKey=`wh40k_battles_${userId||'anon'}`;
  const [battles,setBattles]=useState(()=>{try{return JSON.parse(localStorage.getItem(lsKey))||[];}catch{return[];}});
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({date:new Date().toISOString().split("T")[0],myArmy:"",oppArmy:"",result:"W",points:"",notes:""});

  const save=()=>{
    if(!form.myArmy.trim()||!form.result)return;
    const updated=[{...form,id:Date.now()},...battles];
    setBattles(updated);
    localStorage.setItem(lsKey,JSON.stringify(updated));
    setShowAdd(false);
    setForm({date:new Date().toISOString().split("T")[0],myArmy:"",oppArmy:"",result:"W",points:"",notes:""});
  };
  const remove=(id)=>{const updated=battles.filter(b=>b.id!==id);setBattles(updated);localStorage.setItem(lsKey,JSON.stringify(updated));};

  const W=battles.filter(b=>b.result==="W").length;
  const L=battles.filter(b=>b.result==="L").length;
  const D=battles.filter(b=>b.result==="D").length;

  const inp=(placeholder,field,type="text")=>(
    <input type={type} value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))} placeholder={placeholder}
      style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}/>
  );

  return(
    <div style={{padding:"16px"}}>
      {/* Stats */}
      {battles.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
          {[{l:"Vittorie",v:W,c:"#4aaa6a"},{l:"Sconfitte",v:L,c:"#b03030"},{l:"Pareggi",v:D,c:"#c9a84c"}].map(s=>(
            <div key={s.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px",textAlign:"center"}}>
              <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:22,color:s.c}}>{s.v}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add battle */}
      {!showAdd?(
        <button onClick={()=>setShowAdd(true)} style={{width:"100%",padding:"14px",borderRadius:10,background:`${C.gold}22`,border:`1px solid ${C.gold}`,color:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",marginBottom:16}}>
          + Registra Battaglia
        </button>
      ):(
        <div style={{background:C.card,border:`1px solid ${C.gold}55`,borderRadius:12,padding:"16px",marginBottom:16,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.gold,letterSpacing:2,marginBottom:4}}>NUOVA BATTAGLIA</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {inp("Il mio esercito","myArmy")}
            {inp("Esercito avversario","oppArmy")}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
            {inp("Data","date","date")}
            {inp("Punti","points")}
          </div>
          {/* Risultato */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {BATTLE_RESULTS.map(r=>(
              <button key={r.id} onClick={()=>setForm(f=>({...f,result:r.id}))}
                style={{padding:"10px",borderRadius:8,border:`1px solid ${form.result===r.id?r.color:C.dim}`,background:form.result===r.id?`${r.color}22`:"transparent",color:form.result===r.id?r.color:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <span style={{fontSize:18}}>{r.icon}</span>{r.label}
              </button>
            ))}
          </div>
          <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Note (tattiche, punti chiave…)" rows={2}
            style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:12,resize:"vertical"}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={save} style={{flex:1,padding:"12px",borderRadius:8,background:`linear-gradient(135deg,${C.gold},#8a6f28)`,border:"none",color:C.bg,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer"}}>✓ Salva</button>
            <button onClick={()=>setShowAdd(false)} style={{padding:"12px 16px",borderRadius:8,background:"transparent",border:`1px solid ${C.dim}`,color:C.muted,cursor:"pointer"}}>✕</button>
          </div>
        </div>
      )}

      {/* Battle history */}
      {battles.length===0?(
        <div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:1}}>
          Nessuna battaglia registrata. Per l'Imperatore!
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {battles.map(b=>{
            const r=BATTLE_RESULTS.find(x=>x.id===b.result);
            return(
              <div key={b.id} style={{background:C.card,border:`1px solid ${r?.color||C.border}33`,borderLeft:`3px solid ${r?.color||C.border}`,borderRadius:8,padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
                <span style={{fontSize:22,flexShrink:0}}>{r?.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:C.text}}>{b.myArmy}{b.oppArmy?` vs ${b.oppArmy}`:""}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{b.date}{b.points?` · ${b.points}pt`:""}{b.notes?` · ${b.notes}`:""}</div>
                </div>
                <button onClick={()=>remove(b.id)} style={{background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:16,padding:"2px 4px"}}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PaintingTracker({ user }) {
  const [tab,       setTab]      = useState("gallery"); // "gallery" | "collection"
  const [minis,     setMinis]    = useState([]);
  const [paints,    setPaintsMap]= useState({});        // miniatureId → paint[]
  const [loading,   setLoading]  = useState(true);
  const [modal,     setModal]    = useState(null);      // null | "add" | {mini object}
  const [filter,    setFilter]   = useState("All");
  const [lightbox,  setLightbox] = useState(null);      // null | { src, alt }

  // ─── Load minis ──────────────────────────────────────────────────────────

  const loadMinis = useCallback(async () => {
    setLoading(true);
    try {
      let data;
      if (tab === "collection" && user) {
        data = await db.get("miniatures", `user_id=eq.${user.id}`);
      } else {
        data = await db.get("miniatures", "is_public=eq.true");
        // Sort by newest
        data = [...data].sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        );
      }
      setMinis(data);

      // Load paints for all minis
      const map = {};
      await Promise.all(
        data.map(async (m) => {
          const ps = await db.get("miniature_paints", `miniature_id=eq.${m.id}`);
          map[m.id] = ps;
        })
      );
      setPaintsMap(map);
    } finally {
      setLoading(false);
    }
  }, [tab, user]);

  useEffect(() => { loadMinis(); }, [loadMinis]);

  // ─── Filtered minis ────────────────────────────────────────────────────

  const factions = ["All", ...new Set(minis.map((m) => m.faction).filter(Boolean))];
  const displayed = filter === "All"
    ? minis
    : minis.filter((m) => m.faction === filter);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:"100%", background:C.bg, paddingBottom:80 }}>

      {/* ── TAB HEADER ────────────────────────────────────────────── */}
      <div style={{ position:"sticky", top:0, zIndex:10, background:C.surface,
                    borderBottom:`1px solid ${C.border}`, padding:"0 16px" }}>
        <div style={{ display:"flex", gap:0 }}>
          {[
            { id:"gallery",    label:"🏛 Community Gallery" },
            { id:"collection", label:"⚙ My Collection" },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex:1, padding:"14px 8px", background:"transparent",
                       border:"none", borderBottom:`2px solid ${tab===id ? C.gold : "transparent"}`,
                       color:tab===id ? C.gold : C.muted,
                       fontFamily:"'Cinzel',serif", fontSize:11,
                       letterSpacing:2, cursor:"pointer", transition:"all 0.2s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── COLLECTION STATS ──────────────────────────────────────── */}
      {tab === "collection" && minis.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6, padding:"12px 16px 0" }}>
          {STATUS.map(s=>{
            const cnt=minis.filter(m=>m.status===s.id).length;
            return(
              <div key={s.id} style={{background:C.card,border:`1px solid ${cnt>0?s.color+"44":C.border}`,borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
                <div style={{fontSize:16,marginBottom:2}}>{s.icon}</div>
                <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:16,color:cnt>0?s.color:C.dim}}>{cnt}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.muted,letterSpacing:1,lineHeight:1.2}}>{s.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FACTION FILTER + GRID ─────────────────────────────────── */}
      {true && (
      <>
      <div style={{ overflowX:"auto", padding:"12px 16px 0",
                    display:"flex", gap:8, scrollbarWidth:"none" }}>
        {factions.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ flexShrink:0, padding:"5px 12px", borderRadius:20,
                     border:`1px solid ${filter===f ? C.gold : C.border}`,
                     background:filter===f ? `${C.gold}22` : "transparent",
                     color:filter===f ? C.gold : C.muted,
                     fontFamily:"'Cinzel',serif", fontSize:10,
                     letterSpacing:1, cursor:"pointer" }}>
            {f}
          </button>
        ))}
      </div>

      {/* ── GRID ──────────────────────────────────────────────────── */}
      <div style={{ padding:"16px" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:C.muted,
                        fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:2 }}>
            ⚙ Caricamento…
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign:"center", padding:60 }}>
            <div style={{ fontSize:48, marginBottom:12, opacity:0.3 }}>⚙</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:C.muted,
                          letterSpacing:2 }}>
              {tab === "collection"
                ? "Nessuna miniatura nella collezione"
                : "Nessuna miniatura in gallery"}
            </div>
            {tab === "collection" && user && (
              <button onClick={() => setModal("add")}
                style={{ marginTop:20, padding:"12px 24px", borderRadius:10,
                         background:`${C.gold}22`, border:`1px solid ${C.gold}`,
                         color:C.gold, fontFamily:"'Cinzel',serif", fontSize:12,
                         letterSpacing:2, cursor:"pointer" }}>
                + Aggiungi la Prima
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:"grid",
                        gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",
                        gap:12 }}>
            {displayed.map((m) => (
              <MiniCard
                key={m.id}
                mini={m}
                paints={paints[m.id] || []}
                isOwner={user?.id === m.user_id}
                onEdit={() => setModal(m)}
                onClick={() => setModal(m)}
                onLightbox={(src, alt) => setLightbox({ src, alt })}
              />
            ))}
          </div>
        )}
      </div>

      </>)}

      {/* ── FAB: Add mini (solo My Collection e se loggati) ───────── */}
      {tab === "collection" && user && (
        <button
          onClick={() => setModal("add")}
          style={{ position:"fixed", bottom:80, right:20, zIndex:50,
                   width:56, height:56, borderRadius:"50%",
                   background:`linear-gradient(135deg,${C.gold},#8a6f28)`,
                   border:"none", color:C.bg, fontSize:24,
                   cursor:"pointer", boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
                   display:"flex", alignItems:"center", justifyContent:"center" }}>
          +
        </button>
      )}

      {/* ── MODAL ─────────────────────────────────────────────────── */}
      {modal && user && (
        <MiniModal
          mini={modal === "add" ? null : modal}
          userId={user.id}
          onSave={() => { setModal(null); loadMinis(); }}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── LIGHTBOX ──────────────────────────────────────────────── */}
      {lightbox && (
        <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)}/>
      )}

      {/* ── NOT LOGGED IN CTA (collection tab) ───────────────────── */}
      {tab === "collection" && !user && (
        <div style={{ padding:40, textAlign:"center" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:14, color:C.muted,
                        letterSpacing:1, lineHeight:2 }}>
            Accedi con Google per gestire la tua collezione
          </div>
        </div>
      )}
    </div>
  );
}
