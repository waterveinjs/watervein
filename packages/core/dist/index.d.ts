declare const WV_NODE_TAG = 1465273924;
export type Node<T = any> = {
    __wv: typeof WV_NODE_TAG;
    type: number;
    id: number;
    dirty: boolean;
    depth: number;
    watchedVersion: number;
    bucketIdx: number;
    pendingDepsLen: number;
    value: T;
    entityId: number | null;
    compute: (() => T) | null;
    subsDense: number[] | null;
    depsDense: number[] | null;
    pendingDeps: number[];
};
export type ResourceResult<T> = {
    data: T | undefined;
    loading: boolean;
    error: any | null;
};
export declare function N(id: number): Node;
export declare function createEntity(): number;
export declare function withEntity<T>(entityId: number, fn: () => T): T;
export declare function registerCustomNodeType(): number;
declare function propagateDepth(start: Node): void;
declare function scheduleNode(node: Node): void;
export declare function writeRaw<T>(node: Node<T>, value: T): void;
export declare function flush(): void;
export declare function createState<T>(initial: T): Node<T>;
export declare function createCompute<T>(fn: () => T): Node<T>;
export declare function createEffect(fn: () => void): Node<void>;
export declare function createResource<S, T>(sourceNode: Node<S>, fetcher: (source: S) => Promise<T>): Node<ResourceResult<T>>;
export declare function read<T>(node: Node<T>): T;
export declare function write<T>(node: Node<T>, value: T): void;
export declare function untrack<T>(fn: () => T): T;
export declare function pushTrackingNode(node: Node | null): void;
export declare function popTrackingNode(): void;
export declare const UISystem: {
    flush: typeof flush;
};
export declare const DataSystem: {
    schedule: typeof scheduleNode;
    propagateDepth: typeof propagateDepth;
    cleanupEdges: (node: Node) => void;
};
export declare const DestructionSystem: {
    destroyEntity(entityId: number): void;
    destroyEntities(entityIds: number[]): void;
    _cleanupNode(node: Node): void;
};
export declare function matchEntity(conditionNode: Node<boolean>, thenFn: () => void, elseFn?: () => void): void;
export declare function mapEntity<T>(listNode: Node<T[]>, keyFn: (item: T) => any, renderFn: (key: any, getItem: () => T, getIndex: () => number) => void): void;
export declare function isNode(value: unknown): value is Node<any>;
export declare function batch(fn: () => void): void;
export declare const eventRegistry: Map<string, Map<number, EventListener>>;
export declare function getCurrentEntityId(): number | null;
export declare function handleDelegatedEvent(e: Event): void;
export declare function cleanupEntityEvents(entityId: number): void;
export declare function registerErrorBoundary(entityId: number, handler: (err: any) => void): void;
export declare function unregisterErrorBoundary(entityId: number): void;
export {};
//# sourceMappingURL=index.d.ts.map