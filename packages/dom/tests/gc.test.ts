// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { scope } from '../src/scope.js';
import { div, mount } from '../src/index.js';
import { createState, read, UISystem } from '@watervein/core';
import { __flushGCObserver } from '../src/gc.js';

describe('Watervein DOM - Automatic Entity GC', () => {
    it('should automatically destroy the entity and trigger cleanup when element is removed from DOM', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const cleanupSpy = vi.fn();

        const Counter = scope(() => {
            const count = createState(0);
            
            return div({
                ref: () => {
                    return () => {
                        cleanupSpy();
                    };
                }
            }, () => `Count: ${read(count)}`);
        });

        const el = Counter();
        mount(container, el);
        UISystem.flush();

        expect(cleanupSpy).not.toHaveBeenCalled();

        container.removeChild(el);

        __flushGCObserver();

        UISystem.flush();

        expect(cleanupSpy).toHaveBeenCalledTimes(1);

        container.remove();
    });
});