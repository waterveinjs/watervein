export declare const wvLeaveKey: unique symbol;
export interface InternalDOM extends HTMLElement {
    [wvLeaveKey]?: (f: () => void) => void;
}
//# sourceMappingURL=internal.d.ts.map