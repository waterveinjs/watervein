import { createState, read, write, createEntity, withEntity, UISystem } from '@watervein/core';
import { mountToHead, mountToBody, Show } from '@watervein/dom-core';
import { meta, title, link, button, div, h2, span } from '@watervein/dom';

if (import.meta.env.VITE_STYLE_MODE === 'less') {
  import('../style.less');
} else {
  import('../style.css');
}

const headElements = [
  meta({ charset: "UTF-8" }),
  meta({ name: "viewport", content: "width=device-width, initial-scale=1.0" }),
  title({}, "Watervein Playground - Counter"),
];

headElements.forEach(node => mountToHead(node));

function createCounter(initialValue = 0) {
  const entityId = createEntity();

  return withEntity(entityId, () => {
    const count = createState(initialValue);

    const increment = () => {
      write(count, read(count) + 1);
      UISystem.flush();
    };

    const decrement = () => {
      write(count, read(count) - 1);
      UISystem.flush();
    };

    return div({ class: "counter-box", style: { display: "flex", gap: "10px", alignItems: "center" } }, [
      button({ onclick: decrement }, "-"),
      span({}, () => `Count: ${read(count)}`),
      button({ onclick: increment }, "+")
    ]);
  });
}

const app = div({}, [
  h2({}, "Watervein Counters"),
  createCounter(0),
  createCounter(10)
]);

mountToBody(app);
UISystem.flush();