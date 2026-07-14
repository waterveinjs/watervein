import { 
    createEntity, 
    withEntity, 
    createState, 
    read, 
    write, 
    registerErrorBoundary, 
    unregisterErrorBoundary,
    DestructionSystem
} from '@watervein/core';

export function errorBoundary(
    normalFactory: () => HTMLElement,
    fallbackFactory: (error: any) => HTMLElement
): HTMLElement {
    const boundaryEntityId = createEntity();

    return withEntity(boundaryEntityId, () => {
        const errorState = createState<any | null>(null);

        const wrapper = document.createElement('div');
        wrapper.style.display = 'contents';

        let currentChildEntityId: number | null = null;

        const renderBranch = () => {
            if (currentChildEntityId !== null) {
                DestructionSystem.destroyEntity(currentChildEntityId);
                wrapper.innerHTML = '';
            }

            const currentError = read(errorState);
            const newEntityId = createEntity();
            currentChildEntityId = newEntityId;

            withEntity(newEntityId, () => {
                let childDOM: HTMLElement;
                if (currentError) {
                    childDOM = fallbackFactory(currentError);
                } else {
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