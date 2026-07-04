import { read, createEffect, createCompute, matchEntity, DestructionSystem, write, createEntity, withEntity, createState } from '@watervein/core';
const WV_ENTITY_KEY = '__wv_entity_id__';
function associateDOMWithEntity(dom, entityId) {
    dom[WV_ENTITY_KEY] = entityId;
}
function getDOMEntityId(dom) {
    return dom[WV_ENTITY_KEY];
}
export function Show(condition, thenFn, elseFn) {
    const marker = document.createTextNode("");
    const wrapper = document.createElement("span");
    wrapper.style.display = "contents";
    wrapper.appendChild(marker);
    const conditionNode = typeof condition === "function" ? createCompute(condition) : condition;
    let currentDOM = null;
    matchEntity(conditionNode, () => {
        if (currentDOM)
            currentDOM.remove();
        currentDOM = thenFn();
        marker.before(currentDOM);
    }, elseFn
        ? () => {
            if (currentDOM)
                currentDOM.remove();
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
export function For(listNode, keyFn, renderFn) {
    const marker = document.createTextNode("");
    const wrapper = document.createElement("span");
    wrapper.style.display = "contents";
    wrapper.appendChild(marker);
    const entryCache = new Map();
    const toDestroy = [];
    const seenKeys = new Set();
    createEffect(() => {
        const list = read(listNode);
        const len = list.length;
        seenKeys.clear();
        for (let i = 0; i < len; i++) {
            seenKeys.add(keyFn(list[i]));
        }
        toDestroy.length = 0;
        for (const [key, entry] of entryCache) {
            if (!seenKeys.has(key)) {
                toDestroy.push(entry.entityId);
                entry.el.remove();
                entryCache.delete(key);
            }
        }
        if (toDestroy.length > 0) {
            DestructionSystem.destroyEntities(toDestroy);
        }
        let anchor = marker;
        for (let i = len - 1; i >= 0; i--) {
            const item = list[i];
            const key = keyFn(item);
            let entry = entryCache.get(key);
            if (entry) {
                write(entry.itemNode, item);
                write(entry.indexNode, i);
            }
            else {
                const entityId = createEntity();
                let el;
                let itemNode;
                let indexNode;
                withEntity(entityId, () => {
                    itemNode = createState(item);
                    indexNode = createState(i);
                    el = renderFn(() => read(itemNode), () => read(indexNode));
                });
                entry = { entityId, el, itemNode, indexNode };
                entryCache.set(key, entry);
            }
            if (entry.el.nextSibling !== anchor) {
                wrapper.insertBefore(entry.el, anchor);
            }
            anchor = entry.el;
        }
    });
    return wrapper;
}
//# sourceMappingURL=base.js.map