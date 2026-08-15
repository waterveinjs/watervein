// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { scope } from '../src/scope.js';
import { div } from '../src/index.js';
import { createState, read, UISystem } from '@watervein/core';
import { mount, unmount } from '@watervein/dom-core';

describe('Watervein DOM - Explicit Entity Cleanup', () => {
    it('should destroy entity and trigger cleanup instantly on unmount', () => {
        const container = document.createElement('div');
        const cleanupSpy = vi.fn();

        const Counter = scope(() => {
            const count = createState(0);
            return div({
                ref: () => () => { cleanupSpy(); }
            }, () => `Count: ${read(count)}`);
        });

        const el = Counter();
        mount(container, el);
        UISystem.flush();

        unmount(el);

        expect(cleanupSpy).toHaveBeenCalledTimes(1);
    });
});