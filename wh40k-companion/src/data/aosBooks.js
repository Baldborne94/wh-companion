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

export const AOS_BOOKS = [
  // ── THE REALMGATE WARS ─────────────────────────────────────────────────────
  { id:"aos1",   title:"The Gates of Azyr",                        author:"Chris Wraight",                                        series:"The Realmgate Wars", num:1,  type:"Novella",    desc:"The opening salvo of the Age of Sigmar — a Stormcast Eternals strike force tears through a realmgate into a world conquered by Chaos, and the war for the Mortal Realms begins." },
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
  { id:"aos14",  title:"Hallowed Knights: Plague Garden",           author:"Josh Reynolds",                                        series:"Hallowed Knights",   num:1,  type:"Novel",       isbn:"9781784966218", desc:"Lord-Relictor Gardus Steel Soul descends into Nurgle's own Garden to rescue a fallen Stormcast brother — testing faith against Chaos corruption in the most acclaimed Stormcast Eternals novel." },
  { id:"aos15",  title:"Hallowed Knights: Black Pyramid",           author:"Josh Reynolds",                                        series:"Hallowed Knights",   num:2,  type:"Novel",       isbn:"9781784969301", desc:"The Hallowed Knights journey deep into Shyish to uncover the truth behind Nagash's rising power, directly setting the stage for the Necroquake and Soul Wars era." },
  { id:"aos16",  title:"Hallowed Knights: The Denied",              author:"Josh Reynolds",                                        series:"Hallowed Knights",   num:3,  type:"Audio Drama" },

  // ── EIGHT LAMENTATIONS ────────────────────────────────────────────────────
  { id:"aos17",  title:"Eight Lamentations: Spear of Shadows",      author:"Josh Reynolds",                                        series:"Eight Lamentations", num:1,  type:"Novel",       isbn:"9781784966676", desc:"Heroes from rival factions across the Mortal Realms are thrown together to hunt the Spear of Shadows, a legendary cursed weapon — a sweeping multi-faction quest perfect for new readers." },
  { id:"aos18",  title:"Eight Lamentations: War-Claw",              author:"Josh Reynolds",                                        series:"Eight Lamentations", num:2,  type:"Audio Drama" },

  // ── GOTREK AND FELIX ──────────────────────────────────────────────────────
  { id:"aos89",  title:"Trollslayer",                              author:"William King",     series:"Gotrek and Felix", num:1,  type:"Novel",     desc:"The original Gotrek & Felix novel — a doom-seeking Slayer and his reluctant chronicler stumble into every monster and disaster in the Old World. Still hilarious and brutal decades later." },
  { id:"aos90",  title:"Skavenslayer",                             author:"William King",     series:"Gotrek and Felix", num:2,  type:"Novel"      },
  { id:"aos91",  title:"Daemonslayer",                             author:"William King",     series:"Gotrek and Felix", num:3,  type:"Novel"      },
  { id:"aos92",  title:"Dragonslayer",                             author:"William King",     series:"Gotrek and Felix", num:4,  type:"Novel"      },
  { id:"aos93",  title:"Beastslayer",                              author:"William King",     series:"Gotrek and Felix", num:5,  type:"Novel"      },
  { id:"aos94",  title:"Vampireslayer",                            author:"William King",     series:"Gotrek and Felix", num:6,  type:"Novel"      },
  { id:"aos95",  title:"Giantslayer",                              author:"William King",     series:"Gotrek and Felix", num:7,  type:"Novel"      },
  { id:"aos96",  title:"Orcslayer",                                author:"Nathan Long",      series:"Gotrek and Felix", num:8,  type:"Novel"      },
  { id:"aos97",  title:"Manslayer",                                author:"Nathan Long",      series:"Gotrek and Felix", num:9,  type:"Novel"      },
  { id:"aos98",  title:"Elfslayer",                                author:"Nathan Long",      series:"Gotrek and Felix", num:10, type:"Novel"      },
  { id:"aos99",  title:"Shamanslayer",                             author:"Nathan Long",      series:"Gotrek and Felix", num:11, type:"Novel"      },
  { id:"aos100", title:"Zombieslayer",                             author:"Nathan Long",      series:"Gotrek and Felix", num:12, type:"Novel"      },
  { id:"aos101", title:"Road of Skulls",                           author:"Josh Reynolds",    series:"Gotrek and Felix", num:13, type:"Novel"      },
  { id:"aos102", title:"City of the Damned",                       author:"David Guymer",     series:"Gotrek and Felix", num:14, type:"Novel"      },
  { id:"aos103", title:"Kinslayer",                                author:"David Guymer",     series:"Gotrek and Felix", num:15, type:"Novel"      },
  { id:"aos104", title:"Slayer",                                   author:"David Guymer",     series:"Gotrek and Felix", num:16, type:"Novel"      },
  { id:"aos19",  title:"Realmslayer",                              author:"David Guymer",     series:"Gotrek and Felix", num:17, type:"Audio Drama" },
  { id:"aos20",  title:"Realmslayer: Blood of the Old World",      author:"David Guymer",     series:"Gotrek and Felix", num:18, type:"Audio Drama" },
  { id:"aos21",  title:"Ghoulslayer",                              author:"Darius Hinks",     series:"Gotrek and Felix", num:19, type:"Novel",      isbn:"9781789990553" },
  { id:"aos22",  title:"Gitslayer",                                author:"Darius Hinks",     series:"Gotrek and Felix", num:20, type:"Novel",      isbn:"9781800261044" },
  { id:"aos23",  title:"Soulslayer",                               author:"Darius Hinks",     series:"Gotrek and Felix", num:21, type:"Novel",      isbn:"9781800262478" },
  { id:"aos24",  title:"Blightslayer",                             author:"Richard Strachan", series:"Gotrek and Felix", num:22, type:"Novel",      isbn:"9781804073551" },
  { id:"aos67",  title:"Realmslayer: Legend of the Doomseeker",   author:"David Guymer",     series:"Gotrek and Felix", num:23, type:"Audio Drama" },

  // ── HAMILCAR ──────────────────────────────────────────────────────────────
  { id:"aos25",  title:"Hamilcar: Champion of the Gods",            author:"David Guymer",                                         series:"Hamilcar",           num:1,  type:"Novel",       desc:"The self-aggrandising champion of Sigmar, Hamilcar Bear-Eater, battles through the Mortal Realms with as much bravado as martial skill — one of AoS's most entertaining characters." },
  { id:"aos26",  title:"Hamilcar: Champion of Chaos",               author:"David Guymer",                                         series:"Hamilcar",           num:2,  type:"Audio Drama" },

  // ── CALLIS AND TOLL ───────────────────────────────────────────────────────
  { id:"aos27",  title:"City of Secrets",                           author:"Nick Horth",                                           series:"Callis and Toll",    num:1,  type:"Novel",       isbn:"9781784967512", desc:"In the free city of Anvilgard, two agents — the cynical duelist Callis and the stoic witch hunter Toll — unravel a conspiracy that threatens to tear the city apart. Urban intrigue at its best." },
  { id:"aos28",  title:"Callis and Toll: The Silver Shard",         author:"Nick Horth",                                           series:"Callis and Toll",    num:2,  type:"Novel",       isbn:"9781784968564" },
  { id:"aos29",  title:"Callis and Toll",                           author:"Nick Horth",                                           series:"Callis and Toll",    num:3,  type:"Novel"       },

  // ── BLACKTALON ────────────────────────────────────────────────────────────
  { id:"aos30",  title:"Blacktalon: First Mark",                    author:"Andy Clark",                                           series:"Blacktalon",         num:1,  type:"Novel",       isbn:"9781784969042", desc:"Neave Blacktalon, the Stormcast Eternals' most feared hunter, pursues her most dangerous mark yet — a target who cannot be killed by conventional means." },
  { id:"aos31",  title:"Blacktalon",                                author:"Liane Merciel",                                        series:"Blacktalon",         num:2,  type:"Novel"       },

  // ── DREKKI FLYNT ──────────────────────────────────────────────────────────
  { id:"aos32",  title:"The Arkanaut's Oath",                       author:"Guy Haley",                                            series:"Drekki Flynt",       num:1,  type:"Novel",       isbn:"9781789994766", desc:"Captain Drekki Flynt navigates the dangerous sky-lanes of Chamon aboard his aether-endrin vessel — a swashbuckling adventure packed with Kharadron Overlords lore, sky-pirates, and aether-gold greed." },
  { id:"aos33",  title:"The Ghosts of Barak-Minoz",                 author:"Guy Haley",                                            series:"Drekki Flynt",       num:2,  type:"Novel"       },
  { id:"aos66",  title:"Profit's Ruin",                             author:"Josh Reynolds",                                        series:"Drekki Flynt",       num:3,  type:"Novel"       },

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
  { id:"aos41",  title:"Nagash: The Undying King",                  author:"Josh Reynolds",          series:"", num:0, type:"Novel",   isbn:"9781784966843", desc:"Nagash himself takes the point of view — the Great Necromancer schemes to reclaim the Realm of Death, Shyish, as his eternal domain. Essential reading before Soul Wars." },
  { id:"aos42",  title:"Soul Wars",                                 author:"Josh Reynolds",          series:"", num:0, type:"Novel",   isbn:"9781784969899", desc:"Nagash unleashes the Necroquake — a tide of death magic that reshapes the Mortal Realms — while the Stormcast Eternals fight to hold back the dead. The definitive 2nd Edition launch novel." },
  { id:"aos43",  title:"Neferata: Mortarch of Blood",               author:"David Annandale",        series:"Neferata",   num:1, type:"Novel"   },
  { id:"aos44",  title:"Neferata: The Dominion of Bones",           author:"David Annandale",        series:"Neferata",   num:2, type:"Novel"   },
  { id:"aos45",  title:"Gloomspite",                                author:"Andy Clark",             series:"", num:0, type:"Novel",   isbn:"9781789990218" },
  { id:"aos46",  title:"Realm-Lords",                               author:"Dale Lucas",             series:"", num:0, type:"Novel"   },
  { id:"aos47",  title:"Lady of Sorrows",                           author:"C L Werner",             series:"", num:0, type:"Novel"   },
  { id:"aos48",  title:"Stormvault",                                author:"Andy Clark",             series:"", num:0, type:"Novel"   },
  { id:"aos49",  title:"Bonereapers",                               author:"David Guymer",           series:"", num:0, type:"Novella" },
  { id:"aos50",  title:"The End of Enlightenment",                  author:"Richard Strachan",       series:"", num:0, type:"Novel"   },
  { id:"aos51",  title:"Dominion",                                  author:"Darius Hinks",           series:"", num:0, type:"Novel",   isbn:"9781789999556", desc:"A Stormcast crusade is ambushed by Kruleboyz in the Gnarlwood — the 3rd Edition launch novel, introducing a new age of invasions and the awakening of the god Kragnos." },
  { id:"aos52",  title:"Cursed City",                               author:"C L Werner",             series:"", num:0, type:"Novel"   },
  { id:"aos53",  title:"The Hollow King",                           author:"John French",            series:"", num:0, type:"Novel",   isbn:"9781789996371" },
  { id:"aos54",  title:"Harrowed Ground",                           author:"Richard Strachan",       series:"", num:0, type:"Novel"   },
  { id:"aos55",  title:"Skaventide",                                author:"Gary Kloster",           series:"", num:0, type:"Novel",   isbn:"9781804076934", desc:"The Skaven erupt across the Mortal Realms in overwhelming numbers, triggering Age of Sigmar's 4th Edition. Follows a Stormcast warrior and a Skaven engineer on opposite sides of an apocalypse." },
  { id:"aos56",  title:"Starseer's Ruin",                           author:"Adrian Tchaikovsky",     series:"", num:0, type:"Novel"   },
  { id:"aos68",  title:"Hammerhal",                                 author:"Josh Reynolds",          series:"", num:0, type:"Novella", isbn:"9781784967505", desc:"A quick, essential read for understanding the mortal side of AoS — set in Hammerhal, the twin-tailed city straddling two Mortal Realms and the greatest metropolis of the Age of Sigmar." },
  { id:"aos69",  title:"The Red Feast",                             author:"Gav Thorpe",             series:"", num:0, type:"Novel"   },
  { id:"aos70",  title:"Dark Harvest",                              author:"Josh Reynolds",          series:"Warhammer Horror",    num:1, type:"Novel"   },
  { id:"aos71",  title:"Gothghul Hollow",                           author:"Anna Stephens",          series:"Warhammer Horror",    num:2, type:"Novel"   },
  { id:"aos72",  title:"Godeater's Son",                            author:"Noah Van Nguyen",        series:"", num:0, type:"Novel",   isbn:"9781800262836", desc:"A mortal who has renounced Chaos seeks redemption in a blasted, god-eaten land. A literary and brutal novel that doesn't shy away from the grim reality of life in the Mortal Realms." },
  { id:"aos73",  title:"The Last Volari",                           author:"Gary Kloster",           series:"", num:0, type:"Novel"   },
  { id:"aos74",  title:"Kragnos: Avatar of Destruction",            author:"David Guymer",           series:"", num:0, type:"Novel"   },
  { id:"aos75",  title:"Yndrasta: The Celestial Spear",             author:"Noah Van Nguyen",        series:"", num:0, type:"Novel"   },
  { id:"aos76",  title:"A Dynasty of Monsters",                     author:"Richard Strachan",       series:"", num:0, type:"Novel"   },
  { id:"aos77",  title:"Hammers of Sigmar: First Forged",           author:"Richard Strachan",       series:"", num:0, type:"Novel"   },
  { id:"aos78",  title:"Bad Loon Rising",                           author:"Jordan Saia",            series:"", num:0, type:"Novel"   },
  { id:"aos79",  title:"Godsbane",                                  author:"Dale Lucas",             series:"", num:0, type:"Novel"   },
  { id:"aos105", title:"Lioness of the Parch",                     author:"Evan Dicken",            series:"", num:0, type:"Novel",   isbn:"9781804076644" },
  { id:"aos106", title:"The Dead Kingdom",                         author:"John French",            series:"", num:0, type:"Novel",   isbn:"9781804071250" },
  { id:"aos107", title:"Shade of Khaine",                          author:"Evan Dicken",            series:"", num:0, type:"Novel",   isbn:"9781804076903" },
  { id:"aos108", title:"Darkoath",                                  author:"Chris Thursten",         series:"", num:0, type:"Novel"   },
  { id:"aos109", title:"Ushoran: Mortarch of Delusion",            author:"Dale Lucas",             series:"", num:0, type:"Novel"   },

  // ── BL NOVELLA SERIES ─────────────────────────────────────────────────────
  { id:"aos57",  title:"Warqueen",                                  author:"Darius Hinks",           series:"BL Novella Series", num:1, type:"Novella" },
  { id:"aos58",  title:"Heart of Winter",                           author:"Nick Horth",             series:"BL Novella Series", num:2, type:"Novella" },
  { id:"aos59",  title:"Overlords of the Iron Dragon",              author:"C L Werner",             series:"BL Novella Series", num:3, type:"Novella" },
  { id:"aos80",  title:"The Bone Desert",                           author:"Robbie MacNiven",        series:"BL Novella Series", num:4, type:"Novella" },

  // ── ANTHOLOGIES ───────────────────────────────────────────────────────────
  { id:"aos60",  title:"Myths & Revenants",                         author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos61",  title:"Gods and Mortals",                          author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos62",  title:"Sacrosanct & Other Stories",               author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos63",  title:"Oaths and Conquests",                       author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos64",  title:"Thunderstrike & Other Stories",            author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos65",  title:"Untamed Realms",                            author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos81",  title:"Hammerhal & Other Stories",                 author:"Various",                series:"", num:0, type:"Anthology", isbn:"9781784967505" },
  { id:"aos82",  title:"Call of Chaos",                             author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos83",  title:"Champions of the Mortal Realms",            author:"Various",                series:"", num:0, type:"Anthology", isbn:"9781781939581" },
  { id:"aos84",  title:"Conquest Unbound",                          author:"Various",                series:"", num:0, type:"Anthology" },
  { id:"aos85",  title:"Grombrindal: Chronicles of the Wanderer",   author:"Various",                series:"", num:0, type:"Anthology" },

  // ── OMNIBUSES ─────────────────────────────────────────────────────────────
  { id:"aos86",  title:"Legends of the Age of Sigmar: Fyreslayers", author:"Various",                series:"", num:0, type:"Omnibus"   },
  { id:"aos87",  title:"Legends of the Age of Sigmar: Skaven Pestilens", author:"Various",           series:"", num:0, type:"Omnibus"   },
  { id:"aos88",  title:"Legends of the Age of Sigmar: Sylvaneth",   author:"Various",                series:"", num:0, type:"Omnibus"   },

  // ── OLD WORLD / WARHAMMER FANTASY ─────────────────────────────────────────
  // The Legend of Sigmar trilogy — Graham McNeill
  { id:"ow1",  title:"Heldenhammer",   author:"Graham McNeill", series:"The Legend of Sigmar", num:1, type:"Novel",    isbn:"9781844165384", desc:"Before he was a god, Sigmar was a warrior-king uniting the tribes of men. This is the origin of Age of Sigmar's patron deity, told in the war-torn ancient Old World." },
  { id:"ow2",  title:"Empire",         author:"Graham McNeill", series:"The Legend of Sigmar", num:2, type:"Novel",    isbn:"9781844166886" },
  { id:"ow3",  title:"God King",       author:"Graham McNeill", series:"The Legend of Sigmar", num:3, type:"Novel",    isbn:"9781844168996" },
  // Nagash trilogy — Mike Lee
  { id:"ow4",  title:"Nagash the Sorcerer",  author:"Mike Lee", series:"Nagash", num:1, type:"Novel", isbn:"9781844165568", desc:"The rise of Warhammer's most powerful undead sorcerer-king — from ambitious prince to immortal necromancer. The origin of the entity who will later reshape the Mortal Realms." },
  { id:"ow5",  title:"Nagash the Unbroken",  author:"Mike Lee", series:"Nagash", num:2, type:"Novel", isbn:"9781844167913" },
  { id:"ow6",  title:"Nagash Immortal",       author:"Mike Lee", series:"Nagash", num:3, type:"Novel", isbn:"9781849700351" },
  // Tyrion & Teclis trilogy — William King
  { id:"ow7",  title:"Blood of Aenarion", author:"William King", series:"Tyrion & Teclis", num:1, type:"Novel", isbn:"9781849700900", desc:"The twin brothers Tyrion and Teclis are revealed as heirs to the cursed bloodline of Aenarion — a tale of destiny, prophecy, and the deep history of the High Elves." },
  { id:"ow8",  title:"Sword of Caledor",  author:"William King", series:"Tyrion & Teclis", num:2, type:"Novel", isbn:"9781849702621" },
  { id:"ow9",  title:"Bane of Malekith",  author:"William King", series:"Tyrion & Teclis", num:3, type:"Novel", isbn:"9781849707664" },
  // Malus Darkblade — Dan Abnett & Mike Lee
  { id:"ow10", title:"The Daemon's Curse",    author:"Dan Abnett & Mike Lee", series:"Malus Darkblade", num:1, type:"Novel", isbn:"9781844161911", desc:"Malus Darkblade, a Dark Elf of exceptional brutality, makes a desperate deal with a daemon — and spends five novels trying to break free. Visceral, dark, and compelling." },
  { id:"ow11", title:"Bloodstorm",            author:"Dan Abnett & Mike Lee", series:"Malus Darkblade", num:2, type:"Novel", isbn:"9781844161928" },
  { id:"ow12", title:"Reaper of Souls",       author:"Dan Abnett & Mike Lee", series:"Malus Darkblade", num:3, type:"Novel", isbn:"9781844161935" },
  { id:"ow13", title:"Warpsword",             author:"Dan Abnett & Mike Lee", series:"Malus Darkblade", num:4, type:"Novel", isbn:"9781844161942" },
  { id:"ow14", title:"Lord of Ruin",          author:"Dan Abnett & Mike Lee", series:"Malus Darkblade", num:5, type:"Novel", isbn:"9781844161959" },
  // Von Carstein trilogy — Steven Savile
  { id:"ow15", title:"Inheritance",  author:"Steven Savile", series:"Von Carstein", num:1, type:"Novel", isbn:"9781844162918", desc:"Vlad von Carstein rises from obscurity to seize the throne of Sylvania — the origin story of Warhammer's most iconic vampire dynasty, declaring war on the Empire." },
  { id:"ow16", title:"Dominion",     author:"Steven Savile", series:"Von Carstein", num:2, type:"Novel", isbn:"9781844162925" },
  { id:"ow17", title:"Retribution",  author:"Steven Savile", series:"Von Carstein", num:3, type:"Novel", isbn:"9781844162932" },
  // Genevieve — Jack Yeovil (Kim Newman)
  { id:"ow18", title:"Drachenfels",         author:"Jack Yeovil", series:"Genevieve", num:1, type:"Novel",    isbn:"9781784968823", desc:"A famous actress and a reluctant vampire return to the haunted castle of the Great Enchanter — a gothic horror mystery introducing Genevieve Dieudonné, one of Warhammer's most beloved characters." },
  { id:"ow19", title:"Genevieve Undead",    author:"Jack Yeovil", series:"Genevieve", num:2, type:"Novel",    isbn:"9781784969820" },
  { id:"ow20", title:"Beasts in Velvet",    author:"Jack Yeovil", series:"Genevieve", num:3, type:"Novel",    isbn:"9781784968946" },
  { id:"ow21", title:"Silver Nails",        author:"Jack Yeovil", series:"Genevieve", num:4, type:"Anthology", isbn:"9781784969097" },

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
