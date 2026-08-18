# Watervein Real-time Core Metrics Dashboard (Example)

This directory hosts a high-frequency real-time telemetry dashboard designed to stress-test and showcase the synchronization limits between `@watervein/core` graph streams and the raw `@watervein/dom` presentation layer.

---

## Technical Highlights Demonstrated

- **Asynchronous Pipeline Suspend (`createResource`)**: Binds an active async fetch state to structural loading boundaries using `Show`, tracking pipeline network latency out of the box.
- **Continuous $100\text{ms}$ Telemetry Flushes**: A relentless `setInterval` loop fires state updates, array shuffles, and graph invalidations concurrently. The background thread pools all actions via `UISystem.flush()`.
- **Granular List Updates within `For`**: Demonstrates true granular field extraction inside loops. By writing custom callbacks like `getRowCpu`, only the specific mutating textual `Node` updates its string representation, rather than tearing down and reconstructing the surrounding table row structures.

---

## File Architecture

- **`index.ts`**: The application bootstrap layer. Houses state initialization, reactive data tables, sorting computations, and the dashboard layout graph definition.
- **`index.html`**: The application container shell featuring minimal baseline CSS configurations to emphasize native structural composition over framework runtime weights.

---

## Getting Started

### 1. Launch the Development Shell
Make sure you have compiled the root workspace. From the example or workspace root workspace path, activate your favorite ESM development server (e.g., `vite`):

```bash
pnpm dev
```

### 2. Witness the Rendering Profile
Open your browser console to see the real-time activity loop:
```
⚡ [write] The simulator updates the value. Current value: 42
⚡ [write] The simulator updates the value. Current value: 87
```

## In-Depth Analysis: Granular Row Sub-Subscribers
Take note of how cell values are fetched within the `For` loop block:
```typescript
const getRowCpu = () => {
    const list = read(sortedProcesses);
    const latest = list.find(x => x.pid === rawItem().pid);
    return latest ? `${latest.cpu}%` : `${rawItem().cpu}%`;
};
```

### Why this design matters:
1. When sorting criteria alters (e.g., clicking **"Highest CPU"**), the `For` component identifies matching entity keys via its cache tracking system.
2. The browser automatically relocates the raw row nodes using optimized $O(N)$ backwards insertion offsets.
3. Because the child element uses the evaluation lambda `getRowCpu` directly, text changes on existing rows happen inside highly localized target text mutations—without causing widespread canvas layouts or parent element destruction loops.

## License
MIT License. Built with passion for maximum speed.