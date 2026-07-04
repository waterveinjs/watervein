type ReactiveProp<T> = T | WvNode<T> | (() => T);
type CSSStyleKeys = {
    [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends Function ? never : K;
}[keyof CSSStyleDeclaration];
export type ReactiveStyle = {
    [K in CSSStyleKeys]?: ReactiveProp<CSSStyleDeclaration[K]>;
} & {
    [key: string]: ReactiveProp<string | number | null | undefined>;
};
export type ReactiveClass = string | WvNode<string> | (() => string) | {
    [key: string]: boolean | WvNode<boolean> | (() => boolean);
} | Array<string | WvNode<string> | (() => string)>;
export type ReactiveProps = {
    style?: ReactiveStyle | (() => string);
    class?: ReactiveClass;
    className?: ReactiveClass;
    [key: string]: any;
};
import { Node as WvNode } from '@watervein/core';
type Child = HTMLElement | Text | string | number | WvNode<any> | (() => any);
export declare function element<K extends keyof HTMLElementTagNameMap>(tag: K, props?: ReactiveProps, children?: Child | Child[]): HTMLElementTagNameMap[K];
export { Show, For } from './base.js';
export { mount, mountToBody, mountToHead, mountToRoot } from './mount.js';
//# sourceMappingURL=index.d.ts.map