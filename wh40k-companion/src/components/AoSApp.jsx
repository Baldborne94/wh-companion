import { useState } from "react";

// ─── AoS COLOUR PALETTE ───────────────────────────────────────────────────────
export const AOS = {
  bg:      "#06080f",
  surface: "#0a0f1c",
  card:    "#0f1625",
  border:  "#1c2840",
  gold:    "#C9A227",
  goldDim: "#7a6015",
  blue:    "#5a8fc5",
  purple:  "#7a5aaa",
  text:    "#e0d8cc",
  muted:   "#607080",
  dim:     "#2a3850",
  green:   "#4aaa6a",
  red:     "#4a3a8a",
};

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:"0.4em",
      color:AOS.goldDim, textTransform:"uppercase", marginBottom:10 }}>
      {children}
    </div>
  );
}

function QuickCard({ icon, label, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      background:AOS.card, border:`1px solid ${color}44`,
      borderLeft:`3px solid ${color}`, borderRadius:10,
      padding:"14px 16px", cursor:"pointer", textAlign:"left",
      display:"flex", alignItems:"center", gap:12,
      transition:"border-color 0.2s",
    }}>
      <span style={{ fontSize:28 }}>{icon}</span>
      <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, letterSpacing:1 }}>{label}</span>
      <span style={{ marginLeft:"auto", color:AOS.muted, fontSize:14 }}>›</span>
    </button>
  );
}

// ─── AoS HOME PAGE ────────────────────────────────────────────────────────────
export function AoSHomePage({ user, setSection }) {
  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      <style>{`
        @keyframes aosGlow {
          0%,100%{opacity:0.4;} 50%{opacity:0.8;}
        }
      `}</style>

      {/* Hero header */}
      <div style={{
        padding:"28px 20px 24px",
        borderBottom:`1px solid ${AOS.border}`,
        background:`linear-gradient(160deg,${AOS.blue}18,${AOS.bg})`,
        position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:2,
          background:`linear-gradient(to right,transparent,${AOS.gold},transparent)`,
          animation:"aosGlow 3s ease-in-out infinite" }}/>

        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:5,
          color:AOS.goldDim, textTransform:"uppercase", marginBottom:8 }}>
          Mortal Realms
        </div>
        <h1 style={{ fontFamily:"'Cinzel Decorative',serif",
          fontSize:"clamp(20px,6vw,32px)", color:AOS.text, lineHeight:1.1, marginBottom:6 }}>
          Age of Sigmar
        </h1>
        <p style={{ fontSize:12, color:AOS.muted, lineHeight:1.7, maxWidth:340 }}>
          Gli Undici Regni Mortali. Dei che camminano tra i mortali.
          Eroi forgiati nell'immortalità. Scegli la tua fazione.
        </p>

        {user && (
          <div style={{ marginTop:16, display:"flex", alignItems:"center", gap:10 }}>
            {user.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt=""
                style={{ width:32, height:32, borderRadius:"50%", border:`1px solid ${AOS.gold}55` }}/>
            )}
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.gold, letterSpacing:1 }}>
                {user.user_metadata?.full_name || user.email}
              </div>
              <div style={{ fontSize:11, color:AOS.muted }}>Campione dei Regni Mortali</div>
            </div>
          </div>
        )}
      </div>

      {/* Quick access */}
      <div style={{ padding:"20px 16px", display:"flex", flexDirection:"column", gap:10 }}>
        <SectionLabel>Sezioni</SectionLabel>
        <QuickCard icon="📚" label="Libreria Regni" color={AOS.gold} onClick={() => setSection("library")}/>
        <QuickCard icon="⚔️" label="Lore & Risorse" color={AOS.blue} onClick={() => setSection("lore")}/>
        <QuickCard icon="🛡️" label="Path to Glory" color={AOS.purple} onClick={() => setSection("reading")}/>
        <QuickCard icon="🎨" label="Painting Tracker" color={AOS.green} onClick={() => setSection("painting")}/>
        <QuickCard icon="🎵" label="Musica" color={AOS.muted} onClick={() => setSection("music")}/>
      </div>

      {/* Factions */}
      <div style={{ padding:"0 16px 20px" }}>
        <SectionLabel>Grand Alliances</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            { name:"Order",       color:"#4a7fb5", desc:"Sigmar, Sylvaneth, Seraphon…",   icon:"⚡" },
            { name:"Chaos",       color:"#8B2020", desc:"Khorne, Nurgle, Tzeentch, Slaanesh…", icon:"⛧" },
            { name:"Death",       color:"#5a5aaa", desc:"Ossiarch, Soulblight, Nighthaunt…",   icon:"💀" },
            { name:"Destruction", color:"#5a7a20", desc:"Orruk, Ogroid, Gloomspite…",      icon:"💪" },
          ].map(f => (
            <div key={f.name} style={{
              background:`linear-gradient(135deg,${f.color}18,${AOS.card})`,
              border:`1px solid ${f.color}44`, borderLeft:`3px solid ${f.color}`,
              borderRadius:10, padding:"12px 14px",
            }}>
              <div style={{ fontSize:22, marginBottom:4 }}>{f.icon}</div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:12, color:AOS.text, marginBottom:2 }}>{f.name}</div>
              <div style={{ fontSize:10, color:AOS.muted, lineHeight:1.4 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AoS LIBRARY ─────────────────────────────────────────────────────────────
const AOS_BOOKS = [
  { id:"aos1", title:"Realmslayer",              author:"David Guymer",    series:"Gotrek Gurnisson", type:"Audio Drama" },
  { id:"aos2", title:"The Gates of Azyr",        author:"Chris Wraight",   series:"Realmgate Wars",   type:"Novel" },
  { id:"aos3", title:"Spear of Shadows",         author:"Josh Reynolds",   series:"Eight Lamentations",type:"Novel" },
  { id:"aos4", title:"Soul Wars",                author:"Josh Reynolds",   series:"Nagash Trilogy",   type:"Novel" },
  { id:"aos5", title:"Hamilcar: Champion of the Gods", author:"David Guymer", series:"Standalone",    type:"Novel" },
  { id:"aos6", title:"Dominion",                 author:"Darius Hinks",    series:"Standalone",       type:"Novel" },
  { id:"aos7", title:"The Sundering Flood",      author:"Gav Thorpe",      series:"Standalone",       type:"Novel" },
  { id:"aos8", title:"Godeater's Son",           author:"Noah Van Nguyen", series:"Standalone",       type:"Novel" },
  { id:"aos9", title:"Black Pyramid",            author:"Nick Horth",      series:"Standalone",       type:"Novel" },
  { id:"aos10",title:"The Court of the Blind King",author:"David Guymer",  series:"Standalone",       type:"Novel" },
];

const AOS_SERIES = ["All", ...new Set(AOS_BOOKS.map(b => b.series))];

export function AoSLibrarySection({ user }) {
  const [search, setSearch] = useState("");
  const [series, setSeries] = useState("All");
  const [tab, setTab] = useState("catalogue");

  const filtered = AOS_BOOKS.filter(b => {
    if (series !== "All" && b.series !== series) return false;
    if (search) {
      const q = search.toLowerCase();
      return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      {/* Header */}
      <div style={{ padding:"20px 16px 0", borderBottom:`1px solid ${AOS.border}` }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5,
          color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>Black Library</div>
        <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:12 }}>
          Libreria Regni
        </h2>
        <div style={{ display:"flex", gap:20, marginBottom:14, flexWrap:"wrap" }}>
          {[
            { l:"Titoli", v:AOS_BOOKS.length, color:AOS.text },
            { l:"Serie",  v:AOS_SERIES.length - 1, color:AOS.gold },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, textTransform:"uppercase" }}>{s.l}</div>
              <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:20, color:s.color }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Notice banner */}
        <div style={{ marginBottom:14, background:`${AOS.gold}12`,
          border:`1px solid ${AOS.gold}33`, borderRadius:8,
          padding:"10px 14px", fontSize:11, color:AOS.muted, lineHeight:1.5 }}>
          📚 Catalogo AoS in espansione — ebook upload e tracking in arrivo.
        </div>

        <div style={{ display:"flex", gap:0 }}>
          {[{id:"catalogue",label:"Catalogo"},{id:"info",label:"Info"}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, padding:"10px",
              background:"transparent", border:"none",
              borderBottom:`2px solid ${tab === t.id ? AOS.gold : "transparent"}`,
              color: tab === t.id ? AOS.gold : AOS.muted,
              fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2,
              cursor:"pointer", textTransform:"uppercase",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === "info" && (
        <div style={{ padding:"24px 16px", display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:12, padding:"16px 18px" }}>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.gold, letterSpacing:2, marginBottom:10 }}>COME INIZIARE CON AoS</div>
            {[
              { t:"Sei nuovo?", d:"Inizia con The Gates of Azyr di Chris Wraight — breve, d'azione e introduce i Stormcast Eternals." },
              { t:"Ami Gotrek?", d:"Realmslayer è il bridge tra Fantasy e AoS. Essenziale per i fan del veterano nano." },
              { t:"Vuoi il lore profondo?", d:"Soul Wars di Josh Reynolds copre la guerra tra Nagash e Sigmar in modo epico." },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: i < 2 ? 10 : 0, paddingBottom: i < 2 ? 10 : 0,
                borderBottom: i < 2 ? `1px solid ${AOS.border}` : "none" }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:AOS.text, marginBottom:3 }}>{item.t}</div>
                <div style={{ fontSize:11, color:AOS.muted, lineHeight:1.5 }}>{item.d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "catalogue" && (
        <>
          {/* Search */}
          <div style={{ padding:"12px 16px 0" }}>
            <div style={{ position:"relative" }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cerca titolo o autore…"
                style={{ width:"100%", background:AOS.surface, border:`1px solid ${AOS.border}`,
                  borderRadius:10, color:AOS.text, padding:"11px 40px 11px 44px",
                  fontSize:14, outline:"none" }}/>
              <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)",
                color:AOS.muted, fontSize:17, pointerEvents:"none" }}>🔍</span>
              {search && (
                <button onClick={() => setSearch("")}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"transparent", border:"none", color:AOS.muted, cursor:"pointer", fontSize:20 }}>×</button>
              )}
            </div>
          </div>

          {/* Series filter */}
          <div style={{ padding:"10px 16px", overflowX:"auto" }}>
            <div style={{ display:"flex", gap:6, minWidth:"max-content" }}>
              {AOS_SERIES.map(s => (
                <button key={s} onClick={() => setSeries(s)} style={{
                  background: series === s ? `${AOS.gold}22` : "transparent",
                  border:`1px solid ${series === s ? AOS.gold : AOS.dim}`,
                  borderRadius:20, padding:"6px 14px",
                  color: series === s ? AOS.gold : AOS.muted,
                  fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1,
                  cursor:"pointer", whiteSpace:"nowrap",
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Books list */}
          <div style={{ padding:"4px 16px", display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:AOS.muted, fontStyle:"italic" }}>
                Nessun risultato.
              </div>
            ) : filtered.map(book => (
              <div key={book.id} style={{
                background:`linear-gradient(135deg,${AOS.blue}12,${AOS.card})`,
                border:`1px solid ${AOS.border}`,
                borderLeft:`3px solid ${AOS.gold}`,
                borderRadius:10, padding:"12px 14px",
                display:"flex", gap:12, alignItems:"flex-start",
              }}>
                {/* Placeholder cover */}
                <div style={{
                  width:52, height:76, flexShrink:0, borderRadius:4,
                  background:`linear-gradient(160deg,${AOS.blue}99,${AOS.purple}99)`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <span style={{ fontSize:22 }}>⚡</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim,
                    letterSpacing:1, textTransform:"uppercase", marginBottom:4 }}>
                    {book.series} · {book.type}
                  </div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:14, color:AOS.text,
                    lineHeight:1.3, marginBottom:3 }}>{book.title}</div>
                  <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic" }}>{book.author}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── AoS PATH TO GLORY (Crusade equiv.) ─────────────────────────────────────
export function AoSCrusadeSection() {
  const REALMS = [
    { name:"Aqshy",    sub:"Realm of Fire",   color:"#C0392B", icon:"🔥" },
    { name:"Ghyran",   sub:"Realm of Life",   color:"#4aaa6a", icon:"🌿" },
    { name:"Shyish",   sub:"Realm of Death",  color:"#7a5aaa", icon:"💀" },
    { name:"Azyr",     sub:"Realm of Heavens", color:"#5a8fc5", icon:"⭐" },
    { name:"Chamon",   sub:"Realm of Metal",  color:"#8a8a4a", icon:"⚙️" },
    { name:"Ghur",     sub:"Realm of Beasts", color:"#8a5a2a", icon:"🦴" },
    { name:"Ulgu",     sub:"Realm of Shadow", color:"#4a4a6a", icon:"🌑" },
    { name:"Hysh",     sub:"Realm of Light",  color:"#aaa060", icon:"✨" },
  ];

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      {/* Header */}
      <div style={{ padding:"22px 16px 20px", borderBottom:`1px solid ${AOS.border}` }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5,
          color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>Narrative Play</div>
        <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:6 }}>
          Path to Glory
        </h2>
        <p style={{ fontSize:12, color:AOS.muted, lineHeight:1.7 }}>
          Traccia le tue campagne narrative nei Regni Mortali.
        </p>
      </div>

      {/* Coming soon banner */}
      <div style={{ margin:"20px 16px 0",
        background:`linear-gradient(135deg,${AOS.gold}10,${AOS.card})`,
        border:`1px solid ${AOS.gold}44`, borderRadius:12,
        padding:"20px 18px", textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🛡️</div>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:16, color:AOS.text, marginBottom:8 }}>
          In Sviluppo
        </div>
        <div style={{ fontSize:12, color:AOS.muted, lineHeight:1.7, maxWidth:300, margin:"0 auto" }}>
          Il tracker di campagne Path to Glory — warband, vittorie e progressione narrativa — è in arrivo.
        </div>
      </div>

      {/* Mortal Realms */}
      <div style={{ padding:"20px 16px" }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim,
          letterSpacing:3, textTransform:"uppercase", marginBottom:12 }}>
          I Regni Mortali
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {REALMS.map(r => (
            <div key={r.name} style={{
              background:`linear-gradient(135deg,${r.color}18,${AOS.card})`,
              border:`1px solid ${r.color}44`, borderLeft:`3px solid ${r.color}`,
              borderRadius:10, padding:"12px 14px",
              display:"flex", alignItems:"center", gap:10,
            }}>
              <span style={{ fontSize:22 }}>{r.icon}</span>
              <div>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:12, color:AOS.text }}>{r.name}</div>
                <div style={{ fontSize:10, color:r.color, letterSpacing:0.5 }}>{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
