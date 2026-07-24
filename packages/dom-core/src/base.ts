import {
    read,
    createEffect,
    createCompute,
    matchEntity,
    Node as WvNode,
    DestructionSystem,
    write,
    createEntity,
    withEntity,
    createState,
    untrack
} from '@watervein/core';
import { InternalDOM, wvLeaveKey } from './internal.js';

export function Show(
    condition: WvNode | (() => boolean),
    thenFn: () => HTMLElement,
    elseFn?: () => HTMLElement
): HTMLElement {
    const marker = document.createTextNode("");
    const wrapper = document.createElement("span");
    wrapper.style.display = "contents";
    wrapper.appendChild(marker);

    const conditionNode: WvNode =
        typeof condition === "function" ? createCompute(condition) : condition;

    let currentDOM: HTMLElement | null = null;

    const cleanupCurrentDOM = () => {
        if (currentDOM) {
            const dom = currentDOM as InternalDOM;
            if (dom[wvLeaveKey]) {
                const target = dom;
                dom[wvLeaveKey](() => target.remove());
            } else {
                dom.remove();
            }
            currentDOM = null;
        }
    };

    matchEntity(
        conditionNode,
        () => {
            cleanupCurrentDOM();
            currentDOM = thenFn();
            marker.before(currentDOM);
        },
        elseFn
            ? () => {
                  cleanupCurrentDOM();
                  currentDOM = elseFn();
                  marker.before(currentDOM);
              }
            : () => {
                  cleanupCurrentDOM();
              }
    );

    return wrapper;
}

export const leaveHooks = new WeakMap<HTMLElement, (resolve: () => void) => void>();

function getLIS(arr: number[]): number[] {
    const p = arr.slice();
    const result = [0];
    let i, j, u, v, c;
    const len = arr.length;

    for (i = 0; i < len; i++) {
        const arrI = arr[i];
        if (arrI !== -1) {
            j = result[result.length - 1];
            if (arr[j] < arrI) {
                p[i] = j;
                result.push(i);
                continue;
            }
            u = 0;
            v = result.length - 1;
            while (u < v) {
                c = (u + v) >> 1;
                if (arr[result[c]] < arrI) {
                    u = c + 1;
                } else {
                    v = c;
                }
            }
            if (arrI < arr[result[u]]) {
                if (u > 0) {
                    p[i] = result[u - 1];
                }
                result[u] = i;
            }
        }
    }
    u = result.length;
    v = result[u - 1];
    while (u-- > 0) {
        result[u] = v;
        v = p[v];
    }
    return result;
}

type Entry<T> = {
    entityId: number;
    dom: HTMLElement;
    itemNode: WvNode<T>;
};

export function For<T>(
    listNode: WvNode<T[]>,
    keyFn: (item: T) => any,
    renderFn: (getItem: () => T) => HTMLElement,
    tagName: string = "span"
): HTMLElement {
    const marker = document.createTextNode("");
    const wrapper = document.createElement(tagName);
    if (tagName === "span") {
        wrapper.style.display = "contents";
    }
    wrapper.appendChild(marker);

    let oldKeys: any[] = [];
    let entityCache = new Map<any, Entry<T>>();

    createEffect(() => {
        const list = read(listNode);
        const newLen = list.length;
        const oldLen = oldKeys.length;

        const newCache = new Map<any, Entry<T>>();
        const newKeys: any[] = new Array(newLen);

        for (let i = 0; i < newLen; i++) {
            const item = list[i];
            const key = keyFn(item);
            newKeys[i] = key;

            const cached = entityCache.get(key);
            if (cached) {
                untrack(() => {
                    write(cached.itemNode, item);
                });
                newCache.set(key, cached);
            } else {
                const entityId = createEntity();
                let dom!: HTMLElement;
                let itemNode!: WvNode<T>;

                withEntity(entityId, () => {
                    itemNode = createState(item);
                    dom = renderFn(() => read(itemNode));
                });

                newCache.set(key, { entityId, dom, itemNode });
            }
        }

        const toDestroyImmediate: number[] = [];
        for (const [key, entry] of entityCache) {
            if (!newCache.has(key)) {
                const dom = entry.dom as InternalDOM;
                if (dom[wvLeaveKey]) {
                    const entId = entry.entityId;
                    dom[wvLeaveKey](() => {
                        dom.remove();
                        DestructionSystem.destroyEntities([entId]);
                    });
                } else {
                    dom.remove();
                    toDestroyImmediate.push(entry.entityId);
                }
            }
        }
        if (toDestroyImmediate.length > 0) {
            DestructionSystem.destroyEntities(toDestroyImmediate);
        }

        let start = 0;
        let oldEnd = oldLen - 1;
        let newEnd = newLen - 1;

        while (start <= oldEnd && start <= newEnd && oldKeys[start] === newKeys[start]) {
            start++;
        }
        while (start <= oldEnd && start <= newEnd && oldKeys[oldEnd] === newKeys[newEnd]) {
            oldEnd--;
            newEnd--;
        }

        const count = newEnd - start + 1;
        if (count > 0) {
            const source = new Array<number>(count).fill(-1);
            const keyIndexMap = new Map<any, number>();

            for (let i = start; i <= newEnd; i++) {
                keyIndexMap.set(newKeys[i], i);
            }

            for (let i = start; i <= oldEnd; i++) {
                const oldKey = oldKeys[i];
                if (keyIndexMap.has(oldKey)) {
                    const newIdx = keyIndexMap.get(oldKey)!;
                    source[newIdx - start] = i;
                }
            }

            const lis = getLIS(source);
            let lisIdx = lis.length - 1;

            let anchor: Node = newEnd + 1 < newLen 
                ? newCache.get(newKeys[newEnd + 1])!.dom 
                : marker;

            for (let i = count - 1; i >= 0; i--) {
                const currentIndex = start + i;
                const key = newKeys[currentIndex];
                const entry = newCache.get(key)!;

                if (source[i] === -1) {
                    wrapper.insertBefore(entry.dom, anchor);
                } else if (lisIdx < 0 || i !== lis[lisIdx]) {
                    wrapper.insertBefore(entry.dom, anchor);
                } else {
                    lisIdx--;
                }
                anchor = entry.dom;
            }
        }

        entityCache = newCache;
        oldKeys = newKeys;
    });

    return wrapper;
}