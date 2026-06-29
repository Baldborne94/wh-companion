# WH Companion — Behaviour Specification (the test oracle)

> **Why this file exists.** A test can only tell you "right vs wrong" if something
> defines what *right* is. That something is this document — the **oracle**.
>
> Tests must verify the code against **this spec**, not against the code itself.
> If a test is written by reading the implementation, it can only confirm what the
> code already does (including its bugs). The rules below are the **intended**
> behaviour; where the current code and a rule disagree, that's a **defect** to
> file — in the code *or* in our understanding of the requirement.
>
> Items marked **⚠️ DA CONFERMARE** are rules inferred from the implementation
> that the product owner (you) should confirm or correct. Once confirmed, remove
> the marker.

---

## 1. Achievements / Trophies

Achievements unlock when the user's own data crosses a threshold. They never
re-lock. Unlock ids are stored and only *newly* crossed ids are surfaced to the
user (`diffAchievements`).

### 1.0 Scope rules (who counts)

| Rule | Expected behaviour | Status |
|------|--------------------|--------|
| Ownership | Only the **user's own** read books / painted minis count. Community Gallery miniatures (other users') must **NOT** unlock any trophy. | ✅ confirmed (R5 fix) |
| Read status | A book counts as "read" **only** when its status is exactly `read`. `reading` / `want` / unset do **not** count. | ✅ confirmed |
| Mini completion | A miniature counts when it has a `completedAt` timestamp and belongs to the user's collection/army (not the public gallery). | ✅ confirmed |

### 1.1 Reading milestones (WH40K + AoS combined count)

Unlock when the number of books with status `read` reaches the threshold.

| Trophy | Threshold (books read) |
|--------|------------------------|
| First Tome (`read_1`) | 1 |
| Scholar of Terra (`read_5`) | 5 |
| Lexicanist (`read_10`) | 10 |
| Keeper of Lore (`read_25`) | 25 |
| Master of Secrets (`read_50`) | 50 |
| Omnissiah's Chosen (`read_100`) | 100 |

> Thresholds are **inclusive** (`>=`). At exactly 5 books, both `read_1` and
> `read_5` are unlocked.
> ✅ **CONFIRMED:** WH40K and AoS reading trophies are **separate** — each universe
> has its own milestones, monthly medals, streaks and sagas. The code already
> enforces this: `loadAllStatuses` keeps only numeric (40k) ids and
> `loadAoSStatuses` only `aos`-prefixed ids, so the two counts never mix.
> (Painting trophies, by contrast, are **shared** across universes — see §1.6.)

### 1.2 Monthly medals (reading)

Based on books whose `completedAt` falls in the **current calendar month**.

| Medal | Books completed this month |
|-------|----------------------------|
| Bronze Aquila (`monthly_bronze`) | 1 |
| Silver Aquila (`monthly_silver`) | 2 |
| Gold Aquila (`monthly_gold`) | 3 |
| Platinum Aquila (`monthly_platinum`) | 4+ |

> "Current month" = `YYYY-MM` of *now*. A book finished last month does not count.
> ✅ **CONFIRMED & IMPLEMENTED:** 1 = Bronze, 2 = Silver, 3 = Gold, 4+ = Platinum.
> `monthly_platinum` (+ `aos_monthly_platinum`) added with EN/IT labels, descs and
> popup flavor. Standalone/Codex books **do** count toward these medals (see §1.4).

### 1.3 Reading streak (consecutive months)

Longest run of consecutive calendar months — counting back from the most recent —
in which **at least one** book was completed.

| Trophy | Consecutive months |
|--------|--------------------|
| Relentless Crusader (`streak_2`) | 2 |
| Eternal Warrior (`streak_3`) | 3 |
| Veteran of the Long War (`streak_6`) | 6 |
| Deathwatch Champion (`streak_12`) | 12 |

> A gap of even one month resets the run. Multiple books in the same month count
> as that one month. The year boundary (Dec → Jan) is a valid consecutive step.

### 1.4 Series, faction & explorer (WH40K)

All based on the user's `read` WH40K books matched against the catalogue.

| Trophy | Rule |
|--------|------|
| Horus Heresy (`hh_10`, `hh_30`) | 10 / 30 books whose `series === "Horus Heresy"` are read |
| Faction devotion (`faction_3/5/10`) | 3 / 5 / 10 read books sharing the **same** `faction` |
| Explorer (`explorer_3/5/8`) | read books spanning 3 / 5 / 8 **distinct** factions |
| Saga complete (`series:<Name>`) | **every** book of a multi-book series is read |

> **Saga completion exclusions:** a `series:` trophy is **never** created for
> series named `Standalone` or `Codex`, nor for series with fewer than 2 books.
> ✅ **CONFIRMED:** this exclusion applies to **both** WH40K and AoS (see §1.5).
> Crucially, the exclusion is **only** for the saga-completion trophy — Standalone
> and Codex books still count as read books toward milestones, monthly medals and
> streaks.

### 1.5 AoS reading (parallel set)

Mirrors §1.1–1.4 but over AoS books only, with `aos_`-prefixed ids. Differences:

| Trophy | Rule |
|--------|------|
| Milestones `aos_read_1…100` | 1 / 5 / 10 / 25 / 50 / 100 AoS books read |
| Monthly `aos_monthly_bronze/silver/gold` | 1 / 2 / 4 this month |
| Streak `aos_streak_2/3/6/12` | 2 / 3 / 6 / 12 consecutive months |
| Series devotion `aos_series_3/5/10` | 3 / 5 / 10 read books in the **same** `series` |
| Explorer `aos_explorer_3/5/8` | 3 / 5 / 8 **distinct** series read |
| Saga complete `aos_series:<Name>` | every book of a 2+ book series read |

> ✅ **CONFIRMED:** AoS saga completion now applies the **same** `Standalone`/
> `Codex` exclusion as WH40K (§1.4). (Was missing before — fixed.)

### 1.6 Painting milestones, monthly & streak

Based on the user's completed miniatures (`completedAt` timestamps).

| Group | Rule |
|-------|------|
| Milestones `paint_1…100` | 1 / 5 / 10 / 25 / 50 / 100 minis complete |
| Monthly `monthly_painter_1/3/5` | 1 / 3 / 5 minis completed **this month** |
| Streak `paint_streak_2/3/6` | painted in 2 / 3 / 6 consecutive months |
| Army medal (`army:<Faction>:<N>`) | N ∈ {5, 10, 20} minis of the **same** faction |

> Minis with **no faction** still count toward milestones/monthly/streak, but
> **not** toward any `army:` medal.

### 1.7 Localisation of trophy text

| Rule | Expected behaviour |
|------|--------------------|
| Translation present | `localizeAchievement` returns the translated label/desc. |
| Translation missing | Falls back to the **baked-in English** label/desc — never shows the raw `stats.ach.*` key. |
| Dynamic ids | `series:` / `aos_series:` / `army:` labels are built from templates with `{name}` / `{faction}` / `{medal}` / `{count}` placeholders. |
| Bad input | A non-function `t` returns the achievement unchanged (no crash). |

---

## 2. Resolved questions (product owner confirmed)

1. **Milestone count (§1.1)** — ✅ separate per universe; the code already does
   this. The "WH40K + AoS combined" comment was stale (now corrected). No
   behaviour bug — a false alarm caught by *reading the code path*, not the comment.
2. **Saga exclusions (§1.4 / §1.5)** — ✅ `Standalone`/`Codex` excluded from saga
   completion in **both** universes (AoS was missing it — fixed). They still count
   toward read milestones / monthly / streak.
3. **Monthly bands (§1.2)** — ✅ 1 / 2 / 3 / 4+ → Bronze / Silver / Gold / Platinum.
   Platinum is a **new tier** still to implement.

> Each confirmed rule becomes a test. Each *contradiction we find* becomes a bug
> report (`.github/ISSUE_TEMPLATE/bug_report.md`). That is the whole game.
