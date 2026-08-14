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

export type Dsl1Child = Node | string | number | WvNode<any> | (() => any);

export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: Dsl1Props,
    children?: Dsl1Child | Dsl1Child[]
): HTMLElementTagNameMap[K] {
    if (!props) {
        return el0(tag, undefined, children as any);
    }

    const entityId = getCurrentEntityId();
    let hasEvent = false;

    for (const key in props) {
        if (!Object.hasOwn(props, key)) continue;
        const value = props[key];
        if (value == null) continue;

        if (key === "style") {
            if (isNode(value)) props.style = () => read(value as WvNode<string>);
        } 
        else if (key === "class" || key === "className") {
            if (isNode(value)) props[key] = () => read(value as WvNode<string>);
        } 
        else if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && typeof value === "function") {
            if (entityId !== null) {
                const eventName = key.slice(2).toLowerCase();
                let reg = eventRegistry.get(eventName);
                if (!reg) {
                    reg = new Map();
                    eventRegistry.set(eventName, reg);
                    document.addEventListener(eventName, handleDelegatedEvent);
                }
                reg.set(entityId, value as EventListener);
                hasEvent = true;
            }
        }
    }

    const el = el0(tag, props as CoreProps, children as any);

    if (hasEvent) {
        el.setAttribute('data-wv-eid', String(entityId));
    }

    return el as HTMLElementTagNameMap[K];
}

function parseDsl1Class(classVal: Dsl1Class): Class0 {
    if (isNode(classVal)) {
        return () => read(classVal as WvNode<string>);
    }
    return classVal as Class0;
}