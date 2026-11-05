# Watervein Real-time Core Metrics Dashboard (Example)

This directory hosts a high-frequency real-time telemetry dashboard designed to stress-test and showcase the synchronization limits between `@watervein/core` graph streams and the raw `@watervein/dom` presentation layer.

---

## Technical Highlights Demonstrated

- **Asynchronous Pipeline Suspend (`createResource`)**: Binds an active async fetch state to structural loading boundaries using `Show`, tracking pipeline network latency out of the box.
- **Continuous 100 ms Telemetry Flushes**: A relentless `setInterval` loop writes to global metrics and to every process row on each tick. The writes are pooled and applied together via `UISystem.flush()`.
- **Per-Row Fine-Grained State**: Each process row owns its own `cpu` and `memory` states. A tick writes directly to those states, so only the affected text nodes are updated. The row list itself never changes during a tick, so neither the list nor the surrounding row structure is recomputed or rebuilt.
- **Sort Without Subscriptions**: Sorting is a `createCompute` that reads only the sort key, the row list, and a throttled `sortTick`. It never subscribes to per-row states.

---

## File Architecture

- **`index.ts`**: The application bootstrap layer. Houses state initialization, per-row state, the sorting computation, and the dashboard layout graph definition.
- **`index.html`**: The application container shell featuring minimal baseline CSS configurations to emphasize native structural composition over framework runtime weights.

---

## Getting Started

### 1. Launch the Development Shell
Make sure you have compiled the root workspace. From the example or workspace root path, activate your favorite ESM development server (e.g., `vite`):

```bash
pnpm dev
```

### 2. Witness the Rendering Profile
Open the DevTools **Performance** tab, record about 10 seconds, and look at the per-tick Scripting and Rendering time. In the Elements panel, enable paint flashing: only the telemetry cards and the CPU/Memory cells should flash on each tick, while PID and name cells stay untouched.

Tips for measuring:
- Close the console while recording. Logging inside the 100 ms loop would distort the numbers, which is why the example does not log.
- Raise the row count (e.g. 1,000 or 10,000 in `index.ts`) to see how the cost scales.
- Leave the page open for a few minutes and watch the heap for leaks.

---

## In-Depth Analysis: Per-Row State

Each row is a stable object that carries its own reactive fields, plus a plain `raw` copy of the latest values used only for sorting:

```typescript
type Row = {
  pid: number;
  name: string;
  cpu: State<number>;
  memory: State<number>;
  raw: { cpu: number; memory: number };
};
```

The simulator writes to each row's state directly and never replaces the array:

```typescript
for (const row of read(rows)) {
  const cpu = Math.floor(Math.random() * 100);
  row.raw.cpu = cpu;
  write(row.cpu, cpu);
}
```

Cells bind to their own state only:

```typescript
div({ style: COL_NUM }, () => `${read(row.cpu)}%`)
```

### Why this design matters

1. **Updates are O(changed cells).** A tick touches 200 text nodes (100 rows × CPU and Memory) plus the global cards. Nothing else re-runs.
2. **No per-cell scans.** Cells never read the whole list and `find` their own entry. The cost of a cell update does not grow with the number of rows.
3. **Stable row identity.** Because rows keep the same object reference, `For` reuses the existing DOM nodes (matched by `pid`) and the `item()` value never goes stale.
4. **Sorting stays off the hot path.**
   - By **Process ID**, the sort never reads `sortTick`, so it is not recomputed during ticks at all.
   - By **Highest CPU** or **Highest Memory**, the sort compares `raw` values (not reactive states) and is re-triggered by `sortTick`, which advances once every `SORT_REFRESH_EVERY` ticks (default 10, i.e. once per second).

### Why the sorted order lags behind the values

When sorting by CPU or Memory, the CPU/Memory columns update every 100 ms, but row order is refreshed only once per second. This is intentional: reordering up to 100 rows every 100 ms would make the table unreadable. Set `SORT_REFRESH_EVERY = 1` in `index.ts` to re-sort on every tick, which is useful for stress-testing the keyed reorder path in `For`.

---

## License

This project is licensed under either of:

* Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
* MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.