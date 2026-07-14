import { createEntity, withEntity } from '@watervein/core';
import { registerGCEntity } from './gc.js';

export function scope<T extends (...args: any[]) => HTMLElement>(f: T): T {
    return ((...args: any[]) => {
        const entityId = createEntity();
        const el = withEntity(entityId, () => f(...args));

        if (el instanceof HTMLElement) {
            registerGCEntity(el, entityId);
        }
        
        return el;
    }) as any;
}