import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createState,
    createResource,
    read,
    write,
    UISystem,
    createEffect,
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

    it('notifies subscribed effects exactly once per state transition (loading -> resolved)', async () => {
        const source = createState('id-1');
        const fetcher = vi.fn(() => Promise.resolve('final-data'));

        const resource = createResource(source, fetcher);
        const spy = vi.fn();
        createEffect(() => spy(read(resource).loading, read(resource).data));

        spy.mockClear();

        await Promise.resolve();
        await Promise.resolve();

        expect(spy).toHaveBeenCalledWith(false, 'final-data');
        expect(spy).toHaveBeenCalledTimes(1);
    });
});