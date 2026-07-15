import { DestructionSystem } from '@watervein/core';

const domToEntityMap = new WeakMap<HTMLElement, number>();
let isObserverActive = false;

const observer = new MutationObserver((mutations) => {
    const len = mutations.length;
    for (let i = 0; i < len; i++) {
        const removed = mutations[i].removedNodes;
        const rLen = removed.length;
        for (let j = 0; j < rLen; j++) {
            const node = removed[j];
            if (node instanceof HTMLElement || (node && node.nodeType === 1)) {
                checkAndCleanup(node as HTMLElement);
            }
        }
    }
});

export function registerGCEntity(el: HTMLElement, entityId: number) {
    domToEntityMap.set(el, entityId);

    if (!isObserverActive && typeof document !== 'undefined') {
        observer.observe(document.body || document, { childList: true, subtree: true });
        isObserverActive = true;
    }
}

function checkAndCleanup(el: HTMLElement) {
    if (domToEntityMap.has(el)) {
        const entityId = domToEntityMap.get(el)!;
        DestructionSystem.destroyEntity(entityId);
        domToEntityMap.delete(el);
    }

    const children = el.children;
    if (children) {
        const len = children.length;
        for (let i = 0; i < len; i++) {
            const child = children[i];
            if (child instanceof HTMLElement || (child && child.nodeType === 1)) {
                checkAndCleanup(child as HTMLElement);
            }
        }
    }
}