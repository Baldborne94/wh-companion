// src/components/PaintingTracker.jsx
// ══════════════════════════════════════════════════════════════════════════
// WH40K Companion — Painting Tracker
// Features: Community Gallery, My Collection, Add/Edit modal,
//           Citadel paint picker, photo upload, AI color recommendations
// ══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { db, storage } from "../lib/supabase";
import { sb } from "../lib/sb";
import { achievementFromId, computePaintingAchievements, diffAchievements } from "../lib/achievements";

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
  { id: "owned",      icon: "📦", label: "Owned",      color: "#4a4a4a" },
  { id: "assembled",  icon: "🔧", label: "Assembled",  color: "#2a5a6a" },
  { id: "base_coat",  icon: "🎨", label: "Base Coat",  color: "#5a2a7a" },
  { id: "painted",    icon: "🖌️", label: "Painted",    color: "#7a5a10" },
  { id: "completed",  icon: "✅", label: "Completed",  color: "#1a6a2a" },
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

const PAINT_RANGES = ["Base","Shade","Layer","Dry","Contrast","Technical"];
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

// ─── FACTIONS & UNITS ─────────────────────────────────────────────────────

const FACTIONS_40K = {
  "Space Marines":        ["Intercessors","Hellblasters","Aggressors","Terminators","Assault Marines","Devastators","Chaplain","Librarian","Captain","Ancient","Redemptor Dreadnought"],
  "Blood Angels":         ["Death Company","Sanguinary Guard","Sanguinary Priest","Mephiston","Dante","Lemartes"],
  "Dark Angels":          ["Deathwing Terminators","Ravenwing Black Knights","Interrogator-Chaplain","Azrael","Belial"],
  "Space Wolves":         ["Blood Claws","Grey Hunters","Long Fangs","Wolf Guard","Thunderwolf Cavalry","Bjorn"],
  "Black Templars":       ["Crusader Squad","Emperor's Champion","Grimaldus"],
  "Chaos Space Marines":  ["Chaos Warriors","Terminators","Obliterators","Havocs","Daemon Prince","Chaos Lord"],
  "Death Guard":          ["Plague Marines","Blightlord Terminators","Mortarion","Daemon Prince of Nurgle","Foetid Bloat-drone"],
  "Thousand Sons":        ["Rubric Marines","Scarab Occult Terminators","Magnus the Red","Ahriman"],
  "World Eaters":         ["Berzerkers","Jakhals","Angron","Eightbound"],
  "Emperor's Children":   ["Noise Marines","Fulgrim","Lucius the Eternal"],
  "Night Lords":          ["Chaos Space Marines","Raptors","Konrad Curze"],
  "Iron Warriors":        ["Obliterators","Warsmith","Perturabo"],
  "Astra Militarum":      ["Infantry Squad","Veterans","Rough Riders","Leman Russ","Commissar","Sentinel"],
  "Adeptus Mechanicus":   ["Skitarii Rangers","Skitarii Vanguard","Kataphron","Onager Dunecrawler","Tech-Priest"],
  "Adepta Sororitas":     ["Battle Sisters","Celestians","Retributors","Penitent Engine","Cannoness","Repentia"],
  "Grey Knights":         ["Strike Squad","Terminators","Nemesis Dreadknight","Grand Master"],
  "Necrons":              ["Necron Warriors","Immortals","Lychguard","Triarch Praetorians","Overlord","C'tan"],
  "Tyranids":             ["Hormagaunts","Termagants","Genestealers","Warriors","Hive Tyrant","Carnifex","Trygon"],
  "Orks":                 ["Boyz","Nobz","Mega Nobz","Warboss","Deff Dread","Gretchin","Flash Gitz"],
  "T'au Empire":          ["Fire Warriors","Pathfinders","Crisis Battlesuit","Riptide","Commander","Ghostkeel"],
  "Aeldari":              ["Guardians","Dire Avengers","Howling Banshees","Wraithguard","Avatar of Khaine","Farseer"],
  "Drukhari":             ["Kabalite Warriors","Wyches","Incubi","Grotesques","Archon"],
  "Custodes":             ["Custodian Guard","Allarus Custodians","Vertus Praetors","Shield-Captain"],
  "Leagues of Votann":    ["Hearthkyn Warriors","Hearthguard","Sagitaur","Einhyr Champion"],
  "Genestealer Cults":    ["Neophyte Hybrids","Acolyte Hybrids","Aberrants","Patriarch"],
};

const FACTIONS_AOS = {
  // ── Order ──────────────────────────────────────────────────────────────
  "Stormcast Eternals":    ["Liberators","Judicators","Sequitors","Evocators","Paladins","Praetors","Knight-Incantor","Lord-Arcanum","Yndrasta","Celestant-Prime","Vandus Hammerhand"],
  "Cities of Sigmar":      ["Freeguild Guard","Freeguild Steelhelms","Irondrakes","Darkshards","Freeguild Cavaliers","Cogsmith","Tahlia Vedra"],
  "Sylvaneth":             ["Dryads","Tree-Revenants","Spite-Revenants","Kurnoth Hunters","Arch-Revenant","Drycha Hamadreth","Alarielle the Everqueen"],
  "Fyreslayers":           ["Vulkite Berzerkers","Hearthguard Berzerkers","Auric Runemaster","Auric Runesmiter","Doomseeker","Magmadroth","Runesons"],
  "Kharadron Overlords":   ["Arkanaut Company","Grundstok Thunderers","Grundstok Gunhauler","Arkanaut Frigate","Ironclad","Endrinmaster","Aether-Khemist"],
  "Seraphon":              ["Saurus Warriors","Saurus Knights","Saurus Guard","Skinks","Kroxigor","Terradon Riders","Slann Starmaster","Lord Kroak","Engine of the Gods"],
  "Lumineth Realm-lords":  ["Vanari Auralan Wardens","Vanari Dawnriders","Vanari Bladelords","Alarith Stoneguard","Alarith Spirit of the Mountain","Teclis","Tyrion"],
  "Daughters of Khaine":   ["Witch Aelves","Blood Sisters","Blood Stalkers","Melusai Ironscale","Hag Queen","Morathi-Khaine","The Shadow Queen"],
  "Idoneth Deepkin":       ["Namarti Thralls","Namarti Reavers","Akhelian Guard","Akhelian Allopex","Akhelian Leviadon","Volturnos","Isharann Soulscryer"],
  // ── Chaos ──────────────────────────────────────────────────────────────
  "Slaves to Darkness":    ["Chaos Warriors","Chaos Knights","Chaos Marauders","Varanguard","Darkoath Marauders","Eternus","Chaos Lord","Daemon Prince"],
  "Blades of Khorne":      ["Bloodreavers","Blood Warriors","Bloodletters","Mighty Skullcrushers","Skullreapers","Skarbrand","Slaughterpriest","Exalted Greater Daemon"],
  "Disciples of Tzeentch": ["Tzaangors","Tzaangor Enlightened","Pink Horrors","Blue Horrors","Flamers","Screamers","Kairos Fateweaver","Lord of Change","Gaunt Summoner"],
  "Maggotkin of Nurgle":   ["Plaguebearers","Putrid Blightkings","Nurglings","Sloppity Bilepiper","Spoilpox Scrivener","Rotigus","Glottkin","Great Unclean One"],
  "Hedonites of Slaanesh": ["Blissbarb Archers","Myrmidesh Painbringers","Slaangor Fiendbloods","Symbaresh Twinsouls","Keeper of Secrets","Sigvald","Glutos Orscollion"],
  "Skaven":                ["Clanrats","Stormvermin","Plague Monks","Rat Ogors","Warplock Jezzails","Hell Pit Abomination","Grey Seer","Thanquol & Boneripper"],
  "Beasts of Chaos":       ["Gors","Ungors","Bestigors","Bullgors","Centigors","Doombull","Ghorgon","Jabberslythe"],
  // ── Death ──────────────────────────────────────────────────────────────
  "Nighthaunt":            ["Chainrasps","Grimghast Reapers","Bladegheist Revenants","Hexwraiths","Dreadblade Harrows","Knight of Shrouds","Lady Olynder","Kurdoss Valentian"],
  "Ossiarch Bonereapers":  ["Mortek Guard","Kavalos Deathriders","Gothizzar Harvester","Morghast Archai","Morghast Harbingers","Katakros","Nagash"],
  "Flesh-eater Courts":    ["Crypt Ghouls","Crypt Flayers","Crypt Horrors","Varghulf Courtier","Abhorrant Archregent","Abhorrant Ghoul King","Ushoran"],
  "Soulblight Gravelords": ["Deadwalker Zombies","Deathrattle Skeletons","Black Knights","Blood Knights","Fell Bats","Mannfred von Carstein","Lauka Vai","Radukar the Beast"],
  // ── Destruction ────────────────────────────────────────────────────────
  "Orruk Warclans":        ["Ardboyz","Brutes","Gore-gruntas","Savage Orruks","Weirdnob Shaman","Megaboss on Maw-krusha","Gordrakk","Gutrippaz","Killaboss"],
  "Gloomspite Gitz":       ["Stabbas","Shootas","Boingrot Bounderz","Squig Herd","Squig Hoppers","Rockgut Troggoths","Dankhold Troggoth","Loonboss","Skragrott"],
  "Ogor Mawtribes":        ["Gluttons","Ironguts","Leadbelchers","Mournfang Pack","Stonehorn","Thundertusk","Frostlord","Butcher"],
  "Sons of Behemat":       ["Mancrusher Gargants","Warstomper Megagargant","Gatebreaker Megagargant","Kraken-eater Megagargant"],
  "Kruleboyz":             ["Gutrippaz","Hobgrot Slittaz","Man-skewer Boltboyz","Murknob with Belcha-banna","Swampcalla Shaman","Killaboss on Corpse-rippa Vulcha"],
};

// ─── AI RECOMMENDATIONS ───────────────────────────────────────────────────

async function getAiRecommendations(faction, unit, universe, photoUrls, availableBrands, miniName) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("NO_API_KEY");
  const game = universe === 'aos' ? 'Warhammer Age of Sigmar' : 'Warhammer 40,000';
  const hasPhotos = Array.isArray(photoUrls) && photoUrls.length > 0;
  const brands = availableBrands?.length ? availableBrands : ["Citadel"];
  const brandsStr = brands.join(", ");

  // System prompt: role + output schema — kept separate so visual attention isn't split
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
            {"type":"base|shade|layer|highlight|drybrush|contrast","paint":"exact paint name","hex":"#hexcode","note":"short tip"}
          ]
        }
      ]
    }
  ]
}
Constraints: 2-3 schemes · max 6 parts · max 4 steps per part · only use paints from: ${brandsStr} · paint names must be real existing products.`;

  // Convert photo URLs to base64 so Anthropic doesn't need to fetch them externally
  const toBase64 = async (url) => {
    const r = await fetch(url);
    const blob = await r.blob();
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res({ b64: reader.result.split(",")[1], mime: blob.type || "image/jpeg" });
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
  };

  // User message: base64 images first, then a short focused question
  let userMessage;
  if (hasPhotos) {
    const encoded = await Promise.all(photoUrls.map(toBase64));
    userMessage = [
      ...encoded.map(({ b64, mime }) => ({
        type: "image",
        source: { type: "base64", media_type: mime, data: b64 },
      })),
      { type: "text", text: `What ${game} miniature model is shown in these photos? Identify every distinct physical component you can actually see in the images, then suggest 2-3 colour schemes — one part per visible component, using only the allowed paint brands.${faction ? ` This model belongs to the ${faction} faction — use this only to inform lore-accurate colour choices, not to add parts that are not visible.` : ""}` },
    ];
  } else {
    const unitDesc = [unit, faction && `(${faction})`].filter(Boolean).join(" ");
    userMessage = `Suggest 2-3 colour schemes for a ${game} ${unitDesc} miniature. Cover all typical components for this unit.`;
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: hasPhotos ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${resp.status}`);
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
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── PAINT PICKER ─────────────────────────────────────────────────────────

function PaintPicker({ onSelect, onClose }) {
  const C = useContext(ThemeCtx);
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
          placeholder={`Search ${brand} paint…`}
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
              No colours found
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
      ⊕ Pinterest
    </a>
  );
}

// ─── PAINT ROW (editable — outside MiniModal to prevent remount) ─────────────

function PaintRow({ paint, onRemove, onUpdate, onReplace }) {
  const C = useContext(ThemeCtx);
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
          title="Edit"
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
            🎨 Change Paint
          </button>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.muted,
                            letterSpacing:2, marginBottom:4 }}>SECTION</div>
              <input value={partInput} onChange={e => setPartInput(e.target.value)}
                placeholder="e.g. Skin, Armour…"
                style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
                         padding:"7px 10px", color:C.text, fontSize:12,
                         width:"100%", boxSizing:"border-box" }}/>
            </div>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.muted,
                            letterSpacing:2, marginBottom:4 }}>USE</div>
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
              ✓ Save
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
            {st.label}
          </span>
        </div>
        {/* Edit button (owner only) */}
        {isOwner && (
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{ position:"absolute", top:8, left:8, background:"rgba(0,0,0,0.6)",
                     border:`1px solid ${C.border}`, borderRadius:6, color:C.gold,
                     padding:"4px 8px", fontFamily:"'Cinzel',serif", fontSize:10,
                     cursor:"pointer" }}>
            Edit
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
  const [selBrands,     setSelBrands]     = useState(["Citadel", "AK Interactive", "Army Painter"]);

  const hasPhotos = Array.isArray(photoUrls) && photoUrls.length > 0;

  const toggleBrand = (b) =>
    setSelBrands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);

  const load = async () => {
    if (!faction && !hasPhotos) { setError("Select a faction first"); return; }
    if (!selBrands.length) { setError("Select at least one paint brand"); return; }
    setLoading(true); setError(null); setData(null); setActiveScheme(0);
    try {
      const result = await getAiRecommendations(faction, unit || faction, universe, photoUrls, selBrands, miniName);
      setData(result);
      onDataChange?.(result);
      if (lsKey) localStorage.setItem(lsKey, JSON.stringify(result));
    } catch (e) {
      if (e.message === "NO_API_KEY") {
        setError("Add VITE_ANTHROPIC_API_KEY to your Vercel environment variables to enable AI suggestions.");
      } else {
        setError("AI error: " + (e.message || "check console"));
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
            ⚡ AI Color Advisor
          </div>
          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
            {data && lsKey
              ? "💾 Saved suggestions — click ⟳ to regenerate"
              : hasPhotos
                ? `📷 ${photoUrls.length} photo${photoUrls.length > 1 ? "s" : ""} · Claude will analyse your miniature`
                : "Claude suggests colour schemes · techniques · tips"}
          </div>
        </div>
        <button onClick={load} disabled={loading}
          style={{ flexShrink:0, background:loading ? C.dim : `${C.gold}22`,
                   border:`1px solid ${C.gold}`, borderRadius:8,
                   color:C.gold, padding:"8px 14px", fontFamily:"'Cinzel',serif",
                   fontSize:11, letterSpacing:1, cursor:loading ? "default" : "pointer",
                   opacity:loading ? 0.6 : 1 }}>
          {loading ? "⚙ Analysing…" : data ? "⟳ New Ideas" : "✦ Inspire Me"}
        </button>
      </div>

      {/* ── Brand filter ── */}
      <div style={{ padding:"8px 16px", borderBottom:`1px solid ${C.border}`,
                    display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.goldDim,
                       letterSpacing:2, textTransform:"uppercase", flexShrink:0 }}>
          My brands:
        </span>
        {BRANDS.map(b => {
          const on = selBrands.includes(b);
          return (
            <button key={b} onClick={() => toggleBrand(b)}
              style={{ padding:"3px 10px", borderRadius:20, cursor:"pointer",
                       border:`1px solid ${on ? C.gold : C.border}`,
                       background: on ? `${C.gold}22` : "transparent",
                       color: on ? C.gold : C.muted,
                       fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1,
                       transition:"all 0.15s" }}>
              {b}
            </button>
          );
        })}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding:"20px 16px", textAlign:"center", color:C.muted, fontSize:12 }}>
          {hasPhotos
            ? "🔍 Analysing your miniature photo…"
            : "🎨 Generating schemes…"}
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
              Identified: <span style={{ color:C.text }}>{data.miniature}</span>
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
                    Techniques
                  </div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    {scheme.techniques.map((t, i) => (
                      <span key={i}
                        style={{ background:C.card, border:`1px solid ${C.border}`,
                                 borderRadius:20, padding:"3px 9px",
                                 fontSize:10, color:C.text }}>
                        {t}
                      </span>
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
                      const citadel = CITADEL_PAINTS.find(
                        p => p.name.toLowerCase() === step.paint?.toLowerCase()
                      );
                      const hex = citadel?.hex || step.hex || "#555";
                      return (
                        <div key={si}
                          style={{ display:"flex", alignItems:"center", gap:8,
                                   background:C.card, borderRadius:6, padding:"7px 10px" }}>
                          <div style={{ width:20, height:20, borderRadius:4, background:hex,
                                        border:"1px solid rgba(255,255,255,0.12)", flexShrink:0 }}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <span style={{ color:C.text, fontSize:12 }}>{step.paint}</span>
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
                          <button title="Add to my scheme"
                            onClick={() => onApply({
                              paint_name:  step.paint,
                              paint_hex:   hex,
                              paint_range: citadel?.range || "",
                              part_name:   part.part,
                              usage_type:  step.type,
                              paint_brand: "Citadel",
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
    const slots = 4 - photoUrls.length;
    if (slots <= 0) { alert("Maximum 4 photos"); return; }
    setPhotoLoading(true);
    try {
      const newUrls = [];
      for (const file of files.slice(0, slots)) {
        const path = `${userId}/${Date.now()}_${file.name}`;
        await storage.upload("miniatures", path, file);
        newUrls.push(storage.url("miniatures", path));
      }
      setPhotoUrls(prev => [...prev, ...newUrls]);
    } catch (err) {
      alert("Photo upload error: " + err.message);
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
    if (!form.name.trim()) { alert("Name is required!"); return; }
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
          // eslint-disable-next-line no-unused-vars
          const { id: _id, _new, ...rest } = p;
          await db.insert("miniature_paints", { ...rest, miniature_id: miniId });
        }
      }

      onSave();
    } catch (err) {
      alert("Save error: " + err.message);
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
        throw new Error("Non sei il proprietario di questa miniatura o la sessione è scaduta.");
      }
      onSave();
    } catch (err) {
      alert("Errore cancellazione: " + err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:800,
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
            {isEdit ? "Edit Miniature" : "Add Miniature"}
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
                {deleteConfirm ? "⚠ Confirm Delete" : "🗑 Delete"}
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
          <FormLabel>Miniature Name</FormLabel>
          <FormInput value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Miniature name"/>

          {/* Faction + Unit */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:4 }}>
            <div>
              <FormLabel>Faction</FormLabel>
              <select value={form.faction}
                onChange={(e) => setForm((f) => ({ ...f, faction:e.target.value, unit_type:"" }))}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8,
                         padding:"10px 14px", color:form.faction ? C.text : C.muted,
                         fontSize:13, width:"100%", boxSizing:"border-box" }}>
                <option value="">— Faction —</option>
                {Object.keys(FACTIONS).map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>Unit / Specific Model</FormLabel>
              {/* Dropdown quick-filler */}
              {units.length > 0 && (
                <select value=""
                  onChange={e => { if (e.target.value) setForm(f => ({ ...f, unit_type: e.target.value })); }}
                  style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:"8px 8px 0 0",
                           padding:"8px 14px", color:C.muted, fontSize:11,
                           width:"100%", boxSizing:"border-box", borderBottom:"none" }}>
                  <option value="">— Quick select unit —</option>
                  {units.map(u => <option key={u}>{u}</option>)}
                </select>
              )}
              {/* Editable text — what gets saved and sent to AI */}
              <input value={form.unit_type}
                onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))}
                placeholder="Type the exact model name (e.g. Loonboss on Giant Cave Squig)…"
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
                  ↗ Browse {form.faction} miniatures on Lexicanum
                </a>
              )}
            </div>
          </div>

          {/* Status */}
          <FormLabel>Progress</FormLabel>
          <StatusStepper value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status:v }))}/>

          {/* Photos (up to 4) */}
          <FormLabel>Photos ({photoUrls.length}/4)</FormLabel>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-start" }}>
            {photoUrls.map((url, i) => (
              <div key={i} style={{ position:"relative", flexShrink:0 }}>
                <img src={url} alt={`photo ${i+1}`}
                  style={{ width:80, height:80, objectFit:"cover",
                           borderRadius:8, border:`1px solid ${i===0 ? C.gold : C.border}`,
                           display:"block" }}/>
                {i === 0 && (
                  <div style={{ position:"absolute", bottom:3, left:3,
                                background:"rgba(0,0,0,0.7)", borderRadius:3,
                                padding:"1px 4px", fontSize:8,
                                fontFamily:"'Cinzel',serif", color:C.gold }}>
                    cover
                  </div>
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
            {photoUrls.length < 4 && (
              <button onClick={() => photoInput.current.click()} disabled={photoLoading}
                style={{ width:80, height:80, borderRadius:8, flexShrink:0,
                         background:"transparent", border:`2px dashed ${C.goldDim}`,
                         color:C.gold, fontFamily:"'Cinzel',serif", fontSize:10,
                         letterSpacing:1, cursor:"pointer",
                         opacity:photoLoading ? 0.5 : 1,
                         display:"flex", flexDirection:"column",
                         alignItems:"center", justifyContent:"center", gap:4 }}>
                {photoLoading ? "⚙" : <>📷<span>Add</span></>}
              </button>
            )}
            <input ref={photoInput} type="file" accept="image/*" multiple
              style={{ display:"none" }} onChange={handlePhoto}/>
          </div>

          {/* Notes */}
          <FormLabel>General Notes</FormLabel>
          <FormInput multiline value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes:e.target.value }))}
            placeholder="Inspiration, basing, conversions…"/>

          {/* ── COLOR SCHEME ────────────────────────────────────────── */}
          <FormLabel>Colour Scheme</FormLabel>

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
                                letterSpacing:1, marginBottom:4 }}>PART</div>
                  <input value={partInput}
                    onChange={(e) => setPartInput(e.target.value)}
                    placeholder="e.g. Armour, Skin…"
                    style={{ background:C.surface, border:`1px solid ${C.border}`,
                             borderRadius:6, padding:"8px 10px", color:C.text,
                             fontSize:12, width:"100%", boxSizing:"border-box" }}/>
                </div>
                <div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:C.muted,
                                letterSpacing:1, marginBottom:4 }}>USE</div>
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
                  ✓ Add Colour
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
              + Add Paint (Citadel · AK · Army Painter)
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
          <FormLabel>Colour Scheme Notes</FormLabel>
          <FormInput multiline value={form.color_scheme_notes}
            onChange={(e) => setForm((f) => ({ ...f, color_scheme_notes:e.target.value }))}
            placeholder="Free notes on the scheme, techniques used, inspiration…"/>

          {/* Public toggle */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        marginTop:16, padding:"12px 14px", background:C.card,
                        borderRadius:8, border:`1px solid ${C.border}` }}>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:C.text,
                            letterSpacing:1 }}>
                Publish to Gallery
              </div>
              <div style={{ color:C.muted, fontSize:11, marginTop:2 }}>
                Visible to all users
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── MAIN COMPONENT: PaintingTracker ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── BATTLE LOG ───────────────────────────────────────────────────────────────
const BATTLE_RESULTS=[
  {id:"W",label:"Victory",icon:"⚔️",color:"#4aaa6a"},
  {id:"L",label:"Defeat", icon:"💀",color:"#b03030"},
  {id:"D",label:"Draw",   icon:"⚖️",color:"#c9a84c"},
];

function BattleLog({userId}){
  const C = useContext(ThemeCtx);
  const lsKey=`wh40k_battles_${userId||'anon'}`;
  const [battles,setBattles]=useState(()=>{try{return JSON.parse(localStorage.getItem(lsKey))||[];}catch{return[];}});
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({date:new Date().toISOString().split("T")[0],myArmy:"",oppArmy:"",result:"W",points:"",notes:""});

  const save=()=>{
    if(!form.myArmy.trim()||!form.result)return;
    const updated=[{...form,id:Date.now()},...battles];
    setBattles(updated);
    localStorage.setItem(lsKey,JSON.stringify(updated));
    setShowAdd(false);
    setForm({date:new Date().toISOString().split("T")[0],myArmy:"",oppArmy:"",result:"W",points:"",notes:""});
  };
  const remove=(id)=>{const updated=battles.filter(b=>b.id!==id);setBattles(updated);localStorage.setItem(lsKey,JSON.stringify(updated));};

  const W=battles.filter(b=>b.result==="W").length;
  const L=battles.filter(b=>b.result==="L").length;
  const D=battles.filter(b=>b.result==="D").length;

  const inp=(placeholder,field,type="text")=>(
    <input type={type} value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))} placeholder={placeholder}
      style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box",colorScheme:"dark"}}/>
  );

  return(
    <div style={{padding:"16px"}}>
      {/* Stats */}
      {battles.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
          {[{l:"Victories",v:W,c:"#4aaa6a"},{l:"Defeats",v:L,c:"#b03030"},{l:"Draws",v:D,c:"#c9a84c"}].map(s=>(
            <div key={s.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px",textAlign:"center"}}>
              <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:22,color:s.c}}>{s.v}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add battle */}
      {!showAdd?(
        <button onClick={()=>setShowAdd(true)} style={{width:"100%",padding:"14px",borderRadius:10,background:`${C.gold}22`,border:`1px solid ${C.gold}`,color:C.gold,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer",marginBottom:16}}>
          + Log Battle
        </button>
      ):(
        <div style={{background:C.card,border:`1px solid ${C.gold}55`,borderRadius:12,padding:"16px",marginBottom:16,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.gold,letterSpacing:2,marginBottom:4}}>NEW BATTLE</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {inp("My Army","myArmy")}
            {inp("Opponent's Army","oppArmy")}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
            {inp("Date","date","date")}
            {inp("Points","points")}
          </div>
          {/* Result */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {BATTLE_RESULTS.map(r=>(
              <button key={r.id} onClick={()=>setForm(f=>({...f,result:r.id}))}
                style={{padding:"10px",borderRadius:8,border:`1px solid ${form.result===r.id?r.color:C.dim}`,background:form.result===r.id?`${r.color}22`:"transparent",color:form.result===r.id?r.color:C.muted,fontFamily:"'Cinzel',serif",fontSize:11,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <span style={{fontSize:18}}>{r.icon}</span>{r.label}
              </button>
            ))}
          </div>
          <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notes (tactics, key moments…)" rows={2}
            style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:12,resize:"vertical"}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={save} style={{flex:1,padding:"12px",borderRadius:8,background:`linear-gradient(135deg,${C.gold},#8a6f28)`,border:"none",color:C.bg,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,cursor:"pointer"}}>✓ Save</button>
            <button onClick={()=>setShowAdd(false)} style={{padding:"12px 16px",borderRadius:8,background:"transparent",border:`1px solid ${C.dim}`,color:C.muted,cursor:"pointer"}}>✕</button>
          </div>
        </div>
      )}

      {/* Battle history */}
      {battles.length===0?(
        <div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:1}}>
          No battles logged. For the Emperor!
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {battles.map(b=>{
            const r=BATTLE_RESULTS.find(x=>x.id===b.result);
            return(
              <div key={b.id} style={{background:C.card,border:`1px solid ${r?.color||C.border}33`,borderLeft:`3px solid ${r?.color||C.border}`,borderRadius:8,padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
                <span style={{fontSize:22,flexShrink:0}}>{r?.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:C.text}}>{b.myArmy}{b.oppArmy?` vs ${b.oppArmy}`:""}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{b.date}{b.points?` · ${b.points}pt`:""}{b.notes?` · ${b.notes}`:""}</div>
                </div>
                <button onClick={()=>remove(b.id)} style={{background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:16,padding:"2px 4px"}}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── COLLECTION SECTION ───────────────────────────────────────────────────

function CollectionSection({ faction, unit, minis, paintsMap, userId, onEdit, onAdd }) {
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
            {minis.length > 0 && ` · ${minis.length} ${minis.length === 1 ? "model" : "models"}`}
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
                    {st.count} {st.label}
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
            { label:"Armies",   value:data.followed.length, color:C.gold },
            { label:"Owned",    value:totalOwned,            color:"#4aaa6a" },
            { label:"Wishlist", value:totalWishlist,         color:"#4a8adc" },
          ].map(s => (
            <div key={s.label} style={{ background:C.card, border:`1px solid ${C.border}`,
                                        borderRadius:8, padding:"10px 4px", textAlign:"center" }}>
              <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:20, color:s.color }}>
                {s.value}
              </div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:C.muted,
                            letterSpacing:2, textTransform:"uppercase" }}>
                {s.label}
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
                                    {st.count} {st.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button onClick={() => setUnitStatus(faction, unit, 'wishlist')} title="Wishlist"
                          style={{ flexShrink:0, padding:"4px 8px", borderRadius:6, cursor:"pointer",
                                   border:`1px solid ${unitStatus==='wishlist' ? '#4a8adc' : C.dim}`,
                                   background:unitStatus==='wishlist' ? '#4a8adc22' : "transparent",
                                   color:unitStatus==='wishlist' ? '#4a8adc' : C.muted,
                                   fontSize:11, transition:"all 0.15s" }}>
                          🛒
                        </button>
                        <button onClick={() => setUnitStatus(faction, unit, 'owned')} title="Owned"
                          style={{ flexShrink:0, padding:"4px 8px", borderRadius:6, cursor:"pointer",
                                   border:`1px solid ${unitStatus==='owned' ? '#4aaa6a' : C.dim}`,
                                   background:unitStatus==='owned' ? '#4aaa6a22' : "transparent",
                                   color:unitStatus==='owned' ? '#4aaa6a' : C.muted,
                                   fontSize:11, transition:"all 0.15s" }}>
                          📦
                        </button>
                        {unitStatus === 'owned' && (
                          <button onClick={() => onGoToSection(faction)}
                            title="Go to My Collection"
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
                      placeholder="Add custom model…"
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
  const [tab,            setTab]          = useState("gallery");
  const [minis,          setMinis]        = useState([]);
  const [completedMinis, setCompletedMinis] = useState([]);
  const [paints,         setPaintsMap]    = useState({});
  const [loading,        setLoading]      = useState(true);
  const [modal,          setModal]        = useState(null);
  const [filter,         setFilter]       = useState("All");

  // keep unlockedIds in a ref so the achievement effect never has stale closure
  const unlockedIdsRef = useRef(unlockedIds);
  useEffect(() => { unlockedIdsRef.current = unlockedIds; }, [unlockedIds]);

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

      // Track completed minis + write missing timestamps to localStorage
      if (user?.id && data) {
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

      // Load paints for all minis
      const map = {};
      await Promise.all(
        data.map(async (m) => {
          const ps = await db.get("miniature_paints", `miniature_id=eq.${m.id}`);
          map[m.id] = ps;
        })
      );
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
            { id:"gallery",    label:"🏛 Community Gallery" },
            { id:"army",       label:"⚔ My Army" },
            { id:"collection", label:"⚙ My Collection" },
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
                <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:theme.muted,letterSpacing:1,lineHeight:1.2}}>{s.label}</div>
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
            {displayed.map((m) => (
              <MiniCard
                key={m.id}
                mini={m}
                paints={paints[m.id] || []}
                isOwner={user?.id === m.user_id}
                onEdit={() => setModal(m)}
                onClick={() => setModal(m)}
              />
            ))}
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
    </div>
    </ThemeCtx.Provider>
  );
}
