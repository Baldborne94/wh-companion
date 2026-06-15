import { AOS_BOOKS } from './aosBooks';

// Match a guide entry to an AOS_BOOKS record by aos_id (preferred) or exact title.
export function findAoSGuideBook(entry) {
  if (entry.aos_id) return AOS_BOOKS.find(b => b.id === entry.aos_id);
  return AOS_BOOKS.find(b => b.title.toLowerCase() === entry.t.toLowerCase()) ?? null;
}

// ─── ESSENTIAL PATH (~12 core reads) ─────────────────────────────────────────
export const AOS_ESSENTIAL = [
  {
    id:"ae0", label:"Prologue", title:"The World-That-Was",
    note:"AoS was born from the death of the Old World. These Warhammer Fantasy sagas are optional, but they are the direct origin of the Age of Sigmar — setting up Sigmar the god-king and Nagash, his eternal enemy.",
    books:[
      { t:"Heldenhammer",        a:"Graham McNeill", aos_id:"ow1", era:"old", opt:true },
      { t:"Empire",              a:"Graham McNeill", aos_id:"ow2", era:"old", opt:true },
      { t:"God King",            a:"Graham McNeill", aos_id:"ow3", era:"old", opt:true },
      { t:"Nagash the Sorcerer", a:"Mike Lee",       aos_id:"ow4", era:"old", opt:true },
      { t:"Nagash the Unbroken", a:"Mike Lee",       aos_id:"ow5", era:"old", opt:true },
      { t:"Nagash Immortal",     a:"Mike Lee",       aos_id:"ow6", era:"old", opt:true },
    ],
  },
  {
    id:"ae1", label:"Part 1", title:"The Realmgate Wars",
    note:"The beginning. Sigmar sends his Stormcast Eternals into the Mortal Realms to free them from Chaos.",
    books:[
      { t:"The Gates of Azyr", a:"Chris Wraight", aos_id:"aos1" },
      { t:"Ghal Maraz", a:"Josh Reynolds, Guy Haley", aos_id:"aos3", type:"anthology", opt:true },
    ],
  },
  {
    id:"ae2", label:"Part 2", title:"Soul Wars & the Necroquake",
    note:"Nagash's great ritual shakes the realms. The age of the Soul Wars begins — the most pivotal moment in AoS history.",
    books:[
      { t:"Nagash: The Undying King", a:"Josh Reynolds", aos_id:"aos41" },
      { t:"Soul Wars",                a:"Josh Reynolds", aos_id:"aos42" },
      { t:"Hallowed Knights: Plague Garden", a:"Josh Reynolds", aos_id:"aos14" },
    ],
  },
  {
    id:"ae3", label:"Part 3", title:"War in the Realms",
    books:[
      { t:"Hallowed Knights: Black Pyramid", a:"Josh Reynolds", aos_id:"aos15" },
      { t:"Eight Lamentations: Spear of Shadows", a:"Josh Reynolds", aos_id:"aos17", opt:true },
    ],
  },
  {
    id:"ae4", label:"Part 4", title:"Era of the Beast",
    note:"3rd Edition. The Everchosen falls, Kragnos awakens, and the Dawnbringers march.",
    books:[
      { t:"Dominion", a:"Darius Hinks", aos_id:"aos51" },
      { t:"The End of Enlightenment", a:"Richard Strachan", aos_id:"aos50", opt:true },
    ],
  },
  {
    id:"ae5", label:"Part 5", title:"Dawnbringers & 4th Edition",
    note:"The Skaven invade en masse, leading directly into 4th Edition.",
    books:[
      { t:"Skaventide", a:"Gary Kloster", aos_id:"aos55" },
    ],
  },
];
