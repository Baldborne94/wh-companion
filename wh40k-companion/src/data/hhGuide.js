import { BOOKS } from './books';

// ─── HORUS HERESY READING GUIDE DATA ─────────────────────────────────────────
export const HH_FULL = [
  {id:"p0",label:"Prologue",title:"40K Foundation — Pick One Path",pickOne:true,
   note:"Choose ONE of these paths before the Heresy. They introduce key factions and context.",
   options:[
    {label:"Inquisition",color:"#7a4a8a",books:[{t:"Eisenhorn"},{t:"Malleus"},{t:"Hereticus"}]},
    {label:"Night Lords",color:"#1a3a5a",books:[{t:"Soul Hunter"},{t:"Blood Reaver"},{t:"Void Stalker"}]},
    {label:"Dark Angels",color:"#1a4a2a",books:[{t:"Angels of Darkness"},{t:"Ravenwing"},{t:"Master of Sanctity"},{t:"The Unforgiven"}],note:"Add Descent of Angels to the start of Part 4"},
    {label:"Ultramarines",color:"#1a3a6a",books:[{t:"Nightbringer"},{t:"Storm of Iron"},{t:"Warriors of Ultramar"}]},
  ]},
  {id:"p1",label:"Part 1",title:"The Fall of Horus",books:[
    {t:"The Wolf of Ash and Fire",a:"Graham McNeill",type:"short",src:"Eye of Terra (35)"},
    {n:1,t:"Horus Rising",a:"Dan Abnett"},
    {n:2,t:"False Gods",a:"Graham McNeill"},
    {n:3,t:"Galaxy in Flames",a:"Ben Counter"},
    {n:4,t:"The Flight of the Eisenstein",a:"James Swallow"},
    {n:5,t:"Fulgrim",a:"Graham McNeill",opt:true},
  ]},
  {id:"p2",label:"Part 2",title:"The First Heretic",books:[
    {t:"The Last Church",a:"Graham McNeill",type:"audio",src:"Tales of Heresy (10)"},
    {n:14,t:"The First Heretic",a:"Aaron Dembski-Bowden"},
    {t:"The Aurelian",a:"Aaron Dembski-Bowden",type:"short",src:"Eye of Terra (35)"},
    {n:19,t:"Know No Fear",a:"Dan Abnett"},
  ]},
  {id:"p3",label:"Part 3",title:"Betrayer",books:[
    {t:"After Deshea",a:"Matt Farrer",type:"short",src:"Tales of Heresy (10)"},
    {t:"Lord of the Red Sands",a:"Aaron Dembski-Bowden",type:"short",src:"War Without End (33)"},
    {t:"Butcher's Nails",a:"Aaron Dembski-Bowden",type:"audio",src:"Legacies of Betrayal (31)"},
    {n:24,t:"Betrayer",a:"Aaron Dembski-Bowden"},
  ]},
  {id:"p4",label:"Part 4",title:"The Lion and the Prince",books:[
    {t:"The Dark King",a:"Graham McNeill",type:"audio",src:"Shadows of Treachery (22)"},
    {t:"Massacre",a:"Aaron Dembski-Bowden",type:"short",src:"Eye of Terra (35)"},
    {n:11,t:"Fallen Angels",a:"Mike Lee"},
    {t:"Savage Weapons",a:"Aaron Dembski-Bowden",type:"short",src:"Age of Darkness (16)"},
    {t:"The Lion",a:"Gav Thorpe",type:"short",src:"The Primarchs (20)"},
    {t:"Prince of Crows",a:"Aaron Dembski-Bowden",type:"short",src:"Shadows of Treachery (22)"},
    {t:"Master of the First",a:"Gav Thorpe",type:"short",src:"Eye of Terra (35)"},
    {t:"The Long Night",a:"Aaron Dembski-Bowden",type:"short",src:"Eye of Terra (35)"},
    {t:"Lord of the Night",a:"Simon Spurrier",b40k:true},
    {t:"Night Lords Omnibus",a:"Aaron Dembski-Bowden",b40k:true},
  ]},
  {id:"p5",label:"Part 5",title:"Imperium Secondus",books:[
    {n:27,t:"The Unremembered Empire",a:"Dan Abnett"},
    {t:"A Safe and Shadowed Place",a:"Guy Haley",type:"short",src:"War Without End (33)"},
    {t:"Heart of Pharos",a:"L.J. Goulding",type:"audio",src:"Burden of Loyalty (48)"},
    {n:26,t:"Pharos",a:"Guy Haley"},
    {n:38,t:"Angels of Caliban",a:"Gav Thorpe"},
    {n:46,t:"Ruinstorm",a:"David Annandale"},
    {t:"Scythes of the Emperor Anthology",a:"L.J. Goulding",b40k:true},
  ]},
  {id:"p6",label:"Part 6",title:"Legion of One — Garro",books:[
    {t:"The Last Remembrancer",a:"John French",type:"short",src:"Age of Darkness (16)"},
    {t:"Oath of Moment",a:"James Swallow",type:"audio",src:"Garro (42)"},
    {t:"Sword of Truth",a:"James Swallow",type:"audio",src:"Garro (42)"},
    {t:"Legion of One",a:"James Swallow",type:"audio",src:"Garro (42)"},
    {t:"Grey Angel",a:"James Swallow",type:"short",src:"The Silent War (37)"},
    {t:"Luna Mendax",a:"Graham McNeill",type:"short",src:"The Silent War (37)"},
    {t:"The Devine Adoratrice",a:"Graham McNeill",type:"short",src:"War Without End (33)"},
    {n:29,t:"Vengeful Spirit",a:"Graham McNeill"},
  ]},
  {id:"p7",label:"Part 7",title:"Mars & Magnus",books:[
    {t:"The Kaban Project",a:"Graham McNeill",type:"short",src:"Shadows of Treachery (22)"},
    {n:9,t:"Mechanicum",a:"Graham McNeill"},
    {t:"Into Exile",a:"Aaron Dembski-Bowden",type:"short",src:"Burden of Loyalty (48)"},
    {n:12,t:"A Thousand Sons",a:"Graham McNeill"},
    {t:"Thief of Revelations",a:"Graham McNeill",type:"audio",src:"Legacies of Betrayal (31)"},
    {n:41,t:"The Master of Mankind",a:"Aaron Dembski-Bowden"},
    {n:44,t:"The Crimson King",a:"Graham McNeill",opt:true},
    {t:"Ahriman Omnibus",a:"John French",b40k:true},
    {t:"Forges of Mars Omnibus",a:"Graham McNeill",b40k:true},
  ]},
  {id:"p8",label:"Part 8",title:"Wolves",books:[
    {n:15,t:"Prospero Burns",a:"Dan Abnett"},
    {t:"Wolf's Claw",a:"Chris Wraight",type:"audio",src:"Legacies of Betrayal (31)"},
    {t:"Wolf King",a:"Chris Wraight",type:"audio",src:"Burden of Loyalty (48)"},
    {n:49,t:"Wolfsbane",a:"Guy Haley"},
    {t:"Two Metaphysical Blades",a:"Chris Wraight",type:"short",src:"Unprinted"},
    {t:"The Hunt for Magnus",a:"Chris Wraight",b40k:true},
    {t:"Battle of the Fang",a:"Chris Wraight",b40k:true},
  ]},
  {id:"p9",label:"Part 9",title:"Scars",books:[
    {n:28,t:"Scars",a:"Chris Wraight"},
    {t:"Brotherhood of the Moon",a:"Chris Wraight",type:"short",src:"Eye of Terra (35)"},
    {t:"Allegiance",a:"Chris Wraight",type:"short",src:"War Without End (33)"},
    {n:36,t:"Path of Heaven",a:"Chris Wraight"},
    {t:"The Last Son of Prospero",a:"Chris Wraight",type:"short",src:"Heralds of the Siege (52)"},
  ]},
  {id:"p10",label:"Part 10",title:"Iron Warriors",books:[
    {t:"The Emperor's Architect",a:"Guy Haley",type:"short",src:"Scions of the Emperor"},
    {t:"Perturabo: The Hammer of Olympia",a:"Guy Haley"},
    {t:"The Iron Within",a:"Rob Sanders",type:"short",src:"Age of Darkness (16)"},
    {t:"Ironfire",a:"Rob Sanders",type:"short",src:"Eye of Terra (35)"},
    {n:23,t:"Angel Exterminatus",a:"Graham McNeill"},
    {n:51,t:"Slaves to Darkness",a:"John French"},
  ]},
  {id:"p11",label:"Part 11",title:"Imperial Fists",books:[
    {t:"The Lightning Tower",a:"Dan Abnett",type:"audio",src:"Shadows of Treachery (22)"},
    {t:"The Crimson Fist",a:"John French",type:"short",src:"Shadows of Treachery (22)"},
    {t:"Templar",a:"John French",type:"audio",src:"The Silent War (37)"},
    {n:39,t:"Praetorian of Dorn",a:"John French"},
    {t:"The Chamber at the End of Memory",a:"James Swallow",type:"short",src:"Scions of the Emperor"},
    {t:"Now Peals Midnight",a:"John French",type:"short",src:"Heralds of the Siege (52)"},
  ]},
  {id:"p12",label:"Part 12",title:"The Siege of Terra",note:"The grand finale — the culmination of 60+ books",books:[
    {t:"The Solar War",a:"John French"},
    {t:"The Lost and the Damned",a:"Guy Haley"},
    {t:"The First Wall",a:"Gav Thorpe"},
    {t:"Sons of the Selenar",a:"Graham McNeill",type:"novella"},
    {t:"Saturnine",a:"Dan Abnett"},
    {t:"Fury of Magnus",a:"Graham McNeill",type:"novella"},
    {t:"Mortis",a:"John French"},
    {t:"Warhawk",a:"Chris Wraight"},
    {t:"Echoes of Eternity",a:"Aaron Dembski-Bowden"},
    {t:"Garro: Knight of the Grey",a:"James Swallow",type:"novella"},
    {t:"The End and the Death Volume 1",a:"Dan Abnett"},
    {t:"The End and the Death Volume 2",a:"Dan Abnett"},
    {t:"The End and the Death Volume 3",a:"Dan Abnett"},
  ]},
];

export const HH_OPTIONAL = [
  {id:"opt1",label:"Optional 1",title:"Raven Guard",books:[
    {t:"Raven's Flight",a:"Gav Thorpe",type:"audio",src:"Shadows of Treachery (22)"},
    {t:"The Face of Treachery",a:"Gav Thorpe",type:"short",src:"Age of Darkness (16)"},
    {n:18,t:"Deliverance Lost",a:"Gav Thorpe"},
    {t:"Soulforge",a:"Gav Thorpe",type:"short",src:"Corax (40)"},
    {t:"Ravenlord",a:"Gav Thorpe",type:"short",src:"Corax (40)"},
    {t:"The Value of Fear",a:"Gav Thorpe",type:"short",src:"Corax (40)"},
    {t:"Raptor",a:"Gav Thorpe",type:"audio",src:"Corax (40)"},
    {t:"Weregeld",a:"Gav Thorpe",type:"short",src:"Corax (40)"},
    {t:"The Grey Raven",a:"Gav Thorpe",type:"short",src:"Heralds of the Siege (52)"},
    {t:"Valerius",a:"Gav Thorpe",type:"audio"},
  ]},
  {id:"opt2",label:"Optional 2",title:"Blood Angels",books:[
    {n:21,t:"Fear to Tread",a:"James Swallow"},
    {t:"Herald of Sanguinius",a:"Andy Smillie",type:"audio",src:"Eye of Terra (35)"},
    {t:"Sins of the Father",a:"Andy Smillie",type:"audio",src:"Eye of Terra (35)"},
    {t:"Virtues of the Sons",a:"Andy Smillie",type:"audio",src:"War Without End (33)"},
    {t:"Flesh Tearers Anthology",a:"Andy Smillie",b40k:true},
    {t:"Wrath of the Lost",a:"Chris Forrester",b40k:true},
  ]},
  {id:"opt3",label:"Optional 3",title:"Oll Persson",books:[
    {t:"Unmarked",a:"Dan Abnett",type:"short",src:"Mark of Calth (25)"},
    {t:"Perpetual",a:"Dan Abnett",type:"audio",src:"Burden of Loyalty (48)"},
  ]},
  {id:"opt4",label:"Optional 4",title:"Tallarn",books:[
    {t:"Black Oculus",a:"John French",type:"short",src:"War Without End (33)"},
    {t:"Tallarn: Siren",a:"John French",type:"short",src:"Tallarn Anthology (45)"},
    {t:"Tallarn: Executioner",a:"John French",type:"short",src:"Tallarn Anthology (45)"},
    {t:"Tallarn: Ironclad",a:"John French",type:"short",src:"Tallarn Anthology (45)"},
    {t:"The Eagle's Talon",a:"John French",type:"audio",src:"Eye of Terra (35)"},
    {t:"Iron Corpses",a:"David Annandale",type:"audio",src:"Eye of Terra (35)"},
    {t:"Tallarn: Witness",a:"John French",type:"short",src:"Tallarn Anthology (45)"},
  ]},
  {id:"opt5",label:"Optional 5",title:"Pandorax",books:[
    {t:"Veritas Ferrum",a:"David Annandale",type:"short",src:"Legacies of Betrayal (31)"},
    {t:"Sermon of Exodus",a:"David Annandale",type:"short",src:"War Without End (33)"},
    {n:30,t:"Damnation of Pythos",a:"David Annandale"},
    {t:"Pandorax",a:"C.Z. Dunn",b40k:true},
  ]},
];

export const HH_MIN = [
  {id:"m1",label:"Part 1",title:"The Fall of Horus",books:[
    {n:1,t:"Horus Rising",a:"Dan Abnett"},
    {n:2,t:"False Gods",a:"Graham McNeill"},
    {n:3,t:"Galaxy in Flames",a:"Ben Counter"},
    {n:4,t:"The Flight of the Eisenstein",a:"James Swallow"},
    {n:5,t:"Fulgrim",a:"Graham McNeill",opt:true},
  ]},
  {id:"m2",label:"Part 2",title:"Lorgar & Angron",books:[
    {n:14,t:"The First Heretic",a:"Aaron Dembski-Bowden"},
    {n:19,t:"Know No Fear",a:"Dan Abnett"},
    {n:24,t:"Betrayer",a:"Aaron Dembski-Bowden"},
  ]},
  {id:"m3",label:"Part 3",title:"Imperium Secondus",books:[
    {n:27,t:"The Unremembered Empire",a:"Dan Abnett"},
    {n:38,t:"Angels of Caliban",a:"Gav Thorpe"},
    {n:46,t:"Ruinstorm",a:"David Annandale"},
  ]},
  {id:"m4",label:"Part 4",title:"Magnus, Russ & Khan",books:[
    {n:12,t:"A Thousand Sons",a:"Graham McNeill"},
    {n:28,t:"Scars",a:"Chris Wraight"},
    {n:36,t:"Path of Heaven",a:"Chris Wraight"},
  ]},
  {id:"m5",label:"Part 5",title:"The Emperor & Horus",books:[
    {n:41,t:"The Master of Mankind",a:"Aaron Dembski-Bowden"},
    {n:23,t:"Angel Exterminatus",a:"Graham McNeill"},
    {n:51,t:"Slaves to Darkness",a:"John French"},
    {n:39,t:"Praetorian of Dorn",a:"John French"},
  ]},
  {id:"m6",label:"Part 6",title:"The Siege of Terra",note:"The grand finale — read these last",books:[
    {t:"The Solar War",a:"John French"},
    {t:"The Lost and the Damned",a:"Guy Haley"},
    {t:"The First Wall",a:"Gav Thorpe"},
    {t:"Saturnine",a:"Dan Abnett"},
    {t:"Mortis",a:"John French"},
    {t:"Warhawk",a:"Chris Wraight"},
    {t:"Echoes of Eternity",a:"Aaron Dembski-Bowden"},
    {t:"The End and the Death Volume 1",a:"Dan Abnett"},
    {t:"The End and the Death Volume 2",a:"Dan Abnett"},
    {t:"The End and the Death Volume 3",a:"Dan Abnett"},
  ]},
];

export function findHHBook(entry) {
  const tl = entry.t.toLowerCase();
  return BOOKS.find(b => b.title.toLowerCase() === tl) ||
         BOOKS.find(b => b.title.toLowerCase().includes(tl)) ||
         BOOKS.find(b => tl.includes(b.title.toLowerCase())) || null;
}
