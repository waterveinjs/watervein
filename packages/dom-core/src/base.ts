import {
    read,
    createEffect,
    createCompute,
    matchEntity,
    Node as WvNode,
    DestructionSystem,
    write,
    createEntity,
    withEntity,
    createState,
    untrack
} from '@watervein/core';

export function Show(
    condition: WvNode | (() => boolean),
    thenFn: () => HTMLElement,
    elseFn?: () => HTMLElement
): HTMLElement {
    const marker = document.createTextNode("");
    const wrapper = document.createElement("span");
    wrapper.style.display = "contents";
    wrapper.appendChild(marker);

    const conditionNode: WvNode =
        typeof condition === "function" ? createCompute(condition) : condition;

    let currentDOM: HTMLElement | null = null;

    matchEntity(
        conditionNode,
        () => {
            const prev = marker.previousElementSibling;
            if (prev) prev.remove();
            currentDOM = thenFn();
            marker.before(currentDOM);
        },
        elseFn
            ? () => {
                  const prev = marker.previousElementSibling;
                  if (prev) prev.remove();
                  currentDOM = elseFn();
                  marker.before(currentDOM);
              }
            : () => {
                  if (currentDOM) {
                      currentDOM.remove();
                      currentDOM = null;
                  }
              }
    );

    return wrapper;
}

export function For<T>(
    listNode: WvNode<T[]>,
    keyFn: (item: T) => any,
    renderFn: (getItem: () => T) => HTMLElement,
    tagName: string = "span"
): HTMLElement {
    const marker = document.createTextNode("");
    const wrapper = document.createElement(tagName);
    if (tagName === "span") {
        wrapper.style.display = "contents";
    }
    wrapper.appendChild(marker);

    type Entry = {
        entityId: number;
        dom: HTMLElement;
        itemNode: WvNode<T>;
    };

    let entityCache = new Map<any, Entry>();
    const toDestroy: number[] = [];

    createEffect(() => {
        const list = read(listNode);
        const len = list.length;

        const newCache = new Map<any, Entry>();
       
        for (let i = 0; i < len; i++) {
            const item = list[i];
            const key = keyFn(item);
            const cached = entityCache.get(key);

            if (cached) {
                untrack(() => {
                    write(cached.itemNode, item);
                });
                newCache.set(key, cached);
            } else {
                const entityId = createEntity();
                let dom!: HTMLElement;
                let itemNode!: WvNode<T>;

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
                entry.dom.remove();
            }
        }
        if (toDestroy.length > 0) {
            DestructionSystem.destroyEntities(toDestroy);
        }

        let anchor: Node = marker;
        for (let i = len - 1; i >= 0; i--) {
            const key = keyFn(list[i]);
            const entry = newCache.get(key);
            if (!entry) continue;

            if (entry.dom.nextSibling !== anchor) {
                wrapper.insertBefore(entry.dom, anchor);
            }
            anchor = entry.dom;
        }

        entityCache = newCache;
    });

    return wrapper;
}