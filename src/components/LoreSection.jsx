import { useState } from "react";
import { C } from "../data/constants";

const AOS_REALMS = [
  {name:"Realm of Aqshy", sub:"Fire",    color:"#C0392B", icon:"🔥"},
  {name:"Realm of Ghyran",sub:"Life",    color:"#4aaa6a", icon:"🌿"},
  {name:"Realm of Shyish",sub:"Death",   color:"#7a5aaa", icon:"💀"},
  {name:"Realm of Azyr",  sub:"Heavens", color:"#5a8fc5", icon:"⭐"},
  {name:"Realm of Chamon",sub:"Metal",   color:"#8a8a4a", icon:"⚙️"},
  {name:"Realm of Ghur",  sub:"Beasts",  color:"#8a5a2a", icon:"🦴"},
  {name:"Realm of Ulgu",  sub:"Shadow",  color:"#4a4a6a", icon:"🌑"},
  {name:"Realm of Hysh",  sub:"Light",   color:"#aaa060", icon:"✨"},
];

export default function LoreSection({ universe }) {
  const [wikiSearch, setWikiSearch] = useState("");
  const isAoS = universe === 'aos';

  const openWikiSearch = () => {
    const q = wikiSearch.trim();
    if (!q) return;
    if (isAoS) window.open(`https://ageofsigmar.lexicanum.com/wiki/Special:Search?search=${encodeURIComponent(q)}`, '_blank', 'noopener');
    else window.open(`https://warhammer40k.fandom.com/wiki/Special:Search?query=${encodeURIComponent(q)}`, '_blank', 'noopener');
  };

  const QUICK_LINKS = isAoS ? [
    {label:"Stormcast Eternals", wiki:"Stormcast_Eternals",         icon:"⚡"},
    {label:"Sigmar",             wiki:"Sigmar",                     icon:"🔱"},
    {label:"Chaos",              wiki:"Chaos",                      icon:"⛧"},
    {label:"Nagash",             wiki:"Nagash",                     icon:"💀"},
    {label:"Destruction",        wiki:"Destruction_Grand_Alliance", icon:"💪"},
    {label:"Sylvaneth",          wiki:"Sylvaneth",                  icon:"🌿"},
    {label:"Skaven",             wiki:"Skaven",                     icon:"🐀"},
    {label:"Mortal Realms",      wiki:"Mortal_Realms",              icon:"🌍"},
    {label:"Ossiarch",           wiki:"Ossiarch_Bonereapers",       icon:"🦴"},
    {label:"Fyreslayers",        wiki:"Fyreslayers",                icon:"🔥"},
    {label:"Idoneth",            wiki:"Idoneth_Deepkin",            icon:"🌊"},
    {label:"Lumineth",           wiki:"Lumineth_Realm-lords",       icon:"✨"},
  ] : [
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

  const LinkCard = ({title,icon,desc,url,color,badge}) => (
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

  return (
    <div style={{paddingBottom:80}}>
      <div style={{padding:"22px 16px 16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:5,color:C.goldDim,textTransform:"uppercase",marginBottom:6}}>{isAoS?"Warhammer: Age of Sigmar":"Warhammer 40,000"}</div>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:24,color:C.text,marginBottom:6}}>Lore & Resources</h2>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{isAoS?"Accesso diretto alle migliori enciclopedie online dei Mortal Realms.":"Direct access to the best online encyclopedias. WH40K lore is vast — let the experts handle it."}</p>
      </div>
      <div style={{padding:"16px 16px 0"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>{isAoS?"Cerca su Lexicanum AoS":"Search on Fandom Wiki"}</div>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1,position:"relative"}}>
            <input value={wikiSearch} onChange={e=>setWikiSearch(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&openWikiSearch()}
              placeholder={isAoS?"Sigmar, Stormcast, Nagash…":"Space Marines, Horus, Aeldari…"}
              style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,padding:"11px 12px 11px 40px",fontSize:14,outline:"none"}}/>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:16,pointerEvents:"none"}}>🔍</span>
          </div>
          <button onClick={openWikiSearch} style={{background:`${C.gold}22`,border:`1px solid ${C.gold}`,borderRadius:10,color:C.gold,padding:"0 18px",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:"pointer",flexShrink:0}}>Search ↗</button>
        </div>
      </div>
      <div style={{padding:"20px 16px 4px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:12}}>Main Resources</div>
        {isAoS ? (
          <>
            <LinkCard title="Lexicanum AoS" icon="📖" desc="The most complete Age of Sigmar encyclopedia: factions, Mortal Realms, characters and history. Community-maintained." url="https://ageofsigmar.lexicanum.com/wiki/Main_Page" color={C.gold} badge="LEXICANUM"/>
            <LinkCard title="Sigmar Wiki" icon="🔱" desc="The story of Sigmar Heldenhammer, from mortal warrior to god-king of the Mortal Realms. Deep lore on Fandom." url="https://warhammerfantasy.fandom.com/wiki/Sigmar" color="#4a7fb5" badge="FANDOM"/>
          </>
        ) : (
          <>
            <LinkCard title="Warhammer 40k Wiki" icon="📖" desc="The most complete wiki: factions, characters, events, battles, planets. Thousands of articles continuously updated by the community." url="https://warhammer40k.fandom.com/wiki/Warhammer_40k_Wiki" color={C.gold} badge="FANDOM"/>
            <LinkCard title="Lexicanum" icon="📜" desc="Encyclopedic and technical reference. Great for equipment details, units, dates and chronology." url="https://wh40k.lexicanum.com" color={C.blue} badge="LEXICANUM"/>
          </>
        )}
      </div>
      <div style={{padding:"8px 16px 16px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>Quick Access</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {QUICK_LINKS.map(q=>(
            <a key={q.wiki} href={isAoS?`https://ageofsigmar.lexicanum.com/wiki/${q.wiki}`:`https://warhammer40k.fandom.com/wiki/${q.wiki}`} target="_blank" rel="noopener noreferrer"
              style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",textDecoration:"none",cursor:"pointer"}}>
              <span style={{fontSize:18,flexShrink:0}}>{q.icon}</span>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:C.text,letterSpacing:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.label}</span>
              <span style={{color:C.goldDim,fontSize:10,marginLeft:"auto",flexShrink:0}}>↗</span>
            </a>
          ))}
        </div>
      </div>
      {isAoS && (
        <div style={{padding:"8px 16px 16px"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.goldDim,letterSpacing:3,textTransform:"uppercase",marginBottom:12}}>The Mortal Realms</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {AOS_REALMS.map(r=>(
              <button key={r.name} type="button" onClick={()=>window.open('https://ageofsigmar.lexicanum.com/wiki/'+r.name.replace(/ /g,'_'),'_blank')}
                style={{background:`linear-gradient(135deg,${r.color}18,${C.card})`,border:`1px solid ${r.color}44`,borderLeft:`3px solid ${r.color}`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",textAlign:"left",width:"100%"}}>
                <span style={{fontSize:22}}>{r.icon}</span>
                <div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:C.text}}>{r.name}</div>
                  <div style={{fontSize:10,color:r.color,letterSpacing:0.5}}>{r.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{margin:"0 16px 16px",background:`${C.blue}11`,border:`1px solid ${C.blue}33`,borderRadius:10,padding:"12px 14px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:C.blue,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>In the Reader</div>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.6}}>While reading, {isAoS?"AoS":"WH40K"} terms appear <span style={{color:C.blue,borderBottom:`1px solid ${C.blue}55`}}>underlined in blue</span>. Tap them to open the wiki page directly.</p>
      </div>
    </div>
  );
}
