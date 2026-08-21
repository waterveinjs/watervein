import { createState, read, write, createEntity, withEntity } from '@watervein/core';
import { mountToHead, mountToBody } from '@watervein/dom-core';
import { meta, title, button, div, h2, span } from '@watervein/dom';

/*
 * Switch Styles Dynamically
 */
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

/**
 * 
 * @param initialValue The initial value of the counter
 * @example 
 * ```javascript
 * const app = div({}, [
 *   createCounter(0), 
 *   createCounter(10) // The state of these two `createCounter` instances is maintained separately and is not shared.
 * ]);
 * ```
 * 
 * Use `createEntity` to generate a unique entity ID, and then use `withEntity` to associate it with state and elements.
 * This approach allows you to achieve state isolation similar to that of components in React.
 */
function createCounter(initialValue = 0) {
  const entityId = createEntity();

  return withEntity(entityId, () => {
    const count = createState(initialValue);

    const increment = () => {
      write(count, read(count) + 1);
    };

    const decrement = () => {
      write(count, read(count) - 1);
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