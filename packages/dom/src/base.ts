import {
    Node as WvNode,
    isNode,
    read,
    getCurrentEntityId,
    handleDelegatedEvent,
    eventRegistry
} from '@watervein/core';
import { 
    element as el0,
    ReactiveStyle as Style0,
    ReactiveClass as Class0,
    ReactiveProps as CoreProps
} from '@watervein/dom-core';

export type Dsl1Value<T> = T | WvNode<T>;
export type Dsl1Style = { [K in keyof Style0]?: Style0[K] | WvNode<any>; };
export type Dsl1Class =
    | string
    | WvNode<string>
    | (() => string)
    | { [key: string]: boolean | WvNode<boolean> | (() => boolean) }
    | Array<string | WvNode<string> | (() => string)>;

export type Dsl1Props = {
    style?: Dsl1Style | WvNode<string> | (() => string);
    class?: Dsl1Class;
    className?: Dsl1Class;
    [key: string]: any;
};

export type Dsl1Child = HTMLElement | Text | string | number | WvNode<any> | (() => any);

export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: Dsl1Props,
    children?: Dsl1Child | Dsl1Child[]
): HTMLElementTagNameMap[K] {
    if (!props) {
        return el0(tag, undefined, children as any);
    }

    const coreProps: CoreProps = {};
    for (const key of Object.keys(props)) {
        const value = props[key];

        if (key === "style" && value) {
            coreProps.style = isNode(value) ? () => read(value as WvNode<string>) : value;
        } else if ((key === "class" || key === "className") && value) {
            coreProps[key] = parseDsl1Class(value);
        } else {
            coreProps[key] = value;
        }
    }

    const el = el0(tag, coreProps, children as any);

    const entityId = getCurrentEntityId();
    if (entityId !== null) {
        for (const key of Object.keys(props)) {
            const value = props[key];
            if (key.startsWith("on") && typeof value === "function") {
                const eventName = key.slice(2).toLowerCase();

                if (!eventRegistry.has(eventName)) {
                    eventRegistry.set(eventName, new Map());
                    document.body.addEventListener(eventName, handleDelegatedEvent);
                }
                eventRegistry.get(eventName)!.set(entityId, value as EventListener);
                el.setAttribute('data-wv-eid', String(entityId));
            }
        }
    }

    return el as HTMLElementTagNameMap[K];
}

function parseDsl1Class(classVal: Dsl1Class): Class0 {
    if (isNode(classVal)) {
        return () => read(classVal as WvNode<string>);
    }
    return classVal as Class0;
}