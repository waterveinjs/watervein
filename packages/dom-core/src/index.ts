import { createEffect, getCurrentEntityId, read, untrack, Node as WvNode } from '@watervein/core';

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

type Child = Node | string | number | WvNode<any> | (() => any);

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
        for (const key in props) {
            const value = props[key];
            if (value === undefined || value === null) continue;

            if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
                if (!el.hasAttribute('data-wv-eid')) {
                    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
                }
            }
            else if (key === "class" || key === "className") {
                if (typeof value === "string") {
                    el.className = value;
                } else {
                    applyReactiveClass(el, value);
                }
            }
            else if (key === "style") {
                if (typeof value === "string") {
                    el.style.cssText = value;
                } else if (typeof value === "function" || isWvNode(value)) {
                    createEffect(() => { el.style.cssText = String(isWvNode(value) ? read(value) : (value as Function)()); });
                } else if (typeof value === "object") {
                    applyReactiveStyle(el, value as ReactiveStyle);
                }
            }
            else if (key === "ref" && typeof value === "function") {
                const cleanup = untrack(() => value(el));
                if (typeof cleanup === "function" && getCurrentEntityId() !== null) {
                    createEffect(() => cleanup);
                }
            }
            else if (typeof value === "function" || isWvNode(value)) {
                createEffect(() => {
                    const evaluated = isWvNode(value) ? read(value) : (value as Function)();
                    if (evaluated != null) {
                        (el as any)[key] = evaluated;
                    } else {
                        el.removeAttribute(key);
                    }
                });
            }
            else {
                (el as any)[key] = value;
            }
        }
    }

    if (children !== undefined) {
        if (Array.isArray(children)) {
            const len = children.length;
            if (len > 1) {
                const fragment = document.createDocumentFragment();
                for (let i = 0; i < len; i++) {
                    appendChild(fragment as any, children[i]);
                }
                el.appendChild(fragment);
            } else if (len === 1) {
                appendChild(el, children[0]);
            }
        } else {
            appendChild(el, children);
        }
    }

    return el;
}

function appendChild(parent: HTMLElement, child: Child) {
    if (child === null || child === undefined) return;
    if (typeof child === "string" || typeof child === "number") {
        if (parent.childNodes.length === 0) {
            parent.textContent = String(child);
        } else {
            parent.appendChild(document.createTextNode(String(child)));
        }
    } else if (typeof child === "function" || isWvNode(child)) {
        const textNode = document.createTextNode("");
        parent.appendChild(textNode);
        createEffect(() => {
            textNode.nodeValue = String(isWvNode(child) ? read(child) : (child as Function)());
        });
    } else if (child instanceof Node) {
        parent.appendChild(child);
    }
}

function applyReactiveStyle(el: HTMLElement, styleObj: ReactiveStyle) {
    const elStyle = el.style as any;

    for (const styleKey in styleObj) {
        const styleValue = styleObj[styleKey];
        if (styleValue === undefined || styleValue === null) continue;

        if (typeof styleValue === "function" || isWvNode(styleValue)) {
            createEffect(() => {
                const computedValue = String(isWvNode(styleValue) ? read(styleValue) : (styleValue as Function)());
                if (styleKey.charCodeAt(0) === 45) {
                    el.style.setProperty(styleKey, computedValue);
                } else {
                    elStyle[styleKey] = computedValue;
                }
            });
        } else {
            const staticValue = String(styleValue);
            if (styleKey.charCodeAt(0) === 45) {
                el.style.setProperty(styleKey, staticValue);
            } else {
                elStyle[styleKey] = staticValue;
            }
        }
    }
}

function unwrap<T>(val: T | WvNode<T> | (() => T)): T {
    if (isWvNode(val)) return read(val as WvNode<T>);
    if (typeof val === "function") return (val as Function)();
    return val as T;
}

export function applyReactiveClass(el: HTMLElement, classVal: ReactiveClass) {
    if (!classVal) {
        el.className = "";
        return;
    }

    if (typeof classVal === "string") {
        el.className = classVal;
        return;
    }

    if (typeof classVal === "function" || isWvNode(classVal)) {
        createEffect(() => {
            const res = unwrap(classVal);
            el.className = res ? String(res) : "";
        });
        return;
    }

    if (Array.isArray(classVal)) {
        const len = classVal.length;
        for (let i = 0; i < len; i++) {
            const item = classVal[i];
            if (!item) continue;

            if (typeof item === "function" || isWvNode(item)) {
                let prevClasses: string[] = [];
                createEffect(() => {
                    const res = unwrap(item);
                    const newStr = res ? String(res).trim() : "";
                    const newClasses = newStr ? newStr.split(/\s+/) : [];

                    for (let j = 0; j < prevClasses.length; j++) {
                        if (!newClasses.includes(prevClasses[j])) {
                            el.classList.remove(prevClasses[j]);
                        }
                    }
                    for (let j = 0; j < newClasses.length; j++) {
                        if (!prevClasses.includes(newClasses[j])) {
                            el.classList.add(newClasses[j]);
                        }
                    }
                    prevClasses = newClasses;
                });
            } else {
                const classes = String(item).trim().split(/\s+/);
                for (let j = 0; j < classes.length; j++) {
                    if (classes[j]) el.classList.add(classes[j]);
                }
            }
        }
        return;
    }

    if (typeof classVal === "object") {
        for (const className in classVal) {
            const condition = classVal[className];
            if (typeof condition === "function" || isWvNode(condition)) {
                createEffect(() => {
                    const isTrue = unwrap(condition);
                    el.classList.toggle(className, !!isTrue);
                });
            } else {
                el.classList.toggle(className, !!condition);
            }
        }
        return;
    }

    el.className = String(classVal);
}

export { Show, For, ForHandle } from './base.js';
export { mount, mountToBody, mountToHead, mountToRoot } from './mount.js';
export { unmount, registerEntityElement } from './unmount.js';