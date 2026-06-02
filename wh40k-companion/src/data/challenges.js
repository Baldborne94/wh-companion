import { BOOKS } from "./books";

export const TIER = {
  bronze:   { color: "#CD7F32", label: "Bronze" },
  silver:   { color: "#9aa0a6", label: "Silver" },
  gold:     { color: "#c9a84c", label: "Gold" },
  platinum: { color: "#b0c4de", label: "Platinum" },
};

const readCount  = (st) => Object.values(st).filter(s => s.status === 'read').length;
const seriesRead = (st, name) => BOOKS.filter(b => b.series === name && st[b.id]?.status === 'read').length;
const seriesSize = (name) => BOOKS.filter(b => b.series === name).length;

export const CHALLENGES = [
  { id: 'read_5',      tier: 'bronze',   icon: '🗡️',  title: 'First Blood',          desc: 'Read 5 books',
    compute: st => ({ current: Math.min(readCount(st), 5),   target: 5 }) },
  { id: 'read_10',     tier: 'bronze',   icon: '📖',  title: 'Neophyte',              desc: 'Read 10 books',
    compute: st => ({ current: Math.min(readCount(st), 10),  target: 10 }) },
  { id: 'read_25',     tier: 'silver',   icon: '⚔️',  title: 'Battle-Brother',        desc: 'Read 25 books',
    compute: st => ({ current: Math.min(readCount(st), 25),  target: 25 }) },
  { id: 'read_50',     tier: 'silver',   icon: '🛡️',  title: 'Veteran',               desc: 'Read 50 books',
    compute: st => ({ current: Math.min(readCount(st), 50),  target: 50 }) },
  { id: 'read_100',    tier: 'gold',     icon: '🏆',  title: 'Chapter Master',        desc: 'Read 100 books',
    compute: st => ({ current: Math.min(readCount(st), 100), target: 100 }) },
  { id: 'read_200',    tier: 'platinum', icon: '👑',  title: 'Primarch',              desc: 'Read 200 books',
    compute: st => ({ current: Math.min(readCount(st), 200), target: 200 }) },

  { id: 'eisenhorn',   tier: 'silver',   icon: '🔍',  title: 'Inquisitor',            desc: 'Complete the Eisenhorn trilogy',
    compute: st => ({ current: seriesRead(st, 'Eisenhorn'),   target: seriesSize('Eisenhorn') }) },
  { id: 'night_lords', tier: 'silver',   icon: '🌑',  title: 'Soul Hunter',           desc: 'Complete the Night Lords trilogy',
    compute: st => ({ current: seriesRead(st, 'Night Lords'), target: seriesSize('Night Lords') }) },
  { id: 'gaunts',      tier: 'gold',     icon: '👻',  title: 'Tanith First and Only', desc: "Complete Gaunt's Ghosts",
    compute: st => ({ current: seriesRead(st, "Gaunt's Ghosts"), target: seriesSize("Gaunt's Ghosts") }) },

  { id: 'hh_start',    tier: 'bronze',   icon: '🌌',  title: 'The Heresy Begins',     desc: 'Read 10 Horus Heresy novels',
    compute: st => ({ current: Math.min(seriesRead(st, 'The Horus Heresy'), 10), target: 10 }) },
  { id: 'hh_mid',      tier: 'silver',   icon: '💀',  title: 'Deep in the Heresy',    desc: 'Read 30 Horus Heresy novels',
    compute: st => ({ current: Math.min(seriesRead(st, 'The Horus Heresy'), 30), target: 30 }) },
  { id: 'hh_complete', tier: 'platinum', icon: '🌟',  title: 'Warmaster',             desc: 'Complete the entire Horus Heresy',
    compute: st => ({ current: seriesRead(st, 'The Horus Heresy'), target: seriesSize('The Horus Heresy') }) },

  { id: 'factions_5',  tier: 'silver',   icon: '🗺️',  title: 'Know Your Enemy',       desc: 'Read books from 5 different factions',
    compute: st => {
      const f = new Set(BOOKS.filter(b => st[b.id]?.status === 'read' && b.faction).map(b => b.faction));
      return { current: Math.min(f.size, 5), target: 5 };
    } },
  { id: 'factions_10', tier: 'gold',     icon: '⚜️',  title: 'Grand Strategist',      desc: 'Read books from 10 different factions',
    compute: st => {
      const f = new Set(BOOKS.filter(b => st[b.id]?.status === 'read' && b.faction).map(b => b.faction));
      return { current: Math.min(f.size, 10), target: 10 };
    } },
];
