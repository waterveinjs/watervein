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

## HTML report and artifacts

After the benchmark run, `scripts/generate-benchmark-report.mjs` reads the
benchmark JSON output and generates `benchmark-report/index.html`. The
self-contained HTML report includes:

- CPU benchmark comparisons with total, JavaScript, and paint medians, plus
  mean, standard deviation, minimum, and maximum;
- memory measurements;
- uncompressed and compressed bundle sizes;
- first-paint measurements;
- framework coverage, so missing results are visible rather than treated as
  zero;
- benchmark revision, commit, browser, and generation metadata.

The report supports filtering by framework/operation, switching between total,
JavaScript, and paint CPU timings, and sorting numeric columns. It uses no
external scripts or services.

The workflow uploads the report together with the raw JSON result files and
server diagnostics as a 30-day GitHub Actions artifact named
`watervein-framework-comparison-<commit-sha>`. Download and open
`benchmark-report/index.html` locally to inspect the comparison.

The report generator runs even when a benchmark step fails, allowing partial
results and framework coverage to be inspected. A missing result is not a
zero-duration result.

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
