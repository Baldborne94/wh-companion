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
