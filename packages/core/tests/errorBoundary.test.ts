import { describe, it, expect, vi } from 'vitest';
import { 
    createEntity, 
    withEntity, 
    createState, 
    createCompute, 
    createEffect, 
    read, 
    write, 
    UISystem,
    registerErrorBoundary,
    unregisterErrorBoundary
} from '../src/index.js';

describe('Watervein Core - Error Boundary System', () => {

    it('should pass through normally when no errors occur', () => {
        const entityId = createEntity();
        const errorHandler = vi.fn();

        registerErrorBoundary(entityId, errorHandler);

        withEntity(entityId, () => {
            const state = createState(10);
            const computed = createCompute(() => read(state) * 2);

            expect(read(computed)).toBe(20);
            
            write(state, 30);
            UISystem.flush();

            expect(read(computed)).toBe(60);
        });

        expect(errorHandler).not.toHaveBeenCalled();
        unregisterErrorBoundary(entityId);
    });

    it('should intercept dynamic errors within the registered Entity scope without crashing the flush loop', () => {
        const boundaryEntityId = createEntity();
        let caughtError: any = null;

        registerErrorBoundary(boundaryEntityId, (err) => {
            caughtError = err;
        });

        const triggerState = createState(false);

        withEntity(boundaryEntityId, () => {
            createCompute(() => {
                if (read(triggerState)) {
                    throw new Error('NES Graph Poison Injection');
                }
                return 'safe';
            });
        });

        expect(() => UISystem.flush()).not.toThrow();
        expect(caughtError).toBeNull();

        write(triggerState, true);

        expect(() => UISystem.flush()).not.toThrow();

        expect(caughtError).toBeInstanceOf(Error);
        expect(caughtError.message).toBe('NES Graph Poison Injection');

        unregisterErrorBoundary(boundaryEntityId);
    });

    it('should let unhandled exceptions propagate to the outside if no boundary is registered for the Entity', () => {
        const rawEntityId = createEntity();
        const triggerState = createState(false);

        withEntity(rawEntityId, () => {
            createCompute(() => {
                if (read(triggerState)) {
                    throw new Error('Uncaught Core Panic');
                }
                return 'fine';
            });
        });

        write(triggerState, true);

        expect(() => {
            UISystem.flush();
        }).toThrow('Uncaught Core Panic');
    });

    it('should properly respect nested entity error bubbles (closest boundary wins)', () => {
        const parentEntityId = createEntity();
        const childEntityId = createEntity();

        const parentHandler = vi.fn();
        const childHandler = vi.fn();

        registerErrorBoundary(parentEntityId, parentHandler);
        registerErrorBoundary(childEntityId, childHandler);

        const triggerState = createState(false);

        withEntity(parentEntityId, () => {
            withEntity(childEntityId, () => {
                createCompute(() => {
                    if (read(triggerState)) {
                        throw new Error('Nested Target Failure');
                    }
                    return 0;
                });
            });
        });

        write(triggerState, true);
        UISystem.flush();

        expect(childHandler).toHaveBeenCalledTimes(1);
        expect(parentHandler).not.toHaveBeenCalled();

        unregisterErrorBoundary(parentEntityId);
        unregisterErrorBoundary(childEntityId);
    });
});