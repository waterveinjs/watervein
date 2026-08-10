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
    edgeDep[edgeId]     = -1;
    edgeSub[edgeId]     = -1;
    edgeNextSub[edgeId] = edgeFreeListHead;
    edgeFreeListHead    = edgeId;
}

export type Node<T = any> = {
    readonly __wv:  typeof WV_NODE_TAG;
    type:           number;
    id:             number;
    dirty:          boolean;
    depth:          number;
    watchedVersion: number;
    bucketIdx:      number;
    pendingDepsLen: number;
    value:          T;
    entityId:       number | null;
    compute:        (() => T) | null;
    subsHead:       number;
    depsHead:       number;
    pendingDeps:    (Node | null)[];
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
const entityRegistry = new Map<number, Node[]>();
let currentEntityId: number | null = null;

const entityChildrenMap = new Map<number, Set<number>>();
const entityParentMap   = new Map<number, number | null>();

let isBatching = false;
let raFID: number | null = null;

export function createEntity(): number {
    const id = ENTITY_COUNT++;
    entityRegistry.set(id, []);
    entityParentMap.set(id, currentEntityId);
    entityChildrenMap.set(id, new Set());
    if (currentEntityId !== null) {
        const children = entityChildrenMap.get(currentEntityId);
        if (children) children.add(id);
    }
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
        type:           type,
        id:             id,
        dirty:          false,
        depth:          0,
        watchedVersion: -1,
        bucketIdx:      -1,
        pendingDepsLen: 0,
        value:          value,
        entityId:       currentEntityId,
        compute:        compute,
        subsHead:       NULL_EDGE,
        depsHead:       NULL_EDGE,
        pendingDeps:    new Array(8),
    };

    allNodes[node.id] = node;
    if (currentEntityId !== null) {
        entityRegistry.get(currentEntityId)!.push(node);
    }
    return node;
}

function linkEdge(dep: Node, sub: Node): number {
    if (dep.type === -1 || sub.type === -1) return NULL_EDGE;

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
    if (sub.type === -1) return;

    const pending = sub.pendingDeps;
    const pLen    = sub.pendingDepsLen;

    edgeCommitVersion += 2;
    if (edgeCommitVersion > 9007199254740900) { 
        edgeCommitVersion = 2;
        for (let i = 0; i < allNodes.length; i++) {
            const node = allNodes[i];
            if (node) {
                node.watchedVersion = 0;
            }
        }
    }
    const pendingStamp  = edgeCommitVersion;
    const existingStamp = pendingStamp + 1;

    try {
        for (let i = 0; i < pLen; i++) {
            const dep = pending[i];
            if (dep && dep.type !== -1) {
                dep.watchedVersion = pendingStamp;
            }
        }

        let edgeId = sub.depsHead;
        while (edgeId !== NULL_EDGE) {
            const nextEdgeId = edgeNextDep[edgeId];
            const depNodeId  = edgeDep[edgeId];
            const depNode    = allNodes[depNodeId];

            if (depNode && depNode.type !== -1 && depNode.watchedVersion === pendingStamp) {
                depNode.watchedVersion = existingStamp;
            } else {
                unlinkEdge(edgeId);
            }
            edgeId = nextEdgeId;
        }

        for (let i = 0; i < pLen; i++) {
            const dep = pending[i];
            if (dep && dep.type !== -1 && dep.watchedVersion !== existingStamp) {
                linkEdge(dep, sub);
                dep.watchedVersion = existingStamp;
                if (sub.depth <= dep.depth) {
                    sub.depth = dep.depth + 1;
                    propagateDepth(sub);
                }
            }
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

                if (subNode && subNode.type !== -1) {
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

export function writeRaw<T>(node: Node<T>, value: T) {
    if (node.value === value) return;
    node.value = value;
    let edgeId = node.subsHead;
    if (edgeId !== NULL_EDGE) {
        while (edgeId !== NULL_EDGE) {
            const subNode = allNodes[edgeSub[edgeId]];
            if (subNode) scheduleNode(subNode);
            edgeId = edgeNextSub[edgeId];
        }
        if (raFID === null && !isBatching) {
            raFID = nextTick(flush) as any;
        }
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
                    n.dirty = false;
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
    let d = minDirtyDepth;

    while (d <= maxDirtyDepth) {
        const bucket = buckets[d];

        if (bucket && bucket.length > 0) {
            const node = bucket.pop()!;

            if (!node || node.id === -1 || node.type === -1 || allNodes[node.id] !== node) {
                continue;
            }

            node.bucketIdx = -1;
            node.dirty     = false;

            try {
                if (node.type === NODE_TYPE_COMPUTE) {
                    executeCompute(node);
                } else if (node.type === NODE_TYPE_EFFECT) {
                    executeEffect(node);
                }
            } catch (err) {
                handleFlushError(node, err);
                return;
            }

            if (minDirtyDepth < d) {
                d = minDirtyDepth;
            }
        } else {
            d++;
        }
    }

    minDirtyDepth = Infinity;
    maxDirtyDepth = -1;
    raFID = null;
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
        node.value = fn();
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

export function createSelector(sourceNode: Node<number>): (id: number) => boolean {
    const keyToSubs: number[][] = [];
    let prevId = untrack(() => read(sourceNode));

    createEffect(() => {
        const nextId = read(sourceNode);
        if (prevId === nextId) return;

        const p = prevId;
        const n = nextId;
        prevId = nextId;

        const notify = (id: number) => {
            if (id < 0) return;
            const subs = keyToSubs[id];
            if (subs) {
                for (let i = 0; i < subs.length; i++) {
                    const node = allNodes[subs[i]];
                    if (node && node.type !== -1) scheduleNode(node);
                }
            }
        };

        notify(p);
        notify(n);
    });

    return (id: number): boolean => {
        const trk = currentTrackingNode;
        if (trk !== null) {
            let subs = keyToSubs[id];
            if (!subs) {
                subs = keyToSubs[id] = [];
            }
            if (subs.indexOf(trk.id) === -1) {
                subs.push(trk.id);
            }
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
        if (subNode && subNode.type !== -1) {
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

export const DestructionSystem = {
    destroyEntity(entityId: number) {
        this.destroyEntities([entityId]);
    },

    destroyEntities(entityIds: number[]) {
        const len = entityIds.length;
        if (len === 0) return;

        const allTargetEntityIds = new Set<number>();
        const collectRecursively = (id: number) => {
            if (allTargetEntityIds.has(id)) return;
            allTargetEntityIds.add(id);
            const children = entityChildrenMap.get(id);
            if (children) {
                for (const childId of children) {
                    collectRecursively(childId);
                }
            }
        };
        for (let i = 0; i < len; i++) {
            collectRecursively(entityIds[i]);
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

        const allCollectedNodes: Node[] = [];
        const destroying = new Set<number>();
        let maxDepth = 0;

        for (const eId of allTargetEntityIds) {
            const nodes = entityRegistry.get(eId);
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
            const depthBuckets: Node[][] = Array.from({ length: maxDepth + 1 }, () => []);
            for (let i = 0; i < totalNodes; i++) {
                const node = allCollectedNodes[i];
                depthBuckets[node.depth].push(node);
            }

            for (let d = maxDepth; d >= 0; d--) {
                const bucketNodes = depthBuckets[d];
                const bLen = bucketNodes.length;
                for (let i = 0; i < bLen; i++) {
                    this._cleanupNode(bucketNodes[i], destroying);
                }
            }
        }

        for (const eId of allTargetEntityIds) {
            entityRegistry.delete(eId);
            entityParentMap.delete(eId);
            entityChildrenMap.delete(eId);
            errorBoundaryRegistry.delete(eId);
            cleanupEntityEvents(eId);
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
        }
    },

    _cleanupNode(node: Node, destroying: Set<number> | null = null) {
        if (node.type === NODE_TYPE_EFFECT && typeof node.value === "function") {
            try {
                (node.value as () => void)();
            } catch (err) {
                console.error(`[watervein] Error during effect cleanup on node ${node.id}:`, err);
            }
        }

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

        node.dirty = false;
        node.compute = null;
        if ((node as any).run) {
            (node as any).run = null;
        }

        if (node.pendingDeps) {
            node.pendingDeps.length = 0;
        }

        allNodes[node.id] = undefined;
        freeNodeIds.push(node.id);

        node.type = -1;
        node.id = -1;
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
const MAP_TEMP_CACHES = new Map<any, any>();
const MAP_KEYS_CACHE: any[] = [];

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

        let startDiff = -1;
        let endDiff = -1;

        const minLen = Math.min(len, prevLen);
        for (let i = 0; i < minLen; i++) {
            if (prevList[i] !== list[i]) {
                if (startDiff === -1) startDiff = i;
                endDiff = i;
            }
        }
        if (len !== prevLen) {
            if (startDiff === -1) startDiff = minLen;
            endDiff = Math.max(len, prevLen) - 1;
        }

        if (startDiff !== -1 && len === prevLen) {
            MAP_KEYS_CACHE.length = 0;
            for (let i = startDiff; i <= endDiff; i++) {
                if (prevList[i] !== list[i]) {
                    MAP_KEYS_CACHE.push(i);
                }
            }
            const changedCount = MAP_KEYS_CACHE.length;

            const oldKeysLocal = new Array(changedCount);
            const newKeysLocal = new Array(changedCount);
            for (let k = 0; k < changedCount; k++) {
                const i = MAP_KEYS_CACHE[k];
                oldKeysLocal[k] = keyFn(prevList[i]);
                newKeysLocal[k] = keyFn(list[i]);
            }

            MAP_ENTITY_TO_DESTROY.length = 0;
            MAP_TEMP_CACHES.clear();

            try {
                for (let k = 0; k < changedCount; k++) {
                    const oldKey = oldKeysLocal[k];
                    if (oldKey !== newKeysLocal[k] && !MAP_TEMP_CACHES.has(oldKey)) {
                        const cache = entityCache.get(oldKey);
                        if (cache) {
                            MAP_TEMP_CACHES.set(oldKey, cache);
                            entityCache.delete(oldKey);
                        }
                    }
                }

                for (let k = 0; k < changedCount; k++) {
                    const i = MAP_KEYS_CACHE[k];
                    const oldKey = oldKeysLocal[k];
                    const newKey = newKeysLocal[k];
                    const item = list[i];

                    if (oldKey === newKey) {
                        const cache = entityCache.get(newKey);
                        if (cache) {
                            if (cache.itemNode.value !== item) write(cache.itemNode, item);
                            if (cache.indexNode.value !== i) write(cache.indexNode, i);
                        }
                        continue;
                    }

                    const moved = MAP_TEMP_CACHES.get(newKey);
                    if (moved) {
                        if (moved.itemNode.value !== item) write(moved.itemNode, item);
                        if (moved.indexNode.value !== i) write(moved.indexNode, i);
                        entityCache.set(newKey, moved);
                        MAP_TEMP_CACHES.delete(newKey);
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

                for (const [, cache] of MAP_TEMP_CACHES) {
                    MAP_ENTITY_TO_DESTROY.push(cache.entityId);
                }
                if (MAP_ENTITY_TO_DESTROY.length > 0) {
                    DestructionSystem.destroyEntities(MAP_ENTITY_TO_DESTROY);
                }
            } finally {
                MAP_TEMP_CACHES.clear();
                MAP_KEYS_CACHE.length = 0;
                MAP_ENTITY_TO_DESTROY.length = 0;
            }

            prevList = list.slice();
            return;
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

export const eventRegistry = new Map<string, Map<number, EventListener>>();

export function getCurrentEntityId(): number | null {
    return currentEntityId;
}

export function handleDelegatedEvent(e: Event) {
    const registry = eventRegistry.get(e.type);
    if (!registry) return;

    let target = e.target as HTMLElement | null;
    while (target) {
        const entityIdStr = target.getAttribute('data-wv-eid');
        if (entityIdStr) {
            const handler = registry.get(parseInt(entityIdStr, 10));
            if (handler) {
                handler(e);
                if ((e as any).cancelBubble) return;
            }
        }
        target = target.parentElement;
    }
}

export function cleanupEntityEvents(entityId: number) {
    for (const registry of eventRegistry.values()) {
        registry.delete(entityId);
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