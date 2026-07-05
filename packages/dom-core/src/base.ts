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
    renderFn: (getItem: () => T) => HTMLElement
): HTMLElement {
    const marker = document.createTextNode("");
    const wrapper = document.createElement("span");
    wrapper.style.display = "contents";
    wrapper.appendChild(marker);

    let entityCache = new Map<any, { entityId: number; itemNode: WvNode<T>; dom: HTMLElement }>();
    let oldKeys: (any | null)[] = [];

    createEffect(() => {
        const list = read(listNode);
        const newLen = list.length;
        const oldLen = oldKeys.length;

        const newKeys: any[] = new Array(newLen);
        const newCache = new Map<any, { entityId: number; itemNode: WvNode<T>; dom: HTMLElement }>();

        for (let i = 0; i < newLen; i++) {
            const item = list[i];
            const key = keyFn(item);
            newKeys[i] = key;

            const cached = entityCache.get(key);
            if (cached) {
                write(cached.itemNode, item);
                newCache.set(key, cached);
            } else {
                const entityId = createEntity();
                let dom!: HTMLElement;
                let itemNode!: WvNode<T>;
                withEntity(entityId, () => {
                    itemNode = createState(item);
                    dom = renderFn(() => read(itemNode));
                });
                newCache.set(key, { entityId, itemNode, dom });
            }
        }

        if (oldLen > 0) {
            const toDestroy: number[] = [];
            for (let i = 0; i < oldLen; i++) {
                const oldKey = oldKeys[i];
                if (oldKey !== null && !newCache.has(oldKey)) {
                    const cached = entityCache.get(oldKey)!;
                    toDestroy.push(cached.entityId);
                    cached.dom.remove();
                }
            }
            if (toDestroy.length > 0) DestructionSystem.destroyEntities(toDestroy);
        }

        const oldKeyToIdx = new Map<any, number>();
        for (let i = 0; i < oldLen; i++) {
            const k = oldKeys[i];
            if (k !== null) oldKeyToIdx.set(k, i);
        }

        let oldStartIdx = 0, newStartIdx = 0;
        let oldEndIdx = oldLen - 1, newEndIdx = newLen - 1;

        const anchorFor = (nextKey: any) =>
            nextKey !== undefined ? (newCache.get(nextKey)?.dom ?? marker) : marker;

        while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
            const oldStartKey = oldKeys[oldStartIdx];
            const newStartKey = newKeys[newStartIdx];
            const oldEndKey = oldKeys[oldEndIdx];
            const newEndKey = newKeys[newEndIdx];

            if (oldStartKey === null) { oldStartIdx++; }
            else if (oldEndKey === null) { oldEndIdx--; }
            else if (oldStartKey === newStartKey) { oldStartIdx++; newStartIdx++; }
            else if (oldEndKey === newEndKey) { oldEndIdx--; newEndIdx--; }
            else if (oldStartKey === newEndKey) {
                const cached = entityCache.get(oldStartKey)!;
                wrapper.insertBefore(cached.dom, anchorFor(newKeys[newEndIdx + 1]));
                oldStartIdx++; newEndIdx--;
            }
            else if (oldEndKey === newStartKey) {
                const cached = entityCache.get(oldEndKey)!;
                wrapper.insertBefore(cached.dom, entityCache.get(oldStartKey)!.dom);
                oldEndIdx--; newStartIdx++;
            }
            else {
                const oldIdx = oldKeyToIdx.get(newStartKey);
                if (oldIdx !== undefined) {
                    const cached = entityCache.get(newStartKey)!;
                    oldKeys[oldIdx] = null;
                    wrapper.insertBefore(cached.dom, entityCache.get(oldStartKey)!.dom);
                } else {
                    const newCached = newCache.get(newStartKey)!;
                    wrapper.insertBefore(newCached.dom, entityCache.get(oldStartKey)!.dom);
                }
                newStartIdx++;
            }
        }

        if (newStartIdx <= newEndIdx) {
            for (let i = newStartIdx; i <= newEndIdx; i++) {
                const newCached = newCache.get(newKeys[i])!;
                wrapper.insertBefore(newCached.dom, anchorFor(newKeys[newEndIdx + 1]));
            }
        }

        entityCache = newCache;
        oldKeys = newKeys;
    });

    return wrapper;
}