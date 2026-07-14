import { DestructionSystem } from '@watervein/core';

const domToEntityMap = new WeakMap<HTMLElement, number>();
const observedElements = new Set<HTMLElement>();
let isObserverActive = false;

const observer = new MutationObserver((mutations) => {
    const len = mutations.length;
    for (let i = 0; i < len; i++) {
        const removed = mutations[i].removedNodes;
        const rLen = removed.length;
        for (let j = 0; j < rLen; j++) {
            const node = removed[j];
            if (node instanceof HTMLElement) {
                checkAndCleanup(node);
            }
        }
    }
});

export function registerGCEntity(el: HTMLElement, entityId: number) {
    domToEntityMap.set(el, entityId);
    observedElements.add(el);

    if (!isObserverActive && typeof document !== 'undefined') {
        observer.observe(document, { childList: true, subtree: true });
        isObserverActive = true;
    }
}

export function __flushGCObserver() {
    const records = observer.takeRecords();
    const len = records.length;
    for (let i = 0; i < len; i++) {
        const removed = records[i].removedNodes;
        const rLen = removed.length;
        for (let j = 0; j < rLen; j++) {
            const node = removed[j];
            if (node instanceof HTMLElement) {
                checkAndCleanup(node);
            }
        }
    }
}

function checkAndCleanup(el: HTMLElement) {
    if (domToEntityMap.has(el)) {
        const entityId = domToEntityMap.get(el)!;
        DestructionSystem.destroyEntity(entityId);
        domToEntityMap.delete(el);
        observedElements.delete(el);
    }

    const children = el.children;
    const len = children.length;
    for (let i = 0; i < len; i++) {
        const child = children[i];
        if (child instanceof HTMLElement) {
            checkAndCleanup(child);
        }
    }
}