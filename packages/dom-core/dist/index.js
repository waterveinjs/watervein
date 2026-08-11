// src/index.ts
import { createEffect as createEffect2, getCurrentEntityId, read as read2, untrack as untrack2 } from "@watervein/core";

// src/base.ts
import {
  read,
  createEffect,
  createCompute,
  matchEntity,
  DestructionSystem,
  write,
  createEntity,
  withEntity,
  createState,
  untrack
} from "@watervein/core";

// src/internal.ts
var wvLeaveKey = /* @__PURE__ */ Symbol("__wv_leave");

// src/base.ts
function Show(condition, thenFn, elseFn) {
  const marker = document.createTextNode("");
  const wrapper = document.createElement("span");
  wrapper.style.display = "contents";
  wrapper.appendChild(marker);
  const conditionNode = typeof condition === "function" ? createCompute(condition) : condition;
  let currentDOM = null;
  const cleanupCurrentDOM = () => {
    if (currentDOM) {
      const dom = currentDOM;
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
    elseFn ? () => {
      cleanupCurrentDOM();
      currentDOM = elseFn();
      marker.before(currentDOM);
    } : () => {
      cleanupCurrentDOM();
    }
  );
  return wrapper;
}
function getLIS(arr, len) {
  const p = arr.slice();
  const result = [];
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
        c = u + v >> 1;
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
var CACHE_POOL_A = [];
var CACHE_POOL_B = [];
var KEY_INDEX_MAP_POOL = [];
var SOURCE_BUFFER_POOL = [];
var NEXT_KEYS_BUFFER_POOL = [];
var CACHE_ACTIVE_IS_A = [];
function getBuffers(depth) {
  if (!CACHE_POOL_A[depth]) {
    CACHE_POOL_A[depth] = /* @__PURE__ */ new Map();
    CACHE_POOL_B[depth] = /* @__PURE__ */ new Map();
    CACHE_ACTIVE_IS_A[depth] = true;
    KEY_INDEX_MAP_POOL[depth] = /* @__PURE__ */ new Map();
    SOURCE_BUFFER_POOL[depth] = [];
    NEXT_KEYS_BUFFER_POOL[depth] = [];
  }
  const activeIsA = CACHE_ACTIVE_IS_A[depth];
  return {
    // 現在使われているキャッシュ（前回の結果）
    currentCache: activeIsA ? CACHE_POOL_A[depth] : CACHE_POOL_B[depth],
    // 今回書き込む先（前回のnext = 前々回のcurrent、再利用してclearするだけ）
    nextCache: activeIsA ? CACHE_POOL_B[depth] : CACHE_POOL_A[depth],
    keyIndexMap: KEY_INDEX_MAP_POOL[depth],
    sourceBuffer: SOURCE_BUFFER_POOL[depth],
    nextKeysBuffer: NEXT_KEYS_BUFFER_POOL[depth]
  };
}
function swapBuffers(depth) {
  CACHE_ACTIVE_IS_A[depth] = !CACHE_ACTIVE_IS_A[depth];
}
var callDepth = 0;
function For(listNode, keyFn, renderFn) {
  const marker = document.createComment("wv-for");
  let isInitial = true;
  let initialFragment = document.createDocumentFragment();
  let oldKeys = [];
  let oldLen = 0;
  let entityCache = /* @__PURE__ */ new Map();
  createEffect(() => {
    const depth = callDepth++;
    const {
      nextCache: NEXT_CACHE,
      // 今回書き込む先
      keyIndexMap: KEY_INDEX_MAP_BUFFER,
      sourceBuffer: SOURCE_BUFFER_BASE,
      nextKeysBuffer: NEXT_KEYS_BUFFER_BASE
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
          let dom;
          let itemNode;
          withEntity(entityId, () => {
            itemNode = createState(item);
            dom = renderFn(() => read(itemNode));
          });
          newCache.set(key, { entityId, dom, itemNode });
        }
      }
      const toDestroyImmediate = [];
      for (const [key, entry] of entityCache) {
        if (!newCache.has(key)) {
          const dom = entry.dom;
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
          initialFragment.appendChild(newCache.get(newKeys[i]).dom);
        }
        initialFragment.appendChild(marker);
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
              source[keyIndexMap.get(oldKey) - start] = i;
            }
          }
          const lis = getLIS(source, count);
          let lisIdx = lis.length - 1;
          let anchor = newEnd + 1 < newLen ? newCache.get(newKeys[newEnd + 1]).dom : marker;
          for (let i = count - 1; i >= 0; i--) {
            const key = newKeys[start + i];
            const entry = newCache.get(key);
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
  return res;
}

// src/mount.ts
var mount = (target, rootElement) => target.appendChild(rootElement);
var mountToBody = (rootElement) => document.body.appendChild(rootElement);
var mountToHead = (rootElement) => document.head.appendChild(rootElement);
var mountToRoot = (rootElement) => document.documentElement.appendChild(rootElement);

// src/unmount.ts
import { DestructionSystem as DestructionSystem2 } from "@watervein/core";
var elementEntityMap = /* @__PURE__ */ new WeakMap();
var registerEntityElement = (element2, entityId) => {
  elementEntityMap.set(element2, entityId);
};
var unmount = (target) => {
  let entityId = null;
  let elementToRemove = null;
  if (typeof target === "number") {
    entityId = target;
  } else {
    elementToRemove = target;
    entityId = elementEntityMap.get(target) ?? null;
  }
  if (elementToRemove) {
    elementToRemove.remove();
    elementEntityMap.delete(elementToRemove);
  }
  if (entityId !== null) {
    DestructionSystem2.destroyEntity(entityId);
  }
};

// src/index.ts
var WV_NODE_TAG = 1465273924;
function isWvNode(val) {
  return val !== null && typeof val === "object" && val.__wv === WV_NODE_TAG;
}
function element(tag, props, children) {
  const el = document.createElement(tag);
  if (props) {
    const keys = Object.keys(props);
    const len = keys.length;
    for (let i = 0; i < len; i++) {
      const key = keys[i];
      const value = props[key];
      if (key.startsWith("on")) {
        if (!el.hasAttribute("data-wv-eid")) {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        }
      } else if (key === "class" || key === "className") {
        if (value != null) applyReactiveClass(el, value);
      } else if (key === "style") {
        if (value != null) {
          if (typeof value === "function" || isWvNode(value)) {
            createEffect2(() => {
              el.style.cssText = String(isWvNode(value) ? read2(value) : value());
            });
          } else if (typeof value === "object") {
            applyReactiveStyle(el, value);
          } else {
            el.style.cssText = String(value);
          }
        }
      } else if (typeof value === "function" || isWvNode(value)) {
        createEffect2(() => {
          const evaluated = isWvNode(value) ? read2(value) : value();
          if (evaluated != null) {
            el[key] = evaluated;
          } else {
            el.removeAttribute(key);
          }
        });
      } else if (value != null) {
        el[key] = value;
      }
    }
    if ("ref" in props && typeof props.ref === "function") {
      const cleanup = untrack2(() => props.ref(el));
      if (typeof cleanup === "function" && getCurrentEntityId() !== null) {
        createEffect2(() => cleanup);
      }
    }
  }
  if (children !== void 0) {
    if (Array.isArray(children)) {
      const len = children.length;
      if (len > 1) {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < len; i++) {
          appendChild(fragment, children[i]);
        }
        el.appendChild(fragment);
      } else if (len === 1) {
        appendChild(el, children[0]);
      }
    } else {
      appendChild(el, children);
    }
  }
  return el;
}
function appendChild(parent, child) {
  if (typeof child === "function" || isWvNode(child)) {
    const textNode = document.createTextNode("");
    parent.appendChild(textNode);
    createEffect2(() => {
      textNode.nodeValue = String(isWvNode(child) ? read2(child) : child());
    });
  } else if (child instanceof Node) {
    parent.appendChild(child);
  } else if (child !== null && child !== void 0) {
    parent.appendChild(document.createTextNode(String(child)));
  }
}
function applyReactiveStyle(el, styleObj) {
  const styleKeys = Object.keys(styleObj);
  const sLen = styleKeys.length;
  const elStyle = el.style;
  for (let j = 0; j < sLen; j++) {
    const styleKey = styleKeys[j];
    const styleValue = styleObj[styleKey];
    if (styleValue === void 0 || styleValue === null) continue;
    if (typeof styleValue === "function" || isWvNode(styleValue)) {
      createEffect2(() => {
        const computedValue = String(isWvNode(styleValue) ? read2(styleValue) : styleValue());
        if (styleKey.startsWith("--")) {
          el.style.setProperty(styleKey, computedValue);
        } else {
          elStyle[styleKey] = computedValue;
        }
      });
    } else {
      const staticValue = String(styleValue);
      if (styleKey.startsWith("--")) {
        el.style.setProperty(styleKey, staticValue);
      } else {
        elStyle[styleKey] = staticValue;
      }
    }
  }
}
function applyReactiveClass(el, classVal) {
  if (typeof classVal === "function" || isWvNode(classVal)) {
    createEffect2(() => {
      el.className = String(isWvNode(classVal) ? read2(classVal) : classVal());
    });
  } else if (typeof classVal === "object" && !Array.isArray(classVal)) {
    const classKeys = Object.keys(classVal);
    const cLen = classKeys.length;
    for (let j = 0; j < cLen; j++) {
      const className = classKeys[j];
      const condition = classVal[className];
      if (typeof condition === "function" || isWvNode(condition)) {
        createEffect2(() => {
          const isTrue = isWvNode(condition) ? read2(condition) : condition();
          if (isTrue) el.classList.add(className);
          else el.classList.remove(className);
        });
      } else if (condition) {
        el.classList.add(className);
      }
    }
  } else if (Array.isArray(classVal)) {
    const aLen = classVal.length;
    for (let j = 0; j < aLen; j++) {
      const item = classVal[j];
      if (typeof item === "function" || isWvNode(item)) {
        let previousClass = "";
        createEffect2(() => {
          const res = isWvNode(item) ? read2(item) : item();
          const newClass = res ? String(res).trim() : "";
          if (previousClass && previousClass !== newClass) {
            el.classList.remove(previousClass);
          }
          if (newClass) {
            el.classList.add(newClass);
          }
          previousClass = newClass;
        });
      } else if (item) {
        el.classList.add(item);
      }
    }
  } else {
    el.className = classVal;
  }
}
export {
  For,
  Show,
  element,
  mount,
  mountToBody,
  mountToHead,
  mountToRoot,
  registerEntityElement,
  unmount
};
