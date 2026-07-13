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
    Node as WvNode
} from '@watervein/core';
import { 
    element as el0,
    For as for0
} from '@watervein/dom-core';
import { element as el1 } from '@watervein/dom';

type MemorySnapshot = { usedMB: number; totalMB: number };

function getMemory(): MemorySnapshot | null {
    const mem = (performance as any).memory;
    if (!mem) return null;
    return {
        usedMB: mem.usedJSHeapSize / 1024 / 1024,
        totalMB: mem.totalJSHeapSize / 1024 / 1024,
    };
}

function formatMemoryDelta(before: MemorySnapshot | null, after: MemorySnapshot | null): string {
    if (!before || !after) return "(performance.memory is not supported)";
    const delta = after.usedMB - before.usedMB;
    return `Δheap: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}MB (${before.usedMB.toFixed(1)}MB → ${after.usedMB.toFixed(1)}MB)`;
}

function forceGC() {
    if ((window as any).gc) (window as any).gc();
}

async function withMemoryTracking<T>(
    label: string,
    fn: () => T
): Promise<{ result: T; time: number; memory: string }> {
    forceGC();
    await new Promise(r => setTimeout(r, 50));
    const before = getMemory();

    const start = performance.now();
    const result = fn();
    const time = performance.now() - start;

    forceGC();
    await new Promise(r => setTimeout(r, 50));
    const after = getMemory();

    return { result, time, memory: formatMemoryDelta(before, after) };
}

type ScaleLevel = { name: string; nodeCount: number };

const SCALE_LEVELS: ScaleLevel[] = [
    { name: "SMALL",   nodeCount: 100 },
    { name: "MIDDLE",  nodeCount: 1_000 },
    { name: "LARGE",   nodeCount: 10_000 },
    { name: "HUGE", nodeCount: 100_000 },
];

const BenchmarkSystem = {
    runGraphConstruction(nodeCount: number) {
        const start = performance.now();
        const rootEntity = createEntity();
        withEntity(rootEntity, () => {
            const rootState = createState(0);
            let currentLeft = createCompute(() => read(rootState) + 1);
            let currentRight = createCompute(() => read(rootState) + 2);

            for (let i = 0; i < nodeCount / 2; i++) {
                const nextLeft = createCompute(() => read(currentLeft) + 1);
                const nextRight = createCompute(() => read(currentRight) + read(currentLeft));
                currentLeft = nextLeft;
                currentRight = nextRight;
            }
        });
        const end = performance.now();
        return { time: end - start, entityId: rootEntity };
    },

    runHighFrequencyUpdate(stateCount: number, iterations: number) {
        const states: any[] = [];
        const entityId = createEntity();

        withEntity(entityId, () => {
            for (let i = 0; i < stateCount; i++) {
                const s = createState(0);
                const c = createCompute(() => read(s) * 2);
                createEffect(() => { const _v = read(c); });
                states.push(s);
            }
        });
        const start = performance.now();
        for (let iter = 0; iter < iterations; iter++) {
            batch(() => {
                for (let i = 0; i < stateCount; i++) {
                    write(states[i], iter);
                }
            });
        }
        const end = performance.now();
        DestructionSystem.destroyEntity(entityId);
        return end - start;
    },

    runMassDestruction(entityCount: number) {
        const entityIds: number[] = [];
        for (let i = 0; i < entityCount; i++) {
            const id = createEntity();
            entityIds.push(id);
            withEntity(id, () => {
                const s = createState(i);
                createEffect(() => { const _ = read(s); });
            });
        }

        const start = performance.now();
        for (let i = 0; i < entityCount; i++) {
            DestructionSystem.destroyEntity(entityIds[i]);
        }
        const end = performance.now();
        return end - start;
    },

    runMassDestructionBatched(entityCount: number) {
        const entityIds: number[] = [];
        for (let i = 0; i < entityCount; i++) {
            const id = createEntity();
            entityIds.push(id);
            withEntity(id, () => {
                const s = createState(i);
                createEffect(() => { const _ = read(s); });
            });
        }

        const start = performance.now();
        DestructionSystem.destroyEntities(entityIds);
        const end = performance.now();
        return end - start;
    },

    runDsl0Construction(count: number) {
        const entityId = createEntity();
        const container = document.createElement("div");
        const start = performance.now();

        withEntity(entityId, () => {
            for (let i = 0; i < count; i++) {
                const s = createState(0);
                const el = el0("div", {
                    class: { "box": true },
                    style: { fontSize: () => `${read(s)}px` }
                }, [
                    () => `Value: ${read(s)}`
                ]);
                container.appendChild(el);
            }
        });

        const end = performance.now();
        DestructionSystem.destroyEntity(entityId);
        return end - start;
    },

    runDsl1Construction(count: number) {
        const entityId = createEntity();
        const container = document.createElement("div");
        const start = performance.now();

        withEntity(entityId, () => {
            for (let i = 0; i < count; i++) {
                const s = createState(0);
                const el = el1("div", {
                    class: { "box": true },
                    style: { fontSize: () => `${read(s)}px` }
                }, [
                    () => `Value: ${read(s)}`
                ]);
                container.appendChild(el);
            }
        });

        const end = performance.now();
        DestructionSystem.destroyEntity(entityId);
        return end - start;
    },

    runForReorderPerformance(itemCount: number = 1000) {
        const itemsState = createState(
            Array.from({ length: itemCount }, (_, i) => ({ id: i, text: `Item ${i}` }))
        );

        const container = for0(itemsState, (item: {id: number, text: string}) => item.id, (item) => {
            const el = document.createElement("div");
            el.textContent = item().text;
            return el;
        });
        document.body.appendChild(container);

        const reversedData = [...read<{id:number,text:string}[]>(itemsState)].reverse();
        
        const start = performance.now();
        write(itemsState, reversedData);
        UISystem.flush();
        const end = performance.now();

        container.remove();
        return end - start;
    },

    runPartialReplace(itemCount: number, replaceRatio: number) {
        type Row = { id: number; text: string };
        const itemsState = createState<Row[]>(
            Array.from({ length: itemCount }, (_, i) => ({ id: i, text: `Item ${i}` }))
        );

        const container = for0(itemsState, (item: Row) => item.id, (item) => {
            const el = document.createElement("div");
            el.textContent = item().text;
            return el;
        });
        document.body.appendChild(container);
        UISystem.flush();

        const current = read<Row[]>(itemsState);
        const replaceCount = Math.floor(itemCount * replaceRatio);
        const next = current.slice(replaceCount);
        for (let i = 0; i < replaceCount; i++) {
            next.push({ id: itemCount + i, text: `New ${i}` });
        }

        const start = performance.now();
        write(itemsState, next);
        UISystem.flush();
        const end = performance.now();

        container.remove();
        return end - start;
    },

    runDynamicDependency(iterations: number) {
        const cond = createState(true);
        const a = createState(1);
        const b = createState(2);
        const memo = createCompute(() => read(cond) ? read(a) : read(b));
        createEffect(() => { read(memo); });

        const start = performance.now();
        batch(() => {
            for (let i = 0; i < iterations; i++) {
                write(cond, (i & 1) === 0);
                write(a, i);
                write(b, i);
            }
        });
        UISystem.flush();
        return performance.now() - start;
    },

    runFanOutBenchmark(count: number) {
        const s = createState(0);
        for (let i = 0; i < count; i++) {
            const c = createCompute(() => read(s) + i);
            createEffect(() => read(c));
        }
        const start = performance.now();
        write(s, 1);
        UISystem.flush();
        return performance.now() - start;
    },

    runFanInBenchmark(count: number) {
        const states: WvNode<number>[] = [];
        for (let i = 0; i < count; i++) states.push(createState(i));

        const memo = createCompute(() => {
            let sum = 0;
            for (const s of states) sum += read(s);
            return sum;
        });
        createEffect(() => read(memo));

        const start = performance.now();
        batch(() => {
            for (let i = 0; i < count; i++) write(states[i], i + 1);
        });
        UISystem.flush();
        return performance.now() - start;
    },

    runDeepChain(length: number) {
        const root: WvNode<number> = createState(0);
        let prev = root;
        for (let i = 0; i < length; i++) {
            const parent = prev;
            prev = createCompute(() => read(parent) + 1);
        }
        createEffect(() => read(prev));

        const start = performance.now();
        write(root, 1);
        UISystem.flush();
        return performance.now() - start;
    },

    runFlush(count: number) {
        const start = performance.now();
        for (let i = 0; i < count; i++) UISystem.flush();
        return performance.now() - start;
    },

    runRead(count: number) {
        const states: WvNode<number>[] = [];
        for (let i = 0; i < count; i++) states.push(createState(i));
        const start = performance.now();
        for (const s of states) read(s);
        return performance.now() - start;
    },

    runWrite(count: number) {
        const states: WvNode<number>[] = [];
        for (let i = 0; i < count; i++) states.push(createState(i));
        const start = performance.now();
        for (const s of states) write(s, 1);
        return performance.now() - start;
    },

    runCreateState(count: number) {
        const start = performance.now();
        for (let i = 0; i < count; i++) createState(i);
        return performance.now() - start;
    },

    runCreateCompute(count: number) {
        const start = performance.now();
        for (let i = 0; i < count; i++) createCompute(() => i);
        return performance.now() - start;
    },

    runCreateEffect(count: number) {
        const start = performance.now();
        for (let i = 0; i < count; i++) createEffect(() => i);
        return performance.now() - start;
    },

    runDiamondProblem(width: number) {
        const base = createState(0);
        const branches: any[] = [];
        
        for (let i = 0; i < width; i++) {
            branches.push(createCompute(() => read(base) + i));
        }
        
        const top = createCompute(() => {
            let sum = 0;
            for (let i = 0; i < width; i++) {
                sum += read<number>(branches[i]);
            }
            return sum;
        });
        
        let effectCount = 0;
        createEffect(() => {
            read(top);
            effectCount++;
        });
        UISystem.flush();

        const start = performance.now();
        write(base, 1);
        UISystem.flush();
        const end = performance.now();
        
        return { time: end - start, glitchesPrevented: effectCount === 2 };
    },

    runUnusedEdgeCleanup(iterations: number) {
        const toggle = createState(true);
        const staticData = createState(42);
        
        const alternateStates: any[] = [];
        for (let i = 0; i < 100; i++) {
            alternateStates.push(createState(i));
        }

        const dynamicComputes: any[] = [];
        for (let i = 0; i < 100; i++) {
            dynamicComputes.push(createCompute(() => {
                if (read(toggle)) {
                    return read(staticData);
                } else {
                    return read(alternateStates[i]);
                }
            }));
        }

        createEffect(() => {
            for(const c of dynamicComputes) read(c);
        });
        UISystem.flush();

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            write(toggle, (i & 1) === 0);
            UISystem.flush();
        }
        return performance.now() - start;
    },

    runRedundantWriteFiltering(count: number) {
        const s = createState(100);
        const c = createCompute(() => read(s) * 2);
        let runCount = 0;
        createEffect(() => { read(c); runCount++; });
        UISystem.flush();

        const start = performance.now();
        for (let i = 0; i < count; i++) {
            write(s, 100);
        }
        UISystem.flush();
        const end = performance.now();
        return end - start;
    },

    runDslStaticVsDynamic(count: number) {
        const container = document.createElement("div");
        
        const startStatic = performance.now();
        for (let i = 0; i < count; i++) {
            const el = el0("div", { class: "box static-mode", style: { color: "red", margin: "10px" } }, ["Static Text"]);
            container.appendChild(el);
        }
        const endStatic = performance.now();

        container.replaceChildren();

        const s = createState("red");
        const startDynamic = performance.now();
        for (let i = 0; i < count; i++) {
            const el = el0("div", { 
                class: { "box": true, "dynamic-mode": true }, 
                style: { color: () => read(s), margin: () => "10px" } 
            }, [() => "Dynamic Text"]);
            container.appendChild(el);
        }
        const endDynamic = performance.now();

        return { staticTime: endStatic - startStatic, dynamicTime: endDynamic - startDynamic };
    },

    runForListReset(itemCount: number) {
        type Row = { id: number; text: string };
        const initialData = Array.from({ length: itemCount }, (_, i) => ({ id: i, text: `Item ${i}` }));
        const itemsState = createState<Row[]>(initialData);

        const container = for0(itemsState, (item: Row) => item.id, (item) => {
            const el = document.createElement("div");
            el.textContent = item().text;
            return el;
        });
        document.body.appendChild(container);
        UISystem.flush();

        const start = performance.now();
        write(itemsState, []);
        UISystem.flush();
        write(itemsState, initialData);
        UISystem.flush();
        const end = performance.now();

        container.remove();
        return end - start;
    },

    runForItemPropUpdate(itemCount: number, iterations: number) {
        type Row = { id: number; text: WvNode<string> };
        const data = Array.from({ length: itemCount }, (_, i) => ({
            id: i,
            text: createState(`Item ${i}`)
        }));
        
        const itemsState = createState<Row[]>(data);
        const container = for0(itemsState, (item: Row) => item.id, (item) => {
            const el = document.createElement("div");
            createEffect(() => {
                el.textContent = read(item().text);
            });
            return el;
        });
        document.body.appendChild(container);
        UISystem.flush();

        const targetState = data[Math.floor(itemCount / 2)].text;

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            write(targetState, `Updated ${i}`);
            UISystem.flush();
        }
        const end = performance.now();

        container.remove();
        return end - start;
    },

    runCrossEntityDependency(count: number) {
        const globalEntity = createEntity();
        const childEntities: number[] = [];
        
        let globalState: any;
        withEntity(globalEntity, () => {
            globalState = createState(0);
        });

        const start = performance.now();
        for (let i = 0; i < count; i++) {
            const childId = createEntity();
            childEntities.push(childId);
            withEntity(childId, () => {
                const c = createCompute(() => read<number>(globalState) + i);
                createEffect(() => { read(c); });
            });
        }
        UISystem.flush();

        write(globalState, 1);
        UISystem.flush();

        DestructionSystem.destroyEntities(childEntities);
        DestructionSystem.destroyEntity(globalEntity);
        
        const end = performance.now();
        return end - start;
    }
};

async function runScaleSuite() {
    console.log("=== BENCHMARK START ===");

    for (const level of SCALE_LEVELS) {
        const n = level.nodeCount;
        console.log(`\n--- ${level.name} (n=${n.toLocaleString()}) ---`);

        {
            const before = getMemory();
            forceGC();
            await new Promise(r => setTimeout(r, 30));
            const beforeAfterGC = getMemory();

            const { time, entityId } = BenchmarkSystem.runGraphConstruction(n);

            const after = getMemory();
            console.log(`[BUILD DAG] ${time.toFixed(2)}ms | ${formatMemoryDelta(beforeAfterGC, after)}`);

            DestructionSystem.destroyEntity(entityId);
        }

        {
            const stateCount = Math.min(n, 2000);
            const iterations = Math.max(1, Math.floor(50 * 2000 / stateCount));
            const time = BenchmarkSystem.runHighFrequencyUpdate(stateCount, iterations);
            console.log(`[HIGH FREQUENCY UPDATE] state=${stateCount} iter=${iterations}: ${time.toFixed(2)}ms`);
        }

        {
            const entityCount = Math.min(n, 10000);
            const individualTime = BenchmarkSystem.runMassDestruction(entityCount);
            const batchedTime = BenchmarkSystem.runMassDestructionBatched(entityCount);
            console.log(`[DESTROY ENTITY] individual=${individualTime.toFixed(2)}ms / batched=${batchedTime.toFixed(2)}ms (${(individualTime/batchedTime).toFixed(1)}x)`);
        }

        {
            const itemCount = Math.min(n, 10000);
            const before = getMemory();
            const time10 = BenchmarkSystem.runPartialReplace(itemCount, 0.1);
            const time50 = BenchmarkSystem.runPartialReplace(itemCount, 0.5);
            const after = getMemory();
            console.log(`[PARTIAL REPLACE] 10% replace=${time10.toFixed(2)}ms / 50% replace=${time50.toFixed(2)}ms | ${formatMemoryDelta(before, after)}`);
        }

        {
            const fanCount = Math.min(n, 50000);
            const fanOutTime = BenchmarkSystem.runFanOutBenchmark(fanCount);
            const fanInTime  = BenchmarkSystem.runFanInBenchmark(fanCount);
            console.log(`[Fan-Out/In] n=${fanCount}: out=${fanOutTime.toFixed(2)}ms in=${fanInTime.toFixed(2)}ms`);
        }

        {
            const diamondWidth = Math.min(n, 5000);
            const { time: diamondTime } = BenchmarkSystem.runDiamondProblem(diamondWidth);
            console.log(`[DIAMOND PROBLEM] width=${diamondWidth}: ${diamondTime.toFixed(2)}ms`);
        }

        {
            const cleanupIterations = Math.min(n, 2000);
            const cleanupTime = BenchmarkSystem.runUnusedEdgeCleanup(cleanupIterations);
            console.log(`[UNUSED EDGE CLEANUP] iter=${cleanupIterations}: ${cleanupTime.toFixed(2)}ms`);
        }

        {
            const listResetCount = Math.min(n, 5000);
            const resetTime = BenchmarkSystem.runForListReset(listResetCount);
            console.log(`[FOR LIST RESET] items=${listResetCount}: ${resetTime.toFixed(2)}ms`);
        }

        {
            const createCount = Math.min(n, 50000);
            const before = getMemory();
            const stateTime   = BenchmarkSystem.runCreateState(createCount);
            const computeTime = BenchmarkSystem.runCreateCompute(createCount);
            const effectTime  = BenchmarkSystem.runCreateEffect(createCount);
            const after = getMemory();
            console.log(`[CREATE COST] state=${stateTime.toFixed(2)}ms compute=${computeTime.toFixed(2)}ms effect=${effectTime.toFixed(2)}ms | ${formatMemoryDelta(before, after)}`);
        }
    }

    console.log("\n=== BENCHMARK END ===");
}

(window as any).runWaterveinBenchmark = () => {
    console.log("=== PERFORMANCE TEST START ===");

    const { time: constTime, entityId } = BenchmarkSystem.runGraphConstruction(10000);
    console.log(`[1] Building a Massive DAG with 10,000 Nodes: ${constTime.toFixed(2)} ms`);
    DestructionSystem.destroyEntity(entityId);

    const updateTime = BenchmarkSystem.runHighFrequencyUpdate(2000, 50);
    console.log(`[2] 2,000 signals x 50 batch updates (100,000 patches total): ${updateTime.toFixed(2)} ms`);

    const destroyTime = BenchmarkSystem.runMassDestruction(5000);
    console.log(`[3] Batch Memory Release for 5,000 Entities (10,000 Nodes) (Individually): ${destroyTime.toFixed(2)} ms`);

    const destroyBatchedTime = BenchmarkSystem.runMassDestructionBatched(5000);
    console.log(`[3b] Batch memory release for 5,000 entities (10,000 nodes): ${destroyBatchedTime.toFixed(2)} ms`);

    const dsl0Time = BenchmarkSystem.runDsl0Construction(1000);
    console.log(`[DOM-CORE] Mounting 1,000 elements using raw DOM (raw arrow functions): ${dsl0Time.toFixed(2)} ms`);

    const dsl1Time = BenchmarkSystem.runDsl1Construction(1000);
    console.log(`[DOM] Mounting 1,000 elements using DSL1 (Node direct passing): ${dsl1Time.toFixed(2)} ms`);

    const overhead = dsl1Time - dsl0Time;
    console.log(`[Analyze] Pure Overhead from the dom Mapping Abstraction: ${overhead.toFixed(2)} ms (Per element ${(overhead / 1000 * 1000).toFixed(2)} 𝝁s)`);

    const reorderTime = BenchmarkSystem.runForReorderPerformance(1000);
    console.log(`[For Optimization] Batch Reverse Sort (Reorder) of 1,000 DOM Elements: ${reorderTime.toFixed(2)} ms`);

    const replace10 = BenchmarkSystem.runPartialReplace(1000, 0.1);
    const replace50 = BenchmarkSystem.runPartialReplace(1000, 0.5);
    console.log(`[Partially Replace] 1,000 out of 1,000 elements replaced (10%): ${replace10.toFixed(2)} ms / 50%: ${replace50.toFixed(2)} ms`);

    console.log(`[4] Dynamic Dependency: ${BenchmarkSystem.runDynamicDependency(100000).toFixed(2)} ms`);
    console.log(`[5] Fan-Out (1 -> 10000): ${BenchmarkSystem.runFanOutBenchmark(10000).toFixed(2)} ms`);
    console.log(`[6] Fan-In (10000 -> 1): ${BenchmarkSystem.runFanInBenchmark(10000).toFixed(2)} ms`);
    console.log(`[7] Deep Chain (10000): ${BenchmarkSystem.runDeepChain(1000).toFixed(2)} ms`);
    console.log(`[8] Read (10000): ${BenchmarkSystem.runRead(10000).toFixed(2)} ms`);
    console.log(`[8] Flush (10000): ${BenchmarkSystem.runFlush(10000).toFixed(2)} ms`);
    console.log(`[9] Write (10000): ${BenchmarkSystem.runWrite(10000).toFixed(2)} ms`);
    console.log(`[10] create-state (10000): ${BenchmarkSystem.runCreateState(10000).toFixed(2)} ms`);
    console.log(`[11] create-compute (10000): ${BenchmarkSystem.runCreateCompute(10000).toFixed(2)} ms`);
    console.log(`[12] create-effect (10000): ${BenchmarkSystem.runCreateEffect(10000).toFixed(2)} ms`);

    const diamondRes = BenchmarkSystem.runDiamondProblem(2000);
    console.log(`[13] Diamond Problem (Width 2,000): ${diamondRes.time.toFixed(2)} ms (Glitch Free: ${diamondRes.glitchesPrevented})`);

    const cleanupTime = BenchmarkSystem.runUnusedEdgeCleanup(5000);
    console.log(`[14] Dynamic Edge Cleanup (5,000 toggles): ${cleanupTime.toFixed(2)} ms`);

    const redundantTime = BenchmarkSystem.runRedundantWriteFiltering(50000);
    console.log(`[15] Redundant Write Filtering (50,000 identical writes): ${redundantTime.toFixed(2)} ms`);

    const dslProps = BenchmarkSystem.runDslStaticVsDynamic(1000);
    console.log(`[16] DSL Property parsing (1,000 el) -> Static: ${dslProps.staticTime.toFixed(2)} ms / Dynamic: ${dslProps.dynamicTime.toFixed(2)} ms`);

    const listResetTime = BenchmarkSystem.runForListReset(1000);
    console.log(`[17] For-Loop List Clear & Re-populate (1,000 elements): ${listResetTime.toFixed(2)} ms`);

    const itemPropTime = BenchmarkSystem.runForItemPropUpdate(1000, 5000);
    console.log(`[18] For-Loop Single Item Property Update (5,000 writes): ${itemPropTime.toFixed(2)} ms`);

    const crossEntityTime = BenchmarkSystem.runCrossEntityDependency(2000);
    console.log(`[19] Cross-Entity Dependency & Cascade Destroy (2,000 entities): ${crossEntityTime.toFixed(2)} ms`);

    console.log("=== BENCHMARK END ===");
};

(window as any).runWaterveinScaleBenchmark = runScaleSuite;