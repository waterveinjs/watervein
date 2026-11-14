import {
  NODE_CIRCLE,
  NODE_RECT,
  NODE_TEXT,
  getSceneData,
  markSceneDirty,
} from './scene.js';
import type { Renderer, Scene } from './types.js';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  scene: Scene;
}

export function createRenderer({ canvas, scene }: RendererOptions): Renderer {
  const data = getSceneData(scene);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('[watervein/canvas] A 2D rendering context is required.');
  }
  if (data.onInvalidate !== null) {
    throw new Error('[watervein/canvas] A scene can only have one active renderer.');
  }

  let destroyed = false;
  let frameId: number | null = null;

  function render(): void {
    if (destroyed) return;

    if (frameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameId);
      frameId = null;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    for (let slot = 0; slot < data.nextSlot; slot++) {
      if (data.active[slot] !== 1) continue;

      switch (data.type[slot]) {
        case NODE_CIRCLE: {
          context.beginPath();
          context.arc(data.x[slot], data.y[slot], data.radius[slot], 0, Math.PI * 2);
          if (data.fill[slot]) {
            context.fillStyle = data.fill[slot];
            context.fill();
          }
          if (data.stroke[slot]) {
            context.strokeStyle = data.stroke[slot];
            context.lineWidth = data.lineWidth[slot];
            context.stroke();
          }
          break;
        }
        case NODE_RECT: {
          if (data.fill[slot]) {
            context.fillStyle = data.fill[slot];
            context.fillRect(data.x[slot], data.y[slot], data.width[slot], data.height[slot]);
          }
          if (data.stroke[slot]) {
            context.strokeStyle = data.stroke[slot];
            context.lineWidth = data.lineWidth[slot];
            context.strokeRect(data.x[slot], data.y[slot], data.width[slot], data.height[slot]);
          }
          break;
        }
        case NODE_TEXT: {
          context.font = data.font[slot];
          context.fillStyle = data.fill[slot];
          context.fillText(data.text[slot], data.x[slot], data.y[slot]);
          break;
        }
      }
    }

    data.dirty = false;
  }

  function scheduleRender(): void {
    if (destroyed || frameId !== null || typeof requestAnimationFrame !== 'function') {
      return;
    }

    frameId = requestAnimationFrame(() => {
      frameId = null;
      render();
    });
  }

  function resize(width: number, height: number): void {
    if (destroyed) return;
    canvas.width = width;
    canvas.height = height;
    markSceneDirty(data);
    render();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    if (frameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameId);
      frameId = null;
    }

    if (data.onInvalidate === scheduleRender) {
      data.onInvalidate = null;
    }
  }

  data.onInvalidate = scheduleRender;
  scheduleRender();

  return { render, resize, destroy };
}
