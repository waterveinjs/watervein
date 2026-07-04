import { createEffect, read } from '@watervein/core';
const WV_NODE_TAG = 0x57564E44;
function isWvNode(val) {
    return val !== null && typeof val === "object" && val.__wv === WV_NODE_TAG;
}
export function element(tag, props, children) {
    const el = document.createElement(tag);
    if (props) {
        const keys = Object.keys(props);
        const len = keys.length;
        for (let i = 0; i < len; i++) {
            const key = keys[i];
            const value = props[key];
            if (key[0] === 'o' && key[1] === 'n') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            }
            else if (key === "style" && value) {
                if (isWvNode(value)) {
                    createEffect(() => { el.style.cssText = String(read(value)); });
                }
                else if (typeof value === "object")
                    applyReactiveStyle(el, value);
                else if (typeof value === "function") {
                    createEffect(() => { el.style.cssText = String(value()); });
                }
            }
            else if ((key === "class" || key === "className") && value) {
                applyReactiveClass(el, value);
            }
            else if (typeof value === "function" || isWvNode(value)) {
                createEffect(() => {
                    const evaluated = isWvNode(value) ? read(value) : value();
                    if (evaluated !== undefined && evaluated !== null) {
                        if (key in el && !(key === "list" || key === "form")) {
                            el[key] = evaluated;
                        }
                        else {
                            el.setAttribute(key, String(evaluated));
                        }
                    }
                    else {
                        el.removeAttribute(key);
                    }
                });
            }
            else if (value !== undefined && value !== null) {
                if (key in el && !(key === "list" || key === "form")) {
                    el[key] = value;
                }
                else {
                    el.setAttribute(key, String(value));
                }
            }
        }
    }
    if (children !== undefined) {
        if (Array.isArray(children)) {
            const len = children.length;
            for (let i = 0; i < len; i++) {
                appendChild(el, children[i]);
            }
        }
        else {
            appendChild(el, children);
        }
    }
    return el;
}
function appendChild(parent, child) {
    if (typeof child === "function" || isWvNode(child)) {
        const textNode = document.createTextNode("");
        parent.appendChild(textNode);
        createEffect(() => {
            textNode.nodeValue = String(isWvNode(child) ? read(child) : child());
        });
    }
    else if (child instanceof HTMLElement || child instanceof Text) {
        parent.appendChild(child);
    }
    else if (child !== null && child !== undefined) {
        parent.appendChild(document.createTextNode(String(child)));
    }
}
function applyReactiveStyle(el, styleObj) {
    const styleKeys = Object.keys(styleObj);
    const sLen = styleKeys.length;
    const elStyle = el.style;
    for (let j = 0; j < sLen; j++) {
        const styleKey = styleKeys[j];
        const styleValue = styleObj[styleKey];
        if (styleValue === undefined || styleValue === null)
            continue;
        if (typeof styleValue === "function" || isWvNode(styleValue)) {
            createEffect(() => {
                const computedValue = String(isWvNode(styleValue) ? read(styleValue) : styleValue());
                if (styleKey[0] === '-' && styleKey[1] === '-') {
                    el.style.setProperty(styleKey, computedValue);
                }
                else {
                    elStyle[styleKey] = computedValue;
                }
            });
        }
        else {
            const staticValue = String(styleValue);
            if (styleKey[0] === '-' && styleKey[1] === '-') {
                el.style.setProperty(styleKey, staticValue);
            }
            else {
                elStyle[styleKey] = staticValue;
            }
        }
    }
}
function applyReactiveClass(el, classVal) {
    if (typeof classVal === "function" || isWvNode(classVal)) {
        createEffect(() => {
            el.className = String(isWvNode(classVal) ? read(classVal) : classVal());
        });
    }
    else if (typeof classVal === "object" && !Array.isArray(classVal)) {
        const classKeys = Object.keys(classVal);
        const cLen = classKeys.length;
        for (let j = 0; j < cLen; j++) {
            const className = classKeys[j];
            const condition = classVal[className];
            if (typeof condition === "function" || isWvNode(condition)) {
                createEffect(() => {
                    const isTrue = isWvNode(condition) ? read(condition) : condition();
                    if (isTrue)
                        el.classList.add(className);
                    else
                        el.classList.remove(className);
                });
            }
            else if (condition) {
                el.classList.add(className);
            }
        }
    }
    else if (Array.isArray(classVal)) {
        const aLen = classVal.length;
        for (let j = 0; j < aLen; j++) {
            const item = classVal[j];
            if (typeof item === "function" || isWvNode(item)) {
                let previousClass = "";
                createEffect(() => {
                    const newClass = String(isWvNode(item) ? read(item) : item());
                    if (previousClass && previousClass !== newClass) {
                        el.classList.remove(previousClass);
                    }
                    if (newClass) {
                        el.classList.add(newClass);
                        previousClass = newClass;
                    }
                });
            }
            else if (item) {
                el.classList.add(item);
            }
        }
    }
    else {
        el.className = classVal;
    }
}
export { Show, For } from './base.js';
export { mount, mountToBody, mountToHead, mountToRoot } from './mount.js';
//# sourceMappingURL=index.js.map