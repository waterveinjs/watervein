import { isNode, read } from '@watervein/core';
import { element as el0, Show as show0, For as for0 } from '@watervein/dom-core';
export function element(tag, props, children) {
    if (props) {
        const keys = Object.keys(props);
        const len = keys.length;
        for (let i = 0; i < len; i++) {
            const key = keys[i];
            const value = props[key];
            if (key === "style" && value) {
                if (isNode(value)) {
                    const node = value;
                    props[key] = (() => read(node));
                }
                else if (typeof value === "object") {
                    continue;
                }
            }
            else if ((key === "class" || key === "className") && value) {
                props[key] = parseDsl1Class(value);
            }
        }
    }
    return el0(tag, props, children);
}
function parseDsl1Class(classVal) {
    if (isNode(classVal))
        return classVal;
    if (typeof classVal === "object" && !Array.isArray(classVal)) {
        return classVal;
    }
    if (Array.isArray(classVal)) {
        return classVal;
    }
    return classVal;
}
export function Show(condition, thenFn, elseFn) {
    return show0(condition, thenFn, elseFn);
}
export function For(listNode, keyFn, renderFn) {
    return for0(listNode, keyFn, renderFn);
}
export { mount, mountToBody } from '@watervein/dom-core';
export * from './elements.js';
//# sourceMappingURL=index.js.map