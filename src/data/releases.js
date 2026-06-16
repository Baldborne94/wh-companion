export const RELEASES_UPDATED = "2026-06-02";

export function shouldShowReleaseReminder() {
  const sixMonths = 180 * 24 * 60 * 60 * 1000;
  if (Date.now() - new Date(RELEASES_UPDATED).getTime() < sixMonths) return false;
  const dismissed = localStorage.getItem('wh40k_releases_reminder');
  if (!dismissed) return true;
  return Date.now() - parseInt(dismissed) > sixMonths;
}

export function dismissReleaseReminder() {
  localStorage.setItem('wh40k_releases_reminder', String(Date.now()));
}

export const UPCOMING_RELEASES = [
  {
    month: "June 2026",
    items: [
      { title: "The Iron Vow", author: "Guy Haley", type: "Novel", universe: "wh40k", series: "Warhammer 40,000", faction: "Iron Hands" },
      { title: "Echoes of Eternity: Shadows", author: "Aaron Dembski-Bowden", type: "Novella", universe: "wh40k", series: "The Horus Heresy" },
      { title: "Broken Blade", author: "Gav Thorpe", type: "Novel", universe: "aos", series: "Age of Sigmar", faction: "Idoneth Deepkin" },
    ]
  },
  {
    month: "July 2026",
    items: [
      { title: "The Pale Crusade", author: "Josh Reynolds", type: "Novel", universe: "wh40k", series: "Warhammer 40,000", faction: "Sisters of Battle" },
      { title: "Servants of Ruin", author: "Justin D Hill", type: "Novel", universe: "wh40k", series: "Warhammer 40,000", faction: "Astra Militarum" },
      { title: "Into the Gnarlwood", author: "David Guymer", type: "Novel", universe: "aos", series: "Age of Sigmar" },
    ]
  },
  {
    month: "August 2026",
    items: [
      { title: "Wolfblade: Reckoning", author: "William King", type: "Novel", universe: "wh40k", series: "Space Wolves", faction: "Space Wolves" },
      { title: "Legends of the Dark Millennium: Vol. IV", author: "Various", type: "Anthology", universe: "wh40k", series: "Warhammer 40,000" },
      { title: "The Anvil of Apotheosis", author: "Noah Van Nguyen", type: "Novel", universe: "aos", series: "Age of Sigmar", faction: "Stormcast Eternals" },
    ]
  },
  {
    month: "September 2026",
    items: [
      { title: "Grim Harvest", author: "Marc Collins", type: "Novel", universe: "wh40k", series: "Warhammer 40,000", faction: "Death Guard" },
      { title: "Heresy of the Living", author: "Various", type: "Anthology", universe: "wh40k", series: "The Horus Heresy" },
    ]
  },
  {
    month: "October 2026",
    items: [
      { title: "Soul Covenant", author: "Chris Wraight", type: "Novel", universe: "wh40k", series: "Warhammer 40,000", faction: "Blood Angels" },
      { title: "The Lumineth Conclave", author: "David Annandale", type: "Novel", universe: "aos", series: "Age of Sigmar", faction: "Lumineth Realm-lords" },
    ]
  },
  {
    month: "November 2026",
    items: [
      { title: "Dark Tidings", author: "Dan Abnett", type: "Novel", universe: "wh40k", series: "Warhammer 40,000", faction: "Dark Angels" },
      { title: "Crimson Storm", author: "Various", type: "Anthology", universe: "aos", series: "Age of Sigmar" },
    ]
  },
];
