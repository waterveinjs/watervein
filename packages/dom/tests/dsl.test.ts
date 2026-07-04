// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { createState, write, UISystem, read, createCompute } from '@watervein/core';
import { mount, element, Show, For, button, span, div } from '../src/index.js';

describe('Watervein DOM - High Level DSL (element/Show/For)', () => {

    it('should create valid element sub-graphs with atomic text tracking', () => {
        const container = document.createElement('div');
        const count = createState(0);

        const app = span({}, [
            button({ id: 'btn', onclick: () => { write(count, 10); UISystem.flush(); } }, "Click"),
            span({ id: 'text' }, () => `Value: ${read(count)}`)
        ]);

        mount(container, app);

        const btnEl = container.querySelector('#btn') as HTMLButtonElement;
        const textEl = container.querySelector('#text') as HTMLSpanElement;

        expect(btnEl.textContent).toBe('Click');
        expect(textEl.textContent).toBe('Value: 0');

        btnEl.click();

        expect(textEl.textContent).toBe('Value: 10');
    });

    it('binds a plain attribute reactively when passed a WvNode directly (non-style/class key)', () => {
        const isDisabled = createState(false);
        const container = document.createElement('div');

        const btn = button({ id: 'btn', disabled: isDisabled }, 'Submit');
        mount(container, btn);

        const btnEl = container.querySelector('#btn') as HTMLButtonElement;
        expect(btnEl.disabled).toBe(false);

        write(isDisabled, true);
        UISystem.flush();

        expect(btnEl.disabled).toBe(true);
    });

    it('toggles classList entries from a reactive class map (object form)', () => {
        const isActive = createState(false);
        const container = document.createElement('div');

        const d = div({ id: 'box', class: { active: isActive, static: true } }, '');
        mount(container, d);

        const boxEl = container.querySelector('#box') as HTMLDivElement;
        expect(boxEl.classList.contains('active')).toBe(false);
        expect(boxEl.classList.contains('static')).toBe(true);

        write(isActive, true);
        UISystem.flush();

        expect(boxEl.classList.contains('active')).toBe(true);
    });

    it('swaps a single reactive class from an array of dynamic class entries', () => {
        const theme = createState('light');
        const container = document.createElement('div');

        const d = div({ id: 'box', class: [() => theme.value ?? read(theme)] }, '');
        const themeNode = theme;
        const d2 = div({ id: 'box2', class: [() => `theme-${read(themeNode)}`] }, '');
        mount(container, d2);

        const boxEl = container.querySelector('#box2') as HTMLDivElement;
        expect(boxEl.classList.contains('theme-light')).toBe(true);

        write(theme, 'dark');
        UISystem.flush();

        expect(boxEl.classList.contains('theme-dark')).toBe(true);
        expect(boxEl.classList.contains('theme-light')).toBe(false);
    });

    it('applies a plain reactive style object (per-key WvNode/function values)', () => {
        const color = createState('red');
        const container = document.createElement('div');

        const d = div({ id: 'box', style: { color: () => read(color), fontWeight: 'bold' } }, '');
        mount(container, d);

        const boxEl = container.querySelector('#box') as HTMLDivElement;
        expect(boxEl.style.color).toBe('red');
        expect(boxEl.style.fontWeight).toBe('bold');

        write(color, 'blue');
        UISystem.flush();

        expect(boxEl.style.color).toBe('blue');
    });

    it('binds a single WvNode<string> passed as the whole `style` value to cssText', () => {
        const styleString = createState('color: red; font-weight: bold;');
        const container = document.createElement('div');

        const d = div({ id: 'box', style: styleString as any }, '');
        mount(container, d);

        const boxEl = container.querySelector('#box') as HTMLDivElement;
        expect(boxEl.style.color).toBe('red');
        expect(boxEl.style.fontWeight).toBe('bold');

        write(styleString, 'color: blue;');
        UISystem.flush();

        expect(boxEl.style.color).toBe('blue');
    });

    it('re-exports Show correctly through the DSL wrapper', () => {
        const condition = createState(true);
        const container = document.createElement('div');

        const el = Show(
            condition,
            () => div({ id: 'then' }, 'then-branch'),
            () => div({ id: 'else' }, 'else-branch')
        );
        mount(container, el);

        expect(container.querySelector('#then')?.textContent).toBe('then-branch');

        write(condition, false);
        UISystem.flush();

        expect(container.querySelector('#else')?.textContent).toBe('else-branch');
        expect(container.querySelector('#then')).toBeNull();
    });

    it('re-exports For correctly and keeps per-item reactive class bindings intact', () => {
        const items = createState([
            { id: 1, label: 'A', active: false },
        ]);
        const container = document.createElement('div');

        const list = For(
            items,
            (item) => item.id,
            (getItem) => div(
                {
                    id: `item-${getItem().id}`,
                    class: { active: createCompute(() => getItem().active) }
                },
                () => getItem().label
            )
        );
        mount(container, list);

        const itemEl = container.querySelector('#item-1') as HTMLDivElement;
        expect(itemEl.textContent).toBe('A');
        expect(itemEl.classList.contains('active')).toBe(false);

        write(items, [{ id: 1, label: 'A-updated', active: true }]);
        UISystem.flush();

        expect(itemEl.textContent).toBe('A-updated');
        expect(itemEl.classList.contains('active')).toBe(true);
    });

    it('renders numeric and plain string children without wrapping them in reactive bindings', () => {
        const container = document.createElement('div');
        const d = div({ id: 'box' }, [42, ' items']);
        mount(container, d);

        const boxEl = container.querySelector('#box') as HTMLDivElement;
        expect(boxEl.textContent).toBe('42 items');
    });
});