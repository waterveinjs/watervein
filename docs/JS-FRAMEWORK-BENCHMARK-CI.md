# Automated js-framework-benchmark CI

The `js-framework-benchmark` workflow runs for pull requests targeting `main`,
pushes to `main`, and manual dispatches. It checks out the benchmark repository
separately, builds the current watervein checkout, packs the three published
workspace packages locally, and temporarily points the benchmark's Watervein
implementation at those tarballs.

This means pull requests are measured against their own watervein source without
publishing prerelease packages to npm or changing the benchmark repository.

The workflow installs the benchmark root, runner, and server dependencies, then
runs the benchmark's smoke test, keyed check, CSP check, and full Watervein
benchmark. JSON results and server diagnostics are uploaded as a
30-day Actions artifact.

The benchmark repository is checked out at the reviewed commit
`1e4e53d411defc4a02e5842efda9bfe73be8567b` so upstream changes cannot silently
alter the benchmark environment. Update this SHA deliberately when adopting a
new benchmark revision.

Performance numbers from GitHub-hosted runners are informational: shared-runner
load can vary. The workflow fails on build, smoke-test, benchmark, keyed, or CSP
errors, but does not enforce a percentage-based performance regression threshold.
