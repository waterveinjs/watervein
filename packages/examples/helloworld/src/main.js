import { createState, read, UISystem } from '@watervein/core';
import { element, mountToBody, For } from '@watervein/dom-core';

const message = createState("Hello, Watervein World!");

const app = element("div", { class: "hello-container" }, [
    element("h1", {}, () => read(message)),
    element("p", {}, "No components. No virtual DOM. Just pure data flow.")
]);

mountToBody(app);
UISystem.flush();