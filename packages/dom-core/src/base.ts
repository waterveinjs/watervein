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
    createState
} from '@watervein/core';

const WV_ENTITY_KEY = '__wv_entity_id__';

function associateDOMWithEntity(dom: HTMLElement, entityId: number) {
    (dom as any)[WV_ENTITY_KEY] = entityId;
}

function getDOMEntityId(dom: HTMLElement): number | undefined {
    return (dom as any)[WV_ENTITY_KEY];
}

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
            if (currentDOM) currentDOM.remove();
            currentDOM = thenFn();
            marker.before(currentDOM);
        },
        elseFn
            ? () => {
                  if (currentDOM) currentDOM.remove();
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
    renderFn: (getItem: () => T, getIndex: () => number) => HTMLElement
): HTMLElement {
    const marker = document.createTextNode("");
    const wrapper = document.createElement("span");
    wrapper.style.display = "contents";
    wrapper.appendChild(marker);

    type Entry = {
        entityId: number;
        el: HTMLElement;
        itemNode: WvNode<T>;
        indexNode: WvNode<number>;
    };
    const entryCache = new Map<any, Entry>();
    const toDestroy: number[] = [];
    const seenKeys = new Set<any>();

    createEffect(() => {
        const list = read(listNode);
        const len = list.length;

        seenKeys.clear();
        for (let i = 0; i < len; i++) {
            seenKeys.add(keyFn(list[i]));
        }

        toDestroy.length = 0;
        for (const [key, entry] of entryCache) {
            if (!seenKeys.has(key)) {
                toDestroy.push(entry.entityId);
                entry.el.remove();
                entryCache.delete(key);
            }
        }
        if (toDestroy.length > 0) {
            DestructionSystem.destroyEntities(toDestroy);
        }

        let anchor: Node = marker;
        for (let i = len - 1; i >= 0; i--) {
            const item = list[i];
            const key = keyFn(item);
            let entry = entryCache.get(key);

            if (entry) {
                write(entry.itemNode, item);
                write(entry.indexNode, i);
            } else {
                const entityId = createEntity();
                let el!: HTMLElement;
                let itemNode!: WvNode<T>;
                let indexNode!: WvNode<number>;

                withEntity(entityId, () => {
                    itemNode = createState(item);
                    indexNode = createState(i);
                    el = renderFn(() => read(itemNode), () => read(indexNode));
                });

                entry = { entityId, el, itemNode, indexNode };
                entryCache.set(key, entry);
            }

            if (entry.el.nextSibling !== anchor) {
                wrapper.insertBefore(entry.el, anchor);
            }
            anchor = entry.el;
        }
    });

    return wrapper;
}