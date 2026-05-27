// Achievement definitions + pure computation engine

// ─── DEFINITIONS ─────────────────────────────────────────────────────────────

export const READING_ACHIEVEMENTS = [
  { id:"read_1",        label:"First Tome",             desc:"Read your first book",                  icon:"📖", cat:"milestone" },
  { id:"read_5",        label:"Scholar of Terra",       desc:"Read 5 books",                          icon:"📚", cat:"milestone" },
  { id:"read_10",       label:"Lexicanist",             desc:"Read 10 books",                         icon:"🏛",  cat:"milestone" },
  { id:"read_25",       label:"Keeper of Lore",         desc:"Read 25 books",                         icon:"⚔",  cat:"milestone" },
  { id:"read_50",       label:"Master of Secrets",      desc:"Read 50 books",                         icon:"🔮", cat:"milestone" },
  { id:"read_100",      label:"Omnissiah's Chosen",     desc:"Read 100 books",                        icon:"💀", cat:"milestone" },
  { id:"streak_2",      label:"Relentless Crusader",    desc:"Read in 2 consecutive months",          icon:"🗡",  cat:"streak"    },
  { id:"streak_3",      label:"Eternal Warrior",        desc:"Read in 3 consecutive months",          icon:"🛡",  cat:"streak"    },
  { id:"streak_6",      label:"Veteran of the Long War",desc:"Read in 6 consecutive months",          icon:"⚡", cat:"streak"    },
  { id:"streak_12",     label:"Deathwatch Champion",    desc:"Read in 12 consecutive months",         icon:"👁",  cat:"streak"    },
  { id:"monthly_bronze",label:"Bronze Aquila",          desc:"Read 1 book this month",                icon:"🥉", cat:"monthly"   },
  { id:"monthly_silver",label:"Silver Aquila",          desc:"Read 2–3 books this month",             icon:"🥈", cat:"monthly"   },
  { id:"monthly_gold",  label:"Gold Aquila",            desc:"Read 4+ books this month",              icon:"🥇", cat:"monthly"   },
  { id:"faction_3",     label:"Faction Devotee",        desc:"Read 3 books of the same faction",      icon:"🎖",  cat:"faction"   },
  { id:"faction_5",     label:"Faction Champion",       desc:"Read 5 books of the same faction",      icon:"🏆", cat:"faction"   },
  { id:"faction_10",    label:"Faction Exemplar",       desc:"Read 10 books of the same faction",     icon:"👑", cat:"faction"   },
  { id:"series_complete",label:"Series Purged",         desc:"Completed every book in a series",      icon:"📜", cat:"series"    },
  { id:"explorer_3",    label:"Wanderer",               desc:"Read from 3 different factions",        icon:"🌍", cat:"explorer"  },
  { id:"explorer_5",    label:"Pathfinder",             desc:"Read from 5 different factions",        icon:"🗺",  cat:"explorer"  },
  { id:"explorer_8",    label:"Inquisitor",             desc:"Read from 8 different factions",        icon:"🔍", cat:"explorer"  },
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
  { id:"army_5",            label:"Combat Ready",       desc:"5 minis of the same faction complete",   icon:"⚔",  cat:"army"      },
  { id:"army_10",           label:"Full Detachment",    desc:"10 minis of same faction complete",      icon:"🛡",  cat:"army"      },
  { id:"army_20",           label:"Battle Company",     desc:"20 minis of same faction complete",      icon:"👑", cat:"army"      },
];

export const ALL_ACHIEVEMENTS = [...READING_ACHIEVEMENTS, ...PAINTING_ACHIEVEMENTS];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function monthKey(iso) {
  if (!iso) return null;
  return iso.slice(0, 7); // "YYYY-MM"
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

// Returns the length of the longest consecutive-month streak, starting from the most recent month.
export function getConsecutiveMonthStreak(isoTimestamps) {
  if (!isoTimestamps || !isoTimestamps.length) return 0;
  const months = [...new Set(isoTimestamps.map(ts => ts.slice(0, 7)).filter(Boolean))].sort().reverse();
  if (!months.length) return 0;
  let streak = 1;
  for (let i = 1; i < months.length; i++) {
    const [y0, m0] = months[i - 1].split('-').map(Number);
    const [y1, m1] = months[i].split('-').map(Number);
    if (y0 * 12 + m0 - (y1 * 12 + m1) === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ─── READING COMPUTATION ─────────────────────────────────────────────────────

// statuses: { [bookId]: { status, completedAt, ... } } — WH40K + AoS combined
// books: BOOKS array (WH40K only — used for faction/series checks)
export function computeReadingAchievements(statuses, books) {
  const readEntries = Object.entries(statuses).filter(([, v]) => v?.status === 'read');
  const readCount = readEntries.length;
  const readIds = new Set(readEntries.map(([k]) => String(k)));
  const unlocked = [];

  // Milestones
  if (readCount >= 1)   unlocked.push("read_1");
  if (readCount >= 5)   unlocked.push("read_5");
  if (readCount >= 10)  unlocked.push("read_10");
  if (readCount >= 25)  unlocked.push("read_25");
  if (readCount >= 50)  unlocked.push("read_50");
  if (readCount >= 100) unlocked.push("read_100");

  // Reading streak (consecutive months with at least 1 book completed)
  const completedDates = readEntries.map(([, v]) => v.completedAt).filter(Boolean);
  const streak = getConsecutiveMonthStreak(completedDates);
  if (streak >= 2)  unlocked.push("streak_2");
  if (streak >= 3)  unlocked.push("streak_3");
  if (streak >= 6)  unlocked.push("streak_6");
  if (streak >= 12) unlocked.push("streak_12");

  // Monthly medals (current calendar month)
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
  const maxFaction = factionCounts ? Math.max(0, ...Object.values(factionCounts)) : 0;
  if (maxFaction >= 3)  unlocked.push("faction_3");
  if (maxFaction >= 5)  unlocked.push("faction_5");
  if (maxFaction >= 10) unlocked.push("faction_10");

  // Series complete (WH40K, exclude single-book "series", require ≥2 books)
  const seriesMap = {};
  books.forEach(b => {
    if (!seriesMap[b.series]) seriesMap[b.series] = [];
    seriesMap[b.series].push(b);
  });
  const hasSeriesComplete = Object.entries(seriesMap).some(([sName, sBooks]) => {
    if (sName === 'Standalone' || sName === 'Codex' || sBooks.length < 2) return false;
    return sBooks.every(b => readIds.has(String(b.id)));
  });
  if (hasSeriesComplete) unlocked.push("series_complete");

  // Explorer: distinct factions among read WH40K books
  const distinctFactions = new Set(books.filter(b => readIds.has(String(b.id))).map(b => b.faction));
  if (distinctFactions.size >= 3) unlocked.push("explorer_3");
  if (distinctFactions.size >= 5) unlocked.push("explorer_5");
  if (distinctFactions.size >= 8) unlocked.push("explorer_8");

  return unlocked;
}

// ─── PAINTING COMPUTATION ────────────────────────────────────────────────────

// completedMinis: [{ id, faction, completedAt: ISO_string }]
export function computePaintingAchievements(completedMinis) {
  const count = completedMinis.length;
  const unlocked = [];

  // Milestones
  if (count >= 1)   unlocked.push("paint_1");
  if (count >= 5)   unlocked.push("paint_5");
  if (count >= 10)  unlocked.push("paint_10");
  if (count >= 25)  unlocked.push("paint_25");
  if (count >= 50)  unlocked.push("paint_50");
  if (count >= 100) unlocked.push("paint_100");

  // Monthly painter (current month)
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

  // Army builder (same faction)
  const factionCounts = {};
  completedMinis.forEach(m => {
    if (m.faction) factionCounts[m.faction] = (factionCounts[m.faction] || 0) + 1;
  });
  const maxArmy = factionCounts ? Math.max(0, ...Object.values(factionCounts)) : 0;
  if (maxArmy >= 5)  unlocked.push("army_5");
  if (maxArmy >= 10) unlocked.push("army_10");
  if (maxArmy >= 20) unlocked.push("army_20");

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
