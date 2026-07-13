import { isNode, read, getCurrentEntityId, handleDelegatedEvent, eventRegistry } from '@watervein/core';
import { element as el0 } from '@watervein/dom-core';
export function element(tag, props, children) {
    const el = el0(tag, props, children);
    if (props) {
        const keys = Object.keys(props);
        const len = keys.length;
        const entityId = getCurrentEntityId();
        for (let i = 0; i < len; i++) {
            const key = keys[i];
            const value = props[key];
            if (key.startsWith("on") && typeof value === "function") {
                const eventName = key.slice(2).toLowerCase();
                if (entityId !== null) {
                    if (!eventRegistry.has(eventName)) {
                        eventRegistry.set(eventName, new Map());
                        document.body.addEventListener(eventName, handleDelegatedEvent);
                    }
                    eventRegistry.get(eventName).set(entityId, value);
                    el.setAttribute('data-wv-eid', String(entityId));
                }
                else {
                    el.addEventListener(eventName, value);
                }
            }
            else if (key === "style" && value) {
                if (isNode(value)) {
                    props[key] = (() => read(value));
                }
            }
            else if ((key === "class" || key === "className") && value) {
                props[key] = parseDsl1Class(value);
            }
        }
    }
    return el;
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
//# sourceMappingURL=base.js.map