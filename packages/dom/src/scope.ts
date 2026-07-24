import { createEntity, DestructionSystem, withEntity } from '@watervein/core';
import { registerEntityElement } from "@watervein/dom-core";

const registry = new FinalizationRegistry((entityId: number) => {
    DestructionSystem.destroyEntity(entityId);
});

export function scope<T extends (...args: any[]) => HTMLElement>(f: T): T {
    return ((...args: any[]) => {
        const entityId = createEntity();
        const el = withEntity(entityId, () => f(...args));

        if (el instanceof HTMLElement) {
            registerEntityElement(el, entityId);
            registry.register(el, entityId);
        }
        
        return el;
    }) as any;
}