import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCompute,
  createEffect,
  createEntity,
  createState,
  DataSystem,
  DestructionSystem,
  FLAG_DIRTY,
  read,
  UISystem,
  withEntity,
  write,
} from '../src/index.js';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Watervein Core - Scheduler depth bookkeeping', () => {
  it('records the enqueue depth and makes the node schedulable again after flush', () => {
    vi.useFakeTimers();

    const source = createState(0);
    const spy = vi.fn();
    const effect = createEffect(() => {
      spy(read(source));
    });

    write(source, 1);

    expect(effect.scheduledDepth).toBe(1);
    expect(effect.bucketIdx).toBe(0);
    expect(effect.ft & FLAG_DIRTY).not.toBe(0);

    UISystem.flush();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(effect.bucketIdx).toBe(-1);
    expect(effect.ft & FLAG_DIRTY).toBe(0);

    write(source, 2);

    expect(effect.scheduledDepth).toBe(1);
    expect(effect.bucketIdx).toBe(0);
    expect(effect.ft & FLAG_DIRTY).not.toBe(0);

    UISystem.flush();

    expect(spy).toHaveBeenCalledTimes(3);
    expect(effect.bucketIdx).toBe(-1);
    expect(effect.ft & FLAG_DIRTY).toBe(0);
  });

  it('does not enqueue the same node more than once before a flush', () => {
    vi.useFakeTimers();

    const source = createState(0);
    const spy = vi.fn();
    const effect = createEffect(() => {
      read(source);
      spy();
    });

    write(source, 1);
    const originalBucketIndex = effect.bucketIdx;
    const originalScheduledDepth = effect.scheduledDepth;

    DataSystem.schedule(effect);
    DataSystem.schedule(effect);

    expect(effect.bucketIdx).toBe(originalBucketIndex);
    expect(effect.scheduledDepth).toBe(originalScheduledDepth);
    expect(effect.ft & FLAG_DIRTY).not.toBe(0);

    UISystem.flush();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(effect.bucketIdx).toBe(-1);
    expect(effect.ft & FLAG_DIRTY).toBe(0);
  });

  it('repairs the moved node index when a queued entity is removed from the middle of a bucket', () => {
    vi.useFakeTimers();

    const source = createState(0);
    const entities = [createEntity(), createEntity(), createEntity()];
    const spies = [vi.fn(), vi.fn(), vi.fn()];
    const effects = entities.map((entity, index) =>
      withEntity(entity, () =>
        createEffect(() => {
          read(source);
          spies[index]();
        }),
      ),
    );

    write(source, 1);

    expect(effects.map((effect) => effect.bucketIdx).sort()).toEqual([
      0, 1, 2,
    ]);

    const removedEffect = effects.find(
      (effect) => effect.bucketIdx === 1,
    )!;
    const movedEffect = effects.find((effect) => effect.bucketIdx === 2)!;
    const removedIndex = effects.indexOf(removedEffect);

    DestructionSystem.destroyEntity(entities[removedIndex]);

    expect(removedEffect.bucketIdx).toBe(-1);
    expect(removedEffect.scheduledDepth).toBe(-1);
    expect(movedEffect.bucketIdx).toBe(1);

    UISystem.flush();

    for (let i = 0; i < spies.length; i++) {
      expect(spies[i]).toHaveBeenCalledTimes(i === removedIndex ? 1 : 2);
    }
    expect(movedEffect.bucketIdx).toBe(-1);
  });

  it('removes a queued node from its scheduled bucket even if its current depth changes', () => {
    vi.useFakeTimers();

    const source = createState(0);
    const middle = createCompute(() => read(source) + 1);
    const entity = createEntity();
    const spy = vi.fn();
    let effect!: ReturnType<typeof createEffect>;

    withEntity(entity, () => {
      effect = createEffect(() => {
        read(middle);
        spy();
      });
    });

    expect(effect.depth).toBe(2);

    DataSystem.schedule(effect);

    const enqueueDepth = effect.scheduledDepth;
    expect(enqueueDepth).toBe(2);
    expect(effect.bucketIdx).toBe(0);

    middle.depth += 5;
    DataSystem.propagateDepth(middle);

    expect(effect.depth).toBe(7);
    expect(effect.scheduledDepth).toBe(enqueueDepth);
    expect(effect.bucketIdx).toBe(0);

    DestructionSystem.destroyEntity(entity);

    expect(effect.bucketIdx).toBe(-1);
    expect(effect.scheduledDepth).toBe(-1);

    UISystem.flush();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
