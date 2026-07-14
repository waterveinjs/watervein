import { read, createEffect, createCompute, matchEntity, DestructionSystem, write, createEntity, withEntity, createState, untrack } from '@watervein/core';
import { wvLeaveKey } from './internal.js';
export function Show(condition, thenFn, elseFn) {
    const marker = document.createTextNode("");
    const wrapper = document.createElement("span");
    wrapper.style.display = "contents";
    wrapper.appendChild(marker);
    const conditionNode = typeof condition === "function" ? createCompute(condition) : condition;
    let currentDOM = null;
    matchEntity(conditionNode, () => {
        const prev = marker.previousElementSibling;
        if (prev)
            prev.remove();
        currentDOM = thenFn();
        marker.before(currentDOM);
    }, elseFn
        ? () => {
            const prev = marker.previousElementSibling;
            if (prev)
                prev.remove();
            currentDOM = elseFn();
            marker.before(currentDOM);
        }
        : () => {
            if (currentDOM) {
                currentDOM.remove();
                currentDOM = null;
            }
        });
    return wrapper;
}
export const leaveHooks = new WeakMap();
export function For(listNode, keyFn, renderFn, tagName = "span") {
    const marker = document.createTextNode("");
    const wrapper = document.createElement(tagName);
    if (tagName === "span") {
        wrapper.style.display = "contents";
    }
    wrapper.appendChild(marker);
    let entityCache = new Map();
    const toDestroy = [];
    createEffect(() => {
        const list = read(listNode);
        const len = list.length;
        const newCache = new Map();
        for (let i = 0; i < len; i++) {
            const item = list[i];
            const key = keyFn(item);
            const cached = entityCache.get(key);
            if (cached) {
                untrack(() => {
                    write(cached.itemNode, item);
                });
                newCache.set(key, cached);
            }
            else {
                const entityId = createEntity();
                let dom;
                let itemNode;
                withEntity(entityId, () => {
                    itemNode = createState(item);
                    dom = renderFn(() => read(itemNode));
                });
                newCache.set(key, { entityId, dom, itemNode });
            }
        }
        toDestroy.length = 0;
        for (const [key, entry] of entityCache) {
            if (!newCache.has(key)) {
                toDestroy.push(entry.entityId);
                const dom = entry.dom;
                if (dom[wvLeaveKey]) {
                    dom[wvLeaveKey](() => dom.remove());
                }
                else {
                    dom.remove();
                }
            }
        }
        if (toDestroy.length > 0) {
            DestructionSystem.destroyEntities(toDestroy);
        }
        let anchor = marker;
        for (let i = len - 1; i >= 0; i--) {
            const key = keyFn(list[i]);
            const entry = newCache.get(key);
            if (!entry)
                continue;
            if (entry.dom.nextSibling !== anchor) {
                wrapper.insertBefore(entry.dom, anchor);
            }
            anchor = entry.dom;
        }
        entityCache = newCache;
    });
    return wrapper;
}
//# sourceMappingURL=base.js.map