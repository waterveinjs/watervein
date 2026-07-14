import { createEntity, withEntity } from '@watervein/core';
import { registerGCEntity } from './gc.js';
export function scope(f) {
    return ((...args) => {
        const entityId = createEntity();
        const el = withEntity(entityId, () => f(...args));
        if (el instanceof HTMLElement) {
            registerGCEntity(el, entityId);
        }
        return el;
    });
}
//# sourceMappingURL=scope.js.map