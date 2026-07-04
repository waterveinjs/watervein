# Contributing to Watervein

Thank you for your interest in contributing to Watervein! We are building a radical, component-free reactive UI framework, and your help is highly appreciated.

Please take a moment to review this document before submitting issues or pull requests.

## Architecture Overview

Watervein is managed as a monorepo using `pnpm`. It consists of the following packages:
* **`@watervein/core`**: The standalone, high-performance Directed Acyclic Graph (DAG) reactivity engine.
* **`@watervein/dom-core`**: Low-level DOM mutation layers and structure tracking.
* **`@watervein/dom`**: The high-level TypeScript fluent element DSL (`div`, `span`, etc.).

---

## Local Setup

### Prerequisites
* **Node.js**: v18 or higher
* **pnpm**: v8 or higher

### Installation & Initialization
Clone the repository and install all dependencies from the root directory:

```bash
git clone [https://github.com/your-username/watervein.git](https://github.com/your-username/watervein.git)
cd watervein
pnpm install
```

## Building the Project
To compile all packages into their respective `dist/` directories:
```bash
pnpm build
```

## Testing Strategy
We enforce strict test compliance to maintain core graph stability. All tests are decoupled from source files and placed under the `/tests` folder inside each package.

To execute the entire test workspace (running both headless Node environments and Happy DOM environments via Vitest):
```bash
pnpm test
```

### Rules for Adding Code
1. **Never Bypass Guards**: Do not modify inner topological sorting states without adding explicit edge-case test suites.
2. **Zero In-Source Tests**: Place all test specs (`*.test.ts`) strictly within the designated package `tests/` directories.
3. **Keep Performance Pure**: Avoid introducing browser globals inside `@watervein/core`. It must remain fully isomorphic.

## Pull Request Guidelines
1. **Fork & Branch**: Create a descriptive branch name (e.g., `feat/atomic-batch-opt` or `fix/edge-remapping-leak`).
2. **Format & Lint**: Ensure TypeScript compiles cleanly with zero type casting overrides unless strictly required for performance optimization (`as any`).
3. **Commit Messages**: Follow standard conventional commits (e.g., `feat(core): ...`, `fix(dom): ...`).
4. **Green CI**: Ensure `pnpm test` passes locally before pushing your code.