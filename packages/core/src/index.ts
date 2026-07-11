const NODE_TYPE_STATE    = 0;
const NODE_TYPE_COMPUTE  = 1;
const NODE_TYPE_EFFECT   = 2;
let nextAvailableNodeType = 3;

const WV_NODE_TAG = 0x57564E44;

let NODE_ID_COUNTER = 0;

export type Node<T = any> = {
    __wv:           typeof WV_NODE_TAG;
    dirty:          boolean;
    depth:          number;
    type:           number;
    value:          T;
    subsDense:      number[];
    depsDense:      number[];
    id:             number;
    compute:        (() => T) | null;
    entityId:       number | null;
    watchedVersion: number;
    pendingDeps:    number[];
    pendingDepsLen: number;
    bucketIdx:      number;
};

export type ResourceResult<T> = {
    data:    T | undefined;
    loading: boolean;
    error:   any | null;
};

const allNodes: (Node | undefined)[] = [];
function N(id: number): Node { 
    const node = allNodes[id];
    if (!node || node.id === -1) {
        throw new Error(`[watervein] Node with id ${id} is undefined or destroyed.`);
    }
    return node; 
}

let trackingVersion     = 0;
let currentTrackingNode: Node | null = null;
const trackingStack: (Node | null)[] = [];

const buckets: Node[][] = [];
let minDirtyDepth = Infinity;
let maxDirtyDepth = -1;

const cycleCheckStack: number[] = [];

let ENTITY_COUNT = 0;
const entityRegistry = new Map<number, Node[]>();
let currentEntityId: number | null = null;

let isBatching = false;
let raFID: number | null = null;

export function createEntity(): number {
    const id = ENTITY_COUNT++;
    entityRegistry.set(id, []);
    return id;
}

export function withEntity<T>(entityId: number, fn: () => T): T {
    const prev = currentEntityId;
    currentEntityId = entityId;
    try { return fn(); }
    finally { currentEntityId = prev; }
}

export function registerCustomNodeType(): number { return nextAvailableNodeType++; }

const freeNodeIds: number[] = [];

function createNode<T>(type: number, value: T, compute: (() => T) | null = null): Node<T> {
    const id = freeNodeIds.length > 0 ? freeNodeIds.pop()! : NODE_ID_COUNTER++;
    const node: Node<T> = {
        __wv:           WV_NODE_TAG,
        dirty:          false,
        depth:          0,
        type,
        value,
        subsDense:      [],
        depsDense:      [],
        id,
        compute,
        entityId:       currentEntityId,
        watchedVersion: -1,
        // 初期サイズ 8 固定、リサイズ時の GC 回避
        pendingDeps:    type === NODE_TYPE_STATE ? [] : new Array(8),
        pendingDepsLen: 0,
        bucketIdx:      -1,
    };
    allNodes[node.id] = node;
    if (currentEntityId !== null) {
        entityRegistry.get(currentEntityId)!.push(node);
    }
    return node;
}

// インプレースでエッジをプッシュ
function addEdge(dep: Node, sub: Node) {
    dep.subsDense.push(sub.id);
    sub.depsDense.push(dep.id);
}

// $O(N)$ の走査だが、関数呼び出しをインライン化するための共通関数
function removeEdge(dep: Node, sub: Node) {
    const ss = dep.subsDense;
    const ssLen = ss.length;
    for (let i = 0; i < ssLen; i++) {
        if (ss[i] === sub.id) {
            ss[i] = ss[ssLen - 1];
            ss.pop();
            break;
        }
    }
    const ds = sub.depsDense;
    const dsLen = ds.length;
    for (let i = 0; i < dsLen; i++) {
        if (ds[i] === dep.id) {
            ds[i] = ds[dsLen - 1];
            ds.pop();
            break;
        }
    }
}

let edgeCommitVersion = 0;

function commitEdges(sub: Node) {
    const pending = sub.pendingDeps;
    const pLen    = sub.pendingDepsLen;
    const dd      = sub.depsDense;

    // 1. 完全一致の高速パス（アロケーション・走査ゼロ）
    if (pLen === dd.length) {
        let same = true;
        for (let i = 0; i < pLen; i++) {
            if (dd[i] !== pending[i]) { same = false; break; }
        }
        if (same) { sub.pendingDepsLen = 0; return; }
    }

    // 2. スタンプのインクリメント
    const pendingStamp = ++edgeCommitVersion;
    for (let i = 0; i < pLen; i++) {
        const dep = allNodes[pending[i]];
        if (dep) dep.watchedVersion = pendingStamp;
    }

    const existingStamp = ++edgeCommitVersion;
    
    // 3. 削除されたエッジのクリーンアップ（逆順走査で安全に縮小）
    for (let i = dd.length - 1; i >= 0; i--) {
        const depId = dd[i];
        const dep = allNodes[depId];
        if (!dep) continue;
        
        if (dep.watchedVersion !== pendingStamp) {
            // removeEdge をインライン展開して最速化
            const ss = dep.subsDense;
            const ssLen = ss.length;
            for (let k = 0; k < ssLen; k++) {
                if (ss[k] === sub.id) {
                    ss[k] = ss[ssLen - 1];
                    ss.pop();
                    break;
                }
            }
            dd[i] = dd[dd.length - 1];
            dd.pop();
        } else {
            dep.watchedVersion = existingStamp;
        }
    }

    // 4. 新規エッジの追加
    for (let j = 0; j < pLen; j++) {
        const depId = pending[j];
        const dep = allNodes[depId];
        if (!dep) continue;

        if (dep.watchedVersion !== existingStamp) {
            dep.subsDense.push(sub.id);
            dd.push(depId);
            dep.watchedVersion = existingStamp;
            if (sub.depth <= dep.depth) {
                sub.depth = dep.depth + 1;
                propagateDepth(sub);
            }
        }
    }

    sub.pendingDepsLen = 0;
}

// 循環参照チェック & キューのアロケーションを完全にゼロにするためのグローバル静的バッファ
const PROPAGATE_QUEUE: Node[] = new Array(1024);

function propagateDepth(start: Node) {
    PROPAGATE_QUEUE[0] = start;
    let head = 0;
    let tail = 1;

    const visitMarker = ++trackingVersion; 

    while (head < tail) {
        const node = PROPAGATE_QUEUE[head++];
        const subs = node.subsDense;
        const len = subs.length;
        
        for (let i = 0; i < len; i++) {
            const sub = N(subs[i]);
            if (sub.id === start.id) {
                throw new Error(`[watervein] A circular reference was detected during depth propagation (node ${sub.id}).`);
            }
            if (sub.depth <= node.depth) {
                sub.depth = node.depth + 1;
                if (sub.watchedVersion !== visitMarker) {
                    sub.watchedVersion = visitMarker;
                    
                    // キューが足りなくなったら倍化リサイズ
                    if (tail >= PROPAGATE_QUEUE.length) {
                        PROPAGATE_QUEUE.length *= 2;
                    }
                    PROPAGATE_QUEUE[tail++] = sub;
                }
            }
        }
    }
    
    // 静的バッファの参照を解除してメモリリークを防ぐ
    for (let i = 0; i < tail; i++) PROPAGATE_QUEUE[i] = undefined as any;
}

const nextTick = typeof requestAnimationFrame !== 'undefined' 
    ? requestAnimationFrame 
    : (cb: FrameRequestCallback) => setTimeout(cb, 0);

function scheduleNode(node: Node) {
    if (node.dirty) return;
    node.dirty = true;
    const d = node.depth;
    while (d >= buckets.length) {
        buckets.push([]);
    }
    node.bucketIdx = buckets[d].length;
    buckets[d].push(node);
    if (d < minDirtyDepth) minDirtyDepth = d;
    if (d > maxDirtyDepth) maxDirtyDepth = d;
    if (raFID === null && !isBatching) {
        raFID = nextTick(flush) as any;
    }
}

let evaluationStack: Set<number> | null = null;
if (import.meta.env.DEV) evaluationStack = new Set<number>();

function executeCompute(node: Node) {
    trackingVersion++;
    node.pendingDepsLen = 0;
    pushTrackingNode(node);
    try {
        const oldValue = node.value;
        const newValue = node.compute!();
        commitEdges(node);
        if (oldValue !== newValue) {
            node.value = newValue;
            const subs = node.subsDense;
            const len = subs.length;
            for (let i = 0; i < len; i++) scheduleNode(N(subs[i]));
        }
    } finally {
        popTrackingNode();
        if (import.meta.env.DEV && evaluationStack) evaluationStack.delete(node.id);
    }
}

function executeEffect(node: Node) {
    trackingVersion++;
    node.pendingDepsLen = 0;
    pushTrackingNode(node);
    try {
        node.compute!();
        commitEdges(node);
    } finally {
        popTrackingNode();
        if (import.meta.env.DEV && evaluationStack) evaluationStack.delete(node.id);
    }
}

export function flush() {
    raFID = null;
    // ループ内での再アロケーションを防ぐため、深さをローカル変数に退避
    let d = minDirtyDepth;
    while (d <= maxDirtyDepth) {
        const bucket = buckets[d];
        if (bucket && bucket.length > 0) {
            const node = bucket.pop()!;
            node.bucketIdx = -1;
            node.dirty     = false;
            if      (node.type === NODE_TYPE_COMPUTE) executeCompute(node);
            else if (node.type === NODE_TYPE_EFFECT)  executeEffect(node);
            
            // 評価中にトポロジカル順序が前に戻った（minDirtyDepth が小さくなった）場合、そこへジャンプ
            if (minDirtyDepth < d) {
                d = minDirtyDepth;
                continue;
            }
        } else {
            d++;
        }
    }
    minDirtyDepth = Infinity;
    maxDirtyDepth = -1;
}

export function createState<T>(initial: T): Node<T> {
    return createNode(NODE_TYPE_STATE, initial);
}

export function createCompute<T>(fn: () => T): Node<T> {
    const node: Node<T> = createNode<T>(NODE_TYPE_COMPUTE, undefined as any, () => {
        if (import.meta.env.DEV && evaluationStack) {
            if (evaluationStack.has(node.id)) throw new Error(
                `[watervein] A circular reference was detected on compute node ${node.id}.`
            );
            evaluationStack.add(node.id);
        }
        pushTrackingNode(node);
        try { 
            return (node.value = fn()); 
        } finally { 
            popTrackingNode(); 
            if (import.meta.env.DEV && evaluationStack) evaluationStack.delete(node.id);
        }
    });
    trackingVersion++;
    node.pendingDepsLen = 0;
    pushTrackingNode(node);
    try {
        node.value = fn();
    } finally {
        popTrackingNode();
    }
    commitEdges(node);
    return node;
}

export function createEffect(fn: () => void): Node<void> {
    const node: Node<void> = createNode<void>(NODE_TYPE_EFFECT, undefined, () => {
        if (import.meta.env.DEV && evaluationStack) {
            if (evaluationStack.has(node.id)) throw new Error(
                `[watervein] A circular reference was detected on effect node ${node.id}.`
            );
            evaluationStack.add(node.id);
        }
        pushTrackingNode(node);
        try { 
            return (node.value = fn()); 
        } finally { 
            popTrackingNode(); 
            if (import.meta.env.DEV && evaluationStack) evaluationStack.delete(node.id);
        }
    });
    trackingVersion++;
    node.pendingDepsLen = 0;
    pushTrackingNode(node);
    try {
        fn();
    } finally {
        popTrackingNode();
    }
    commitEdges(node);
    return node;
}

export function createResource<S, T>(
    sourceNode: Node<S>,
    fetcher: (source: S) => Promise<T>
): Node<ResourceResult<T>> {
    const resourceNode = createNode<ResourceResult<T>>(
        NODE_TYPE_STATE,
        { data: undefined, loading: true, error: null }
    );
    let currentFetchId = 0;
    createEffect(() => {
        const sourceValue = read(sourceNode);
        const fetchId = ++currentFetchId;
        untrack(() => {
            write(resourceNode, { data: resourceNode.value.data, loading: true, error: null });
        });
        fetcher(sourceValue)
            .then((data) => {
                if (fetchId !== currentFetchId) return;
                write(resourceNode, { data, loading: false, error: null });
            })
            .catch((error) => {
                if (fetchId !== currentFetchId) return;
                write(resourceNode, { data: undefined, loading: false, error });
            });
    });
    return resourceNode;
}

export function read<T>(node: Node<T>): T {
    if (currentTrackingNode !== null && currentTrackingNode !== node) {
        const trk = currentTrackingNode;
        const idx = trk.pendingDepsLen;
        if (idx > 0 && trk.pendingDeps[idx - 1] === node.id) {
            return node.value;
        }
        if (idx >= trk.pendingDeps.length) {
            // `for` ループによる手動コピーを排除し、V8の組込最適化（JSArray::SetLength）に任せる
            trk.pendingDeps.length *= 2;
        }
        trk.pendingDeps[idx] = node.id;
        trk.pendingDepsLen   = idx + 1;
    }
    return node.value;
}

export function write<T>(node: Node<T>, value: T) {
    if (node.value === value) return;
    node.value = value;
    const subs = node.subsDense;
    const len = subs.length;
    for (let i = 0; i < len; i++) scheduleNode(N(subs[i]));
}

export function untrack<T>(fn: () => T): T {
    const backup = currentTrackingNode;
    currentTrackingNode = null;
    try { return fn(); }
    finally { currentTrackingNode = backup; }
}

export function pushTrackingNode(node: Node | null) {
    trackingStack.push(currentTrackingNode);
    currentTrackingNode = node;
}

export function popTrackingNode() {
    currentTrackingNode = trackingStack.pop() ?? null;
}

export const UISystem = { flush };

export const DataSystem = {
    schedule:       scheduleNode,
    propagateDepth,
    cleanupEdges:   (node: Node) => {
        for (let i = node.depsDense.length - 1; i >= 0; i--) {
            removeEdge(N(node.depsDense[i]), node);
        }
    },
};

export const DestructionSystem = {
    destroyEntity(entityId: number) {
        const nodes = entityRegistry.get(entityId);
        if (!nodes || nodes.length === 0) return;

        const nLen = nodes.length;
        for (let i = 0; i < nLen; i++) {
            this._cleanupNode(nodes[i]);
        }
        entityRegistry.delete(entityId);
    },

    destroyEntities(entityIds: number[]) {
        const len = entityIds.length;
        if (len === 0) return;

        for (let e = 0; e < len; e++) {
            const nodes = entityRegistry.get(entityIds[e]);
            if (!nodes) continue;

            const nLen = nodes.length;
            for (let i = 0; i < nLen; i++) {
                this._cleanupNode(nodes[i]);
            }
        }

        for (let e = 0; e < len; e++) {
            entityRegistry.delete(entityIds[e]);
        }
    },

    _cleanupNode(node: Node) {
        const ss = node.subsDense;
        for (let j = ss.length - 1; j >= 0; j--) {
            removeEdge(node, allNodes[ss[j]]!);
        }
        const ds = node.depsDense;
        for (let j = ds.length - 1; j >= 0; j--) {
            removeEdge(allNodes[ds[j]]!, node);
        }

        node.subsDense.length = 0;
        node.depsDense.length = 0;

        allNodes[node.id] = undefined;
        freeNodeIds.push(node.id);

        if (node.dirty && node.bucketIdx !== -1) {
            const bucket = buckets[node.depth];
            const idx    = node.bucketIdx;
            const last   = bucket[bucket.length - 1];
            bucket[idx]  = last;
            last.bucketIdx = idx;
            bucket.pop();
            node.bucketIdx = -1;
        }
    }
};

export function matchEntity(
    conditionNode: Node<boolean>,
    thenFn: () => void,
    elseFn?: () => void
) {
    let currentActiveEntityId: number | null = null;
    createEffect(() => {
        const branchValue = read(conditionNode);
        if (currentActiveEntityId !== null) {
            DestructionSystem.destroyEntity(currentActiveEntityId);
            currentActiveEntityId = null;
        }
        const newEntityId = createEntity();
        currentActiveEntityId = newEntityId;
        withEntity(newEntityId, () => {
            if (branchValue) thenFn();
            else if (elseFn) elseFn();
        });
    });
}

const MAP_ENTITY_TO_DESTROY: number[] = [];
const MAP_ENTITY_SET = new Set<any>();

export function mapEntity<T>(
    listNode: Node<T[]>,
    keyFn: (item: T) => any,
    renderFn: (key: any, getItem: () => T, getIndex: () => number) => void
) {
    const entityCache = new Map<any, { entityId: number; itemNode: Node<T>; indexNode: Node<number> }>();
    let prevList: T[] = [];

    createEffect(() => {
        const list = read(listNode);
        const len = list.length;

        if (prevList.length === len && len > 0) {
            let diffIdx1 = -1;
            let diffIdx2 = -1;
            let isPureSwap = true;

            for (let i = 0; i < len; i++) {
                if (prevList[i] !== list[i]) {
                    if (diffIdx1 === -1)      diffIdx1 = i;
                    else if (diffIdx2 === -1) diffIdx2 = i;
                    else { 
                        isPureSwap = false;
                        break; 
                    }
                }
            }

            if (isPureSwap && diffIdx1 !== -1 && diffIdx2 !== -1) {
                const prevKey1 = keyFn(prevList[diffIdx1]);
                const prevKey2 = keyFn(prevList[diffIdx2]);

                const cache1 = entityCache.get(prevKey1);
                const cache2 = entityCache.get(prevKey2);

                if (cache1 && cache2) {
                    write(cache1.indexNode, diffIdx1);
                    write(cache2.indexNode, diffIdx2);

                    const newKey1 = keyFn(list[diffIdx1]);
                    const newKey2 = keyFn(list[diffIdx2]);
                    
                    entityCache.delete(prevKey1);
                    entityCache.delete(prevKey2);
                    
                    entityCache.set(newKey1, cache1);
                    entityCache.set(newKey2, cache2);

                    prevList = list.slice();
                    return;
                }
            }
        }
        
        MAP_ENTITY_SET.clear();
        for (let i = 0; i < len; i++) {
            MAP_ENTITY_SET.add(keyFn(list[i]));
        }
        
        MAP_ENTITY_TO_DESTROY.length = 0;
        for (const [key, cache] of entityCache) {
            if (!MAP_ENTITY_SET.has(key)) {
                MAP_ENTITY_TO_DESTROY.push(cache.entityId);
                entityCache.delete(key);
            }
        }
        if (MAP_ENTITY_TO_DESTROY.length > 0) {
            DestructionSystem.destroyEntities(MAP_ENTITY_TO_DESTROY);
        }

        for (let i = 0; i < len; i++) {
            const item = list[i];
            const key = keyFn(item);
            const cached = entityCache.get(key);
            
            if (cached) {
                if (cached.itemNode.value === item && cached.indexNode.value === i) {
                    continue; 
                }
                if (cached.itemNode.value !== item) write(cached.itemNode, item);
                if (cached.indexNode.value !== i) write(cached.indexNode, i);
            } else {
                const entityId = createEntity();
                
                withEntity(entityId, () => {
                    const itemNode = createState(item);
                    const indexNode = createState(i);
                    
                    entityCache.set(key, { entityId, itemNode, indexNode });
                    
                    const getItem = () => read(itemNode);
                    const getIndex = () => read(indexNode);

                    renderFn(key, getItem, getIndex);
                });
            }
        }

        prevList = list.slice();
    });
}

export function isNode(value: unknown): value is Node<any> {
    return (value as any)?.__wv === WV_NODE_TAG;
}

export function batch(fn: () => void) {
    if (isBatching) {
        fn();
        return;
    }
    isBatching = true;
    let hasError = false;
    try { 
        fn(); 
    } catch (e) {
        hasError = true;
        throw e;
    } finally {
        isBatching = false;
        if (!hasError && minDirtyDepth !== Infinity && maxDirtyDepth !== -1) {
            flush();
        }
    }
}