// src/index.ts
var NODE_TYPE_STATE = 0;
var NODE_TYPE_COMPUTE = 1;
var NODE_TYPE_EFFECT = 2;
var nextAvailableNodeType = 3;
var WV_NODE_TAG = 1465273924;
var NODE_ID_COUNTER = 0;
var DEFAULT_EDGE_CAPACITY = 256;
var edgeCapacity = DEFAULT_EDGE_CAPACITY;
var edgePoolInitialized = false;
var edgeDep = new Int32Array(edgeCapacity);
var edgeSub = new Int32Array(edgeCapacity);
var edgeNextSub = new Int32Array(edgeCapacity);
var edgePrevSub = new Int32Array(edgeCapacity);
var edgeNextDep = new Int32Array(edgeCapacity);
var edgePrevDep = new Int32Array(edgeCapacity);
var NULL_EDGE = -1;
var edgeFreeListHead = NULL_EDGE;
var nextUnallocatedEdgeId = 0;
function initCapacity(options) {
  if (edgePoolInitialized) {
    throw new Error("[watervein] initCapacity() must be called before any node or edge is created, and can only be called once.");
  }
  if (nextUnallocatedEdgeId !== 0 || NODE_ID_COUNTER !== 0) {
    throw new Error("[watervein] initCapacity() must be called before any node or edge is created.");
  }
  const requestedEdgeCapacity = options.edgeCapacity ?? DEFAULT_EDGE_CAPACITY;
  if (requestedEdgeCapacity < 1) {
    throw new Error("[watervein] edgeCapacity must be a positive integer.");
  }
  edgeCapacity = requestedEdgeCapacity;
  edgeDep = new Int32Array(edgeCapacity);
  edgeSub = new Int32Array(edgeCapacity);
  edgeNextSub = new Int32Array(edgeCapacity);
  edgePrevSub = new Int32Array(edgeCapacity);
  edgeNextDep = new Int32Array(edgeCapacity);
  edgePrevDep = new Int32Array(edgeCapacity);
  edgePoolInitialized = true;
}
function ensureEdgeCapacity(minCapacity) {
  edgePoolInitialized = true;
  if (minCapacity < edgeCapacity) return;
  let newCap = edgeCapacity + (edgeCapacity >> 1) + 1;
  while (newCap <= minCapacity) newCap += (newCap >> 1) + 1;
  const expandInt32 = (old) => {
    const n = new Int32Array(newCap);
    n.set(old);
    return n;
  };
  edgeDep = expandInt32(edgeDep);
  edgeSub = expandInt32(edgeSub);
  edgeNextSub = expandInt32(edgeNextSub);
  edgePrevSub = expandInt32(edgePrevSub);
  edgeNextDep = expandInt32(edgeNextDep);
  edgePrevDep = expandInt32(edgePrevDep);
  edgeCapacity = newCap;
}
function allocEdge(depId, subId) {
  edgePoolInitialized = true;
  let edgeId;
  if (edgeFreeListHead !== NULL_EDGE) {
    edgeId = edgeFreeListHead;
    edgeFreeListHead = edgeNextSub[edgeId];
  } else {
    edgeId = nextUnallocatedEdgeId++;
    if (edgeId >= edgeCapacity) {
      ensureEdgeCapacity(edgeId + 1);
    }
  }
  edgeDep[edgeId] = depId;
  edgeSub[edgeId] = subId;
  edgeNextSub[edgeId] = NULL_EDGE;
  edgePrevSub[edgeId] = NULL_EDGE;
  edgeNextDep[edgeId] = NULL_EDGE;
  edgePrevDep[edgeId] = NULL_EDGE;
  return edgeId;
}
function freeEdge(edgeId) {
  edgeDep[edgeId] = -1;
  edgeSub[edgeId] = -1;
  edgeNextSub[edgeId] = edgeFreeListHead;
  edgeFreeListHead = edgeId;
}
var allNodes = [];
function N(id) {
  const node = allNodes[id];
  if (!node || node.id === -1) {
    throw new Error(`[watervein] Node with id ${id} is undefined or destroyed.`);
  }
  return node;
}
var trackingVersion = 0;
var currentTrackingNode = null;
var trackingStack = [];
var buckets = [];
var minDirtyDepth = Infinity;
var maxDirtyDepth = -1;
var ENTITY_COUNT = 0;
var entityRegistry = /* @__PURE__ */ new Map();
var currentEntityId = null;
var entityChildrenMap = /* @__PURE__ */ new Map();
var entityParentMap = /* @__PURE__ */ new Map();
var isBatching = false;
var raFID = null;
function createEntity() {
  const id = ENTITY_COUNT++;
  entityRegistry.set(id, []);
  entityParentMap.set(id, currentEntityId);
  entityChildrenMap.set(id, /* @__PURE__ */ new Set());
  if (currentEntityId !== null) {
    const children = entityChildrenMap.get(currentEntityId);
    if (children) children.add(id);
  }
  return id;
}
function withEntity(entityId, fn) {
  const prev = currentEntityId;
  currentEntityId = entityId;
  try {
    return fn();
  } finally {
    currentEntityId = prev;
  }
}
function registerCustomNodeType() {
  return nextAvailableNodeType++;
}
var freeNodeIds = [];
function createNode(type, value, compute = null) {
  const id = freeNodeIds.length > 0 ? freeNodeIds.pop() : NODE_ID_COUNTER++;
  const node = {
    __wv: WV_NODE_TAG,
    type,
    id,
    dirty: false,
    depth: 0,
    watchedVersion: -1,
    bucketIdx: -1,
    pendingDepsLen: 0,
    value,
    entityId: currentEntityId,
    compute,
    subsHead: NULL_EDGE,
    depsHead: NULL_EDGE,
    pendingDeps: new Array(8)
  };
  allNodes[node.id] = node;
  if (currentEntityId !== null) {
    entityRegistry.get(currentEntityId).push(node);
  }
  return node;
}
function linkEdge(dep, sub) {
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
function unlinkEdge(edgeId) {
  if (edgeId === NULL_EDGE) return;
  const depId = edgeDep[edgeId];
  const subId = edgeSub[edgeId];
  const prevS = edgePrevSub[edgeId];
  const nextS = edgeNextSub[edgeId];
  const prevD = edgePrevDep[edgeId];
  const nextD = edgeNextDep[edgeId];
  const depNode = allNodes[depId];
  const subNode = allNodes[subId];
  if (prevS !== NULL_EDGE) edgeNextSub[prevS] = nextS;
  else if (depNode && depNode.type !== -1) depNode.subsHead = nextS;
  if (nextS !== NULL_EDGE) edgePrevSub[nextS] = prevS;
  if (prevD !== NULL_EDGE) edgeNextDep[prevD] = nextD;
  else if (subNode && subNode.type !== -1) subNode.depsHead = nextD;
  if (nextD !== NULL_EDGE) edgePrevDep[nextD] = prevD;
  freeEdge(edgeId);
}
var edgeCommitVersion = 0;
function commitEdges(sub) {
  if (sub.type === -1) return;
  const pending = sub.pendingDeps;
  const pLen = sub.pendingDepsLen;
  edgeCommitVersion += 2;
  const pendingStamp = edgeCommitVersion;
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
      const depNodeId = edgeDep[edgeId];
      const depNode = allNodes[depNodeId];
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
var PROPAGATE_QUEUE = new Array(2048);
function propagateDepth(start) {
  PROPAGATE_QUEUE[0] = start;
  let head = 0;
  let tail = 1;
  const visitMarker = ++trackingVersion;
  try {
    while (head < tail) {
      const node = PROPAGATE_QUEUE[head];
      PROPAGATE_QUEUE[head++] = void 0;
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
              if (tail >= PROPAGATE_QUEUE.length) {
                PROPAGATE_QUEUE.length *= 2;
              }
              PROPAGATE_QUEUE[tail++] = subNode;
            }
          }
        }
        edgeId = edgeNextSub[edgeId];
      }
    }
  } finally {
    for (let i = 0; i < tail; i++) PROPAGATE_QUEUE[i] = void 0;
  }
}
var nextTick = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
function scheduleNode(node) {
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
    raFID = nextTick(flush);
  }
}
var evaluationStack = null;
if (import.meta.env.DEV) evaluationStack = /* @__PURE__ */ new Set();
var activeCompute = null;
function executeCompute(node) {
  trackingVersion++;
  node.pendingDepsLen = 0;
  const prevActive = activeCompute;
  activeCompute = node;
  try {
    const oldValue = node.value;
    const newValue = node.compute();
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
function executeEffect(node) {
  trackingVersion++;
  node.pendingDepsLen = 0;
  pushTrackingNode(node);
  try {
    node.compute();
    commitEdges(node);
  } finally {
    popTrackingNode();
    if (import.meta.env.DEV && evaluationStack) evaluationStack.delete(node.id);
  }
}
function writeRaw(node, value) {
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
      raFID = nextTick(flush);
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
function flush() {
  raFID = null;
  let d = minDirtyDepth;
  while (d <= maxDirtyDepth) {
    const bucket = buckets[d];
    if (bucket && bucket.length > 0) {
      const node = bucket.pop();
      if (!node || node.id === -1 || node.type === -1 || allNodes[node.id] !== node) {
        continue;
      }
      node.bucketIdx = -1;
      node.dirty = false;
      if (import.meta.env.DEV) {
        try {
          if (node.type === NODE_TYPE_COMPUTE) executeCompute(node);
          else if (node.type === NODE_TYPE_EFFECT) executeEffect(node);
        } catch (err) {
          console.error(
            `[watervein-error] Exception caught during flush at depth ${d} (Node ID: ${node.id}, Type: ${node.type}).
Entity ID: ${node.entityId ?? "Global"}
`,
            err
          );
          let currentSearchId = node.entityId;
          let handler = void 0;
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
      } else {
        try {
          if (node.type === NODE_TYPE_COMPUTE) executeCompute(node);
          else if (node.type === NODE_TYPE_EFFECT) executeEffect(node);
        } catch (err) {
          let currentSearchId = node.entityId;
          let handler = void 0;
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
      }
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
  raFID = null;
}
function createState(initial) {
  return createNode(NODE_TYPE_STATE, initial);
}
function createCompute(fn) {
  const node = createNode(NODE_TYPE_COMPUTE, void 0, () => {
    if (import.meta.env.DEV && evaluationStack) {
      if (evaluationStack.has(node.id)) throw new Error(
        `[watervein] A circular reference was detected on compute node ${node.id}.`
      );
      evaluationStack.add(node.id);
    }
    pushTrackingNode(node);
    try {
      return node.value = fn();
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
function createEffect(fn) {
  const node = createNode(NODE_TYPE_EFFECT, void 0, () => {
    if (import.meta.env.DEV && evaluationStack) {
      if (evaluationStack.has(node.id)) throw new Error(
        `[watervein] A circular reference was detected on effect node ${node.id}.`
      );
      evaluationStack.add(node.id);
    }
    pushTrackingNode(node);
    try {
      return node.value = fn();
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
function createResource(sourceNode, fetcher) {
  const resourceNode = createNode(
    NODE_TYPE_STATE,
    { data: void 0, loading: true, error: null }
  );
  let currentFetchId = 0;
  createEffect(() => {
    const sourceValue = read(sourceNode);
    const fetchId = ++currentFetchId;
    untrack(() => {
      write(resourceNode, { data: resourceNode.value.data, loading: true, error: null });
    });
    fetcher(sourceValue).then((data) => {
      if (fetchId !== currentFetchId) return;
      write(resourceNode, { data, loading: false, error: null });
    }).catch((error) => {
      if (fetchId !== currentFetchId) return;
      write(resourceNode, { data: void 0, loading: false, error });
    });
  });
  return resourceNode;
}
function read(node) {
  if (import.meta.env.DEV && !isNode(node)) {
    throw new Error("[watervein] read() was called with a value that is not a reactive Node.");
  }
  const trk = currentTrackingNode;
  if (trk !== null && trk !== node) {
    const idx = trk.pendingDepsLen;
    if (idx > 0 && trk.pendingDeps[idx - 1] === node) {
      return node.value;
    }
    if (idx >= trk.pendingDeps.length) {
      trk.pendingDeps.length *= 2;
    }
    trk.pendingDeps[idx] = node;
    trk.pendingDepsLen = idx + 1;
  }
  return node.value;
}
function write(node, value) {
  if (node.value === value) return;
  node.value = value;
  let edgeId = node.subsHead;
  while (edgeId !== NULL_EDGE) {
    const subNode = allNodes[edgeSub[edgeId]];
    if (subNode) scheduleNode(subNode);
    edgeId = edgeNextSub[edgeId];
  }
}
function untrack(fn) {
  const backup = currentTrackingNode;
  currentTrackingNode = null;
  try {
    return fn();
  } finally {
    currentTrackingNode = backup;
  }
}
function pushTrackingNode(node) {
  trackingStack.push(currentTrackingNode);
  currentTrackingNode = node;
}
function popTrackingNode() {
  currentTrackingNode = trackingStack.pop() ?? null;
}
var UISystem = { flush };
var DataSystem = {
  schedule: scheduleNode,
  propagateDepth,
  cleanupEdges: (node) => {
    let edgeId = node.depsHead;
    while (edgeId !== NULL_EDGE) {
      const nextEdgeId = edgeNextDep[edgeId];
      unlinkEdge(edgeId);
      edgeId = nextEdgeId;
    }
  }
};
var DestructionSystem = {
  destroyEntity(entityId) {
    this.destroyEntities([entityId]);
  },
  destroyEntities(entityIds) {
    const len = entityIds.length;
    if (len === 0) return;
    const allTargetEntityIds = /* @__PURE__ */ new Set();
    const collectRecursively = (id) => {
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
      if (parentId !== void 0 && parentId !== null && !allTargetEntityIds.has(parentId)) {
        const parentChildren = entityChildrenMap.get(parentId);
        if (parentChildren) {
          parentChildren.delete(eId);
        }
      }
    }
    const allCollectedNodes = [];
    const destroying = /* @__PURE__ */ new Set();
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
      const depthBuckets = Array.from({ length: maxDepth + 1 }, () => []);
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
  _cleanupNode(node, destroying = null) {
    if (node.type === NODE_TYPE_EFFECT && typeof node.value === "function") {
      try {
        node.value();
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
    if (node.run) {
      node.run = null;
    }
    if (node.pendingDeps) {
      node.pendingDeps.length = 0;
    }
    allNodes[node.id] = void 0;
    freeNodeIds.push(node.id);
    node.type = -1;
    node.id = -1;
  }
};
function matchEntity(conditionNode, thenFn, elseFn) {
  let currentActiveEntityId = null;
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
var MAP_ENTITY_TO_DESTROY = [];
var MAP_ENTITY_SET = /* @__PURE__ */ new Set();
var MAP_TEMP_CACHES = /* @__PURE__ */ new Map();
var MAP_KEYS_CACHE = [];
function mapEntity(listNode, keyFn, renderFn) {
  const entityCache = /* @__PURE__ */ new Map();
  let prevList = [];
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
function isNode(value) {
  return value?.__wv === WV_NODE_TAG;
}
function batch(fn) {
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
var eventRegistry = /* @__PURE__ */ new Map();
function getCurrentEntityId() {
  return currentEntityId;
}
function handleDelegatedEvent(e) {
  const registry = eventRegistry.get(e.type);
  if (!registry) return;
  let target = e.target;
  while (target) {
    const entityIdStr = target.getAttribute("data-wv-eid");
    if (entityIdStr) {
      const handler = registry.get(parseInt(entityIdStr, 10));
      if (handler) {
        handler(e);
        if (e.cancelBubble) return;
      }
    }
    target = target.parentElement;
  }
}
function cleanupEntityEvents(entityId) {
  for (const registry of eventRegistry.values()) {
    registry.delete(entityId);
  }
}
var errorBoundaryRegistry = /* @__PURE__ */ new Map();
function registerErrorBoundary(entityId, handler) {
  errorBoundaryRegistry.set(entityId, handler);
}
function unregisterErrorBoundary(entityId) {
  errorBoundaryRegistry.delete(entityId);
}
function getDependencyIds(node) {
  const ids = [];
  let edgeId = node.depsHead;
  while (edgeId !== NULL_EDGE) {
    ids.push(edgeDep[edgeId]);
    edgeId = edgeNextDep[edgeId];
  }
  return ids;
}
function getDependencyCount(node) {
  let count = 0;
  let edgeId = node.depsHead;
  while (edgeId !== NULL_EDGE) {
    count++;
    edgeId = edgeNextDep[edgeId];
  }
  return count;
}
export {
  DataSystem,
  DestructionSystem,
  N,
  NODE_TYPE_COMPUTE,
  NODE_TYPE_EFFECT,
  NODE_TYPE_STATE,
  NULL_EDGE,
  UISystem,
  batch,
  cleanupEntityEvents,
  createCompute,
  createEffect,
  createEntity,
  createResource,
  createState,
  eventRegistry,
  flush,
  getCurrentEntityId,
  getDependencyCount,
  getDependencyIds,
  handleDelegatedEvent,
  initCapacity,
  isNode,
  mapEntity,
  matchEntity,
  popTrackingNode,
  pushTrackingNode,
  read,
  registerCustomNodeType,
  registerErrorBoundary,
  unregisterErrorBoundary,
  untrack,
  withEntity,
  write,
  writeRaw
};
