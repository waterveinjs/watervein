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

type Entry<T> = {
    entityId: number;
    dom: HTMLElement;
    itemNode: WvNode<T>;
};

let LIS_P_BUFFER = new Int32Array(128);
let LIS_RESULT_BUFFER = new Int32Array(128);
let LIS_OUTPUT_BUFFER = new Int32Array(128);

function ensureLISBufferSize(size: number) {
    if (LIS_P_BUFFER.length < size) {
        const newSize = Math.max(size, LIS_P_BUFFER.length * 2);
        LIS_P_BUFFER = new Int32Array(newSize);
        LIS_RESULT_BUFFER = new Int32Array(newSize);
    }
}

function getLISInPlace(arr: Int32Array, len: number, outBuffer: Int32Array): number {
    if (len === 0) return 0;
    ensureLISBufferSize(len);

    const p = LIS_P_BUFFER;
    const result = LIS_RESULT_BUFFER;
    let resultLen = 0;

    let i: number, j: number, u: number, v: number, c: number;

    for (i = 0; i < len; i++) {
        const arrI = arr[i];
        if (arrI !== -1) {
            if (resultLen === 0) {
                p[i] = -1;
                result[0] = i;
                resultLen = 1;
                continue;
            }
            j = result[resultLen - 1];
            if (arr[j] < arrI) {
                p[i] = j;
                result[resultLen] = i;
                resultLen++;
                continue;
            }
            u = 0;
            v = resultLen - 1;
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

    u = resultLen;
    if (u === 0) return 0;

    v = result[u - 1];
    while (u-- > 0) {
        outBuffer[u] = v;
        v = p[v];
    }
    return resultLen;
}

const CACHE_POOL_A: Map<any, Entry<any>>[] = [];
const CACHE_POOL_B: Map<any, Entry<any>>[] = [];
const KEY_INDEX_MAP_POOL: Map<any, number>[] = [];
const SOURCE_BUFFER_POOL: Int32Array[] = [];
const NEXT_KEYS_BUFFER_POOL: any[][] = [];
const CACHE_ACTIVE_IS_A: boolean[] = [];

function getBuffers(depth: number) {
    if (!CACHE_POOL_A[depth]) {
        CACHE_POOL_A[depth] = new Map();
        CACHE_POOL_B[depth] = new Map();
        CACHE_ACTIVE_IS_A[depth] = true;
        KEY_INDEX_MAP_POOL[depth] = new Map();
        SOURCE_BUFFER_POOL[depth] = new Int32Array(64);
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

export type ForHandle = {
    fragment: DocumentFragment;
    unmount: () => void;
};

export function For<T>(
    listNode: WvNode<T[]>,
    keyFn: (item: T) => any,
    renderFn: (getItem: () => T) => HTMLElement
): ForHandle {
    const marker = document.createComment("wv-for");
    let isInitial = true;
    let initialFragment: DocumentFragment | null = document.createDocumentFragment();

    let oldKeys: any[] = [];
    let oldLen = 0;
    let entityCache = new Map<any, Entry<T>>();
    let disposed = false;

    const e = createEffect(() => {
        if (disposed) return;
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

            if (newLen === 0) {
                if (isInitial) {
                    initialFragment!.appendChild(marker);
                    isInitial = false;
                } else if (parent) {
                    entityCache.forEach((entry) => {
                        entry.dom.remove();
                        DestructionSystem.destroyEntities([entry.entityId]);
                    });
                    entityCache.clear();
                }
                
                SOURCE_BUFFER_POOL[depth] = new Int32Array(32);
                NEXT_KEYS_BUFFER_POOL[depth] = [];
                KEY_INDEX_MAP_BUFFER.clear();
                oldKeys = [];
                oldLen = 0;
                return;
            }

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
            entityCache.forEach((entry, key) => {
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
            });
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
                while (start <= oldEnd && start <= newEnd && oldKeys[oldEnd] === newKeys[oldEnd]) {
                    oldEnd--;
                    newEnd--;
                }

                const count = newEnd - start + 1;
                if (count > 0) {
                    if (SOURCE_BUFFER.length < count) {
                        SOURCE_BUFFER = new Int32Array(Math.max(count, SOURCE_BUFFER.length * 2));
                        SOURCE_BUFFER_POOL[depth] = SOURCE_BUFFER;
                    }
                    SOURCE_BUFFER.fill(-1, 0, count);

                    const keyIndexMap = KEY_INDEX_MAP_BUFFER;
                    keyIndexMap.clear();
                    for (let i = start; i <= newEnd; i++) keyIndexMap.set(newKeys[i], i);
                    for (let i = start; i <= oldEnd; i++) {
                        const oldKey = oldKeys[i];
                        if (keyIndexMap.has(oldKey)) {
                            SOURCE_BUFFER[keyIndexMap.get(oldKey)! - start] = i;
                        }
                    }
                    if (LIS_OUTPUT_BUFFER.length < count) {
                        LIS_OUTPUT_BUFFER = new Int32Array(Math.max(count, LIS_OUTPUT_BUFFER.length * 2));
                    }
                    const lisLen = getLISInPlace(SOURCE_BUFFER, count, LIS_OUTPUT_BUFFER);
                    let lisIdx = lisLen - 1;
                    let anchor: Node = newEnd + 1 < newLen ? newCache.get(newKeys[newEnd + 1])!.dom : marker;

                    for (let i = count - 1; i >= 0; i--) {
                        const key = newKeys[start + i];
                        const entry = newCache.get(key)!;
                        if (SOURCE_BUFFER[i] === -1 || lisIdx < 0 || i !== LIS_OUTPUT_BUFFER[lisIdx]) {
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
            if (SOURCE_BUFFER.length > 64 && newLen < (SOURCE_BUFFER.length >> 2)) {
                const newCap = Math.max(64, SOURCE_BUFFER.length >> 1);
                SOURCE_BUFFER_POOL[depth] = new Int32Array(newCap);
            }
            if (NEXT_KEYS_BUFFER.length > 64 && newLen < (NEXT_KEYS_BUFFER.length >> 2)) {
                NEXT_KEYS_BUFFER.length = Math.max(64, newLen);
            }
            if (LIS_P_BUFFER.length > 256 && newLen < 64) {
                LIS_P_BUFFER = new Int32Array(128);
                LIS_RESULT_BUFFER = new Int32Array(128);
                LIS_OUTPUT_BUFFER = new Int32Array(128);
            }

        } finally {
            callDepth--;
        }
    });

    const res = initialFragment;
    initialFragment = null;
    return {
        fragment: res!,
        unmount() {
            disposed = true;
            if (marker.parentNode) {
                marker.remove();
            }
            const idsToDestroy: number[] = [];
            entityCache.forEach((entry) => {
                entry.dom.remove();
                idsToDestroy.push(entry.entityId);
            });
            if (idsToDestroy.length > 0) {
                DestructionSystem.destroyEntities(idsToDestroy);
            }
            entityCache.clear();
            oldKeys = [];
            DestructionSystem._cleanupNode(e);
        }
    };
}