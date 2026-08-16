import {
    Node as WvNode
} from '@watervein/core';
import { 
    element as el0,
    ReactiveStyle as Style0,
    ReactiveProps as CoreProps,
    BaseReactiveProps
} from '@watervein/dom-core';

export type Dsl1Value<T> = T | WvNode<T>;
export type Dsl1Style = { [K in keyof Style0]?: Style0[K] | WvNode<any>; };

export type Dsl1Props = BaseReactiveProps & {
    style?: Dsl1Style | WvNode<string> | (() => string);
};

export type Dsl1Child = Node | string | number | WvNode<any> | (() => any);

export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: Dsl1Props,
    children?: Dsl1Child | Dsl1Child[]
): HTMLElementTagNameMap[K] {
    return el0(tag, props as CoreProps, children as any) as HTMLElementTagNameMap[K];
}
