import { createEntity, withEntity, createState, read, write, registerErrorBoundary, DestructionSystem } from '@watervein/core';
export function errorBoundary(normalFactory, fallbackFactory) {
    const boundaryEntityId = createEntity();
    return withEntity(boundaryEntityId, () => {
        const errorState = createState(null);
        const wrapper = document.createElement('div');
        wrapper.style.display = 'contents';
        let currentChildEntityId = null;
        const renderBranch = () => {
            if (currentChildEntityId !== null) {
                DestructionSystem.destroyEntity(currentChildEntityId);
                wrapper.innerHTML = '';
            }
            const currentError = read(errorState);
            const newEntityId = createEntity();
            currentChildEntityId = newEntityId;
            withEntity(newEntityId, () => {
                let childDOM;
                if (currentError) {
                    childDOM = fallbackFactory(currentError);
                }
                else {
                    childDOM = normalFactory();
                }
                wrapper.appendChild(childDOM);
            });
        };
        registerErrorBoundary(boundaryEntityId, (err) => {
            write(errorState, err);
            renderBranch();
        });
        renderBranch();
        return wrapper;
    });
}
//# sourceMappingURL=errorBoundary.js.map