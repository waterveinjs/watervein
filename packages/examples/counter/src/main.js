import { createState, read, write, UISystem } from '@watervein/core';
import { mountToBody } from '@watervein/dom-core';
import { div, h2, button, span } from '@watervein/dom';

const createCounter = (initialValue) => {
  const count = createState(initialValue);

  const increment = () => {
    write(count, read(count) + 1);
    UISystem.flush();
  };

  const decrement = () => {
    write(count, read(count) - 1);
    UISystem.flush();
  };

  return div({
    class: "counter-box",
    style: { display: "flex", gap: "10px", alignItems: "center" }
  }, [
    button({ onclick: decrement }, "-"),
    span({}, () => `Count: ${read(count)}`),
    button({ onclick: increment }, "+")
  ]);
};

const app = div({}, [
  h2({}, "Watervein Counters"),
  createCounter(0),
  createCounter(10)
]);

mountToBody(app);
UISystem.flush();