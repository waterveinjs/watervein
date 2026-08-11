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

function getLIS(arr: number[], len: number): number[] {
    const p = arr.slice();
    const result: number[] = [];
    let i, j, u, v, c;

    for (i = 0; i < len; i++) {
        const arrI = arr[i];
        if (arrI !== -1) {
            if (result.length === 0) {
                p[i] = -1;
                result.push(i);
                continue;
            }
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
    if (u === 0) return [];
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

const CACHE_POOL_A: Map<any, Entry<any>>[] = [];
const CACHE_POOL_B: Map<any, Entry<any>>[] = [];
const KEY_INDEX_MAP_POOL: Map<any, number>[] = [];
const SOURCE_BUFFER_POOL: number[][] = [];
const NEXT_KEYS_BUFFER_POOL: any[][] = [];

const CACHE_ACTIVE_IS_A: boolean[] = [];

function getBuffers(depth: number) {
    if (!CACHE_POOL_A[depth]) {
        CACHE_POOL_A[depth] = new Map();
        CACHE_POOL_B[depth] = new Map();
        CACHE_ACTIVE_IS_A[depth] = true;
        KEY_INDEX_MAP_POOL[depth] = new Map();
        SOURCE_BUFFER_POOL[depth] = [];
        NEXT_KEYS_BUFFER_POOL[depth] = [];
    }
    const activeIsA = CACHE_ACTIVE_IS_A[depth];
    return {
        
        currentCache: activeIsA ? CACHE_POOL_A[depth] : CACHE_POOL_B[depth],
        
        nextCache: activeIsA ? CACHE_POOL_B[depth] : CACHE_POOL_A[depth],
        keyIndexMap: KEY_INDEX_MAP_POOL[depth],
        sourceBuffer: SOURCE_BUFFER_POOL[depth],
        nextKeysBuffer: NEXT_KEYS_BUFFER_POOL[depth],
    };
}

function swapBuffers(depth: number) {
    CACHE_ACTIVE_IS_A[depth] = !CACHE_ACTIVE_IS_A[depth];
}

let callDepth = 0;

export function For<T>(
    listNode: WvNode<T[]>,
    keyFn: (item: T) => any,
    renderFn: (getItem: () => T) => HTMLElement
): Node {
    const marker = document.createComment("wv-for");
    let isInitial = true;
    let initialFragment: DocumentFragment | null = document.createDocumentFragment();

    let oldKeys: any[] = [];
    let oldLen = 0;
    let entityCache = new Map<any, Entry<T>>();

    createEffect(() => {
        const depth = callDepth++;
        const {
            nextCache: NEXT_CACHE,      
            keyIndexMap: KEY_INDEX_MAP_BUFFER,
            sourceBuffer: SOURCE_BUFFER_BASE,
            nextKeysBuffer: NEXT_KEYS_BUFFER_BASE,
        } = getBuffers(depth);

        let SOURCE_BUFFER = SOURCE_BUFFER_BASE;
        let NEXT_KEYS_BUFFER = NEXT_KEYS_BUFFER_BASE;

        try {
            const list = read(listNode);
            const parent = marker.parentNode;
            if (!isInitial && !parent) return;

            const newLen = list.length;
            const newCache = NEXT_CACHE;
            newCache.clear(); 

            if (NEXT_KEYS_BUFFER.length < newLen) {
                NEXT_KEYS_BUFFER = new Array(newLen);
                NEXT_KEYS_BUFFER_POOL[depth] = NEXT_KEYS_BUFFER;
            }
            const newKeys = NEXT_KEYS_BUFFER;

            for (let i = 0; i < newLen; i++) {
                const item = list[i];
                const key = keyFn(item);
                newKeys[i] = key;
                const cached = entityCache.get(key);
                if (cached) {
                    untrack(() => write(cached.itemNode, item));
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

            if (isInitial) {
                for (let i = 0; i < newLen; i++) {
                    initialFragment!.appendChild(newCache.get(newKeys[i])!.dom);
                }
                initialFragment!.appendChild(marker);
                isInitial = false;
            } else if (parent) {
                let start = 0;
                let oldEnd = oldLen - 1;
                let newEnd = newLen - 1;

                while (start <= oldEnd && start <= newEnd && oldKeys[start] === newKeys[start]) start++;
                while (start <= oldEnd && start <= newEnd && oldKeys[oldEnd] === newKeys[oldEnd]) { oldEnd--; newEnd--; }

                const count = newEnd - start + 1;
                if (count > 0) {
                    if (SOURCE_BUFFER.length < count) {
                        SOURCE_BUFFER = new Array(count);
                        SOURCE_BUFFER_POOL[depth] = SOURCE_BUFFER;
                    }
                    const source = SOURCE_BUFFER;
                    source.fill(-1, 0, count);

                    const keyIndexMap = KEY_INDEX_MAP_BUFFER;
                    keyIndexMap.clear();
                    for (let i = start; i <= newEnd; i++) keyIndexMap.set(newKeys[i], i);
                    for (let i = start; i <= oldEnd; i++) {
                        const oldKey = oldKeys[i];
                        if (keyIndexMap.has(oldKey)) {
                            source[keyIndexMap.get(oldKey)! - start] = i;
                        }
                    }

                    
                    const lis = getLIS(source, count);
                    let lisIdx = lis.length - 1;
                    let anchor: Node = newEnd + 1 < newLen ? newCache.get(newKeys[newEnd + 1])!.dom : marker;

                    for (let i = count - 1; i >= 0; i--) {
                        const key = newKeys[start + i];
                        const entry = newCache.get(key)!;
                        if (source[i] === -1 || lisIdx < 0 || i !== lis[lisIdx]) {
                            parent.insertBefore(entry.dom, anchor);
                        } else {
                            lisIdx--;
                        }
                        anchor = entry.dom;
                    }
                }
            }
            entityCache = newCache;
            swapBuffers(depth);
            [oldKeys, NEXT_KEYS_BUFFER_POOL[depth]] = [newKeys, oldKeys];
            oldLen = newLen;

        } finally {
            callDepth--;
        }
    });

    const res = initialFragment;
    initialFragment = null;
    return res as unknown as Node;
}