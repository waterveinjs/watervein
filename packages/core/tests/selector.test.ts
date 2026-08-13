import { describe, it, expect, vi } from 'vitest';
import { 
    createState, 
    createEffect, 
    createSelector,
    write, 
    UISystem 
} from '../src/index.js';

describe('Watervein Core - Selector System', () => {

    it('should correctly determine the initial selected state', () => {
        const selectedId = createState<number>(1);
        const isSelected = createSelector(selectedId);

        expect(isSelected(1)).toBe(true);
        expect(isSelected(2)).toBe(false);
        expect(isSelected(3)).toBe(false);
    });

    it('should notify ONLY the unselected and newly selected targets on state change (O(1) update)', () => {
        const selectedId = createState<number>(1);
        const isSelected = createSelector(selectedId);

        const effect1 = vi.fn();
        const effect2 = vi.fn();
        const effect3 = vi.fn();

        createEffect(() => {
            effect1(isSelected(1));
        });

        createEffect(() => {
            effect2(isSelected(2));
        });

        createEffect(() => {
            effect3(isSelected(3));
        });

        expect(effect1).toHaveBeenCalledWith(true);
        expect(effect2).toHaveBeenCalledWith(false);
        expect(effect3).toHaveBeenCalledWith(false);

        vi.clearAllMocks();

        write(selectedId, 2);
        UISystem.flush();

        expect(effect1).toHaveBeenCalledTimes(1);
        expect(effect1).toHaveBeenCalledWith(false);

        expect(effect2).toHaveBeenCalledTimes(1);
        expect(effect2).toHaveBeenCalledWith(true);

        expect(effect3).not.toHaveBeenCalled();
    });

    it('should handle unselecting completely (setting to null or invalid ID)', () => {
        const selectedId = createState<number | null>(1);
        const isSelected = createSelector(selectedId as any);

        const effect1 = vi.fn();
        const effect2 = vi.fn();

        createEffect(() => effect1(isSelected(1)));
        createEffect(() => effect2(isSelected(2)));

        vi.clearAllMocks();

        write(selectedId, null);
        UISystem.flush();

        expect(effect1).toHaveBeenCalledTimes(1);
        expect(effect1).toHaveBeenCalledWith(false);

        expect(effect2).not.toHaveBeenCalled();
    });

    it('should update correctly when multiple subscribers watch the same key', () => {
        const selectedId = createState<number>(10);
        const isSelected = createSelector(selectedId);

        const effectRow = vi.fn();
        const effectSidebar = vi.fn();

        createEffect(() => effectRow(isSelected(10)));
        createEffect(() => effectSidebar(isSelected(10)));

        vi.clearAllMocks();

        write(selectedId, 20);
        UISystem.flush();

        expect(effectRow).toHaveBeenCalledWith(false);
        expect(effectSidebar).toHaveBeenCalledWith(false);
    });
});