import { createEntity, withEntity } from '@watervein/core';
export function scope(f) {
    return ((...args) => {
        const entityId = createEntity();
        return withEntity(entityId, () => f(...args));
    });
}
//# sourceMappingURL=scope.js.map