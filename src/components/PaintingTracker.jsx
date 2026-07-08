// src/components/PaintingTracker.jsx
// ══════════════════════════════════════════════════════════════════════════
// WH40K Companion — Painting Tracker
// Features: Community Gallery, My Collection, Add/Edit modal,
//           Citadel paint picker, photo upload, AI color recommendations
// ══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { db, storage, supabase } from "../lib/supabase";
import { sb } from "../lib/sb";
import { achievementFromId, computePaintingAchievements, diffAchievements } from "../lib/achievements";
import { useLang } from "../lib/i18n.jsx";

// ─── THEME ────────────────────────────────────────────────────────────────

const C = {
  bg: "#0a0905", surface: "#111009", card: "#16140f", border: "#2a2518",
  gold: "#c9a84c", goldDim: "#7a6330", red: "#b03030",
  text: "#d4cbb8", muted: "#7a7060", dim: "#3a3428",
};

const C_AOS = {
  bg: "#06080f", surface: "#0a0f1c", card: "#0f1625", border: "#1c2840",
  gold: "#C9A227", goldDim: "#7a6015", red: "#b03030",
  text: "#d4cbb8", muted: "#6070a0", dim: "#162030",
};

const ThemeCtx = createContext(C);

// ─── STATUS CONFIG ────────────────────────────────────────────────────────

const STATUS = [
  { id: "owned",      icon: "📦", label: "Owned",      tkey: "owned",     color: "#4a4a4a" },
  { id: "assembled",  icon: "🔧", label: "Assembled",  tkey: "assembled", color: "#2a5a6a" },
  { id: "base_coat",  icon: "🎨", label: "Base Coat",  tkey: "baseCoat",  color: "#5a2a7a" },
  { id: "painted",    icon: "🖌️", label: "Painted",    tkey: "painted",   color: "#7a5a10" },
  { id: "completed",  icon: "✅", label: "Completed",  tkey: "completed", color: "#1a6a2a" },
];

const statusIndex = (s) => STATUS.findIndex((x) => x.id === s);

function parseStatuses(raw) {
  if (!raw) return ["owned"];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
  return [raw];
}

function highestStatus(raw) {
  const ids = parseStatuses(raw);
  return ids.reduce((best, id) => {
    const st = STATUS.find(s => s.id === id);
    if (!st) return best;
    return !best || statusIndex(id) > statusIndex(best.id) ? st : best;
  }, null) || STATUS[0];
}

// ─── CITADEL PAINTS DATABASE ──────────────────────────────────────────────

const CITADEL_PAINTS = [
  // Base
  { name:"Abaddon Black",         hex:"#111111", range:"Base" },
  { name:"Corax White",           hex:"#eeeeee", range:"Base" },
  { name:"Mephiston Red",         hex:"#9c1515", range:"Base" },
  { name:"Khorne Red",            hex:"#6e1a1a", range:"Base" },
  { name:"Macragge Blue",         hex:"#1a3d6b", range:"Base" },
  { name:"Kantor Blue",           hex:"#0e2a5a", range:"Base" },
  { name:"Caliban Green",         hex:"#0e4a1f", range:"Base" },
  { name:"Castellan Green",       hex:"#2a4a1a", range:"Base" },
  { name:"Death Guard Green",     hex:"#6b7a40", range:"Base" },
  { name:"Leadbelcher",           hex:"#787878", range:"Base" },
  { name:"Retributor Armour",     hex:"#c9a84c", range:"Base" },
  { name:"Balthasar Gold",        hex:"#8a6030", range:"Base" },
  { name:"Wraithbone",            hex:"#d4c5a0", range:"Base" },
  { name:"Zandri Dust",           hex:"#a89060", range:"Base" },
  { name:"XV-88",                 hex:"#9a7a30", range:"Base" },
  { name:"Steel Legion Drab",     hex:"#7a6040", range:"Base" },
  { name:"Bugman's Glow",         hex:"#8a4a38", range:"Base" },
  { name:"Rakarth Flesh",         hex:"#b09878", range:"Base" },
  { name:"Celestra Grey",         hex:"#8a9090", range:"Base" },
  { name:"Mechanicus Standard Grey",hex:"#4a5058",range:"Base" },
  { name:"Daemonette Hide",       hex:"#6a4a6a", range:"Base" },
  { name:"Incubi Darkness",       hex:"#0e3a38", range:"Base" },
  // Shade
  { name:"Nuln Oil",              hex:"#0a0a14", range:"Shade" },
  { name:"Agrax Earthshade",      hex:"#5a3a18", range:"Shade" },
  { name:"Reikland Fleshshade",   hex:"#7a3018", range:"Shade" },
  { name:"Carroburg Crimson",     hex:"#6e1a2a", range:"Shade" },
  { name:"Drakenhof Nightshade",  hex:"#1a2a5a", range:"Shade" },
  { name:"Biel-Tan Green",        hex:"#1a4a28", range:"Shade" },
  { name:"Seraphim Sepia",        hex:"#6a4a18", range:"Shade" },
  { name:"Druchii Violet",        hex:"#4a1a5a", range:"Shade" },
  { name:"Athonian Camoshade",    hex:"#3a4a18", range:"Shade" },
  { name:"Fuegan Orange",         hex:"#8a3a0a", range:"Shade" },
  // Layer
  { name:"Evil Sunz Scarlet",     hex:"#c03020", range:"Layer" },
  { name:"Wild Rider Red",        hex:"#e04020", range:"Layer" },
  { name:"Altdorf Guard Blue",    hex:"#1a4a8a", range:"Layer" },
  { name:"Calgar Blue",           hex:"#2a5a9a", range:"Layer" },
  { name:"Teclis Blue",           hex:"#3a6aaa", range:"Layer" },
  { name:"Skarsnik Green",        hex:"#3a8a30", range:"Layer" },
  { name:"Warpstone Glow",        hex:"#2a8a20", range:"Layer" },
  { name:"Yriel Yellow",          hex:"#e0b820", range:"Layer" },
  { name:"Flash Gitz Yellow",     hex:"#f0d030", range:"Layer" },
  { name:"Ushabti Bone",          hex:"#c0a870", range:"Layer" },
  { name:"Screaming Skull",       hex:"#d0c090", range:"Layer" },
  { name:"Runefang Steel",        hex:"#b8b8b8", range:"Layer" },
  { name:"Ironbreaker",           hex:"#909090", range:"Layer" },
  { name:"Auric Armour Gold",     hex:"#d0a840", range:"Layer" },
  { name:"Gehenna's Gold",        hex:"#c09030", range:"Layer" },
  { name:"Cadian Fleshtone",      hex:"#c07858", range:"Layer" },
  { name:"Kislev Flesh",          hex:"#d09070", range:"Layer" },
  { name:"Lugganath Orange",      hex:"#d07050", range:"Layer" },
  // Dry
  { name:"Necron Compound",       hex:"#c0c0c0", range:"Dry" },
  { name:"Praxeti White",         hex:"#e8e8e8", range:"Dry" },
  { name:"Longbeard Grey",        hex:"#a0a8a8", range:"Dry" },
  { name:"Ryza Rust",             hex:"#b05020", range:"Dry" },
  { name:"Terminatus Stone",      hex:"#b8a880", range:"Dry" },
  // Contrast
  { name:"Black Templar",         hex:"#1a1a2a", range:"Contrast" },
  { name:"Blood Angels Red",      hex:"#c02020", range:"Contrast" },
  { name:"Ultramarines Blue",     hex:"#1a3a7a", range:"Contrast" },
  { name:"Militarum Green",       hex:"#3a5a28", range:"Contrast" },
  { name:"Skeleton Horde",        hex:"#c8a860", range:"Contrast" },
  { name:"Plaguebearer Flesh",    hex:"#8a9a40", range:"Contrast" },
  { name:"Gore-grunta Fur",       hex:"#6a3a18", range:"Contrast" },
  { name:"Basilicanum Grey",      hex:"#505060", range:"Contrast" },
  { name:"Space Wolves Grey",     hex:"#6a7a88", range:"Contrast" },
  { name:"Snakebite Leather",     hex:"#8a5a20", range:"Contrast" },
  { name:"Guilliman Flesh",       hex:"#b87060", range:"Contrast" },
  { name:"Magos Purple",          hex:"#5a2a6a", range:"Contrast" },
  { name:"Talassar Blue",         hex:"#1a5a7a", range:"Contrast" },
  { name:"Cygor Brown",           hex:"#5a3a1a", range:"Contrast" },
  // Technical
  { name:"Agrellan Earth",        hex:"#8a6040", range:"Technical" },
  { name:"Typhus Corrosion",      hex:"#3a3828", range:"Technical" },
  { name:"Nihilakh Oxide",        hex:"#409080", range:"Technical" },
  { name:"Blood for the Blood God",hex:"#8a1010",range:"Technical" },
  { name:"Waystone Green",        hex:"#408040", range:"Technical" },
  { name:"Hexwraith Flame",       hex:"#40a040", range:"Technical" },
];

const USAGE_TYPES  = ["base","layer","shade","highlight","drybrush","technical","contrast"];

// ─── AK INTERACTIVE PAINTS ────────────────────────────────────────────────
const AK_PAINTS = [
  { name:"AK White",            hex:"#F0EDE8", range:"Base",      brand:"AK Interactive" },
  { name:"AK Ivory",            hex:"#E8D8A8", range:"Base",      brand:"AK Interactive" },
  { name:"AK Sand",             hex:"#C8A860", range:"Base",      brand:"AK Interactive" },
  { name:"AK Ochre",            hex:"#C09030", range:"Base",      brand:"AK Interactive" },
  { name:"AK Dark Yellow",      hex:"#9A7820", range:"Base",      brand:"AK Interactive" },
  { name:"AK Leather Brown",    hex:"#784830", range:"Base",      brand:"AK Interactive" },
  { name:"AK Flat Red",         hex:"#A01818", range:"Base",      brand:"AK Interactive" },
  { name:"AK Dark Red",         hex:"#6A0E0E", range:"Base",      brand:"AK Interactive" },
  { name:"AK Flat Blue",        hex:"#1A3A7A", range:"Base",      brand:"AK Interactive" },
  { name:"AK Medium Blue",      hex:"#2A5A9A", range:"Base",      brand:"AK Interactive" },
  { name:"AK Dark Green",       hex:"#1A4A1A", range:"Base",      brand:"AK Interactive" },
  { name:"AK Olive Drab",       hex:"#5A6A2A", range:"Base",      brand:"AK Interactive" },
  { name:"AK Field Grey",       hex:"#5A6050", range:"Base",      brand:"AK Interactive" },
  { name:"AK German Grey",      hex:"#3A3828", range:"Base",      brand:"AK Interactive" },
  { name:"AK Flat Black",       hex:"#141414", range:"Base",      brand:"AK Interactive" },
  { name:"AK Bone",             hex:"#D4C090", range:"Base",      brand:"AK Interactive" },
  { name:"AK Purple",           hex:"#5A1A7A", range:"Base",      brand:"AK Interactive" },
  { name:"AK Orange",           hex:"#C06020", range:"Base",      brand:"AK Interactive" },
  { name:"AK Silver",           hex:"#B8B8B8", range:"Metallic",  brand:"AK Interactive" },
  { name:"AK Gold",             hex:"#C8A040", range:"Metallic",  brand:"AK Interactive" },
  { name:"AK Gunmetal",         hex:"#5A5A68", range:"Metallic",  brand:"AK Interactive" },
  { name:"AK Bronze",           hex:"#8A6030", range:"Metallic",  brand:"AK Interactive" },
  { name:"AK Rust",             hex:"#8A3A10", range:"Effects",   brand:"AK Interactive" },
  { name:"AK Dark Wash",        hex:"#0A0A14", range:"Wash",      brand:"AK Interactive" },
  { name:"AK Brown Wash",       hex:"#5A3A18", range:"Wash",      brand:"AK Interactive" },
  { name:"AK Sepia Wash",       hex:"#6A4A18", range:"Wash",      brand:"AK Interactive" },
  { name:"AK Green Wash",       hex:"#1A3A18", range:"Wash",      brand:"AK Interactive" },
  { name:"AK Blue Wash",        hex:"#1A1A4A", range:"Wash",      brand:"AK Interactive" },
];

// ─── ARMY PAINTER PAINTS ──────────────────────────────────────────────────
const AP_PAINTS = [
  { name:"AP Matt White",         hex:"#F5F5F0", range:"Base",       brand:"Army Painter" },
  { name:"AP Skeleton Bone",      hex:"#D4C090", range:"Base",       brand:"Army Painter" },
  { name:"AP Uniform Grey",       hex:"#6A7078", range:"Base",       brand:"Army Painter" },
  { name:"AP Matt Black",         hex:"#181818", range:"Base",       brand:"Army Painter" },
  { name:"AP Pure Red",           hex:"#D02020", range:"Base",       brand:"Army Painter" },
  { name:"AP Dragon Red",         hex:"#AA1A1A", range:"Base",       brand:"Army Painter" },
  { name:"AP Daemonic Yellow",    hex:"#E8C020", range:"Base",       brand:"Army Painter" },
  { name:"AP Crystal Blue",       hex:"#2A6AAA", range:"Base",       brand:"Army Painter" },
  { name:"AP Goblin Green",       hex:"#2A7A1A", range:"Base",       brand:"Army Painter" },
  { name:"AP Barbarian Flesh",    hex:"#D07858", range:"Base",       brand:"Army Painter" },
  { name:"AP Leather Brown",      hex:"#7A4A28", range:"Base",       brand:"Army Painter" },
  { name:"AP Oak Brown",          hex:"#5A3A18", range:"Base",       brand:"Army Painter" },
  { name:"AP Desert Yellow",      hex:"#C8A060", range:"Base",       brand:"Army Painter" },
  { name:"AP Necrotic Flesh",     hex:"#A8B870", range:"Base",       brand:"Army Painter" },
  { name:"AP Alien Purple",       hex:"#6A2A8A", range:"Base",       brand:"Army Painter" },
  { name:"AP Ash Grey",           hex:"#9A9A9A", range:"Base",       brand:"Army Painter" },
  { name:"AP Orange Fire",        hex:"#C85820", range:"Base",       brand:"Army Painter" },
  { name:"AP Ice Blue",           hex:"#7AA8C8", range:"Layer",      brand:"Army Painter" },
  { name:"AP Bright Gold",        hex:"#D0B050", range:"Metallic",   brand:"Army Painter" },
  { name:"AP Gunmetal",           hex:"#606878", range:"Metallic",   brand:"Army Painter" },
  { name:"AP Shining Silver",     hex:"#C0C4C8", range:"Metallic",   brand:"Army Painter" },
  { name:"AP Weapon Bronze",      hex:"#9A7040", range:"Metallic",   brand:"Army Painter" },
  { name:"AP Dark Tone",          hex:"#0A0A14", range:"Quickshade", brand:"Army Painter" },
  { name:"AP Soft Tone",          hex:"#5A3A18", range:"Quickshade", brand:"Army Painter" },
  { name:"AP Strong Tone",        hex:"#3A2010", range:"Quickshade", brand:"Army Painter" },
  { name:"AP Red Tone",           hex:"#6A1010", range:"Quickshade", brand:"Army Painter" },
  { name:"AP Green Tone",         hex:"#1A3A1A", range:"Quickshade", brand:"Army Painter" },
  { name:"AP Blue Tone",          hex:"#1A1A4A", range:"Quickshade", brand:"Army Painter" },
  { name:"AP Dry Rust Brown",     hex:"#8A4A20", range:"Dry",        brand:"Army Painter" },
  { name:"AP Dry Ash Grey",       hex:"#A8A8A8", range:"Dry",        brand:"Army Painter" },
];

const ALL_PAINTS = [
  ...CITADEL_PAINTS.map(p => ({ ...p, brand:"Citadel" })),
  ...AK_PAINTS,
  ...AP_PAINTS,
];
const BRANDS = ["Citadel", "AK Interactive", "Army Painter"];

// Max photos stored per miniature. The AI advisor analyses up to AI_PHOTO_LIMIT
// of them (see api/paint-advisor.js) — extra shots are kept for the gallery.
const MAX_PHOTOS = 12;

// Downscale + re-encode a photo before upload. Phone photos are often 4–8 MB,
// which blows Anthropic's per-image limit (~5 MB) when the advisor sends them,
// giving "Request exceeds the maximum size". Capping the long edge at 1568 px
// (what Claude downscales to anyway) as JPEG keeps each photo well under a MB.
async function downscaleImage(file, maxEdge = 1568, quality = 0.82) {
  if (!file || !file.type?.startsWith("image/")) return file;
  try {
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result); fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = rej;
      im.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    // Already small enough — keep the original bytes.
    if (scale === 1 && file.size < 1_400_000) return file;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // on any failure, fall back to the original file
  }
}

// ─── FACTIONS & UNITS ─────────────────────────────────────────────────────

const FACTIONS_40K = {
  "Space Marines":        ["Intercessors","Hellblasters","Aggressors","Terminators","Assault Marines","Devastators","Chaplain","Librarian","Captain","Ancient","Redemptor Dreadnought","Vanguard Veterans","Eradicators","Land Speeder","Tactical Squad","Assault Intercessors","Heavy Intercessors","Infiltrators","Incursors","Reivers","Scouts","Inceptors","Suppressors","Bladeguard Veterans","Sternguard Veterans","Terminator Assault Squad","Outriders","Lieutenant","Apothecary","Techmarine","Dreadnought","Rhino","Razorback","Impulsor","Repulsor","Predator","Land Raider","Roboute Guilliman","Marneus Calgar"],
  "Blood Angels":         ["Death Company","Sanguinary Guard","Sanguinary Priest","Mephiston","Dante","Lemartes","Intercessors","Assault Intercessors","Death Company Dreadnought","Sanguinary Ancient","Furioso Dreadnought","Terminators","Captain","Librarian","Chaplain","Astorath","The Sanguinor"],
  "Dark Angels":          ["Deathwing Terminators","Ravenwing Black Knights","Interrogator-Chaplain","Azrael","Belial","Intercessors","Deathwing Knights","Inner Circle Companions","Ravenwing Bikers","Company Master","Librarian","Sammael","Asmodai"],
  "Space Wolves":         ["Blood Claws","Grey Hunters","Long Fangs","Wolf Guard","Thunderwolf Cavalry","Bjorn","Wolf Guard Terminators","Wulfen","Fenrisian Wolves","Intercessors","Wolf Lord","Rune Priest","Wolf Priest","Njal Stormcaller","Ragnar Blackmane","Logan Grimnar"],
  "Black Templars":       ["Crusader Squad","Emperor's Champion","Grimaldus","Primaris Crusader Squad","Assault Intercessors","Sword Brethren","Terminators","Marshal","Castellan","High Marshal Helbrecht"],
  "Chaos Space Marines":  ["Chaos Warriors","Terminators","Obliterators","Havocs","Daemon Prince","Chaos Lord","Legionaries","Cultists","Chosen","Possessed","Raptors","Warp Talons","Bikers","Chaos Rhino","Chaos Predator","Helbrute","Forgefiend","Maulerfiend","Master of Executions","Dark Apostle","Sorcerer","Warpsmith","Abaddon the Despoiler"],
  "Death Guard":          ["Plague Marines","Blightlord Terminators","Mortarion","Daemon Prince of Nurgle","Foetid Bloat-drone","Poxwalkers","Cultists","Deathshroud Terminators","Myphitic Blight-hauler","Plagueburst Crawler","Lord of Contagion","Malignant Plaguecaster","Biologus Putrifier","Noxious Blightbringer","Typhus"],
  "Thousand Sons":        ["Rubric Marines","Scarab Occult Terminators","Magnus the Red","Ahriman","Tzaangors","Tzaangor Enlightened","Chaos Cultists","Exalted Sorcerer","Infernal Master","Mutalith Vortex Beast","Defiler"],
  "World Eaters":         ["Berzerkers","Jakhals","Angron","Eightbound","Exalted Eightbound","Chaos Terminators","Khorne Rhino","Master of Executions","Lord Invocatus","Kharn the Betrayer"],
  "Emperor's Children":   ["Noise Marines","Fulgrim","Lucius the Eternal","Infractors","Flawless Blades","Tormentors","Chaos Terminators","Lord Exultant","Lord Kakophonist"],
  "Night Lords":          ["Chaos Space Marines","Raptors","Konrad Curze","Legionaries","Warp Talons","Chaos Terminators","Chaos Lord","Sorcerer"],
  "Iron Warriors":        ["Obliterators","Warsmith","Perturabo","Legionaries","Havocs","Chaos Terminators","Warpsmith"],
  "Astra Militarum":      ["Infantry Squad","Veterans","Rough Riders","Leman Russ","Commissar","Sentinel","Cadian Shock Troops","Death Korps of Krieg","Catachan Jungle Fighters","Tempestus Scions","Ratlings","Ogryns","Bullgryns","Chimera","Hellhound","Basilisk","Rogal Dorn Battle Tank","Tank Commander","Lord Solar Leontus","Ursula Creed"],
  "Adeptus Mechanicus":   ["Skitarii Rangers","Skitarii Vanguard","Kataphron","Onager Dunecrawler","Tech-Priest","Sicarian Infiltrators","Sicarian Ruststalkers","Serberys Raiders","Serberys Sulphurhounds","Pteraxii Skystalkers","Skorpius Disintegrator","Ironstrider Ballistarii","Kastelan Robots","Tech-Priest Dominus","Tech-Priest Manipulus","Skitarii Marshal","Belisarius Cawl"],
  "Adepta Sororitas":     ["Battle Sisters","Celestians","Retributors","Penitent Engine","Cannoness","Repentia","Dominions","Seraphim","Zephyrim","Arco-flagellants","Sisters Novitiate","Mortifiers","Exorcist","Immolator","Palatine","Dialogus","Hospitaller","Junith Eruita","Morvenn Vahl","Saint Celestine","Triumph of Saint Katherine"],
  "Grey Knights":         ["Strike Squad","Terminators","Nemesis Dreadknight","Grand Master","Interceptor Squad","Purifiers","Purgation Squad","Paladins","Brotherhood Chaplain","Brotherhood Librarian","Grand Master Voldus","Kaldor Draigo","Castellan Crowe"],
  "Necrons":              ["Necron Warriors","Immortals","Lychguard","Triarch Praetorians","Overlord","C'tan","Deathmarks","Flayed Ones","Skorpekh Destroyers","Lokhust Destroyers","Canoptek Scarabs","Canoptek Wraiths","Canoptek Doomstalker","Tomb Blades","Doomsday Ark","Ghost Ark","Monolith","Lord","Royal Warden","Plasmancer","Technomancer","Cryptek","Szarekh","Imotekh the Stormlord","Illuminor Szeras","Orikan the Diviner"],
  "Tyranids":             ["Hormagaunts","Termagants","Genestealers","Warriors","Hive Tyrant","Carnifex","Trygon","Gargoyles","Tyranid Warriors with Ranged Bio-Weapons","Von Ryan's Leapers","Tyrant Guard","Zoanthropes","Lictors","Ripper Swarms","Hive Guard","Biovores","Raveners","Screamer-Killer","Maleceptor","Haruspex","Tyrannofex","Mawloc","The Swarmlord","Broodlord","Neurotyrant","Norn Emissary","Norn Assimilator"],
  "Orks":                 ["Boyz","Nobz","Mega Nobz","Warboss","Deff Dread","Gretchin","Flash Gitz","Bannernob","Bigboss","Painboy","Weirdboy","Wartrakk","Big Mek Dakkarig","Beast Snagga Boyz","Kommandos","Stormboyz","Tankbustas","Lootas","Burna Boyz","Warbikers","Deffkoptas","Squighog Boyz","Killa Kans","Morkanaut","Gorkanaut","Battlewagon","Trukk","Big Mek","Wurrboy","Ghazghkull Thraka","Makari","Mozrog Skragbad","Zodgrod Wortsnagga"],
  "T'au Empire":          ["Fire Warriors","Pathfinders","Crisis Battlesuit","Riptide","Commander","Ghostkeel","Breacher Team","Kroot Carnivores","Kroot Hounds","Krootox Riders","Stealth Battlesuits","Crisis Fireknife","Crisis Starscythe","Broadside Battlesuits","Hammerhead Gunship","Devilfish","Sky Ray","Piranha","Commander Farsight","Commander Shadowsun","Ethereal","Cadre Fireblade","Darkstrider"],
  "Aeldari":              ["Guardians","Dire Avengers","Howling Banshees","Wraithguard","Avatar of Khaine","Farseer","Storm Guardians","Rangers","Striking Scorpions","Fire Dragons","Swooping Hawks","Warp Spiders","Dark Reapers","Shining Spears","Windriders","Wraithblades","War Walkers","Wraithlord","Falcon","Wave Serpent","Fire Prism","Warlock","Autarch","Spiritseer","Eldrad Ulthran","Jain Zar","Yvraine","The Visarch"],
  "Drukhari":             ["Kabalite Warriors","Wyches","Incubi","Grotesques","Archon","Wracks","Mandrakes","Hellions","Reavers","Scourges","Raider","Venom","Ravager","Talos","Cronos","Succubus","Haemonculus","Drazhar","Lelith Hesperax","Urien Rakarth"],
  "Custodes":             ["Custodian Guard","Allarus Custodians","Vertus Praetors","Shield-Captain","Custodian Wardens","Aquilon Custodians","Prosecutors","Vigilators","Witchseekers","Venerable Contemptor Dreadnought","Caladius Grav-tank","Blade Champion","Trajann Valoris","Valerian","Aleya"],
  "Leagues of Votann":    ["Hearthkyn Warriors","Hearthguard","Sagitaur","Einhyr Champion","Cthonian Beserks","Einhyr Hearthguard","Brokhyr Thunderkyn","Hekaton Land Fortress","Brokhyr Iron-master","Kahl","Grimnyr","Uthar the Destined"],
  "Genestealer Cults":    ["Neophyte Hybrids","Acolyte Hybrids","Aberrants","Patriarch","Hybrid Metamorphs","Purestrain Genestealers","Atalan Jackals","Achilles Ridgerunner","Goliath Truck","Goliath Rockgrinder","Magus","Primus","Jackal Alphus","Kelermorph","Locus","Nexos","Sanctus","Biophagus"],
};

const FACTIONS_AOS = {
  // ── Order ──────────────────────────────────────────────────────────────
  "Stormcast Eternals":    ["Liberators","Judicators","Sequitors","Evocators","Paladins","Praetors","Knight-Incantor","Lord-Arcanum","Yndrasta","Celestant-Prime","Vandus Hammerhand","Vindictors","Vanquishers","Vigilors","Castigators","Annihilators","Reclusians","Prosecutors","Dracothian Guard","Stormstrike Chariot","Knight-Vexillor","Knight-Judicator","Knight-Questor","Lord-Celestant","Lord-Relictor","Lord-Veritant","Lord-Imperatant","Neave Blacktalon"],
  "Cities of Sigmar":      ["Freeguild Guard","Freeguild Steelhelms","Irondrakes","Darkshards","Freeguild Cavaliers","Cogsmith","Tahlia Vedra","Freeguild Fusiliers","Freeguild Command Corps","Ironbreakers","Longbeards","Black Guard","Phoenix Guard","Wildwood Rangers","Dark Riders","Drakespawn Knights","Ironweld Great Cannon","Battlemage","Freeguild Marshal","Callis and Toll"],
  "Sylvaneth":             ["Dryads","Tree-Revenants","Spite-Revenants","Kurnoth Hunters","Arch-Revenant","Drycha Hamadreth","Alarielle the Everqueen","Spirit of Durthu","Treelord","Treelord Ancient","Branchwych","Branchwraith","Ylthari's Guardians"],
  "Fyreslayers":           ["Vulkite Berzerkers","Hearthguard Berzerkers","Auric Runemaster","Auric Runesmiter","Doomseeker","Magmadroth","Runesons","Auric Hearthguard","Auric Runefather","Auric Runeson on Magmadroth","Grimwrath Berzerker","Battlesmith","Fjul-Grimnir"],
  "Kharadron Overlords":   ["Arkanaut Company","Grundstok Thunderers","Grundstok Gunhauler","Arkanaut Frigate","Ironclad","Endrinmaster","Aether-Khemist","Skywardens","Endrinriggers","Endrinmaster with Dirigible Suit","Aetheric Navigator","Brokk Grungsson"],
  "Seraphon":              ["Saurus Warriors","Saurus Knights","Saurus Guard","Skinks","Kroxigor","Terradon Riders","Slann Starmaster","Lord Kroak","Engine of the Gods","Skink Starseer","Skink Starpriest","Ripperdactyl Riders","Bastiladon","Stegadon","Salamander Hunting Pack","Saurus Oldblood","Saurus Astrolith Bearer"],
  "Lumineth Realm-lords":  ["Vanari Auralan Wardens","Vanari Dawnriders","Vanari Bladelords","Alarith Stoneguard","Alarith Spirit of the Mountain","Teclis","Tyrion","Vanari Auralan Sentinels","Alarith Stonemage","Vanari Starshard Ballistas","Scinari Cathallar","Scinari Calligrave","Scinari Loreseeker","Vanari Lord Regent","Light of Eltharion","Avalenor","Myari's Purifiers"],
  "Daughters of Khaine":   ["Witch Aelves","Blood Sisters","Blood Stalkers","Melusai Ironscale","Hag Queen","Morathi-Khaine","The Shadow Queen","Sisters of Slaughter","Khinerai Heartrenders","Khinerai Lifetakers","Slaughter Queen","Bloodwrack Medusa","Avatar of Khaine","High Gladiatrix"],
  "Idoneth Deepkin":       ["Namarti Thralls","Namarti Reavers","Akhelian Guard","Akhelian Allopex","Akhelian Leviadon","Volturnos","Isharann Soulscryer","Isharann Tidecaster","Isharann Soulrender","Akhelian King","Lotann","Eidolon of Mathlann"],
  // ── Chaos ──────────────────────────────────────────────────────────────
  "Slaves to Darkness":    ["Chaos Warriors","Chaos Knights","Chaos Marauders","Varanguard","Darkoath Marauders","Eternus","Chaos Lord","Daemon Prince","Chaos Chosen","Chaos Chariot","Gorebeast Chariot","Darkoath Fellriders","Ogroid Theridons","Chaos Warshrine","Chaos Lord on Karkadrak","Chaos Sorcerer Lord","Darkoath Warqueen","Be'lakor","Archaon the Everchosen"],
  "Blades of Khorne":      ["Bloodreavers","Blood Warriors","Bloodletters","Mighty Skullcrushers","Skullreapers","Skarbrand","Slaughterpriest","Exalted Greater Daemon","Flesh Hounds","Wrathmongers","Bloodcrushers","Khorgoraths","Bloodthirster","Bloodsecrator","Bloodstoker","Lord of Khorne on Juggernaut","Karanak","Valkia the Bloody","Skulltaker"],
  "Disciples of Tzeentch": ["Tzaangors","Tzaangor Enlightened","Pink Horrors","Blue Horrors","Flamers","Screamers","Kairos Fateweaver","Lord of Change","Gaunt Summoner","Kairic Acolytes","Tzaangor Skyfires","Brimstone Horrors","Exalted Flamers","Burning Chariot","Tzaangor Shaman","Magister","Fatemaster","Curseling","The Changeling"],
  "Maggotkin of Nurgle":   ["Plaguebearers","Putrid Blightkings","Nurglings","Sloppity Bilepiper","Spoilpox Scrivener","Rotigus","Glottkin","Great Unclean One","Plague Drones","Beasts of Nurgle","Pusgoyle Blightlords","Poxbringer","Lord of Afflictions","Lord of Blights","Rotbringer Sorcerer","Horticulous Slimux","Epidemius"],
  "Hedonites of Slaanesh": ["Blissbarb Archers","Myrmidesh Painbringers","Slaangor Fiendbloods","Symbaresh Twinsouls","Keeper of Secrets","Sigvald","Glutos Orscollion","Blissbarb Seekers","Daemonettes","Seekers","Fiends","Hellstriders","Seeker Chariot","Shalaxi Helbane","Syll'Esske","The Contorted Epitome","The Masque"],
  "Skaven":                ["Clanrats","Stormvermin","Plague Monks","Rat Ogors","Warplock Jezzails","Hell Pit Abomination","Grey Seer","Thanquol & Boneripper","Skryre Acolytes","Night Runners","Gutter Runners","Giant Rats","Ratling Gun","Warp Lightning Cannon","Doomwheel","Warp-Grinder","Warlock Engineer","Plague Priest","Clawlord","Verminlord Warbringer","Lord Skreech Verminking"],
  "Beasts of Chaos":       ["Gors","Ungors","Bestigors","Bullgors","Centigors","Doombull","Ghorgon","Jabberslythe","Ungor Raiders","Tuskgor Chariot","Chaos Warhounds","Dragon Ogors","Cygor","Great Bray-Shaman","Beastlord","Cockatrice"],
  // ── Death ──────────────────────────────────────────────────────────────
  "Nighthaunt":            ["Chainrasps","Grimghast Reapers","Bladegheist Revenants","Hexwraiths","Dreadblade Harrows","Knight of Shrouds","Lady Olynder","Kurdoss Valentian","Glaivewraith Stalkers","Dreadscythe Harridans","Spirit Hosts","Myrmourn Banshees","Chainghasts","Black Coach","Guardian of Souls","Spirit Torment","Lord Executioner","Krulghast Cruciator","Reikenor the Grimhailer"],
  "Ossiarch Bonereapers":  ["Mortek Guard","Kavalos Deathriders","Gothizzar Harvester","Morghast Archai","Morghast Harbingers","Katakros","Nagash","Necropolis Stalkers","Immortis Guard","Mortek Crawler","Liege-Kavalos","Mortisan Boneshaper","Mortisan Soulmason","Mortisan Soulreaper","Arch-Kavalos Zandtos"],
  "Flesh-eater Courts":    ["Crypt Ghouls","Crypt Flayers","Crypt Horrors","Varghulf Courtier","Abhorrant Archregent","Abhorrant Ghoul King","Ushoran","Cryptguard","Morbheg Knights","Crypt Ghast Courtier","Crypt Haunter Courtier","Royal Terrorgheist","Royal Zombie Dragon","Grand Justice Gormayne"],
  "Soulblight Gravelords": ["Deadwalker Zombies","Deathrattle Skeletons","Black Knights","Blood Knights","Fell Bats","Mannfred von Carstein","Lauka Vai","Radukar the Beast","Grave Guard","Dire Wolves","Vargheists","Vengorian Lord","Zombie Dragon","Terrorgheist","Corpse Cart","Necromancer","Vampire Lord","Wight King","Belladamma Volga","Neferata","Prince Vhordrai"],
  // ── Destruction ────────────────────────────────────────────────────────
  "Orruk Warclans":        ["Ardboyz","Brutes","Gore-gruntas","Savage Orruks","Weirdnob Shaman","Megaboss on Maw-krusha","Gordrakk","Gutrippaz","Killaboss","Hobgrot Slittaz","Man-skewer Boltboyz","Savage Orruk Arrowboys","Savage Big Stabbas","Wardokk","Megaboss","Swampcalla Shaman","Killaboss on Great Gnashtoof","Breaka-boss on Mirebrute Troggoth"],
  "Gloomspite Gitz":       ["Stabbas","Shootas","Boingrot Bounderz","Squig Herd","Squig Hoppers","Rockgut Troggoths","Dankhold Troggoth","Loonboss","Skragrott","Loonsmasha Fanatics","Sporesplatta Fanatics","Sneaky Snufflers","Mangler Squigs","Colossal Squig","Fellwater Troggoths","Dankhold Troggboss","Troggoth Hag","Squig Gobba","Spider Riders","Aleguzzler Gargant","Loonboss on Mangler Squigs","Loonboss on Giant Cave Squig","Fungoid Cave-Shaman","Madcap Shaman","Webspinner Shaman on Arachnarok Spider","Zarbag","Zarbag's Gitz"],
  "Ogor Mawtribes":        ["Gluttons","Ironguts","Leadbelchers","Mournfang Pack","Stonehorn","Thundertusk","Frostlord","Butcher","Gnoblars","Ogor Gorgers","Yhetees","Sabretusks","Ironblaster","Gnoblar Scraplauncher","Frostlord on Stonehorn","Frostlord on Thundertusk","Huskard on Stonehorn","Tyrant","Firebelly","Slaughtermaster","Kragnos"],
  "Sons of Behemat":       ["Mancrusher Gargants","Warstomper Megagargant","Gatebreaker Megagargant","Kraken-eater Megagargant","Beast-smasher Megagargant","Bonegrinder Megagargant"],
  "Kruleboyz":             ["Gutrippaz","Hobgrot Slittaz","Man-skewer Boltboyz","Murknob with Belcha-banna","Swampcalla Shaman","Killaboss on Corpse-rippa Vulcha","Beast-skewer Killbow","Marshcrawla Sloggoth","Snatchaboss on Sludgeraker Beast","Killaboss on Great Gnashtoof","Gobsprakk"],
};

// ─── AI RECOMMENDATIONS ───────────────────────────────────────────────────

async function getAiRecommendations(faction, unit, universe, photoUrls, _miniName, preferredColors, preferredTheme) {
  const game = universe === 'aos' ? 'Warhammer Age of Sigmar' : 'Warhammer 40,000';
  const hasPhotos = Array.isArray(photoUrls) && photoUrls.length > 0;

  // System prompt: role + output schema — kept separate so visual attention isn't split.
  // Colours are described conceptually (name + hex), not tied to a specific brand/product —
  // brand paint names are too easy for the model to invent convincingly. The painter matches
  // the described colour to whatever real paint they own (the app's own reference search
  // link helps them see what that colour looks like on a model).
  const systemPrompt = `You are an expert ${game} miniature painter and hobby coach.
Always reply ONLY with valid JSON — no markdown, no extra text:
{
  "miniature": "short description of the model(s)",
  "schemes": [
    {
      "name": "scheme name",
      "difficulty": "Beginner|Intermediate|Advanced",
      "style": "one-sentence visual description",
      "techniques": ["technique1","technique2","technique3"],
      "tip": "one key tip specific to this model",
      "parts": [
        {
          "part": "component name",
          "steps": [
            {"type":"base|shade|layer|highlight|drybrush|contrast","color":"descriptive colour name, e.g. 'deep royal blue'","hex":"#hexcode accurately matching the described colour","note":"short tip"}
          ]
        }
      ]
    }
  ]
}
Constraints: 2-3 schemes · max 6 parts · max 4 steps per part · describe colours generically (never name a specific paint brand or product) · the hex must be a faithful approximation of the described colour.`;

  // The user-facing question. Photos are passed as URLs and fetched/encoded
  // server-side by the proxy, so the request body stays small.
  let userText;
  if (hasPhotos) {
    userText = `Identify the ${game} miniature shown in these photos. The model is most likely unpainted or primed a single flat colour (often grey, black or white), so there is little colour contrast — rely on shape, silhouette and shadow, not colour, to read it, and combine all provided photos as different angles of the SAME model.

Before suggesting anything, look carefully and note the model's actual observed state: its pose, whether any mouth/jaw is open or closed, and roughly how many distinct components you can see. List every distinct physical component you can actually see — describe each part as what it really is: distinguish organic/natural forms (fungi, mushrooms, fur, hide, bone, claws, teeth, tentacles, plants) from mechanical weapons, armour and gear, and do NOT force an ambiguous shape into a generic weapon. Only include a component if you can actually point to it in at least one photo; if a detail is genuinely unclear, prefer a cautious, generic part name over a confident wrong guess — never invent parts that aren't visible.${faction ? ` This model belongs to the ${faction} faction — use its characteristic anatomy and iconography ONLY to correctly name and colour the parts you can actually see. Do NOT add faction-typical features (e.g. ears, horns, tails, wings, banners, tusks) unless they are clearly visible in the photos — never list a part just because models of this faction usually have it.` : ""} Then suggest 2-3 colour schemes — one part per visible component, using only the allowed paint brands.`;
  } else {
    const unitDesc = [unit, faction && `(${faction})`].filter(Boolean).join(" ");
    userText = `Suggest 2-3 colour schemes for a ${game} ${unitDesc} miniature. Cover all typical components for this unit.`;
  }

  // Optional: the painter wants to build the scheme around specific colours.
  const colors = (preferredColors || "").trim();
  if (colors) {
    userText += ` IMPORTANT: the painter wants to use primarily these colours: ${colors}. Build every scheme around this palette — make these the dominant colours and pick only harmonising or accent shades alongside them. Choose real paints from the allowed brands that match these colours as closely as possible.`;
  }

  // Optional: the painter wants a thematic/atmospheric direction (e.g. "winter",
  // "corrupted Nurgle", "undead", "autumn", "desert", "volcanic").
  const theme = (preferredTheme || "").trim();
  if (theme) {
    userText += ` IMPORTANT: build every scheme around this theme / atmosphere: ${theme}. Let it drive the whole palette, weathering and basing so the model reads as "${theme}", while still using only real paints from the allowed brands.`;
  }

  // Authenticate with the serverless proxy using the Supabase access token.
  // The proxy holds the Anthropic key server-side and enforces the daily limit.
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("NO_SESSION");

  const resp = await fetch("/api/paint-advisor", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: hasPhotos ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
      system: systemPrompt,
      userText,
      photoUrls: hasPhotos ? photoUrls : [],
    }),
  });
  if (resp.status === 429) throw new Error("DAILY_LIMIT");
  if (resp.status === 413) throw new Error("IMAGE_TOO_LARGE");
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err?.error || `HTTP ${resp.status}`;
    if (/maximum size|too large|request too large/i.test(msg)) throw new Error("IMAGE_TOO_LARGE");
    throw new Error(msg);
  }
  const data = await resp.json();
  const text = data.content?.map((i) => i.text || "").join("") ?? "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── SUB-COMPONENTS ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── STATUS STEPPER ───────────────────────────────────────────────────────

function StatusStepper({ value, onChange }) {
  const C = useContext(ThemeCtx);
  const { t } = useLang();
  const active = parseStatuses(value);

  const toggle = (id) => {
    if (id === 'completed') {
      onChange(JSON.stringify(active.includes('completed') ? [] : ['completed']));
      return;
    }
    const without = active.filter(s => s !== 'completed' && s !== id);
    onChange(JSON.stringify(active.includes(id) ? without : [...without, id]));
  };

  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {STATUS.map((s) => {
        const on = active.includes(s.id);
        return (
          <button key={s.id} onClick={() => toggle(s.id)}
            style={{
              flex: "1 1 auto", padding: "8px 4px", borderRadius: 8,
              border: `1px solid ${on ? s.color : C.border}`,
              background: on ? `${s.color}33` : "transparent",
              color: on ? "#fff" : C.muted,
              fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1,
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 3, transition: "all 0.2s",
            }}>
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            {t(`painting.status.${s.tkey}`)}
          </button>
        );
      })}
    </div>
  );
}

// ─── PAINT PICKER ─────────────────────────────────────────────────────────

function PaintPicker({ onSelect, onClose }) {
  const C = useContext(ThemeCtx);
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [brand,  setBrand]  = useState("Citadel");
  const [range,  setRange]  = useState("All");

  const brandPaints = ALL_PAINTS.filter(p => p.brand === brand);
  const brandRanges = [...new Set(brandPaints.map(p => p.range))];

  const filtered = brandPaints.filter((p) => {
    const matchRange  = range === "All" || p.range === range;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchRange && matchSearch;
  });

  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,0.7)",
               display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background:C.surface, border:`1px solid ${C.border}`,
                 borderTop:`2px solid ${C.gold}`, borderRadius:"16px 16px 0 0",
                 padding:"16px 16px 40px", width:"100%", maxWidth:600,
                 maxHeight:"75vh", display:"flex", flexDirection:"column" }}>
        <div style={{ width:36, height:4, background:C.border, borderRadius:2, margin:"0 auto 12px" }}/>

        {/* Brand tabs */}
        <div style={{ display:"flex", gap:0, marginBottom:10, background:C.card,
                      borderRadius:8, padding:3, border:`1px solid ${C.border}` }}>
          {BRANDS.map(b => (
            <button key={b} onClick={() => { setBrand(b); setRange("All"); }}
              style={{ flex:1, padding:"6px 4px", borderRadius:6,
                       background: brand===b ? `${C.gold}33` : "transparent",
                       border:"none", color: brand===b ? C.gold : C.muted,
                       fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1,
                       cursor:"pointer", transition:"all 0.15s", textAlign:"center" }}>
              {b}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("painting.paintPicker.searchPlaceholder").replace("{brand}", brand)}
          style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
                   padding:"10px 14px", color:C.text, fontFamily:"'Cinzel',serif",
                   fontSize:13, width:"100%", boxSizing:"border-box", marginBottom:10 }}
        />

        {/* Range filter */}
        <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:8, marginBottom:10 }}>
          {["All",...brandRanges].map((r) => (
            <button key={r} onClick={() => setRange(r)}
              style={{ flexShrink:0, padding:"4px 10px", borderRadius:20,
                       border:`1px solid ${range===r ? C.gold : C.border}`,
                       background: range===r ? `${C.gold}22` : "transparent",
                       color: range===r ? C.gold : C.muted,
                       fontFamily:"'Cinzel',serif", fontSize:10, cursor:"pointer" }}>
              {r}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={{ overflowY:"auto", flex:1 }}>
          {filtered.length === 0 && (
            <div style={{ color:C.muted, fontSize:13, textAlign:"center", padding:24 }}>
              {t("painting.paintPicker.noColours")}
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {filtered.map((p) => (
              <button key={p.name} onClick={() => onSelect(p)}
                style={{ display:"flex", alignItems:"center", gap:10,
                         padding:"10px 12px", borderRadius:8, cursor:"pointer",
                         background:C.card, border:`1px solid ${C.border}`,
                         textAlign:"left", transition:"border-color 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = C.gold}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}>
                <div style={{ width:28, height:28, borderRadius:6, background:p.hex,
                              border:"1px solid rgba(255,255,255,0.15)", flexShrink:0 }}/>
                <div>
                  <div style={{ color:C.text, fontSize:11, fontWeight:600, lineHeight:1.2 }}>
                    {p.name}
                  </div>
                  <div style={{ color:C.muted, fontSize:9, fontFamily:"'Cinzel',serif",
                                letterSpacing:1, marginTop:2 }}>
                    {p.range}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PINTEREST SEARCH ─────────────────────────────────────────────────────

function pinterestUrl(faction, unit, name) {
  const parts = [faction, unit || name, "warhammer", "miniature", "painting"].filter(Boolean);
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(parts.join(" "))}`;
}

function PinterestButton({ faction, unit, name, style = {} }) {
  const { t } = useLang();
  const url = pinterestUrl(faction, unit, name);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 6,
        border: `1px solid #e60023aa`,
        background: "transparent",
        color: "#e60023",
        fontFamily: "'Cinzel',serif", fontSize: 9,
        letterSpacing: 1, textDecoration: "none",
        cursor: "pointer", transition: "background 0.15s",
        ...style,
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "#e6002322"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      {t("painting.pinterest")}
    </a>
  );
}

// ─── PAINT ROW (editable — outside MiniModal to prevent remount) ─────────────

function PaintRow({ paint, onRemove, onUpdate, onReplace }) {
  const C = useContext(ThemeCtx);
  const { t } = useLang();
  const [editing,    setEditing]    = useState(false);
  const [partInput,  setPartInput]  = useState(paint.part_name  || "");
  const [usageInput, setUsageInput] = useState(paint.usage_type || "base");
  const [showPicker, setShowPicker] = useState(false);

  const save = () => {
    onUpdate(paint.id, { part_name: partInput.trim(), usage_type: usageInput });
    setEditing(false);
  };

  return (
    <div>
      {/* ── Compact row ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8,
                    background:C.card, border:`1px solid ${editing ? C.gold+"55" : C.border}`,
                    borderRadius: editing ? "8px 8px 0 0" : 8, padding:"8px 12px",
                    transition:"border-color 0.15s" }}>
        <div style={{ width:22, height:22, borderRadius:4, background:paint.paint_hex || "#555",
                      border:"1px solid rgba(255,255,255,0.15)", flexShrink:0 }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ color:C.text, fontSize:12, fontWeight:600,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {paint.paint_name}
          </div>
          <div style={{ color:C.muted, fontSize:10 }}>
            <span style={{ fontFamily:"'Cinzel',serif", letterSpacing:1 }}>
              {paint.usage_type}
            </span>
            {paint.paint_range && ` · ${paint.paint_range}`}
          </div>
        </div>
        <button onClick={() => { setEditing(e => !e); setPartInput(paint.part_name || ""); setUsageInput(paint.usage_type || "base"); }}
          title={t("painting.paintRow.editTitle")}
          style={{ background:"transparent", border:`1px solid ${editing ? C.gold+"88" : "transparent"}`,
                   borderRadius:4, color: editing ? C.gold : C.muted,
                   cursor:"pointer", fontSize:12, padding:"2px 6px", transition:"all 0.15s" }}>
          ✎
        </button>
        <button onClick={onRemove}
          style={{ background:"transparent", border:"none", color:C.muted,
                   cursor:"pointer", fontSize:16, padding:"2px 4px" }}>
          ×
        </button>
      </div>

      {/* ── Edit panel ── */}
      {editing && (
        <div style={{ background:`${C.gold}08`, border:`1px solid ${C.gold}33`,
                      borderTop:"none", borderRadius:"0 0 8px 8px",
                      padding:"10px 12px", display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={() => setShowPicker(true)}
            style={{ width:"100%", padding:"8px", borderRadius:6,
                     background:`${C.gold}15`, border:`1px solid ${C.gold}55`,
                     color:C.gold, fontFamily:"'Cinzel',serif", fontSize:10,
                     letterSpacing:1, cursor:"pointer" }}>
            {t("painting.paintRow.changePaint")}
          </button>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.muted,
                            letterSpacing:2, marginBottom:4 }}>{t("painting.paintRow.section")}</div>
              <input value={partInput} onChange={e => setPartInput(e.target.value)}
                placeholder={t("painting.paintRow.sectionPlaceholder")}
                style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
                         padding:"7px 10px", color:C.text, fontSize:12,
                         width:"100%", boxSizing:"border-box" }}/>
            </div>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.muted,
                            letterSpacing:2, marginBottom:4 }}>{t("painting.paintRow.use")}</div>
              <select value={usageInput} onChange={e => setUsageInput(e.target.value)}
                style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
                         padding:"7px 10px", color:C.text, fontSize:12,
                         width:"100%", boxSizing:"border-box" }}>
                {USAGE_TYPES.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={save}
              style={{ flex:1, padding:"8px", borderRadius:6,
                       background:`${C.gold}22`, border:`1px solid ${C.gold}`,
                       color:C.gold, fontFamily:"'Cinzel',serif", fontSize:10,
                       letterSpacing:1, cursor:"pointer" }}>
              {t("painting.paintRow.save")}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ padding:"8px 12px", borderRadius:6, background:"transparent",
                       border:`1px solid ${C.dim}`, color:C.muted, cursor:"pointer" }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {showPicker && (
        <PaintPicker
          onSelect={p => {
            onReplace(paint.id, p);
            setShowPicker(false);
            setEditing(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── MINI CARD ────────────────────────────────────────────────────────────

function MiniCard({ mini, paints = [], isOwner, onEdit, onClick }) {
  const C = useContext(ThemeCtx);
  const { t } = useLang();
  const st       = highestStatus(mini.status);
  const faction  = mini.faction || "";
  const coverUrl = (() => {
    try { if (mini.photo_url?.startsWith("[")) return JSON.parse(mini.photo_url)[0]; }
    catch {}
    return mini.photo_url || "";
  })();

  return (
    <div onClick={onClick}
      style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12,
               overflow:"hidden", cursor:"pointer", transition:"border-color 0.2s" }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = C.gold}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}>

      {/* Photo / Placeholder */}
      <div style={{ height:140, background:`${C.surface}`, position:"relative",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    overflow:"hidden" }}>
        {coverUrl ? (
          <img src={coverUrl} alt={mini.name}
            style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
        ) : (
          <div style={{ fontSize:40, opacity:0.2 }}>⚙</div>
        )}
        {/* Status badge */}
        <div style={{ position:"absolute", top:8, right:8,
                      background:`${st.color}dd`, borderRadius:20,
                      padding:"3px 8px", display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:11 }}>{st.icon}</span>
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:"#fff",
                         letterSpacing:1 }}>
            {t(`painting.status.${st.tkey}`)}
          </span>
        </div>
        {/* Edit button (owner only) */}
        {isOwner && (
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{ position:"absolute", top:8, left:8, background:"rgba(0,0,0,0.6)",
                     border:`1px solid ${C.border}`, borderRadius:6, color:C.gold,
                     padding:"4px 8px", fontFamily:"'Cinzel',serif", fontSize:10,
                     cursor:"pointer" }}>
            {t("painting.miniCard.edit")}
          </button>
        )}
      </div>

      <div style={{ padding:"12px 12px 14px" }}>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13,
                      color:C.text, marginBottom:4, lineHeight:1.3,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {mini.name}
        </div>
        {faction && (
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.gold,
                        letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>
            {faction}{mini.unit_type && ` · ${mini.unit_type}`}
          </div>
        )}
        {/* Color swatches */}
        {paints.length > 0 && (
          <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
            {paints.slice(0,8).map((p, i) => (
              <div key={i}
                title={`${p.paint_name} (${p.part_name || p.usage_type})`}
                style={{ width:16, height:16, borderRadius:3, background:p.paint_hex || "#555",
                         border:"1px solid rgba(255,255,255,0.1)" }}/>
            ))}
            {paints.length > 8 && (
              <div style={{ width:16, height:16, borderRadius:3, background:C.dim,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:8, color:C.muted }}>
                +{paints.length - 8}
              </div>
            )}
          </div>
        )}
        {/* Pinterest link */}
        {(faction || mini.name) && (
          <PinterestButton faction={faction} unit={mini.unit_type} name={mini.name}/>
        )}
      </div>
    </div>
  );
}

// ─── AI RECOMMENDATIONS PANEL ─────────────────────────────────────────────

const DIFFICULTY_COLOR = { Beginner:"#4aaa6a", Intermediate:"#c9a84c", Advanced:"#b03030" };
const STEP_COLOR = { base:"#3a3a4a", shade:"#1a2a5a", layer:"#5a4a10",
                     highlight:"#7a6020", drybrush:"#4a3018", contrast:"#2a3a2a" };

function AiRecommendations({ faction, unit, miniName, onApply, universe, photoUrls, miniId, onDataChange, initialData }) {
  const C = useContext(ThemeCtx);
  const { t } = useLang();
  const lsKey = miniId ? `wh40k_ai_${miniId}` : null;

  const [data,          setData]          = useState(() => {
    // Priority: DB-persisted data (cross-device) → localStorage cache → null
    if (initialData) return initialData;
    if (!lsKey) return null;
    try { return JSON.parse(localStorage.getItem(lsKey)) || null; } catch { return null; }
  });
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [activeScheme,  setActiveScheme]  = useState(0);
  const [prefColors,    setPrefColors]    = useState("");
  const [prefTheme,     setPrefTheme]     = useState("");

  const hasPhotos = Array.isArray(photoUrls) && photoUrls.length > 0;

  const load = async () => {
    if (!faction && !hasPhotos) { setError(t("painting.ai.selectFactionFirst")); return; }
    setLoading(true); setError(null); setData(null); setActiveScheme(0);
    try {
      const result = await getAiRecommendations(faction, unit || faction, universe, photoUrls, miniName, prefColors, prefTheme);
      setData(result);
      onDataChange?.(result);
      if (lsKey) localStorage.setItem(lsKey, JSON.stringify(result));
      // Auto-persist to the cloud so a regenerated scheme survives across devices
      // without a manual miniature save. New (unsaved) minis have no id yet — their
      // suggestions are written on first save via aiDataRef instead.
      if (miniId) {
        try { await db.update("miniatures", miniId, { ai_suggestions: result }); }
        catch (e) { console.error("AI suggestions cloud save failed", e); }
      }
    } catch (e) {
      if (e.message === "DAILY_LIMIT") {
        setError(t("painting.ai.dailyLimit"));
      } else if (e.message === "NO_SESSION") {
        setError(t("painting.ai.noSession"));
      } else if (e.message === "IMAGE_TOO_LARGE") {
        setError(t("painting.ai.imageTooLarge"));
      } else {
        setError(t("painting.ai.error").replace("{msg}", e.message || t("painting.ai.errorFallback")));
      }
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const schemes = data?.schemes ?? [];
  const scheme  = schemes[activeScheme];

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.gold}44`,
                  borderRadius:12, overflow:"hidden" }}>

      {/* ── Header ── */}
      <div style={{ background:`${C.gold}11`, borderBottom:`1px solid ${C.gold}33`,
                    padding:"12px 16px", display:"flex", alignItems:"center",
                    justifyContent:"space-between", gap:10 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:C.gold, letterSpacing:2 }}>
            {t("painting.ai.title")}
          </div>
          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
            {data && lsKey
              ? t("painting.ai.saved")
              : hasPhotos
                ? t("painting.ai.photoHint")
                    .replace("{n}", photoUrls.length)
                    .replace("{s}", photoUrls.length > 1 ? "s" : "")
                : t("painting.ai.defaultHint")}
          </div>
        </div>
        <button onClick={load} disabled={loading}
          style={{ flexShrink:0, background:loading ? C.dim : `${C.gold}22`,
                   border:`1px solid ${C.gold}`, borderRadius:8,
                   color:C.gold, padding:"8px 14px", fontFamily:"'Cinzel',serif",
                   fontSize:11, letterSpacing:1, cursor:loading ? "default" : "pointer",
                   opacity:loading ? 0.6 : 1 }}>
          {loading ? t("painting.ai.analysing") : data ? t("painting.ai.newIdeas") : t("painting.ai.inspireMe")}
        </button>
      </div>

      {/* ── Preferred colours ── */}
      <div style={{ padding:"8px 16px", borderBottom:`1px solid ${C.border}`,
                    display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.goldDim,
                       letterSpacing:2, textTransform:"uppercase", flexShrink:0 }}>
          {t("painting.ai.preferredColors")}
        </span>
        <input
          type="text"
          value={prefColors}
          onChange={(e) => setPrefColors(e.target.value)}
          placeholder={t("painting.ai.preferredColorsPlaceholder")}
          style={{ flex:"1 1 160px", minWidth:0, background:C.card,
                   border:`1px solid ${C.border}`, borderRadius:8,
                   color:C.text, padding:"6px 10px", fontSize:11, outline:"none" }}
        />
      </div>

      {/* ── Theme / atmosphere ── */}
      <div style={{ padding:"8px 16px", borderBottom:`1px solid ${C.border}`,
                    display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.goldDim,
                       letterSpacing:2, textTransform:"uppercase", flexShrink:0 }}>
          {t("painting.ai.preferredTheme")}
        </span>
        <input
          type="text"
          value={prefTheme}
          onChange={(e) => setPrefTheme(e.target.value)}
          placeholder={t("painting.ai.preferredThemePlaceholder")}
          style={{ flex:"1 1 160px", minWidth:0, background:C.card,
                   border:`1px solid ${C.border}`, borderRadius:8,
                   color:C.text, padding:"6px 10px", fontSize:11, outline:"none" }}
        />
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding:"20px 16px", textAlign:"center", color:C.muted, fontSize:12 }}>
          {hasPhotos
            ? t("painting.ai.analysingPhoto")
            : t("painting.ai.generating")}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ padding:"12px 16px", color:C.red, fontSize:12, lineHeight:1.6 }}>
          {error}
        </div>
      )}

      {/* ── Results ── */}
      {data && schemes.length > 0 && (
        <div>
          {/* Miniature identification (when photo was used) */}
          {data.miniature && hasPhotos && !faction && (
            <div style={{ padding:"10px 16px 0", fontSize:11, color:C.muted,
                          fontStyle:"italic", borderBottom:`1px solid ${C.border}` }}>
              {t("painting.ai.identified")} <span style={{ color:C.text }}>{data.miniature}</span>
            </div>
          )}

          {/* Scheme tabs */}
          <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`,
                        overflowX:"auto" }}>
            {schemes.map((s, i) => (
              <button key={i} onClick={() => setActiveScheme(i)}
                style={{ flex:"1 1 auto", padding:"10px 6px", background:"transparent",
                         border:"none", borderBottom:`2px solid ${activeScheme===i ? C.gold : "transparent"}`,
                         color: activeScheme===i ? C.gold : C.muted,
                         fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1,
                         cursor:"pointer", whiteSpace:"nowrap", transition:"color 0.15s" }}>
                {s.name}
              </button>
            ))}
          </div>

          {/* Active scheme */}
          {scheme && (
            <div style={{ padding:"12px 16px" }}>

              {/* Difficulty + style */}
              <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                <span style={{ background:`${DIFFICULTY_COLOR[scheme.difficulty] || "#555"}22`,
                               border:`1px solid ${DIFFICULTY_COLOR[scheme.difficulty] || "#555"}`,
                               borderRadius:20, padding:"2px 10px",
                               fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1,
                               color: DIFFICULTY_COLOR[scheme.difficulty] || C.muted,
                               flexShrink:0 }}>
                  {scheme.difficulty}
                </span>
                <span style={{ fontSize:11, color:C.muted, lineHeight:1.5, flex:1 }}>
                  {scheme.style}
                </span>
              </div>

              {/* Techniques */}
              {scheme.techniques?.length > 0 && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.goldDim,
                                letterSpacing:3, textTransform:"uppercase", marginBottom:5 }}>
                    {t("painting.ai.techniques")}
                  </div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    {scheme.techniques.map((tech, i) => (
                      <a key={i}
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(tech + ' warhammer miniature tutorial')}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ background:C.card, border:`1px solid ${C.goldDim}`,
                                 borderRadius:20, padding:"3px 9px",
                                 fontSize:10, color:C.gold, textDecoration:"none",
                                 cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4 }}>
                        ▶ {tech}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Tip */}
              {scheme.tip && (
                <div style={{ marginBottom:12, padding:"8px 12px",
                              background:`${C.gold}0a`, border:`1px solid ${C.gold}33`,
                              borderLeft:`3px solid ${C.gold}`, borderRadius:"0 6px 6px 0",
                              fontSize:11, color:C.text, lineHeight:1.6 }}>
                  💡 {scheme.tip}
                </div>
              )}

              {/* Paint steps by part */}
              {scheme.parts?.map((part, pi) => (
                <div key={pi} style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.gold,
                                letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>
                    {part.part}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    {part.steps?.map((step, si) => {
                      const hex = step.hex || "#555";
                      const colorLabel = step.color || step.paint || "";
                      const refUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(colorLabel + " paint colour miniature reference")}`;
                      return (
                        <div key={si}
                          style={{ display:"flex", alignItems:"center", gap:8,
                                   background:C.card, borderRadius:6, padding:"7px 10px" }}>
                          <div style={{ width:20, height:20, borderRadius:4, background:hex,
                                        border:"1px solid rgba(255,255,255,0.12)", flexShrink:0 }}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <span style={{ color:C.text, fontSize:12 }}>{colorLabel}</span>
                              <span style={{ background:`${STEP_COLOR[step.type] || "#333"}`,
                                             borderRadius:4, padding:"1px 6px", fontSize:8,
                                             color:"#ccc", fontFamily:"'Cinzel',serif",
                                             letterSpacing:1, flexShrink:0 }}>
                                {step.type}
                              </span>
                            </div>
                            {step.note && (
                              <div style={{ fontSize:10, color:C.muted, marginTop:2,
                                            lineHeight:1.4, fontStyle:"italic" }}>
                                {step.note}
                              </div>
                            )}
                          </div>
                          <a href={refUrl} target="_blank" rel="noopener noreferrer"
                            title={t("painting.ai.findColor")}
                            style={{ background:"transparent", border:`1px solid ${C.goldDim}`,
                                     borderRadius:4, color:C.gold, cursor:"pointer", textDecoration:"none",
                                     fontSize:11, padding:"2px 8px", flexShrink:0, lineHeight:"16px" }}>
                            🔍
                          </a>
                          <button title={t("painting.ai.addToScheme")}
                            onClick={() => onApply({
                              paint_name:  colorLabel,
                              paint_hex:   hex,
                              paint_range: "",
                              part_name:   part.part,
                              usage_type:  step.type,
                              paint_brand: "",
                            })}
                            style={{ background:"transparent", border:`1px solid ${C.gold}55`,
                                     borderRadius:4, color:C.gold, cursor:"pointer",
                                     fontSize:11, padding:"2px 8px", flexShrink:0 }}>
                            +
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FORM HELPERS (outside MiniModal to prevent re-mount on each keystroke) ──

function FormLabel({ children }) {
  const C = useContext(ThemeCtx);
  return (
    <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.goldDim,
                  letterSpacing:3, textTransform:"uppercase", marginBottom:6, marginTop:14 }}>
      {children}
    </div>
  );
}

function FormInput({ value, onChange, placeholder, multiline }) {
  const C = useContext(ThemeCtx);
  const s = {
    background: C.card, border:`1px solid ${C.border}`, borderRadius:8,
    padding:"10px 14px", color:C.text, fontSize:13, width:"100%",
    boxSizing:"border-box", fontFamily:"inherit", resize:"vertical",
  };
  return multiline
    ? <textarea rows={3} value={value} onChange={onChange} placeholder={placeholder} style={s}/>
    : <input value={value} onChange={onChange} placeholder={placeholder} style={s}/>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── MINI MODAL (Add / Edit) ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function MiniModal({ mini, userId, onSave, onClose, universe }) {
  const C = useContext(ThemeCtx);
  const { t } = useLang();
  const isEdit = !!mini?.id;
  const photoInput = useRef(null);

  // Parse saved photo_url: may be a JSON array (multiple photos) or a plain URL
  const initPhotoUrls = () => {
    const raw = mini?.photo_url ?? "";
    if (!raw) return [];
    try { if (raw.startsWith("[")) return JSON.parse(raw); } catch {}
    return [raw];
  };

  const [form, setForm]       = useState({
    name:               mini?.name ?? "",
    faction:            mini?.faction ?? "",
    unit_type:          mini?.unit_type ?? "",
    status:             mini?.status ?? "owned",
    notes:              mini?.notes ?? "",
    color_scheme_notes: mini?.color_scheme_notes ?? "",
    is_public:          mini?.is_public ?? true,
  });
  const [photoUrls,     setPhotoUrls]     = useState(initPhotoUrls);
  const [paints,        setPaints]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [photoLoading,  setPhotoLoading]  = useState(false);
  const [showPicker,    setShowPicker]    = useState(false);
  const [zoomUrl,       setZoomUrl]       = useState(null);
  const [pendingPaint,  setPendingPaint]  = useState(null);
  const [partInput,     setPartInput]     = useState("");
  const [usageInput,    setUsageInput]    = useState("base");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const aiDataRef = useRef(null); // keep latest AI result so we can persist it on save

  // Load existing paints if editing
  useEffect(() => {
    if (!mini?.id) return;
    db.get("miniature_paints", `miniature_id=eq.${mini.id}`)
      .then(setPaints);
  }, [mini?.id]);

  const FACTIONS = universe === 'aos' ? FACTIONS_AOS : FACTIONS_40K;
  const units = FACTIONS[form.faction] ?? [];

  const handlePhoto = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const slots = MAX_PHOTOS - photoUrls.length;
    if (slots <= 0) { alert(t("painting.modal.maxPhotos").replace("{max}", MAX_PHOTOS)); return; }
    setPhotoLoading(true);
    try {
      const newUrls = [];
      for (const file of files.slice(0, slots)) {
        const blob = await downscaleImage(file);
        // If we re-encoded to JPEG, store it under a .jpg name so the served
        // content-type matches (the AI proxy only accepts image/* content).
        const name = blob !== file ? `${file.name.replace(/\.[^.]+$/, "")}.jpg` : file.name;
        const path = `${userId}/${Date.now()}_${name}`;
        await storage.upload("miniatures", path, blob);
        newUrls.push(storage.url("miniatures", path));
      }
      setPhotoUrls(prev => [...prev, ...newUrls]);
    } catch (err) {
      alert(t("painting.modal.photoUploadError").replace("{msg}", err.message));
    } finally {
      setPhotoLoading(false);
      e.target.value = "";
    }
  };

  const handleSelectPaint = (p) => {
    setPendingPaint(p);
    setShowPicker(false);
  };

  const handleAddPaint = () => {
    if (!pendingPaint) return;
    const entry = {
      id: crypto.randomUUID(),  // temp id for local state
      _new: true,
      paint_name:  pendingPaint.name,
      paint_hex:   pendingPaint.hex,
      paint_range: pendingPaint.range,
      paint_brand: "Citadel",
      part_name:   partInput || "",
      usage_type:  usageInput,
      sort_order:  paints.length,
    };
    setPaints((ps) => [...ps, entry]);
    setPendingPaint(null);
    setPartInput("");
    setUsageInput("base");
  };

  const handleApplyAi = (paint) => {
    setPaints((ps) => [...ps, { id: crypto.randomUUID(), _new: true, ...paint, sort_order: ps.length }]);
  };

  const handleRemovePaint  = (id) => setPaints(ps => ps.filter(p => p.id !== id));
  const handleUpdatePaint  = (id, updates) => setPaints(ps => ps.map(p => p.id === id ? { ...p, ...updates } : p));
  const handleReplacePaint = (id, newPaint) => setPaints(ps => ps.map(p => p.id === id
    ? { ...p, paint_name: newPaint.name, paint_hex: newPaint.hex,
              paint_range: newPaint.range, paint_brand: newPaint.brand || "Citadel" }
    : p));

  const handleSave = async () => {
    if (!form.name.trim()) { alert(t("painting.modal.nameRequired")); return; }
    setLoading(true);
    try {
      let miniId = mini?.id;
      const serializedPhoto = photoUrls.length === 0 ? ""
        : photoUrls.length === 1 ? photoUrls[0]
        : JSON.stringify(photoUrls);
      const payload = {
        ...form,
        photo_url: serializedPhoto,
        user_id: userId,
        universe,
        ...(aiDataRef.current ? { ai_suggestions: aiDataRef.current } : {}),
      };

      if (isEdit) {
        await db.update("miniatures", miniId, payload);
      } else {
        const created = await db.insert("miniatures", payload);
        miniId = created.id;
      }

      // Sync paints: delete all, re-insert
      // (simple approach — for a production app you'd diff)
      if (miniId) {
        await sb.del("miniature_paints", `miniature_id=eq.${miniId}`);
        // Insert all current paints
        for (const p of paints) {
          const { id: _id, _new, ...rest } = p;
          await db.insert("miniature_paints", { ...rest, miniature_id: miniId });
        }
      }

      onSave();
    } catch (err) {
      alert(t("painting.modal.saveError").replace("{msg}", err.message));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3500);
      return;
    }
    setLoading(true);
    try {
      await sb.del("miniature_paints", `miniature_id=eq.${mini.id}`);
      await sb.del("miniatures", `id=eq.${mini.id}`);
      // Verify the row is actually gone (sb.del returns ok=true even for 0-row deletes)
      const check = await sb.get("miniatures", `id=eq.${mini.id}&select=id`);
      if (Array.isArray(check) && check.length > 0) {
        throw new Error(t("painting.modal.notOwner"));
      }
      onSave();
    } catch (err) {
      alert(t("painting.modal.deleteError").replace("{msg}", err.message));
      setLoading(false);
    }
  };

  // Rendered in a portal on <body> so it escapes the section's animated
  // (transform-bearing) ancestor — otherwise position:fixed is contained by
  // that ancestor and the modal stops at the bottom nav instead of covering it.
  return createPortal(
    <div style={{ position:"fixed", inset:0, zIndex:1000,
                  background:"rgba(0,0,0,0.8)", overflowY:"auto",
                  display:"flex", justifyContent:"center", alignItems:"flex-start" }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`,
                    borderRadius:16, width:"100%", maxWidth:600,
                    margin:"16px 16px 60px", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`,
                      padding:"16px 20px", display:"flex",
                      justifyContent:"space-between", alignItems:"center", gap:10 }}>
          <span style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:16, color:C.text }}>
            {isEdit ? t("painting.modal.editTitle") : t("painting.modal.addTitle")}
          </span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {isEdit && (
              <button onClick={handleDelete} disabled={loading}
                style={{ background: deleteConfirm ? `${C.red}22` : "transparent",
                         border:`1px solid ${deleteConfirm ? C.red : C.dim}`,
                         borderRadius:6, color: deleteConfirm ? C.red : C.muted,
                         padding:"6px 12px", cursor:"pointer",
                         fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1,
                         transition:"all 0.2s" }}>
                {deleteConfirm ? t("painting.modal.confirmDelete") : t("painting.modal.delete")}
              </button>
            )}
            <button onClick={onClose}
              style={{ background:"transparent", border:`1px solid ${C.dim}`,
                       borderRadius:6, color:C.muted, width:32, height:32,
                       cursor:"pointer", fontSize:16 }}>
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding:"16px 20px 24px" }}>
          {/* Name */}
          <FormLabel>{t("painting.modal.nameLabel")}</FormLabel>
          <FormInput value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t("painting.modal.namePlaceholder")}/>

          {/* Faction + Unit */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:4 }}>
            <div>
              <FormLabel>{t("painting.modal.factionLabel")}</FormLabel>
              <select value={form.faction}
                onChange={(e) => setForm((f) => ({ ...f, faction:e.target.value, unit_type:"" }))}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
                         padding:"10px 14px", color:form.faction ? C.text : C.muted,
                         fontSize:13, width:"100%", boxSizing:"border-box" }}>
                <option value="">{t("painting.modal.factionOption")}</option>
                {Object.keys(FACTIONS).map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>{t("painting.modal.unitLabel")}</FormLabel>
              {/* Dropdown quick-filler */}
              {units.length > 0 && (
                <select value=""
                  onChange={e => { if (e.target.value) setForm(f => ({ ...f, unit_type: e.target.value })); }}
                  style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:"8px 8px 0 0",
                           padding:"8px 14px", color:C.muted, fontSize:11,
                           width:"100%", boxSizing:"border-box", borderBottom:"none" }}>
                  <option value="">{t("painting.modal.quickSelectUnit")}</option>
                  {units.map(u => <option key={u}>{u}</option>)}
                </select>
              )}
              {/* Editable text — what gets saved and sent to AI */}
              <input value={form.unit_type}
                onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))}
                placeholder={t("painting.modal.unitPlaceholder")}
                style={{ background:C.card, border:`1px solid ${C.border}`,
                         borderRadius: units.length ? "0 0 8px 8px" : 8,
                         padding:"10px 14px", color:C.text, fontSize:13,
                         width:"100%", boxSizing:"border-box" }}/>
              {form.faction && (
                <a
                  href={`${universe === 'aos' ? 'https://ageofsigmar.lexicanum.com' : 'https://wh40k.lexicanum.com'}/wiki/Category:${encodeURIComponent(form.faction.replace(/ /g, '_'))}_miniatures`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:"inline-block", marginTop:5, color:C.goldDim,
                           fontSize:10, fontFamily:"'Cinzel',serif", letterSpacing:1,
                           textDecoration:"none" }}>
                  {t("painting.modal.browseLexicanum").replace("{faction}", form.faction)}
                </a>
              )}
            </div>
          </div>

          {/* Status */}
          <FormLabel>{t("painting.modal.progressLabel")}</FormLabel>
          <StatusStepper value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status:v }))}/>

          {/* Photos (up to 4) */}
          <FormLabel>{t("painting.modal.photosLabel").replace("{n}", photoUrls.length).replace("{max}", MAX_PHOTOS)}</FormLabel>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-start" }}>
            {photoUrls.map((url, i) => (
              <div key={i} style={{ position:"relative", flexShrink:0 }}>
                <img src={url} alt={`photo ${i+1}`}
                  onClick={() => setZoomUrl(url)}
                  title={t("painting.modal.zoomPhoto")}
                  style={{ width:80, height:80, objectFit:"cover",
                           borderRadius:8, border:`1px solid ${i===0 ? C.gold : C.border}`,
                           display:"block", cursor:"zoom-in" }}/>
                {i === 0 ? (
                  <div style={{ position:"absolute", bottom:3, left:3,
                                background:"rgba(0,0,0,0.7)", borderRadius:3,
                                padding:"1px 4px", fontSize:8,
                                fontFamily:"'Cinzel',serif", color:C.gold }}>
                    ★ {t("painting.modal.cover")}
                  </div>
                ) : (
                  <button
                    onClick={() => setPhotoUrls(prev => [prev[i], ...prev.filter((_, j) => j !== i)])}
                    title={t("painting.modal.setCover")}
                    style={{ position:"absolute", bottom:3, left:3,
                             background:"rgba(0,0,0,0.7)", border:"none", borderRadius:3,
                             padding:"1px 5px", fontSize:8, cursor:"pointer",
                             fontFamily:"'Cinzel',serif", color:C.muted, letterSpacing:0.5 }}>
                    ☆ {t("painting.modal.setCover")}
                  </button>
                )}
                <button onClick={() => setPhotoUrls(prev => prev.filter((_, j) => j !== i))}
                  style={{ position:"absolute", top:-6, right:-6, width:18, height:18,
                           borderRadius:"50%", background:C.red, border:"none",
                           color:"#fff", fontSize:11, cursor:"pointer",
                           display:"flex", alignItems:"center", justifyContent:"center",
                           lineHeight:1, padding:0 }}>
                  ×
                </button>
              </div>
            ))}
            {photoUrls.length < MAX_PHOTOS && (
              <button onClick={() => photoInput.current.click()} disabled={photoLoading}
                style={{ width:80, height:80, borderRadius:8, flexShrink:0,
                         background:"transparent", border:`2px dashed ${C.goldDim}`,
                         color:C.gold, fontFamily:"'Cinzel',serif", fontSize:10,
                         letterSpacing:1, cursor:"pointer",
                         opacity:photoLoading ? 0.5 : 1,
                         display:"flex", flexDirection:"column",
                         alignItems:"center", justifyContent:"center", gap:4 }}>
                {photoLoading ? "⚙" : <>📷<span>{t("painting.modal.addPhoto")}</span></>}
              </button>
            )}
            <input ref={photoInput} type="file" accept="image/*" multiple
              style={{ display:"none" }} onChange={handlePhoto}/>
          </div>
          <div style={{ fontSize:10, color:C.muted, lineHeight:1.5, marginTop:6 }}>
            {t("painting.modal.photoTip")}
          </div>

          {/* Notes */}
          <FormLabel>{t("painting.modal.notesLabel")}</FormLabel>
          <FormInput multiline value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes:e.target.value }))}
            placeholder={t("painting.modal.notesPlaceholder")}/>

          {/* ── COLOR SCHEME ────────────────────────────────────────── */}
          <FormLabel>{t("painting.modal.colourSchemeLabel")}</FormLabel>

          {/* Paints grouped by section */}
          {paints.length > 0 && (() => {
            const groups = paints.reduce((acc, p) => {
              const key = p.part_name?.trim() || "Other";
              (acc[key] = acc[key] || []).push(p);
              return acc;
            }, {});
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:10 }}>
                {Object.entries(groups).map(([section, sectionPaints]) => (
                  <div key={section}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.gold,
                                  letterSpacing:3, textTransform:"uppercase",
                                  marginBottom:5, paddingLeft:2 }}>
                      {section}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      {sectionPaints.map(p => (
                        <PaintRow key={p.id} paint={p}
                          onRemove={() => handleRemovePaint(p.id)}
                          onUpdate={handleUpdatePaint}
                          onReplace={handleReplacePaint}/>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Pending paint annotator */}
          {pendingPaint && (
            <div style={{ background:C.card, border:`1px solid ${C.gold}55`,
                          borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <div style={{ width:24, height:24, borderRadius:4,
                              background:pendingPaint.hex,
                              border:"1px solid rgba(255,255,255,0.15)" }}/>
                <span style={{ color:C.text, fontSize:13, fontWeight:600 }}>
                  {pendingPaint.name}
                </span>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:9,
                               color:C.goldDim, letterSpacing:1 }}>
                  {pendingPaint.range}
                </span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8,
                            marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.muted,
                                letterSpacing:1, marginBottom:4 }}>{t("painting.modal.part")}</div>
                  <input value={partInput}
                    onChange={(e) => setPartInput(e.target.value)}
                    placeholder={t("painting.modal.partPlaceholder")}
                    style={{ background:C.surface, border:`1px solid ${C.border}`,
                             borderRadius:6, padding:"8px 10px", color:C.text,
                             fontSize:12, width:"100%", boxSizing:"border-box" }}/>
                </div>
                <div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.muted,
                                letterSpacing:1, marginBottom:4 }}>{t("painting.modal.use")}</div>
                  <select value={usageInput}
                    onChange={(e) => setUsageInput(e.target.value)}
                    style={{ background:C.surface, border:`1px solid ${C.border}`,
                             borderRadius:6, padding:"8px 10px", color:C.text,
                             fontSize:12, width:"100%", boxSizing:"border-box" }}>
                    {USAGE_TYPES.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={handleAddPaint}
                  style={{ flex:1, padding:"10px", borderRadius:8,
                           background:`${C.gold}22`, border:`1px solid ${C.gold}`,
                           color:C.gold, fontFamily:"'Cinzel',serif",
                           fontSize:11, letterSpacing:2, cursor:"pointer" }}>
                  {t("painting.modal.addColour")}
                </button>
                <button onClick={() => setPendingPaint(null)}
                  style={{ padding:"10px 14px", borderRadius:8, background:"transparent",
                           border:`1px solid ${C.dim}`, color:C.muted, cursor:"pointer" }}>
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Add paint button */}
          {!pendingPaint && (
            <button onClick={() => setShowPicker(true)}
              style={{ width:"100%", padding:"12px", borderRadius:8,
                       background:"transparent", border:`1px dashed ${C.goldDim}`,
                       color:C.goldDim, fontFamily:"'Cinzel',serif",
                       fontSize:12, letterSpacing:2, cursor:"pointer", marginBottom:10 }}>
              {t("painting.modal.addPaint")}
            </button>
          )}

          {/* AI Recommendations */}
          {(form.faction || form.unit_type || photoUrls.length > 0) && (
            <AiRecommendations
              faction={form.faction}
              unit={form.unit_type || form.faction}
              miniName={form.name}
              onApply={handleApplyAi}
              universe={universe}
              photoUrls={photoUrls}
              miniId={mini?.id}
              initialData={mini?.ai_suggestions ?? null}
              onDataChange={d => { aiDataRef.current = d; }}
            />
          )}

          {/* Pinterest search */}
          {(form.faction || form.name) && (
            <div style={{ marginTop:10 }}>
              <PinterestButton
                faction={form.faction}
                unit={form.unit_type}
                name={form.name}
                style={{ width:"100%", justifyContent:"center", padding:"10px" }}
              />
            </div>
          )}

          {/* Color scheme notes */}
          <FormLabel>{t("painting.modal.colourSchemeNotesLabel")}</FormLabel>
          <FormInput multiline value={form.color_scheme_notes}
            onChange={(e) => setForm((f) => ({ ...f, color_scheme_notes:e.target.value }))}
            placeholder={t("painting.modal.colourSchemeNotesPlaceholder")}/>

          {/* Public toggle */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        marginTop:16, padding:"12px 14px", background:C.card,
                        borderRadius:8, border:`1px solid ${C.border}` }}>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:C.text,
                            letterSpacing:1 }}>
                {t("painting.modal.publishToGallery")}
              </div>
              <div style={{ color:C.muted, fontSize:11, marginTop:2 }}>
                {t("painting.modal.visibleToAll")}
              </div>
            </div>
            <button onClick={() => setForm((f) => ({ ...f, is_public:!f.is_public }))}
              style={{ width:46, height:26, borderRadius:13,
                       background: form.is_public ? C.gold : C.dim,
                       border:"none", cursor:"pointer", position:"relative",
                       transition:"background 0.2s" }}>
              <div style={{ width:20, height:20, borderRadius:10, background:"#fff",
                            position:"absolute", top:3,
                            left: form.is_public ? 23 : 3,
                            transition:"left 0.2s" }}/>
            </button>
          </div>

          {/* Save */}
          <button onClick={handleSave} disabled={loading}
            style={{ width:"100%", padding:"16px", borderRadius:10, marginTop:20,
                     background: loading
                       ? C.dim
                       : `linear-gradient(135deg,${C.gold},#8a6f28)`,
                     border:"none", color:C.bg, fontFamily:"'Cinzel',serif",
                     fontSize:15, letterSpacing:3, textTransform:"uppercase",
                     fontWeight:700, cursor:loading ? "default" : "pointer",
                     opacity:loading ? 0.7 : 1 }}>
            {loading ? "⚙ Saving…" : isEdit ? "💾 Save Changes" : "✦ Add Miniature"}
          </button>
        </div>
      </div>

      {showPicker && (
        <PaintPicker
          onSelect={handleSelectPaint}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Photo zoom / lightbox */}
      {zoomUrl && (
        <div onClick={() => setZoomUrl(null)}
          style={{ position:"fixed", inset:0, zIndex:1100,
                   background:"rgba(0,0,0,0.92)", display:"flex",
                   alignItems:"center", justifyContent:"center", padding:24, cursor:"zoom-out" }}>
          <button onClick={() => setZoomUrl(null)} aria-label={t("painting.modal.close")}
            style={{ position:"absolute", top:16, right:16, background:"transparent",
                     border:`1px solid ${C.border}`, color:C.muted, borderRadius:8,
                     padding:"6px 14px", fontFamily:"'Cinzel',serif", fontSize:14, cursor:"pointer" }}>
            ✕
          </button>
          <img src={zoomUrl} alt="" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth:"92vw", maxHeight:"88vh", objectFit:"contain",
                     borderRadius:10, boxShadow:"0 8px 48px rgba(0,0,0,0.8)" }}/>
        </div>
      )}
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── MAIN COMPONENT: PaintingTracker ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── COLLECTION SECTION ───────────────────────────────────────────────────

function CollectionSection({ faction, unit, minis, paintsMap, userId, onEdit, onAdd }) {
  const { t } = useLang();
  const C = useContext(ThemeCtx);
  const [open, setOpen] = useState(true);

  const allCompleted = minis.length > 0 && minis.every(m => parseStatuses(m.status).includes('completed'));

  const statusCounts = (() => {
    const counts = {};
    minis.forEach(m => {
      parseStatuses(m.status).forEach(id => {
        const st = STATUS.find(s => s.id === id);
        if (st) {
          if (!counts[st.id]) counts[st.id] = { ...st, count: 0 };
          counts[st.id].count++;
        }
      });
    });
    return Object.values(counts);
  })();

  return (
    <div style={{ marginBottom:20 }}>
      {/* Header */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                 padding:"10px 0 8px", borderBottom:`1px solid ${C.border}`, marginBottom:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:13, color:C.text,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {unit}
            </div>
            {allCompleted && (
              <span style={{ flexShrink:0, background:"#4aaa6a22", border:"1px solid #4aaa6a44",
                             borderRadius:20, padding:"1px 8px",
                             fontFamily:"'Cinzel',serif", fontSize:8,
                             color:"#4aaa6a", letterSpacing:1 }}>
                ✓ Completed
              </span>
            )}
          </div>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.gold,
                        letterSpacing:2, marginTop:2, textTransform:"uppercase" }}>
            {faction}
            {minis.length > 0 && ` · ${minis.length} ${t(`painting.collection.${minis.length === 1 ? "models_one" : "models_other"}`)}`}
          </div>
          {statusCounts.length > 0 && (
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>
              {statusCounts.map(st => (
                <div key={st.id}
                  style={{ display:"inline-flex", alignItems:"center", gap:3,
                           background:`${st.color}22`, border:`1px solid ${st.color}44`,
                           borderRadius:20, padding:"1px 6px" }}>
                  <span style={{ fontSize:9 }}>{st.icon}</span>
                  <span style={{ fontFamily:"'Cinzel',serif", fontSize:8,
                                 color:st.color, letterSpacing:1 }}>
                    {st.count} {t(`painting.status.${st.tkey}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {userId && (
          <button onClick={e => { e.stopPropagation(); onAdd(); }}
            style={{ flexShrink:0, padding:"6px 12px", borderRadius:8, cursor:"pointer",
                     background:`${C.gold}22`, border:`1px solid ${C.gold}55`,
                     color:C.gold, fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1 }}>
            + Add
          </button>
        )}
        <span style={{ color:C.muted, fontSize:11, flexShrink:0 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Content */}
      {open && (
        minis.length === 0 ? (
          <div style={{ padding:"16px 0 4px", textAlign:"center" }}>
            <div style={{ color:C.muted, fontFamily:"'Cinzel',serif", fontSize:11,
                          letterSpacing:1, marginBottom:10 }}>
              No models added yet
            </div>
            {userId && (
              <button onClick={onAdd}
                style={{ padding:"8px 18px", borderRadius:8, cursor:"pointer",
                         background:`${C.gold}22`, border:`1px solid ${C.gold}55`,
                         color:C.gold, fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1 }}>
                + Add first model
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:"grid",
                        gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12 }}>
            {minis.map(m => (
              <MiniCard key={m.id} mini={m} paints={paintsMap[m.id]||[]}
                isOwner={userId === m.user_id}
                onEdit={() => onEdit(m)} onClick={() => onEdit(m)} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── ARMY TAB ─────────────────────────────────────────────────────────────

function ArmyTab({ userId, universe, minis, onGoToSection }) {
  const { t } = useLang();
  const C = useContext(ThemeCtx);
  const lsKey = `wh40k_army_${userId || 'anon'}_${universe}`;

  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey)) || { followed: [], completed: [], units: {} }; }
    catch { return { followed: [], completed: [], units: {} }; }
  });
  const [expanded,    setExpanded]    = useState(null);
  const [customInput, setCustomInput] = useState("");

  useEffect(() => { setCustomInput(""); }, [expanded]);

  const FACTIONS = universe === 'aos' ? FACTIONS_AOS : FACTIONS_40K;
  const allFactionNames = Object.keys(FACTIONS);

  const persist = (d) => { setData(d); localStorage.setItem(lsKey, JSON.stringify(d)); };

  const toggleFollow = (faction) => {
    const followed = data.followed.includes(faction)
      ? data.followed.filter(f => f !== faction)
      : [...data.followed, faction];
    persist({ ...data, followed });
  };

  const toggleComplete = (faction) => {
    const completed = (data.completed || []).includes(faction)
      ? (data.completed || []).filter(f => f !== faction)
      : [...(data.completed || []), faction];
    persist({ ...data, completed });
  };

  const setUnitStatus = (faction, unit, status) => {
    const fu = { ...(data.units[faction] || {}) };
    if (fu[unit] === status) delete fu[unit]; else fu[unit] = status;
    persist({ ...data, units: { ...data.units, [faction]: fu } });
  };

  const addCustomUnit = (faction) => {
    const unit = customInput.trim();
    if (!unit) return;
    const fu = { ...(data.units[faction] || {}), [unit]: 'owned' };
    persist({ ...data, units: { ...data.units, [faction]: fu } });
    setCustomInput("");
  };

  const getPaintStatuses = (faction, unit) => {
    const unitMinis = minis.filter(m => m.faction === faction && m.unit_type === unit);
    if (!unitMinis.length) return [];
    const counts = {};
    unitMinis.forEach(m => {
      parseStatuses(m.status).forEach(id => {
        const st = STATUS.find(s => s.id === id);
        if (st) {
          if (!counts[st.id]) counts[st.id] = { ...st, count: 0 };
          counts[st.id].count++;
        }
      });
    });
    return Object.values(counts);
  };

  const totalOwned    = Object.values(data.units).reduce((n, u) => n + Object.values(u).filter(s => s === 'owned').length,    0);
  const totalWishlist = Object.values(data.units).reduce((n, u) => n + Object.values(u).filter(s => s === 'wishlist').length, 0);

  const sorted = [
    ...data.followed.filter(f => allFactionNames.includes(f)),
    ...allFactionNames.filter(f => !data.followed.includes(f)),
  ];

  return (
    <div style={{ padding:"12px 16px 80px" }}>

      {/* Stats */}
      {(data.followed.length > 0 || totalOwned > 0) && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
          {[
            { tk:"armies",   value:data.followed.length, color:C.gold },
            { tk:"owned",    value:totalOwned,            color:"#4aaa6a" },
            { tk:"wishlist", value:totalWishlist,         color:"#4a8adc" },
          ].map(s => (
            <div key={s.tk} style={{ background:C.card, border:`1px solid ${C.border}`,
                                        borderRadius:8, padding:"10px 4px", textAlign:"center" }}>
              <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:20, color:s.color }}>
                {s.value}
              </div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.muted,
                            letterSpacing:2, textTransform:"uppercase" }}>
                {t(`painting.stats.${s.tk}`)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Faction list */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {sorted.map(faction => {
          const isFollowed   = data.followed.includes(faction);
          const isCompleted  = (data.completed || []).includes(faction);
          const isExpanded   = expanded === faction;
          const factionUnits = data.units[faction] || {};
          const ownedCount   = Object.values(factionUnits).filter(s => s === 'owned').length;
          const wishCount    = Object.values(factionUnits).filter(s => s === 'wishlist').length;
          const baseUnits    = FACTIONS[faction] || [];
          const customUnits  = Object.keys(factionUnits).filter(u => !baseUnits.includes(u));
          const allUnits     = [...baseUnits, ...customUnits];

          return (
            <div key={faction}
              style={{ background:C.card, borderRadius:10, overflow:"hidden",
                       border:`1px solid ${isCompleted ? "#4aaa6a44" : isFollowed ? C.gold+"44" : C.border}`,
                       transition:"border-color 0.2s" }}>

              {/* Faction header */}
              <div style={{ display:"flex", alignItems:"center", gap:8,
                            padding:"12px 14px", cursor:"pointer" }}
                   onClick={() => setExpanded(isExpanded ? null : faction)}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:1,
                                   color:isFollowed ? C.text : C.muted }}>
                      {faction}
                    </span>
                    {isCompleted && (
                      <span style={{ background:"#4aaa6a22", border:"1px solid #4aaa6a44",
                                     borderRadius:20, padding:"1px 8px",
                                     fontFamily:"'Cinzel',serif", fontSize:8,
                                     color:"#4aaa6a", letterSpacing:1 }}>
                        ✓ Completed
                      </span>
                    )}
                  </div>
                  {(ownedCount > 0 || wishCount > 0) && (
                    <div style={{ display:"flex", gap:10, marginTop:3 }}>
                      {ownedCount > 0 && <span style={{ fontSize:10, color:"#4aaa6a" }}>📦 {ownedCount}</span>}
                      {wishCount  > 0 && <span style={{ fontSize:10, color:"#4a8adc" }}>🛒 {wishCount}</span>}
                    </div>
                  )}
                </div>
                {isFollowed && (
                  <button onClick={e => { e.stopPropagation(); toggleComplete(faction); }}
                    style={{ flexShrink:0, padding:"4px 10px", borderRadius:20, cursor:"pointer",
                             border:`1px solid ${isCompleted ? "#4aaa6a" : C.border}`,
                             background:isCompleted ? "#4aaa6a22" : "transparent",
                             color:isCompleted ? "#4aaa6a" : C.muted,
                             fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1,
                             transition:"all 0.15s" }}>
                    {isCompleted ? "✓ Done" : "Mark Done"}
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); toggleFollow(faction); }}
                  style={{ flexShrink:0, padding:"4px 10px", borderRadius:20, cursor:"pointer",
                           border:`1px solid ${isFollowed ? C.gold : C.border}`,
                           background:isFollowed ? `${C.gold}22` : "transparent",
                           color:isFollowed ? C.gold : C.muted,
                           fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1,
                           transition:"all 0.15s" }}>
                  {isFollowed ? "✓ Collecting" : "+ Collect"}
                </button>
                <span style={{ color:C.muted, fontSize:11, flexShrink:0 }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {/* Unit list */}
              {isExpanded && (
                <div style={{ borderTop:`1px solid ${C.border}` }}>
                  {allUnits.map(unit => {
                    const unitStatus    = factionUnits[unit];
                    const paintStatuses = getPaintStatuses(faction, unit);
                    return (
                      <div key={unit}
                        style={{ display:"flex", alignItems:"center", gap:8,
                                 padding:"9px 14px", borderBottom:`1px solid ${C.border}`,
                                 background:unitStatus === 'owned' ? `${C.gold}06` : "transparent" }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, color:unitStatus ? C.text : C.muted,
                                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {unit}
                          </div>
                          {paintStatuses.length > 0 && (
                            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:3 }}>
                              {paintStatuses.map(st => (
                                <div key={st.id}
                                  style={{ display:"inline-flex", alignItems:"center", gap:3,
                                           background:`${st.color}22`, border:`1px solid ${st.color}44`,
                                           borderRadius:20, padding:"1px 6px" }}>
                                  <span style={{ fontSize:9 }}>{st.icon}</span>
                                  <span style={{ fontFamily:"'Cinzel',serif", fontSize:8,
                                                 color:st.color, letterSpacing:1 }}>
                                    {st.count} {t(`painting.status.${st.tkey}`)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button onClick={() => setUnitStatus(faction, unit, 'wishlist')} title={t("painting.tooltips.wishlist")}
                          style={{ flexShrink:0, padding:"4px 8px", borderRadius:6, cursor:"pointer",
                                   border:`1px solid ${unitStatus==='wishlist' ? '#4a8adc' : C.dim}`,
                                   background:unitStatus==='wishlist' ? '#4a8adc22' : "transparent",
                                   color:unitStatus==='wishlist' ? '#4a8adc' : C.muted,
                                   fontSize:11, transition:"all 0.15s" }}>
                          🛒
                        </button>
                        <button onClick={() => setUnitStatus(faction, unit, 'owned')} title={t("painting.tooltips.owned")}
                          style={{ flexShrink:0, padding:"4px 8px", borderRadius:6, cursor:"pointer",
                                   border:`1px solid ${unitStatus==='owned' ? '#4aaa6a' : C.dim}`,
                                   background:unitStatus==='owned' ? '#4aaa6a22' : "transparent",
                                   color:unitStatus==='owned' ? '#4aaa6a' : C.muted,
                                   fontSize:11, transition:"all 0.15s" }}>
                          📦
                        </button>
                        {unitStatus === 'owned' && (
                          <button onClick={() => onGoToSection(faction)}
                            title={t("painting.tooltips.goToCollection")}
                            style={{ flexShrink:0, padding:"4px 8px", borderRadius:6, cursor:"pointer",
                                     border:`1px solid ${C.border}`, background:"transparent",
                                     color:C.muted, fontSize:12 }}>
                            →
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add custom unit */}
                  <div style={{ padding:"10px 14px", display:"flex", gap:8 }}>
                    <input value={customInput}
                      onChange={e => setCustomInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCustomUnit(faction)}
                      placeholder={t("painting.tooltips.addCustomModel")}
                      style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`,
                               borderRadius:6, padding:"7px 10px", color:C.text, fontSize:12,
                               boxSizing:"border-box" }}/>
                    <button onClick={() => addCustomUnit(faction)}
                      style={{ padding:"7px 14px", borderRadius:6,
                               background:`${C.gold}22`, border:`1px solid ${C.gold}55`,
                               color:C.gold, cursor:"pointer", fontSize:14, fontWeight:600 }}>
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PaintingTracker({ user, universe, onAchievement, unlockedIds = [], onUpdateUnlocked }) {
  const { t } = useLang();
  const [tab,            setTab]          = useState("gallery");
  const [minis,          setMinis]        = useState([]);
  const [completedMinis, setCompletedMinis] = useState([]);
  const [paints,         setPaintsMap]    = useState({});
  const [loading,        setLoading]      = useState(true);
  const [modal,          setModal]        = useState(null);
  const [lightboxMini,   setLightboxMini]   = useState(null);
  const [lightboxIdx,    setLightboxIdx]    = useState(0);
  const [filter,         setFilter]         = useState("All");

  // keep unlockedIds in a ref so the achievement effect never has stale closure
  const unlockedIdsRef = useRef(unlockedIds);
  useEffect(() => { unlockedIdsRef.current = unlockedIds; }, [unlockedIds]);

  // ─── Photo URL helpers ───────────────────────────────────────────────────

  const getPhotoUrls = (m) => {
    const raw = m?.photo_url ?? "";
    if (!raw) return [];
    try { if (raw.startsWith("[")) { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.filter(Boolean) : []; } } catch {}
    return [raw];
  };

  const getCoverUrl = (m) => getPhotoUrls(m)[0] || "";

  // ─── Load minis ──────────────────────────────────────────────────────────

  const loadMinis = useCallback(async () => {
    setLoading(true);
    try {
      let data;
      if ((tab === "collection" || tab === "army") && user) {
        data = await db.get("miniatures", `user_id=eq.${user.id}&universe=eq.${universe}`);
      } else {
        data = await db.get("miniatures", `is_public=eq.true&universe=eq.${universe}`);
        data = [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      setMinis(data);

      // Track completed minis + write missing timestamps to localStorage.
      // ONLY derive achievements from the user's OWN collection (collection/army
      // tabs). The gallery shows everyone's public minis — counting those would
      // let a brand-new user unlock trophies just by browsing other painters'
      // work. Gallery loads leave the user's own completedMinis untouched.
      const isOwnData = (tab === "collection" || tab === "army");
      if (user?.id && data && isOwnData) {
        const lsKey = `wh40k_painted_${user.id}`;
        let ts = {};
        try { ts = JSON.parse(localStorage.getItem(lsKey) || '{}'); } catch {}
        let changed = false;
        data.filter(m => parseStatuses(m.status).includes('completed')).forEach(m => {
          if (!ts[m.id]) { ts[m.id] = new Date().toISOString(); changed = true; }
        });
        if (changed) localStorage.setItem(lsKey, JSON.stringify(ts));
        setCompletedMinis(
          data.filter(m => parseStatuses(m.status).includes('completed'))
              .map(m => ({ id: m.id, faction: m.faction || "", completedAt: ts[m.id] || m.created_at }))
        );
      }

      // Load paints for all minis in one query
      const map = {};
      if (data.length) {
        const ids = data.map(m => m.id).join(',');
        const allPaints = await db.get("miniature_paints", `miniature_id=in.(${ids})`);
        if (allPaints && !allPaints._error && Array.isArray(allPaints)) {
          allPaints.forEach(p => {
            if (!map[p.miniature_id]) map[p.miniature_id] = [];
            map[p.miniature_id].push(p);
          });
        }
      }
      setPaintsMap(map);
    } finally {
      setLoading(false);
    }
  }, [tab, user, universe]);

  useEffect(() => { loadMinis(); }, [loadMinis]);

  // ─── Check painting achievements whenever completedMinis changes ─────────
  useEffect(() => {
    if (!completedMinis.length || !user?.id || !onAchievement) return;
    const nowUnlocked = computePaintingAchievements(completedMinis);
    const newIds = diffAchievements(unlockedIdsRef.current, nowUnlocked);
    if (!newIds.length) return;
    const merged = [...unlockedIdsRef.current, ...newIds];
    onUpdateUnlocked?.(merged);
    const defs = newIds.map(id => achievementFromId(id)).filter(Boolean)
                      .map(d => ({...d, _universe: universe}));
    onAchievement(defs);
  }, [completedMinis]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filtered minis ────────────────────────────────────────────────────

  const factions = ["All", ...new Set(minis.map((m) => m.faction).filter(Boolean))];
  const displayed = filter === "All"
    ? minis
    : minis.filter((m) => m.faction === filter);

  // ─── Army data (owned units from My Army tab) ──────────────────────────

  const armyData = useMemo(() => {
    const lsKey = `wh40k_army_${user?.id || 'anon'}_${universe}`;
    try { return JSON.parse(localStorage.getItem(lsKey)) || { followed: [], units: {} }; }
    catch { return { followed: [], units: {} }; }
  }, [user?.id, universe, tab]);

  const ownedUnits = useMemo(() => {
    const result = [];
    Object.entries(armyData.units).forEach(([faction, units]) => {
      Object.entries(units).forEach(([unit, status]) => {
        if (status === 'owned') result.push({ faction, unit });
      });
    });
    return result;
  }, [armyData]);

  // ─── Render ────────────────────────────────────────────────────────────

  const theme = universe === 'aos' ? C_AOS : C;

  return (
    <ThemeCtx.Provider value={theme}>
    <div style={{ minHeight:"100%", background:theme.bg, paddingBottom:80 }}>

      {/* ── TAB HEADER ────────────────────────────────────────────── */}
      <div style={{ position:"sticky", top:0, zIndex:10, background:theme.surface,
                    borderBottom:`1px solid ${theme.border}`, padding:"0 16px" }}>
        <div style={{ display:"flex", gap:0 }}>
          {[
            { id:"gallery",    label:t("painting.tabs.gallery") },
            { id:"army",       label:t("painting.tabs.army") },
            { id:"collection", label:t("painting.tabs.collection") },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex:1, padding:"14px 8px", background:"transparent",
                       border:"none", borderBottom:`2px solid ${tab===id ? theme.gold : "transparent"}`,
                       color:tab===id ? theme.gold : theme.muted,
                       fontFamily:"'Cinzel',serif", fontSize:11,
                       letterSpacing:2, cursor:"pointer", transition:"all 0.2s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ARMY TAB ──────────────────────────────────────────────── */}
      {tab === "army" && (
        <ArmyTab
          userId={user?.id}
          universe={universe}
          minis={minis}
          onGoToSection={(faction) => { setTab("collection"); setFilter(faction); }}
        />
      )}

      {/* ── COLLECTION STATS ──────────────────────────────────────── */}
      {tab === "collection" && minis.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, padding:"12px 16px 0" }}>
          {STATUS.filter(s => s.id !== 'owned').map(s=>{
            const cnt=minis.filter(m=>parseStatuses(m.status).includes(s.id)).length;
            return(
              <div key={s.id} style={{background:theme.card,border:`1px solid ${cnt>0?s.color+"44":theme.border}`,borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
                <div style={{fontSize:16,marginBottom:2}}>{s.icon}</div>
                <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:16,color:cnt>0?s.color:theme.dim}}>{cnt}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:theme.muted,letterSpacing:1,lineHeight:1.2}}>{t(`painting.status.${s.tkey}`)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FACTION FILTER + GRID ─────────────────────────────────── */}
      {tab !== "army" && (
      <>
      <div style={{ overflowX:"auto", padding:"12px 16px 0",
                    display:"flex", gap:8, scrollbarWidth:"none" }}>
        {factions.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ flexShrink:0, padding:"5px 12px", borderRadius:20,
                     border:`1px solid ${filter===f ? theme.gold : theme.border}`,
                     background:filter===f ? `${theme.gold}22` : "transparent",
                     color:filter===f ? theme.gold : theme.muted,
                     fontFamily:"'Cinzel',serif", fontSize:10,
                     letterSpacing:1, cursor:"pointer" }}>
            {f}
          </button>
        ))}
      </div>

      {/* ── GRID ──────────────────────────────────────────────────── */}
      <div style={{ padding:"16px" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:theme.muted,
                        fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:2 }}>
            ⚙ Loading…
          </div>
        ) : tab === "collection" && ownedUnits.length > 0 ? (
          // ── Grouped view (My Collection with army sections) ────────
          <>
            {ownedUnits
              .filter(({ faction }) => filter === "All" || faction === filter)
              .map(({ faction, unit }) => {
                const sectionMinis = minis.filter(
                  m => m.faction === faction && m.unit_type === unit
                );
                return (
                  <CollectionSection
                    key={`${faction}|||${unit}`}
                    faction={faction}
                    unit={unit}
                    minis={sectionMinis}
                    paintsMap={paints}
                    userId={user?.id}
                    onEdit={m => setModal(m)}
                    onAdd={() => setModal({ faction, unit_type: unit })}
                  />
                );
              })
            }
            {/* Ungrouped minis (not linked to any owned army unit) */}
            {(() => {
              const ungrouped = minis.filter(m =>
                !ownedUnits.some(u => u.faction === m.faction && u.unit === m.unit_type) &&
                (filter === "All" || m.faction === filter)
              );
              if (!ungrouped.length) return null;
              return (
                <div style={{ marginTop:24, paddingTop:16, borderTop:`1px solid ${theme.border}` }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:theme.muted,
                                letterSpacing:3, textTransform:"uppercase", marginBottom:12 }}>
                    Other Models
                  </div>
                  <div style={{ display:"grid",
                                gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12 }}>
                    {ungrouped.map(m => (
                      <div key={m.id} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                        <MiniCard mini={m} paints={paints[m.id]||[]}
                          isOwner={user?.id === m.user_id}
                          onEdit={() => setModal(m)} onClick={() => setModal(m)} />
                        {user?.id === m.user_id && ownedUnits.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={async e => {
                              if (!e.target.value) return;
                              const [f, u] = e.target.value.split("|||");
                              await db.update("miniatures", m.id, { faction: f, unit_type: u });
                              loadMinis();
                            }}
                            style={{ background:theme.surface, border:`1px solid ${theme.border}`,
                                     borderRadius:6, padding:"5px 8px", color:theme.muted,
                                     fontSize:10, fontFamily:"'Cinzel',serif",
                                     width:"100%", cursor:"pointer", boxSizing:"border-box" }}>
                            <option value="">📌 Move to section…</option>
                            {ownedUnits.map(({ faction:f, unit:u }) => (
                              <option key={`${f}|||${u}`} value={`${f}|||${u}`}>{u}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        ) : displayed.length === 0 ? (
          // ── Empty state ────────────────────────────────────────────
          <div style={{ textAlign:"center", padding:60 }}>
            <div style={{ fontSize:48, marginBottom:12, opacity:0.3 }}>⚙</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:theme.muted,
                          letterSpacing:2 }}>
              {tab === "collection"
                ? "No miniatures in your collection"
                : "No miniatures in the gallery"}
            </div>
            {tab === "collection" && user && (
              <button onClick={() => setModal("add")}
                style={{ marginTop:20, padding:"12px 24px", borderRadius:10,
                         background:`${theme.gold}22`, border:`1px solid ${theme.gold}`,
                         color:theme.gold, fontFamily:"'Cinzel',serif", fontSize:12,
                         letterSpacing:2, cursor:"pointer" }}>
                + Add your First
              </button>
            )}
          </div>
        ) : (
          // ── Flat grid (gallery or collection without army data) ────
          <div style={{ display:"grid",
                        gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",
                        gap:12 }}>
            {(tab === "gallery" ? displayed.filter(m => getCoverUrl(m)) : displayed).map((m) => {
              const photoCount = tab === "gallery" ? getPhotoUrls(m).length : 0;
              return (
                <div key={m.id} style={{ position: "relative" }}>
                  <MiniCard
                    mini={m}
                    paints={paints[m.id] || []}
                    isOwner={user?.id === m.user_id}
                    onEdit={() => setModal(m)}
                    onClick={tab === "gallery" ? () => { setLightboxMini(m); setLightboxIdx(0); } : () => setModal(m)}
                  />
                  {photoCount > 1 && (
                    <div style={{
                      position: "absolute", bottom: 8, right: 8,
                      background: "rgba(0,0,0,0.72)", borderRadius: 20,
                      padding: "2px 7px", fontSize: 10,
                      color: "#d4cbb8", fontFamily: "'Cinzel',serif",
                      pointerEvents: "none",
                    }}>📷 {photoCount}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      </>)}

      {/* ── FAB: Add mini (solo My Collection e se loggati) ───────── */}
      {tab === "collection" && user && (
        <button
          onClick={() => setModal("add")}
          style={{ position:"fixed", bottom:80, right:20, zIndex:50,
                   width:56, height:56, borderRadius:"50%",
                   background:`linear-gradient(135deg,${theme.gold},#8a6f28)`,
                   border:"none", color:theme.bg, fontSize:24,
                   cursor:"pointer", boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
                   display:"flex", alignItems:"center", justifyContent:"center" }}>
          +
        </button>
      )}

      {/* ── MODAL ─────────────────────────────────────────────────── */}
      {modal && user && (
        <MiniModal
          mini={modal === "add" ? null : modal}
          userId={user.id}
          universe={universe}
          onSave={() => { setModal(null); loadMinis(); }}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── NOT LOGGED IN CTA (collection tab) ───────────────────── */}
      {tab === "collection" && !user && (
        <div style={{ padding:40, textAlign:"center" }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:14, color:theme.muted,
                        letterSpacing:1, lineHeight:2 }}>
            Sign in with Google to manage your collection
          </div>
        </div>
      )}

      {/* ── LIGHTBOX ──────────────────────────────────────────────── */}
      {lightboxMini && (() => {
        const photos = getPhotoUrls(lightboxMini);
        const idx    = Math.min(lightboxIdx, photos.length - 1);
        const hasPrev = idx > 0;
        const hasNext = idx < photos.length - 1;
        const navBtn = (show, onClick, label) => show ? (
          <button
            onClick={e => { e.stopPropagation(); onClick(); }}
            aria-label={label === "‹" ? "Previous photo" : "Next photo"}
            style={{
              position: "absolute", top: "50%", transform: "translateY(-50%)",
              ...(label === "‹" ? { left: 12 } : { right: 12 }),
              background: "rgba(0,0,0,0.55)", border: `1px solid ${theme.border}`,
              color: theme.text, borderRadius: "50%",
              width: 40, height: 40, fontSize: 22,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >{label}</button>
        ) : null;
        return (
          <div
            onClick={() => setLightboxMini(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 999,
              background: "rgba(0,0,0,0.96)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "24px 60px",
            }}
          >
            <button
              onClick={() => setLightboxMini(null)}
              aria-label="Close image"
              style={{
                position: "absolute", top: 16, right: 16,
                background: "transparent", border: `1px solid ${theme.border}`,
                color: theme.muted, borderRadius: 8,
                padding: "6px 14px", fontFamily: "'Cinzel',serif",
                fontSize: 14, cursor: "pointer",
              }}
            >✕</button>

            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
              {navBtn(hasPrev, () => setLightboxIdx(idx - 1), "‹")}
              <img
                key={idx}
                src={photos[idx]}
                alt={`${lightboxMini.name} ${idx + 1}`}
                onClick={e => e.stopPropagation()}
                style={{
                  maxWidth: "80vw", maxHeight: "70vh",
                  objectFit: "contain", borderRadius: 10,
                  boxShadow: "0 8px 48px rgba(0,0,0,0.8)",
                }}
              />
              {navBtn(hasNext, () => setLightboxIdx(idx + 1), "›")}
            </div>

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <div style={{
                fontFamily: "'Cinzel Decorative',serif",
                fontSize: 15, color: theme.text, letterSpacing: 1, marginBottom: 6,
              }}>{lightboxMini.name}</div>
              {photos.length > 1 && (
                <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                  {photos.map((_, i) => (
                    <div
                      key={i}
                      onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                      style={{
                        width: i === idx ? 18 : 8, height: 8, borderRadius: 4,
                        background: i === idx ? theme.gold : theme.muted,
                        cursor: "pointer", transition: "all 0.2s",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
    </ThemeCtx.Provider>
  );
}
