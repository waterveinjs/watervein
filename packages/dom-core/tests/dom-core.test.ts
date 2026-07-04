// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createState, createEffect, write, UISystem } from '@watervein/core';
import { Show, For } from '../src/base.js';

function createTextBinding(el: HTMLElement, fn: () => string) {
    createEffect(() => {
        el.textContent = fn();
    });
}

describe('Watervein DOM - Show', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders thenFn output when condition is initially true', () => {
        const condition = createState(true);
        const el = Show(
            condition,
            () => { const d = document.createElement('div'); d.textContent = 'then'; return d; },
            () => { const d = document.createElement('div'); d.textContent = 'else'; return d; }
        );
        document.body.appendChild(el);
        expect(el.textContent).toBe('then');
    });

    it('switches to elseFn output and removes the previous DOM node when condition flips', () => {
        const condition = createState(true);
        const el = Show(
            condition,
            () => { const d = document.createElement('div'); d.textContent = 'then'; return d; },
            () => { const d = document.createElement('div'); d.textContent = 'else'; return d; }
        );
        document.body.appendChild(el);

        write(condition, false);
        UISystem.flush();

        expect(el.textContent).toBe('else');
        expect(el.querySelectorAll('div').length).toBe(1);
    });

    it('removes DOM entirely when condition becomes false and no elseFn is given', () => {
        const condition = createState(true);
        const el = Show(
            condition,
            () => { const d = document.createElement('div'); d.textContent = 'only-then'; return d; }
        );
        document.body.appendChild(el);
        expect(el.textContent).toBe('only-then');

        write(condition, false);
        UISystem.flush();

        expect(el.querySelectorAll('div').length).toBe(0);
    });

    it('re-renders a fresh DOM node each time condition toggles back and forth (no stale reuse)', () => {
        const condition = createState(true);
        const created: HTMLElement[] = [];

        const el = Show(
            condition,
            () => {
                const d = document.createElement('div');
                d.textContent = 'then';
                created.push(d);
                return d;
            },
            () => {
                const d = document.createElement('div');
                d.textContent = 'else';
                return d;
            }
        );
        document.body.appendChild(el);

        write(condition, false);
        UISystem.flush();
        write(condition, true);
        UISystem.flush();

        expect(created.length).toBe(2);
        expect(created[0]).not.toBe(created[1]);
    });

    it('does not throw when state owned by a destroyed branch is written to after switching away', () => {
        const condition = createState(true);
        const innerCount = createState(0);

        const el = Show(
            condition,
            () => document.createElement('div')
        );
        document.body.appendChild(el);

        write(condition, false);
        UISystem.flush();

        write(innerCount, 1);
        expect(() => UISystem.flush()).not.toThrow();
    });
});

describe('Watervein DOM - For', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    function makeList(items: { id: number; label: string }[]) {
        return createState(items);
    }

    it('renders one DOM element per item in initial order', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        const wrapper = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        document.body.appendChild(wrapper);

        const labels = Array.from(wrapper.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['A', 'B', 'C']);
    });

    it('removes the DOM element for items removed from the list', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        const wrapper = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        document.body.appendChild(wrapper);

        write(list, [{ id: 1, label: 'A' }, { id: 3, label: 'C' }]);
        UISystem.flush();

        const labels = Array.from(wrapper.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['A', 'C']);
    });

    it('reuses the same DOM element instance for unchanged keys (no re-render on update)', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        const renderCalls = vi.fn();

        const wrapper = For(
            list,
            (item) => item.id,
            (getItem) => {
                renderCalls();
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        document.body.appendChild(wrapper);

        const firstDivs = Array.from(wrapper.querySelectorAll('div'));
        renderCalls.mockClear();

        write(list, [{ id: 1, label: 'A-updated' }, { id: 2, label: 'B' }]);
        UISystem.flush();

        expect(renderCalls).not.toHaveBeenCalled();

        const secondDivs = Array.from(wrapper.querySelectorAll('div'));
        expect(secondDivs[0]).toBe(firstDivs[0]);
        expect(secondDivs[1]).toBe(firstDivs[1]);
    });

    it('reflects updated item data through getItem() without recreating the DOM node', () => {
        const list = makeList([{ id: 1, label: 'A' }]);
        const wrapper = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                createEffect(() => {
                    d.textContent = getItem().label;
                });
                return d;
            }
        );
        document.body.appendChild(wrapper);

        expect(wrapper.querySelector('div')!.textContent).toBe('A');

        write(list, [{ id: 1, label: 'A-updated' }]);
        UISystem.flush();

        expect(wrapper.querySelector('div')!.textContent).toBe('A-updated');
    });

    it('reorders existing DOM elements to match new list order (no new items involved)', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        const wrapper = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        document.body.appendChild(wrapper);

        write(list, [{ id: 3, label: 'C' }, { id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        UISystem.flush();

        const labels = Array.from(wrapper.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['C', 'A', 'B']);
    });

    it('appends a brand-new item at the end even when there were zero prior items', () => {
        const list = makeList([]);
        const wrapper = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        document.body.appendChild(wrapper);

        write(list, [{ id: 1, label: 'A' }]);
        UISystem.flush();

        const labels = Array.from(wrapper.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['A']);
    });

    it('inserts a new item in the middle at the correct position within a single flush', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 3, label: 'C' }]);
        const wrapper = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        document.body.appendChild(wrapper);

        write(list, [{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        UISystem.flush();

        const labels = Array.from(wrapper.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['A', 'B', 'C']);
    });
});