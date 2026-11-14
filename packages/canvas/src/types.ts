import type { Node as WvNode } from '@watervein/core';

export type NodeId = number;

export type ReactiveProp<T> = T | WvNode<T> | (() => T);

export interface CircleOptions {
  x?: ReactiveProp<number>;
  y?: ReactiveProp<number>;
  radius: ReactiveProp<number>;
  fill?: ReactiveProp<string>;
  stroke?: ReactiveProp<string>;
  lineWidth?: ReactiveProp<number>;
}

export interface RectOptions {
  x?: ReactiveProp<number>;
  y?: ReactiveProp<number>;
  width: ReactiveProp<number>;
  height: ReactiveProp<number>;
  fill?: ReactiveProp<string>;
  stroke?: ReactiveProp<string>;
  lineWidth?: ReactiveProp<number>;
}

export interface TextOptions {
  x?: ReactiveProp<number>;
  y?: ReactiveProp<number>;
  text: ReactiveProp<string>;
  font?: ReactiveProp<string>;
  fill?: ReactiveProp<string>;
}

export interface Scene {
  clear(): void;
  destroy(): void;
}

export interface Renderer {
  render(): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
