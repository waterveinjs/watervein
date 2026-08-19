import { createState, read, UISystem } from '@watervein/core';
import { h1, p } from '@watervein/dom';
import { mountToBody, For } from '@watervein/dom-core';

const message = createState("Hello, Watervein World!");

const app = element("div", { class: "hello-container" }, [
    h1({}, () => read(message)),
    p({}, "No components. No virtual DOM. Just pure data flow.")
]);

mountToBody(app);
UISystem.flush();