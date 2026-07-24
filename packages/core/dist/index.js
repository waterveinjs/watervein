// src/index.ts
var NODE_TYPE_STATE = 0;
var NODE_TYPE_COMPUTE = 1;
var NODE_TYPE_EFFECT = 2;
var nextAvailableNodeType = 3;
var WV_NODE_TAG = 1465273924;
var NODE_ID_COUNTER = 0;
var edgePool = [];
function createEdge(dep, sub) {
  const edge = edgePool.length > 0 ? edgePool.pop() : {
    dep: null,
    sub: null,
    nextSub: null,
    prevSub: null,
    nextDep: null,
    prevDep: null
  };
  edge.dep = dep;
  edge.sub = sub;
  edge.nextSub = edge.prevSub = edge.nextDep = edge.prevDep = null;
  return edge;
}
function releaseEdge(edge) {
  edge.dep = null;
  edge.sub = null;
  edge.nextSub = edge.prevSub = edge.nextDep = edge.prevDep = null;
  edgePool.push(edge);
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
    if (children) {
      children.add(id);
    }
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
    subsHead: null,
    depsHead: null,
    pendingDeps: type === NODE_TYPE_STATE ? [] : new Array(8)
  };
  allNodes[node.id] = node;
  if (currentEntityId !== null) {
    entityRegistry.get(currentEntityId).push(node);
  }
  return node;
}
function linkEdge(dep, sub) {
  if (!dep || !sub || dep.type === -1 || sub.type === -1) return null;
  const edge = createEdge(dep, sub);
  edge.nextSub = dep.subsHead;
  if (dep.subsHead !== null && dep.subsHead !== void 0) {
    dep.subsHead.prevSub = edge;
  }
  dep.subsHead = edge;
  edge.nextDep = sub.depsHead;
  if (sub.depsHead !== null && sub.depsHead !== void 0) {
    sub.depsHead.prevDep = edge;
  }
  sub.depsHead = edge;
  return edge;
}
function unlinkEdge(edge) {
  if (!edge) return;
  const { dep, sub } = edge;
  if (edge.prevSub !== null) edge.prevSub.nextSub = edge.nextSub;
  else if (dep && dep.type !== -1) dep.subsHead = edge.nextSub;
  if (edge.nextSub !== null) edge.nextSub.prevSub = edge.prevSub;
  if (edge.prevDep !== null) edge.prevDep.nextDep = edge.nextDep;
  else if (sub && sub.type !== -1) sub.depsHead = edge.nextDep;
  if (edge.nextDep !== null) edge.nextDep.prevDep = edge.prevDep;
  releaseEdge(edge);
}
var edgeCommitVersion = 0;
function commitEdges(sub) {
  if (!sub || sub.type === -1) return;
  const pending = sub.pendingDeps;
  const pLen = sub.pendingDepsLen;
  edgeCommitVersion += 2;
  const pendingStamp = edgeCommitVersion;
  const existingStamp = pendingStamp + 1;
  for (let i = 0; i < pLen; i++) {
    const dep = pending[i];
    if (dep && dep.type !== -1) {
      dep.watchedVersion = pendingStamp;
    }
  }
  let edge = sub.depsHead;
  while (edge !== null) {
    const nextEdge = edge.nextDep;
    if (edge.dep) {
      if (edge.dep.type === -1 || edge.dep.watchedVersion !== pendingStamp) {
        unlinkEdge(edge);
      } else {
        edge.dep.watchedVersion = pendingStamp + 1;
      }
    } else {
      unlinkEdge(edge);
    }
    edge = nextEdge;
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
  sub.pendingDepsLen = 0;
}
var PROPAGATE_QUEUE = new Array(1024);
function propagateDepth(start) {
  PROPAGATE_QUEUE[0] = start;
  let head = 0;
  let tail = 1;
  const visitMarker = ++trackingVersion;
  while (head < tail) {
    const node = PROPAGATE_QUEUE[head++];
    let edge = node.subsHead;
    while (edge !== null) {
      const sub = edge.sub;
      if (sub.id === start.id) {
        throw new Error(`[watervein] A circular reference was detected during depth propagation (node ${sub.id}).`);
      }
      if (sub.depth <= node.depth) {
        sub.depth = node.depth + 1;
        if (sub.watchedVersion !== visitMarker) {
          sub.watchedVersion = visitMarker;
          if (tail >= PROPAGATE_QUEUE.length) {
            PROPAGATE_QUEUE.length *= 2;
          }
          PROPAGATE_QUEUE[tail++] = sub;
        }
      }
      edge = edge.nextSub;
    }
  }
  for (let i = 0; i < tail; i++) PROPAGATE_QUEUE[i] = void 0;
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
function executeCompute(node) {
  trackingVersion++;
  node.pendingDepsLen = 0;
  try {
    const oldValue = node.value;
    const newValue = node.compute();
    commitEdges(node);
    if (oldValue !== newValue) {
      node.value = newValue;
      let edge = node.subsHead;
      while (edge !== null) {
        if (edge.sub) scheduleNode(edge.sub);
        edge = edge.nextSub;
      }
    }
  } finally {
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
  let edge = node.subsHead;
  if (edge !== null) {
    while (edge !== null) {
      scheduleNode(edge.sub);
      edge = edge.nextSub;
    }
    if (raFID === null && !isBatching) {
      raFID = nextTick(flush);
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
          if (handler) {
            minDirtyDepth = Infinity;
            maxDirtyDepth = -1;
            handler(err);
            return;
          }
          minDirtyDepth = Infinity;
          maxDirtyDepth = -1;
          throw err;
        }
      } else {
        if (node.type === NODE_TYPE_COMPUTE) executeCompute(node);
        else if (node.type === NODE_TYPE_EFFECT) executeEffect(node);
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
  if (currentTrackingNode !== null && currentTrackingNode !== node) {
    const trk = currentTrackingNode;
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
  let edge = node.subsHead;
  while (edge !== null) {
    scheduleNode(edge.sub);
    edge = edge.nextSub;
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
    let edge = node.depsHead;
    while (edge !== null) {
      const nextEdge = edge.nextDep;
      unlinkEdge(edge);
      edge = nextEdge;
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
    let subEdge = node.subsHead;
    node.subsHead = null;
    while (subEdge !== null) {
      const next = subEdge.nextSub;
      if (!destroying || !subEdge.sub || !destroying.has(subEdge.sub.id)) {
        unlinkEdge(subEdge);
      }
      subEdge = next;
    }
    let depEdge = node.depsHead;
    node.depsHead = null;
    while (depEdge !== null) {
      const next = depEdge.nextDep;
      if (!destroying || !depEdge.dep || !destroying.has(depEdge.dep.id)) {
        unlinkEdge(depEdge);
      }
      depEdge = next;
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
      let isPureMove = true;
      const diffCount = endDiff - startDiff + 1;
      MAP_KEYS_CACHE.length = 0;
      MAP_ENTITY_SET.clear();
      for (let i = startDiff; i <= endDiff; i++) {
        const key = keyFn(list[i]);
        MAP_KEYS_CACHE.push(key);
        MAP_ENTITY_SET.add(key);
      }
      for (let i = startDiff; i <= endDiff; i++) {
        const prevItem = prevList[i];
        if (prevItem === void 0 || !MAP_ENTITY_SET.has(keyFn(prevItem))) {
          isPureMove = false;
          break;
        }
      }
      if (isPureMove) {
        MAP_TEMP_CACHES.clear();
        try {
          for (let i = startDiff; i <= endDiff; i++) {
            const prevKey = keyFn(prevList[i]);
            MAP_TEMP_CACHES.set(prevKey, entityCache.get(prevKey));
            entityCache.delete(prevKey);
          }
          for (let i = startDiff; i <= endDiff; i++) {
            const cacheIndex = i - startDiff;
            const newKey = MAP_KEYS_CACHE[cacheIndex];
            const cache = MAP_TEMP_CACHES.get(newKey);
            if (cache) {
              if (cache.indexNode.value !== i) {
                write(cache.indexNode, i);
              }
              entityCache.set(newKey, cache);
            }
          }
        } finally {
          MAP_TEMP_CACHES.clear();
          MAP_KEYS_CACHE.length = 0;
        }
        prevList = list.slice();
        return;
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
  while (target && target !== document.body) {
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
export {
  DataSystem,
  DestructionSystem,
  N,
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
  handleDelegatedEvent,
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
