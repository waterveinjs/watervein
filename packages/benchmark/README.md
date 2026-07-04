# @watervein/benchmark

The structural verification and stress-testing suite for the Watervein reactive ecosystem. This system measures deep dependency graphing, extreme fan-in/out propagation profiles, raw memory footprints via `performance.memory` tracking, and the microsecond overhead introduced by high-level DSL translations.

---

## Benchmark Philosophy

Watervein skips the Virtual DOM entirely and instead leverages a graph-driven Reactive Entity Component System (ECS). To ensure zero regression and track memory leak thresholds across scaling iterations, this benchmark targets three key areas:
1. **Graph Topologies**: Testing deeply nested reactive chains, wide fan-out broadcast trees, and massive dependency gathering structures (Fan-In).
2. **Reconciliation Cost**: Tracking DOM mutation cost during `For` array inversions and fractional state drops ($10\%$ vs $50\%$ row replacements).
3. **Abstraction Overhead**: Measuring the precise time cost in microseconds ($\mu s$) when translating high-level template properties down to raw core nodes.

---

## Key Metrics Captured

| Benchmark Identifier | Strategy & Target | Crucial Optimization Verified |
| :--- | :--- | :--- |
| **`[BUILD DAG]`** | Generates up to 100,000 computed dependency lanes. | Graph node allocation and tree balancing speeds. |
| **`[HIGH FREQUENCY UPDATE]`** | Thousands of atomic signals fired across buffered batch scopes. | Transient state deduction and layout collapse avoidance. |
| **`[DESTROY ENTITY]`** | Micro-benchmark comparing singular vs. multi-entity bulk flushes. | Garbage Collection alignment and ECS entity graph pruning efficiency. |
| **`[PARTIAL REPLACE]`** | Destroys and appends raw components mid-array. | List element retention and stable element caching efficiency. |
| **`[DOM Mapping Abstraction]`** | Compares `dom-core` primitive processing with `dom` wrappers. | Tracks the exact overhead (per-element in $\mu s$) of the developer-friendly DSL wrapper. |

---

## Setup & Running the Tests

To accurate evaluate heap changes (`Δheap`), execute these benchmarks in an environment supporting the global Chrome V8 Engine garbage collector flag (`--js-flags="--expose-gc"`).

### 1. Register Global Triggers
Import the test runner bundle inside your web runtime shell. The package registers two testing scopes directly on the window object:

```typescript
import '@watervein/benchmark'; 

// 1. Run the standardized isolation stress suite
window.runWaterveinBenchmark();

// 2. Run the exponential macro-scale sweep (SMALL -> HUGE)
window.runWaterveinScaleBenchmark();
```

## Multi-Scale Evaluation Levels
`runWaterveinScaleBenchmark()` iteratively sweeps across four distinct node load densities, ensuring framework reactivity scales linearly:
```
[SMALL] (n=100)  ────>  [MIDDLE] (n=1,000)  ────>  [LARGE] (n=10,000)  ────>  [HUGE] (n=100,000)
```

- `SMALL` & `MIDDLE`: Standard application view scopes. Focuses on base reaction overhead.
- `LARGE`: High-density interactive canvas data or heavy real-time data table streams.
- `HUGE` ($100,000$ Nodes): Absolute framework stress barrier. Measures system boundaries for raw node graph compilation speeds, extreme fan-out limits, and total heap memory impacts.

## Architectural Deep-Dive: Overhead Profiling
The framework isolates user-space abstractions by directly racing `el0` (low-level node builders) against `el1` (high-level DSL tag factories):
```
Method A (el0): el0("div", { class: { "box": true } }, [ () => ... ])
Method B (el1): el1("div", { class: { "box": true } }, [ () => ... ])

Resulting Delta Execution Time
  ↳ ΔTime = (Time_el1 - Time_el0) / Total_Elements
  ↳ Discovers the pure cost of 'isNode' checking and dynamic class property parsing.
```

By profiling the framework this way, we ensure that the convenience of object-literal assignments and clean functional syntax never comes at the cost of high runtime rendering overhead.

## License
MIT License. Built to keep performance metrics transparent and lightning fast.