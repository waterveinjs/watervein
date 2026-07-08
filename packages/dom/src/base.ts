import {
    Node as WvNode,
    isNode,
    read
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
    if (props) {
        const keys = Object.keys(props);
        const len = keys.length;
        
        for (let i = 0; i < len; i++) {
            const key = keys[i];
            const value = props[key];

           if (key === "style" && value) {
                if (isNode(value)) {
                    const node = value as WvNode<string>;
                    props[key] = (() => read(node)) as any;
                } else if (typeof value === "object") {
                    continue;
                }
            } 
            else if ((key === "class" || key === "className") && value) {
                props[key] = parseDsl1Class(value);
            }
        }
    }
    return el0(tag, props as any, children as any);
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