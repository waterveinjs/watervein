import { afterEach, describe, expect, it } from 'vitest';
import { createState, UISystem, write } from '@watervein/core';
import {
  createCircle,
  createRect,
  createRenderer,
  createScene,
  removeNode,
} from '../src/index.js';

function createCanvasMock() {
  const calls: Array<[string, ...unknown[]]> = [];
  const context = {
    clearRect: (...args: unknown[]) => calls.push(['clearRect', ...args]),
    beginPath: () => calls.push(['beginPath']),
    arc: (...args: unknown[]) => calls.push(['arc', ...args]),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    fillRect: (...args: unknown[]) => calls.push(['fillRect', ...args]),
    strokeRect: (...args: unknown[]) => calls.push(['strokeRect', ...args]),
    fillText: (...args: unknown[]) => calls.push(['fillText', ...args]),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 640,
    height: 480,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;

  return { canvas, calls };
}

describe('@watervein/canvas', () => {
  const scenes: ReturnType<typeof createScene>[] = [];

  function scene() {
    const value = createScene();
    scenes.push(value);
    return value;
  }

  afterEach(() => {
    for (const value of scenes.splice(0)) value.destroy();
    UISystem.flush();
  });

  it('stores and renders static shapes', () => {
    const target = scene();
    const { canvas, calls } = createCanvasMock();
    const renderer = createRenderer({ canvas, scene: target });

    createCircle(target, {
      x: 12,
      y: 24,
      radius: 8,
      fill: '#f00',
    });
    createRect(target, {
      x: 40,
      y: 50,
      width: 30,
      height: 20,
      fill: '#0f0',
    });

    renderer.render();

    expect(calls).toContainEqual(['arc', 12, 24, 8, 0, Math.PI * 2]);
    expect(calls).toContainEqual(['fillRect', 40, 50, 30, 20]);
    renderer.destroy();
  });

  it('updates reactive properties through Core effects', () => {
    const target = scene();
    const x = createState(10);
    const { canvas, calls } = createCanvasMock();
    const renderer = createRenderer({ canvas, scene: target });

    createCircle(target, { x, y: 20, radius: 5 });
    renderer.render();

    write(x, 90);
    UISystem.flush();
    renderer.render();

    expect(calls).toContainEqual(['arc', 90, 20, 5, 0, Math.PI * 2]);
    renderer.destroy();
  });

  it('releases reactive effects when a node is removed', () => {
    const target = scene();
    const x = createState(10);
    const { canvas, calls } = createCanvasMock();
    const renderer = createRenderer({ canvas, scene: target });
    const id = createCircle(target, { x, y: 20, radius: 5 });

    removeNode(target, id);
    calls.length = 0;
    write(x, 90);
    UISystem.flush();
    renderer.render();

    expect(calls).not.toContainEqual(['arc', 90, 20, 5, 0, Math.PI * 2]);
    renderer.destroy();
  });

  it('does not let a stale handle remove a reused slot', () => {
    const target = scene();
    const first = createCircle(target, { x: 1, y: 2, radius: 3 });
    removeNode(target, first);
    const second = createRect(target, { x: 4, y: 5, width: 6, height: 7 });

    removeNode(target, first);

    const { canvas, calls } = createCanvasMock();
    const renderer = createRenderer({ canvas, scene: target });
    renderer.render();

    expect(calls).toContainEqual(['fillRect', 4, 5, 6, 7]);
    removeNode(target, second);
    renderer.destroy();
  });

  it('rejects adding nodes after scene destruction', () => {
    const target = scene();
    target.destroy();

    expect(() => createCircle(target, { radius: 5 })).toThrow();
  });
});
