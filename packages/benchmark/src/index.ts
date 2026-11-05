/* eslint-disable no-console */
/**
 * Watervein benchmark suite (revised)
 *
 * Assumptions for Measurement:
 *  1. Measure in the production build      : `vite build && vite preview`
 *  2. High-Precision Timer                 : Set the COOP/COEP header and enable crossOriginIsolated (in 5-microsecond increments)
 *  3. Optional Memory Measurement          : chrome --js-flags=--expose-gc --enable-precise-memory-info
 *  4. Close DevTools and close the other tabs as well
 *
 * Usage (Browser Console):
 *   await runWaterveinBenchmark()                        // Basic Suite (with sanity check)
 *   await runWaterveinBenchmark({ includeLayout: true }) // Include layout forcing in the DOM systems
 *   await runWaterveinBenchmark({ only: 'fan' })         // Only those with "fan" in the ID or titlec
 *   await runWaterveinScaleBenchmark()                   // By Scale
 *   await runWaterveinLeakCheck()                        // Leak Check (gc flag required)
 *
 * For each case, discard the warmup runs and measure the results for the runs, then report the median (along with the minimum and maximum values).
 */
import type { Node as WvNode } from '@watervein/core';
import {
  createState,
  createCompute,
  createEffect,
  read,
  write,
  createEntity,
  withEntity,
  DestructionSystem,
  UISystem,
  batch,
} from '@watervein/core';
import { element as el0, For as for0 } from '@watervein/dom-core';

/* ------------------------------------------------------------------ */
/* Types & config                                                      */
/* ------------------------------------------------------------------ */
type Sample = Record<string, number>;
type Ops = number | Record<string, number>;

type Case = {
  id: string;
  title: string;
  params?: string;
  /** Number of operations used for conversion per operation (if a numeric value, applies to all metrics) */
  ops?: Ops;
  run: () => Sample | Promise<Sample>;
};

type Row = {
  id: string;
  title: string;
  metric: string;
  medianMs: number;
  minMs: number;
  maxMs: number;
  perOp: string;
  valid: boolean;
};

export type BenchOptions = {
  warmup?: number;
  runs?: number;
  /** If true, read `offsetHeight` in DOM-related cases to include layout */
  includeLayout?: boolean;
  /** Execute only if the id or title contains this string */
  only?: string;
};

const cfg = { includeLayout: false };

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */
const now = () => performance.now();
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const fmtN = (n: number) => n.toLocaleString('en-US');

let sink = 0;
const blackhole = (v: number) => {
  sink += v;
};

const gcFn = (): (() => void) | null => {
  const g = (window as any).gc;
  return typeof g === 'function' ? g : null;
};

function usedHeapMB(): number | null {
  const m = (performance as any).memory;
  return m ? m.usedJSHeapSize / 1024 / 1024 : null;
}

function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function timerResolution(): number {
  let min = Infinity;
  for (let i = 0; i < 50; i++) {
    const a = performance.now();
    let b = a; // eslint-disable-line no-useless-assignment
    while ((b = performance.now()) === a) {
      /* spin until the clock ticks */
    }
    min = Math.min(min, b - a);
  }
  return min;
}

const fmtMs = (v: number) =>
  v >= 1 ? `${v.toFixed(2)}ms` : `${(v * 1000).toFixed(1)}µs`;

const fmtPerOp = (ms: number, ops: number) => {
  const ns = (ms * 1e6) / ops;
  return ns >= 1000
    ? `${(ns / 1000).toFixed(2)}µs/op`
    : `${ns.toFixed(0)}ns/op`;
};

const failures: string[] = [];
const notes: string[] = [];
const expect = (cond: boolean, msg: string) => {
  if (!cond) failures.push(msg);
};
const note = (msg: string) => {
  notes.push(msg);
};

const owned: number[] = [];
const disposers: Array<() => void> = [];
const ownEntity = () => {
  const id = createEntity();
  owned.push(id);
  return id;
};
const onCleanup = (fn: () => void) => {
  disposers.push(fn);
};
function cleanup() {
  for (const fn of disposers.splice(0)) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  for (const id of owned.splice(0)) {
    try {
      DestructionSystem.destroyEntity(id);
    } catch {
      /* ignore */
    }
  }
  try {
    UISystem.flush();
  } catch {
    /* ignore */
  }
}

function mountFor(
  items: WvNode<any[]>,
  key: (x: any) => any,
  render: (item: () => any) => Node,
) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const c = for0(items, key, render as (getItem: () => any) => HTMLElement);
  host.appendChild(c.fragment);
  onCleanup(() => {
    try {
      c.unmount();
    } catch {
      /* ignore */
    }
    host.remove();
  });
  UISystem.flush();
  return host;
}

const forceLayout = (host: HTMLElement) => {
  if (cfg.includeLayout) blackhole(host.offsetHeight);
};

/* ------------------------------------------------------------------ */
/* Cases                                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a two-lane DAG, then update its root.
 * Computes are evaluated eagerly, so `build` already includes the first evaluation.
 */
function dagBuild(nodeCount: number): Sample {
  const half = Math.floor(nodeCount / 2);
  const entity = ownEntity();
  let root!: WvNode<number>;
  let left!: WvNode<number>;
  let right!: WvNode<number>;

  const t0 = now();
  withEntity(entity, () => {
    root = createState(0);
    left = createCompute(() => read<number>(root) + 1);
    right = createCompute(() => read<number>(root) + 2);
    for (let i = 0; i < half; i++) {
      const l = left;
      const r = right;
      left = createCompute(() => read<number>(l) + 1);
      right = createCompute(() => read<number>(r) + read<number>(l));
    }
  });
  const t1 = now();

  // Verify the built graph (untimed)
  const lv0 = read<number>(left);
  blackhole(read<number>(right));

  const t2 = now();
  write(root, 1);
  UISystem.flush();
  const t3 = now();

  // Verify the updated graph (untimed)
  const lv1 = read<number>(left);
  blackhole(read<number>(right));

  expect(lv0 === 1 + half, `dag: initial left tail ${lv0} !== ${1 + half}`);
  expect(lv1 === 2 + half, `dag: updated left tail ${lv1} !== ${2 + half}`);
  return { build: t1 - t0, update: t3 - t2 };
}

function highFrequencyUpdate(stateCount: number, iterations: number): Sample {
  const entity = ownEntity();
  const states: WvNode<number>[] = [];
  let runs = 0;
  withEntity(entity, () => {
    for (let i = 0; i < stateCount; i++) {
      const s = createState(0);
      const c = createCompute(() => read<number>(s) * 2);
      createEffect(() => {
        read<number>(c);
        runs++;
      });
      states.push(s);
    }
  });
  UISystem.flush();
  const base = runs;

  const t0 = now();
  for (let iter = 0; iter < iterations; iter++) {
    batch(() => {
      for (let i = 0; i < stateCount; i++) write(states[i], iter + 1);
    });
    UISystem.flush();
  }
  const t1 = now();

  expect(
    runs - base === stateCount * iterations,
    `highFreq: effect runs ${runs - base} !== ${stateCount * iterations}`,
  );
  return { total: t1 - t0 };
}

let destroyRound = 0;
function destroyCompare(entityCount: number): Sample {
  const build = () => {
    const ids: number[] = [];
    for (let i = 0; i < entityCount; i++) {
      const id = createEntity();
      ids.push(id);
      withEntity(id, () => {
        const s = createState(i);
        createEffect(() => {
          read<number>(s);
        });
      });
    }
    UISystem.flush();
    return ids;
  };
  const timeIndividual = (ids: number[]) => {
    const t0 = now();
    for (let i = 0; i < ids.length; i++)
      DestructionSystem.destroyEntity(ids[i]);
    return now() - t0;
  };
  const timeBatched = (ids: number[]) => {
    const t0 = now();
    DestructionSystem.destroyEntities(ids);
    return now() - t0;
  };

  const idsA = build();
  const idsB = build();
  let individual: number;
  let batched: number;
  if (destroyRound++ % 2 === 0) {
    individual = timeIndividual(idsA);
    batched = timeBatched(idsB);
  } else {
    batched = timeBatched(idsB);
    individual = timeIndividual(idsA);
  }
  return { individual, batched };
}

function dslMount(count: number): Sample {
  const entity = ownEntity();
  const container = document.createElement('div');

  const t0 = now();
  withEntity(entity, () => {
    for (let i = 0; i < count; i++) {
      const s = createState(0);
      const el = el0(
        'div',
        {
          class: { box: true },
          style: { fontSize: () => `${read<number>(s)}px` },
        },
        [() => `Value: ${read<number>(s)}`],
      );
      container.appendChild(el);
    }
  });
  const t1 = now();
  // Untimed: effects run eagerly, so this flush has no real work to do
  UISystem.flush();

  expect(
    container.children.length === count,
    `dslMount: children ${container.children.length} !== ${count}`,
  );
  expect(
    container.firstElementChild?.textContent === 'Value: 0',
    `dslMount: first text "${container.firstElementChild?.textContent}"`,
  );
  return { build: t1 - t0 };
}

type Item = { id: number; text: string };
const makeItems = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, text: `Item ${i}` }));
const simpleRender = (item: () => any) => {
  const el = document.createElement('div');
  el.textContent = item().text;
  return el;
};

function forReverse(itemCount: number): Sample {
  const items = createState<Item[]>(makeItems(itemCount));
  const host = mountFor(items, (x: Item) => x.id, simpleRender);
  expect(
    host.children.length === itemCount,
    `reverse: mounted ${host.children.length} !== ${itemCount}`,
  );

  const reversed = [...read<Item[]>(items)].reverse();
  const t0 = now();
  write(items, reversed);
  UISystem.flush();
  forceLayout(host);
  const t1 = now();

  expect(
    host.children[0]?.textContent === `Item ${itemCount - 1}`,
    `reverse: first element "${host.children[0]?.textContent}" is not reversed`,
  );
  return { total: t1 - t0 };
}

function forPartialReplace(itemCount: number, ratios: number[]): Sample {
  const out: Sample = {};
  for (const ratio of ratios) {
    const items = createState<Item[]>(makeItems(itemCount));
    const host = mountFor(items, (x: Item) => x.id, simpleRender);

    const replaceCount = Math.floor(itemCount * ratio);
    const next = read<Item[]>(items).slice(replaceCount);
    for (let i = 0; i < replaceCount; i++) {
      next.push({ id: itemCount + i, text: `New ${i}` });
    }

    const t0 = now();
    write(items, next);
    UISystem.flush();
    forceLayout(host);
    const t1 = now();

    expect(
      host.children.length === itemCount,
      `replace: children ${host.children.length} !== ${itemCount}`,
    );
    expect(
      host.children[itemCount - 1]?.textContent === `New ${replaceCount - 1}`,
      `replace: last element "${host.children[itemCount - 1]?.textContent}"`,
    );
    out[`replace${Math.round(ratio * 100)}%`] = t1 - t0;
  }
  return out;
}

function forListReset(itemCount: number): Sample {
  const initial = makeItems(itemCount);
  const items = createState<Item[]>(initial);
  const host = mountFor(items, (x: Item) => x.id, simpleRender);

  const t0 = now();
  write(items, []);
  UISystem.flush();
  forceLayout(host);
  const t1 = now();
  expect(
    host.children.length === 0,
    `reset: children after clear ${host.children.length}`,
  );

  write(items, initial);
  UISystem.flush();
  forceLayout(host);
  const t2 = now();
  expect(
    host.children.length === itemCount,
    `reset: children after repopulate ${host.children.length} !== ${itemCount}`,
  );
  return { clear: t1 - t0, repopulate: t2 - t1 };
}

type StateRow = { id: number; text: WvNode<string> };
function mountStateRows(itemCount: number) {
  const entity = ownEntity();
  let data!: StateRow[];
  withEntity(entity, () => {
    data = Array.from({ length: itemCount }, (_, i) => ({
      id: i,
      text: createState(`Item ${i}`),
    }));
  });
  const items = createState<StateRow[]>(data);
  const host = mountFor(
    items,
    (r: StateRow) => r.id,
    (item) => {
      const el = document.createElement('div');
      createEffect(() => {
        el.textContent = read<string>(item().text);
      });
      return el;
    },
  );
  return { data, host };
}

function forSingleItemUpdate(itemCount: number, iterations: number): Sample {
  const { data, host } = mountStateRows(itemCount);
  const mid = Math.floor(itemCount / 2);
  const target = data[mid].text;

  const t0 = now();
  for (let i = 0; i < iterations; i++) {
    write(target, `Updated ${i}`);
    UISystem.flush();
  }
  forceLayout(host);
  const t1 = now();

  expect(
    host.children[mid]?.textContent === `Updated ${iterations - 1}`,
    `singleItem: DOM text "${host.children[mid]?.textContent}"`,
  );
  return { total: t1 - t0 };
}

function forAllItemsUpdate(itemCount: number, rounds: number): Sample {
  const { data, host } = mountStateRows(itemCount);

  const t0 = now();
  for (let r = 0; r < rounds; r++) {
    batch(() => {
      for (let i = 0; i < itemCount; i++) write(data[i].text, `R${r}-${i}`);
    });
    UISystem.flush();
    forceLayout(host);
  }
  const t1 = now();

  const last = itemCount - 1;
  expect(
    host.children[0]?.textContent === `R${rounds - 1}-0`,
    `allItems: first "${host.children[0]?.textContent}"`,
  );
  expect(
    host.children[last]?.textContent === `R${rounds - 1}-${last}`,
    `allItems: last "${host.children[last]?.textContent}"`,
  );
  return { total: t1 - t0 };
}

function dynamicDependency(iterations: number): Sample {
  const entity = ownEntity();
  let cond!: WvNode<boolean>;
  let a!: WvNode<number>;
  let b!: WvNode<number>;
  let runs = 0;
  withEntity(entity, () => {
    cond = createState(true);
    a = createState(1);
    b = createState(2);
    const memo = createCompute(() =>
      read<boolean>(cond) ? read<number>(a) : read<number>(b),
    );
    createEffect(() => {
      read<number>(memo);
      runs++;
    });
  });
  UISystem.flush();
  const base = runs;

  const t0 = now();
  for (let i = 0; i < iterations; i++) {
    batch(() => {
      write(cond, (i & 1) === 1);
      write(a, 2 * i + 10);
      write(b, 2 * i + 11);
    });
    UISystem.flush();
  }
  const t1 = now();

  expect(
    runs - base === iterations,
    `dynamicDep: effect runs ${runs - base} !== ${iterations}`,
  );
  return { total: t1 - t0 };
}

function fanOut(count: number): Sample {
  const entity = ownEntity();
  let s!: WvNode<number>;
  let runs = 0;
  withEntity(entity, () => {
    s = createState(0);
    for (let i = 0; i < count; i++) {
      const c = createCompute(() => read<number>(s) + i);
      createEffect(() => {
        read<number>(c);
        runs++;
      });
    }
  });
  UISystem.flush();
  const base = runs;

  const t0 = now();
  write(s, 1);
  UISystem.flush();
  const t1 = now();

  expect(
    runs - base === count,
    `fanOut: effect runs ${runs - base} !== ${count}`,
  );
  return { total: t1 - t0 };
}

function fanIn(count: number): Sample {
  const entity = ownEntity();
  const states: WvNode<number>[] = [];
  let runs = 0;
  let last = -1;
  withEntity(entity, () => {
    for (let i = 0; i < count; i++) states.push(createState(i));
    const memo = createCompute(() => {
      let sum = 0;
      for (const s of states) sum += read<number>(s);
      return sum;
    });
    createEffect(() => {
      last = read<number>(memo);
      runs++;
    });
  });
  UISystem.flush();
  const base = runs;

  const t0 = now();
  batch(() => {
    for (let i = 0; i < count; i++) write(states[i], i + 1);
  });
  UISystem.flush();
  const t1 = now();

  expect(runs - base === 1, `fanIn: effect runs ${runs - base} !== 1`);
  expect(
    last === (count * (count + 1)) / 2,
    `fanIn: sum ${last} !== ${(count * (count + 1)) / 2}`,
  );
  return { total: t1 - t0 };
}

function deepChain(length: number): Sample {
  const entity = ownEntity();
  let root!: WvNode<number>;
  let last = -1;
  const t0 = now();
  withEntity(entity, () => {
    root = createState(0);
    let prev: WvNode<number> = root;
    for (let i = 0; i < length; i++) {
      const parent = prev;
      prev = createCompute(() => read<number>(parent) + 1);
    }
    const tail = prev;
    createEffect(() => {
      last = read<number>(tail);
    });
  });
  UISystem.flush();
  const t1 = now();
  expect(last === length, `deepChain: initial tail ${last} !== ${length}`);

  write(root, 1);
  UISystem.flush();
  const t2 = now();
  expect(
    last === length + 1,
    `deepChain: updated tail ${last} !== ${length + 1}`,
  );
  return { build: t1 - t0, update: t2 - t1 };
}

function diamond(width: number): Sample {
  const entity = ownEntity();
  let base!: WvNode<number>;
  let runs = 0;
  let last = -1;
  withEntity(entity, () => {
    base = createState(0);
    const branches: WvNode<number>[] = [];
    for (let i = 0; i < width; i++) {
      branches.push(createCompute(() => read<number>(base) + i));
    }
    const top = createCompute(() => {
      let sum = 0;
      for (let i = 0; i < width; i++) sum += read<number>(branches[i]);
      return sum;
    });
    createEffect(() => {
      last = read<number>(top);
      runs++;
    });
  });
  UISystem.flush();
  const baseRuns = runs;

  const t0 = now();
  write(base, 1);
  UISystem.flush();
  const t1 = now();

  const expected = width + (width * (width - 1)) / 2;
  expect(
    runs - baseRuns === 1,
    `diamond: effect ran ${runs - baseRuns} times (glitch!), expected 1`,
  );
  expect(last === expected, `diamond: value ${last} !== ${expected}`);
  return { total: t1 - t0 };
}

function edgeCleanup(computeCount: number, iterations: number): Sample {
  const entity = ownEntity();
  let toggle!: WvNode<boolean>;
  let effectRuns = 0;
  let evals = 0;
  withEntity(entity, () => {
    toggle = createState(true);
    const staticData = createState(42);
    const alt: WvNode<number>[] = [];
    for (let i = 0; i < computeCount; i++) alt.push(createState(i));
    const cs: WvNode<number>[] = [];
    for (let i = 0; i < computeCount; i++) {
      cs.push(
        createCompute(() => {
          evals++;
          return read<boolean>(toggle)
            ? read<number>(staticData)
            : read<number>(alt[i]);
        }),
      );
    }
    createEffect(() => {
      effectRuns++;
      for (const c of cs) read<number>(c);
    });
  });
  UISystem.flush();
  const baseRuns = effectRuns;
  const baseEvals = evals;

  const t0 = now();
  for (let i = 0; i < iterations; i++) {
    write(toggle, (i & 1) === 1);
    UISystem.flush();
  }
  const t1 = now();

  expect(
    effectRuns - baseRuns === iterations,
    `edgeCleanup: effect runs ${effectRuns - baseRuns} !== ${iterations}`,
  );
  note(
    `edgeCleanup: computes evaluated per toggle = ${((evals - baseEvals) / iterations).toFixed(1)} (graph has ${computeCount})`,
  );
  return { total: t1 - t0 };
}

function redundantWrites(count: number): Sample {
  const entity = ownEntity();
  let s!: WvNode<number>;
  let runs = 0;
  withEntity(entity, () => {
    s = createState(100);
    const c = createCompute(() => read<number>(s) * 2);
    createEffect(() => {
      read<number>(c);
      runs++;
    });
  });
  UISystem.flush();
  const base = runs;

  const t0 = now();
  for (let i = 0; i < count; i++) write(s, 100);
  UISystem.flush();
  const t1 = now();

  expect(
    runs - base === 0,
    `redundant: effect ran ${runs - base} times for identical writes`,
  );
  return { total: t1 - t0 };
}

function readCost(count: number): Sample {
  const entity = ownEntity();
  const states: WvNode<number>[] = [];
  withEntity(entity, () => {
    for (let i = 0; i < count; i++) states.push(createState(i));
  });
  const t0 = now();
  let sum = 0;
  for (let i = 0; i < count; i++) sum += read<number>(states[i]);
  const t1 = now();
  blackhole(sum);
  expect(sum === (count * (count - 1)) / 2, `read: sum ${sum}`);
  return { total: t1 - t0 };
}

function writeCost(count: number): Sample {
  const entity = ownEntity();
  const states: WvNode<number>[] = [];
  withEntity(entity, () => {
    for (let i = 0; i < count; i++) states.push(createState(i));
  });
  const t0 = now();
  for (let i = 0; i < count; i++) write(states[i], i + 1);
  const t1 = now();
  // Untimed: there are no subscribers, so this flush has no real work to do
  UISystem.flush();
  expect(
    read<number>(states[count - 1]) === count,
    'write: last state value not updated',
  );
  return { total: t1 - t0 };
}

function emptyFlush(count: number): Sample {
  const t0 = now();
  for (let i = 0; i < count; i++) UISystem.flush();
  return { total: now() - t0 };
}

function createCost(count: number): Sample {
  const entity = ownEntity();
  const t0 = now();
  withEntity(entity, () => {
    for (let i = 0; i < count; i++) createState(i);
  });
  const t1 = now();
  withEntity(entity, () => {
    for (let i = 0; i < count; i++) createCompute(() => i);
  });
  const t2 = now();
  withEntity(entity, () => {
    for (let i = 0; i < count; i++) createEffect(() => i);
  });
  const t3 = now();
  return { state: t1 - t0, compute: t2 - t1, effect: t3 - t2 };
}

function dslStaticVsDynamic(count: number): Sample {
  const container = document.createElement('div');

  const t0 = now();
  for (let i = 0; i < count; i++) {
    const el = el0(
      'div',
      { class: 'box static-mode', style: { color: 'red', margin: '10px' } },
      ['Static Text'],
    );
    container.appendChild(el);
  }
  const t1 = now();
  container.replaceChildren();

  const entity = ownEntity();
  let s!: WvNode<string>;
  const t2 = now();
  withEntity(entity, () => {
    s = createState('red');
    for (let i = 0; i < count; i++) {
      const el = el0(
        'div',
        {
          class: { box: true, 'dynamic-mode': true },
          style: { color: () => read<string>(s), margin: () => '10px' },
        },
        [() => 'Dynamic Text'],
      );
      container.appendChild(el);
    }
  });
  UISystem.flush();
  const t3 = now();

  write(s, 'blue');
  UISystem.flush();
  const t4 = now();

  const first = container.firstElementChild as HTMLElement | null;
  expect(
    first?.style.color === 'blue',
    `dsl: dynamic color after write "${first?.style.color}"`,
  );
  return { static: t1 - t0, dynamic: t3 - t2, dynamicUpdate: t4 - t3 };
}

function crossEntity(count: number): Sample {
  const globalEntity = createEntity();
  const children: number[] = [];
  let globalState!: WvNode<number>;
  let runs = 0;
  withEntity(globalEntity, () => {
    globalState = createState(0);
  });

  const t0 = now();
  for (let i = 0; i < count; i++) {
    const id = createEntity();
    children.push(id);
    withEntity(id, () => {
      const c = createCompute(() => read<number>(globalState) + i);
      createEffect(() => {
        read<number>(c);
        runs++;
      });
    });
  }
  UISystem.flush();
  const t1 = now();
  const base = runs;

  write(globalState, 1);
  UISystem.flush();
  const t2 = now();
  expect(
    runs - base === count,
    `crossEntity: effect runs ${runs - base} !== ${count}`,
  );

  DestructionSystem.destroyEntities(children);
  DestructionSystem.destroyEntity(globalEntity);
  const t3 = now();
  return { create: t1 - t0, propagate: t2 - t1, destroy: t3 - t2 };
}

/* ------------------------------------------------------------------ */
/* Case builders                                                       */
/* ------------------------------------------------------------------ */
const C = {
  dag: (n: number): Case => ({
    id: 'dag',
    title: 'Build DAG',
    params: `nodes=${fmtN(n)}`,
    ops: { build: n, update: n },
    run: () => dagBuild(n),
  }),
  highFreq: (states: number, iters: number): Case => ({
    id: 'highfreq',
    title: 'High-frequency update (batch+flush per frame)',
    params: `states=${fmtN(states)} frames=${fmtN(iters)}`,
    ops: states * iters,
    run: () => highFrequencyUpdate(states, iters),
  }),
  destroy: (n: number): Case => ({
    id: 'destroy',
    title: 'Destroy entities (individual vs batched, alternating order)',
    params: `entities=${fmtN(n)}`,
    ops: n,
    run: () => destroyCompare(n),
  }),
  dslMount: (n: number): Case => ({
    id: 'dom-mount',
    title: 'DOM-CORE: mount reactive elements',
    params: `elements=${fmtN(n)}`,
    ops: n,
    run: () => dslMount(n),
  }),
  reverse: (n: number): Case => ({
    id: 'for-reverse',
    title: 'For: reverse reorder',
    params: `items=${fmtN(n)}`,
    ops: n,
    run: () => forReverse(n),
  }),
  replace: (n: number): Case => ({
    id: 'for-replace',
    title: 'For: partial replace',
    params: `items=${fmtN(n)}`,
    run: () => forPartialReplace(n, [0.1, 0.5]),
  }),
  reset: (n: number): Case => ({
    id: 'for-reset',
    title: 'For: clear & repopulate',
    params: `items=${fmtN(n)}`,
    ops: n,
    run: () => forListReset(n),
  }),
  singleItem: (n: number, iters: number): Case => ({
    id: 'for-single',
    title: 'For: single item update (write+flush each)',
    params: `items=${fmtN(n)} writes=${fmtN(iters)}`,
    ops: iters,
    run: () => forSingleItemUpdate(n, iters),
  }),
  allItems: (n: number, rounds: number): Case => ({
    id: 'for-all',
    title: 'For: update ALL items per frame (dashboard-like)',
    params: `items=${fmtN(n)} frames=${fmtN(rounds)}`,
    ops: n * rounds,
    run: () => forAllItemsUpdate(n, rounds),
  }),
  dynDep: (iters: number): Case => ({
    id: 'dyn-dep',
    title: 'Dynamic dependency (flush per frame)',
    params: `frames=${fmtN(iters)}`,
    ops: iters,
    run: () => dynamicDependency(iters),
  }),
  fanOut: (n: number): Case => ({
    id: 'fan-out',
    title: 'Fan-out (1 → N)',
    params: `n=${fmtN(n)}`,
    ops: n,
    run: () => fanOut(n),
  }),
  fanIn: (n: number): Case => ({
    id: 'fan-in',
    title: 'Fan-in (N → 1)',
    params: `n=${fmtN(n)}`,
    ops: n,
    run: () => fanIn(n),
  }),
  deep: (n: number): Case => ({
    id: 'deep-chain',
    title: 'Deep chain',
    params: `depth=${fmtN(n)}`,
    ops: { build: n, update: n },
    run: () => deepChain(n),
  }),
  read: (n: number): Case => ({
    id: 'read',
    title: 'Read (untracked)',
    params: `n=${fmtN(n)}`,
    ops: n,
    run: () => readCost(n),
  }),
  write: (n: number): Case => ({
    id: 'write',
    title: 'Write (no subscribers)',
    params: `n=${fmtN(n)}`,
    ops: n,
    run: () => writeCost(n),
  }),
  flush: (n: number): Case => ({
    id: 'flush',
    title: 'Empty flush',
    params: `calls=${fmtN(n)}`,
    ops: n,
    run: () => emptyFlush(n),
  }),
  create: (n: number): Case => ({
    id: 'create',
    title: 'Create cost',
    params: `n=${fmtN(n)}`,
    ops: n,
    run: () => createCost(n),
  }),
  diamond: (w: number): Case => ({
    id: 'diamond',
    title: 'Diamond (glitch-free check)',
    params: `width=${fmtN(w)}`,
    ops: w,
    run: () => diamond(w),
  }),
  edge: (computes: number, iters: number): Case => ({
    id: 'edge-cleanup',
    title: 'Dependency switching (edge cleanup)',
    params: `computes=${fmtN(computes)} toggles=${fmtN(iters)}`,
    ops: computes * iters,
    run: () => edgeCleanup(computes, iters),
  }),
  redundant: (n: number): Case => ({
    id: 'redundant',
    title: 'Redundant write filtering',
    params: `writes=${fmtN(n)}`,
    ops: n,
    run: () => redundantWrites(n),
  }),
  dslProps: (n: number): Case => ({
    id: 'dsl-props',
    title: 'DSL props: static vs dynamic',
    params: `elements=${fmtN(n)}`,
    ops: { static: n, dynamic: n, dynamicUpdate: n },
    run: () => dslStaticVsDynamic(n),
  }),
  cross: (n: number): Case => ({
    id: 'cross-entity',
    title: 'Cross-entity dependency',
    params: `entities=${fmtN(n)}`,
    ops: { create: n, propagate: n, destroy: n },
    run: () => crossEntity(n),
  }),
};

const mainCases = (): Case[] => [
  C.dag(10_000),
  C.highFreq(2_000, 50),
  C.destroy(5_000),
  C.dslMount(1_000),
  C.reverse(1_000),
  C.replace(1_000),
  C.dynDep(5_000),
  C.fanOut(10_000),
  C.fanIn(10_000),
  C.deep(10_000),
  C.read(200_000),
  C.write(200_000),
  C.flush(1_000_000),
  C.create(50_000),
  C.diamond(2_000),
  C.edge(100, 5_000),
  C.redundant(500_000),
  C.dslProps(1_000),
  C.reset(1_000),
  C.singleItem(1_000, 5_000),
  C.allItems(1_000, 50),
  C.cross(2_000),
];

const SCALE_LEVELS = [
  { name: 'SMALL', n: 100 },
  { name: 'MIDDLE', n: 1_000 },
  { name: 'LARGE', n: 10_000 },
  { name: 'HUGE', n: 100_000 },
];

const scaleCases = (n: number): Case[] => {
  const hfStates = Math.min(n, 2_000);
  return [
    C.dag(n),
    C.highFreq(hfStates, Math.max(1, Math.floor(100_000 / hfStates))),
    C.destroy(Math.min(n, 10_000)),
    C.replace(Math.min(n, 10_000)),
    C.fanOut(Math.min(n, 50_000)),
    C.fanIn(Math.min(n, 50_000)),
    C.diamond(Math.min(n, 5_000)),
    C.edge(Math.min(n, 1_000), 1_000),
    C.reset(Math.min(n, 5_000)),
    C.allItems(Math.min(n, 5_000), 20),
    C.create(Math.min(n, 50_000)),
  ];
};

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */
const allRows: Row[] = [];

async function runCase(
  c: Case,
  warmup: number,
  runs: number,
  res: number,
): Promise<Row[]> {
  const samples: Sample[] = [];
  const caseFailures = new Set<string>();
  const caseNotes = new Set<string>();
  let thrown: string | null = null;

  for (let i = 0; i < warmup + runs; i++) {
    failures.length = 0;
    notes.length = 0;
    try {
      const s = await c.run();
      if (i >= warmup) samples.push(s);
    } catch (e) {
      thrown = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      failures.forEach((f) => caseFailures.add(f));
      cleanup();
      break;
    }
    failures.forEach((f) => caseFailures.add(f));
    notes.forEach((n) => caseNotes.add(n));
    cleanup();
    await tick();
  }

  const label = `[${c.id}] ${c.title}${c.params !== undefined ? ` (${c.params})` : ''}`;
  if (thrown !== null) {
    console.log(`✗ ${label}\n    THREW: ${thrown}`);
    return [];
  }

  const valid = caseFailures.size === 0;
  const rows: Row[] = [];
  const keys = Object.keys(samples[0]);
  const lines: string[] = [];
  for (const key of keys) {
    const vals = samples.map((s) => s[key]);
    const med = median(vals);
    const opsForKey = typeof c.ops === 'number' ? c.ops : c.ops?.[key];
    const perOp = opsForKey !== undefined ? fmtPerOp(med, opsForKey) : '';
    const coarse = med < res * 10 ? ' ⚠near-timer-resolution' : '';
    rows.push({
      id: c.id,
      title: c.title + (c.params !== undefined ? ` (${c.params})` : ''),
      metric: key,
      medianMs: med,
      minMs: Math.min(...vals),
      maxMs: Math.max(...vals),
      perOp,
      valid,
    });
    const name = keys.length === 1 && key === 'total' ? '' : `${key}: `;
    lines.push(
      `    ${name}${fmtMs(med)}  (min ${fmtMs(Math.min(...vals))} / max ${fmtMs(Math.max(...vals))})${perOp ? `  ${perOp}` : ''}${coarse}`,
    );
  }
  console.log(`${valid ? '✓' : '⚠ INVALID'} ${label}\n${lines.join('\n')}`);
  for (const f of caseFailures) console.log(`    ✗ ${f}`);
  for (const n of caseNotes) console.log(`    ℹ ${n}`);
  return rows;
}

function printHeader(
  title: string,
  o: Required<Pick<BenchOptions, 'warmup' | 'runs'>>,
  res: number,
) {
  console.log(`=== ${title} ===`);
  console.log(
    `timer resolution ≈ ${(res * 1000).toFixed(1)}µs | crossOriginIsolated=${(window as any).crossOriginIsolated} | gc=${gcFn() ? 'available' : 'n/a'} | warmup=${o.warmup} runs=${o.runs} (median reported) | layout=${cfg.includeLayout ? 'included' : 'excluded'}`,
  );
  if (res > 0.05) {
    console.log(
      '⚠ timer is coarse (≥50µs). Add COOP/COEP headers or rely on per-op numbers of large cases only.',
    );
  }
}

function printSummary(rows: Row[]) {
  const invalid = rows.filter((r) => !r.valid);
  console.table(
    rows.map((r) => ({
      id: r.id,
      metric: r.metric,
      'median (ms)': +r.medianMs.toFixed(3),
      'min (ms)': +r.minMs.toFixed(3),
      'max (ms)': +r.maxMs.toFixed(3),
      'per op': r.perOp,
      valid: r.valid ? '✓' : '⚠',
    })),
  );
  if (invalid.length) {
    console.log(
      `⚠ ${new Set(invalid.map((r) => r.id)).size} case(s) failed validation: ${[...new Set(invalid.map((r) => r.id))].join(', ')}`,
    );
  }
  (window as any).__waterveinBenchResults = rows;
  (window as any).__wvSink = sink;
  console.log(
    'Results saved to window.__waterveinBenchResults (copy(JSON.stringify(window.__waterveinBenchResults)))',
  );
}

function runSanityChecks(): boolean {
  const results: Array<{ name: string; ok: boolean; detail: string }> = [];
  const check = (name: string, fn: () => { ok: boolean; detail?: string }) => {
    try {
      const r = fn();
      results.push({ name, ok: r.ok, detail: r.detail ?? '' });
    } catch (e) {
      results.push({
        name,
        ok: false,
        detail: `threw: ${e instanceof Error ? e.message : e}`,
      });
    }
    cleanup();
  };

  check('effect execution timing (informational)', () => {
    const entity = ownEntity();
    let runs = 0;
    withEntity(entity, () => {
      const s = createState(0);
      createEffect(() => {
        read<number>(s);
        runs++;
      });
    });
    const afterCreate = runs;
    UISystem.flush();
    return {
      ok: runs >= 1,
      detail: `runs after create=${afterCreate}, after flush=${runs}`,
    };
  });

  check('write triggers exactly one effect run', () => {
    const entity = ownEntity();
    let runs = 0;
    let s!: WvNode<number>;
    withEntity(entity, () => {
      s = createState(0);
      createEffect(() => {
        read<number>(s);
        runs++;
      });
    });
    UISystem.flush();
    const base = runs;
    write(s, 1);
    UISystem.flush();
    return { ok: runs - base === 1, detail: `delta=${runs - base}` };
  });

  check('identical write is filtered', () => {
    const entity = ownEntity();
    let runs = 0;
    let s!: WvNode<number>;
    withEntity(entity, () => {
      s = createState(5);
      createEffect(() => {
        read<number>(s);
        runs++;
      });
    });
    UISystem.flush();
    const base = runs;
    write(s, 5);
    UISystem.flush();
    return { ok: runs - base === 0, detail: `delta=${runs - base}` };
  });

  check('batch coalesces multiple writes', () => {
    const entity = ownEntity();
    let runs = 0;
    let s!: WvNode<number>;
    withEntity(entity, () => {
      s = createState(0);
      createEffect(() => {
        read<number>(s);
        runs++;
      });
    });
    UISystem.flush();
    const base = runs;
    batch(() => {
      write(s, 1);
      write(s, 2);
      write(s, 3);
    });
    UISystem.flush();
    return { ok: runs - base === 1, detail: `delta=${runs - base}` };
  });

  check('destroyed entity stops reacting', () => {
    const entity = createEntity();
    let runs = 0;
    let s!: WvNode<number>;
    withEntity(entity, () => {
      s = createState(0);
      createEffect(() => {
        read<number>(s);
        runs++;
      });
    });
    UISystem.flush();
    DestructionSystem.destroyEntity(entity);
    const base = runs;
    let wrote = true;
    try {
      write(s, 1);
      UISystem.flush();
    } catch {
      wrote = false;
    }
    return {
      ok: runs - base === 0,
      detail: `delta=${runs - base}${wrote ? '' : ' (write threw)'}`,
    };
  });

  console.log('--- sanity checks ---');
  for (const r of results)
    console.log(
      `${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`,
    );
  const ok = results.every((r) => r.ok);
  if (!ok)
    console.log(
      '⚠ sanity check failed: benchmark numbers below may not mean what their labels say.',
    );
  return ok;
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                 */
/* ------------------------------------------------------------------ */
async function runMainSuite(opts: BenchOptions = {}) {
  const warmup = opts.warmup ?? 3;
  const runs = opts.runs ?? 15;
  cfg.includeLayout = !!opts.includeLayout;
  const res = timerResolution();
  printHeader('PERFORMANCE TEST START', { warmup, runs }, res);
  runSanityChecks();

  const rows: Row[] = [];
  for (const c of mainCases()) {
    if (
      opts.only !== undefined &&
      !`${c.id} ${c.title}`.toLowerCase().includes(opts.only.toLowerCase())
    )
      continue;
    rows.push(...(await runCase(c, warmup, runs, res)));
  }
  console.log('=== BENCHMARK END ===');
  allRows.push(...rows);
  printSummary(rows);
  return rows;
}

async function runScaleSuite(opts: BenchOptions = {}) {
  const warmup = opts.warmup ?? 2;
  const runs = opts.runs ?? 7;
  cfg.includeLayout = !!opts.includeLayout;
  const res = timerResolution();
  printHeader('SCALE BENCHMARK START', { warmup, runs }, res);

  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const level of SCALE_LEVELS) {
    console.log(`\n--- ${level.name} (n=${fmtN(level.n)}) ---`);
    for (const c of scaleCases(level.n)) {
      if (
        opts.only !== undefined &&
        !`${c.id} ${c.title}`.toLowerCase().includes(opts.only.toLowerCase())
      )
        continue;
      const key = `${c.id}|${c.params}`;
      if (seen.has(key)) {
        console.log(
          `– [${c.id}] skipped: ${c.params} was already measured at a smaller level (capped)`,
        );
        continue;
      }
      seen.add(key);
      const r = await runCase(c, warmup, runs, res);
      rows.push(...r.map((x) => ({ ...x, id: `${level.name}/${x.id}` })));
    }
  }
  console.log('\n=== SCALE BENCHMARK END ===');
  allRows.push(...rows);
  printSummary(rows);
  return rows;
}

async function runLeakCheck(rounds = 20) {
  const gc = gcFn();
  if (!gc || usedHeapMB() === null) {
    console.log(
      '⚠ leak check needs: chrome --js-flags=--expose-gc --enable-precise-memory-info (window.gc / performance.memory not available)',
    );
    return;
  }
  console.log(
    '=== LEAK CHECK START === (heap after GC; a steady upward trend suggests a leak)',
  );

  const targets: Array<{ name: string; fn: () => void }> = [
    {
      name: 'entity create+destroy (5,000 × state+effect)',
      fn: () => {
        const ids: number[] = [];
        for (let i = 0; i < 5_000; i++) {
          const id = createEntity();
          ids.push(id);
          withEntity(id, () => {
            const s = createState(i);
            createEffect(() => {
              read<number>(s);
            });
          });
        }
        UISystem.flush();
        for (const id of ids) DestructionSystem.destroyEntity(id);
        UISystem.flush();
      },
    },
    {
      name: 'For mount+unmount (5,000 items)',
      fn: () => {
        const items = createState<Item[]>(makeItems(5_000));
        mountFor(items, (x: Item) => x.id, simpleRender);
        cleanup();
      },
    },
    {
      name: 'DAG build+destroy (10,000 nodes)',
      fn: () => {
        dagBuild(10_000);
        cleanup();
      },
    },
  ];

  for (const t of targets) {
    for (let i = 0; i < 3; i++) {
      t.fn();
      await tick();
    }
    gc();
    await tick();
    const base = usedHeapMB()!;
    const trail: string[] = [];
    for (let r = 1; r <= rounds; r++) {
      t.fn();
      await tick();
      if (r % 5 === 0) {
        gc();
        await tick();
        trail.push(`${(usedHeapMB()! - base).toFixed(2)}MB`);
      }
    }
    console.log(
      `${t.name}\n    Δheap vs baseline after rounds 5/10/15/20: ${trail.join(' → ')}`,
    );
  }
  console.log('=== LEAK CHECK END ===');
}

(window as any).runWaterveinBenchmark = runMainSuite;
(window as any).runWaterveinScaleBenchmark = runScaleSuite;
(window as any).runWaterveinLeakCheck = runLeakCheck;
