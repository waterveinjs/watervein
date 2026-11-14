import {
  createEffect,
  createEntity,
  DestructionSystem,
  isNode,
  read,
  withEntity,
} from '@watervein/core';
import type {
  CircleOptions,
  NodeId,
  ReactiveProp,
  RectOptions,
  Scene,
  TextOptions,
} from './types.js';

export const NODE_CIRCLE = 1;
export const NODE_RECT = 2;
export const NODE_TEXT = 3;

const INITIAL_CAPACITY = 64;
const SLOT_BASE = 0x1_0000_0000;
const MAX_GENERATION = 0x1fffff;

type SceneData = {
  entityId: number;
  capacity: number;
  nextSlot: number;
  freeSlots: number[];
  active: Uint8Array;
  type: Uint8Array;
  generation: Uint32Array;
  effectEntity: Int32Array;
  x: Float32Array;
  y: Float32Array;
  width: Float32Array;
  height: Float32Array;
  radius: Float32Array;
  lineWidth: Float32Array;
  fill: string[];
  stroke: string[];
  text: string[];
  font: string[];
  destroyed: boolean;
  dirty: boolean;
  onInvalidate: (() => void) | null;
};

const scenes = new WeakMap<Scene, SceneData>();

function createSceneData(entityId: number): SceneData {
  const data: SceneData = {
    entityId,
    capacity: INITIAL_CAPACITY,
    nextSlot: 0,
    freeSlots: [],
    active: new Uint8Array(INITIAL_CAPACITY),
    type: new Uint8Array(INITIAL_CAPACITY),
    generation: new Uint32Array(INITIAL_CAPACITY),
    effectEntity: new Int32Array(INITIAL_CAPACITY),
    x: new Float32Array(INITIAL_CAPACITY),
    y: new Float32Array(INITIAL_CAPACITY),
    width: new Float32Array(INITIAL_CAPACITY),
    height: new Float32Array(INITIAL_CAPACITY),
    radius: new Float32Array(INITIAL_CAPACITY),
    lineWidth: new Float32Array(INITIAL_CAPACITY),
    fill: new Array<string>(INITIAL_CAPACITY),
    stroke: new Array<string>(INITIAL_CAPACITY),
    text: new Array<string>(INITIAL_CAPACITY),
    font: new Array<string>(INITIAL_CAPACITY),
    destroyed: false,
    dirty: true,
    onInvalidate: null,
  };
  data.effectEntity.fill(-1);
  return data;
}

function growFloat32(source: Float32Array, capacity: number): Float32Array {
  const target = new Float32Array(capacity);
  target.set(source);
  return target;
}

function growUint8(source: Uint8Array, capacity: number): Uint8Array {
  const target = new Uint8Array(capacity);
  target.set(source);
  return target;
}

function growUint32(source: Uint32Array, capacity: number): Uint32Array {
  const target = new Uint32Array(capacity);
  target.set(source);
  return target;
}

function growInt32(source: Int32Array, capacity: number): Int32Array {
  const target = new Int32Array(capacity);
  target.set(source);
  return target;
}

function ensureCapacity(data: SceneData, minCapacity: number): void {
  if (minCapacity <= data.capacity) return;

  let capacity = data.capacity;
  while (capacity < minCapacity) {
    capacity = capacity + (capacity >> 1) + 1;
  }

  data.active = growUint8(data.active, capacity);
  data.type = growUint8(data.type, capacity);
  data.generation = growUint32(data.generation, capacity);
  data.effectEntity = growInt32(data.effectEntity, capacity);
  data.effectEntity.fill(-1, data.capacity);
  data.x = growFloat32(data.x, capacity);
  data.y = growFloat32(data.y, capacity);
  data.width = growFloat32(data.width, capacity);
  data.height = growFloat32(data.height, capacity);
  data.radius = growFloat32(data.radius, capacity);
  data.lineWidth = growFloat32(data.lineWidth, capacity);
  data.fill.length = capacity;
  data.stroke.length = capacity;
  data.text.length = capacity;
  data.font.length = capacity;
  data.capacity = capacity;
}

function encodeNodeId(slot: number, generation: number): NodeId {
  return generation * SLOT_BASE + slot;
}

function resolveNodeId(data: SceneData, id: NodeId): number {
  if (!Number.isSafeInteger(id) || id < 0) return -1;

  const slot = id % SLOT_BASE;
  const generation = Math.floor(id / SLOT_BASE);

  if (
    slot >= data.nextSlot ||
    data.active[slot] !== 1 ||
    data.generation[slot] !== generation
  ) {
    return -1;
  }

  return slot;
}

function allocateNode(data: SceneData, type: number): number {
  if (data.destroyed) {
    throw new Error('[watervein/canvas] Cannot add a node to a destroyed scene.');
  }

  const slot =
    data.freeSlots.length > 0 ? data.freeSlots.pop()! : data.nextSlot++;

  ensureCapacity(data, slot + 1);

  data.active[slot] = 1;
  data.type[slot] = type;
  data.effectEntity[slot] = -1;
  data.x[slot] = 0;
  data.y[slot] = 0;
  data.width[slot] = 0;
  data.height[slot] = 0;
  data.radius[slot] = 0;
  data.lineWidth[slot] = 1;
  data.fill[slot] = '#000';
  data.stroke[slot] = '';
  data.text[slot] = '';
  data.font[slot] = '10px sans-serif';

  return slot;
}

function isReactive<T>(value: ReactiveProp<T> | undefined): boolean {
  return value !== undefined && (isNode(value) || typeof value === 'function');
}

function resolve<T>(value: ReactiveProp<T>): T {
  if (isNode(value)) return read(value as Parameters<typeof read<T>>[0]);
  if (typeof value === 'function') return (value as () => T)();
  return value;
}

function attachEffect(
  data: SceneData,
  slot: number,
  generation: number,
  update: () => void,
): void {
  const entityId = withEntity(data.entityId, () => createEntity());
  data.effectEntity[slot] = entityId;

  try {
    withEntity(entityId, () =>
      createEffect(() => {
        if (
          data.destroyed ||
          data.active[slot] !== 1 ||
          data.generation[slot] !== generation
        ) {
          return;
        }

        update();
        markSceneDirty(data);
      }),
    );
  } catch (error) {
    data.effectEntity[slot] = -1;
    DestructionSystem.destroyEntity(entityId);
    throw error;
  }
}

export function markSceneDirty(data: SceneData): void {
  if (data.destroyed) return;
  data.dirty = true;
  data.onInvalidate?.();
}

export function getSceneData(scene: Scene): SceneData {
  const data = scenes.get(scene);
  if (!data || data.destroyed) {
    throw new Error('[watervein/canvas] Scene is destroyed or unknown.');
  }
  return data;
}

export function createScene(): Scene {
  const entityId = createEntity();
  const scene: Scene = {
    clear() {
      clearScene(scene);
    },
    destroy() {
      destroyScene(scene);
    },
  };

  scenes.set(scene, createSceneData(entityId));
  return scene;
}

function clearScene(scene: Scene): void {
  const data = getSceneData(scene);

  for (let slot = 0; slot < data.nextSlot; slot++) {
    if (data.active[slot] !== 1) continue;
    removeSlot(data, slot);
  }

  markSceneDirty(data);
}

function destroyScene(scene: Scene): void {
  const data = scenes.get(scene);
  if (!data || data.destroyed) return;

  clearScene(scene);
  data.destroyed = true;
  data.onInvalidate = null;
  DestructionSystem.destroyEntity(data.entityId);
  scenes.delete(scene);
}

function removeSlot(data: SceneData, slot: number): void {
  const effectEntity = data.effectEntity[slot];
  if (effectEntity !== -1) {
    DestructionSystem.destroyEntity(effectEntity);
    data.effectEntity[slot] = -1;
  }

  data.active[slot] = 0;
  data.type[slot] = 0;
  data.fill[slot] = '';
  data.stroke[slot] = '';
  data.text[slot] = '';
  data.font[slot] = '';

  const generation = data.generation[slot];
  if (generation < MAX_GENERATION) {
    data.generation[slot] = generation + 1;
    data.freeSlots.push(slot);
  }
}

export function removeNode(scene: Scene, nodeId: NodeId): void {
  const data = getSceneData(scene);
  const slot = resolveNodeId(data, nodeId);
  if (slot === -1) return;

  removeSlot(data, slot);
  markSceneDirty(data);
}

export function createCircle(scene: Scene, options: CircleOptions): NodeId {
  const data = getSceneData(scene);
  const slot = allocateNode(data, NODE_CIRCLE);
  const generation = data.generation[slot];

  if (options.x !== undefined && !isReactive(options.x)) data.x[slot] = options.x;
  if (options.y !== undefined && !isReactive(options.y)) data.y[slot] = options.y;
  if (!isReactive(options.radius)) data.radius[slot] = options.radius;
  if (options.fill !== undefined && !isReactive(options.fill)) data.fill[slot] = options.fill;
  if (options.stroke !== undefined && !isReactive(options.stroke)) data.stroke[slot] = options.stroke;
  if (options.lineWidth !== undefined && !isReactive(options.lineWidth)) data.lineWidth[slot] = options.lineWidth;

  if (
    isReactive(options.x) ||
    isReactive(options.y) ||
    isReactive(options.radius) ||
    isReactive(options.fill) ||
    isReactive(options.stroke) ||
    isReactive(options.lineWidth)
  ) {
    attachEffect(data, slot, generation, () => {
      if (isReactive(options.x)) data.x[slot] = resolve(options.x);
      if (isReactive(options.y)) data.y[slot] = resolve(options.y);
      if (isReactive(options.radius)) data.radius[slot] = resolve(options.radius);
      if (isReactive(options.fill)) data.fill[slot] = resolve(options.fill);
      if (isReactive(options.stroke)) data.stroke[slot] = resolve(options.stroke);
      if (isReactive(options.lineWidth)) data.lineWidth[slot] = resolve(options.lineWidth);
    });
  }

  markSceneDirty(data);
  return encodeNodeId(slot, generation);
}

export function createRect(scene: Scene, options: RectOptions): NodeId {
  const data = getSceneData(scene);
  const slot = allocateNode(data, NODE_RECT);
  const generation = data.generation[slot];

  if (options.x !== undefined && !isReactive(options.x)) data.x[slot] = options.x;
  if (options.y !== undefined && !isReactive(options.y)) data.y[slot] = options.y;
  if (!isReactive(options.width)) data.width[slot] = options.width;
  if (!isReactive(options.height)) data.height[slot] = options.height;
  if (options.fill !== undefined && !isReactive(options.fill)) data.fill[slot] = options.fill;
  if (options.stroke !== undefined && !isReactive(options.stroke)) data.stroke[slot] = options.stroke;
  if (options.lineWidth !== undefined && !isReactive(options.lineWidth)) data.lineWidth[slot] = options.lineWidth;

  if (
    isReactive(options.x) ||
    isReactive(options.y) ||
    isReactive(options.width) ||
    isReactive(options.height) ||
    isReactive(options.fill) ||
    isReactive(options.stroke) ||
    isReactive(options.lineWidth)
  ) {
    attachEffect(data, slot, generation, () => {
      if (isReactive(options.x)) data.x[slot] = resolve(options.x);
      if (isReactive(options.y)) data.y[slot] = resolve(options.y);
      if (isReactive(options.width)) data.width[slot] = resolve(options.width);
      if (isReactive(options.height)) data.height[slot] = resolve(options.height);
      if (isReactive(options.fill)) data.fill[slot] = resolve(options.fill);
      if (isReactive(options.stroke)) data.stroke[slot] = resolve(options.stroke);
      if (isReactive(options.lineWidth)) data.lineWidth[slot] = resolve(options.lineWidth);
    });
  }

  markSceneDirty(data);
  return encodeNodeId(slot, generation);
}

export function createText(scene: Scene, options: TextOptions): NodeId {
  const data = getSceneData(scene);
  const slot = allocateNode(data, NODE_TEXT);
  const generation = data.generation[slot];

  if (options.x !== undefined && !isReactive(options.x)) data.x[slot] = options.x;
  if (options.y !== undefined && !isReactive(options.y)) data.y[slot] = options.y;
  if (!isReactive(options.text)) data.text[slot] = options.text;
  if (options.font !== undefined && !isReactive(options.font)) data.font[slot] = options.font;
  if (options.fill !== undefined && !isReactive(options.fill)) data.fill[slot] = options.fill;

  if (
    isReactive(options.x) ||
    isReactive(options.y) ||
    isReactive(options.text) ||
    isReactive(options.font) ||
    isReactive(options.fill)
  ) {
    attachEffect(data, slot, generation, () => {
      if (isReactive(options.x)) data.x[slot] = resolve(options.x);
      if (isReactive(options.y)) data.y[slot] = resolve(options.y);
      if (isReactive(options.text)) data.text[slot] = resolve(options.text);
      if (isReactive(options.font)) data.font[slot] = resolve(options.font);
      if (isReactive(options.fill)) data.fill[slot] = resolve(options.fill);
    });
  }

  markSceneDirty(data);
  return encodeNodeId(slot, generation);
}
