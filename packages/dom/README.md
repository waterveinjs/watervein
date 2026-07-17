# @watervein/dom

[![npm version](https://badge.fury.io/js/%40watervein%2Fdom.svg)](https://www.npmjs.com/package/@watervein/dom)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The high-level developer-facing DSL layer for Watervein. It exports hyper-optimized, functional element builders (`div`, `span`, `button`, etc.) and intuitive DSL type-guards, allowing you to write clean, declarative markup in pure TypeScript with zero build-time JSX transformations.

---

## Key Features

- **Vanillatastic Functional DSL**: Drop JSX completely. Construct entire UI layouts using vanilla functional trees like `div({}, [ span({}, "Hello") ])` that map directly to the DOM at runtime.
- **Smart DSL Attribute Normalization**: Intelligently inspects and intercepts object-based styles and polymorpic reactive class values (`Dsl1Class`), feeding safe abstractions seamlessly down into `dom-core`.
- **Full HTML5 Elements Autocomplete**: Ships with strongly-typed, out-of-the-box functions for every legal HTML5 element—providing lightning-fast IDE IntelliSense.
- **Isomorphic Core Re-exports**: Re-exports foundational mounting workflows and optimized control flows (`Show`, `For`) directly from `dom-core` so you only need a single runtime package import.

---

## Installation

```bash
pnpm add @watervein/core @watervein/dom
```

## Usage Guide
Instead of compiling complex HTML templates or virtual nodes, write pure functional component layouts:
```typescript
import { createState, read, write, UISystem } from '@watervein/core';
import { div, h1, button, p, span, mount } from '@watervein/dom';

const clicks = createState(0);

const counterApp = div({ class: "container" }, [
  h1({}, "Watervein App"),
  p({ style: { color: "gray" } }, "A modern NES-driven template framework."),
  
  button({
    class: { "btn-active": () => read(clicks) > 0 },
    onclick: () => {
      write(clicks, read(clicks) + 1);
      UISystem.flush();
    }
  }, [
    span({}, "Increment Counter: "),
    span({}, () => read(clicks))
  ])
]);

mount(document.getElementById("root")!, counterApp);
```

## API References
### **Flexible Reactive Binding Specifications**
Every element attribute or layout child accepts standard primitives, raw graph nodes, or lazy evaluation functions seamlessly.
```typescript
type ReactiveProp<T> = T | WvNode<T> | (() => T);
```

### 1. Polymorphic Class Mapping (`Dsl1Class`)
Supports strings, state wrappers, computed anonymous arrow closures, array chains, or conditional boolean dictionaries out of the box.
```typescript
div({ class: "static-class" })
div({ class: () => isUrgent() ? "danger" : "normal" })
div({ class: { active: isActiveNode, hidden: () => isHidden() } })
div({ class: ["class-a", dynamicClassNode] })
```

### 2. Fully Covered Elements Layer (`@watervein/dom/elements`)
Every method perfectly enforces argument packing options (`[props?, children?]`) mapping type definitions across structural browser nodes:
- `a()`, `button()`, `canvas()`, `div()`, `form()`, `input()`, `label()`, `ol()`, `p()`, `section()`, `span()`, `table()`, `tbody()`, `td()`, `tr()`, `ul()`, and 90+ more.

## Architectural Workflow (How the DSL structures layers)
```mermaid
graph TD
    Input["div({ class: { active: node } }, [...])"]

    DOM["<strong>@watervein/dom</strong>"]
    DOMCore["<strong>@watervein/dom-core</strong>"]

    ElementCall["element(\"div\", parsedProps, children)"]
    Mutation["Direct Native DOM Mutations"]

    Input -- "Normalizes and Guards Classes" --> ElementCall
    ElementCall -- "Binds Dynamic Graphs & Effects" --> Mutation

    DOM -.-> ElementCall
    DOMCore -.-> Mutation

    DOM ~~~ DOMCore

    style DOM fill:#edf2f7,stroke:#4a5568,stroke-width:1px
    style DOMCore fill:#edf2f7,stroke:#4a5568,stroke-width:1px
    style Mutation fill:#d4edda,stroke:#155724,stroke-width:1px
```

By adding a dedicated DSL layer, Watervein protects runtime performance while offering clean developer aesthetics. It checks for reactive boundary nodes (via `isNode`) upfront, avoiding parsing loops when `dom-core` begins binding side-effects to the real tree.

## License
MIT License. Built with passion for maximum speed.