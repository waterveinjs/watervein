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

const isWvNode = (val: any): val is WvNode<any> => val && val.__wv === WV_NODE_TAG;

const elementCache = new Map<string, HTMLElement>();

export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: ReactiveProps,
    children?: Child | Child[]
): HTMLElementTagNameMap[K] {
    let proto = elementCache.get(tag);
    if (!proto) {
        proto = document.createElement(tag);
        elementCache.set(tag, proto);
    }
    const el = proto.cloneNode(false) as HTMLElementTagNameMap[K];

    if (props) {
        for (const key in props) {
            const value = props[key];
            if (value == null) continue;

            if (key === "class" || key === "className") {
                applyReactiveClass(el, value);
            }
            else if (key === "style") {
                if (typeof value === "function" || isWvNode(value)) {
                    createEffect(() => { el.style.cssText = String(unwrap(value)); });
                } else if (typeof value === "object") {
                    applyReactiveStyle(el, value as ReactiveStyle);
                } else {
                    el.style.cssText = String(value);
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
                    const evaluated = unwrap(value);
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
            if (len === 1) {
                appendChild(el, children[0]);
            } else if (len > 1) {
                const fragment = document.createDocumentFragment();
                for (let i = 0; i < len; i++) {
                    appendChild(fragment as any, children[i]);
                }
                el.appendChild(fragment);
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
            textNode.nodeValue = String(unwrap(child));
        });
    } else if (child instanceof Node) {
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
                const computedValue = String(unwrap(styleValue));
                if (styleKey.charCodeAt(0) === 45 && styleKey.charCodeAt(1) === 45) {
                    el.style.setProperty(styleKey, computedValue);
                } else {
                    elStyle[styleKey] = computedValue;
                }
            });
        } else {
            const staticValue = String(styleValue);
            if (styleKey.charCodeAt(0) === 45 && styleKey.charCodeAt(1) === 45) {
                el.style.setProperty(styleKey, staticValue);
            } else {
                elStyle[styleKey] = staticValue;
            }
        }
    }
}

function unwrap<T>(val: any): T {
    return val && val.__wv === WV_NODE_TAG ? read(val) : typeof val === "function" ? val() : val;
}

export function applyReactiveClass(el: HTMLElement, classVal: ReactiveClass) {
    if (!classVal) {
        el.className = "";
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
        const keys = Object.keys(classVal);
        const len = keys.length;

        for (let i = 0; i < len; i++) {
            const className = keys[i];
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