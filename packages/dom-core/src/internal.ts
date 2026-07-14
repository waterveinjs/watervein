export const wvLeaveKey = Symbol('__wv_leave');

export interface InternalDOM extends HTMLElement {
  [wvLeaveKey]?: (f: () => void) => void;
}