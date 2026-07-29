import { useState, useEffect, useMemo } from "react";
import { useLang, partLabel } from "../lib/i18n.jsx";
import { STATUS_CFG } from "../data/constants";
import { AOS_ESSENTIAL, findAoSGuideBook } from "../data/aosGuide";
import HomePage from "./HomePage";
import LibrarySection from "./LibrarySection";
import { AOS, AOS_BOOKS } from "../data/aosBooks";

export { AOS, AOS_BOOKS };

// Chronological saga reading order — sagas are grouped by era/edition.
// AoS sagas largely run in parallel, so eras give the macro reading order;
// within an era the order is roughly interchangeable.
const SAGA_ERAS = [
  { key:"old", label:"Old World", sub:"The World-That-Was" },
  { key:"e1",  label:"1st Edition", sub:"The Realmgate Wars" },
  { key:"e2",  label:"2nd Edition", sub:"Soul Wars & the Necroquake" },
  { key:"e3",  label:"3rd Edition", sub:"Era of the Beast" },
  { key:"other", label:"Other Sagas", sub:"Standalone & side stories" },
];
const SAGA_ERA = {
  "The Legend of Sigmar":"old", "Nagash":"old", "Tyrion & Teclis":"old",
  "Malus Darkblade":"old", "Von Carstein":"old", "Genevieve":"old", "Gotrek and Felix":"old",
  "The Realmgate Wars":"e1",
  "Hallowed Knights":"e2", "Eight Lamentations":"e2", "Neferata":"e2",
  "Callis and Toll":"e2", "Blacktalon":"e2", "Hamilcar":"e2", "Warcry":"e2",
  "Warhammer Underworlds":"e2", "BL Novella Series":"e2", "Warhammer Horror":"e2",
  "Drekki Flynt":"e3",
};

// ─── AoS HOME PAGE ────────────────────────────────────────────────────────────
// Thin wrapper: the AoS home is the shared HomePage with universe="aos"
// (palette, catalogue, accents and next-up block all swap inside HomePage).
export function AoSHomePage(props) {
  return <HomePage universe="aos" {...props} />;
}

// ─── AoS LIBRARY SECTION ─────────────────────────────────────────────────────
// Thin wrapper: the AoS library is the shared LibrarySection with universe="aos"
// (palette, catalogue, filters, accents and shelf all swap inside LibrarySection).
export function AoSLibrarySection(props) {
  return <LibrarySection universe="aos" {...props} />;
}

// ─── AoS GETTING STARTED GUIDE ────────────────────────────────────────────────
function findAoSBook(entry) {
  if (entry.aos_id) return AOS_BOOKS.find(b => b.id === entry.aos_id);
  return AOS_BOOKS.find(b => b.title.toLowerCase() === entry.t.toLowerCase());
}

const AOS_STARTER_GUIDE = [
  {
    id:"s1", step:"Step 1", title:"The Essential Introduction",
    note:"Hammerhal is a short novella by Josh Reynolds that was specifically designed to introduce readers to both Warhammer Age of Sigmar and Black Library fiction. It's the #1 recommended entry point — also available in the Hammerhal & Other Stories anthology.",
    books:[
      { t:"Hammerhal", a:"Josh Reynolds", type:"novella", aos_id:"aos68" },
    ],
  },
  {
    id:"s2", step:"Step 2", title:"Deepen the World",
    note:"Both are ideal second reads, each showing a different face of the Mortal Realms. City of Secrets grounds you in ordinary mortal life. Spear of Shadows is an epic multi-faction quest — described by David Guymer as 'the complete starter text for any Age of Sigmar fan'.",
    pickOne:true,
    options:[
      { label:"Mortals & Mystery", color:"#607080",
        note:"Follows ordinary humans in Hammerhal, a free city of the Mortal Realms. No cosmic knowledge needed — the most grounded entry point.",
        books:[
          { t:"City of Secrets", a:"Nick Horth", type:"novel", aos_id:"aos27" },
        ]},
      { label:"Epic Quest", color:"#7a5aaa",
        note:"A multi-faction adventure across the Mortal Realms hunting legendary weapons. Perfect for readers who want the big fantasy-quest feel immediately.",
        books:[
          { t:"Eight Lamentations: Spear of Shadows", a:"Josh Reynolds", type:"novel", aos_id:"aos17" },
        ]},
    ],
  },
  {
    id:"s3", step:"Step 3", title:"The Grand Narrative",
    note:"Soul Wars is the launch novel for Age of Sigmar 2nd edition — the Necroquake reshapes the Mortal Realms and Nagash's power surges. Essential for understanding the current shape of the setting.",
    books:[
      { t:"Soul Wars", a:"Josh Reynolds", type:"novel", aos_id:"aos42" },
    ],
  },
  {
    id:"s4", step:"Step 4", title:"Choose Your Path",
    note:"Now dive deep into whichever faction or style of story speaks to you.",
    pickOne:true,
    options:[
      { label:"Stormcast Eternals", color:"#5a8fc5",
        note:"Sigmar's reforged warriors of lightning — the heart of the AoS setting. The Hallowed Knights are the definitive Stormcast series.",
        books:[
          { t:"Hallowed Knights: Plague Garden", a:"Josh Reynolds", type:"novel", aos_id:"aos14" },
          { t:"Hallowed Knights: Black Pyramid",  a:"Josh Reynolds", type:"novel", aos_id:"aos15" },
        ]},
      { label:"Gotrek and Felix", color:"#a07838",
        note:"The full saga of Gotrek Gurnisson and Felix Jaeger. The first 16 novels are set in the Old World (ending with the End Times); the saga then continues in the Age of Sigmar. To stay purely in AoS, jump straight to Ghoulslayer — no prior knowledge needed.",
        books:[
          { t:"Trollslayer",                          a:"William King",   type:"novel", aos_id:"aos89",  era:"old" },
          { t:"Skavenslayer",                         a:"William King",   type:"novel", aos_id:"aos90",  era:"old" },
          { t:"Daemonslayer",                         a:"William King",   type:"novel", aos_id:"aos91",  era:"old" },
          { t:"Dragonslayer",                         a:"William King",   type:"novel", aos_id:"aos92",  era:"old" },
          { t:"Beastslayer",                          a:"William King",   type:"novel", aos_id:"aos93",  era:"old" },
          { t:"Vampireslayer",                        a:"William King",   type:"novel", aos_id:"aos94",  era:"old" },
          { t:"Giantslayer",                          a:"William King",   type:"novel", aos_id:"aos95",  era:"old" },
          { t:"Orcslayer",                            a:"Nathan Long",    type:"novel", aos_id:"aos96",  era:"old" },
          { t:"Manslayer",                            a:"Nathan Long",    type:"novel", aos_id:"aos97",  era:"old" },
          { t:"Elfslayer",                            a:"Nathan Long",    type:"novel", aos_id:"aos98",  era:"old" },
          { t:"Shamanslayer",                         a:"Nathan Long",    type:"novel", aos_id:"aos99",  era:"old" },
          { t:"Zombieslayer",                         a:"Nathan Long",    type:"novel", aos_id:"aos100", era:"old" },
          { t:"Road of Skulls",                       a:"Josh Reynolds",  type:"novel", aos_id:"aos101", era:"old" },
          { t:"City of the Damned",                   a:"David Guymer",   type:"novel", aos_id:"aos102", era:"old" },
          { t:"Kinslayer",                            a:"David Guymer",   type:"novel", aos_id:"aos103", era:"old" },
          { t:"Slayer",                               a:"David Guymer",   type:"novel", aos_id:"aos104", era:"old" },
          { t:"Realmslayer",                          a:"David Guymer",   type:"audio", aos_id:"aos19",  era:"aos" },
          { t:"Realmslayer: Blood of the Old World",  a:"David Guymer",   type:"audio", aos_id:"aos20",  era:"aos" },
          { t:"Ghoulslayer",                          a:"Darius Hinks",   type:"novel", aos_id:"aos21",  era:"aos" },
          { t:"Gitslayer",                            a:"Darius Hinks",   type:"novel", aos_id:"aos22",  era:"aos" },
          { t:"Soulslayer",                           a:"Darius Hinks",   type:"novel", aos_id:"aos23",  era:"aos" },
          { t:"Blightslayer",                         a:"Richard Strachan", type:"novel", aos_id:"aos24", era:"aos" },
          { t:"Realmslayer: Legend of the Doomseeker", a:"David Guymer",  type:"audio", aos_id:"aos67",  era:"aos" },
        ]},
      { label:"Callis & Toll", color:"#607080",
        note:"Continuing from City of Secrets — a witch hunter and a disgraced soldier chase mystery and intrigue across the free cities.",
        books:[
          { t:"Callis and Toll: The Silver Shard", a:"Nick Horth", type:"novel", aos_id:"aos28" },
          { t:"Callis and Toll",                   a:"Nick Horth", type:"novel", aos_id:"aos29" },
        ]},
      { label:"Kharadron Overlords", color:"#5a708a",
        note:"Sky-pirates, duardin engineers and aether-gold. The Drekki Flynt series brings swashbuckling adventure to the Mortal Realms.",
        books:[
          { t:"The Arkanaut's Oath",       a:"Guy Haley",      type:"novel", aos_id:"aos32" },
          { t:"The Ghosts of Barak-Minoz", a:"Guy Haley",      type:"novel", aos_id:"aos33" },
          { t:"Profit's Ruin",             a:"Josh Reynolds",  type:"novel", aos_id:"aos66" },
        ]},
    ],
  },
  {
    id:"s5", step:"Further Reading", title:"Explore the Mortal Realms",
    note:"Once you know the setting well, these expand into other factions and darker corners of the Mortal Realms.",
    books:[
      { t:"Dominion",                   a:"Darius Hinks",   type:"novel",   aos_id:"aos51", opt:true },
      { t:"Hamilcar: Champion of the Gods", a:"David Guymer", type:"novel", aos_id:"aos25", opt:true },
      { t:"Blacktalon: First Mark",     a:"Andy Clark",     type:"novel",   aos_id:"aos30", opt:true },
      { t:"Nagash: The Undying King",   a:"Josh Reynolds",  type:"novel",   aos_id:"aos41", opt:true },
      { t:"Godeater's Son",             a:"Noah Van Nguyen", type:"novel",  aos_id:"aos72", opt:true },
    ],
  },
  {
    id:"s6", step:"Old World", title:"Explore the Old World",
    note:"The Mortal Realms were born from the ashes of the Old World — Warhammer Fantasy. These sagas predate Age of Sigmar and give deep lore context. All set before the End Times.",
    pickOne:true,
    options:[
      { label:"The Legend of Sigmar", color:"#c9a84c",
        note:"How a mortal barbarian chieftain became the god-king who would forge the Stormcast Eternals. Essential AoS backstory.",
        books:[
          { t:"Heldenhammer", a:"Graham McNeill", type:"novel", aos_id:"ow1", era:"old" },
          { t:"Empire",       a:"Graham McNeill", type:"novel", aos_id:"ow2", era:"old" },
          { t:"God King",     a:"Graham McNeill", type:"novel", aos_id:"ow3", era:"old" },
        ]},
      { label:"Nagash", color:"#7a4aaa",
        note:"The rise of the Great Necromancer who would become the supreme lord of the undead — and AoS's most powerful villain. Essential backstory for Death factions.",
        books:[
          { t:"Nagash the Sorcerer", a:"Mike Lee", type:"novel", aos_id:"ow4", era:"old" },
          { t:"Nagash the Unbroken", a:"Mike Lee", type:"novel", aos_id:"ow5", era:"old" },
          { t:"Nagash Immortal",     a:"Mike Lee", type:"novel", aos_id:"ow6", era:"old" },
        ]},
      { label:"Malus Darkblade", color:"#8a3030",
        note:"A dark elf warrior possessed by a daemon — brutal sword-and-sorcery across Naggaroth. One of Black Library's best character studies.",
        books:[
          { t:"The Daemon's Curse", a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow10", era:"old" },
          { t:"Bloodstorm",         a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow11", era:"old" },
          { t:"Reaper of Souls",    a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow12", era:"old" },
          { t:"Warpsword",     a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow13", era:"old" },
          { t:"Lord of Ruin", a:"Dan Abnett & Mike Lee", type:"novel", aos_id:"ow14", era:"old" },
        ]},
      { label:"Von Carstein", color:"#6a1a1a",
        note:"The vampire counts of Sylvania — Vlad von Carstein and his dynasty wage war on the Empire. Gothic horror at its finest.",
        books:[
          { t:"Inheritance",  a:"Steven Savile", type:"novel", aos_id:"ow15", era:"old" },
          { t:"Dominion",     a:"Steven Savile", type:"novel", aos_id:"ow16", era:"old" },
          { t:"Retribution",  a:"Steven Savile", type:"novel", aos_id:"ow17", era:"old" },
        ]},
      { label:"Tyrion & Teclis", color:"#5a708a",
        note:"The twin phoenix lords of the High Elves — an epic trilogy spanning millennia of elven history. Directly relevant to AoS's Lumineth Realm-lords.",
        books:[
          { t:"Blood of Aenarion", a:"William King", type:"novel", aos_id:"ow7", era:"old" },
          { t:"Sword of Caledor",  a:"William King", type:"novel", aos_id:"ow8", era:"old" },
          { t:"Bane of Malekith",  a:"William King", type:"novel", aos_id:"ow9", era:"old" },
        ]},
      { label:"Genevieve", color:"#7a3a5a",
        note:"A vampire navigating the Empire's underworld — gothic noir by Jack Yeovil (Kim Newman). The most literary of Black Library's Old World fiction.",
        books:[
          { t:"Drachenfels",      a:"Jack Yeovil", type:"novel",     aos_id:"ow18", era:"old" },
          { t:"Genevieve Undead", a:"Jack Yeovil", type:"novel",     aos_id:"ow19", era:"old" },
          { t:"Beasts in Velvet", a:"Jack Yeovil", type:"novel",     aos_id:"ow20", era:"old" },
          { t:"Silver Nails",     a:"Jack Yeovil", type:"anthology", aos_id:"ow21", era:"old" },
        ]},
    ],
  },
];

function AoSBookRow({ entry, statuses, isLast }) {
  const { t } = useLang();
  const book = findAoSBook(entry);
  const status = book ? statuses[book.id]?.status || 'none' : null;
  const stCfg = status && status !== 'none' ? STATUS_CFG[status] : null;
  const type = entry.type || 'novel';
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:isLast?"none":`1px solid ${AOS.border}22`, opacity:type==='audio'?0.72:1 }}>
      <span style={{ fontSize:11, flexShrink:0, width:18, textAlign:"center" }}>
        {type==='audio'?'🎧':type==='novella'?'📑':'📖'}
      </span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color:entry.opt?AOS.muted:AOS.text, fontStyle:entry.opt?"italic":"normal", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Cinzel',serif" }}>
          {entry.t}
          {entry.opt && <span style={{ fontSize:9, color:AOS.muted, marginLeft:4 }}>{t("aos.guide.optional")}</span>}
        </div>
        <div style={{ fontSize:10, color:AOS.muted, display:"flex", alignItems:"center", gap:6 }}>
          {entry.era && <span style={{ fontSize:8, fontFamily:"'Cinzel',serif", letterSpacing:1, textTransform:"uppercase", color:entry.era==='aos'?AOS.gold:AOS.blue, border:`1px solid ${entry.era==='aos'?AOS.gold:AOS.blue}55`, borderRadius:4, padding:"1px 5px", flexShrink:0 }}>{entry.era==='aos'?t("aos.guide.eraAos"):t("aos.guide.eraOld")}</span>}
          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{entry.a}</span>
        </div>
      </div>
      {stCfg && <span style={{ fontSize:13, flexShrink:0 }}>{stCfg.icon}</span>}
    </div>
  );
}

function AoSGetStartedSection({ statuses }) {
  const { t } = useLang();
  const [open, setOpen] = useState(new Set(['s1']));
  const toggle = id => setOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const [arcOpen, setArcOpen] = useState(new Set(['ae1']));
  const toggleArc = id => setArcOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const StepCard = ({ step }) => {
    const isOpen = open.has(step.id);
    const allBooks = step.pickOne ? (step.options||[]).flatMap(o => o.books||[]) : (step.books||[]);
    const matched = allBooks.map(e => findAoSBook(e)).filter(Boolean);
    const readCount = matched.filter(b => statuses[b.id]?.status === 'read').length;
    const allRead = matched.length > 0 && readCount === matched.length;
    return (
      <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderLeft:`3px solid ${allRead?AOS.green:AOS.dim}`, borderRadius:10, overflow:"hidden" }}>
        <div onClick={() => toggle(step.id)} style={{ padding:"11px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:3 }}>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, flexShrink:0 }}>{t(`aos.starter.${step.id}.step`)}</span>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t(`aos.starter.${step.id}.title`)}</span>
            </div>
            <div style={{ fontSize:10, color:AOS.muted }}>
              {step.pickOne ? t("aos.guide.pickOne") : (allBooks.length!==1?t("aos.guide.bookMany"):t("aos.guide.bookOne")).replace("{n}", allBooks.length)}
              {matched.length>0&&readCount>0&&<span style={{ color:allRead?AOS.green:AOS.blue, marginLeft:6 }}>{allRead?"✅":""}{t("aos.guide.readCount").replace("{read}", readCount).replace("{total}", matched.length)}</span>}
            </div>
          </div>
          <span style={{ color:AOS.goldDim, fontSize:16, flexShrink:0, transition:"transform 0.2s", transform:isOpen?"rotate(90deg)":"none" }}>›</span>
        </div>
        {isOpen && (
          <div style={{ borderTop:`1px solid ${AOS.border}`, padding:"10px 14px 12px" }}>
            {step.note && (
              <div style={{ fontSize:11, color:AOS.gold, fontStyle:"italic", marginBottom:10, padding:"6px 10px", background:`${AOS.gold}0a`, borderRadius:6, borderLeft:`2px solid ${AOS.gold}44` }}>
                {t(`aos.starter.${step.id}.note`)}
              </div>
            )}
            {step.pickOne ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(step.options||[]).map((opt,oi) => (
                  <div key={oi} style={{ background:AOS.surface, border:`1px solid ${AOS.border}`, borderLeft:`3px solid ${opt.color||AOS.gold}`, borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:opt.color||AOS.gold, letterSpacing:2, marginBottom:opt.note?4:6 }}>{t(`aos.starter.${step.id}.opt${oi+1}Label`).toUpperCase()}</div>
                    {opt.note && <div style={{ fontSize:10, color:AOS.muted, fontStyle:"italic", marginBottom:6 }}>💡 {t(`aos.starter.${step.id}.opt${oi+1}Note`)}</div>}
                    {(opt.books||[]).map((e,i) => <AoSBookRow key={i} entry={e} statuses={statuses} isLast={i===opt.books.length-1}/>)}
                  </div>
                ))}
              </div>
            ) : (
              (step.books||[]).map((e,i) => <AoSBookRow key={i} entry={e} statuses={statuses} isLast={i===step.books.length-1}/>)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ padding:"12px 16px 10px", borderBottom:`1px solid ${AOS.border}`, background:`linear-gradient(180deg,${AOS.surface},${AOS.bg})` }}>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:18, color:AOS.text, marginBottom:4 }}>{t("aos.guide.title")}</div>
        <div style={{ fontSize:11, color:AOS.muted, marginBottom:6 }}>
          {t("aos.guide.introBefore")}
          <a href="https://www.trackofwords.com/2018/09/12/getting-started-with-black-library-age-of-sigmar/" target="_blank" rel="noopener noreferrer" style={{ color:AOS.blue, textDecoration:"underline", textDecorationColor:`${AOS.blue}66` }}>{t("aos.guide.trackOfWords")}</a>
        </div>
      </div>
      <div style={{ padding:"10px 16px 16px", display:"flex", flexDirection:"column", gap:6 }}>
        {AOS_STARTER_GUIDE.map(step => <StepCard key={step.id} step={step}/>)}
        <div style={{ marginTop:8, padding:"10px 12px", background:AOS.surface, border:`1px solid ${AOS.border}`, borderRadius:8, fontSize:10, color:AOS.muted, lineHeight:1.6, textAlign:"center" }}>
          {t("aos.guide.basedOn")}
          <a href="https://www.trackofwords.com/tag/where-to-start-with-black-library/" target="_blank" rel="noopener noreferrer" style={{ color:AOS.blue, textDecoration:"underline" }}>{t("aos.guide.trackOfWords")}</a>
        </div>
        <div style={{ marginTop:16, borderTop:`1px solid ${AOS.border}`, paddingTop:14 }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:3, textTransform:"uppercase", marginBottom:4 }}>{t("aos.guide.mainArcTitle")}</div>
          <div style={{ fontSize:11, color:AOS.muted, marginBottom:10 }}>{t("aos.guide.mainArcSub")}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {AOS_ESSENTIAL.map(part => (
              <AoSPartCard key={part.id} part={part} isOpen={arcOpen.has(part.id)} onToggle={() => toggleArc(part.id)} statuses={statuses}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AoSPartCard({ part, isOpen, onToggle, statuses }) {
  const { t } = useLang();
  const gNote = (key, fb) => { const v = t(key); return v === key ? fb : v; };
  const mainBooks = part.books || [];
  const novelEntries = mainBooks.filter(b => !b.type || b.type === 'novel' || b.type === 'novella');
  const extraEntries = mainBooks.filter(b => b.type === 'short' || b.type === 'audio' || b.type === 'anthology');
  const novelMatched = novelEntries.map(e => findAoSGuideBook(e)).filter(Boolean);
  const readCount = novelMatched.filter(b => statuses[b.id]?.status === 'read').length;
  const allRead = novelMatched.length > 0 && readCount === novelMatched.length;
  return (
    <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderLeft:`3px solid ${allRead?AOS.green:AOS.dim}`, borderRadius:10, overflow:"hidden" }}>
      <button type="button" onClick={onToggle} style={{ padding:"11px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", background:"transparent", border:"none" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:3 }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim, letterSpacing:2, flexShrink:0 }}>{partLabel(part.label, t)}</span>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{part.title}</span>
          </div>
          <div style={{ fontSize:10, color:AOS.muted }}>
            {novelEntries.length > 0 && `${novelEntries.length} ${novelEntries.length!==1?t("aos.guide.novelMany"):t("aos.guide.novelOne")}`}
            {extraEntries.length > 0 && ` + ${extraEntries.length} ${t("aos.guide.more")}`}
            {novelMatched.length > 0 && readCount > 0 && <span style={{ color:allRead?AOS.green:AOS.blue, marginLeft:6 }}>{allRead?"✅":""}{readCount}/{novelMatched.length} {t("aos.guide.read")}</span>}
          </div>
        </div>
        <span style={{ color:AOS.goldDim, fontSize:16, flexShrink:0, transition:"transform 0.2s", transform:isOpen?"rotate(90deg)":"none" }}>›</span>
      </button>
      {isOpen && (
        <div style={{ borderTop:`1px solid ${AOS.border}`, padding:"10px 14px 12px" }}>
          {part.note && <div style={{ fontSize:11, color:AOS.gold, fontStyle:"italic", marginBottom:10, padding:"6px 10px", background:`${AOS.gold}0a`, borderRadius:6, borderLeft:`2px solid ${AOS.gold}44` }}>{gNote(`aos.guide.notes.${part.id}`, part.note)}</div>}
          {mainBooks.map((entry, i) => <AoSBookRow key={i} entry={entry} statuses={statuses} isLast={i===mainBooks.length-1}/>)}
        </div>
      )}
    </div>
  );
}

// ─── AoS PATH TO GLORY ────────────────────────────────────────────────────────
export function AoSCrusadeSection({ user, statuses: propStatuses, initialTab, onTabConsumed }) {
  const { t } = useLang();
  const [tab,            setTab]          = useState(initialTab || 'overview');
  const [localStatuses,  setLocalStatuses] = useState({});
  const [expanded,       setExpanded]     = useState(null);
  const statuses = propStatuses ?? localStatuses;

  // Honour the Home "where to start" CTA once (it routes here on the guide tab).
  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
    onTabConsumed?.();
  }, [initialTab, onTabConsumed]);

  useEffect(() => {
    if (propStatuses !== undefined) return;
    const uid = user?.id || 'anon';
    const prefix = `wh40k_status_${uid}_`;
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) {
        const id = k.slice(prefix.length);
        if (id.startsWith('aos')) try { out[id] = JSON.parse(localStorage.getItem(k)); } catch {}
      }
    }
    setLocalStatuses(out);
  }, [user?.id, propStatuses]);

  const nonCodex = useMemo(() => AOS_BOOKS.filter(b => b.type !== 'Codex'), []);
  const readCount    = useMemo(() => nonCodex.filter(b => statuses[b.id]?.status === 'read').length,    [statuses, nonCodex]);
  const readingCount = useMemo(() => nonCodex.filter(b => statuses[b.id]?.status === 'reading').length, [statuses, nonCodex]);
  const wantCount    = useMemo(() => nonCodex.filter(b => statuses[b.id]?.status === 'want').length,    [statuses, nonCodex]);
  const total        = nonCodex.length;

  const seriesList = useMemo(() => {
    const map = {};
    nonCodex.filter(b => b.series).forEach(b => { if (!map[b.series]) map[b.series] = []; map[b.series].push(b); });
    return Object.entries(map).map(([name, books]) => {
      const sorted = [...books].sort((a,b) => a.num - b.num);
      const rc = sorted.filter(b => statuses[b.id]?.status === 'read').length;
      const nc = sorted.filter(b => statuses[b.id]?.status === 'reading').length;
      return { name, books:sorted, total:sorted.length, readCount:rc, readingCount:nc };
    }).sort((a,b) => {
      if (a.readingCount>0&&!b.readingCount) return -1;
      if (b.readingCount>0&&!a.readingCount) return 1;
      if (b.readCount!==a.readCount) return b.readCount-a.readCount;
      return b.total-a.total;
    });
  }, [statuses, nonCodex]);

  const seriesByEra = useMemo(() =>
    SAGA_ERAS.map(era => ({
      era,
      sagas: seriesList.filter(s => (SAGA_ERA[s.name] || "other") === era.key),
    })).filter(g => g.sagas.length > 0),
  [seriesList]);

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      {/* Tab bar */}
      <div style={{ display:"flex", borderBottom:`1px solid ${AOS.border}`, background:AOS.surface, position:"sticky", top:0, zIndex:5 }}>
        {[{ id:"overview", label:t("aos.crusade.tabOverview") }, { id:"guide", label:t("aos.crusade.tabGuide") }].map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{
            flex:1, padding:"12px 4px", background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===tb.id?AOS.gold:"transparent"}`,
            color:tab===tb.id?AOS.gold:AOS.muted,
            fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1,
            cursor:"pointer", textTransform:"uppercase", transition:"color 0.15s",
          }}>{tb.label}</button>
        ))}
      </div>

      {tab==="guide" && <AoSGetStartedSection statuses={statuses}/>}

      {tab==="overview" && <>
        {/* Header + stats */}
        <div style={{ padding:"22px 16px 12px", borderBottom:`1px solid ${AOS.border}` }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5, color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>{t("aos.crusade.kicker")}</div>
          <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:14 }}>{t("aos.crusade.title")}</h2>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            {[
              { tk:"statRead",    count:readCount,    color:AOS.green },
              { tk:"statReading", count:readingCount, color:AOS.blue  },
              { tk:"statToRead",  count:wantCount,    color:AOS.gold  },
              { tk:"statTotal",   count:total,        color:AOS.muted },
            ].map(s => (
              <div key={s.tk} style={{ flex:"1 1 60px", background:AOS.card, border:`1px solid ${s.color}44`, borderRadius:10, padding:"10px 14px", textAlign:"center" }}>
                <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:20, color:s.color, lineHeight:1 }}>{s.count}</div>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.muted, letterSpacing:2, marginTop:4 }}>{t(`aos.crusade.${s.tk}`)}</div>
              </div>
            ))}
          </div>
          <div style={{ height:6, background:AOS.dim, borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${total>0?(readCount/total)*100:0}%`, background:`linear-gradient(to right,${AOS.green},${AOS.gold})`, borderRadius:3, transition:"width 0.5s ease" }}/>
          </div>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.muted, letterSpacing:2, marginTop:6, textAlign:"right" }}>
            {t("aos.crusade.percentComplete").replace("{n}", total>0?Math.round((readCount/total)*100):0)}
          </div>
        </div>

        {/* Series list — grouped by chronological era */}
        <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:14 }}>
          {seriesByEra.map(({ era, sagas }) => (
            <div key={era.key} style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, paddingBottom:2, borderBottom:`1px solid ${AOS.border}` }}>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:AOS.gold, letterSpacing:3, textTransform:"uppercase" }}>{t(`aos.crusade.eras.${era.key}.label`)}</span>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.muted, letterSpacing:1, fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t(`aos.crusade.eras.${era.key}.sub`)}</span>
              </div>
              {sagas.map(serie => {
            const pct = serie.total>0?(serie.readCount/serie.total)*100:0;
            const isExp = expanded===serie.name;
            return (
              <div key={serie.name} style={{ background:AOS.card, border:`1px solid ${serie.readingCount>0?AOS.blue:AOS.border}`, borderLeft:`3px solid ${serie.readingCount>0?AOS.blue:serie.readCount===serie.total&&serie.total>0?AOS.green:AOS.dim}`, borderRadius:10, overflow:"hidden" }}>
                <div onClick={() => setExpanded(isExp?null:serie.name)} style={{ padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, fontWeight:700, color:AOS.text, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{serie.name}</div>
                    <div style={{ height:4, background:AOS.dim, borderRadius:2, overflow:"hidden", marginTop:6 }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:pct>=100?AOS.green:AOS.gold, borderRadius:2 }}/>
                    </div>
                    <div style={{ display:"flex", gap:10, marginTop:5 }}>
                      {serie.readCount>0&&<span style={{ fontSize:10, color:AOS.green }}>✅ {serie.readCount}</span>}
                      {serie.readingCount>0&&<span style={{ fontSize:10, color:AOS.blue }}>📖 {serie.readingCount}</span>}
                      <span style={{ fontSize:10, color:AOS.muted }}>{t("aos.crusade.booksCount").replace("{n}", serie.total)}</span>
                    </div>
                  </div>
                  <span style={{ color:AOS.goldDim, fontSize:16, flexShrink:0, transition:"transform 0.2s", transform:isExp?"rotate(90deg)":"none" }}>›</span>
                </div>
                {isExp && (
                  <div style={{ borderTop:`1px solid ${AOS.border}`, padding:"8px 14px 10px", display:"flex", flexDirection:"column", gap:4 }}>
                    {serie.books.map((b,bi) => {
                      const st = statuses[b.id]?.status||'none';
                      const stCfg = st!=='none'?STATUS_CFG[st]:null;
                      return (
                        <div key={b.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:bi<serie.books.length-1?`1px solid ${AOS.border}22`:"none" }}>
                          <span style={{ fontSize:11, flexShrink:0, width:18, textAlign:"center" }}>
                            {b.type==='Audio Drama'?'🎧':b.type==='Anthology'?'📚':b.type==='Novella'?'📑':'📖'}
                          </span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, color:AOS.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Cinzel',serif" }}>
                              {b.title}{b.num>0&&<span style={{ fontSize:9, color:AOS.goldDim, marginLeft:4 }}>#{b.num}</span>}
                            </div>
                            <div style={{ fontSize:10, color:AOS.muted }}>{b.author}</div>
                          </div>
                          {stCfg&&<span style={{ fontSize:13, flexShrink:0 }}>{stCfg.icon}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
              })}
            </div>
          ))}
        </div>

      </>}
    </div>
  );
}
