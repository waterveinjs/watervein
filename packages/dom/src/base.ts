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
    ReactiveClass as Class0
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
    const el = el0(tag, props as any, children as any);
    
    if (props) {
        const keys = Object.keys(props);
        const len = keys.length;
        const entityId = getCurrentEntityId();

        for (let i = 0; i < len; i++) {
            const key = keys[i];
            const value = props[key];

            if (key.startsWith("on") && typeof value === "function") {
                const eventName = key.slice(2).toLowerCase();
                
                if (entityId !== null) {
                    if (!eventRegistry.has(eventName)) {
                        eventRegistry.set(eventName, new Map());
                        document.body.addEventListener(eventName, handleDelegatedEvent);
                    }
                    eventRegistry.get(eventName)!.set(entityId, value as EventListener);
                    
                    el.setAttribute('data-wv-eid', String(entityId));
                } else {
                    el.addEventListener(eventName, value as EventListener);
                }
            }
            else if (key === "style" && value) {
                if (isNode(value)) {
                    props[key] = (() => read(value as WvNode<string>)) as any;
                }
            } else if ((key === "class" || key === "className") && value) {
                props[key] = parseDsl1Class(value);
            }
        }
    }
    return el as HTMLElementTagNameMap[K];
}

function parseDsl1Class(classVal: Dsl1Class): Class0 {
    if (isNode(classVal)) return classVal as any;
    
    if (typeof classVal === "object" && !Array.isArray(classVal)) {
        return classVal as any;
    }
    
    if (Array.isArray(classVal)) {
        return classVal as any;
    }
    
    return classVal as Class0;
}