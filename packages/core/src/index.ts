export const NODE_TYPE_STATE   = 0;
export const NODE_TYPE_COMPUTE = 1;
export const NODE_TYPE_EFFECT  = 2;
let nextAvailableNodeType      = 3;

const WV_NODE_TAG = 0x57564E44;

let NODE_ID_COUNTER = 0;

let DEFAULT_EDGE_CAPACITY = 256;
let edgeCapacity = DEFAULT_EDGE_CAPACITY;
let edgePoolInitialized = false;

let edgeDep     = new Int32Array(edgeCapacity);
let edgeSub     = new Int32Array(edgeCapacity);
let edgeNextSub = new Int32Array(edgeCapacity);
let edgePrevSub = new Int32Array(edgeCapacity);
let edgeNextDep = new Int32Array(edgeCapacity);
let edgePrevDep = new Int32Array(edgeCapacity);

let activeEdgeCount = 0;

export const NULL_EDGE = -1;
let edgeFreeListHead = NULL_EDGE;
let nextUnallocatedEdgeId = 0;

export function initCapacity(options: { edgeCapacity?: number }): void {
    if (edgePoolInitialized) {
        throw new Error('[watervein] initCapacity() must be called before any node or edge is created, and can only be called once.');
    }
    if (nextUnallocatedEdgeId !== 0 || NODE_ID_COUNTER !== 0) {
        throw new Error('[watervein] initCapacity() must be called before any node or edge is created.');
    }

    const requestedEdgeCapacity = options.edgeCapacity ?? DEFAULT_EDGE_CAPACITY;
    if (requestedEdgeCapacity < 1) {
        throw new Error('[watervein] edgeCapacity must be a positive integer.');
    }

    edgeCapacity = requestedEdgeCapacity;
    edgeDep     = new Int32Array(edgeCapacity);
    edgeSub     = new Int32Array(edgeCapacity);
    edgeNextSub = new Int32Array(edgeCapacity);
    edgePrevSub = new Int32Array(edgeCapacity);
    edgeNextDep = new Int32Array(edgeCapacity);
    edgePrevDep = new Int32Array(edgeCapacity);

    edgePoolInitialized = true;
}

function ensureEdgeCapacity(minCapacity: number) {
    edgePoolInitialized = true;
    if (minCapacity < edgeCapacity) return;
    let newCap = edgeCapacity + (edgeCapacity >> 1) + 1;
    while (newCap <= minCapacity) newCap += (newCap >> 1) + 1;

    const expandInt32 = (old: Int32Array) => {
        const n = new Int32Array(newCap);
        n.set(old);
        return n;
    };

    edgeDep     = expandInt32(edgeDep);
    edgeSub     = expandInt32(edgeSub);
    edgeNextSub = expandInt32(edgeNextSub);
    edgePrevSub = expandInt32(edgePrevSub);
    edgeNextDep = expandInt32(edgeNextDep);
    edgePrevDep = expandInt32(edgePrevDep);

    edgeCapacity = newCap;
}

function allocEdge(depId: number, subId: number): number {
    activeEdgeCount++;
    edgePoolInitialized = true;
    let edgeId: number;
    if (edgeFreeListHead !== NULL_EDGE) {
        edgeId = edgeFreeListHead;
        edgeFreeListHead = edgeNextSub[edgeId];
    } else {
        edgeId = nextUnallocatedEdgeId++;
        if (edgeId >= edgeCapacity) {
            ensureEdgeCapacity(edgeId + 1);
        }
    }

    edgeDep[edgeId]     = depId;
    edgeSub[edgeId]     = subId;
    edgeNextSub[edgeId] = NULL_EDGE;
    edgePrevSub[edgeId] = NULL_EDGE;
    edgeNextDep[edgeId] = NULL_EDGE;
    edgePrevDep[edgeId] = NULL_EDGE;

    return edgeId;
}

function freeEdge(edgeId: number) {
    activeEdgeCount--;
    edgeDep[edgeId]     = -1;
    edgeSub[edgeId]     = -1;
    edgeNextSub[edgeId] = edgeFreeListHead;
    edgeFreeListHead    = edgeId;
}

function compactEdgePoolIfNeeded(nodesEmpty: boolean) {
    if (import.meta.env.DEV && nodesEmpty && activeEdgeCount !== 0) {
        console.error(
            `[watervein] Invariant violation: all nodes destroyed but activeEdgeCount=${activeEdgeCount}. ` +
            `This indicates a leaked edge reference.`
        );
    }

    if (activeEdgeCount !== 0) return;
    if (edgeCapacity <= DEFAULT_EDGE_CAPACITY) return;

    const newCapacity = Math.max(DEFAULT_EDGE_CAPACITY, Math.floor(edgeCapacity / 2));
    edgeCapacity = newCapacity;
    edgeDep     = new Int32Array(edgeCapacity);
    edgeSub     = new Int32Array(edgeCapacity);
    edgeNextSub = new Int32Array(edgeCapacity);
    edgePrevSub = new Int32Array(edgeCapacity);
    edgeNextDep = new Int32Array(edgeCapacity);
    edgePrevDep = new Int32Array(edgeCapacity);

    edgeFreeListHead = NULL_EDGE;
    nextUnallocatedEdgeId = 0;
}

function trimSparseArrays(): boolean {
    while (allNodes.length > 0 && allNodes[allNodes.length - 1] === undefined) {
        allNodes.pop();
    }
    const isEmpty = allNodes.length === 0;
    if (isEmpty) {
        NODE_ID_COUNTER = 0;
        freeNodeIds.length = 0;
    }
    return isEmpty;
}

export const FLAG_DIRTY    = 1 << 0;
export const FLAG_DISPOSED = 1 << 1;
export const TYPE_SHIFT    = 8;

export type Node<T = any> = {
    readonly __wv:  typeof WV_NODE_TAG;
    ft:           number;
    id:             number;
    depth:          number;
    watchedVersion: number;
    bucketIdx:      number;
    pendingDepsLen: number;
    value:          T;
    entityId:       number | null;
    compute:        (() => T) | null;
    subsHead:       number;
    depsHead:       number;
    pendingDeps:    (Node<any> | null)[] | null;
};

export type ResourceResult<T> = {
    data:    T | undefined;
    loading: boolean;
    error:   any | null;
};

const allNodes: (Node | undefined)[] = [];

export function N(id: number): Node {
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

let ENTITY_COUNT = 0;
let entityRegistry: (Node[] | undefined)[] = [];
let currentEntityId: number | null = null;

let entityChildrenMap = new Map<number, Set<number>>();
let entityParentMap   = new Map<number, number | null>();

const freeEntityIds: number[] = [];

let isBatching = false;
let raFID: number | null = null;

export function createEntity(): number {
    const id = freeEntityIds.length > 0 ? freeEntityIds.pop()! : ENTITY_COUNT++;
    entityRegistry[id] = [];
    entityParentMap.set(id, currentEntityId);
    if (currentEntityId !== null) {
        let children = entityChildrenMap.get(currentEntityId);
        if (!children) {
            children = new Set();
            entityChildrenMap.set(currentEntityId, children);
        }
        children.add(id);
    }
    return id;
}

/**
 * Switches the current entity ownership scope for `fn`.
 * 
 * NOTE: This does NOT isolate reactive tracking. Any `read()` call made
 * synchronously inside `fn` (without its own createEffect/createCompute)
 * will still register as a dependency of whichever effect/compute is
 * currently active outside this call. If `fn` may perform such "naked"
 * reads (e.g. a user-supplied render callback), wrap the call in `untrack()`
 * at the call site.
 */
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
        ft:             type << TYPE_SHIFT,
        id:             id,
        depth:          0,
        watchedVersion: -1,
        bucketIdx:      -1,
        pendingDepsLen: 0,
        value:          value,
        entityId:       currentEntityId,
        compute:        compute,
        subsHead:       NULL_EDGE,
        depsHead:       NULL_EDGE,
        pendingDeps:    null,
    };

    allNodes[node.id] = node;
    if (currentEntityId !== null) {
        entityRegistry[currentEntityId]!.push(node);
    }
    return node;
}

function linkEdge(dep: Node, sub: Node): number {
    if ((dep.ft & FLAG_DISPOSED) !== 0 || (sub.ft & FLAG_DISPOSED) !== 0) return NULL_EDGE;

    const edgeId = allocEdge(dep.id, sub.id);

    edgeNextSub[edgeId] = dep.subsHead;
    if (dep.subsHead !== NULL_EDGE) {
        edgePrevSub[dep.subsHead] = edgeId;
    }
    dep.subsHead = edgeId;

    edgeNextDep[edgeId] = sub.depsHead;
    if (sub.depsHead !== NULL_EDGE) {
        edgePrevDep[sub.depsHead] = edgeId;
    }
    sub.depsHead = edgeId;

    return edgeId;
}

function unlinkEdge(edgeId: number) {
    if (edgeId === NULL_EDGE) return;

    const depId = edgeDep[edgeId];
    const subId = edgeSub[edgeId];
    const prevS = edgePrevSub[edgeId];
    const nextS = edgeNextSub[edgeId];
    const prevD = edgePrevDep[edgeId];
    const nextD = edgeNextDep[edgeId];

    if (prevS !== NULL_EDGE) { edgeNextSub[prevS] = nextS;
    } else {
        const depNode = allNodes[depId];
        if (depNode) depNode.subsHead = nextS;
    }

    if (nextS !== NULL_EDGE) {
        edgePrevSub[nextS] = prevS;
    }

    if (prevD !== NULL_EDGE) {
        edgeNextDep[prevD] = nextD;
    } else {
        const subNode = allNodes[subId];
        if (subNode) subNode.depsHead = nextD;
    }

    if (nextD !== NULL_EDGE) {
        edgePrevDep[nextD] = prevD;
    }

    freeEdge(edgeId);
}

let edgeCommitVersion = 0;

function commitEdges(sub: Node) {
    if ((sub.ft & FLAG_DISPOSED) !== 0) return;

    const pending = sub.pendingDeps;
    if (!pending) return;
    const pLen = sub.pendingDepsLen;

    if (pLen === 0 && sub.depsHead === NULL_EDGE) return;

    edgeCommitVersion += 2;
    if (edgeCommitVersion > 9007199254740000) { 
        edgeCommitVersion = 2;
        for (let i = 0; i < allNodes.length; i++) {
            const n = allNodes[i];
            if (n) n.watchedVersion = 0;
        }
    }
    
    const pendingStamp  = edgeCommitVersion;
    const existingStamp = pendingStamp | 1;

    try {
        for (let i = 0; i < pLen; i++) {
            const dep = pending[i];
            if (dep && (dep.ft & FLAG_DISPOSED) === 0) {
                dep.watchedVersion = pendingStamp;
            }
        }

        let maxDepDepth = -1;

        let edgeId = sub.depsHead;
        while (edgeId !== NULL_EDGE) {
            const nextEdgeId = edgeNextDep[edgeId];
            const depNodeId   = edgeDep[edgeId];
            const depNode     = allNodes[depNodeId];

            if (depNode && (depNode.ft & FLAG_DISPOSED) === 0 && depNode.watchedVersion === pendingStamp) {
                depNode.watchedVersion = existingStamp;
                if (depNode.depth > maxDepDepth) {
                    maxDepDepth = depNode.depth;
                }
            } else {
                unlinkEdge(edgeId);
            }
            edgeId = nextEdgeId;
        }

        for (let i = 0; i < pLen; i++) {
            const dep = pending[i];
            if (dep && (dep.ft & FLAG_DISPOSED) === 0) {
                if (dep.watchedVersion !== existingStamp) {
                    linkEdge(dep, sub);
                    dep.watchedVersion = existingStamp;
                }
                if (dep.depth > maxDepDepth) {
                    maxDepDepth = dep.depth;
                }
            }
        }

        const newDepth = maxDepDepth === -1 ? 0 : maxDepDepth + 1;
        if (sub.depth !== newDepth) {
            sub.depth = newDepth;
            propagateDepth(sub);
        }

    } finally {
        sub.pendingDepsLen = 0;
    }
}

const INITIAL_QUEUE_CAPACITY = 2048;
const PROPAGATE_QUEUE: (Node | undefined)[] = new Array(INITIAL_QUEUE_CAPACITY);

function propagateDepth(start: Node) {
    PROPAGATE_QUEUE[0] = start;
    let head = 0;
    let tail = 1;
    const visitMarker = ++trackingVersion;

    try {
        while (head < tail) {
            const node = PROPAGATE_QUEUE[head]!;
            PROPAGATE_QUEUE[head++] = undefined;

            let edgeId = node.subsHead;
            while (edgeId !== NULL_EDGE) {
                const subId = edgeSub[edgeId];
                const subNode = allNodes[subId];

                if (subNode && (subNode.ft & FLAG_DISPOSED) === 0) {
                    if (subId === start.id) {
                        throw new Error(
                            `[watervein] A circular reference was detected during depth propagation (node ${subId}).`
                        );
                    }

                    if (subNode.depth <= node.depth) {
                        subNode.depth = node.depth + 1;
                        if (subNode.watchedVersion !== visitMarker) {
                            subNode.watchedVersion = visitMarker;
                            PROPAGATE_QUEUE[tail++] = subNode;
                        }
                    }
                }
                edgeId = edgeNextSub[edgeId];
            }
        }
    } finally {
        for (let i = head; i < tail; i++) {
            PROPAGATE_QUEUE[i] = undefined;
        }
    }
}

const nextTick = typeof requestAnimationFrame !== 'undefined'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => setTimeout(cb, 0);

function scheduleNode(node: Node) {
    if ((node.ft & FLAG_DIRTY) !== 0) return;
    node.ft |= FLAG_DIRTY;
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

let activeCompute: Node | null = null;
function executeCompute(node: Node) {
    trackingVersion++;
    node.pendingDepsLen = 0;
    const prevActive = activeCompute;
    activeCompute = node;
    try {
        const oldValue = node.value;
        const newValue = node.compute!();
        commitEdges(node);

        if (oldValue !== newValue) {
            node.value = newValue;
            let edgeId = node.subsHead;
            while (edgeId !== NULL_EDGE) {
                const subNode = allNodes[edgeSub[edgeId]];
                if (subNode) scheduleNode(subNode);
                edgeId = edgeNextSub[edgeId];
            }
        }
    } finally {
        activeCompute = prevActive;
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

function forceCleanupBuckets() {
    minDirtyDepth = Infinity;
    maxDirtyDepth = -1;
    for (let i = 0; i < buckets.length; i++) {
        if (buckets[i]) {
            while (buckets[i].length > 0) {
                const n = buckets[i].pop();
                if (n) {
                    n.ft &= ~FLAG_DIRTY;
                    n.bucketIdx = -1;
                }
            }
        }
    }
}

function handleFlushError(node: any, err: any) {
    if (import.meta.env.DEV) {
        console.error(
            `[watervein-error] Exception caught during flush (Node ID: ${node.id}, Type: ${node.type}).\n` +
            `Entity ID: ${node.entityId ?? 'Global'}\n`,
            err
        );
    }

    let currentSearchId: number | null = node.entityId;
    let handler: ((err: any) => void) | undefined = undefined;

    while (currentSearchId !== null) {
        if (errorBoundaryRegistry.has(currentSearchId)) {
            handler = errorBoundaryRegistry.get(currentSearchId);
            break;
        }
        currentSearchId = entityParentMap.get(currentSearchId) ?? null;
    }

    forceCleanupBuckets();
    raFID = null;

    if (handler) {
        handler(err);
        return;
    }

    throw err;
}

export function flush() {
    raFID = null;

    try {
        while (minDirtyDepth <= maxDirtyDepth) {
            const d = minDirtyDepth;
            const bucket = buckets[d];

            if (!bucket || bucket.length === 0) {
                minDirtyDepth++;
                continue;
            }

            while (bucket.length > 0) {
                const node = bucket.pop()!;

                if ((node.ft & FLAG_DISPOSED) !== 0 || allNodes[node.id] !== node) {
                    continue;
                }

                node.bucketIdx = -1;
                node.ft &= ~FLAG_DIRTY;

                try {
                    const nodeType = node.ft >>> TYPE_SHIFT;
                    if (nodeType === NODE_TYPE_COMPUTE) {
                        executeCompute(node);
                    } else if (nodeType === NODE_TYPE_EFFECT) {
                        executeEffect(node);
                    }
                } catch (err) {
                    handleFlushError(node, err);
                    return;
                }

                if (minDirtyDepth < d) {
                    break;
                }
            }

            if (bucket.length === 0 && minDirtyDepth === d) {
                minDirtyDepth++;
            }
        }
    } finally {
        minDirtyDepth = Infinity;
        maxDirtyDepth = -1;
        raFID = null;
    }
}

export function createState<T>(initial: T): Node<T> {
    return createNode(NODE_TYPE_STATE, initial);
}

export function createCompute<T>(fn: () => T): Node<T> {
    const node: Node<T> = createNode<T>(NODE_TYPE_COMPUTE, undefined as any, () => {
        if (import.meta.env.DEV && evaluationStack) {
            if (evaluationStack.has(node.id)) throw new Error(`[watervein] Circular reference on compute ${node.id}`);
            evaluationStack.add(node.id);
        }
        pushTrackingNode(node);
        try { return (node.value = fn()); }
        finally {
            popTrackingNode();
            if (import.meta.env.DEV && evaluationStack) evaluationStack.delete(node.id);
        }
    });
    executeCompute(node);
    return node;
}

export function createEffect(fn: () => void): Node<void> {
    const node: Node<void> = createNode<void>(NODE_TYPE_EFFECT, undefined, () => {
        if (import.meta.env.DEV && evaluationStack) {
            if (evaluationStack.has(node.id)) throw new Error(
                `[watervein] Circular reference on effect ${node.id}`
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
    executeEffect(node);
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

export function createSelector(sourceNode: Node<number>): (id: number) => boolean {
    const keyToSubs = new Map<number, number[]>();
    let prevId = untrack(() => read(sourceNode));

    createEffect(() => {
        const nextId = read(sourceNode);
        if (prevId === nextId) return;

        const p = prevId;
        const n = nextId;
        prevId = nextId;

        const notify = (id: number | null) => {
            if (id === null || id < 0) return;
            const subs = keyToSubs.get(id);
            if (subs) {
                let writeIdx = 0;
                for (let i = 0; i < subs.length; i++) {
                    const subId = subs[i];
                    const node = allNodes[subId];
                    if (node && (node.ft & FLAG_DISPOSED) === 0) {
                        scheduleNode(node);
                        subs[writeIdx++] = subId;
                    }
                }
                if (writeIdx === 0) keyToSubs.delete(id);
                else subs.length = writeIdx;
            }
        };

        notify(p);
        notify(n);
    });

    return (id: number): boolean => {
        const trk = currentTrackingNode;
        if (trk !== null) {
            let subs = keyToSubs.get(id);
            if (!subs) keyToSubs.set(id, (subs = []));
            if (!subs.includes(trk.id)) subs.push(trk.id);
        }
        return untrack(() => read(sourceNode)) === id;
    };
}

export function read<T>(node: Node<T>): T {
    if (import.meta.env.DEV && !isNode(node)) {
        throw new Error('[watervein] read() was called with a value that is not a reactive Node.');
    }
    const trk = currentTrackingNode;
    if (trk !== null && trk !== node) {
        if (trk.pendingDeps === null) {
            trk.pendingDeps = new Array(8);
        }

        const idx = trk.pendingDepsLen;
        if (idx > 0 && trk.pendingDeps[idx - 1] === node) {
            return node.value;
        }
        trk.pendingDeps[idx] = node;
        trk.pendingDepsLen = idx + 1;
    }
    return node.value;
}

export function write<T>(node: Node<T>, value: T) {
    if (node.value === value) return;
    node.value = value;
    let edgeId = node.subsHead;
    while (edgeId !== NULL_EDGE) {
        const subNode = allNodes[edgeSub[edgeId]];
        if (subNode && (subNode.ft & FLAG_DISPOSED) === 0) {
            scheduleNode(subNode);
        }
        edgeId = edgeNextSub[edgeId];
    }
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
        let edgeId = node.depsHead;
        while (edgeId !== NULL_EDGE) {
            const nextEdgeId = edgeNextDep[edgeId];
            unlinkEdge(edgeId);
            edgeId = nextEdgeId;
        }
    },
};

const DESTROY_TARGET_SETS: Set<number>[] = [];
const DESTROYING_NODE_SETS: Set<number>[] = [];
const COLLECTED_NODES_BUFFERS: Node[][] = [];
const DEPTH_BUCKETS_BUFFERS: Node[][][] = [];

let destroyCallDepth = 0;

function getDestroyBuffers(depth: number) {
    if (!DESTROY_TARGET_SETS[depth]) {
        DESTROY_TARGET_SETS[depth] = new Set<number>();
        DESTROYING_NODE_SETS[depth] = new Set<number>();
        COLLECTED_NODES_BUFFERS[depth] = [];
        DEPTH_BUCKETS_BUFFERS[depth] = [];
    }
    return {
        allTargetEntityIds: DESTROY_TARGET_SETS[depth],
        destroyingNodeIds: DESTROYING_NODE_SETS[depth],
        allCollectedNodes: COLLECTED_NODES_BUFFERS[depth],
        depthBuckets: DEPTH_BUCKETS_BUFFERS[depth],
    };
}

function collectRecursively(
    id: number,
    allTargets: Set<number>
) {
    if (allTargets.has(id)) return;
    allTargets.add(id);
    const children = entityChildrenMap.get(id);
    if (children) {
        for (const childId of children) {
            collectRecursively(childId, allTargets);
        }
    }
}

export const DestructionSystem = {
    destroyEntity(entityId: number) {
        const children = entityChildrenMap.get(entityId);
        if (!children || children.size === 0) {
            const nodes = entityRegistry[entityId];
            if (nodes) {
                for (let i = 0; i < nodes.length; i++) {
                    this._cleanupNode(nodes[i]);
                }
            }
            entityRegistry[entityId] = undefined;
            entityParentMap.delete(entityId);
            entityChildrenMap.delete(entityId);
            errorBoundaryRegistry.delete(entityId);
            freeEntityIds.push(entityId);
            return;
        }
        this.destroyEntities([entityId]);
    },

    destroyEntities(entityIds: number[]) {
        const len = entityIds.length;
        if (len === 0) return;

        const depth = destroyCallDepth++;
        const {
            allTargetEntityIds,
            destroyingNodeIds: destroying,
            allCollectedNodes,
            depthBuckets
        } = getDestroyBuffers(depth);

        try {
            allTargetEntityIds.clear();
            destroying.clear();
            allCollectedNodes.length = 0;
            for (let i = 0; i < len; i++) {
                collectRecursively(entityIds[i], allTargetEntityIds);
            }
            for (const eId of allTargetEntityIds) {
                const parentId = entityParentMap.get(eId);
                if (parentId !== undefined && parentId !== null && !allTargetEntityIds.has(parentId)) {
                    const parentChildren = entityChildrenMap.get(parentId);
                    if (parentChildren) {
                        parentChildren.delete(eId);
                    }
                }
            }
            let maxDepth = 0;
            for (const eId of allTargetEntityIds) {
                const nodes = entityRegistry[eId];
                if (nodes) {
                    const nLen = nodes.length;
                    for (let i = 0; i < nLen; i++) {
                        const node = nodes[i];
                        destroying.add(node.id);
                        allCollectedNodes.push(node);
                        if (node.depth > maxDepth) {
                            maxDepth = node.depth;
                        }
                    }
                }
            }
            const totalNodes = allCollectedNodes.length;
            if (totalNodes > 0) {
                while (depthBuckets.length <= maxDepth) {
                    depthBuckets.push([]);
                }
                for (let d = 0; d <= maxDepth; d++) {
                    depthBuckets[d].length = 0;
                }
                for (let i = 0; i < totalNodes; i++) {
                    const node = allCollectedNodes[i];
                    depthBuckets[node.depth].push(node);
                }
                for (let d = maxDepth; d >= 0; d--) {
                    const bucketNodes = depthBuckets[d];
                    const bLen = bucketNodes.length;
                    for (let i = 0; i < bLen; i++) {
                        const node = bucketNodes[i];
                        this._cleanupNode(node, destroying);
                    }
                }
            }
            const willFreeAll = (freeEntityIds.length + allTargetEntityIds.size) === ENTITY_COUNT;
            for (const eId of allTargetEntityIds) {
                entityRegistry[eId] = undefined;
                if (!willFreeAll) {
                    entityParentMap.delete(eId);
                    entityChildrenMap.delete(eId);
                }
                errorBoundaryRegistry.delete(eId);
                freeEntityIds.push(eId);
            }
            if (willFreeAll) {
                ENTITY_COUNT = 0;
                freeEntityIds.length = 0;
                entityRegistry.length = 0;
                entityChildrenMap = new Map();
                entityParentMap = new Map();
            }
            let hasRemainingDirty = false;
            for (let d = minDirtyDepth; d <= maxDirtyDepth; d++) {
                if (buckets[d] && buckets[d].length > 0) {
                    hasRemainingDirty = true;
                    break;
                }
            }
            if (!hasRemainingDirty) {
                minDirtyDepth = Infinity;
                maxDirtyDepth = -1;
                buckets.length = 0;
            }

            if (freeNodeIds.length > 1000) {
                const nodesEmpty = trimSparseArrays();
                compactEdgePoolIfNeeded(nodesEmpty);
            }

        } finally {
            destroyCallDepth--;
            allCollectedNodes.length = 0;
            for (let d = 0; d < depthBuckets.length; d++) {
                if (depthBuckets[d]) depthBuckets[d].length = 0;
            }
        }
    },

    _cleanupNode(node: Node, destroying: Set<number> | null = null) {
        const nodeType = node.ft >>> TYPE_SHIFT;
        if (nodeType === NODE_TYPE_EFFECT && typeof node.value === "function") {
            try {
                (node.value as () => void)();
            } catch (err) {
                console.error(`[watervein] Error during effect cleanup on node ${node.id}:`, err);
            }
        }

        node.value = null;

        let subEdgeId = node.subsHead;
        node.subsHead = NULL_EDGE;
        while (subEdgeId !== NULL_EDGE) {
            const next = edgeNextSub[subEdgeId];
            unlinkEdge(subEdgeId);
            subEdgeId = next;
        }

        let depEdgeId = node.depsHead;
        node.depsHead = NULL_EDGE;
        while (depEdgeId !== NULL_EDGE) {
            const next = edgeNextDep[depEdgeId];
            unlinkEdge(depEdgeId);
            depEdgeId = next;
        }

        if (node.bucketIdx !== -1) {
            const bucket = buckets[node.depth];
            const idx = node.bucketIdx;
            if (bucket && idx < bucket.length) {
                const last = bucket[bucket.length - 1];
                bucket[idx] = last;
                if (last) {
                    last.bucketIdx = idx;
                }
                bucket.pop();
            }
            node.bucketIdx = -1;
        }

        node.ft &= ~FLAG_DIRTY;
        node.compute = null;

        if (node.pendingDeps) {
            node.pendingDeps.length = 0;
        }

        allNodes[node.id] = undefined;
        freeNodeIds.push(node.id);

        node.ft |= FLAG_DISPOSED;
        node.id = -1;
    }
};

export function matchEntity(
    conditionNode: Node<boolean>,
    thenFn: () => void,
    elseFn?: () => void
) {
    let currentActiveEntityId: number | null = null;
    let prevBranch: boolean | null = null;
    createEffect(() => {
        const branchValue = read(conditionNode);
        if (branchValue === prevBranch) return;
        prevBranch = branchValue;
        if (currentActiveEntityId !== null) {
            DestructionSystem.destroyEntity(currentActiveEntityId);
            currentActiveEntityId = null;
        }
        const targetFn = branchValue ? thenFn : elseFn;
        if (targetFn) {
            currentActiveEntityId = createEntity();
            withEntity(currentActiveEntityId, () => untrack(targetFn))
        }
    });
}

const DESTROY_BUF: number[] = [];
const SET_BUF = new Set<any>();
const TEMP_MAP = new Map<any, any>();

function destroyBuf() {
    if (DESTROY_BUF.length > 0) {
        DestructionSystem.destroyEntities(DESTROY_BUF);
        DESTROY_BUF.length = 0;
    }
}

function updateNode<T>(node: Node<T>, val: T) {
    if (node.value !== val) write(node, val);
}

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
        const prevLen = prevList.length;
        if (len === 0) {
            if (entityCache.size > 0) {
                for (const cache of entityCache.values()) DESTROY_BUF.push(cache.entityId);
                destroyBuf();
                entityCache.clear();
            }
            prevList = list;
            return;
        }

        let start = 0;
        let endA = prevLen - 1;
        let endB = len - 1;

        while (start <= endA && start <= endB && prevList[start] === list[start]) {
            start++;
        }
        while (endA >= start && endB >= start && prevList[endA] === list[endB]) {
            endA--;
            endB--;
        }
        if (len === prevLen && start <= endA) {
            TEMP_MAP.clear();

            try {
                for (let i = start; i <= endA; i++) {
                    const oldKey = keyFn(prevList[i]);
                    const cache = entityCache.get(oldKey);
                    if (cache && !TEMP_MAP.has(oldKey)) {
                        TEMP_MAP.set(oldKey, cache);
                        entityCache.delete(oldKey);
                    }
                }

                for (let i = start; i <= endA; i++) {
                    const item = list[i];
                    const newKey = keyFn(item);

                    let cache = TEMP_MAP.get(newKey);

                    if (cache) {
                        TEMP_MAP.delete(newKey);
                        updateNode(cache.itemNode, item);
                        updateNode(cache.indexNode, i);
                        entityCache.set(newKey, cache);
                    } else {
                        cache = entityCache.get(newKey);
                        if (cache) {
                            updateNode(cache.itemNode, item);
                            updateNode(cache.indexNode, i);
                        } else {
                            const entityId = createEntity();
                            withEntity(entityId, () => {
                                const itemNode = createState(item);
                                const indexNode = createState(i);
                                entityCache.set(newKey, { entityId, itemNode, indexNode });
                                renderFn(newKey, () => read(itemNode), () => read(indexNode));
                            });
                        }
                    }
                }

                for (const cache of TEMP_MAP.values()) {
                    DESTROY_BUF.push(cache.entityId);
                }
                destroyBuf();
            } finally {
                TEMP_MAP.clear();
            }

            prevList = list;
            return;
        }

        SET_BUF.clear();
        for (let i = 0; i < len; i++) SET_BUF.add(keyFn(list[i]));

        for (const [key, cache] of entityCache) {
            if (!SET_BUF.has(key)) {
                DESTROY_BUF.push(cache.entityId);
                entityCache.delete(key);
            }
        }
        destroyBuf();

        for (let i = 0; i < len; i++) {
            const item = list[i];
            const key = keyFn(item);
            const cached = entityCache.get(key);

            if (cached) {
                updateNode(cached.itemNode, item);
                updateNode(cached.indexNode, i);
            } else {
                const entityId = createEntity();
                withEntity(entityId, () => {
                    const itemNode = createState(item);
                    const indexNode = createState(i);
                    entityCache.set(key, { entityId, itemNode, indexNode });
                    renderFn(key, () => read(itemNode), () => read(indexNode));
                });
            }
        }

        prevList = list;
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

export function getCurrentEntityId(): number | null {
    return currentEntityId;
}

const WV_HANDLERS = Symbol('wv-handlers');
const attachedEventTypesByDoc = new WeakMap<Document, Set<string>>();

export function registerHandler(el: HTMLElement, eventName: string, handler: EventListener) {
    let handlers = (el as any)[WV_HANDLERS];
    if (!handlers) {
        handlers = Object.create(null);
        (el as any)[WV_HANDLERS] = handlers;
    }
    handlers[eventName] = handler;

    const doc = el.ownerDocument;
    let attached = attachedEventTypesByDoc.get(doc);
    if (!attached) {
        attached = new Set();
        attachedEventTypesByDoc.set(doc, attached);
    }
    if (!attached.has(eventName)) {
        attached.add(eventName);
        doc.addEventListener(eventName, handleDelegatedEvent);
    }
}

export function handleDelegatedEvent(e: Event) {
    let target = e.target as HTMLElement | null;
    while (target) {
        const handlers = (target as any)[WV_HANDLERS];
        if (handlers) {
            const handler = handlers[e.type];
            if (handler) {
                handler(e);
                if ((e as any).cancelBubble) return;
            }
        }
        target = target.parentElement;
    }
}

const errorBoundaryRegistry = new Map<number, (err: any) => void>();

export function registerErrorBoundary(entityId: number, handler: (err: any) => void) {
    errorBoundaryRegistry.set(entityId, handler);
}

export function unregisterErrorBoundary(entityId: number) {
    errorBoundaryRegistry.delete(entityId);
}

export function getDependencyIds(node: Node): number[] {
    const ids: number[] = [];
    let edgeId = node.depsHead;
    while (edgeId !== NULL_EDGE) {
        ids.push(edgeDep[edgeId]);
        edgeId = edgeNextDep[edgeId];
    }
    return ids;
}

export function getDependencyCount(node: Node): number {
    let count = 0;
    let edgeId = node.depsHead;
    while (edgeId !== NULL_EDGE) {
        count++;
        edgeId = edgeNextDep[edgeId];
    }
    return count;
}