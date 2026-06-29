// WH40K newcomer "Getting Started" guide — a curated on-ramp into Warhammer
// 40,000 for first-time readers. Mirrors the AoS starter wizard (AoSApp.jsx).
// English text lives inline here as the source of truth / fallback; Italian
// overrides live in data/i18n/ns/reading.js under `reading.starter.*` and are
// resolved at render time (see Start40kSection in ReadingSection.jsx).
//
// Book references use real catalogue ids from data/books.js. Picks are inspired
// by widely-recommended entry points and FanFiAddict's "So you want to start
// reading Warhammer 40,000?" guide (Gaunt's Ghosts, the Ultramarines/Uriel
// Ventris Chronicles and the Horus Heresy), plus the perennial Eisenhorn,
// Ciaphas Cain and standalone recommendations.

export const START_40K = [
  {
    id: "g1", step: "Step 1", title: "The Perfect First Book",
    note: "If you read only one Warhammer 40,000 book, make it this one. Xenos follows Inquisitor Gregor Eisenhorn as he hunts heretics and aliens across the Imperium — a self-contained thriller that shows you the whole setting through one man's eyes. No prior knowledge needed.",
    books: [{ id: 98 }], // Xenos (Eisenhorn #1)
  },
  {
    id: "g2", step: "Step 2", title: "Pick Your Battlefield",
    pickOne: true,
    note: "There's no single 'right' way into 40K — choose the kind of story that excites you most. Each of these is a brilliant entry point on its own.",
    options: [
      { label: "Boots on the Ground", color: "#6a7a3a",
        note: "The Imperial Guard: ordinary humans against impossible odds. First and Only opens the beloved Gaunt's Ghosts saga — gritty military 40K at its best.",
        books: [{ id: 82 }] }, // First and Only (Gaunt's Ghosts #1)
      { label: "Heroic Space Marines", color: "#3a6a8a",
        note: "Helsreach: a lone Black Templars Chaplain defends a doomed hive city from an Ork invasion. One of the most loved 40K novels ever written.",
        books: [{ id: 209 }] }, // Helsreach
      { label: "Wit & Adventure", color: "#a07838",
        note: "For the Emperor: Commissar Ciaphas Cain is a self-serving coward with a hero's reputation. Funny, fast and the most accessible 40K there is.",
        books: [{ id: 110 }] }, // For the Emperor (Ciaphas Cain #1)
      { label: "Inside the Villains", color: "#8a3030",
        note: "Soul Hunter: the Night Lords are traitor Space Marines — and you'll find yourself rooting for them anyway. Chaos seen from the inside.",
        books: [{ id: 107 }] }, // Soul Hunter (Night Lords #1)
    ],
  },
  {
    id: "g3", step: "Step 3", title: "Standalones You Can't Miss",
    note: "Complete stories that need zero background — perfect when you just want one great book.",
    books: [
      { id: 276 },             // The Infinite and the Divine (Necrons)
      { id: 277, opt: true },  // Brutal Kunnin' (Orks)
      { id: 214, opt: true },  // The Lords of Silence (Death Guard)
    ],
  },
  {
    id: "g4", step: "Step 4", title: "The Setting Today",
    note: "Dark Imperium is the modern-era launch novel: Primarch Roboute Guilliman wakes after ten thousand years to lead a sundered Imperium. The best on-ramp to the 'current' timeline of 40K.",
    books: [{ id: 121 }], // Dark Imperium
  },
  {
    id: "g5", step: "Step 5", title: "Go Deeper — Pick a Path",
    pickOne: true,
    note: "Hooked? Sink into a longer series, or take on the saga that started it all.",
    options: [
      { label: "Ultramarines", color: "#3a6a8a",
        note: "Graham McNeill's Uriel Ventris Chronicles — a young Ultramarines captain, honour and xenos warfare. Classic Space Marine action, starting with Nightbringer.",
        books: [{ id: 153 }] }, // Nightbringer (Ultramarines #1)
      { label: "Inquisition", color: "#7a5a8a",
        note: "Continue Eisenhorn (Malleus, Hereticus), then his protégé Ravenor — Dan Abnett's interlocking masterwork of the Imperium's secret war.",
        books: [{ id: 99 }, { id: 100 }, { id: 102 }] }, // Malleus, Hereticus, Ravenor
      { label: "The Horus Heresy", color: "#b03030",
        note: "Ten thousand years before the 'present', the Emperor's favoured son betrays him. The 54-book epic that defines the setting — start with Horus Rising, then use the ⚔ Heresy Guide tab to navigate it all.",
        books: [{ id: 1 }] }, // Horus Rising
    ],
  },
];
