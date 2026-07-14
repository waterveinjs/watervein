import { createEntity, withEntity } from '@watervein/core';

export function scope<T extends (...args: any[]) => HTMLElement>(f: T): T {
    return ((...args: any[]) => {
        const entityId = createEntity();
        return withEntity(entityId, () => f(...args));
    }) as any;
}