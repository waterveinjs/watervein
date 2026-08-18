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

type Entry<T> = { entityId: number; dom: HTMLElement; itemNode: WvNode<T> };

function destroyEntry(entry: Entry<any>) {
    entry.dom.remove();
    return entry.entityId;
}

function destroyCache(cache: Map<any, Entry<any>>) {
    if (cache.size === 0) return;
    const ids: number[] = [];
    cache.forEach((entry) => ids.push(destroyEntry(entry)));
    DestructionSystem.destroyEntities(ids);
    cache.clear();
}

let LIS_P = new Int32Array(128);
let LIS_RES = new Int32Array(128);
let LIS_OUT = new Int32Array(128);

function getLISInPlace(arr: Int32Array, len: number, outBuffer: Int32Array): number {
    if (len === 0) return 0;
    if (LIS_P.length < len) {
        const newSize = Math.max(len, LIS_P.length * 2);
        LIS_P = new Int32Array(newSize);
        LIS_RES = new Int32Array(newSize);
    }
    let resultLen = 0, i = 0, j = 0, u = 0, v = 0, c = 0;
    for (; i < len; i++) {
        const arrI = arr[i];
        if (arrI === -1) continue;
        if (resultLen === 0) {
            LIS_P[i] = -1;
            LIS_RES[0] = i;
            resultLen = 1;
            continue;
        }
        j = LIS_RES[resultLen - 1];
        if (arr[j] < arrI) {
            LIS_P[i] = j;
            LIS_RES[resultLen] = i;
            resultLen++;
            continue;
        }
        u = 0; v = resultLen - 1;
        while (u < v) {
            c = (u + v) >> 1;
            if (arr[LIS_RES[c]] < arrI) u = c + 1;
            else v = c;
        }
        if (arrI < arr[LIS_RES[u]]) {
            if (u > 0) LIS_P[i] = LIS_RES[u - 1];
            LIS_RES[u] = i;
        }
    }

    u = resultLen;
    if (u === 0) return 0;
    v = LIS_RES[u - 1];
    while (u-- > 0) {
        outBuffer[u] = v;
        v = LIS_P[v];
    }
    return resultLen;
}

type SharedScratch = {
    keyIdxMap: Map<any, number>;
    srcBuf: Int32Array;
    keysBuf: any[];
};

const SCRATCH_POOLS: SharedScratch[] = [];

function getScratch(depth: number): SharedScratch {
    return SCRATCH_POOLS[depth] || (SCRATCH_POOLS[depth] = {
        keyIdxMap: new Map(),
        srcBuf: new Int32Array(64),
        keysBuf: []
    });
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
    let cacheA = new Map<any, Entry<T>>();
    let cacheB = new Map<any, Entry<T>>();
    let isA = true;

    const marker = document.createComment("wv-for");
    let isInitial = true;
    let initialFragment: DocumentFragment | null = document.createDocumentFragment();

    let oldKeys: any[] = [];
    let oldLen = 0;
    let entityCache = cacheA;
    let disposed = false;

    const e = createEffect(() => {
        if (disposed) return;
        const scratch = getScratch(callDepth++);

        try {
            const list = read(listNode);
            const parent = marker.parentNode;
            if (!isInitial && !parent) return;

            const newLen = list.length;
            const newCache = isA ? cacheB : cacheA;
            newCache.clear();

            if (newLen === 0) {
                if (isInitial) {
                    initialFragment!.appendChild(marker);
                    isInitial = false;
                } else if (parent) {
                    if (entityCache.size > 0) {
                        const ids: number[] = [];
                        entityCache.forEach((entry) => ids.push(entry.entityId));

                        const firstEntry = entityCache.get(oldKeys[0]);
                        if (firstEntry) {
                            const range = document.createRange();
                            range.setStartBefore(firstEntry.dom);
                            range.setEndBefore(marker);
                            range.deleteContents();
                        }

                        DestructionSystem.destroyEntities(ids);
                        entityCache.clear();
                    }
                }
                scratch.srcBuf = new Int32Array(32);
                scratch.keysBuf = [];
                scratch.keyIdxMap.clear();
                oldKeys = [];
                oldLen = 0;
                return;
            }

            if (scratch.keysBuf.length < newLen) scratch.keysBuf = new Array(newLen);
            const newKeys = scratch.keysBuf;

            untrack(() => {
                for (let i = 0; i < newLen; i++) {
                    const item = list[i];
                    const key = keyFn(item);
                    newKeys[i] = key;
                    const cached = entityCache.get(key);
                    if (cached) {
                        write(cached.itemNode, item);
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
            });

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
                        toDestroyImmediate.push(destroyEntry(entry));
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
                let start = 0, oldEnd = oldLen - 1, newEnd = newLen - 1;

                while (start <= oldEnd && start <= newEnd && oldKeys[start] === newKeys[start]) start++;
                while (start <= oldEnd && start <= newEnd && oldKeys[oldEnd] === newKeys[oldEnd]) {
                    oldEnd--;
                    newEnd--;
                }

                const count = newEnd - start + 1;
                if (count > 0) {
                    if (scratch.srcBuf.length < count) {
                        scratch.srcBuf = new Int32Array(Math.max(count, scratch.srcBuf.length * 2));
                    }
                    scratch.srcBuf.fill(-1, 0, count);

                    const keyIdxMap = scratch.keyIdxMap;
                    keyIdxMap.clear();
                    for (let i = start; i <= newEnd; i++) keyIdxMap.set(newKeys[i], i);
                    for (let i = start; i <= oldEnd; i++) {
                        const oldKey = oldKeys[i];
                        if (keyIdxMap.has(oldKey)) {
                            scratch.srcBuf[keyIdxMap.get(oldKey)! - start] = i;
                        }
                    }
                    if (LIS_OUT.length < count) {
                        LIS_OUT = new Int32Array(Math.max(count, LIS_OUT.length * 2));
                    }
                    const lisLen = getLISInPlace(scratch.srcBuf, count, LIS_OUT);
                    let lisIdx = lisLen - 1;
                    let anchor: Node = newEnd + 1 < newLen ? newCache.get(newKeys[newEnd + 1])!.dom : marker;

                    for (let i = count - 1; i >= 0; i--) {
                        const key = newKeys[start + i];
                        const entry = newCache.get(key)!;
                        if (scratch.srcBuf[i] === -1 || lisIdx < 0 || i !== LIS_OUT[lisIdx]) {
                            parent.insertBefore(entry.dom, anchor);
                        } else {
                            lisIdx--;
                        }
                        anchor = entry.dom;
                    }
                }
            }
            entityCache = newCache;
            isA = !isA;

            const tempKeys = oldKeys;
            oldKeys = newKeys;
            scratch.keysBuf = tempKeys;
            oldLen = newLen;

            if (scratch.srcBuf.length > 64 && newLen < (scratch.srcBuf.length >> 2)) {
                scratch.srcBuf = new Int32Array(Math.max(64, scratch.srcBuf.length >> 1));
            }
            if (scratch.keysBuf.length > 64 && newLen < (scratch.keysBuf.length >> 2)) {
                scratch.keysBuf.length = Math.max(64, newLen);
            }
            if (LIS_P.length > 256 && newLen < 64) {
                LIS_P = new Int32Array(128);
                LIS_RES = new Int32Array(128);
                LIS_OUT = new Int32Array(128);
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
            if (marker.parentNode) marker.remove();
            destroyCache(entityCache);
            oldKeys = [];
            DestructionSystem._cleanupNode(e);
        }
    };
}