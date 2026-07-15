// src/index.ts
import {
  Show as show0,
  For as for0
} from "@watervein/dom-core";
import { mount, mountToBody, mountToHead, mountToRoot } from "@watervein/dom-core";

// src/base.ts
import {
  isNode,
  read,
  getCurrentEntityId,
  handleDelegatedEvent,
  eventRegistry
} from "@watervein/core";
import {
  element as el0
} from "@watervein/dom-core";
function element(tag, props, children) {
  const el = el0(tag, props, children);
  if (props) {
    const keys = Object.keys(props);
    const len = keys.length;
    const entityId = getCurrentEntityId();
    for (let i2 = 0; i2 < len; i2++) {
      const key = keys[i2];
      const value = props[key];
      if (key.startsWith("on") && typeof value === "function") {
        const eventName = key.slice(2).toLowerCase();
        if (entityId !== null) {
          if (!eventRegistry.has(eventName)) {
            eventRegistry.set(eventName, /* @__PURE__ */ new Map());
            document.body.addEventListener(eventName, handleDelegatedEvent);
          }
          eventRegistry.get(eventName).set(entityId, value);
          el.setAttribute("data-wv-eid", String(entityId));
        } else {
          el.addEventListener(eventName, value);
        }
      } else if (key === "style" && value) {
        if (isNode(value)) {
          props[key] = (() => read(value));
        }
      } else if ((key === "class" || key === "className") && value) {
        props[key] = parseDsl1Class(value);
      }
    }
  }
  return el;
}
function parseDsl1Class(classVal) {
  if (isNode(classVal)) return classVal;
  if (typeof classVal === "object" && !Array.isArray(classVal)) {
    return classVal;
  }
  if (Array.isArray(classVal)) {
    return classVal;
  }
  return classVal;
}

// src/elements.ts
var a = (...[props, children]) => element("a", props, children);
var abbr = (...[props, children]) => element("abbr", props, children);
var address = (...[props, children]) => element("address", props, children);
var area = (...[props, children]) => element("area", props, children);
var article = (...[props, children]) => element("article", props, children);
var aside = (...[props, children]) => element("aside", props, children);
var audio = (...[props, children]) => element("audio", props, children);
var b = (...[props, children]) => element("b", props, children);
var base = (...[props, children]) => element("base", props, children);
var bdi = (...[props, children]) => element("bdi", props, children);
var bdo = (...[props, children]) => element("bdo", props, children);
var blockquote = (...[props, children]) => element("blockquote", props, children);
var body = (...[props, children]) => element("body", props, children);
var br = (...[props, children]) => element("br", props, children);
var button = (...[props, children]) => element("button", props, children);
var canvas = (...[props, children]) => element("canvas", props, children);
var caption = (...[props, children]) => element("caption", props, children);
var cite = (...[props, children]) => element("cite", props, children);
var code = (...[props, children]) => element("code", props, children);
var col = (...[props, children]) => element("col", props, children);
var colgroup = (...[props, children]) => element("colgroup", props, children);
var data = (...[props, children]) => element("data", props, children);
var datalist = (...[props, children]) => element("datalist", props, children);
var dd = (...[props, children]) => element("dd", props, children);
var del = (...[props, children]) => element("del", props, children);
var details = (...[props, children]) => element("details", props, children);
var dfn = (...[props, children]) => element("dfn", props, children);
var dialog = (...[props, children]) => element("dialog", props, children);
var div = (...[props, children]) => element("div", props, children);
var dl = (...[props, children]) => element("dl", props, children);
var dt = (...[props, children]) => element("dt", props, children);
var em = (...[props, children]) => element("em", props, children);
var embed = (...[props, children]) => element("embed", props, children);
var fieldset = (...[props, children]) => element("fieldset", props, children);
var figcaption = (...[props, children]) => element("figcaption", props, children);
var figure = (...[props, children]) => element("figure", props, children);
var footer = (...[props, children]) => element("footer", props, children);
var form = (...[props, children]) => element("form", props, children);
var h1 = (...[props, children]) => element("h1", props, children);
var h2 = (...[props, children]) => element("h2", props, children);
var h3 = (...[props, children]) => element("h3", props, children);
var h4 = (...[props, children]) => element("h4", props, children);
var h5 = (...[props, children]) => element("h5", props, children);
var h6 = (...[props, children]) => element("h6", props, children);
var head = (...[props, children]) => element("head", props, children);
var header = (...[props, children]) => element("header", props, children);
var hgroup = (...[props, children]) => element("hgroup", props, children);
var hr = (...[props, children]) => element("hr", props, children);
var html = (...[props, children]) => element("html", props, children);
var i = (...[props, children]) => element("i", props, children);
var iframe = (...[props, children]) => element("iframe", props, children);
var img = (...[props, children]) => element("img", props, children);
var input = (...[props, children]) => element("input", props, children);
var ins = (...[props, children]) => element("ins", props, children);
var kbd = (...[props, children]) => element("kbd", props, children);
var label = (...[props, children]) => element("label", props, children);
var legend = (...[props, children]) => element("legend", props, children);
var li = (...[props, children]) => element("li", props, children);
var link = (...[props, children]) => element("link", props, children);
var main = (...[props, children]) => element("main", props, children);
var map = (...[props, children]) => element("map", props, children);
var mark = (...[props, children]) => element("mark", props, children);
var menu = (...[props, children]) => element("menu", props, children);
var meta = (...[props, children]) => element("meta", props, children);
var meter = (...[props, children]) => element("meter", props, children);
var nav = (...[props, children]) => element("nav", props, children);
var noscript = (...[props, children]) => element("noscript", props, children);
var object = (...[props, children]) => element("object", props, children);
var ol = (...[props, children]) => element("ol", props, children);
var optgroup = (...[props, children]) => element("optgroup", props, children);
var option = (...[props, children]) => element("option", props, children);
var output = (...[props, children]) => element("output", props, children);
var p = (...[props, children]) => element("p", props, children);
var picture = (...[props, children]) => element("picture", props, children);
var pre = (...[props, children]) => element("pre", props, children);
var progress = (...[props, children]) => element("progress", props, children);
var q = (...[props, children]) => element("q", props, children);
var rp = (...[props, children]) => element("rp", props, children);
var rt = (...[props, children]) => element("rt", props, children);
var ruby = (...[props, children]) => element("ruby", props, children);
var s = (...[props, children]) => element("s", props, children);
var samp = (...[props, children]) => element("samp", props, children);
var script = (...[props, children]) => element("script", props, children);
var search = (...[props, children]) => element("search", props, children);
var section = (...[props, children]) => element("section", props, children);
var select = (...[props, children]) => element("select", props, children);
var slot = (...[props, children]) => element("slot", props, children);
var small = (...[props, children]) => element("small", props, children);
var source = (...[props, children]) => element("source", props, children);
var span = (...[props, children]) => element("span", props, children);
var strong = (...[props, children]) => element("strong", props, children);
var style = (...[props, children]) => element("style", props, children);
var sub = (...[props, children]) => element("sub", props, children);
var summary = (...[props, children]) => element("summary", props, children);
var sup = (...[props, children]) => element("sup", props, children);
var table = (...[props, children]) => element("table", props, children);
var tbody = (...[props, children]) => element("tbody", props, children);
var td = (...[props, children]) => element("td", props, children);
var template = (...[props, children]) => element("template", props, children);
var textarea = (...[props, children]) => element("textarea", props, children);
var tfoot = (...[props, children]) => element("tfoot", props, children);
var th = (...[props, children]) => element("th", props, children);
var thead = (...[props, children]) => element("thead", props, children);
var time = (...[props, children]) => element("time", props, children);
var title = (...[props, children]) => element("title", props, children);
var tr = (...[props, children]) => element("tr", props, children);
var track = (...[props, children]) => element("track", props, children);
var u = (...[props, children]) => element("u", props, children);
var ul = (...[props, children]) => element("ul", props, children);
var variable = (...[props, children]) => element("var", props, children);
var video = (...[props, children]) => element("video", props, children);
var wbr = (...[props, children]) => element("wbr", props, children);

// src/errorBoundary.ts
import {
  createEntity,
  withEntity,
  createState,
  read as read2,
  write,
  registerErrorBoundary,
  DestructionSystem
} from "@watervein/core";
function errorBoundary(normalFactory, fallbackFactory) {
  const boundaryEntityId = createEntity();
  return withEntity(boundaryEntityId, () => {
    const errorState = createState(null);
    const wrapper = document.createElement("div");
    wrapper.style.display = "contents";
    let currentChildEntityId = null;
    const renderBranch = () => {
      if (currentChildEntityId !== null) {
        DestructionSystem.destroyEntity(currentChildEntityId);
        wrapper.innerHTML = "";
      }
      const currentError = read2(errorState);
      const newEntityId = createEntity();
      currentChildEntityId = newEntityId;
      withEntity(newEntityId, () => {
        let childDOM;
        if (currentError) {
          childDOM = fallbackFactory(currentError);
        } else {
          childDOM = normalFactory();
        }
        wrapper.appendChild(childDOM);
      });
    };
    registerErrorBoundary(boundaryEntityId, (err) => {
      write(errorState, err);
      renderBranch();
    });
    renderBranch();
    return wrapper;
  });
}

// src/scope.ts
import { createEntity as createEntity2, withEntity as withEntity2 } from "@watervein/core";

// src/gc.ts
import { DestructionSystem as DestructionSystem2 } from "@watervein/core";
var domToEntityMap = /* @__PURE__ */ new WeakMap();
var isObserverActive = false;
var observer = new MutationObserver((mutations) => {
  const len = mutations.length;
  for (let i2 = 0; i2 < len; i2++) {
    const removed = mutations[i2].removedNodes;
    const rLen = removed.length;
    for (let j = 0; j < rLen; j++) {
      const node = removed[j];
      if (node instanceof HTMLElement || node && node.nodeType === 1) {
        checkAndCleanup(node);
      }
    }
  }
});
function registerGCEntity(el, entityId) {
  domToEntityMap.set(el, entityId);
  if (!isObserverActive && typeof document !== "undefined") {
    observer.observe(document.body || document, { childList: true, subtree: true });
    isObserverActive = true;
  }
}
function checkAndCleanup(el) {
  console.log("[gc] checkAndCleanup called", el, domToEntityMap.has(el));
  if (domToEntityMap.has(el)) {
    const entityId = domToEntityMap.get(el);
    DestructionSystem2.destroyEntity(entityId);
    domToEntityMap.delete(el);
  }
  const children = el.children;
  if (children) {
    const len = children.length;
    for (let i2 = 0; i2 < len; i2++) {
      const child = children[i2];
      if (child instanceof HTMLElement || child && child.nodeType === 1) {
        checkAndCleanup(child);
      }
    }
  }
}

// src/scope.ts
function scope(f) {
  return ((...args) => {
    const entityId = createEntity2();
    const el = withEntity2(entityId, () => f(...args));
    if (el instanceof HTMLElement) {
      registerGCEntity(el, entityId);
    }
    return el;
  });
}

// src/index.ts
function Show(condition, thenFn, elseFn) {
  return show0(condition, thenFn, elseFn);
}
function For(listNode, keyFn, renderFn, tagName = "span") {
  return for0(listNode, keyFn, renderFn, tagName);
}
export {
  For,
  Show,
  a,
  abbr,
  address,
  area,
  article,
  aside,
  audio,
  b,
  base,
  bdi,
  bdo,
  blockquote,
  body,
  br,
  button,
  canvas,
  caption,
  cite,
  code,
  col,
  colgroup,
  data,
  datalist,
  dd,
  del,
  details,
  dfn,
  dialog,
  div,
  dl,
  dt,
  element,
  em,
  embed,
  errorBoundary,
  fieldset,
  figcaption,
  figure,
  footer,
  form,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  head,
  header,
  hgroup,
  hr,
  html,
  i,
  iframe,
  img,
  input,
  ins,
  kbd,
  label,
  legend,
  li,
  link,
  main,
  map,
  mark,
  menu,
  meta,
  meter,
  mount,
  mountToBody,
  mountToHead,
  mountToRoot,
  nav,
  noscript,
  object,
  ol,
  optgroup,
  option,
  output,
  p,
  picture,
  pre,
  progress,
  q,
  rp,
  rt,
  ruby,
  s,
  samp,
  scope,
  script,
  search,
  section,
  select,
  slot,
  small,
  source,
  span,
  strong,
  style,
  sub,
  summary,
  sup,
  table,
  tbody,
  td,
  template,
  textarea,
  tfoot,
  th,
  thead,
  time,
  title,
  tr,
  track,
  u,
  ul,
  variable,
  video,
  wbr
};
