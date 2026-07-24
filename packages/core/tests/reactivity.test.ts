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
    matchEntity,
    N
} from '../src/index.js';

function getDepIds(node: WvNode): number[] {
    const ids: number[] = [];
    let curr = node.depsHead;
    while (curr !== null) {
        ids.push(curr.dep.id);
        curr = curr.nextDep;
    }
    return ids;
}
function getDepsCount(node: WvNode): number {
    let count = 0;
    let curr = node.depsHead;
    while (curr !== null) {
        count++;
        curr = curr.nextDep;
    }
    return count;
}

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

    it('should actually shrink deps when a compute stops reading a dependency', () => {
        const toggle = createState(true);
        const a = createState('A');
        const b = createState('B');

        const result = createCompute(() => (read(toggle) ? read(a) : read(b)));

        expect(getDepsCount(result)).toBe(2);
        expect(getDepIds(result)).toContain(toggle.id);
        expect(getDepIds(result)).toContain(a.id);

        write(toggle, false);
        UISystem.flush();

        const currentDeps = getDepIds(result);

        expect(currentDeps).toContain(toggle.id);
        expect(currentDeps).toContain(b.id);
        expect(currentDeps).not.toContain(a.id);
        expect(currentDeps.length).toBe(2);
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

        expect(cleanupTargets[0].subsHead).toBeNull();
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

describe('Watervein Core - Advanced Reactive System', () => {
    it('should maintain topological order during nested compute updates', () => {
        const a = createState(1);
        const b = createCompute(() => read(a) + 1);
        const c = createCompute(() => read(b) + 1);
        
        const spy = vi.fn();
        createEffect(() => spy(read(c)));
        
        spy.mockClear();
        write(a, 2);
        UISystem.flush();
        
        expect(spy).toHaveBeenCalledWith(4);
    });

    it('should correctly propagate deep updates through long dependency chains', () => {
        const root = createState(1);
        let leaf: WvNode<number> = root;
        for (let i = 0; i < 10; i++) {
            const current = leaf;
            leaf = createCompute(() => read(current) + 1);
        }

        const spy = vi.fn();
        createEffect(() => spy(read(leaf)));

        write(root, 2);
        UISystem.flush();
        
        expect(spy).toHaveBeenCalledWith(12);
    });

    it('should prevent zombie effects when dependencies are removed dynamically', () => {
        const toggle = createState(true);
        const sourceA = createState(1);
        const sourceB = createState(1);
        
        const result = createCompute(() => read(toggle) ? read(sourceA) : read(sourceB));
        const spy = vi.fn();
        createEffect(() => spy(read(result)));

        spy.mockClear();
        write(sourceA, 2);
        UISystem.flush();
        expect(spy).toHaveBeenCalledWith(2);

        write(toggle, false);
        UISystem.flush();
        spy.mockClear();
        
        write(sourceA, 3);
        UISystem.flush();
        expect(spy).not.toHaveBeenCalled();
    });

    it('should isolate side effects within different entities', () => {
        const shared = createState(0);
        const entity1 = createEntity();
        const entity2 = createEntity();
        
        const spy1 = vi.fn();
        const spy2 = vi.fn();

        withEntity(entity1, () => createEffect(() => spy1(read(shared))));
        withEntity(entity2, () => createEffect(() => spy2(read(shared))));

        write(shared, 1);
        UISystem.flush();

        expect(spy1).toHaveBeenCalledWith(1);
        expect(spy2).toHaveBeenCalledWith(1);

        DestructionSystem.destroyEntity(entity1);

        write(shared, 2);
        UISystem.flush();

        expect(spy1).toHaveBeenCalledTimes(2);
        expect(spy2).toHaveBeenCalledTimes(3);
    });

    it('should handle complex diamond dependency with re-entrant writes', () => {
        const a = createState(1);
        const b = createCompute(() => read(a) + 1);
        const c = createCompute(() => read(a) + 2);
        const d = createCompute(() => read(b) + read(c));
        
        const spy = vi.fn();
        createEffect(() => spy(read(d)));
        
        spy.mockClear();
        write(a, 2);
        UISystem.flush();

        expect(spy).toHaveBeenCalledWith(7);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('Watervein Core - Extended Hardening & Edge Cases', () => {

    it('should handle dynamic diamond switches where one branch becomes independent', () => {
        const base = createState(1);
        const toggle = createState(true);

        const left = createCompute(() => read(toggle) ? read(base) * 2 : 10);
        const right = createCompute(() => read(base) * 3);
        const combined = createCompute(() => read(left) + read(right));

        const spy = vi.fn();
        createEffect(() => spy(read(combined)));

        expect(spy).toHaveBeenCalledWith(5);
        spy.mockClear();

        write(toggle, false);
        UISystem.flush();

        expect(spy).toHaveBeenCalledWith(13);
        spy.mockClear();

        write(base, 2);
        UISystem.flush();

        expect(spy).toHaveBeenCalledWith(16);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should maintain stable state when batch contains multiple writes to the same state reverting to original value', () => {
        const count = createState(100);
        const spy = vi.fn();
        createEffect(() => spy(read(count)));

        spy.mockClear();

        batch(() => {
            write(count, 200);
            write(count, 300);
            write(count, 100); 
        });
        UISystem.flush();

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(100);
    });

    it('should completely cleanup nested entities via lifecycle management when both are tracked', () => {
        const parentEntity = createEntity();
        const childEntity = createEntity();
        
        const trigger = createState(0);
        const spy = vi.fn();

        withEntity(parentEntity, () => {
            withEntity(childEntity, () => {
                createEffect(() => spy(read(trigger)));
            });
        });

        expect(spy).toHaveBeenCalledWith(0);
        spy.mockClear();

        DestructionSystem.destroyEntities([parentEntity, childEntity]);

        write(trigger, 1);
        UISystem.flush();

        expect(spy).not.toHaveBeenCalled();
    });

    it('should support updating a state inside an effect (deferred/scheduled write) without crashing', () => {
        const source = createState(1);
        const target = createState(10);

        createEffect(() => {
            const val = read(source);
            if (val === 5) {
                write(target, 50);
            }
        });

        write(source, 5);
        UISystem.flush();

        expect(read(target)).toBe(50);
    });

    it('should correctly handle mapEntity identity tracking when elements are fully swapped', () => {
        const list = createState([{ id: 'a' }, { id: 'b' }]);
        const itemSpies = new Map<string, any>();

        mapEntity(
            list,
            (item) => item.id,
            (key, getItem, getIndex) => {
                const spy = vi.fn();
                createEffect(() => spy(getItem())); 
                itemSpies.set(key as string, spy);
            }
        );

        expect(itemSpies.has('a')).toBe(true);
        expect(itemSpies.has('b')).toBe(true);

        const spyA = itemSpies.get('a');
        spyA.mockClear();

        write(list, [{ id: 'c' }, { id: 'd' }]);
        UISystem.flush();

        expect(spyA).not.toHaveBeenCalled();
    });

    it('should preserve deep dependency tracking chains even when early parts of the chain return the same value', () => {
        const source = createState(1);
        const isEven = createCompute(() => read(source) % 2 === 0);
        const message = createCompute(() => read(isEven) ? 'Even' : 'Odd');

        const spy = vi.fn();
        createEffect(() => spy(read(message)));

        expect(spy).toHaveBeenCalledWith('Odd');
        spy.mockClear();

        write(source, 3);
        UISystem.flush();

        expect(spy).not.toHaveBeenCalled();

        write(source, 4);
        UISystem.flush();
        expect(spy).toHaveBeenCalledWith('Even');
    });

    it('should properly track state when read inside an untrack() block that is nested within a tracked block', () => {
        const trackedA = createState('A');
        const untrackedB = createState('B');
        const trackedC = createState('C');

        const spy = vi.fn();
        createEffect(() => {
            read(trackedA);
            untrack(() => {
                read(untrackedB);
            });
            spy(read(trackedC));
        });

        spy.mockClear();

        write(untrackedB, 'BB');
        UISystem.flush();
        expect(spy).not.toHaveBeenCalled();

        write(trackedC, 'CC');
        UISystem.flush();
        expect(spy).toHaveBeenCalledWith('CC');
    });

    it('should correctly handle multi-layered conditional diamond graphs without leaking memory or evaluation', () => {
        const condition1 = createState(true);
        const condition2 = createState(true);
        const base = createState(10);

        const left = createCompute(() => read(condition1) ? read(base) * 2 : 0);
        const right = createCompute(() => read(condition2) ? read(base) * 3 : 0);
        const combined = createCompute(() => read(left) + read(right));

        const spy = vi.fn();
        createEffect(() => spy(read(combined)));

        expect(spy).toHaveBeenCalledWith(50);
        spy.mockClear();

        batch(() => {
            write(condition1, false);
            write(condition2, false);
        });
        UISystem.flush();
        expect(spy).toHaveBeenCalledWith(0);
        spy.mockClear();

        write(base, 999);
        UISystem.flush();
        expect(spy).not.toHaveBeenCalled();
    });

    it('should throw an explicit cycle error when a compute node attempts to read itself directly', () => {
        expect(() => {
            const selfLoop: WvNode<number> = createCompute(() => {
                return read(selfLoop) + 1;
            });
            read(selfLoop);
        }).toThrow();
    });

    it('should execute multiple effects in the precise order of their creation during flush', () => {
        const trigger = createState(0);
        const executionOrder: string[] = [];

        createEffect(() => {
            read(trigger);
            executionOrder.push('first');
        });

        createEffect(() => {
            read(trigger);
            executionOrder.push('second');
        });

        createEffect(() => {
            read(trigger);
            executionOrder.push('third');
        });

        executionOrder.length = 0;

        write(trigger, 1);
        UISystem.flush();

        expect(executionOrder).toEqual(['first', 'second', 'third']);
    });
});