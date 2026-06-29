# Mutation Testing — verifying the tests themselves

> Coverage tells you which lines *ran*. It does **not** tell you whether your
> tests would *catch a bug* in those lines. Mutation testing answers that
> question directly: it introduces deliberate faults ("mutants") into the code
> and checks whether the test suite fails. A mutant the tests catch is **killed**;
> one that slips through **survives** — and every survivor is a hole in the tests.

We use [Stryker](https://stryker-mutator.io/) with the Vitest runner.

## Run it

```bash
npm run test:mutation                 # all configured modules (slow-ish)
npx stryker run --mutate src/lib/bookStatus.js   # one file (fast)
```

Open the HTML report afterwards: `reports/mutation/mutation.html`.

## Reading the score

```
File           | % score total | % score covered | killed | survived | no cov |
 bookStatus.js |         54.10 |           90.41 |     64 |        7 |     49 |
```

- **Covered score** — of the code the tests *touch*, what fraction of mutants do
  they kill? This is the quality signal. Aim **≥ 85%**.
- **Total score** — includes code no test touches (`no cov`). A low total with a
  high covered score means "the tests we have are good, but there's untested
  code" (here: the rating/notes helpers).
- **Survived** — the actionable list. Each survivor is a fault your tests don't
  notice. Some are benign (defensive `?.`, off-by-one guarded elsewhere); some
  are real gaps worth a new test.

## The workflow

1. Run Stryker on a module.
2. Look at **survivors**, not the headline number.
3. For each *meaningful* survivor, add a test that kills it — or decide it's
   benign and move on.
4. Re-run; watch the survivor disappear.

> Example (real): Stryker mutated `if (!d.startedAt) d.startedAt = now` →
> `if (true) …` and it **survived** — our tests never checked that finishing a
> book preserves the original start date. We added a test… and it *still*
> survived: the test wrote both timestamps in the same millisecond (real clock),
> so the overwrite was invisible. Controlling the clock with `vi.setSystemTime`
> (FIRST: Repeatable) made the two timestamps differ and finally killed the
> mutant — covered score 87.67% → 90.41%. Mutation testing caught a hole in the
> tests; closing it revealed the first fix was itself flawed.

## Config

`stryker.config.json` — scoped to the pure logic modules under `src/lib/` that we
unit-test. Notes:

- `ignoreStatic: true` — skips mutants in module-level constants (e.g. the
  achievement-definition arrays), which are data, not logic, and otherwise
  dominate the run time with noise.
- Data catalogues (`data/books.js`, etc.) are **not** mutated — their integrity
  is guarded by the referential/numbering tests in `src/data/guides.test.js`
  instead.
- `thresholds.break: null` — mutation score does **not** fail CI (yet); it's a
  diagnostic tool you run deliberately, not a gate. Revisit once scores stabilise.

## Don't chase 100%

A perfect mutation score is rarely worth it — defensive code and equivalent
mutants (changes that don't alter behaviour) make the last few percent
uneconomical. Use the survivor list to find *real* gaps, not to grind a number.
