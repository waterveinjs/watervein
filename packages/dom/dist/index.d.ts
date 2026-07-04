import { Node as WvNode } from '@watervein/core';
import { ReactiveStyle as Style0 } from '@watervein/dom-core';
export type Dsl1Style = {
    [K in keyof Style0]?: Style0[K] | WvNode<any>;
};
export type Dsl1Class = string | WvNode<string> | (() => string) | {
    [key: string]: boolean | WvNode<boolean> | (() => boolean);
} | Array<string | WvNode<string> | (() => string)>;
export type Dsl1Props = {
    style?: Dsl1Style | WvNode<string> | (() => string);
    class?: Dsl1Class;
    className?: Dsl1Class;
    [key: string]: any;
};
export type Dsl1Child = HTMLElement | Text | string | number | WvNode<any> | (() => any);
export declare function element<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Dsl1Props, children?: Dsl1Child | Dsl1Child[]): HTMLElementTagNameMap[K];
export declare function Show(condition: WvNode<boolean> | (() => boolean), thenFn: () => HTMLElement, elseFn?: () => HTMLElement): HTMLElement;
export declare function For<T>(listNode: WvNode<T[]>, keyFn: (item: T) => any, renderFn: (getItem: () => T, getIndex: () => number) => HTMLElement): HTMLElement;
export { mount, mountToBody } from '@watervein/dom-core';
export * from './elements.js';
//# sourceMappingURL=index.d.ts.map