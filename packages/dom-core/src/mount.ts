/**
 * Application Custom Root Mount
 * @param target The element that serves as the root of the mount
 * @param rootNode Node to be mounted
 */
export const mount = (target: Node, rootNode: Node) => target.appendChild(rootNode);
/**
 * Application Body Mount
 * @param rootNode Node to be mounted
 */
export const mountToBody = (rootNode: Node) => document.body.appendChild(rootNode);
/**
 * Application Head Mount
 * @param rootNode Node to be mounted
 */
export const mountToHead = (rootNode: Node) => document.head.appendChild(rootNode);
/**
 * Application Root Mount
 * @param rootNode Node to be mounted
 */
export const mountToRoot = (rootNode: Node) => document.documentElement.appendChild(rootNode);