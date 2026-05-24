import { useState, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { sb } from "../lib/sb";
import { STATUS_CFG } from "../data/constants";

const EpubReader = lazy(() => import("./EpubReader"));
const PdfReader  = lazy(() => import("./PdfReader"));

// ─── COLOURS ─────────────────────────────────────────────────────────────────
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
  red:     "#cc4444",
};

// Series spine colours for shelf display
const SC = {
  "The Realmgate Wars":             "#5a8fc5",
  "Hallowed Knights":               "#4080a0",
  "Eight Lamentations":             "#7a5aaa",
  "Gotrek Gurnisson":               "#a07838",
  "Hamilcar":                       "#C9A227",
  "Callis and Toll":                "#607080",
  "Blacktalon":                     "#3a8a6a",
  "Drekki Flynt":                   "#5a708a",
  "Warcry":                         "#8B2020",
  "Warhammer Underworlds":          "#4a4a8a",
  "BL Novella Series":              "#6a5040",
  "Battletome":                     "#2a3850",
};
const spineColor = (b) => SC[b.series] || "#4a6a8a";

// ─── BOOK DATA ────────────────────────────────────────────────────────────────
export const AOS_BOOKS = [
  // ── THE REALMGATE WARS ─────────────────────────────────────────────────────
  { id:"aos1",   title:"The Gates of Azyr",                        author:"Chris Wraight",                                        series:"The Realmgate Wars", num:1,  type:"Novella"     },
  { id:"aos2",   title:"War Storm",                                 author:"Nick Kyme, Guy Haley, Josh Reynolds",                  series:"The Realmgate Wars", num:2,  type:"Anthology"   },
  { id:"aos3",   title:"Ghal Maraz",                                author:"Josh Reynolds, Guy Haley",                             series:"The Realmgate Wars", num:3,  type:"Anthology"   },
  { id:"aos4",   title:"Hammers of Sigmar",                         author:"Darius Hinks, C L Werner",                             series:"The Realmgate Wars", num:4,  type:"Anthology"   },
  { id:"aos5",   title:"Wardens of the Everqueen",                  author:"C L Werner",                                           series:"The Realmgate Wars", num:5,  type:"Novella"     },
  { id:"aos6",   title:"Call of Archaon",                           author:"David Annandale, Guy Haley, Rob Sanders",              series:"The Realmgate Wars", num:6,  type:"Anthology"   },
  { id:"aos7",   title:"Warbeast",                                  author:"Gav Thorpe",                                           series:"The Realmgate Wars", num:7,  type:"Novella"     },
  { id:"aos8",   title:"Fury of Gork",                              author:"Josh Reynolds",                                        series:"The Realmgate Wars", num:8,  type:"Novella"     },
  { id:"aos9",   title:"Bladestorm",                                author:"Matt Westbrook",                                       series:"The Realmgate Wars", num:9,  type:"Novella"     },
  { id:"aos10",  title:"Mortarch of Night",                         author:"Josh Reynolds",                                        series:"The Realmgate Wars", num:10, type:"Novella"     },
  { id:"aos11",  title:"Lord of Undeath",                           author:"C L Werner",                                           series:"The Realmgate Wars", num:11, type:"Novella"     },
  { id:"aos12",  title:"The Realmgate Wars: Volume 1",              author:"Various",                                              series:"The Realmgate Wars", num:12, type:"Omnibus"     },
  { id:"aos13",  title:"The Realmgate Wars: Volume 2",              author:"Various",                                              series:"The Realmgate Wars", num:13, type:"Omnibus"     },

  // ── HALLOWED KNIGHTS ───────────────────────────────────────────────────────
  { id:"aos14",  title:"Hallowed Knights: Plague Garden",           author:"Josh Reynolds",                                        series:"Hallowed Knights",   num:1,  type:"Novel"       },
  { id:"aos15",  title:"Hallowed Knights: Black Pyramid",           author:"Josh Reynolds",                                        series:"Hallowed Knights",   num:2,  type:"Novel"       },
  { id:"aos16",  title:"Hallowed Knights: The Denied",              author:"Josh Reynolds",                                        series:"Hallowed Knights",   num:3,  type:"Audio Drama" },

  // ── EIGHT LAMENTATIONS ────────────────────────────────────────────────────
  { id:"aos17",  title:"Eight Lamentations: Spear of Shadows",      author:"Josh Reynolds",                                        series:"Eight Lamentations", num:1,  type:"Novel"       },
  { id:"aos18",  title:"Eight Lamentations: War-Claw",              author:"Josh Reynolds",                                        series:"Eight Lamentations", num:2,  type:"Audio Drama" },

  // ── GOTREK GURNISSON ──────────────────────────────────────────────────────
  { id:"aos19",  title:"Realmslayer",                               author:"David Guymer",                                         series:"Gotrek Gurnisson",   num:1,  type:"Audio Drama" },
  { id:"aos20",  title:"Realmslayer: Blood of the Old World",       author:"David Guymer",                                         series:"Gotrek Gurnisson",   num:2,  type:"Audio Drama" },
  { id:"aos21",  title:"Ghoulslayer",                               author:"Darius Hinks",                                         series:"Gotrek Gurnisson",   num:3,  type:"Novel"       },
  { id:"aos22",  title:"Gitslayer",                                 author:"Darius Hinks",                                         series:"Gotrek Gurnisson",   num:4,  type:"Novel"       },
  { id:"aos23",  title:"Soulslayer",                                author:"Darius Hinks",                                         series:"Gotrek Gurnisson",   num:5,  type:"Novel"       },
  { id:"aos24",  title:"Blightslayer",                              author:"Richard Strachan",                                     series:"Gotrek Gurnisson",   num:6,  type:"Novel"       },

  // ── HAMILCAR ──────────────────────────────────────────────────────────────
  { id:"aos25",  title:"Hamilcar: Champion of the Gods",            author:"David Guymer",                                         series:"Hamilcar",           num:1,  type:"Novel"       },
  { id:"aos26",  title:"Hamilcar: Champion of Chaos",               author:"David Guymer",                                         series:"Hamilcar",           num:2,  type:"Audio Drama" },

  // ── CALLIS AND TOLL ───────────────────────────────────────────────────────
  { id:"aos27",  title:"City of Secrets",                           author:"Nick Horth",                                           series:"Callis and Toll",    num:1,  type:"Novel"       },
  { id:"aos28",  title:"Callis and Toll: The Silver Shard",         author:"Nick Horth",                                           series:"Callis and Toll",    num:2,  type:"Novel"       },
  { id:"aos29",  title:"Callis and Toll",                           author:"Nick Horth",                                           series:"Callis and Toll",    num:3,  type:"Novel"       },

  // ── BLACKTALON ────────────────────────────────────────────────────────────
  { id:"aos30",  title:"Blacktalon: First Mark",                    author:"Andy Clark",                                           series:"Blacktalon",         num:1,  type:"Novel"       },
  { id:"aos31",  title:"Blacktalon",                                author:"Liane Merciel",                                        series:"Blacktalon",         num:2,  type:"Novel"       },

  // ── DREKKI FLYNT ──────────────────────────────────────────────────────────
  { id:"aos32",  title:"The Arkanaut's Oath",                       author:"Guy Haley",                                            series:"Drekki Flynt",       num:1,  type:"Novel"       },
  { id:"aos33",  title:"The Ghosts of Barak-Minoz",                 author:"Guy Haley",                                            series:"Drekki Flynt",       num:2,  type:"Novel"       },

  // ── WARCRY ────────────────────────────────────────────────────────────────
  { id:"aos34",  title:"Warcry: The Anthology",                     author:"Various",                                              series:"Warcry",             num:1,  type:"Anthology"   },
  { id:"aos35",  title:"Warcry Catacombs: Blood of the Everchosen", author:"Richard Strachan",                                     series:"Warcry",             num:2,  type:"Novel"       },

  // ── WARHAMMER UNDERWORLDS ─────────────────────────────────────────────────
  { id:"aos36",  title:"Shadespire: The Mirrored City",             author:"Josh Reynolds",                                        series:"Warhammer Underworlds", num:1, type:"Novel"     },
  { id:"aos37",  title:"Shadespire: The Darkness in the Glass",     author:"Various",                                              series:"Warhammer Underworlds", num:2, type:"Anthology" },
  { id:"aos38",  title:"Beastgrave",                                author:"C L Werner",                                           series:"Warhammer Underworlds", num:3, type:"Novel"     },
  { id:"aos39",  title:"Direchasm",                                 author:"Various",                                              series:"Warhammer Underworlds", num:4, type:"Anthology" },
  { id:"aos40",  title:"Harrowdeep",                                author:"Gary Kloster, Noah Van Nguyen, David Annandale",       series:"Warhammer Underworlds", num:5, type:"Anthology" },

  // ── STANDALONE NOVELS ─────────────────────────────────────────────────────
  { id:"aos41",  title:"Nagash: The Undying King",                  author:"Josh Reynolds",          series:"", num:0, type:"Novel"   },
  { id:"aos42",  title:"Soul Wars",                                 author:"Josh Reynolds",          series:"", num:0, type:"Novel"   },
  { id:"aos43",  title:"Neferata: Mortarch of Blood",               author:"David Annandale",        series:"", num:0, type:"Novel"   },
  { id:"aos44",  title:"Neferata: The Dominion of Bones",           author:"David Annandale",        series:"", num:0, type:"Novel"   },
  { id:"aos45",  title:"Gloomspite",                                author:"Andy Clark",             series:"", num:0, type:"Novel"   },
  { id:"aos46",  title:"Realm-Lords",                               author:"Dale Lucas",             series:"", num:0, type:"Novel"   },
  { id:"aos47",  title:"Lady of Sorrows",                           author:"C L Werner",             series:"", num:0, type:"Novel"   },
  { id:"aos48",  title:"Stormvault",                                author:"Andy Clark",             series:"", num:0, type:"Novel"   },
  { id:"aos49",  title:"Bonereapers",                               author:"David Guymer",           series:"", num:0, type:"Novella" },
  { id:"aos50",  title:"The End of Enlightenment",                  author:"Richard Strachan",       series:"", num:0, type:"Novel"   },
  { id:"aos51",  title:"Dominion",                                  author:"Darius Hinks",           series:"", num:0, type:"Novel"   },
  { id:"aos52",  title:"Cursed City",                               author:"C L Werner",             series:"", num:0, type:"Novel"   },
  { id:"aos53",  title:"The Hollow King",                           author:"John French",            series:"", num:0, type:"Novel"   },
  { id:"aos54",  title:"Harrowed Ground",                           author:"Richard Strachan",       series:"", num:0, type:"Novel"   },
  { id:"aos55",  title:"Skaventide",                                author:"Gary Kloster",           series:"", num:0, type:"Novel"   },
  { id:"aos56",  title:"Starseer's Ruin",                           author:"Adrian Tchaikovsky",     series:"", num:0, type:"Novel"   },

  // ── BL NOVELLA SERIES ─────────────────────────────────────────────────────
  { id:"aos57",  title:"Warqueen",                                  author:"Darius Hinks",           series:"BL Novella Series", num:1, type:"Novella" },
  { id:"aos58",  title:"Heart of Winter",                           author:"Nick Horth",             series:"BL Novella Series", num:2, type:"Novella" },
  { id:"aos59",  title:"Overlords of the Iron Dragon",              author:"C L Werner",             series:"BL Novella Series", num:3, type:"Novella" },

  // ── ANTHOLOGIES ───────────────────────────────────────────────────────────
  { id:"aos60",  title:"Myths & Revenants",                         author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos61",  title:"Gods and Mortals",                          author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos62",  title:"Sacrosanct & Other Stories",               author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos63",  title:"Oaths and Conquests",                       author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos64",  title:"Thunderstrike & Other Stories",            author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos65",  title:"Untamed Realms",                            author:"Various",                series:"", num:0, type:"Anthology" },

  // ── BATTLETOMES ───────────────────────────────────────────────────────────
  { id:"aosbt1",  title:"Battletome: Stormcast Eternals",          author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt2",  title:"Battletome: Nighthaunt",                  author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt3",  title:"Battletome: Ossiarch Bonereapers",        author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt4",  title:"Battletome: Soulblight Gravelords",       author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt5",  title:"Battletome: Ogor Mawtribes",              author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt6",  title:"Battletome: Orruk Warclans",              author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt7",  title:"Battletome: Gloomspite Gitz",             author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt8",  title:"Battletome: Hedonites of Slaanesh",       author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt9",  title:"Battletome: Blades of Khorne",            author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt10", title:"Battletome: Disciples of Tzeentch",       author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt11", title:"Battletome: Maggotkin of Nurgle",         author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt12", title:"Battletome: Slaves to Darkness",          author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt13", title:"Battletome: Lumineth Realm-lords",        author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt14", title:"Battletome: Fyreslayers",                 author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt15", title:"Battletome: Kharadron Overlords",         author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt16", title:"Battletome: Idoneth Deepkin",             author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt17", title:"Battletome: Cities of Sigmar",            author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt18", title:"Battletome: Seraphon",                    author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt19", title:"Battletome: Sylvaneth",                   author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt20", title:"Battletome: Sons of Behemat",             author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt21", title:"Battletome: Flesh-eater Courts",          author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt22", title:"Battletome: Beasts of Chaos",             author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
  { id:"aosbt23", title:"Battletome: Skaven",                      author:"Games Workshop",  series:"Battletome", num:0, type:"Codex" },
];

const AOS_SERIES = ["All", ...new Set(AOS_BOOKS.map(b => b.series).filter(Boolean))];
const AOS_TYPES  = ["All", ...new Set(AOS_BOOKS.map(b => b.type))];

// ─── NEXT-BOOK SUGGESTION ────────────────────────────────────────────────────
function getAoSNextSuggestion(statuses) {
  // Look for in-progress or partially completed series
  const seriesList = [...new Set(AOS_BOOKS.filter(b => b.series && b.num > 0).map(b => b.series))];
  for (const s of seriesList) {
    const books = AOS_BOOKS.filter(b => b.series === s && b.num > 0).sort((a,b) => a.num - b.num);
    const hasStarted = books.some(b => statuses[b.id]?.status === 'read' || statuses[b.id]?.status === 'reading');
    if (!hasStarted) continue;
    const next = books.find(b => !statuses[b.id] || statuses[b.id].status === 'none' || statuses[b.id].status === 'want');
    if (next) {
      const readCount = books.filter(b => statuses[b.id]?.status === 'read').length;
      return { book:next, reason:`Next in ${s}`, seriesProgress:`${readCount}/${books.length} read` };
    }
  }
  // Fallback: suggest a featured standalone the user hasn't started
  const featured = ['aos42','aos14','aos19','aos41','aos51','aos17'];
  for (const id of featured) {
    const book = AOS_BOOKS.find(b => b.id === id);
    if (book && (!statuses[id] || statuses[id].status === 'none')) {
      return { book, reason: 'Featured Read', seriesProgress: null };
    }
  }
  return null;
}

// ─── AoS HOME PAGE ────────────────────────────────────────────────────────────
export function AoSHomePage({ user, setSection, statuses = {}, onOpenBook }) {
  const uid = user?.id || 'anon';

  const [uploadedIds, setUploadedIds] = useState(() => {
    const ids = new Set();
    const prefix = `wh40k_ebook_${uid}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) {
        const bid = k.slice(prefix.length);
        if (AOS_BOOKS.some(b => b.id === bid)) ids.add(bid);
      }
    }
    return ids;
  });

  useEffect(() => {
    if (!user?.id) return;
    sb.get("ebook_files", `user_id=eq.${user.id}&select=book_id`).then(files => {
      if (files?.length && !files._error) {
        const dbIds = new Set(files.map(f => f.book_id).filter(id => AOS_BOOKS.some(b => b.id === id)));
        setUploadedIds(dbIds);
      }
    });
  }, [user?.id]);

  const readCount    = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'read').length;
  const readingCount = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'reading').length;

  const shelfBooks = useMemo(() => {
    return AOS_BOOKS.filter(b => uploadedIds.has(b.id) || statuses[b.id]?.status === 'read')
      .sort((a,b) => (a.series || 'zzz').localeCompare(b.series || 'zzz') || a.num - b.num);
  }, [uploadedIds, statuses]);

  const shelfBySeries = useMemo(() => {
    const groups = []; const seen = {};
    shelfBooks.forEach(b => {
      const key = b.series || 'Standalone';
      if (!seen[key]) { seen[key] = []; groups.push({ series:key, books:seen[key] }); }
      seen[key].push(b);
    });
    return groups;
  }, [shelfBooks]);

  const activeBooks = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'reading');
  const suggestion  = useMemo(() => getAoSNextSuggestion(statuses), [statuses]);

  const [opening, setOpening] = useState(false);
  const openBookHandle = async (book) => {
    if (!onOpenBook) return setSection('library');
    setOpening(true);
    const ok = await onOpenBook(book);
    setOpening(false);
    if (!ok) setSection('library');
  };

  const ShelfRow = ({ books, label }) => {
    if (!books.length) return null;
    return (
      <div style={{ marginBottom:8 }}>
        {label && <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", padding:"0 16px", marginBottom:4 }}>{label}</div>}
        <div style={{ position:"relative", overflowX:"auto", overflowY:"visible", paddingBottom:10 }}>
          <div style={{ display:"flex", gap:3, padding:"0 16px", minWidth:"max-content", alignItems:"flex-end" }}>
            {books.map(b => {
              const sc = spineColor(b);
              const isUploaded = uploadedIds.has(b.id);
              const bst = statuses[b.id]?.status || 'none';
              return (
                <div key={b.id}
                  onClick={() => openBookHandle(b)}
                  title={`${b.title} — ${b.author}`}
                  style={{
                    flexShrink:0, width:isUploaded?30:20, height:isUploaded?120:110,
                    background:`linear-gradient(to right,${sc}dd,${sc}88,${sc}cc)`,
                    borderRadius:"2px 2px 0 0", cursor:"pointer", position:"relative",
                    boxShadow:`inset -2px 0 4px rgba(0,0,0,0.4),2px 0 3px rgba(0,0,0,0.3)`,
                    border:`1px solid ${sc}`, borderBottom:"none",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    overflow:"hidden", transition:"transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform="translateY(-4px)"; e.currentTarget.style.boxShadow=`inset -2px 0 4px rgba(0,0,0,0.4),4px 4px 8px rgba(0,0,0,0.5)`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=`inset -2px 0 4px rgba(0,0,0,0.4),2px 0 3px rgba(0,0,0,0.3)`; }}
                >
                  <div style={{ writingMode:"vertical-rl", transform:"rotate(180deg)", fontFamily:"'Cinzel',serif", fontSize:isUploaded?6:5, color:"rgba(255,255,255,0.85)", letterSpacing:0.8, overflow:"hidden", maxHeight:"90%", padding:"4px 2px", textShadow:"0 1px 2px rgba(0,0,0,0.9)", lineHeight:1.1 }}>
                    {b.title}
                  </div>
                  {bst==='reading' && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:AOS.blue }}/>}
                  {bst==='read'    && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:AOS.green }}/>}
                  {isUploaded      && <div style={{ position:"absolute", inset:0, border:`1px solid ${AOS.gold}88`, borderRadius:"2px 2px 0 0", pointerEvents:"none" }}/>}
                </div>
              );
            })}
          </div>
          <div style={{ height:8, background:"linear-gradient(to bottom,#4a3510,#2a1f08)", margin:"0 16px", borderRadius:"0 0 4px 4px", boxShadow:"0 3px 6px rgba(0,0,0,0.5)" }}/>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      <style>{`@keyframes aosGlow{0%,100%{opacity:0.4;}50%{opacity:0.9;}}`}</style>

      {/* Hero */}
      <div style={{ padding:"24px 16px 20px", borderBottom:`1px solid ${AOS.border}`, background:`linear-gradient(180deg,${AOS.surface},${AOS.bg})`, position:"relative" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(to right,transparent,${AOS.gold},transparent)`, animation:"aosGlow 3s ease-in-out infinite" }}/>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5, color:AOS.goldDim, textTransform:"uppercase", marginBottom:4 }}>Age of Sigmar</div>
        <h1 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:26, color:AOS.text, lineHeight:1.1, marginBottom:4 }}>Mortal Realms</h1>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.goldDim, letterSpacing:3 }}>YOUR LIBRARY</div>
        {user && (
          <div style={{ marginTop:14, display:"flex", alignItems:"center", gap:10 }}>
            {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} alt="" style={{ width:28, height:28, borderRadius:"50%", border:`1px solid ${AOS.gold}55` }}/>}
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.muted }}>{user.user_metadata?.full_name || user.email}</div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ display:"flex", borderBottom:`1px solid ${AOS.border}` }}>
        {[
          { n:readingCount, l:"Reading", c:AOS.blue  },
          { n:readCount,    l:"Read",    c:AOS.green  },
          { n:uploadedIds.size, l:"Ebook",  c:AOS.gold   },
          { n:AOS_BOOKS.length, l:"Tomes",  c:AOS.text   },
        ].map(s => (
          <div key={s.l} style={{ flex:1, padding:"12px 8px", textAlign:"center", borderRight:`1px solid ${AOS.border}` }}>
            <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:22, color:s.c, lineHeight:1 }}>{s.n}</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.muted, letterSpacing:2, textTransform:"uppercase", marginTop:3 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Next Up */}
      {suggestion && (
        <div style={{ padding:"14px 16px 0" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.gold, letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>⚔ Next Up</div>
          <div style={{ background:`linear-gradient(135deg,${AOS.gold}12,${AOS.card})`, border:`1px solid ${AOS.gold}44`, borderLeft:`3px solid ${AOS.gold}`, borderRadius:10, padding:"12px 14px", display:"flex", gap:12, alignItems:"center" }}>
            <div style={{ width:44, height:64, flexShrink:0, borderRadius:3, background:`linear-gradient(160deg,${spineColor(suggestion.book)}aa,${AOS.dim})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚡</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:1, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {suggestion.reason.toUpperCase()}{suggestion.seriesProgress ? ` · ${suggestion.seriesProgress}` : ""}
              </div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, marginBottom:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{suggestion.book.title}</div>
              <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic" }}>{suggestion.book.author}</div>
            </div>
          </div>
        </div>
      )}

      {/* Currently reading */}
      {activeBooks.length > 0 && (
        <div style={{ padding:"18px 16px 0" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.blue, letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>📖 Currently Reading</div>
          {activeBooks.map(b => (
            <div key={b.id} onClick={() => openBookHandle(b)} style={{ background:`linear-gradient(135deg,${AOS.blue}18,${AOS.card})`, border:`1px solid ${AOS.blue}44`, borderLeft:`3px solid ${AOS.blue}`, borderRadius:10, padding:"10px 14px", display:"flex", gap:10, alignItems:"center", marginBottom:8, cursor:"pointer" }}>
              <div style={{ width:36, height:52, flexShrink:0, borderRadius:2, background:`linear-gradient(160deg,${spineColor(b)}aa,${AOS.dim})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>⚡</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:12, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.title}</div>
                <div style={{ fontSize:10, color:AOS.muted, fontStyle:"italic" }}>{b.author}</div>
              </div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.blue, letterSpacing:1 }}>CONTINUE ›</div>
            </div>
          ))}
        </div>
      )}

      {/* Shelf */}
      <div style={{ paddingTop:18 }}>
        {shelfBySeries.length === 0 ? (
          <div style={{ padding:"40px 20px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
            <div style={{ fontSize:48 }}>📚</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:15, color:AOS.muted }}>Your shelf is empty</div>
            <div style={{ fontSize:12, color:AOS.muted, maxWidth:260, lineHeight:1.6, textAlign:"center" }}>
              Go to the Library, upload ebooks or mark books as read to build your shelf.
            </div>
            <button onClick={() => setSection('library')} style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}`, borderRadius:8, padding:"10px 24px", color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:2, cursor:"pointer" }}>
              Go to Library →
            </button>
          </div>
        ) : shelfBySeries.map(({ series, books }) => (
          <ShelfRow key={series} books={books} label={series}/>
        ))}
      </div>
    </div>
  );
}

// ─── AoS BOOK DETAIL ─────────────────────────────────────────────────────────
function AoSBookDetail({ book, user, onBack, onOpenReader, status, onStatusChange }) {
  const inp = useRef(null);
  const [ebookMeta,    setEbookMeta]    = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadMsg,    setUploadMsg]    = useState("");
  const [deleteConfirm,setDeleteConfirm]= useState(false);
  const [curStatus,    setCurStatus]    = useState(status?.status || 'none');

  useEffect(() => { setCurStatus(status?.status || 'none'); }, [status]);

  const changeStatus = (s) => {
    setCurStatus(s);
    onStatusChange?.(book.id, s);
  };

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const files = await sb.get("ebook_files", `book_id=eq.${book.id}&limit=1`);
      if (files?.length && !files._error) { setEbookMeta(files[0]); return; }
      const cached = localStorage.getItem(`wh40k_ebook_${user.id}_${book.id}`);
      if (cached) { try { setEbookMeta(JSON.parse(cached)); } catch {} }
    })();
  }, [book.id, user?.id]);

  const handleFileSelect = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (!user?.id) { setUploadMsg("❌ Sign in to upload ebooks."); return; }
    setUploading(true); setUploadMsg("Uploading…");
    const path = `${user.id}/${book.id}/${file.name}`;
    const ok = await sb.storage.upload(path, file);
    if (ok) {
      const meta = { user_id:user.id, book_id:book.id, file_name:file.name, file_path:path, file_type:file.name.toLowerCase().endsWith(".pdf")?"pdf":"epub" };
      await sb.upsert("ebook_files", meta, "user_id,book_id");
      localStorage.setItem(`wh40k_ebook_${user.id}_${book.id}`, JSON.stringify(meta));
      setEbookMeta(meta);
      setUploadMsg("✅ Uploaded & synced!");
    } else { setUploadMsg("❌ Upload failed."); }
    setUploading(false);
    setTimeout(() => setUploadMsg(""), 3000);
  };

  const handleDeleteEbook = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 4000); return; }
    setDeleteConfirm(false); setUploadMsg("Removing…");
    if (ebookMeta?.file_path) await sb.storage.remove(ebookMeta.file_path);
    if (user?.id) await sb.del("ebook_files", `user_id=eq.${user.id}&book_id=eq.${book.id}`);
    if (user?.id) localStorage.removeItem(`wh40k_ebook_${user.id}_${book.id}`);
    setEbookMeta(null); setUploadMsg("✅ Ebook removed.");
    setTimeout(() => setUploadMsg(""), 2500);
  };

  const handleOpenReader = async () => {
    if (!ebookMeta) return;
    setUploadMsg("Opening…");
    const url = await sb.storage.signedUrl(ebookMeta.file_path);
    if (!url) { setUploadMsg("❌ Cannot open file — try re-uploading."); return; }
    setUploadMsg("");
    onOpenReader({ book, url, fileType:ebookMeta.file_type });
  };

  const sc = spineColor(book);

  return (
    <div style={{ minHeight:"100%", background:AOS.bg }}>
      <div style={{ position:"sticky", top:0, zIndex:10, background:AOS.surface, borderBottom:`1px solid ${AOS.border}`, height:52, display:"flex", alignItems:"center", padding:"0 16px", gap:12 }}>
        <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${AOS.dim}`, borderRadius:8, color:AOS.gold, padding:"7px 16px", cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:1 }}>← Library</button>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:AOS.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.series || book.type}</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${sc}44,${AOS.bg})`, borderBottom:`1px solid ${AOS.border}`, padding:"28px 20px 24px", display:"flex", gap:16, alignItems:"flex-start" }}>
        <div style={{ width:80, height:120, flexShrink:0, borderRadius:5, background:`linear-gradient(160deg,${sc}aa,${AOS.dim})`, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.5)", fontSize:32 }}>⚡</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:10 }}>{book.series || "Standalone"}{book.num > 0 ? ` · Book ${book.num}` : ""}</div>
          <h1 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:"clamp(16px,5vw,24px)", color:AOS.text, lineHeight:1.2, marginBottom:6 }}>{book.title}</h1>
          <div style={{ color:AOS.muted, fontSize:14, fontStyle:"italic" }}>by {book.author}</div>
        </div>
      </div>

      <div style={{ padding:"20px 16px", display:"flex", flexDirection:"column", gap:14 }}>
        {/* Metadata */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[{ l:"Type", v:book.type },{ l:"Series", v:book.series || "Standalone" }].map(m => (
            <div key={m.l} style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:8, padding:"10px" }}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:2, textTransform:"uppercase", marginBottom:3 }}>{m.l}</div>
              <div style={{ color:AOS.text, fontSize:12, lineHeight:1.2 }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Ebook */}
        <div style={{ background:AOS.card, border:`2px solid ${ebookMeta ? AOS.gold : AOS.border}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ background:ebookMeta ? `${AOS.gold}18` : AOS.surface, padding:"14px 16px", borderBottom:`1px solid ${ebookMeta ? AOS.gold+"44" : AOS.border}`, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>{ebookMeta ? "📖" : "📂"}</span>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:ebookMeta ? AOS.gold : AOS.muted, fontWeight:700, letterSpacing:1 }}>{ebookMeta ? "Ebook Ready" : "No Ebook Loaded"}</div>
              {ebookMeta && <div style={{ fontSize:11, color:AOS.goldDim, marginTop:1 }}>{ebookMeta.file_name}</div>}
            </div>
          </div>
          <div style={{ padding:"16px" }}>
            {!user ? (
              <div style={{ textAlign:"center", padding:"24px 8px", color:AOS.muted, fontSize:13 }}>Sign in to upload ebooks.</div>
            ) : ebookMeta ? (
              <>
                {uploadMsg && <div style={{ color:uploadMsg.startsWith("❌") ? AOS.red : AOS.gold, fontFamily:"'Cinzel',serif", fontSize:12, textAlign:"center", marginBottom:8 }}>{uploadMsg}</div>}
                <button onClick={handleOpenReader} style={{ width:"100%", padding:"16px", borderRadius:10, background:`linear-gradient(135deg,${AOS.gold},#7a6015)`, border:"none", color:AOS.bg, fontFamily:"'Cinzel',serif", fontSize:15, letterSpacing:3, textTransform:"uppercase", fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                  📖 Read
                </button>
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button onClick={() => inp.current.click()} style={{ flex:1, padding:"10px", borderRadius:8, background:"transparent", border:`1px solid ${AOS.dim}`, color:AOS.muted, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer" }}>Replace</button>
                  <button onClick={handleDeleteEbook} style={{ flex:1, padding:"10px", borderRadius:8, background:deleteConfirm ? `${AOS.red}22` : "transparent", border:`1px solid ${deleteConfirm ? AOS.red : AOS.dim}`, color:deleteConfirm ? AOS.red : AOS.muted, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer", transition:"all 0.2s" }}>
                    {deleteConfirm ? "⚠️ Confirm" : "🗑 Remove"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ color:AOS.muted, fontSize:13, lineHeight:1.6 }}>Load your EPUB or PDF — saved to your private cloud, accessible from any device.</div>
                {(uploading || uploadMsg) && <div style={{ color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:12, textAlign:"center" }}>{uploadMsg || "Uploading…"}</div>}
                <button onClick={() => inp.current.click()} disabled={uploading} style={{ width:"100%", padding:"16px", borderRadius:10, background:"transparent", border:`2px dashed ${AOS.goldDim}`, color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:14, letterSpacing:2, textTransform:"uppercase", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, opacity:uploading ? 0.5 : 1 }}>
                  📂 Load EPUB or PDF
                </button>
              </div>
            )}
            <input ref={inp} type="file" accept=".epub,.pdf" style={{ display:"none" }} onChange={handleFileSelect}/>
          </div>
        </div>

        {/* Reading Status */}
        <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:10 }}>Reading Status</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {['want','reading','read'].map(s => {
              const cfg = STATUS_CFG[s]; const active = curStatus === s;
              return (
                <button key={s} onClick={() => changeStatus(s)} style={{ padding:"12px 4px", borderRadius:8, border:`1px solid ${active ? cfg.color : AOS.dim}`, background:active ? cfg.bg : "transparent", color:active ? cfg.color : AOS.muted, fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all 0.2s" }}>
                  <span style={{ fontSize:20 }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AoS LIBRARY ─────────────────────────────────────────────────────────────
export function AoSLibrarySection({ user, statuses = {}, onStatusChange }) {
  const [search,  setSearch]  = useState("");
  const [series,  setSeries]  = useState("All");
  const [type,    setType]    = useState("All");
  const [tab,     setTab]     = useState("catalogue");
  const [detail,  setDetail]  = useState(null);
  const [reader,  setReader]  = useState(null);
  const [uploadedIds, setUploadedIds] = useState(new Set());

  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const ids = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`wh40k_ebook_${uid}_`)) {
        const bid = key.slice(`wh40k_ebook_${uid}_`.length);
        if (AOS_BOOKS.some(b => b.id === bid)) ids.add(bid);
      }
    }
    setUploadedIds(new Set(ids));
    sb.get("ebook_files", `user_id=eq.${uid}&select=book_id`).then(files => {
      if (files?.length && !files._error) {
        const dbIds = new Set(files.map(f => f.book_id).filter(id => AOS_BOOKS.some(b => b.id === id)));
        setUploadedIds(dbIds);
      }
    });
  }, [user?.id]);

  const handleOpenReader = ({ book, url, fileType }) => {
    setDetail(null);
    setReader({ book, url, fileType });
  };

  if (reader) {
    const { book, url, fileType } = reader;
    return (
      <Suspense fallback={<div style={{ position:"fixed", inset:0, background:AOS.bg, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ fontSize:48, animation:"spin 2s linear infinite" }}>⚙</div></div>}>
        {fileType === "pdf"
          ? <PdfReader  url={url} title={book.title} bookId={book.id} userId={user?.id} onClose={() => setReader(null)}/>
          : <EpubReader url={url} title={book.title} bookId={book.id} userId={user?.id} initProgress={0} initChapterIndex={0} initPageIndex={0} onProgress={() => {}} onClose={() => setReader(null)}/>
        }
      </Suspense>
    );
  }

  if (detail) return <AoSBookDetail book={detail} user={user} onBack={() => setDetail(null)} onOpenReader={handleOpenReader} status={statuses[detail.id]} onStatusChange={onStatusChange}/>;

  const readCount    = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'read').length;
  const readingCount = AOS_BOOKS.filter(b => statuses[b.id]?.status === 'reading').length;
  const shelfBooks   = AOS_BOOKS.filter(b => uploadedIds.has(b.id));

  const filtered = AOS_BOOKS.filter(b => {
    if (series !== "All" && b.series !== series) return false;
    if (type   !== "All" && b.type   !== type)   return false;
    if (search) { const q = search.toLowerCase(); return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q); }
    return true;
  });

  const TABS = [
    { id:"catalogue", label:"Catalogue" },
    { id:"shelf",     label:`My Shelf${shelfBooks.length > 0 ? ` (${shelfBooks.length})` : ""}` },
    { id:"info",      label:"Info" },
  ];

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      {/* Header */}
      <div style={{ padding:"20px 16px 0", borderBottom:`1px solid ${AOS.border}` }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5, color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>Black Library</div>
        <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:12 }}>The Library</h2>
        <div style={{ display:"flex", gap:20, marginBottom:14, flexWrap:"wrap" }}>
          {[
            { l:"Tomes",   v:AOS_BOOKS.length,  color:AOS.text  },
            { l:"Read",    v:readCount,          color:AOS.green },
            { l:"Reading", v:readingCount,       color:AOS.blue  },
            { l:"Ebook",   v:shelfBooks.length,  color:AOS.gold  },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, textTransform:"uppercase" }}>{s.l}</div>
              <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:20, color:s.color }}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:"10px", background:"transparent", border:"none", borderBottom:`2px solid ${tab === t.id ? AOS.gold : "transparent"}`, color:tab === t.id ? AOS.gold : AOS.muted, fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1, cursor:"pointer", textTransform:"uppercase", whiteSpace:"nowrap" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* MY SHELF */}
      {tab === "shelf" && (
        shelfBooks.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px", display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
            <div style={{ fontSize:52 }}>📂</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:16, color:AOS.muted }}>No ebooks loaded</div>
            <div style={{ color:AOS.muted, fontSize:13, maxWidth:280, lineHeight:1.6, textAlign:"center" }}>Go to Catalogue, select a book and upload your EPUB or PDF.</div>
            <button onClick={() => setTab("catalogue")} style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}`, borderRadius:8, padding:"10px 24px", color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2, cursor:"pointer" }}>Go to Catalogue →</button>
          </div>
        ) : (
          <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
            {shelfBooks.map(book => {
              const sc = spineColor(book);
              const bst = statuses[book.id]?.status || 'none';
              const bstCfg = STATUS_CFG[bst] || {};
              return (
                <div key={book.id} onClick={() => setDetail(book)} style={{ background:`linear-gradient(135deg,${sc}22,${AOS.card})`, border:`1px solid ${AOS.gold}55`, borderLeft:`3px solid ${AOS.gold}`, borderRadius:10, padding:"10px 14px", cursor:"pointer", display:"flex", gap:10, alignItems:"flex-start" }}>
                  <div style={{ width:44, height:64, flexShrink:0, borderRadius:3, background:`linear-gradient(160deg,${sc}aa,${AOS.dim})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚡</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:1, textTransform:"uppercase", marginBottom:3 }}>{book.series || "Standalone"}{book.num > 0 ? ` #${book.num}` : ""}</div>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, lineHeight:1.3, marginBottom:2 }}>{book.title}</div>
                    <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic" }}>{book.author}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                    {bst !== 'none' && <span style={{ fontSize:14 }}>{bstCfg.icon}</span>}
                    <span style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}44`, borderRadius:4, padding:"2px 7px", fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.gold, letterSpacing:1 }}>EPUB</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* INFO */}
      {tab === "info" && (
        <div style={{ padding:"24px 16px", display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:12, padding:"16px 18px" }}>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.gold, letterSpacing:2, marginBottom:10 }}>WHERE TO START</div>
            {[
              { t:"New to AoS?", d:"Start with The Gates of Azyr by Chris Wraight — short, action-packed and introduces the Stormcast Eternals perfectly." },
              { t:"Love Gotrek?", d:"Realmslayer is the bridge between Warhammer Fantasy and Age of Sigmar. Essential for fans of the Slayer." },
              { t:"Want deep lore?", d:"Soul Wars by Josh Reynolds covers the war between Nagash and Sigmar in epic fashion. A pivotal novel." },
            ].map((item,i) => (
              <div key={i} style={{ marginBottom:i<2?10:0, paddingBottom:i<2?10:0, borderBottom:i<2?`1px solid ${AOS.border}`:"none" }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:AOS.text, marginBottom:3 }}>{item.t}</div>
                <div style={{ fontSize:11, color:AOS.muted, lineHeight:1.5 }}>{item.d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CATALOGUE */}
      {tab === "catalogue" && (
        <>
          {/* Search */}
          <div style={{ padding:"12px 16px 0" }}>
            <div style={{ position:"relative" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or author…"
                style={{ width:"100%", background:AOS.surface, border:`1px solid ${AOS.border}`, borderRadius:10, color:AOS.text, padding:"11px 40px 11px 44px", fontSize:14, outline:"none" }}/>
              <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:AOS.muted, fontSize:17, pointerEvents:"none" }}>🔍</span>
              {search && <button onClick={() => setSearch("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:AOS.muted, cursor:"pointer", fontSize:20 }}>×</button>}
            </div>
          </div>

          {/* Series filter */}
          <div style={{ padding:"8px 16px 0", overflowX:"auto" }}>
            <div style={{ display:"flex", gap:6, minWidth:"max-content" }}>
              {AOS_SERIES.map(s => (
                <button key={s} onClick={() => setSeries(s)} style={{ background:series===s?`${AOS.gold}22`:"transparent", border:`1px solid ${series===s?AOS.gold:AOS.dim}`, borderRadius:20, padding:"5px 12px", color:series===s?AOS.gold:AOS.muted, fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1, cursor:"pointer", whiteSpace:"nowrap" }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Type filter */}
          <div style={{ padding:"6px 16px 0", overflowX:"auto" }}>
            <div style={{ display:"flex", gap:6, minWidth:"max-content" }}>
              {AOS_TYPES.map(t => (
                <button key={t} onClick={() => setType(t)} style={{ background:type===t?`${AOS.blue}22`:"transparent", border:`1px solid ${type===t?AOS.blue:AOS.dim}`, borderRadius:20, padding:"4px 10px", color:type===t?AOS.blue:AOS.muted, fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:1, cursor:"pointer", whiteSpace:"nowrap" }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div style={{ padding:"8px 16px 4px" }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.muted }}>{filtered.length} title{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Book list */}
          <div style={{ padding:"0 16px", display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:AOS.muted, fontStyle:"italic" }}>No results.</div>
            ) : filtered.map(book => {
              const sc = spineColor(book);
              const bst = statuses[book.id]?.status || 'none';
              const bstCfg = STATUS_CFG[bst] || {};
              const hasEbook = uploadedIds.has(book.id);
              return (
                <div key={book.id} onClick={() => setDetail(book)} style={{ background:`linear-gradient(135deg,${sc}12,${AOS.card})`, border:`1px solid ${hasEbook?AOS.gold+"55":AOS.border}`, borderLeft:`3px solid ${hasEbook?AOS.gold:sc}`, borderRadius:10, padding:"11px 14px", cursor:"pointer", display:"flex", gap:12, alignItems:"flex-start" }}>
                  <div style={{ width:44, height:64, flexShrink:0, borderRadius:3, background:`linear-gradient(160deg,${sc}aa,${AOS.dim})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚡</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:1, textTransform:"uppercase", marginBottom:3 }}>{book.series?`${book.series}${book.num>0?` #${book.num}`:""}`:book.type}</div>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, lineHeight:1.3, marginBottom:2 }}>{book.title}</div>
                    <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic" }}>{book.author}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                    {bst !== 'none' && <span style={{ fontSize:13 }}>{bstCfg.icon}</span>}
                    {hasEbook && <span style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}44`, borderRadius:4, padding:"2px 6px", fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.gold, letterSpacing:1 }}>EPUB</span>}
                    <span style={{ color:AOS.muted, fontSize:13 }}>›</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── AoS PATH TO GLORY ────────────────────────────────────────────────────────
export function AoSCrusadeSection() {
  const REALMS = [
    { name:"Aqshy",  sub:"Realm of Fire",    color:"#C0392B", icon:"🔥" },
    { name:"Ghyran", sub:"Realm of Life",    color:"#4aaa6a", icon:"🌿" },
    { name:"Shyish", sub:"Realm of Death",   color:"#7a5aaa", icon:"💀" },
    { name:"Azyr",   sub:"Realm of Heavens", color:"#5a8fc5", icon:"⭐" },
    { name:"Chamon", sub:"Realm of Metal",   color:"#8a8a4a", icon:"⚙️" },
    { name:"Ghur",   sub:"Realm of Beasts",  color:"#8a5a2a", icon:"🦴" },
    { name:"Ulgu",   sub:"Realm of Shadow",  color:"#4a4a6a", icon:"🌑" },
    { name:"Hysh",   sub:"Realm of Light",   color:"#aaa060", icon:"✨" },
  ];
  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      <div style={{ padding:"22px 16px 20px", borderBottom:`1px solid ${AOS.border}` }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5, color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>Narrative Play</div>
        <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:6 }}>Path to Glory</h2>
        <p style={{ fontSize:12, color:AOS.muted, lineHeight:1.7 }}>Track your narrative campaigns across the Mortal Realms.</p>
      </div>
      <div style={{ margin:"20px 16px 0", background:`linear-gradient(135deg,${AOS.gold}10,${AOS.card})`, border:`1px solid ${AOS.gold}44`, borderRadius:12, padding:"20px 18px", textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🛡️</div>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:16, color:AOS.text, marginBottom:8 }}>Coming Soon</div>
        <div style={{ fontSize:12, color:AOS.muted, lineHeight:1.7, maxWidth:300, margin:"0 auto" }}>
          The Path to Glory campaign tracker — warband management, victories and narrative progression — is in development.
        </div>
      </div>
      <div style={{ padding:"20px 16px" }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:12 }}>The Mortal Realms</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {REALMS.map(r => (
            <div key={r.name} style={{ background:`linear-gradient(135deg,${r.color}18,${AOS.card})`, border:`1px solid ${r.color}44`, borderLeft:`3px solid ${r.color}`, borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:10 }}>
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
