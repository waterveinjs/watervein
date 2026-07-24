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
  matchEntity(
    conditionNode,
    () => {
      const prev = marker.previousElementSibling;
      if (prev) prev.remove();
      currentDOM = thenFn();
      marker.before(currentDOM);
    },
    elseFn ? () => {
      const prev = marker.previousElementSibling;
      if (prev) prev.remove();
      currentDOM = elseFn();
      marker.before(currentDOM);
    } : () => {
      if (currentDOM) {
        currentDOM.remove();
        currentDOM = null;
      }
    }
  );
  return wrapper;
}
function getLIS(arr) {
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
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
}
function For(listNode, keyFn, renderFn, tagName = "span") {
  const marker = document.createTextNode("");
  const wrapper = document.createElement(tagName);
  if (tagName === "span") {
    wrapper.style.display = "contents";
  }
  wrapper.appendChild(marker);
  let oldKeys = [];
  let entityCache = /* @__PURE__ */ new Map();
  const toDestroy = [];
  createEffect(() => {
    const list = read(listNode);
    const newLen = list.length;
    const oldLen = oldKeys.length;
    const newCache = /* @__PURE__ */ new Map();
    const newKeys = new Array(newLen);
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
        let dom;
        let itemNode;
        withEntity(entityId, () => {
          itemNode = createState(item);
          dom = renderFn(() => read(itemNode));
        });
        newCache.set(key, { entityId, dom, itemNode });
      }
    }
    toDestroy.length = 0;
    for (const [key, entry] of entityCache) {
      if (!newCache.has(key)) {
        toDestroy.push(entry.entityId);
        const dom = entry.dom;
        if (dom[wvLeaveKey]) {
          dom[wvLeaveKey](() => dom.remove());
        } else {
          dom.remove();
        }
      }
    }
    if (toDestroy.length > 0) {
      DestructionSystem.destroyEntities(toDestroy);
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
      const source = new Array(count).fill(-1);
      const keyIndexMap = /* @__PURE__ */ new Map();
      for (let i = start; i <= newEnd; i++) {
        keyIndexMap.set(newKeys[i], i);
      }
      for (let i = start; i <= oldEnd; i++) {
        const oldKey = oldKeys[i];
        if (keyIndexMap.has(oldKey)) {
          const newIdx = keyIndexMap.get(oldKey);
          source[newIdx - start] = i;
        }
      }
      const lis = getLIS(source);
      let lisIdx = lis.length - 1;
      let anchor = newEnd + 1 < newLen ? newCache.get(newKeys[newEnd + 1]).dom : marker;
      for (let i = count - 1; i >= 0; i--) {
        const currentIndex = start + i;
        const key = newKeys[currentIndex];
        const entry = newCache.get(key);
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
      if (key[0] === "o" && key[1] === "n") {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "style" && value) {
        if (isWvNode(value)) {
          createEffect2(() => {
            el.style.cssText = String(read2(value));
          });
        } else if (typeof value === "object") applyReactiveStyle(el, value);
        else if (typeof value === "function") {
          createEffect2(() => {
            el.style.cssText = String(value());
          });
        }
      } else if ((key === "class" || key === "className") && value) {
        applyReactiveClass(el, value);
      } else if (typeof value === "function" || isWvNode(value)) {
        createEffect2(() => {
          const evaluated = isWvNode(value) ? read2(value) : value();
          if (evaluated !== void 0 && evaluated !== null) {
            if (key in el && !(key === "list" || key === "form")) {
              el[key] = evaluated;
            } else {
              el.setAttribute(key, String(evaluated));
            }
          } else {
            el.removeAttribute(key);
          }
        });
      } else if (value !== void 0 && value !== null) {
        if (key in el && !(key === "list" || key === "form")) {
          el[key] = value;
        } else {
          el.setAttribute(key, String(value));
        }
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
      for (let i = 0; i < len; i++) {
        appendChild(el, children[i]);
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
  } else if (child instanceof HTMLElement || child instanceof Text) {
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
        if (styleKey[0] === "-" && styleKey[1] === "-") {
          el.style.setProperty(styleKey, computedValue);
        } else {
          elStyle[styleKey] = computedValue;
        }
      });
    } else {
      const staticValue = String(styleValue);
      if (styleKey[0] === "-" && styleKey[1] === "-") {
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
