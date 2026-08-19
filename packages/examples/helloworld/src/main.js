import { createState, read, UISystem } from '@watervein/core';
import { mountToHead, mountToBody } from '@watervein/dom-core';
import { meta, title, link, div, h1, p } from '@watervein/dom';

if (import.meta.env.VITE_STYLE_MODE === 'less') {
  import('../style.less');
} else {
  import('../style.css');
}

const headElements = [
  meta({ charset: "UTF-8" }),
  meta({ name: "viewport", content: "width=device-width, initial-scale=1.0" }),
  title({}, "Watervein Playground - Hello World"),
];

headElements.forEach(node => mountToHead(node));

const message = createState("Hello, Watervein World!");

const app = div({ class: "hello-container" }, [
  h1({}, () => read(message)),
  p({}, "No components. No virtual DOM. Just pure data flow.")
]);

mountToBody(app);
UISystem.flush();