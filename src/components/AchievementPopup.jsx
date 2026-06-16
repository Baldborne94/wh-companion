import { useState, useEffect, useRef } from "react";

// ─── FLAVOR TEXT ──────────────────────────────────────────────────────────────
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const OPENERS_40K = {
  milestone:        ["THE ADMINISTRATUM RECORDS YOUR DEED", "YOUR DEEDS ARE CHRONICLED", "THE IMPERIUM TAKES NOTE", "THE BLACK LIBRARY OPENS ITS VAULTS"],
  streak:           ["YOUR CRUSADE ENDURES", "UNBROKEN. RELENTLESS. UNSTOPPABLE.", "THE LONG WAR IS IN YOUR BLOOD", "THE ETERNAL WARRIOR STIRS"],
  monthly:          ["THE AQUILA SHINES UPON YOU", "MONTHLY HONOUR BESTOWED", "THE CHAPTER MASTER IS PLEASED"],
  faction:          ["FACTION LOYALTY PROVEN", "THE CHAPTER CLAIMS YOU", "YOUR ALLEGIANCE IS REWARDED"],
  explorer:         ["THE GALAXY OPENS BEFORE YOU", "A WANDERER OF LORE ASCENDS", "THE INQUISITION WATCHES — IMPRESSED"],
  series:           ["THE SAGA IS COMPLETE", "THE CHRONICLES END HERE", "EVERY PAGE CONSUMED", "THE BLACK LIBRARY BOWS"],
  army:             ["THE WARHOST AWAKENS", "FOR GLORY AND HONOUR", "THE BATTLEFIELD TREMBLES"],
  painting_general: ["THE FORGE IS PLEASED", "ANOTHER WARRIOR JOINS THE RANKS", "THE CHAPTER GROWS STRONGER"],
  painting_monthly: ["THE BRUSH MOVES SWIFTLY", "THE PALETTE NEVER RESTS", "THE FORGE NEVER COOLS"],
  painting_streak:  ["CONSISTENT DEVOTION", "THE PALETTE BURNS WITH PURPOSE", "THE FORGE NEVER COOLS"],
};

const OPENERS_AOS = {
  milestone:        ["SIGMAR NOTES YOUR DEVOTION", "THE MORTAL REALMS REMEMBER YOUR DEEDS", "THE GRAND CONCLAVE IS IMPRESSED", "THE STORMVAULT RECORDS YOUR GLORY"],
  streak:           ["YOUR CRUSADE THROUGH THE REALMS ENDURES", "THE REALMGATE STAYS OPEN FOR YOU", "UNBROKEN ACROSS THE MORTAL REALMS", "THE AGE OF SIGMAR FAVOURS THE DEVOTED"],
  monthly:          ["SIGMAR GRANTS YOU HIS BLESSING", "AZYRHEIM ACKNOWLEDGES YOUR DEEDS", "THE CELESTANT PRIME LOOKS YOUR WAY"],
  faction:          ["YOUR ALLEGIANCE TO THE GRAND ALLIANCE IS PROVEN", "THE GODS OF THE REALMS TAKE NOTE", "YOUR BANNER IS KNOWN ACROSS THE REALMS"],
  explorer:         ["THE MORTAL REALMS OPEN BEFORE YOU", "A WANDERER OF LORE ASCENDS", "THE GRAND ALLIANCE WATCHES — IMPRESSED"],
  series:           ["THE SAGA IS COMPLETE", "THE CHRONICLES END HERE", "EVERY PAGE CONSUMED", "THE GREAT LIBRARY OF AZYR BOWS"],
  army:             ["YOUR WARBAND AWAKENS", "FOR SIGMAR AND GLORY", "THE REALM TREMBLES AT YOUR WARHOST"],
  painting_general: ["THE CELESTANT PRIME APPROVES", "ANOTHER CHAMPION JOINS YOUR WARBAND", "THE STORMHOST GROWS STRONGER"],
  painting_monthly: ["THE BRUSH MOVES SWIFTLY ACROSS THE REALMS", "THE PALETTE OF THE MORTAL REALMS NEVER RESTS", "YOUR WARBAND GROWS"],
  painting_streak:  ["CONSISTENT DEVOTION TO THE CAUSE", "THE PALETTE BURNS WITH SIGMARITE PURPOSE", "THE REFORGING CONTINUES"],
};

const FLAVOR_40K = {
  read_1:   ["Your crusade begins. The galaxy awaits, Battle-Brother.", "The first page turned. There is no going back.", "In the Emperor's name — the journey starts here."],
  read_5:   ["Five tomes consumed. The Librarium acknowledges your thirst.", "Five volumes read. The path of the Scholar is open.", "Five books devoured. Even the Chaos Gods are slightly concerned."],
  read_10:  ["Ten tomes. You walk the path of the Epistolary.", "Ten books. A true student of the Black Library.", "Knowledge is power — and you are accumulating dangerously much of it."],
  read_25:  ["Twenty-five tomes. The Inquisition is watching. Impressed.", "Your lore rivals a Space Marine Librarian. Actually impressive.", "Twenty-five books. You are a keeper of secrets now."],
  read_50:  ["Fifty volumes. Most impressive. Even for an Astartes.", "Half a century of tomes. Even the Omnissiah nods in approval.", "Fifty books. At this point Chaos itself cannot stop your reading."],
  read_100: ["ONE HUNDRED BOOKS. You are beyond mortal comprehension.", "A century of tomes — the Hive Mind fears your knowledge.", "100 TOMES. The Emperor raises an eyebrow — and that is saying something."],
  streak_2:  ["Two months without pause. As relentless as a Space Marine charge.", "Your devotion holds. The crusade does not falter.", "Two months straight. Even the servitors are impressed."],
  streak_3:  ["Three months! Discipline worthy of the Astartes.", "Three straight months. The Eternal Warrior acknowledges you.", "Unbroken. Unyielding. Three months of pure reading glory."],
  streak_6:  ["Six months! The Long War runs through your veins.", "Half a year without pause. Truly veteran-level dedication.", "Six consecutive months. The Deathwatch is filing recruitment paperwork for you."],
  streak_12: ["A FULL YEAR. The Emperor's light shines upon your devotion.", "Twelve months unbroken. You are an absolute legend.", "One full year of reading. Your name is inscribed in the Administratum archives. Permanently."],
  monthly_bronze: ["One book this month. The Bronze Aquila is yours.", "The Aquila shines — your monthly crusade begins.", "First tome of the month. Solid work, Battle-Brother. Keep going."],
  monthly_silver: ["Two to three books this month! Silver Aquila gleams.", "Impressive output. The Chapter Master nods in approval.", "Silver Aquila awarded. Your dedication is duly noted."],
  monthly_gold:   ["FOUR OR MORE BOOKS THIS MONTH. GOLD AQUILA!", "Extraordinary monthly reading! Even a Primarch would be proud.", "Gold Aquila — this month you absolutely crushed it, Astartes."],
  faction_3:  ["Three books, one allegiance. A true faction devotee.", "Your loyalty is noted. You know your Chapter well.", "Three tomes, one banner. The faction claims you as their own."],
  faction_5:  ["Five books of the same faction! Champion declared.", "Your loyalty is beyond question. Five books and counting.", "Five tomes under one banner. The Chapter salutes you."],
  faction_10: ["TEN BOOKS. Faction Exemplar — none surpass your devotion.", "Ten tomes of a single faction. Legendary. Absolute dedication.", "The faction bows to their greatest scholar. Ten books. Ten."],
  explorer_3: ["Three factions explored. Your curiosity crosses all loyalties.", "Knowledge of three factions — the Inquisition is intrigued.", "Three banners read. The galaxy begins to reveal its secrets."],
  explorer_5: ["Five factions! You walk between the stars of knowledge.", "Five banners understood. The universe bends before your reading list.", "Pathfinder of lore — five factions and counting."],
  explorer_8: ["EIGHT FACTIONS — you have become the Inquisitor of lore!", "Eight banners. Nothing escapes your gaze.", "You see them all. Eight factions. One reader. Unstoppable."],
  paint_1:           ["First miniature complete! The Chapter gains a warrior.", "One down. The shelf begins its glorious transformation.", "Blood on the palette — your painting crusade has started."],
  paint_5:           ["A full squad stands ready for battle. The enemy shall know fear.", "Five complete — a combat team takes the field.", "Five warriors painted and based. Your Chapter is growing."],
  paint_10:          ["Ten models! A veteran warband takes shape.", "Two full squads complete. The battlefield belongs to you.", "Ten minis done. The painting table serves you well, Artisan."],
  paint_25:          ["Twenty-five miniatures! A full combat detachment stands ready.", "The shelf fills with glory. Twenty-five warriors, proud and painted.", "Quarter century of minis. The Chapter Reclusiarch applauds."],
  paint_50:          ["Fifty complete. Half a century of painted glory on your shelf.", "An army truly stirs. Fifty miniatures, battle-hardened and ready.", "Fifty minis — Iron Hands, eat your heart out."],
  paint_100:         ["ONE HUNDRED MINIATURES. You ARE the Master of the Forge.", "A century of painted warriors. Dedication unmatched in any millennium.", "100 complete. The entire Chapter stands at full attention."],
  monthly_painter_1: ["One mini complete this month. The Brush Initiate earns their title.", "First stroke of the month placed. Progress begins.", "First mini of the month done. The palette warms up."],
  monthly_painter_3: ["Three minis this month! Brush Adept — impressive speed.", "Three complete — your efficiency rivals a Servo-Skull.", "Three warriors this month. The Chapter Master is visibly pleased."],
  monthly_painter_5: ["FIVE MINIS THIS MONTH. Brush Master officially declared!", "Five complete in a month! Your painting pace is the stuff of legend.", "Five miniatures in one month. The Omnissiah is honoured."],
  paint_streak_2: ["Two months of painting without break. True devotion.", "Consistent! Two months of brush and palette work.", "Two consecutive months — your army grows, relentlessly."],
  paint_streak_3: ["Three months straight! Unstoppable painter declared.", "Three months without pause. The Legion grows and grows.", "Your brush has not rested for three months. Remarkable."],
  paint_streak_6: ["SIX MONTHS OF PAINTING. Legion Painter — legendary status.", "Half a year of monthly painting. Even the gods of war take notice.", "Six consecutive months. An entire Legion rises from the table."],
};

const FLAVOR_AOS = {
  read_1:   ["Your quest through the Mortal Realms begins. Sigmar watches.", "The first page turns. The Realmgates open before you.", "In the name of Sigmar — the journey through the realms starts."],
  read_5:   ["Five tomes of the Mortal Realms consumed. The Grand Conclave approves.", "Five chronicles read. The path through Azyrheim is open.", "Five books from across the realms. Even Nagash pauses to notice."],
  read_10:  ["Ten tomes. You walk the path of the Celestant.", "Ten books from across the Mortal Realms. The Great Library grows.", "Knowledge of the realms accumulates. Tzeentch would be jealous."],
  read_25:  ["Twenty-five tomes. The Stormvault records your achievement.", "Your lore rivals a Lord Castellant of the Hallowed Knights.", "Twenty-five books. You hold the secrets of the Mortal Realms."],
  read_50:  ["Fifty chronicles. Even the Slann Starmaster looks up from their meditation.", "Half a century of tomes from across the realms. Remarkable devotion.", "Fifty books. Chaos Undivided itself cannot stop your reading."],
  read_100: ["ONE HUNDRED TOMES. Nagash would be envious of your obsession.", "A century of chronicles — the Great Necromancer pauses his schemes.", "100 BOOKS. Sigmar strikes his hammer in salute. Actually."],
  streak_2:  ["Two months without pause. As relentless as a Stormcast Eternal charge.", "The realmgate stays open. Your devotion does not falter.", "Two moons of Shyish have passed — your reading crusade holds."],
  streak_3:  ["Three months! Discipline worthy of the Celestant Prime.", "Three straight months. The Eternal Realm acknowledges you.", "Unbroken across three moons. The Grand Alliance takes note."],
  streak_6:  ["Six months! The Age of Sigmar has blessed your devotion.", "Half a year without pause. Truly a Champion of Azyrheim.", "Six consecutive months. The Hallowed Knights welcome you as a brother."],
  streak_12: ["A FULL YEAR. Sigmar himself strikes the Celestial Hammer in honour.", "Twelve months unbroken. You are a legend of the Mortal Realms.", "One full year. Your name is carved in the Great Library of Azyr. Permanently."],
  monthly_bronze: ["One book this month. The Bronze Lightning badge is yours.", "Sigmar's light shines — your monthly quest begins.", "First tome of the month. Solid work, Champion of the Realms."],
  monthly_silver: ["Two to three books this month! The Silver Storm gleams.", "Impressive output. The Lord Celestant nods in approval.", "Silver awarded. Your dedication echoes across the Mortal Realms."],
  monthly_gold:   ["FOUR OR MORE BOOKS THIS MONTH. GOLDEN SIGMARITE!", "Extraordinary monthly reading! Even the Celestant Prime would be proud.", "Golden Sigmarite — this month you crushed it across all eight realms."],
  faction_3:  ["Three books, one allegiance. A true devotee of the Grand Alliance.", "Your loyalty is noted. You know your faction well.", "Three tomes, one banner. The faction claims you as their champion."],
  faction_5:  ["Five books of the same faction! Champion of the Grand Alliance.", "Your loyalty is beyond question. Five books and counting.", "Five tomes under one banner. The Lord Castellant salutes you."],
  faction_10: ["TEN BOOKS. Exemplar — none surpass your devotion to this faction.", "Ten tomes of a single allegiance. Legendary dedication across the realms.", "The faction bows to their greatest scholar. Ten books from the realms."],
  explorer_3: ["Three factions explored. Your curiosity spans the Mortal Realms.", "Knowledge of three factions — Sigmar himself is curious about you.", "Three Grand Alliances read. The realms begin to reveal their secrets."],
  explorer_5: ["Five factions! You walk between the realmgates of knowledge.", "Five allegiances understood. The Mortal Realms bow before your reading list.", "Pathfinder of the realms — five factions and counting."],
  explorer_8: ["EIGHT FACTIONS — you have become the Loremaster of the Mortal Realms!", "Eight allegiances. Nothing escapes your gaze across the realms.", "You see them all. Eight factions. One reader. The realms are yours."],
  paint_1:           ["First miniature complete! Your warband gains a champion.", "One down. The painting table begins its glorious work.", "First stroke dried — your warband crusade has officially started."],
  paint_5:           ["A full warband stands ready for the Mortal Realms. The enemy shall know fear.", "Five complete — a retinue takes the realmgate.", "Five warriors of the realms painted and based. Your force grows."],
  paint_10:          ["Ten warriors! A retinue worthy of the Celestant Prime.", "Ten complete. Two warbands battle-ready across the realms.", "Ten minis done. The painting table of the Mortal Realms serves you well."],
  paint_25:          ["Twenty-five miniatures! A warhost takes shape across your shelf.", "The shelf fills with glory from across the realms. Twenty-five champions.", "Quarter century of minis. The Grand Alliance applauds your work."],
  paint_50:          ["Fifty complete. Half a century of painted glory from the Mortal Realms.", "A true warhost stirs. Fifty miniatures, battle-hardened from Aqshy to Shyish.", "Fifty minis — Sigmar hammers his throne in celebration."],
  paint_100:         ["ONE HUNDRED MINIATURES. You ARE the Master Craftsman of the Mortal Realms.", "A century of painted warriors from across the realms. Unmatched dedication.", "100 complete. The Celestant Prime stands at full attention."],
  monthly_painter_1: ["One mini complete this month. The Brush Initiate of the Realms earns their title.", "First stroke of the month laid. Progress begins in Azyrheim.", "First mini of the month done. The Sigmarite palette warms up."],
  monthly_painter_3: ["Three minis this month! Brush Adept of the Mortal Realms.", "Three complete — your efficiency rivals an Azyrite Construct.", "Three champions this month. The Lord Celestant is visibly pleased."],
  monthly_painter_5: ["FIVE MINIS THIS MONTH. Brush Master of the Mortal Realms declared!", "Five complete in a month! Your painting pace is the stuff of legend.", "Five miniatures in one month. Sigmar himself picks up a brush in tribute."],
  paint_streak_2: ["Two months of painting without break. True devotion to the realms.", "Consistent! Two moons of brush and palette work.", "Two consecutive months — your warhost grows relentlessly."],
  paint_streak_3: ["Three months straight! Unstoppable painter of the Mortal Realms.", "Three months without pause. The warband grows and grows.", "Your brush has not rested for three moons. The realms take notice."],
  paint_streak_6: ["SIX MONTHS OF PAINTING. Legion Painter of the Mortal Realms — legendary.", "Half a year of monthly painting. Sigmar watches from Azyrheim, impressed.", "Six consecutive months. An entire warhost rises from the painting table."],
};

function getFlavorText(achievement, universe) {
  const FLAVOR = universe === 'aos' ? FLAVOR_AOS : FLAVOR_40K;
  // Dynamic series completion
  if (achievement.id.startsWith('series:')) {
    const name = achievement.id.slice('series:'.length);
    return universe === 'aos'
      ? pick([
          `Every chronicle of ${name} consumed. The Great Library of Azyr bows to you.`,
          `The ${name} saga complete. Sigmar inscribes your name in Azyrheim.`,
          `${name} fully read from first page to last. Extraordinary devotion.`,
          `The story of ${name} ends — and you were there for every word.`,
        ])
      : pick([
          `Every book in ${name} consumed. The Black Library bows to you.`,
          `The ${name} chronicles, complete. Your name joins the rolls of honour.`,
          `${name} fully read from first page to last. Extraordinary.`,
          `The saga of ${name} ends — and you were there for all of it.`,
        ]);
  }
  // Dynamic faction army milestones
  if (achievement.id.startsWith('army:')) {
    const rest    = achievement.id.slice('army:'.length);
    const sep     = rest.lastIndexOf(':');
    const faction = rest.slice(0, sep);
    const count   = rest.slice(sep + 1);
    const pools40k = {
      '5':  [`Five ${faction} warriors stand ready. The Chapter Master approves.`, `A ${faction} combat squad complete. The enemy will not forget this.`, `Five ${faction} — Combat Ready. Your shelf looks magnificent.`],
      '10': [`A full ${faction} detachment! Ten warriors, battle-hardened.`, `Ten ${faction} complete. A detachment marches to war. Glorious.`, `${faction} — Full Detachment. Ten painted warriors, zero excuses.`],
      '20': [`TWENTY ${faction} COMPLETE. A Battle Company rises from your shelf!`, `${faction} Battle Company assembled. The enemy stands no chance.`, `Twenty ${faction} warriors. The painting table has forged an army.`],
    };
    const poolsAos = {
      '5':  [`Five ${faction} champions ready for the Mortal Realms. Sigmar approves.`, `A ${faction} retinue complete. The realmgate opens for them.`, `Five ${faction} — Combat Ready. The Mortal Realms tremble.`],
      '10': [`A full ${faction} warband! Ten champions, battle-hardened across the realms.`, `Ten ${faction} complete. A warband marches through the realmgate. Glorious.`, `${faction} — Full Retinue. Ten warriors, zero excuses.`],
      '20': [`TWENTY ${faction} COMPLETE. A full warhost rises from your shelf!`, `${faction} Warhost assembled. The enemy of the Mortal Realms stands no chance.`, `Twenty ${faction} warriors. The painting table has forged a legend.`],
    };
    const pools = universe === 'aos' ? poolsAos : pools40k;
    return pick(pools[count] || [`${count} ${faction} complete. The shelf is magnificent.`]);
  }
  const pool = FLAVOR[achievement.id];
  return pool ? pick(pool) : achievement.desc;
}

function getOpener(achievement, universe) {
  const OPENERS = universe === 'aos' ? OPENERS_AOS : OPENERS_40K;
  if (achievement.id.startsWith('series:'))         return pick(OPENERS.series);
  if (achievement.id.startsWith('army:'))           return pick(OPENERS.army);
  if (achievement.id.startsWith('paint_streak'))    return pick(OPENERS.painting_streak);
  if (achievement.id.startsWith('monthly_painter')) return pick(OPENERS.painting_monthly);
  if (achievement.id.startsWith('paint_'))          return pick(OPENERS.painting_general);
  if (achievement.cat === 'streak')                 return pick(OPENERS.streak);
  if (achievement.cat === 'monthly')                return pick(OPENERS.monthly);
  if (achievement.cat === 'faction')                return pick(OPENERS.faction);
  if (achievement.cat === 'explorer')               return pick(OPENERS.explorer);
  return pick(OPENERS.milestone);
}

// ─── SPARKLE PARTICLES ───────────────────────────────────────────────────────
const SPARKLES = [
  { angle: 0,   delay: 0   },
  { angle: 60,  delay: 60  },
  { angle: 120, delay: 120 },
  { angle: 180, delay: 40  },
  { angle: 240, delay: 80  },
  { angle: 300, delay: 20  },
];

function Sparkle({ angle, delay, accent, visible }) {
  const rad = (angle * Math.PI) / 180;
  const r   = 34;
  const x   = Math.round(Math.cos(rad) * r);
  const y   = Math.round(Math.sin(rad) * r);
  return (
    <div style={{
      position: "absolute", left: "50%", top: "50%",
      width: 6, height: 6, borderRadius: "50%",
      background: accent, boxShadow: `0 0 6px ${accent}`,
      opacity: visible ? 1 : 0,
      transform: visible
        ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`
        : "translate(-50%,-50%) scale(0)",
      transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      pointerEvents: "none",
    }} />
  );
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const ACCENT_MAP = { reading: "#c9a84c", painting: "#9a4adc" };
const BG   = "#0a0905";
const TEXT = "#d4cbb8";
const MUTED = "#7a7060";

export default function AchievementPopup({ achievement, onDismiss, type = "reading", universe = "wh40k" }) {
  const [vis, setVis] = useState(false);
  const accent  = ACCENT_MAP[type] || ACCENT_MAP.reading;
  const flavor  = useRef(getFlavorText(achievement, universe));
  const opener  = useRef(getOpener(achievement, universe));

  useEffect(() => {
    const t1 = setTimeout(() => setVis(true), 30);
    const t2 = setTimeout(() => { setVis(false); setTimeout(onDismiss, 450); }, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => { setVis(false); setTimeout(onDismiss, 450); };

  return (
    <>
      <style>{`
        @keyframes achPulse {
          0%,100% { box-shadow: 0 0 14px ${accent}55, 0 0 4px ${accent}22; }
          50%      { box-shadow: 0 0 28px ${accent}99, 0 0 12px ${accent}55; }
        }
        @keyframes achShimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>
      <div
        onClick={dismiss}
        style={{
          position: "fixed", top: 56, left: 12, right: 12,
          zIndex: 9998, cursor: "pointer",
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0) scale(1)" : "translateY(-30px) scale(0.96)",
          transition: "opacity 0.45s cubic-bezier(.22,1,.36,1), transform 0.45s cubic-bezier(.22,1,.36,1)",
          maxWidth: 580, margin: "0 auto",
        }}
      >
        <div style={{
          position: "absolute", inset: -4, borderRadius: 20, pointerEvents: "none",
          boxShadow: `0 0 40px ${accent}33, 0 0 80px ${accent}18`,
        }} />
        <div style={{
          background: `linear-gradient(140deg, ${accent}22 0%, ${BG}ee 50%, ${accent}0a 100%)`,
          border: `2px solid ${accent}aa`,
          borderRadius: 18, padding: "16px 18px 14px",
          boxShadow: `inset 0 1px 0 ${accent}33, 0 12px 40px rgba(0,0,0,0.8)`,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          {/* icon + sparkles */}
          <div style={{ position: "relative", flexShrink: 0, width: 64, height: 64 }}>
            {SPARKLES.map((s, i) => <Sparkle key={i} {...s} accent={accent} visible={vis} />)}
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: `radial-gradient(circle, ${accent}55 0%, ${accent}22 50%, transparent 100%)`,
              border: `2px solid ${accent}88`,
              animation: vis ? `achPulse 1.6s ease-in-out infinite` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32,
            }}>
              {achievement.icon}
            </div>
          </div>
          {/* text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Cinzel',serif", fontSize: 7, letterSpacing: 3,
              textTransform: "uppercase", marginBottom: 4,
              background: `linear-gradient(90deg, ${accent}, #fff, ${accent})`,
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: vis ? "achShimmer 2s linear infinite" : "none",
            }}>
              ✦ {opener.current} ✦
            </div>
            <div style={{
              fontFamily: "'Cinzel Decorative',serif", fontSize: 16,
              color: TEXT, lineHeight: 1.2, marginBottom: 6,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {achievement.label}
            </div>
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, fontStyle: "italic" }}>
              {flavor.current}
            </div>
          </div>
          <div style={{ fontSize: 9, color: MUTED, flexShrink: 0, opacity: 0.5, writingMode: "vertical-rl" }}>tap</div>
        </div>
      </div>
    </>
  );
}
