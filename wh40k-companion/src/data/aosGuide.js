import { AOS_BOOKS } from './aosBooks';

// Match a guide entry to an AOS_BOOKS record by aos_id (preferred) or exact title.
export function findAoSGuideBook(entry) {
  if (entry.aos_id) return AOS_BOOKS.find(b => b.id === entry.aos_id);
  return AOS_BOOKS.find(b => b.title.toLowerCase() === entry.t.toLowerCase()) ?? null;
}

// ─── ESSENTIAL PATH (~12 core reads) ─────────────────────────────────────────
export const AOS_ESSENTIAL = [
  {
    id:"ae1", label:"Parte 1", title:"The Realmgate Wars",
    note:"L'inizio. Sigmar invia i suoi Stormcast Eternals nei Reami Mortali per liberarli da Chaos.",
    books:[
      { t:"The Gates of Azyr", a:"Chris Wraight", aos_id:"aos1" },
      { t:"Ghal Maraz", a:"Josh Reynolds, Guy Haley", aos_id:"aos3", type:"anthology", opt:true },
    ],
  },
  {
    id:"ae2", label:"Parte 2", title:"Soul Wars & the Necroquake",
    note:"La ritualità di Nagash scuote i reami. Inizia l'età delle Soul Wars — il momento narrativo più importante della storia AoS.",
    books:[
      { t:"Nagash: The Undying King", a:"Josh Reynolds", aos_id:"aos41" },
      { t:"Soul Wars",                a:"Josh Reynolds", aos_id:"aos42" },
      { t:"Hallowed Knights: Plague Garden", a:"Josh Reynolds", aos_id:"aos14" },
    ],
  },
  {
    id:"ae3", label:"Parte 3", title:"Guerra nei Reami",
    books:[
      { t:"Hallowed Knights: Black Pyramid", a:"Josh Reynolds", aos_id:"aos15" },
      { t:"Eight Lamentations: Spear of Shadows", a:"Josh Reynolds", aos_id:"aos17", opt:true },
    ],
  },
  {
    id:"ae4", label:"Parte 4", title:"Era of the Beast",
    note:"3ª Edizione. L'Everchosen cade, Kragnos si sveglia, i Dawnbringers marciano.",
    books:[
      { t:"Dominion", a:"Darius Hinks", aos_id:"aos51" },
      { t:"The End of Enlightenment", a:"Richard Strachan", aos_id:"aos50", opt:true },
    ],
  },
  {
    id:"ae5", label:"Parte 5", title:"Dawnbringers & 4ª Edizione",
    note:"Gli Skaven invadono in massa. Porta direttamente alla 4ª Edizione.",
    books:[
      { t:"Skaventide", a:"Gary Kloster", aos_id:"aos55" },
    ],
  },
];

// ─── FULL READING ORDER ───────────────────────────────────────────────────────
export const AOS_FULL = [
  {
    id:"af1", label:"Parte 1", title:"The Realmgate Wars",
    note:"L'inizio della nuova era. Gli Stormcast Eternals, guerrieri forgiati dalla folgore di Sigmar, discendono sui Reami Mortali.",
    books:[
      { t:"The Gates of Azyr",  a:"Chris Wraight",                           aos_id:"aos1" },
      { t:"War Storm",          a:"Nick Kyme, Guy Haley, Josh Reynolds",      aos_id:"aos2",  type:"anthology" },
      { t:"Ghal Maraz",         a:"Josh Reynolds, Guy Haley",                 aos_id:"aos3",  type:"anthology" },
      { t:"Hammers of Sigmar",  a:"Darius Hinks, C L Werner",                 aos_id:"aos4",  type:"anthology", opt:true },
      { t:"Warbeast",           a:"Gav Thorpe",                               aos_id:"aos7",  type:"novella",   opt:true },
      { t:"Bladestorm",         a:"Matt Westbrook",                           aos_id:"aos9",  type:"novella",   opt:true },
      { t:"Lord of Undeath",    a:"C L Werner",                               aos_id:"aos11", type:"novella",   opt:true },
    ],
  },
  {
    id:"af2", label:"Parte 2", title:"Soul Wars & the Necroquake",
    note:"Il Grande Rituale di Nagash devasta i Reami. L'era delle Soul Wars ridisegna ogni fazione e ogni alleanza.",
    books:[
      { t:"Nagash: The Undying King",        a:"Josh Reynolds", aos_id:"aos41" },
      { t:"Soul Wars",                        a:"Josh Reynolds", aos_id:"aos42" },
      { t:"Hallowed Knights: Plague Garden",  a:"Josh Reynolds", aos_id:"aos14" },
      { t:"Hallowed Knights: Black Pyramid",  a:"Josh Reynolds", aos_id:"aos15" },
      { t:"Shadespire: The Mirrored City",    a:"Josh Reynolds", aos_id:"aos36", opt:true },
      { t:"Sacrosanct & Other Stories",       a:"Various",       aos_id:"aos62", type:"anthology", opt:true },
    ],
  },
  {
    id:"af3", label:"Parte 3", title:"Guerra e Esplorazione",
    note:"I reami si espandono. Cacciatori di reliquie, avventurieri e forze del Caos si scontrano su ogni fronte.",
    books:[
      { t:"Eight Lamentations: Spear of Shadows", a:"Josh Reynolds", aos_id:"aos17" },
      { t:"Hamilcar: Champion of the Gods",        a:"David Guymer",  aos_id:"aos25", opt:true },
      { t:"Gloomspite",                            a:"Andy Clark",    aos_id:"aos45", opt:true },
      { t:"Neferata: Mortarch of Blood",           a:"David Annandale", aos_id:"aos43", opt:true },
      { t:"The Hollow King",                       a:"John French",   aos_id:"aos53", opt:true },
      { t:"Stormvault",                            a:"Andy Clark",    aos_id:"aos48", opt:true },
    ],
  },
  {
    id:"af4", label:"Parte 4", title:"Broken Realms",
    note:"Le campagne narrative che hanno cambiato le sorti di ogni Grande Fazione — Morathi, Teclis, Belakor, Kragnos.",
    books:[
      { t:"Godeater's Son",             a:"Noah Van Nguyen", aos_id:"aos72" },
      { t:"Kragnos: Avatar of Destruction", a:"David Guymer", aos_id:"aos74", opt:true },
    ],
  },
  {
    id:"af5", label:"Parte 5", title:"Era of the Beast",
    note:"3ª Edizione. Kragnos è libero, Archaon è indebolito — i Dawnbringers marciano nel Chaos.",
    books:[
      { t:"Dominion",                        a:"Darius Hinks",     aos_id:"aos51" },
      { t:"The End of Enlightenment",        a:"Richard Strachan", aos_id:"aos50" },
      { t:"Yndrasta: The Celestial Spear",   a:"Noah Van Nguyen",  aos_id:"aos75", opt:true },
      { t:"Hammers of Sigmar: First Forged", a:"Richard Strachan", aos_id:"aos77", opt:true },
      { t:"Godeater's Son",                  a:"Noah Van Nguyen",  aos_id:"aos72", opt:true },
      { t:"A Dynasty of Monsters",           a:"Richard Strachan", aos_id:"aos76", opt:true },
    ],
  },
  {
    id:"af6", label:"Parte 6", title:"Dawnbringers & 4ª Edizione",
    note:"Gli Skaven scatenano la Vermintide. Porta direttamente alla 4ª Edizione e alla nuova era narrativa.",
    books:[
      { t:"Skaventide",   a:"Gary Kloster", aos_id:"aos55" },
      { t:"Bad Loon Rising", a:"Jordan Saia", aos_id:"aos78", opt:true },
      { t:"Godsbane",     a:"Dale Lucas",   aos_id:"aos79", opt:true },
    ],
  },
];

// ─── OPTIONAL ARCS ───────────────────────────────────────────────────────────
export const AOS_OPTIONAL_ARCS = [
  {
    id:"aopt1", label:"Gotrek Gurnisson", title:"Lo Slayer nei Reami Mortali",
    note:"Gotrek attraversa ogni era di AoS. Si può leggere in qualsiasi momento — nessuna conoscenza pregressa richiesta per la versione AoS.",
    books:[
      { t:"Realmslayer",       a:"David Guymer",    aos_id:"aos19", type:"audio" },
      { t:"Ghoulslayer",       a:"Darius Hinks",    aos_id:"aos21" },
      { t:"Gitslayer",         a:"Darius Hinks",    aos_id:"aos22" },
      { t:"Soulslayer",        a:"Darius Hinks",    aos_id:"aos23" },
      { t:"Blightslayer",      a:"Richard Strachan", aos_id:"aos24" },
    ],
  },
  {
    id:"aopt2", label:"Callis & Toll", title:"Agenti delle Città Libere",
    note:"Un witch hunter e un soldato in disgrazia — mistero e intrigo nelle Città Libere. Inizia da City of Secrets.",
    books:[
      { t:"City of Secrets",             a:"Nick Horth", aos_id:"aos27" },
      { t:"Callis and Toll: The Silver Shard", a:"Nick Horth", aos_id:"aos28" },
      { t:"Callis and Toll",             a:"Nick Horth", aos_id:"aos29" },
    ],
  },
  {
    id:"aopt3", label:"Blacktalon", title:"Cacciatrice Stormcast",
    books:[
      { t:"Blacktalon: First Mark", a:"Andy Clark",     aos_id:"aos30" },
      { t:"Blacktalon",             a:"Liane Merciel",  aos_id:"aos31" },
    ],
  },
  {
    id:"aopt4", label:"Drekki Flynt", title:"Kharadron Overlords",
    note:"Sky-piracy e ingegneria eterea — avventura swashbuckling tra i Duardin del cielo.",
    books:[
      { t:"The Arkanaut's Oath",       a:"Guy Haley",     aos_id:"aos32" },
      { t:"The Ghosts of Barak-Minoz", a:"Guy Haley",     aos_id:"aos33" },
      { t:"Profit's Ruin",             a:"Josh Reynolds", aos_id:"aos66" },
    ],
  },
  {
    id:"aopt5", label:"Warhammer Underworlds", title:"Shadespire & Beyond",
    books:[
      { t:"Shadespire: The Mirrored City",     a:"Josh Reynolds", aos_id:"aos36" },
      { t:"Beastgrave",                        a:"C L Werner",    aos_id:"aos38" },
    ],
  },
];
