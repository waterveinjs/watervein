import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createState,
    createResource,
    read,
    write,
    UISystem,
    createEffect,
    createCompute,
    createEntity,
    batch,
    untrack,
    withEntity,
    DestructionSystem,
    Node as WvNode
} from '../src/index.js';

describe('Watervein Core - createResource', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts in loading state with undefined data', () => {
        const source = createState('id-1');
        const fetcher = vi.fn(() => new Promise<string>(() => {}));

        const resource = createResource(source, fetcher);

        expect(read(resource).loading).toBe(true);
        expect(read(resource).data).toBeUndefined();
        expect(read(resource).error).toBeNull();
        expect(fetcher).toHaveBeenCalledWith('id-1');
    });

    it('resolves data and clears loading state once the fetch settles', async () => {
        const source = createState('id-1');
        const fetcher = vi.fn((id: string) => Promise.resolve(`data-for-${id}`));

        const resource = createResource(source, fetcher);

        await Promise.resolve();
        await Promise.resolve();

        expect(read(resource).loading).toBe(false);
        expect(read(resource).data).toBe('data-for-id-1');
        expect(read(resource).error).toBeNull();
    });

    it('sets error and clears loading state when the fetcher rejects', async () => {
        const source = createState('id-1');
        const boom = new Error('network failure');
        const fetcher = vi.fn(() => Promise.reject(boom));

        const resource = createResource(source, fetcher);

        await Promise.resolve();
        await Promise.resolve();

        expect(read(resource).loading).toBe(false);
        expect(read(resource).data).toBeUndefined();
        expect(read(resource).error).toBe(boom);
    });

    it('re-fetches automatically when the source node changes', async () => {
        const source = createState('id-1');
        const fetcher = vi.fn((id: string) => Promise.resolve(`data-for-${id}`));

        const resource = createResource(source, fetcher);
        await Promise.resolve();
        await Promise.resolve();
        expect(read(resource).data).toBe('data-for-id-1');

        write(source, 'id-2');
        UISystem.flush();

        expect(read(resource).loading).toBe(true);

        await Promise.resolve();
        await Promise.resolve();

        expect(fetcher).toHaveBeenCalledWith('id-2');
        expect(read(resource).data).toBe('data-for-id-2');
        expect(read(resource).loading).toBe(false);
    });

    it('ignores a stale fetch that resolves after a newer fetch has already started (fetchId race)', async () => {
        const source = createState('slow');
        let resolveSlow!: (v: string) => void;
        let resolveFast!: (v: string) => void;

        const fetcher = vi.fn((id: string) => {
            if (id === 'slow') {
                return new Promise<string>((res) => { resolveSlow = res; });
            }
            return new Promise<string>((res) => { resolveFast = res; });
        });

        const resource = createResource(source, fetcher);
        await Promise.resolve();

        write(source, 'fast');
        UISystem.flush();
        await Promise.resolve();

        expect(fetcher).toHaveBeenCalledTimes(2);

        resolveSlow('STALE-DATA');
        await Promise.resolve();
        await Promise.resolve();

        expect(read(resource).data).toBeUndefined();
        expect(read(resource).loading).toBe(true);

        resolveFast('FRESH-DATA');
        await Promise.resolve();
        await Promise.resolve();

        expect(read(resource).data).toBe('FRESH-DATA');
        expect(read(resource).loading).toBe(false);
    });

    it('ignores a stale rejection that arrives after a newer fetch has already started', async () => {
        const source = createState('first');
        let rejectFirst!: (e: Error) => void;
        let resolveSecond!: (v: string) => void;

        const fetcher = vi.fn((id: string) => {
            if (id === 'first') {
                return new Promise<string>((_, rej) => { rejectFirst = rej; });
            }
            return new Promise<string>((res) => { resolveSecond = res; });
        });

        const resource = createResource(source, fetcher);
        await Promise.resolve();

        write(source, 'second');
        UISystem.flush();
        await Promise.resolve();

        resolveSecond('GOOD-DATA');
        await Promise.resolve();
        await Promise.resolve();

        expect(read(resource).data).toBe('GOOD-DATA');
        expect(read(resource).loading).toBe(false);

        rejectFirst(new Error('late failure'));
        await Promise.resolve();
        await Promise.resolve();

        expect(read(resource).data).toBe('GOOD-DATA');
        expect(read(resource).error).toBeNull();
        expect(read(resource).loading).toBe(false);
    });

    it('preserves the previous data value while a re-fetch is in flight (stale-while-revalidate style)', async () => {
        const source = createState('id-1');
        let resolveSecond!: (v: string) => void;

        const fetcher = vi.fn((id: string) => {
            if (id === 'id-1') return Promise.resolve('first-data');
            return new Promise<string>((res) => { resolveSecond = res; });
        });

        const resource = createResource(source, fetcher);
        await Promise.resolve();
        await Promise.resolve();
        expect(read(resource).data).toBe('first-data');

        write(source, 'id-2');
        UISystem.flush();
        await Promise.resolve();

        expect(read(resource).loading).toBe(true);
        expect(read(resource).data).toBe('first-data');

        resolveSecond!('second-data');
        await Promise.resolve();
        await Promise.resolve();

        expect(read(resource).data).toBe('second-data');
        expect(read(resource).loading).toBe(false);
    });

    it('notifies subscribed effects exactly once via manual flush', async () => {
        const source = createState('id-1');
        const fetcher = vi.fn(() => Promise.resolve('final-data'));

        const resource = createResource(source, fetcher);
        const spy = vi.fn();
        createEffect(() => spy(read(resource).loading, read(resource).data));

        spy.mockClear();

        await Promise.resolve();
        await Promise.resolve();

        UISystem.flush();

        expect(spy).toHaveBeenCalledWith(false, 'final-data');
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('automatically flushes updates asynchronously after resource resolution', async () => {
        const source = createState('id-1');
        const fetcher = vi.fn(() => Promise.resolve('final-data'));

        const resource = createResource(source, fetcher);
        const spy = vi.fn();
        createEffect(() => spy(read(resource).loading, read(resource).data));

        spy.mockClear();

        await Promise.resolve();
        await Promise.resolve();

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(spy).toHaveBeenCalledWith(false, 'final-data');
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('handles extremely deep reactive source hierarchies (10,000 depths) without crashing', async () => {
        let current = createState(1);
        const root = current;

        for (let i = 0; i < 10000; i++) {
            const node = current;
            current = createCompute(() => read(node) + 1);
        }

        const fetcher = vi.fn((val: number) => Promise.resolve(`deep-data-${val}`));
        const resource = createResource(current, fetcher);

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();

        expect(read(resource).data).toBe('deep-data-10001');

        write(root, 2);
        UISystem.flush();

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();

        expect(read(resource).data).toBe('deep-data-10002');
    });

    it('perfectly groups updates via batch() without intermediate re-fetches', async () => {
        const source1 = createState('A');
        const source2 = createState('B');
        const fetcher = vi.fn((id: string) => Promise.resolve(`combined-${id}`));

        const combinedSource = createCompute(() => `${read(source1)}-${read(source2)}`);
        const resource = createResource(combinedSource, fetcher);

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();
        fetcher.mockClear();

        batch(() => {
            write(source1, 'X');
            write(source2, 'Y');
        });

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith('X-Y');
    });

    it('handles diamond-shaped graphs cleanly without redundant fetcher execution', async () => {
        const root = createState('base');
        const left = createCompute(() => `${read(root)}-left`);
        const right = createCompute(() => `${read(root)}-right`);
        const diamond = createCompute(() => `${read(left)} & ${read(right)}`);

        const fetcher = vi.fn((id: string) => Promise.resolve(`data-${id}`));
        const resource = createResource(diamond, fetcher);

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();
        fetcher.mockClear();

        write(root, 'new');
        UISystem.flush();

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith('new-left & new-right');
    });

    it('completely aborts update queue execution when an unexpected error occurs during batch()', () => {
        const source = createState('normal');
        const fetcher = vi.fn(() => Promise.resolve('ok'));
        const resource = createResource(source, fetcher);

        const toxicCompute = createCompute(() => {
            if (read(source) === 'poison') throw new Error('Crashing on purpose!');
            return read(source);
        });

        expect(() => {
            batch(() => {
                write(source, 'poison');
            });
        }).toThrow('Crashing on purpose!');

        expect(read(toxicCompute)).not.toBe('poison');
    });

    it('5. triggers downstream side effects exactly once even with 1,000 concurrent list mappings', async () => {
        const listData = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
        const sourceList = createState(listData);
        const fetcher = vi.fn((list: string[]) => Promise.resolve(`length-${list.length}`));
        const resource = createResource(sourceList, fetcher);

        const spy = vi.fn();
        createEffect(() => spy(read(resource).loading, read(resource).data));

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();
        spy.mockClear();

        write(sourceList, [...listData].reverse());
        UISystem.flush();

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();

        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenNthCalledWith(1, true, expect.anything());
        expect(spy).toHaveBeenNthCalledWith(2, false, 'length-1000');
    });

    it('6. clears dynamic memory allocations on resource destruction within entity lifetimes', async () => {
        const entityId = createEntity();
        const source = createState('entity-target');
        const fetcher = vi.fn(() => Promise.resolve('data'));

        let resource!: WvNode<any>; 
        withEntity(entityId, () => {
            resource = createResource(source, fetcher);
        });

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();

        expect(read(resource).data).toBe('data');
        const savedNodeId = resource.id;

        DestructionSystem.destroyEntity(entityId);

        expect(() => {
            const deletedNode = (UISystem as any)._allNodes ? (UISystem as any)._allNodes[savedNodeId] : null;
            if (deletedNode) {
                expect(deletedNode.id).toBe(-1);
            }
        });

        expect(resource.subsDense.length).toBe(0);
        expect(resource.depsDense.length).toBe(0);
    });

    it('processes alternating async resolution in unpredictable order (stale-while-revalidate stress test)', async () => {
        const source = createState('req-1');
        const resolutions: (() => void)[] = [];
        
        const fetcher = vi.fn((id: string) => {
            return new Promise<string>((res) => {
                resolutions.push(() => res(`res-for-${id}`));
            });
        });

        const resource = createResource(source, fetcher);
        await Promise.resolve();

        write(source, 'req-2'); UISystem.flush(); await Promise.resolve();
        write(source, 'req-3'); UISystem.flush(); await Promise.resolve();

        expect(resolutions.length).toBe(3);

        resolutions[1]();
        await Promise.resolve(); await Promise.resolve();
        expect(read(resource).data).toBeUndefined();

        resolutions[2]();
        await Promise.resolve(); await Promise.resolve();
        expect(read(resource).data).toBe('res-for-req-3');

        resolutions[0]();
        await Promise.resolve(); await Promise.resolve();
        expect(read(resource).data).toBe('res-for-req-3');
    });

    it('prevents infinite cascading compute loops when source flips inside downstream nodes', async () => {
        const trigger = createState(0);
        const fetcher = vi.fn((v: number) => Promise.resolve(`val-${v}`));
        const resource = createResource(trigger, fetcher);

        createEffect(() => {
            const data = read(resource).data;
            if (data === 'val-1') {
                untrack(() => write(trigger, 2));
            }
        });

        write(trigger, 1);
        UISystem.flush();

        await Promise.resolve();
        await Promise.resolve();
        UISystem.flush();

        expect(read(trigger)).toBe(2);
    });

    it('recovers beautifully from multiple rapid sequential errors', async () => {
        const source = createState('attempt-1');
        let rejectPromise!: (e: Error) => void;

        const fetcher = vi.fn(() => {
            return new Promise<string>((_, rej) => { rejectPromise = rej; });
        });

        const resource = createResource(source, fetcher);
        await Promise.resolve();

        rejectPromise(new Error('Fail 1'));
        await Promise.resolve(); await Promise.resolve();
        expect(read(resource).error?.message).toBe('Fail 1');

        write(source, 'attempt-2');
        UISystem.flush();
        await Promise.resolve();

        expect(read(resource).loading).toBe(true);
        expect(read(resource).error).toBeNull();
    });

    it('handles synchronous structural reading without registering empty tracking nodes', () => {
        const source = createState('direct-read');
        const fetcher = vi.fn(() => Promise.resolve('raw'));
        const resource = createResource(source, fetcher);

        const output = untrack(() => {
            return read(resource);
        });

        expect(output.loading).toBe(true);

        const dummy = createState(0);
        const effectTriggered = vi.fn();
        createEffect(() => {
            untrack(() => { read(resource); });
            read(dummy);
            effectTriggered();
        });
        
        effectTriggered.mockClear();
        write(source, 'changed');
        UISystem.flush();
        expect(effectTriggered).not.toHaveBeenCalled();
    });
});