import { DestructionSystem } from '@watervein/core';

const elementEntityMap = new WeakMap<HTMLElement, number>();

export const registerEntityElement = (element: HTMLElement, entityId: number) => {
    elementEntityMap.set(element, entityId);
};

export const unmount = (target: HTMLElement | number) => {
    let entityId: number | null = null;
    let elementToRemove: HTMLElement | null = null;

    if (typeof target === 'number') {
        entityId = target;
    } else {
        elementToRemove = target;
        entityId = elementEntityMap.get(target) ?? null;
    }

    if (elementToRemove) {
        elementToRemove.remove();
        elementEntityMap.delete(elementToRemove);
    }

    if (entityId !== null) {
        DestructionSystem.destroyEntity(entityId);
    }
};