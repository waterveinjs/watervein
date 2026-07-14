// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createState, write, UISystem, read } from '@watervein/core';
import { mount, div, button, span } from '../src/index.js';
import { errorBoundary } from '../src/errorBoundary.js'; 

describe('Watervein DOM - errorBoundary Functional Integration', () => {

    it('should render the normal UI initially and switch to the fallback UI upon a graph error', () => {
        const container = document.createElement('div');
        const isPoisoned = createState(false);

        const app = errorBoundary(
            () => div({ id: 'normal-root' }, [
                span({}, () => {
                    if (read(isPoisoned)) {
                        throw new Error('DOM Triggered Graph Crash');
                    }
                    return 'Everything is fine';
                })
            ]),
            (error) => div({ id: 'error-root', class: 'bg-red' }, [
                span({ id: 'error-msg' }, error.message)
            ])
        );

        mount(container, app);

        const normalRoot = container.querySelector('#normal-root');
        expect(normalRoot).not.toBeNull();
        expect(container.textContent).toBe('Everything is fine');
        expect(container.querySelector('#error-root')).toBeNull();

        write(isPoisoned, true);

        expect(() => {
            UISystem.flush();
        }).not.toThrow();

        expect(container.querySelector('#normal-root')).toBeNull();
        
        const errorRoot = container.querySelector('#error-root');
        const errorMsg = container.querySelector('#error-msg');
        
        expect(errorRoot).not.toBeNull();
        expect(errorRoot?.classList.contains('bg-red')).toBe(true);
        expect(errorMsg?.textContent).toBe('DOM Triggered Graph Crash');
    });

    it('should support rendering state values inside the fallback view', () => {
        const container = document.createElement('div');
        const shouldCrash = createState(false);
        const retryCount = createState(0);

        const app = errorBoundary(
            () => div({}, [
                span({}, () => {
                    if (read(shouldCrash)) throw new Error('Fault');
                    return 'Operational';
                })
            ]),
            (error) => div({ id: 'fallback' }, [
                button({ 
                    id: 'retry-btn',
                    onclick: () => write(retryCount, read(retryCount) + 1) 
                }, () => `Retry Count: ${read(retryCount)}`)
            ])
        );

        mount(container, app);

        write(shouldCrash, true);
        UISystem.flush();

        const btn = container.querySelector('#retry-btn') as HTMLButtonElement;
        expect(btn.textContent).toBe('Retry Count: 0');

        btn.dispatchEvent(new MouseEvent('click'));
        UISystem.flush();

        expect(btn.textContent).toBe('Retry Count: 1');
    });
});