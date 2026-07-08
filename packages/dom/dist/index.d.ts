import { Node as WvNode } from '@watervein/core';
export declare function Show(condition: WvNode<boolean> | (() => boolean), thenFn: () => HTMLElement, elseFn?: () => HTMLElement): HTMLElement;
export declare function For<T>(listNode: WvNode<T[]>, keyFn: (item: T) => any, renderFn: (getItem: () => T) => HTMLElement): HTMLElement;
export { mount, mountToBody } from '@watervein/dom-core';
export * from './elements.js';
export * from './base.js';
//# sourceMappingURL=index.d.ts.map