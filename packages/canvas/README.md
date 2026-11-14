# @watervein/canvas

A Canvas 2D rendering package for Watervein.

The initial implementation uses a flat scene store backed by typed arrays. Nodes are addressed by numeric handles; reactive properties accept ordinary values, Watervein Core nodes, or getter functions.

## Installation

```bash
pnpm add @watervein/core @watervein/canvas
```

## Usage

```ts
import { createState } from '@watervein/core';
import {
  createCircle,
  createRenderer,
  createScene,
} from '@watervein/canvas';

const scene = createScene();
const x = createState(80);

createCircle(scene, {
  x,
  y: 60,
  radius: 24,
  fill: '#3498db',
});

const renderer = createRenderer({
  canvas: document.querySelector('canvas')!,
  scene,
});

renderer.render();
```

Reactive properties use the same value convention as `@watervein/dom-core`:

- A plain value is stored directly.
- A Core node is read inside an effect.
- A getter function is evaluated inside an effect and can track Core nodes read by that function.

Static-only nodes do not create Core effects. A node with one or more reactive properties uses one effect to update all of its reactive fields. Removing a node destroys that effect's Core entity.

## Initial API

- `createScene()`
- `createCircle(scene, options)`
- `createRect(scene, options)`
- `createText(scene, options)`
- `removeNode(scene, nodeId)`
- `createRenderer({ canvas, scene })`
- `scene.clear()`
- `scene.destroy()`

The initial scene is a flat collection of drawable nodes, not yet a hierarchical transform graph. Grouping, transforms, hit testing, custom drawing nodes, and additional rendering backends are intentionally deferred until their data and performance costs can be measured.

A scene currently supports one active renderer. Call `renderer.destroy()` before attaching another renderer. The renderer schedules a frame when browser `requestAnimationFrame` is available; `render()` remains available for explicit rendering and non-browser tests.

## Development

```bash
pnpm --filter @watervein/canvas build
pnpm typecheck
pnpm test
```

## License

MIT OR Apache-2.0
