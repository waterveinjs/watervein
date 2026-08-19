// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createState, createEffect, read, write, UISystem } from '@watervein/core';
import { Show, For, ForHandle } from '../src/base.js';

function mountFor(container: ForHandle): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.appendChild(container.fragment);
    document.body.appendChild(wrapper);
    return wrapper;
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

    it('renders elseFn output when condition is initially false', () => {
        const condition = createState(false);
        const el = Show(
            condition,
            () => { const d = document.createElement('div'); d.textContent = 'then'; return d; },
            () => { const d = document.createElement('div'); d.textContent = 'else'; return d; }
        );
        document.body.appendChild(el);
        expect(el.textContent).toBe('else');
    });

    it('does not re-render or flash when condition updates to the same truthy value', () => {
        const condition = createState(true);
        const renderCalls = vi.fn();

        const el = Show(
            condition,
            () => {
                renderCalls();
                const d = document.createElement('div');
                d.textContent = 'then';
                return d;
            }
        );
        document.body.appendChild(el);
        expect(renderCalls).toHaveBeenCalledTimes(1);

        write(condition, true);
        UISystem.flush();

        expect(renderCalls).toHaveBeenCalledTimes(1);
    });

    it('properly disposes effects inside the unmounted branch', () => {
        const condition = createState(true);
        const innerState = createState('initial');
        const effectSpy = vi.fn();

        const el = Show(
            condition,
            () => {
                const d = document.createElement('div');
                createEffect(() => {
                    effectSpy(innerState);
                });
                return d;
            }
        );
        document.body.appendChild(el);
        expect(effectSpy).toHaveBeenCalledTimes(1);

        write(condition, false);
        UISystem.flush();

        write(innerState, 'changed');
        UISystem.flush();

        expect(effectSpy).toHaveBeenCalledTimes(1);
    });

    it('handles rapid toggling multiple times without leaking effects from earlier branches', () => {
        const condition = createState(true);
        const innerState = createState(0);
        const effectSpy = vi.fn();

        const el = Show(
            condition,
            () => {
                const d = document.createElement('div');
                createEffect(() => {
                    effectSpy(read(innerState));
                });
                return d;
            },
            () => document.createElement('div')
        );
        document.body.appendChild(el);

        
        write(condition, false);
        UISystem.flush();
        write(condition, true);
        UISystem.flush();
        write(condition, false);
        UISystem.flush();
        write(condition, true);
        UISystem.flush();

        effectSpy.mockClear();
        write(innerState, 99);
        UISystem.flush();

        
        expect(effectSpy).toHaveBeenCalledTimes(1);
        expect(effectSpy).toHaveBeenCalledWith(99);
    });

    it('cleans up a nested For when its containing Show branch is removed', () => {
        const condition = createState(true);
        const list = createState([{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        const itemEffectSpy = vi.fn();

        const el = Show(
            condition,
            () => {
                const container = For(
                    list,
                    (item) => item.id,
                    (getItem) => {
                        const d = document.createElement('div');
                        createEffect(() => {
                            itemEffectSpy(getItem().label);
                        });
                        return d;
                    }
                );
                const wrapper = document.createElement('div');
                wrapper.appendChild(container.fragment);
                return wrapper;
            }
        );
        document.body.appendChild(el);
        itemEffectSpy.mockClear();

        write(condition, false);
        UISystem.flush();

        write(list, [{ id: 1, label: 'A-changed' }, { id: 2, label: 'B-changed' }]);
        UISystem.flush();

        expect(itemEffectSpy).not.toHaveBeenCalled();
        expect(el.querySelectorAll('div').length).toBe(0);
    });

    it('supports a Show nested inside another Show, disposing the inner branch when the outer switches', () => {
        const outer = createState(true);
        const inner = createState(true);
        const innerEffectSpy = vi.fn();

        const el = Show(
            outer,
            () => {
                const innerEl = Show(
                    inner,
                    () => {
                        const d = document.createElement('div');
                        createEffect(() => innerEffectSpy());
                        return d;
                    }
                );
                return innerEl;
            },
            () => document.createElement('div')
        );
        document.body.appendChild(el);
        expect(innerEffectSpy).toHaveBeenCalledTimes(1);

        write(outer, false);
        UISystem.flush();

        innerEffectSpy.mockClear();
        write(inner, false);
        UISystem.flush();

        
        expect(innerEffectSpy).not.toHaveBeenCalled();
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
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['A', 'B', 'C']);
    });

    it('removes the DOM element for items removed from the list', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);

        write(list, [{ id: 1, label: 'A' }, { id: 3, label: 'C' }]);
        UISystem.flush();

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['A', 'C']);
    });

    it('reuses the same DOM element instance for unchanged keys (no re-render on update)', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        const renderCalls = vi.fn();

        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                renderCalls();
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);

        const firstDivs = Array.from(w.querySelectorAll('div'));
        renderCalls.mockClear();

        write(list, [{ id: 1, label: 'A-updated' }, { id: 2, label: 'B' }]);
        UISystem.flush();

        expect(renderCalls).not.toHaveBeenCalled();

        const secondDivs = Array.from(w.querySelectorAll('div'));
        expect(secondDivs[0]).toBe(firstDivs[0]);
        expect(secondDivs[1]).toBe(firstDivs[1]);
    });

    it('reflects updated item data through getItem() without recreating the DOM node', () => {
        const list = makeList([{ id: 1, label: 'A' }]);
        const container = For(
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
        const w = mountFor(container);

        document.body.appendChild(w);

        expect(w.querySelector('div')!.textContent).toBe('A');

        write(list, [{ id: 1, label: 'A-updated' }]);
        UISystem.flush();

        expect(w.querySelector('div')!.textContent).toBe('A-updated');
    });

    it('reorders existing DOM elements to match new list order (no new items involved)', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);

        write(list, [{ id: 3, label: 'C' }, { id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        UISystem.flush();

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['C', 'A', 'B']);
    });

    it('appends a brand-new item at the end even when there were zero prior items', () => {
        const list = makeList([]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);

        write(list, [{ id: 1, label: 'A' }]);
        UISystem.flush();

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['A']);
    });

    it('inserts a new item in the middle at the correct position within a single flush', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 3, label: 'C' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);

        write(list, [{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        UISystem.flush();

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['A', 'B', 'C']);
    });

    it('handles a complete swap of the entire list correctly', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);

        write(list, [{ id: 3, label: 'X' }, { id: 4, label: 'Y' }]);
        UISystem.flush();

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['X', 'Y']);
    });

    it('clears all DOM elements when the list becomes empty', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);
        expect(w.querySelectorAll('div').length).toBe(2);

        write(list, []);
        UISystem.flush();

        expect(w.querySelectorAll('div').length).toBe(0);
    });

    it('handles complex shuffle, delete, and insert operations combined in a single flush', () => {
        const list = makeList([
            { id: 1, label: 'A' },
            { id: 2, label: 'B' },
            { id: 3, label: 'C' },
            { id: 4, label: 'D' }
        ]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);

        document.body.appendChild(w);

        write(list, [
            { id: 4, label: 'D' },
            { id: 5, label: 'E' },
            { id: 1, label: 'A' },
            { id: 3, label: 'C' }
        ]);
        UISystem.flush();

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['D', 'E', 'A', 'C']);
    });

    it('disposes inner effects of a single removed item without affecting remaining items', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        const item1EffectSpy = vi.fn();
        const item2EffectSpy = vi.fn();

        const wrapper = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                createEffect(() => {
                    const data = getItem();
                    if (data.id === 1) item1EffectSpy(data.label);
                    if (data.id === 2) item2EffectSpy(data.label);
                });
                return d;
            }
        );
        document.body.appendChild(wrapper.fragment);
        item1EffectSpy.mockClear();
        item2EffectSpy.mockClear();

        write(list, [{ id: 2, label: 'B-updated' }]);
        UISystem.flush();

        expect(item2EffectSpy).toHaveBeenCalledWith('B-updated');
        expect(item1EffectSpy).not.toHaveBeenCalled();
    });

    it('swaps two rows in place and preserves the DOM element identity for both', () => {
        const list = makeList([
            { id: 1, label: 'A' },
            { id: 2, label: 'B' },
            { id: 3, label: 'C' }
        ]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);
        document.body.appendChild(w);

        const before = Array.from(w.querySelectorAll('div'));

        write(list, [
            { id: 3, label: 'C' },
            { id: 2, label: 'B' },
            { id: 1, label: 'A' }
        ]);
        UISystem.flush();

        const after = Array.from(w.querySelectorAll('div'));
        expect(after.map((d) => d.textContent)).toEqual(['C', 'B', 'A']);
        
        expect(after[0]).toBe(before[2]);
        expect(after[1]).toBe(before[1]);
        expect(after[2]).toBe(before[0]);
    });

    it('goes from populated to empty and back to populated without stale DOM nodes', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);
        document.body.appendChild(w);

        write(list, []);
        UISystem.flush();
        expect(w.querySelectorAll('div').length).toBe(0);

        write(list, [{ id: 3, label: 'X' }]);
        UISystem.flush();

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['X']);
    });

    it('disposes all inner effects when the list is fully cleared', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        const effectSpy = vi.fn();

        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                createEffect(() => {
                    effectSpy(getItem().id);
                });
                return d;
            }
        );
        const w = mountFor(container);
        document.body.appendChild(w);
        effectSpy.mockClear();

        write(list, []);
        UISystem.flush();

        
        
        write(list, []);
        UISystem.flush();

        expect(effectSpy).not.toHaveBeenCalled();
    });

    it('does not re-run renderFn for items that are only reordered, not changed', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        const renderCalls = vi.fn();

        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                renderCalls();
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);
        document.body.appendChild(w);
        renderCalls.mockClear();

        write(list, [{ id: 3, label: 'C' }, { id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        UISystem.flush();

        expect(renderCalls).not.toHaveBeenCalled();
    });

    it('handles consecutive updates within separate flushes correctly (no dropped changes)', () => {
        const list = makeList([{ id: 1, label: 'A' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);
        document.body.appendChild(w);

        write(list, [{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        UISystem.flush();
        write(list, [{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        UISystem.flush();
        write(list, [{ id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        UISystem.flush();

        const labels = Array.from(w.querySelectorAll('div')).map((d) => d.textContent);
        expect(labels).toEqual(['B', 'C']);
    });

    it('renders a For nested inside another For without cross-contaminating item state', () => {
        const outerList = createState([
            { id: 1, items: createState([{ id: 10, label: 'a' }]) },
            { id: 2, items: createState([{ id: 20, label: 'b' }]) }
        ]);

        const container = For(
            outerList,
            (outerItem) => outerItem.id,
            (getOuterItem) => {
                const outerDiv = document.createElement('div');
                const innerContainer = For(
                    getOuterItem().items,
                    (innerItem) => innerItem.id,
                    (getInnerItem) => {
                        const innerDiv = document.createElement('span');
                        innerDiv.textContent = getInnerItem().label;
                        return innerDiv;
                    }
                );
                outerDiv.appendChild(innerContainer.fragment);
                return outerDiv;
            }
        );
        const w = mountFor(container);
        document.body.appendChild(w);

        const labels = Array.from(w.querySelectorAll('span')).map((s) => s.textContent);
        expect(labels).toEqual(['a', 'b']);
    });

    it('leaves DOM untouched when writing an identical list (same keys, same references)', () => {
        const items = [{ id: 1, label: 'A' }, { id: 2, label: 'B' }];
        const list = createState(items);
        const renderCalls = vi.fn();

        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                renderCalls();
                const d = document.createElement('div');
                d.textContent = getItem().label;
                return d;
            }
        );
        const w = mountFor(container);
        document.body.appendChild(w);
        renderCalls.mockClear();
        const before = Array.from(w.querySelectorAll('div'));

        write(list, items);
        UISystem.flush();

        const after = Array.from(w.querySelectorAll('div'));
        expect(renderCalls).not.toHaveBeenCalled();
        expect(after).toEqual(before);
    });

    it('does not remove sibling elements when clearing the list to empty', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.className = 'row';
                d.textContent = getItem().label;
                return d;
            }
        );

        const parent = document.createElement('div');
        document.body.appendChild(parent);

        const before = document.createElement('span');
        before.id = 'before-sibling';
        before.textContent = 'before';
        parent.appendChild(before);

        parent.appendChild(container.fragment);

        const after = document.createElement('span');
        after.id = 'after-sibling';
        after.textContent = 'after';
        parent.appendChild(after);

        expect(parent.querySelectorAll('.row').length).toBe(2);
        expect(parent.querySelector('#before-sibling')).not.toBeNull();
        expect(parent.querySelector('#after-sibling')).not.toBeNull();

        write(list, []);
        UISystem.flush();

        expect(parent.querySelectorAll('.row').length).toBe(0);
        expect(parent.querySelector('#before-sibling')).not.toBeNull();
        expect(parent.querySelector('#after-sibling')).not.toBeNull();
        expect(parent.querySelector('#before-sibling')!.textContent).toBe('before');
        expect(parent.querySelector('#after-sibling')!.textContent).toBe('after');
    });

    it('does not remove another For\'s rows when clearing one For sharing the same parent', () => {
        const listA = makeList([{ id: 1, label: 'A1' }, { id: 2, label: 'A2' }]);
        const listB = makeList([{ id: 10, label: 'B1' }, { id: 11, label: 'B2' }, { id: 12, label: 'B3' }]);

        const containerA = For(
            listA,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.className = 'row-a';
                d.textContent = getItem().label;
                return d;
            }
        );

        const containerB = For(
            listB,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.className = 'row-b';
                d.textContent = getItem().label;
                return d;
            }
        );

        const parent = document.createElement('div');
        document.body.appendChild(parent);
        parent.appendChild(containerA.fragment);
        parent.appendChild(containerB.fragment);

        expect(parent.querySelectorAll('.row-a').length).toBe(2);
        expect(parent.querySelectorAll('.row-b').length).toBe(3);

        write(listA, []);
        UISystem.flush();

        expect(parent.querySelectorAll('.row-a').length).toBe(0);
        expect(parent.querySelectorAll('.row-b').length).toBe(3);
        const bLabels = Array.from(parent.querySelectorAll('.row-b')).map((d) => d.textContent);
        expect(bLabels).toEqual(['B1', 'B2', 'B3']);
    });

    it('does not remove the other For\'s rows when clearing the second For sharing the same parent (reverse order)', () => {
        const listA = makeList([{ id: 1, label: 'A1' }, { id: 2, label: 'A2' }]);
        const listB = makeList([{ id: 10, label: 'B1' }, { id: 11, label: 'B2' }]);

        const containerA = For(
            listA,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.className = 'row-a';
                d.textContent = getItem().label;
                return d;
            }
        );

        const containerB = For(
            listB,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.className = 'row-b';
                d.textContent = getItem().label;
                return d;
            }
        );

        const parent = document.createElement('div');
        document.body.appendChild(parent);
        parent.appendChild(containerA.fragment);
        parent.appendChild(containerB.fragment);

        write(listB, []);
        UISystem.flush();

        expect(parent.querySelectorAll('.row-b').length).toBe(0);
        expect(parent.querySelectorAll('.row-a').length).toBe(2);
        const aLabels = Array.from(parent.querySelectorAll('.row-a')).map((d) => d.textContent);
        expect(aLabels).toEqual(['A1', 'A2']);
    });

    it('preserves siblings and can repopulate correctly after clearing with siblings present', () => {
        const list = makeList([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
        const container = For(
            list,
            (item) => item.id,
            (getItem) => {
                const d = document.createElement('div');
                d.className = 'row';
                d.textContent = getItem().label;
                return d;
            }
        );

        const parent = document.createElement('div');
        document.body.appendChild(parent);

        const marker1 = document.createElement('p');
        marker1.id = 'marker1';
        parent.appendChild(marker1);

        parent.appendChild(container.fragment);

        const marker2 = document.createElement('p');
        marker2.id = 'marker2';
        parent.appendChild(marker2);

        write(list, []);
        UISystem.flush();

        expect(parent.querySelectorAll('.row').length).toBe(0);
        expect(parent.querySelector('#marker1')).not.toBeNull();
        expect(parent.querySelector('#marker2')).not.toBeNull();

        write(list, [{ id: 4, label: 'D' }, { id: 5, label: 'E' }]);
        UISystem.flush();

        const labels = Array.from(parent.querySelectorAll('.row')).map((d) => d.textContent);
        expect(labels).toEqual(['D', 'E']);
        expect(parent.querySelector('#marker1')).not.toBeNull();
        expect(parent.querySelector('#marker2')).not.toBeNull();
        const childTags = Array.from(parent.children).map((c) => c.tagName + (c.id ? `#${c.id}` : c.className ? `.${c.className}` : ''));
        expect(childTags[0]).toBe('P#marker1');
        expect(childTags[childTags.length - 1]).toBe('P#marker2');
    });
});