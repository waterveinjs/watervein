/**
 * Application Custom Root Mount
 * @param target The element that serves as the root of the mount
 * @param rootElement Elements to be mounted
 */
export const mount = (target, rootElement) => target.appendChild(rootElement);
/**
 * Application Body Mount
 * @param rootElement Elements to be mounted
 */
export const mountToBody = (rootElement) => document.body.appendChild(rootElement);
/**
 * Application Head Mount
 * @param rootElement Elements to be mounted
 */
export const mountToHead = (rootElement) => document.head.appendChild(rootElement);
/**
 * Application Root Mount
 * @param rootElement Elements to be mounted
 */
export const mountToRoot = (rootElement) => document.documentElement.appendChild(rootElement);
//# sourceMappingURL=mount.js.map