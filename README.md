![Watervein Logo](https://github.com/waterveinjs.png)

[![npm version](https://badge.fury.io/js/%40watervein%2Fcore.svg)](https://www.npmjs.com/package/@watervein/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

# Watervein

> No component. No tree. A radical re-imagining of UI systems.

### Stop Building Trees. Just Open the Valves.

Traditional frameworks force you to wrap your logic into lifecycle-heavy components. Watervein eliminates them. Look at how we express a simple decoupled reactive boundary without a single component scaffold:

```typescript
// 1. Define raw reactive state anywhere—completely decoupled from UI
const count = createState(0);

// 2. Build the layout network using raw element expressions
const app = div({}, [
  button({ onclick: () => write(count, read(count) + 1) }, "Increment"),
  span({}, () => `Current value: ${read(count)}`) // Atomic edge hook
]);

// There are no re-rendering component lifecycles. 
// Clicking the button evaluates the DAG and updates ONLY the text inside the <span>.
```

## Benchmark

Watervein is currently being integrated into the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) suite. No published numbers exist yet — treat any performance claims in this README as architectural intent, not measured results, until benchmark data is published here.

## Packages

Watervein is managed as a monorepo, split into core reactivity and DOM rendering layers:

- [`@watervein/core`](./packages/core) — The core reactive engine powered by a Node Edge System (NES) and DAGs. Handles states, batches, and side effects.
- [`@watervein/dom-core`](./packages/dom-core) — The DOM core. Provides basic DOM manipulation functions.
- [`@watervein/dom`](./packages/dom) — The DOM rendering bindings. Provides graph-driven template utilities like `For`, `Show`, and element builders.

> **Note on tag coverage**: `@watervein/dom` currently exposes a generic `element()` factory plus a growing set of tag shorthands (`div`, `span`, `button`, etc.). If you rely on a shorthand not yet exported (e.g. `tr`, `td`, `a`, `input`), fall back to `element("tag", props, children)` or check the package's `dist/index.d.ts` for the current export list.

---

## Getting Started

### Installation

Install both the core reactive system and the DOM renderer via your preferred package manager:

```bash
pnpm add @watervein/core @watervein/dom-core @watervein/dom
# or npm install @watervein/core @watervein/dom-core @watervein/dom
```

### Basic Setup

Create an `index.html` with a target element, and initialize your first Watervein graph in `main.ts`:

```typescript
import { createState, read, write, UISystem } from '@watervein/core';
import { mount, span, button } from '@watervein/dom';

const count = createState(0);

const app = span({}, [
  button({ onclick: () => { write(count, read(count) + 1); UISystem.flush(); } }, "Click me"),
  span({}, () => ` Count: ${read(count)}`)
]);

mount(document.getElementById('app')!, app);
```

## Mental Model: From Trees to Rivers

In Watervein, you don't build "components" that hold their own isolated state.
Instead, your application is a network of data channels (Waterveins).

1. **States are Springs**: Dynamic data sources.
2. **Computations are Rivers**: Downstream functions reacting to the springs.
3. **DOM Elements are Ocean Mouths**: Terminal endpoints where data finally shapes the UI.

No virtual trees to diff. No component functions to re-execute. Just targeted data flow.

## Why Watervein?

- **Node Edge System (NES) & DAGs**: Watervein abandons the traditional concepts of UI components and tree structures, replacing them with a model inspired by ECS (Entity Component System) and Directed Acyclic Graphs (DAGs).
- **Modern Developer Experience**: While the underlying architecture is unconventional, it keeps a coding style familiar to users of React, SolidJS, and similar frameworks.
- **Extensible Architecture**: You can register custom node types to extend the core's scheduling behavior.
- **Headless Core**: On its own, `core` isn't even aware of the DOM. Only by adding packages like `dom-core` or `dom` can you actually render to a page. Because `core` has no DOM dependency, it's designed to eventually support other rendering backends, such as Canvas.

## Conceptual Comparison: React vs. Vue vs. Svelte vs. SolidJS vs. Watervein vs. Vanilla JS

The table below describes each framework's *intended architecture*, not benchmarked outcomes. Complexity classes (e.g. "$O(N)$") describe the algorithmic design goal of Watervein's reconciliation loop, not a measured result.

| Feature | React | Vue 3 | Svelte 5 | SolidJS | **Watervein** | Vanilla JS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Architecture** | Component Tree (VNode) | Component Tree + Reactive Proxies | Compiler-driven Runes | Component Scopes + Signals | **Decoupled Node Edge System (NES) / DAG** | Procedural / Imperative Execution |
| **Component Execution** | Repeatedly (on every re-render) | Triggered via dependency proxy track | Run-once setup with dynamic updates | Exactly once (during setup) | **No component abstraction exists** | N/A (No component abstraction) |
| **State Mutation Scope** | Component/Subtree abstraction | Block-tree inside component | Signal-like Runes closure scope | Signal closures | **Global topology network** | Manual mutation allocation |
| **DOM Tracking Strategy** | Virtual DOM reconciliation | Hybrid VNode + Static Hoisting | Direct compiled DOM hydration/patch | Fine-grained reactive closures | **Granular text/attribute edge hooks** | Manual pinpoint DOM targeting |
| **Component Wrapper** | Requires Fiber / Virtual Parent | VNode Fragment rendering | Template Fragment Anchors | Real DOM Fragment tracking | **`display: contents` sub-wrappers** | Native layout container blocks |
| **Lifecycle Model** | Hook-driven (`useEffect` timeline) | Hook/Option driven (`onMounted`) | Rune effects / lifecycle helpers | Component-mount scopes (`onMount`) | **Entity-bound, not lifecycle-bound** | Manual event/handle registration |
| **Cleanup Mechanism** | Hook return functions | Automated unmount tracking | `$effect` tracking collection | Explicit `onCleanup` registry | **Automatic via entity destruction** (`destroyEntity`/`destroyEntities`) | Manual memory reference disposal |
| **Data Flow Direction** | Top-down unidirectional tree | Unidirectional props / events | Unidirectional signals model | Reactive proxy propagation | **Topological DAG downstream** | Custom/arbitrary manual pipelines |
| **Batching Mechanics** | Schedule-driven concurrent queues | Microtask scheduler queue | Microtask scheduler loop | Microtask signal batch loops | **Synchronous topological `flush()`** | Synchronous mutation/immediate |
| **Reordering Design Goal ($O$)** | $O(N)$ VNode diffing algorithm | $O(N)$ patch-flag keyed diffing | $O(N)$ block-list reconciliation | $O(N)$ dynamic fragment index tracking | **$O(N)$ backwards-sweep reconciliation (design target)** | Custom optimized procedural loops |

## Componentization Patterns (UI Reuse Without Component Trees)

Since Watervein relies on flat entity structures instead of a hierarchy of stateful component definitions, UI parts are created using plain, pure JavaScript factory functions.

Instead of embedding runtime lifecycle magic into custom markup tags, you pass parameters and sub-graph configurations directly into functions that return raw elements:

```typescript
import { createState, read, write, withEntity, createEntity } from '@watervein/core';
import { button } from '@watervein/dom';

// Pattern: Stateful Element Factory Function
export function createCounterButton(initialCount: number = 0) {
    const localEntityId = createEntity();

    // Lock internal reactive node state inside the allocated entity
    return withEntity(localEntityId, () => {
        const count = createState(initialCount);

        return button({
            class: "custom-btn",
            onclick: () => write(count, read(count) + 1)
        }, [
            () => `Clicks: ${read(count)}`
        ]);
    });
}

// Usage inside layout tree
const layout = element("div", {}, [
    createCounterButton(0),
    createCounterButton(10) // Independently allocated entity/memory
]);
```

### **The Golden Rules of Watervein Development:**
1. **Functions, Not Custom Tags**: Anything that looks like a component is just a plain function returning an `HTMLElement`.
2. **Encapsulate State via `withEntity`**: If your reusable UI element holds internal state, wrap its signal creation inside `withEntity(createEntity(), () => { ... })` so that destroying the entity cleans up all associated nodes.

## Usage

Here's a look at how you define reactive states and mount a list using Watervein's DAG-based system:

```typescript
import { createState, read, write, batch, UISystem } from '@watervein/core';
import { For, mount, element } from '@watervein/dom';

// 1. Define flat reactive states (NES / Data Layer)
const rowMap   = createState(new Map());
const rowOrder = createState([]);
const selected = createState(0);

// 2. Build the UI structure using graphs, not components
const list = For(
    rowOrder,
    (id) => id,
    (getId) => element("tr", {
        class: () => read(selected) === getId() ? "danger" : "",
    }, [
        element("td", { class: "col-md-1" }, () => `${getId()}`),
        element("td", { class: "col-md-4" }, [
            element("a", {
                onclick: () => write(selected, getId()),
            }, () => read(rowMap).get(getId())?.label ?? "")
        ])
    ])
);

// 3. Mount directly to the DOM
const tbody = document.querySelector("table.test-data")!;
mount(tbody, list);

// 4. Update state and flush the UI system
document.getElementById("run")!.addEventListener("click", () => {
    batch(() => {
        write(rowMap, new Map([[1, { id: 1, label: "Pretty Red Table" }]]));
        write(rowOrder, [1]);
    });
    UISystem.flush(); // Commit batched graph changes to the DOM
});
```

## Architecture

```
[ Traditional Component Tree ]         [ Watervein Flattened DAG ]
         <App />                                ┌──────────┐
          /   \                                 │  StateA  │────┐
     <Sidebar> <Main>                           └──────────┘    │
       /         \                                    │         ▼
   <Menu>      <Card>      ───(Flatten)───>     ┌─────▼────┐ ┌──▼──────┐
     │           │                              │ ComputeX │ │ EffectY │
  [State]     [Update]                          └──────────┘ └─────────┘
     │           │                                    │           │
 (Re-render entire tree)                        (Pinpoint mutation via NES)
```

Traditional frameworks model your application as a **Tree of Components**, requiring virtual DOM diffing or template analysis to isolate mutations.

Watervein instead flattens UI logic into a decoupled **Data Layer (NES Engine)** and maps operations onto a **Rendering Layer** using DOM fragments.

### 1. Node Edge System (NES) & Graph Mechanics
At the engine level (`@watervein/core`), state (`createState`), derivations (`createCompute`), and side effects (`createEffect`) exist as plain nodes in a unified global **Directed Acyclic Graph (DAG)**.

* **Entity Isolation**: States and computations can be bound to flat entity IDs (`createEntity`). There are no lexical component scopes.
* **Downstream-Only Propagation**: When a state changes via `write()`, the engine walks the graph edges downstream and marks dependent nodes as dirty. Only terminal nodes directly bound to a text block, property, or conditional block are scheduled for patching.

```
[State Node] ──(edge)──> [Compute Node] ──(edge)──> [DOM Effect Node]
│                                                     │
(write triggers)                                     (direct patch)
▼                                                     ▼
[Dirty Queue]                                       Native Element
```

### 2. Flushing Pipeline
Watervein decouples state changes from the browser's paint cycle. Multiple `write()` calls can be grouped inside `batch()`, which defers scheduling until the batch completes.

```
[ Multiple Writes ] ──> [ NES Graph Recalculation ] ──> [ UISystem.flush() ] ──> [ Synchronous DOM Commit ]
```

`UISystem.flush()` performs a synchronous topological sweep across dirtied nodes, ordered by graph depth.

> **Current limitation**: `flush()` does not currently isolate exceptions between nodes. If a `compute` or `effect` node throws during a flush, the exception propagates out of `flush()` and any remaining dirty nodes in that pass are left unprocessed. There is no `errorBoundary` API yet — see [Roadmap](#future-roadmap--ecosystem-vision). If your app logic can throw, wrap the relevant `compute`/`effect` callback in your own `try/catch` for now.

### 3. Layered DOM Decoupling
To keep the core engine free of DOM assumptions while still offering an ergonomic authoring experience, the repository splits the rendering pipeline into three packages:

```
┌─────────────────────────────────────────────────────────────┐
│  @watervein/dom (High-Level Developer DSL)                  │
│  - Ergonomic tag factories and prop shorthands               │
│  - Reactive class/style prop parsing                         │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Lowering Properties)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  @watervein/dom-core (Reactive Mutation Infrastructure)     │
│  - `display: contents` wrapper elements for `For` / `Show`  │
│  - Backwards-sweep DOM reconciliation for reordering         │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Direct Invocations)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  @watervein/core (Pure Reactive Engine)                     │
│  - Headless dependency-graph tracking                       │
│  - Entity allocation and bulk destruction                   │
└─────────────────────────────────────────────────────────────┘
```

* **`@watervein/dom`**: Provides declarative prop shorthands (e.g. `{ class: { active: someNode } }`) on top of standard tag functions.
* **`@watervein/dom-core`**: Implements the low-level element binding logic (`element`, `Show`, `For`, `mount`) that `@watervein/dom` wraps.
  > 💡 **Why `display: contents`?**: When rendering dynamic structures like lists (`For`) or conditionals (`Show`), Watervein wraps them in a real HTML element styled with `display: contents`. This tells the browser to ignore the wrapper for layout purposes, passing its children directly to the parent layout context, while still giving Watervein a stable DOM anchor to manage insertions and removals against.
* **`@watervein/core`**: Contains no references to `HTMLElement` or `document`. It only computes dependency graphs, which is why it's designed to eventually support non-DOM rendering backends (e.g. Canvas).

## Advanced State Management (The ECS Pattern)

In tree-based frameworks, passing data between distant components often requires prop drilling, Context APIs, or external state stores.

In Watervein, state nodes exist independently of any view layer, so you can define shared state as plain modules and reference it anywhere in your graph:

```typescript
// stores/serverStore.ts
import { createState, createCompute, read } from '@watervein/core';

export const globalCpuLoad = createState(0);

export const isSystemCritical = createCompute(() => {
    return read(globalCpuLoad) > 85;
});
```
```typescript
// app.ts
import { element } from '@watervein/dom';
import { read } from '@watervein/core';
import { isSystemCritical, globalCpuLoad } from './stores/serverStore.js';

const sidebar = element("div", {
    class: () => read(isSystemCritical) ? "bg-red" : "bg-gray"
}, []);

const mainPanel = element("span", {}, () => `Load: ${read(globalCpuLoad)}%`);
```

### Memory Management Strategy
- **Persistent state**: Define nodes at the module level for data that should live for the entire application session (user sessions, themes, etc.).
- **Ephemeral state**: Use `createEntity()` and `withEntity()` inside factory functions for local UI state (modals, dropdowns, list rows) so that destroying the entity (`DestructionSystem.destroyEntity` / `destroyEntities`) also prunes its associated graph nodes and edges.

## Strict TypeScript Integration

Watervein is written in strict TypeScript. Because it doesn't rely on a JSX compilation step, tag properties are typed directly against standard `HTMLElement` interfaces:

```typescript
import { button } from '@watervein/dom';

const safeButton = button({
    id: "submit-action",
    className: "btn-primary",

    // Type error: 'onclick' expects a function, not a string
    onclick: "alert('clicked')" // ❌ TS Error
}, ["Submit"]);
```

## Reactive Prop Polymorphism
Most properties accept either a static value or a reactive hook (a function or a `Node`):
```typescript
const reactiveInput = input({
    value: () => read(usernameState),
    disabled: isFormSubmitting // static boolean, or a Node<boolean>
});
```

## Testing Strategy

Because Watervein separates the pure reactive engine (`@watervein/core`) from the DOM environment, you can test application logic without a browser runtime, then layer DOM-level tests on top.

### 1. Headless Graph Testing (Zero-DOM)
Verify state mutations, batching, and side effects against the raw engine:

```typescript
import { describe, it, expect } from 'vitest';
import { createState, createCompute, createEffect, read, write, UISystem } from '@watervein/core';

describe('Counter Graph Logic', () => {
    it('propagates state changes through computed nodes', () => {
        const count = createState(0);
        const doubled = createCompute(() => read(count) * 2);

        write(count, 5);
        UISystem.flush();

        expect(read(doubled)).toBe(10);
    });
});
```

### 2. Granular Patch Testing (DOM Layer)
To test actual browser interactions, use `happy-dom` or `jsdom` to verify pinpoint text/attribute updates:
```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@watervein/dom';
import { createCounterButton } from './counter.js';

describe('Counter DOM Mutations', () => {
    it('should patch individual text nodes seamlessly', () => {
        const container = document.createElement('div');
        const btn = createCounterButton(5);
        mount(container, btn);

        const targetButton = container.querySelector('button')!;
        expect(targetButton.textContent).toBe('Clicks: 5');

        targetButton.dispatchEvent(new MouseEvent('click'));

        expect(targetButton.textContent).toBe('Clicks: 6');
    });
});
```

## Contributing

We're looking for developers to help push this architecture forward. Whether it's optimizing DAG propagation, implementing new custom node types, or fixing bugs, contributions are welcome.

### Local Development Setup
1. **Fork and clone** the repository.
2. Install dependencies and build the packages:

```bash
pnpm install
pnpm build
pnpm test
```

### Pull Request Guidelines

- Please open an issue to discuss significant architectural changes before submitting a PR.
- Ensure all tests pass before submitting.

## License

[MIT](LICENSE) — Copyright (c) 2026 Korphere

## Future Roadmap & Ecosystem Vision

Watervein's core (`@watervein/core`) is headless and decoupled from any rendering runtime. The DOM rendering layer (`@watervein/dom`) is the first concrete backend built on top of it.

Planned/under-consideration work includes:

- [ ] **Error boundaries**: An `errorBoundary` API for `@watervein/dom` that isolates exceptions thrown inside a sub-graph during `flush()`, rendering a fallback UI instead of letting the exception propagate and stall the rest of the flush pass.
- [ ] **`@watervein/canvas`**: A 2D/WebGL rendering backend powered by the same NES graph engine.
- [ ] **`@watervein/router`**: A reactive, graph-integrated client-side router that treats route updates as node transitions.
- [ ] **`@watervein/compiler`**: An optional build-time plugin (Vite / Rollup) to pre-parse static object properties into direct JavaScript assignments, reducing runtime factory-call overhead.
- [ ] **Server-side rendering / hydration**: Streaming string compilation mapped onto the existing DAG dependency resolution.

None of the above are implemented yet. This section describes direction, not current capability — please don't rely on any roadmap item until it has a corresponding package and tests.