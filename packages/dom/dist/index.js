import { Show as show0, For as for0, } from '@watervein/dom-core';
export function Show(condition, thenFn, elseFn) {
    return show0(condition, thenFn, elseFn);
}
export function For(listNode, keyFn, renderFn, tagName = "span") {
    return for0(listNode, keyFn, renderFn, tagName);
}
export { mount, mountToBody } from '@watervein/dom-core';
export * from './elements.js';
export * from './base.js';
//# sourceMappingURL=index.js.map