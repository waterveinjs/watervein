# Automated js-framework-benchmark CI

The `js-framework-benchmark` workflow runs for pull requests targeting `main`,
pushes to `main`, and manual dispatches. It checks out the benchmark repository
separately, pinned to the reviewed commit
`1e4e53d411defc4a02e5842efda9bfe73be8567b`.

## Compared implementations

The workflow builds and benchmarks these keyed implementations in one
GitHub-hosted job, using the same Playwright Chromium runner:

- Watervein (`keyed/watervein`)
- Vanilla JS (`keyed/vanillajs`)
- VanJS (`keyed/vanjs`)
- React (`keyed/react-hooks`)
- Preact (`keyed/preact-hooks`)
- Mikado (`keyed/mikado`)
- Vue (`keyed/vue`)
- SolidJS (`keyed/solid`)
- Svelte (`keyed/svelte`)

Watervein is built from the current pull-request checkout. The three local
workspace packages (`@watervein/core`, `@watervein/dom-core`, and
`@watervein/dom`) are packed and installed from local tarballs in the temporary
benchmark checkout. No prerelease package is published to npm and no changes
are committed to the benchmark repository.

The other eight implementations are built from the pinned benchmark checkout
using its `rebuild-single` CI path and their checked-in lockfiles. The benchmark
runner then performs smoke tests, keyed and CSP checks, followed by the full
comparison run.

## Standard HTML results table and artifact

The workflow uses the benchmark project's own results pipeline rather than a
Watervein-specific report generator:

1. Install `webdriver-ts-results` dependencies with
   `npm run install-webdriver-ts-results`.
2. After collecting benchmark JSON files, run `npm run results` from the
   benchmark repository root.
3. This invokes `webdriver-ts/src/createResultJS.ts` to aggregate the raw
   measurements into `webdriver-ts/results.json` and
   `webdriver-ts-results/src/results.ts`, then builds the standard results
   web app.

The generated static comparison site is uploaded from
`webdriver-ts-results/dist/` together with the raw JSON files and server
diagnostics as a 30-day GitHub Actions artifact named
`watervein-framework-comparison-<commit-sha>`. Download the artifact and open
`webdriver-ts-results/dist/index.html` locally to inspect the standard
interactive framework comparison table.

The results-generation step runs even if a benchmark step fails, so partial
results can still be aggregated when the runner and results dependencies were
installed successfully. Missing measurements remain missing; they are not
interpreted as zero.

## CI-specific compatibility patches

The benchmark root install uses `--legacy-peer-deps` because the pinned
upstream revision declares an ESLint 10 / `eslint-plugin-react` peer range
conflict. This is isolated to benchmark tooling; it does not change Watervein
dependencies.

GitHub-hosted Linux runners require Chromium's `--no-sandbox` option. The
workflow applies that change only to the temporary benchmark checkout. It also
patches the keyed and CSP checkers' catch handlers so unexpected checker errors
set a failing process exit code instead of merely being logged.

## Interpreting results

CPU metrics use repeated measurements and report medians. Shared GitHub-hosted
runner load can still affect timings. Memory, bundle size, and first paint are
single-run metrics in this workflow and should be treated as approximate.

All compared implementations are the benchmark's keyed variants. This is a
useful controlled comparison, but it is not a universal ranking across
browsers, hardware, or implementation styles. The workflow does not enforce a
percentage-based performance regression threshold.

The benchmark checkout is pinned deliberately. Update its SHA only after
reviewing the upstream benchmark changes and confirming compatibility.
