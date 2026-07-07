import { Node as WvNode } from '@watervein/core';
export declare function Show(condition: WvNode | (() => boolean), thenFn: () => HTMLElement, elseFn?: () => HTMLElement): HTMLElement;
export declare function For<T>(listNode: WvNode<T[]>, keyFn: (item: T) => any, renderFn: (getItem: () => T) => HTMLElement, tagName?: string): HTMLElement;
//# sourceMappingURL=base.d.ts.map