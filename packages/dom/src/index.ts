import {
    Node as WvNode
} from '@watervein/core';
import { 
    Show as show0, 
    For as for0,
} from '@watervein/dom-core';

export function Show(
    condition: WvNode<boolean> | (() => boolean),
    thenFn: () => HTMLElement,
    elseFn?: () => HTMLElement
): HTMLElement {
    return show0(condition, thenFn, elseFn);
}

export function For<T>(
    listNode: WvNode<T[]>,
    keyFn: (item: T) => any,
    renderFn: (getItem: () => T) => HTMLElement,
    tagName: string = "span"
): HTMLElement {
    return for0(listNode, keyFn, renderFn, tagName);
}

export { mount, mountToBody, mountToHead, mountToRoot, unmount } from '@watervein/dom-core';
export * from './elements.js';
export * from './base.js';
export { errorBoundary } from './errorBoundary.js';
export { scope } from './scope.js';