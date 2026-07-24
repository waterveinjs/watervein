import { createEffect, getCurrentEntityId, read, untrack } from '@watervein/core';

type ReactiveProp<T> = T | WvNode<T> | (() => T);
type CSSStyleKeys = {
    [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends Function ? never : K;
}[keyof CSSStyleDeclaration];
export type ReactiveStyle = {
    [K in CSSStyleKeys]?: ReactiveProp<CSSStyleDeclaration[K]>;
} & {
    [key: string]: ReactiveProp<string | number | null | undefined>;
};
export type ReactiveClass = 
    | string 
    | WvNode<string>
    | (() => string)
    | { [key: string]: boolean | WvNode<boolean> | (() => boolean) }
    | Array<string | WvNode<string> | (() => string)>;
export type ReactiveProps = {
    style?: ReactiveStyle | (() => string);
    class?: ReactiveClass;
    className?: ReactiveClass;
    [key: string]: any;
};

import { Node as WvNode } from '@watervein/core';

type Child = HTMLElement | Text | string | number | WvNode<any> | (() => any);

const WV_NODE_TAG = 0x57564E44;

function isWvNode(val: any): val is WvNode<any> {
    return val !== null && typeof val === "object" && (val as any).__wv === WV_NODE_TAG;
}

export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: ReactiveProps,
    children?: Child | Child[]
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);

    if (props) {
        const keys = Object.keys(props);
        const len = keys.length;
        for (let i = 0; i < len; i++) {
            const key = keys[i];
            const value = props[key];

            if (key[0] === 'o' && key[1] === 'n') {
                el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
            } 
            else if (key === "style" && value) {
                if (isWvNode(value)) {
                    createEffect(() => { el.style.cssText = String(read(value)); });
                }
                else if (typeof value === "object") applyReactiveStyle(el, value as ReactiveStyle);
                else if (typeof value === "function") {
                    createEffect(() => { el.style.cssText = String((value as Function)()); });
                }
            }
            else if ((key === "class" || key === "className") && value) {
                applyReactiveClass(el, value);
            } 
            else if (typeof value === "function" || isWvNode(value)) {
                createEffect(() => {
                    const evaluated = isWvNode(value) ? read(value) : (value as Function)();
                    if (evaluated !== undefined && evaluated !== null) {
                        if (key in el && !(key === "list" || key === "form")) {
                            (el as any)[key] = evaluated;
                        } else {
                            el.setAttribute(key, String(evaluated));
                        }
                    } else {
                        el.removeAttribute(key);
                    }
                });
            } 
            else if (value !== undefined && value !== null) {
                if (key in el && !(key === "list" || key === "form")) {
                    (el as any)[key] = value;
                } else {
                    el.setAttribute(key, String(value));
                }
            }
        }

        if ("ref" in props && typeof props.ref === "function") {
            const cleanup = untrack(() => props.ref(el));
            if (typeof cleanup === "function" && getCurrentEntityId() !== null) {
                createEffect(() => cleanup);
            }
        }
    }

    if (children !== undefined) {
        if (Array.isArray(children)) {
            const len = children.length;
            for (let i = 0; i < len; i++) {
                appendChild(el, children[i]);
            }
        } else {
            appendChild(el, children);
        }
    }

    return el;
}

function appendChild(parent: HTMLElement, child: Child) {
    if (typeof child === "function" || isWvNode(child)) {
        const textNode = document.createTextNode("");
        parent.appendChild(textNode);

        createEffect(() => {
            textNode.nodeValue = String(isWvNode(child) ? read(child) : (child as Function)());
        });
    } else if (child instanceof HTMLElement || child instanceof Text) {
        parent.appendChild(child);
    } else if (child !== null && child !== undefined) {
        parent.appendChild(document.createTextNode(String(child)));
    }
}

function applyReactiveStyle(el: HTMLElement, styleObj: ReactiveStyle) {
    const styleKeys = Object.keys(styleObj);
    const sLen = styleKeys.length;
    const elStyle = el.style as any;

    for (let j = 0; j < sLen; j++) {
        const styleKey = styleKeys[j];
        const styleValue = styleObj[styleKey];

        if (styleValue === undefined || styleValue === null) continue;

        if (typeof styleValue === "function" || isWvNode(styleValue)) {
            createEffect(() => {
                const computedValue = String(isWvNode(styleValue) ? read(styleValue) : (styleValue as Function)());
                if (styleKey[0] === '-' && styleKey[1] === '-') {
                    el.style.setProperty(styleKey, computedValue);
                } else {
                    elStyle[styleKey] = computedValue;
                }
            });
        } else {
            const staticValue = String(styleValue);
            if (styleKey[0] === '-' && styleKey[1] === '-') {
                el.style.setProperty(styleKey, staticValue);
            } else {
                elStyle[styleKey] = staticValue;
            }
        }
    }
}

function applyReactiveClass(el: HTMLElement, classVal: ReactiveClass) {
    if (typeof classVal === "function" || isWvNode(classVal)) {
        createEffect(() => {
            el.className = String(isWvNode(classVal) ? read(classVal) : (classVal as Function)());
        });
    } else if (typeof classVal === "object" && !Array.isArray(classVal)) {
        const classKeys = Object.keys(classVal);
        const cLen = classKeys.length;

        for (let j = 0; j < cLen; j++) {
            const className = classKeys[j];
            const condition = classVal[className];

            if (typeof condition === "function" || isWvNode(condition)) {
                createEffect(() => {
                    const isTrue = isWvNode(condition) ? read(condition) : (condition as Function)();
                    if (isTrue) el.classList.add(className);
                    else el.classList.remove(className);
                });
            } else if (condition) {
                el.classList.add(className);
            }
        }
    } else if (Array.isArray(classVal)) {
        const aLen = classVal.length;
        for (let j = 0; j < aLen; j++) {
            const item = classVal[j];
            if (typeof item === "function" || isWvNode(item)) {
                let previousClass = "";
                createEffect(() => {
                    const res = isWvNode(item) ? read(item) : (item as Function)();
                    const newClass = res ? String(res).trim() : "";
                    if (previousClass && previousClass !== newClass) {
                        el.classList.remove(previousClass);
                    }
                    if (newClass) {
                        el.classList.add(newClass);
                    }
                    previousClass = newClass;
                });
            } else if (item) {
                el.classList.add(item);
            }
        }
    } else {
        el.className = classVal;
    }
}

export { Show, For } from './base.js';
export { mount, mountToBody, mountToHead, mountToRoot } from './mount.js'
export { unmount, registerEntityElement } from './unmount.js';