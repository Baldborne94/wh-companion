# WH Companion — Test Plan

> Living document. The goal is not "test everything" — it's to spend testing
> effort where a bug would hurt most. This is **risk-based testing**.

## 1. Purpose & scope

WH Companion is a React 18 + Vite PWA (Supabase backend, Vercel hosting) for
Warhammer 40,000 / Age of Sigmar hobbyists: ebook reading, reading-order guides,
painting tracker, lore, music.

**In scope:** application logic, UI behaviour, critical user journeys, offline
behaviour, i18n, cross-device sync, accessibility basics.

**Out of scope (for now):** Supabase itself, third-party players (YouTube),
Vercel infra, the Anthropic API. We test *our* integration with them, not them.

## 2. Quality risks (prioritised)

Risk = **Likelihood × Impact**. We test high-risk areas first and hardest.

| # | Area | Why it's risky | L | I | Priority |
|---|------|----------------|---|---|----------|
| R1 | Offline reading (IndexedDB cache, `navigator.onLine` false positives) | Complex, easy to regress, core feature | H | H | 🔴 P1 |
| R2 | Auth/session persistence across PWA cold start | Silent logout = lost trust | M | H | 🔴 P1 |
| R3 | Cross-device sync (progress, bookmarks, highlights) | Data-loss class bugs | M | H | 🔴 P1 |
| R4 | EPUB/PDF readers (CFI nav, rendering, zoom suspension) | Most complex code, many edge cases | H | M | 🔴 P1 |
| R5 | Achievements logic (e.g. gallery must NOT unlock trophies) | Already regressed once | M | M | 🟠 P2 |
| R6 | i18n (missing keys, `t()` undefined at runtime) | esbuild won't catch it | M | M | 🟠 P2 |
| R7 | Reading-order guides (book-id references must resolve) | A wrong id = broken row | M | M | 🟠 P2 |
| R8 | Tablet/desktop zoom scaling | Regression-prone, device-specific | M | L | 🟡 P3 |
| R9 | Music (YouTube OAuth, iframe control) | External dependency, hard to automate | L | M | 🟡 P3 |

## 3. Test strategy — the pyramid

```
        /\        E2E (Playwright)         few   — critical journeys only
       /  \       Component (RTL)          some  — UI behaviour, gating, props
      /----\      Unit (Vitest)            many  — pure logic in lib/ & data/
```

**Rule of thumb:** push every bug down to the cheapest layer that can catch it.
A pricing/branching bug → unit test. A "button hidden for new users" bug →
component test. A "can I log in and read a book" bug → one E2E.

| Layer | Tool | What lives here | Speed |
|-------|------|-----------------|-------|
| Unit | Vitest | `lib/*` and `data/*` pure functions (helpers, achievements, guide lookups, i18n fallback) | ms |
| Component | Vitest + React Testing Library | components in isolation with Supabase/network mocked | tens of ms |
| E2E | Playwright (+ pre-installed Chromium) | login→read, navigation, newcomer gating, achievements | seconds |
| Manual | Charters + checklist | exploratory, a11y, offline, real devices | minutes |

### Why this shape
- Unit tests are fast and precise → most of our tests.
- E2E are slow and flaky-prone → reserve for journeys that *must* work.
- The biggest QA win in this codebase: **extract hard logic into `lib/` pure
  functions** (as already done for `readerNav`) so it's unit-testable.

## 4. Unit-test principles — FIRST

- **F**ast — milliseconds; no real network, timers, or `Date.now()`.
- **I**solated — no shared state between tests; no test order dependence.
- **R**epeatable — deterministic. Inject schedulers/clocks (see `readerNav.test.js`).
- **S**elf-validating — clear pass/fail via `expect`, no manual inspection.
- **T**imely — write them alongside (or before) the code.

## 5. Test data & environments

- **Local:** `npm run dev` against a dev Supabase project.
- **Preview:** Vercel per-PR deploy (manual + E2E smoke).
- **Test data:** prefer fixtures/mocks over a live DB for unit/component tests.
  For E2E, use a dedicated throwaway account; never assert on production data.

## 6. Entry / exit criteria

**A PR is ready for QA when:** it builds (`npm run build`), lint passes, and the
author lists what changed.

**A PR passes QA when:**
- `npm run test` is green; new logic has unit tests.
- New user-facing strings exist in **both** `en` and `it`.
- No P1 regression in the risk areas it touches.
- Manual smoke of the changed journey done (or noted as N/A).

## 7. Coverage goals

Coverage is a *floor, not a target* (100% coverage ≠ bug-free).
- `lib/` and `data/` pure logic: aim **≥ 80%** line coverage.
- Components: cover behaviour/branches, not every style line.
- Track with `npm run test -- --coverage` (v8 provider already installed).

## 8. Defect management

1. Reproduce → minimise steps.
2. File a GitHub issue using the **bug report template** (`.github/ISSUE_TEMPLATE`).
3. Classify severity (S1 blocker … S4 cosmetic) and the risk area (R1–R9).
4. Before fixing: write a **failing test** that reproduces it (regression guard).
5. Fix → test goes green → PR references the issue.

## 9. Cadence

- Unit/component tests run on every PR via CI (Phase 5).
- Exploratory session: ~30 min per significant feature, notes saved under
  `docs/qa/sessions/`.
- Regression checklist (`docs/qa/REGRESSION-CHECKLIST.md`) run before any risky
  release (zoom, readers, offline).

## 10. Progress tracker

| Phase | Status |
|-------|--------|
| 0 — Strategy & templates | ✅ done |
| 1 — Unit tests (lib/data) | ✅ done (+ mutation testing via Stryker) |
| 2 — Component tests (RTL) | 🚧 in progress (AchievementPopup, Home/AoS gating, StatsModal, MiniPlayer, UniverseSelector) |
| 3 — E2E (Playwright) | ⬜ todo (reader is auth-gated — needs a fixture/auth strategy) |
| 4 — Manual / exploratory / a11y | ⬜ todo |
| 5 — CI pipeline | 🚧 in progress (GitHub Actions: test + build on every PR) |
| 6 — Performance / security / visual | ⬜ todo |
