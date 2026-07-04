# @watervein/dom-core

[![npm version](https://badge.fury.io/js/%40watervein%2Fdom-core.svg)](https://www.npmjs.com/package/@watervein/dom-core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The DOM rendering orchestration layer for Watervein. It binds `@watervein/core`'s Node Edge System (NES) graph directly to the browser DOM, handling node scheduling, non-VNode control flows, and reactive template patching.

---

## Key Features

- **Zero-Virtual DOM Tracking**: Binds reactive graph nodes (`WvNode`) directly to specific DOM attributes, text pieces, and style properties via `createEffect`.
- **Marker-Based Control Flow**: Uses hidden anchor text nodes (`document.createTextNode("")`) and `display: contents` wrapper elements to pivot conditional views (`Show`) and lists (`For`) without disrupting layout.
- **Single-Pass List Reconciliation**: The `For` helper generates, destroys, and reorders entities within one reactive pass, using a reversed-index `insertBefore` sweep to keep DOM mutation cost close to $O(N)$ per update.
- **Polymorphic Style & Class Binder**: Handles object-literal style/class tracking, reactive function values, and direct atomic updates without re-triggering broad element repaint.

---

## Installation

```bash
pnpm add @watervein/core @watervein/dom-core
```

## Core API & Component Structures

`element(tag, props, children)`
The structural primitive builder for HTML tags. Processes event listeners (`on*`), reactive attributes, arrays of children, and nested graph callbacks.
```typescript
import { element } from '@watervein/dom-core';
import { createState, write } from '@watervein/core';

const bg = createState("blue");

// Generates an HTMLElement with a live style binding tied to the graph
const button = element("button", {
  style: { backgroundColor: bg },
  onclick: () => write(bg, "red")
}, "Click Me");
```

`Show(condition, thenFn, elseFn?)`
A reactive conditional rendering boundary. Uses `@watervein/core`'s `matchEntity` internally to destroy the previous branch's entity (and all of its reactive nodes) whenever the condition flips.
```typescript
import { Show } from '@watervein/dom-core';

const isLogged = createState(false);

const view = Show(
  isLogged,
  () => element("div", {}, "Welcome Back!"),
  () => element("div", {}, "Please Log In")
);
```

`For<T>(listNode, keyFn, renderFn)`
A keyed list renderer backed by a flat cache (`entryCache`, keyed by `keyFn`). On each update it destroys entities/DOM for removed keys, creates entities/DOM for new keys, and repositions existing DOM nodes to match the new order — all within a single `createEffect`, iterating the list backwards.
```typescript
import { For } from '@watervein/dom-core';

const items = createState([{ id: 1, text: "Task A" }]);

const listView = For(
  items,
  (item) => item.id,
  (getItem, getIndex) => element("li", {}, () => getItem().text)
);
```

### Mount Helpers
Lightweight mounting helpers to attach a graph's root element to the document.

```typescript
import { mount, mountToBody, mountToHead, mountToRoot } from '@watervein/dom-core';

// Standard target mount
mount(document.getElementById("app")!, myLayout);

// Global scopes
mountToBody(modalContainer);
```

## Deep Performance Architecture (The List Engine)

`For` performs generation, destruction, and reordering in a single backward pass over the list, so a newly-inserted item is placed at the correct DOM position within the same reactive flush that created it — there's no separate "reorder" pass that could run before the "create" pass has registered the new entity.

```
[ For's createEffect runs ] ──> Diff current keys against previous keys
                                        │
                                        ▼
                        Destroy entities/DOM for removed keys
                        (via DestructionSystem.destroyEntities)
                                        │
                                        ▼
              Walk the list backwards (len - 1 .. 0)
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              ▼                                                     ▼
     Key already cached?                                   Key not cached?
     write() updated item/index                            createEntity + renderFn,
     into existing nodes                                    cache the resulting DOM
              │                                                     │
              └─────────────────────┬───────────────────────────────┘
                                     ▼
                    Is el.nextSibling !== anchor?
                    ├── YES → wrapper.insertBefore(el, anchor)
                    └── NO  → skip (already in the correct position)
```

1. **Backwards DOM Drift Avoidance**: Walking the list from the end avoids the classic issue where shifting one element forces a layout recalculation cascade across its siblings, since each `anchor` is already resolved by the time its predecessor is placed.

2. **True Componentless Lifecycles**: Since there are no nested class-based components, lifecycle teardown happens directly through `@watervein/core`'s entity registry. When a keyed row is removed, its entity is destroyed and every dependent node/edge is pruned from the reactive graph in the same pass.

## License
MIT License.