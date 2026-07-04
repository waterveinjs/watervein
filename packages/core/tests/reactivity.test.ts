import { describe, it, expect, vi } from 'vitest';
import { 
    createState, 
    createCompute, 
    createEffect, 
    read, 
    write, 
    batch, 
    UISystem,
    createEntity,
    withEntity,
    DestructionSystem,
    Node as WvNode,
    untrack,
    mapEntity,
    matchEntity
} from '../src/index.js';

describe('Watervein Core - Radical NES Engine', () => {

    it('should propagate reactive updates via DAG edges and topological sorting', () => {
        const count = createState(0);
        const doubled = createCompute(() => read(count) * 2);
        
        const spy = vi.fn();
        createEffect(() => {
            spy(read(doubled));
        });

        expect(spy).toHaveBeenCalledWith(0);
        expect(spy).toHaveBeenCalledTimes(1);

        write(count, 5);
        UISystem.flush();

        expect(spy).toHaveBeenCalledWith(10);
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should batch multiple writes and collapse transient states', () => {
        const count = createState(0);
        const spy = vi.fn();
        createEffect(() => spy(read(count)));

        spy.mockClear();

        batch(() => {
            write(count, 1);
            write(count, 2);
            write(count, 3);
        });

        expect(spy).toHaveBeenCalledWith(3);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should detect circular references in DEV environment', () => {
        const toggle = createState(false);

        const a: WvNode<number> = createCompute(() => read(toggle) ? read(b) + 1 : 0);
        const b: WvNode<number> = createCompute(() => read(a) + 1);

        write(toggle, true);

        expect(() => {
            UISystem.flush();
        }).toThrow('[watervein] A circular reference');
    });

    it('should clean up nodes and edges completely upon Entity destruction', () => {
        const entityId = createEntity();
        
        const globalState = createState(100);
        let internalState: any;

        withEntity(entityId, () => {
            internalState = createCompute(() => read(globalState) * 2);
        });

        const spy = vi.fn();
        createEffect(() => spy(read(internalState)));
        expect(spy).toHaveBeenCalledWith(200);

        spy.mockClear();

        DestructionSystem.destroyEntity(entityId);

        write(globalState, 300);
        UISystem.flush();

        expect(spy).not.toHaveBeenCalled();
    });

    it('should dynamically patch and track runtime conditional branches (Edge Remapping)', () => {
        const toggle = createState(true);
        const choiceA = createState('A');
        const choiceB = createState('B');

        const result = createCompute(() => {
            return read(toggle) ? read(choiceA) : read(choiceB);
        });

        expect(read(result)).toBe('A');

        write(toggle, false);
        UISystem.flush();
        expect(read(result)).toBe('B');

        const spy = vi.fn();
        createEffect(() => spy(read(result)));
        spy.mockClear();

        write(choiceA, 'AAA');
        UISystem.flush();

        expect(spy).not.toHaveBeenCalled();
    });

    it('should not hang when a dynamic branch switch introduces a post-hoc graph cycle', () => {
        const toggle = createState(false);

        const a: WvNode<number> = createCompute(() => (read(toggle) ? read(b) + 1 : 0));
        const b: WvNode<number> = createCompute(() => read(a) + 1);

        write(toggle, true);

        expect(() => {
            UISystem.flush();
        }).toThrow();
    }, 2000);

    it('should evaluate diamond dependencies exactly once per flush (glitch-free)', () => {
        const base = createState(1);
        const left = createCompute(() => read(base) * 2);
        const right = createCompute(() => read(base) * 3);

        const spy = vi.fn();
        createEffect(() => {
            spy(read(left) + read(right));
        });

        spy.mockClear();
        write(base, 2);
        UISystem.flush();

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(10);
    });

    it('should skip scheduling when write() sets a referentially equal value', () => {
        const obj = { n: 1 };
        const state = createState(obj);
        const spy = vi.fn();
        createEffect(() => spy(read(state)));

        spy.mockClear();
        write(state, obj);
        UISystem.flush();

        expect(spy).not.toHaveBeenCalled();
    });

    it('should only flush once when batch() calls are nested', () => {
        const count = createState(0);
        const spy = vi.fn();
        createEffect(() => spy(read(count)));

        spy.mockClear();

        batch(() => {
            write(count, 1);
            batch(() => {
                write(count, 2);
                write(count, 3);
            });
            write(count, 4);
        });

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(4);
    });

    it('should not track dependencies inside untrack()', () => {
        const tracked = createState('visible');
        const hidden = createState('invisible');

        const spy = vi.fn();
        createEffect(() => {
            spy(read(tracked));
            untrack(() => read(hidden));
        });

        spy.mockClear();
        write(hidden, 'changed');
        UISystem.flush();

        expect(spy).not.toHaveBeenCalled();

        write(tracked, 'changed-too');
        UISystem.flush();
        expect(spy).toHaveBeenCalledWith('changed-too');
    });

    it('should actually shrink depsDense when a compute stops reading a dependency', () => {
        const toggle = createState(true);
        const a = createState('A');
        const b = createState('B');

        const result = createCompute(() => (read(toggle) ? read(a) : read(b)));

        expect(result.depsDense.length).toBe(2);

        write(toggle, false);
        UISystem.flush();

        expect(result.depsDense).toContain(toggle.id);
        expect(result.depsDense).toContain(b.id);
        expect(result.depsDense).not.toContain(a.id);
        expect(result.depsDense.length).toBe(2);
    });

    it('should destroy the previous branch entity when matchEntity switches condition', () => {
        const condition = createState(true);
        const thenSpy = vi.fn();
        const elseSpy = vi.fn();
        const cleanupTargets: WvNode[] = [];

        matchEntity(
            condition,
            () => {
                const s = createState('then-branch');
                cleanupTargets.push(s);
                createEffect(() => thenSpy(read(s)));
            },
            () => {
                const s = createState('else-branch');
                createEffect(() => elseSpy(read(s)));
            }
        );

        expect(thenSpy).toHaveBeenCalledWith('then-branch');

        write(condition, false);
        UISystem.flush();

        expect(elseSpy).toHaveBeenCalledWith('else-branch');

        expect(cleanupTargets[0].subsDense.length).toBe(0);
    });

    it('should reconcile mapEntity list by key: add, remove, and reorder without losing per-item state', () => {
        const list = createState([{ id: 1 }, { id: 2 }, { id: 3 }]);
        const renderSpy = vi.fn();

        mapEntity(
            list,
            (item) => item.id,
            (key, getItem, getIndex) => {
                renderSpy(key, getIndex());
            }
        );

        expect(renderSpy).toHaveBeenCalledTimes(3);
        renderSpy.mockClear();

        write(list, [{ id: 3 }, { id: 1 }, { id: 4 }]);
        UISystem.flush();

        const calledKeys = renderSpy.mock.calls.map((c) => c[0]);
        expect(calledKeys).toContain(4);
        expect(calledKeys).not.toContain(2);
    });

    it('should batch-destroy multiple entities via destroyEntities without leaving dangling edges', () => {
        const shared = createState(1);
        const entityIds: number[] = [];
        const spies: ReturnType<typeof vi.fn>[] = [];

        for (let i = 0; i < 3; i++) {
            const id = createEntity();
            entityIds.push(id);
            withEntity(id, () => {
                const spy = vi.fn();
                spies.push(spy);
                createEffect(() => spy(read(shared)));
            });
        }

        spies.forEach((s) => s.mockClear());
        DestructionSystem.destroyEntities(entityIds);

        write(shared, 999);
        UISystem.flush();

        spies.forEach((s) => expect(s).not.toHaveBeenCalled());
    });
});