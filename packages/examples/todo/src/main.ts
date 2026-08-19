import { createState, createCompute, read, write, batch, UISystem } from '@watervein/core';
import { For, mountToHead, mountToBody } from '@watervein/dom-core';
import { meta, title, link, input, button, div, footer, span, label, li, ul, h1 } from '@watervein/dom';

if (import.meta.env.VITE_STYLE_MODE === 'less') {
  import('../style.less');
} else {
  import('../style.css');
}

const headElements = [
  meta({ charset: "UTF-8" }),
  meta({ name: "viewport", content: "width=device-width, initial-scale=1.0" }),
  title({}, "Watervein Playground - ToDo"),
];

headElements.forEach(node => mountToHead(node));

type Todo = { id: number; text: string; completed: boolean };
type Filter = "all" | "active" | "completed";

const todos = createState<Todo[]>([
  { id: 1, text: "Learn Watervein Architecture", completed: true },
  { id: 2, text: "Build a Reactive Graph App", completed: false }
]);
const filter = createState<Filter>("all");
const newTitle = createState("");

const filteredTodos = createCompute(() => {
  const list = read(todos);
  const currentFilter = read(filter);
  if (currentFilter === "active") return list.filter(t => !t.completed);
  if (currentFilter === "completed") return list.filter(t => t.completed);
  return list;
});

const remainingCount = createCompute(() => {
  return read(todos).filter(t => !t.completed).length;
});

const addTodo = () => {
  const titleText = read(newTitle).trim();
  if (!titleText) return;

  batch(() => {
    const current = read(todos);
    write(todos, [...current, { id: Date.now(), text: titleText, completed: false }]);
    write(newTitle, ""); 
  });
  UISystem.flush();
};

const toggleTodo = (id: number) => {
  const updated = read(todos).map(t => t.id === id ? { ...t, completed: !t.completed } : t);
  write(todos, updated);
  UISystem.flush();
};

const removeTodo = (id: number) => {
  write(todos, read(todos).filter(t => t.id !== id));
  UISystem.flush();
};

const app = div({ style: { maxWidth: "400px", margin: "20px auto", fontFamily: "sans-serif" } }, [
  h1({}, "Watervein Todo"),

  div({ style: { display: "flex", gap: "8px", marginBottom: "15px" } }, [
    input({
      type: "text",
      placeholder: "What needs to be done?",
      value: () => read(newTitle),
      oninput: (e: Event) => write(newTitle, (e.target as HTMLInputElement).value)
    }),
    button({ onclick: addTodo }, "Add")
  ]),

  ul({ style: { listStyle: "none", padding: 0 } }, [
    For(
      filteredTodos,
      (item) => item.id,
      (getItem) => {
        return li({
          style: () => ({
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 0",
            textDecoration: getItem().completed ? "line-through" : "none",
            color: getItem().completed ? "#888" : "#000"
          })
        }, [
          label({ style: { cursor: "pointer" } }, [
            input({
              type: "checkbox",
              checked: () => getItem().completed,
              onchange: () => toggleTodo(getItem().id)
            }),
            () => ` ${getItem().text}`
          ]),
          button({ onclick: () => removeTodo(getItem().id) }, "✕")
        ]);
      }
    ).fragment
  ]),

  footer({ style: { display: "flex", justifyContent: "space-between", marginTop: "15px", fontSize: "14px" } }, [
    span({}, () => `${read(remainingCount)} items left`),

    div({ style: { display: "flex", gap: "5px" } }, [
      button({ onclick: () => { write(filter, "all"); UISystem.flush(); } }, "All"),
      button({ onclick: () => { write(filter, "active"); UISystem.flush(); } }, "Active"),
      button({ onclick: () => { write(filter, "completed"); UISystem.flush(); } }, "Completed")
    ])
  ])
]);

mountToBody(app);
UISystem.flush();