import { describe, it, expect, vi } from 'vitest';
import {
  createState,
  createCompute,
  createEffect,
  createSelector,
  read,
  write,
  UISystem,
  createEntity,
  withEntity,
  DestructionSystem,
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

  it('should not duplicate a subscription when an effect reads the same key repeatedly', () => {
    const selectedId = createState<number>(1);
    const isSelected = createSelector(selectedId);
    const effect = vi.fn(() => {
      isSelected(1);
      isSelected(1);
    });

    createEffect(effect);
    expect(effect).toHaveBeenCalledTimes(1);

    write(selectedId, 2);
    UISystem.flush();

    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('should move a dynamic subscription to the newly observed key', () => {
    const selectedId = createState<number>(1);
    const observedId = createState<number>(1);
    const isSelected = createSelector(selectedId);
    const effect = vi.fn(() => isSelected(read(observedId)));

    createEffect(effect);
    expect(effect).toHaveBeenCalledTimes(1);

    write(observedId, 2);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(2);

    write(selectedId, 3);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(2);

    write(selectedId, 2);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it('should move a dynamic subscription when a compute reruns', () => {
    const selectedId = createState<number>(1);
    const observedId = createState<number>(1);
    const isSelected = createSelector(selectedId);
    const compute = vi.fn(() => isSelected(read(observedId)));

    createCompute(compute);
    expect(compute).toHaveBeenCalledTimes(1);

    write(observedId, 2);
    UISystem.flush();
    expect(compute).toHaveBeenCalledTimes(2);

    write(selectedId, 3);
    UISystem.flush();
    expect(compute).toHaveBeenCalledTimes(2);

    write(selectedId, 2);
    UISystem.flush();
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('should track multiple selectors independently on one effect', () => {
    const firstSelected = createState<number>(1);
    const secondSelected = createState<number>(10);
    const observedFirst = createState<number>(1);
    const observedSecond = createState<number>(10);
    const isFirstSelected = createSelector(firstSelected);
    const isSecondSelected = createSelector(secondSelected);
    const effect = vi.fn(() => {
      isFirstSelected(read(observedFirst));
      isSecondSelected(read(observedSecond));
    });

    createEffect(effect);
    expect(effect).toHaveBeenCalledTimes(1);

    write(observedFirst, 2);
    write(observedSecond, 20);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(2);

    write(firstSelected, 3);
    write(secondSelected, 30);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(2);

    write(firstSelected, 2);
    write(secondSelected, 20);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it('should reconcile subscriptions after promoting a high-cardinality lookup', () => {
    const selectedId = createState<number>(0);
    const observedIds = createState<number[]>([0, 1, 2, 3, 4]);
    const isSelected = createSelector(selectedId);
    const effect = vi.fn(() => {
      for (const id of read(observedIds)) isSelected(id);
    });

    createEffect(effect);
    expect(effect).toHaveBeenCalledTimes(1);

    write(observedIds, [1, 2, 3, 4, 5]);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(2);

    write(selectedId, 6);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(2);

    write(selectedId, 5);
    UISystem.flush();
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it('should remove selector subscriptions when the owning entity is destroyed', () => {
    const selectedId = createState<number>(1);
    const isSelected = createSelector(selectedId);
    const entityId = createEntity();
    const effect = vi.fn();

    withEntity(entityId, () => {
      createEffect(() => effect(isSelected(1)));
    });

    expect(effect).toHaveBeenCalledTimes(1);
    DestructionSystem.destroyEntity(entityId);
    effect.mockClear();

    write(selectedId, 2);
    UISystem.flush();

    expect(effect).not.toHaveBeenCalled();
  });
});
