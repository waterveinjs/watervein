import { createState, read, UISystem } from '@watervein/core';
import { mountToBody } from '@watervein/dom-core';
import { div, h1, p } from '@watervein/dom';

const title = createState("Hello, Watervein World!");

const app = div({ class: "hello-container" }, [
  h1({}, () => read(title)),
  p({}, "No components. No virtual DOM. Just pure data flow.")
]);

mountToBody(app);
UISystem.flush();