// Achievement definitions + pure computation engine

// ─── STATIC DEFINITIONS ──────────────────────────────────────────────────────

export const READING_ACHIEVEMENTS = [
  { id:"read_1",        label:"First Tome",              desc:"Every great journey begins with a single page. Yours has begun.",                                   icon:"📖", cat:"milestone" },
  { id:"read_5",        label:"Scholar of Terra",        desc:"Five worlds explored. Five destinies witnessed. Your hunger for lore only grows.",                  icon:"📚", cat:"milestone" },
  { id:"read_10",       label:"Lexicanist",              desc:"Ten tomes consumed. The galaxy begins to reveal its true shape to you.",                            icon:"🏛",  cat:"milestone" },
  { id:"read_25",       label:"Keeper of Lore",          desc:"Twenty-five chronicles live within you. You walk among the truly learned.",                         icon:"⚔",  cat:"milestone" },
  { id:"read_50",       label:"Master of Secrets",       desc:"Fifty books. Half a century of battles, sacrifices and destinies reside in your mind.",             icon:"🔮", cat:"milestone" },
  { id:"read_100",      label:"Omnissiah's Chosen",      desc:"One hundred tomes. You have seen what few mortals dare to read. This is extraordinary.",            icon:"💀", cat:"milestone" },
  { id:"streak_2",      label:"Relentless Crusader",     desc:"Two months of unbroken devotion. The crusade does not sleep — and neither do you.",                 icon:"🗡",  cat:"streak"    },
  { id:"streak_3",      label:"Eternal Warrior",         desc:"Three months without pause. You do not merely read these stories — you live them.",                 icon:"🛡",  cat:"streak"    },
  { id:"streak_6",      label:"Veteran of the Long War", desc:"Six months of relentless reading. Few reach this far. You make it look effortless.",                icon:"⚡", cat:"streak"    },
  { id:"streak_12",     label:"Deathwatch Champion",     desc:"A full year of unbroken reading. Your name belongs in the chronicles themselves.",                  icon:"👁",  cat:"streak"    },
  { id:"monthly_bronze",label:"Bronze Aquila",           desc:"One book this month. The Aquila watches over those who keep their vow.",                           icon:"🥉", cat:"monthly"   },
  { id:"monthly_silver",label:"Silver Aquila",           desc:"Two to three books this month. Your reading pace rivals the Astartes themselves.",                  icon:"🥈", cat:"monthly"   },
  { id:"monthly_gold",  label:"Gold Aquila",             desc:"Four or more books this month. An extraordinary display of devotion to the written word.",          icon:"🥇", cat:"monthly"   },
  { id:"faction_3",     label:"Faction Devotee",         desc:"Three books under the same banner. You know exactly where your loyalties lie.",                     icon:"🎖",  cat:"faction"   },
  { id:"faction_5",     label:"Faction Champion",        desc:"Five books, one allegiance. The faction has no greater scholar walking among them.",                 icon:"🏆", cat:"faction"   },
  { id:"faction_10",    label:"Faction Exemplar",        desc:"Ten books of a single faction. Your devotion is absolute. Unmatched. Beyond all measure.",          icon:"👑", cat:"faction"   },
  { id:"explorer_3",    label:"Wanderer",                desc:"Three factions read. The galaxy holds fewer and fewer mysteries before you.",                       icon:"🌍", cat:"explorer"  },
  { id:"explorer_5",    label:"Pathfinder",              desc:"Five allegiances understood. You see the galaxy as very few mortals ever truly do.",                 icon:"🗺",  cat:"explorer"  },
  { id:"explorer_8",    label:"Inquisitor",              desc:"Eight factions. Nothing escapes your gaze. You have become the Inquisitor of lore.",                icon:"🔍", cat:"explorer"  },
];

export const PAINTING_ACHIEVEMENTS = [
  { id:"paint_1",           label:"First Blood",        desc:"Complete your first miniature",          icon:"🎨", cat:"milestone" },
  { id:"paint_5",           label:"Squad Ready",        desc:"Complete 5 miniatures",                  icon:"⚙",  cat:"milestone" },
  { id:"paint_10",          label:"Veteran Painter",    desc:"Complete 10 miniatures",                 icon:"🖌",  cat:"milestone" },
  { id:"paint_25",          label:"Master Craftsman",   desc:"Complete 25 miniatures",                 icon:"⚒",  cat:"milestone" },
  { id:"paint_50",          label:"Iron Father",        desc:"Complete 50 miniatures",                 icon:"🤖", cat:"milestone" },
  { id:"paint_100",         label:"Master of the Forge",desc:"Complete 100 miniatures",                icon:"🏭", cat:"milestone" },
  { id:"monthly_painter_1", label:"Brush Initiate",     desc:"Complete 1 miniature this month",        icon:"🎯", cat:"monthly"   },
  { id:"monthly_painter_3", label:"Brush Adept",        desc:"Complete 3 miniatures this month",       icon:"🎯", cat:"monthly"   },
  { id:"monthly_painter_5", label:"Brush Master",       desc:"Complete 5+ miniatures this month",      icon:"✨", cat:"monthly"   },
  { id:"paint_streak_2",    label:"Devoted Painter",    desc:"Painted in 2 consecutive months",        icon:"🔥", cat:"streak"    },
  { id:"paint_streak_3",    label:"Unstoppable",        desc:"Painted in 3 consecutive months",        icon:"💫", cat:"streak"    },
  { id:"paint_streak_6",    label:"Legion Painter",     desc:"Painted in 6 consecutive months",        icon:"⚔",  cat:"streak"    },
];

export const ALL_ACHIEVEMENTS = [...READING_ACHIEVEMENTS, ...PAINTING_ACHIEVEMENTS];

// ─── DYNAMIC ACHIEVEMENT RESOLUTION ─────────────────────────────────────────
// Dynamic IDs are stored in unlockedIds just like static ones.
// "series:Eisenhorn"          → named saga completion
// "army:Space Marines:5"      → 5 minis of named faction complete

const ARMY_MEDALS = {
  '5':  { label: 'Combat Ready',    icon: '⚔'  },
  '10': { label: 'Full Detachment', icon: '🛡'  },
  '20': { label: 'Battle Company',  icon: '👑'  },
};

export function achievementFromId(id) {
  const stat = ALL_ACHIEVEMENTS.find(a => a.id === id);
  if (stat) return stat;

  if (id.startsWith('series:')) {
    const name = id.slice('series:'.length);
    return { id, label: `${name} Saga Complete`, desc: `Every book in ${name} read`, icon: "📜", cat: "series" };
  }

  if (id.startsWith('army:')) {
    const rest = id.slice('army:'.length);
    const sep  = rest.lastIndexOf(':');
    const faction = rest.slice(0, sep);
    const count   = rest.slice(sep + 1);
    const medal   = ARMY_MEDALS[count] || { label: `${count} Minis`, icon: '🎖' };
    return { id, label: `${faction} — ${medal.label}`, desc: `${count} ${faction} miniatures complete`, icon: medal.icon, cat: "army" };
  }

  return null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function monthKey(iso) {
  return iso ? iso.slice(0, 7) : null;
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

// Longest consecutive-month streak from the most recent month backwards.
export function getConsecutiveMonthStreak(isoTimestamps) {
  if (!isoTimestamps || !isoTimestamps.length) return 0;
  const months = [...new Set(isoTimestamps.map(ts => ts.slice(0, 7)).filter(Boolean))].sort().reverse();
  if (!months.length) return 0;
  let streak = 1;
  for (let i = 1; i < months.length; i++) {
    const [y0, m0] = months[i - 1].split('-').map(Number);
    const [y1, m1] = months[i].split('-').map(Number);
    if (y0 * 12 + m0 - (y1 * 12 + m1) === 1) streak++;
    else break;
  }
  return streak;
}

// ─── READING COMPUTATION ─────────────────────────────────────────────────────

// statuses: { [bookId]: { status, completedAt, ... } } — WH40K + AoS combined
// books: BOOKS array (WH40K only — used for faction/series checks)
export function computeReadingAchievements(statuses, books) {
  const readEntries = Object.entries(statuses).filter(([, v]) => v?.status === 'read');
  const readCount   = readEntries.length;
  const readIds     = new Set(readEntries.map(([k]) => String(k)));
  const unlocked    = [];

  // Milestones
  if (readCount >= 1)   unlocked.push("read_1");
  if (readCount >= 5)   unlocked.push("read_5");
  if (readCount >= 10)  unlocked.push("read_10");
  if (readCount >= 25)  unlocked.push("read_25");
  if (readCount >= 50)  unlocked.push("read_50");
  if (readCount >= 100) unlocked.push("read_100");

  // Streak
  const completedDates = readEntries.map(([, v]) => v.completedAt).filter(Boolean);
  const streak = getConsecutiveMonthStreak(completedDates);
  if (streak >= 2)  unlocked.push("streak_2");
  if (streak >= 3)  unlocked.push("streak_3");
  if (streak >= 6)  unlocked.push("streak_6");
  if (streak >= 12) unlocked.push("streak_12");

  // Monthly medals
  const thisMonth = currentMonthKey();
  const thisMonthCount = readEntries.filter(([, v]) => monthKey(v.completedAt) === thisMonth).length;
  if (thisMonthCount >= 1) unlocked.push("monthly_bronze");
  if (thisMonthCount >= 2) unlocked.push("monthly_silver");
  if (thisMonthCount >= 4) unlocked.push("monthly_gold");

  // Faction devotion (WH40K books only)
  const factionCounts = {};
  books.forEach(b => {
    if (readIds.has(String(b.id))) {
      factionCounts[b.faction] = (factionCounts[b.faction] || 0) + 1;
    }
  });
  const maxFaction = Object.values(factionCounts).length ? Math.max(...Object.values(factionCounts)) : 0;
  if (maxFaction >= 3)  unlocked.push("faction_3");
  if (maxFaction >= 5)  unlocked.push("faction_5");
  if (maxFaction >= 10) unlocked.push("faction_10");

  // ── Per-series completion (dynamic IDs) ───────────────────────────────────
  const seriesMap = {};
  books.forEach(b => {
    if (!seriesMap[b.series]) seriesMap[b.series] = [];
    seriesMap[b.series].push(b);
  });
  Object.entries(seriesMap).forEach(([sName, sBooks]) => {
    if (sName === 'Standalone' || sName === 'Codex' || sBooks.length < 2) return;
    if (sBooks.every(b => readIds.has(String(b.id)))) {
      unlocked.push(`series:${sName}`);
    }
  });

  // Explorer
  const distinctFactions = new Set(books.filter(b => readIds.has(String(b.id))).map(b => b.faction));
  if (distinctFactions.size >= 3) unlocked.push("explorer_3");
  if (distinctFactions.size >= 5) unlocked.push("explorer_5");
  if (distinctFactions.size >= 8) unlocked.push("explorer_8");

  return unlocked;
}

// ─── PAINTING COMPUTATION ────────────────────────────────────────────────────

// completedMinis: [{ id, faction, completedAt: ISO_string }]
export function computePaintingAchievements(completedMinis) {
  const count   = completedMinis.length;
  const unlocked = [];

  // Milestones
  if (count >= 1)   unlocked.push("paint_1");
  if (count >= 5)   unlocked.push("paint_5");
  if (count >= 10)  unlocked.push("paint_10");
  if (count >= 25)  unlocked.push("paint_25");
  if (count >= 50)  unlocked.push("paint_50");
  if (count >= 100) unlocked.push("paint_100");

  // Monthly painter
  const thisMonth = currentMonthKey();
  const thisMonthCount = completedMinis.filter(m => monthKey(m.completedAt) === thisMonth).length;
  if (thisMonthCount >= 1) unlocked.push("monthly_painter_1");
  if (thisMonthCount >= 3) unlocked.push("monthly_painter_3");
  if (thisMonthCount >= 5) unlocked.push("monthly_painter_5");

  // Paint streak
  const paintDates = completedMinis.map(m => m.completedAt).filter(Boolean);
  const streak = getConsecutiveMonthStreak(paintDates);
  if (streak >= 2) unlocked.push("paint_streak_2");
  if (streak >= 3) unlocked.push("paint_streak_3");
  if (streak >= 6) unlocked.push("paint_streak_6");

  // ── Per-faction army milestones (dynamic IDs) ─────────────────────────────
  const factionCounts = {};
  completedMinis.forEach(m => {
    if (m.faction) factionCounts[m.faction] = (factionCounts[m.faction] || 0) + 1;
  });
  Object.entries(factionCounts).forEach(([faction, n]) => {
    if (n >= 5)  unlocked.push(`army:${faction}:5`);
    if (n >= 10) unlocked.push(`army:${faction}:10`);
    if (n >= 20) unlocked.push(`army:${faction}:20`);
  });

  return unlocked;
}

// ─── DIFF ─────────────────────────────────────────────────────────────────────

export function diffAchievements(alreadyUnlocked, nowUnlocked) {
  return nowUnlocked.filter(id => !alreadyUnlocked.includes(id));
}

// ─── SUPABASE PERSISTENCE ────────────────────────────────────────────────────

export async function loadUnlockedIds(supabase, userId) {
  try {
    const { data } = await supabase
      .from("user_achievements")
      .select("data")
      .eq("user_id", userId)
      .single();
    return data?.data?.unlockedIds ?? [];
  } catch {
    return [];
  }
}

export async function saveUnlockedIds(supabase, userId, ids) {
  try {
    await supabase.from("user_achievements").upsert(
      { user_id: userId, data: { unlockedIds: ids } },
      { onConflict: "user_id" }
    );
  } catch {}
}
