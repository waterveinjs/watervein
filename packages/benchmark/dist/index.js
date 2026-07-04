"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@watervein/core");
const dom_core_1 = require("@watervein/dom-core");
const dom_1 = require("@watervein/dom");
function getMemory() {
    const mem = performance.memory;
    if (!mem)
        return null;
    return {
        usedMB: mem.usedJSHeapSize / 1024 / 1024,
        totalMB: mem.totalJSHeapSize / 1024 / 1024,
    };
}
function formatMemoryDelta(before, after) {
    if (!before || !after)
        return "(performance.memory is not supported)";
    const delta = after.usedMB - before.usedMB;
    return `Δheap: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}MB (${before.usedMB.toFixed(1)}MB → ${after.usedMB.toFixed(1)}MB)`;
}
function forceGC() {
    if (window.gc)
        window.gc();
}
async function withMemoryTracking(label, fn) {
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
const SCALE_LEVELS = [
    { name: "SMALL", nodeCount: 100 },
    { name: "MIDDLE", nodeCount: 1_000 },
    { name: "LARGE", nodeCount: 10_000 },
    { name: "HUGE", nodeCount: 100_000 },
];
const BenchmarkSystem = {
    runGraphConstruction(nodeCount) {
        const start = performance.now();
        const rootEntity = (0, core_1.createEntity)();
        (0, core_1.withEntity)(rootEntity, () => {
            const rootState = (0, core_1.createState)(0);
            let currentLeft = (0, core_1.createCompute)(() => (0, core_1.read)(rootState) + 1);
            let currentRight = (0, core_1.createCompute)(() => (0, core_1.read)(rootState) + 2);
            for (let i = 0; i < nodeCount / 2; i++) {
                const nextLeft = (0, core_1.createCompute)(() => (0, core_1.read)(currentLeft) + 1);
                const nextRight = (0, core_1.createCompute)(() => (0, core_1.read)(currentRight) + (0, core_1.read)(currentLeft));
                currentLeft = nextLeft;
                currentRight = nextRight;
            }
        });
        const end = performance.now();
        return { time: end - start, entityId: rootEntity };
    },
    runHighFrequencyUpdate(stateCount, iterations) {
        const states = [];
        const entityId = (0, core_1.createEntity)();
        (0, core_1.withEntity)(entityId, () => {
            for (let i = 0; i < stateCount; i++) {
                const s = (0, core_1.createState)(0);
                const c = (0, core_1.createCompute)(() => (0, core_1.read)(s) * 2);
                (0, core_1.createEffect)(() => { const _v = (0, core_1.read)(c); });
                states.push(s);
            }
        });
        const start = performance.now();
        for (let iter = 0; iter < iterations; iter++) {
            (0, core_1.batch)(() => {
                for (let i = 0; i < stateCount; i++) {
                    (0, core_1.write)(states[i], iter);
                }
            });
        }
        const end = performance.now();
        core_1.DestructionSystem.destroyEntity(entityId);
        return end - start;
    },
    runMassDestruction(entityCount) {
        const entityIds = [];
        for (let i = 0; i < entityCount; i++) {
            const id = (0, core_1.createEntity)();
            entityIds.push(id);
            (0, core_1.withEntity)(id, () => {
                const s = (0, core_1.createState)(i);
                (0, core_1.createEffect)(() => { const _ = (0, core_1.read)(s); });
            });
        }
        const start = performance.now();
        for (let i = 0; i < entityCount; i++) {
            core_1.DestructionSystem.destroyEntity(entityIds[i]);
        }
        const end = performance.now();
        return end - start;
    },
    runMassDestructionBatched(entityCount) {
        const entityIds = [];
        for (let i = 0; i < entityCount; i++) {
            const id = (0, core_1.createEntity)();
            entityIds.push(id);
            (0, core_1.withEntity)(id, () => {
                const s = (0, core_1.createState)(i);
                (0, core_1.createEffect)(() => { const _ = (0, core_1.read)(s); });
            });
        }
        const start = performance.now();
        core_1.DestructionSystem.destroyEntities(entityIds);
        const end = performance.now();
        return end - start;
    },
    runDsl0Construction(count) {
        const entityId = (0, core_1.createEntity)();
        const container = document.createElement("div");
        const start = performance.now();
        (0, core_1.withEntity)(entityId, () => {
            for (let i = 0; i < count; i++) {
                const s = (0, core_1.createState)(0);
                const el = (0, dom_core_1.element)("div", {
                    class: { "box": true },
                    style: { fontSize: () => `${(0, core_1.read)(s)}px` }
                }, [
                    () => `Value: ${(0, core_1.read)(s)}`
                ]);
                container.appendChild(el);
            }
        });
        const end = performance.now();
        core_1.DestructionSystem.destroyEntity(entityId);
        return end - start;
    },
    runDsl1Construction(count) {
        const entityId = (0, core_1.createEntity)();
        const container = document.createElement("div");
        const start = performance.now();
        (0, core_1.withEntity)(entityId, () => {
            for (let i = 0; i < count; i++) {
                const s = (0, core_1.createState)(0);
                const el = (0, dom_1.element)("div", {
                    class: { "box": true },
                    style: { fontSize: () => `${(0, core_1.read)(s)}px` }
                }, [
                    () => `Value: ${(0, core_1.read)(s)}`
                ]);
                container.appendChild(el);
            }
        });
        const end = performance.now();
        core_1.DestructionSystem.destroyEntity(entityId);
        return end - start;
    },
    runForReorderPerformance(itemCount = 1000) {
        const itemsState = (0, core_1.createState)(Array.from({ length: itemCount }, (_, i) => ({ id: i, text: `Item ${i}` })));
        const container = (0, dom_core_1.For)(itemsState, (item) => item.id, (item) => {
            const el = document.createElement("div");
            el.textContent = item().text;
            return el;
        });
        document.body.appendChild(container);
        const reversedData = [...(0, core_1.read)(itemsState)].reverse();
        const start = performance.now();
        (0, core_1.write)(itemsState, reversedData);
        core_1.UISystem.flush();
        const end = performance.now();
        container.remove();
        return end - start;
    },
    runPartialReplace(itemCount, replaceRatio) {
        const itemsState = (0, core_1.createState)(Array.from({ length: itemCount }, (_, i) => ({ id: i, text: `Item ${i}` })));
        const container = (0, dom_core_1.For)(itemsState, (item) => item.id, (item) => {
            const el = document.createElement("div");
            el.textContent = item().text;
            return el;
        });
        document.body.appendChild(container);
        core_1.UISystem.flush();
        const current = (0, core_1.read)(itemsState);
        const replaceCount = Math.floor(itemCount * replaceRatio);
        const next = current.slice(replaceCount);
        for (let i = 0; i < replaceCount; i++) {
            next.push({ id: itemCount + i, text: `New ${i}` });
        }
        const start = performance.now();
        (0, core_1.write)(itemsState, next);
        core_1.UISystem.flush();
        const end = performance.now();
        container.remove();
        return end - start;
    },
    runDynamicDependency(iterations) {
        const cond = (0, core_1.createState)(true);
        const a = (0, core_1.createState)(1);
        const b = (0, core_1.createState)(2);
        const memo = (0, core_1.createCompute)(() => (0, core_1.read)(cond) ? (0, core_1.read)(a) : (0, core_1.read)(b));
        (0, core_1.createEffect)(() => { (0, core_1.read)(memo); });
        const start = performance.now();
        (0, core_1.batch)(() => {
            for (let i = 0; i < iterations; i++) {
                (0, core_1.write)(cond, (i & 1) === 0);
                (0, core_1.write)(a, i);
                (0, core_1.write)(b, i);
            }
        });
        core_1.UISystem.flush();
        return performance.now() - start;
    },
    runFanOutBenchmark(count) {
        const s = (0, core_1.createState)(0);
        for (let i = 0; i < count; i++) {
            const c = (0, core_1.createCompute)(() => (0, core_1.read)(s) + i);
            (0, core_1.createEffect)(() => (0, core_1.read)(c));
        }
        const start = performance.now();
        (0, core_1.write)(s, 1);
        core_1.UISystem.flush();
        return performance.now() - start;
    },
    runFanInBenchmark(count) {
        const states = [];
        for (let i = 0; i < count; i++)
            states.push((0, core_1.createState)(i));
        const memo = (0, core_1.createCompute)(() => {
            let sum = 0;
            for (const s of states)
                sum += (0, core_1.read)(s);
            return sum;
        });
        (0, core_1.createEffect)(() => (0, core_1.read)(memo));
        const start = performance.now();
        (0, core_1.batch)(() => {
            for (let i = 0; i < count; i++)
                (0, core_1.write)(states[i], i + 1);
        });
        core_1.UISystem.flush();
        return performance.now() - start;
    },
    runDeepChain(length) {
        const root = (0, core_1.createState)(0);
        let prev = root;
        for (let i = 0; i < length; i++) {
            const parent = prev;
            prev = (0, core_1.createCompute)(() => (0, core_1.read)(parent) + 1);
        }
        (0, core_1.createEffect)(() => (0, core_1.read)(prev));
        const start = performance.now();
        (0, core_1.write)(root, 1);
        core_1.UISystem.flush();
        return performance.now() - start;
    },
    runFlush(count) {
        const start = performance.now();
        for (let i = 0; i < count; i++)
            core_1.UISystem.flush();
        return performance.now() - start;
    },
    runRead(count) {
        const states = [];
        for (let i = 0; i < count; i++)
            states.push((0, core_1.createState)(i));
        const start = performance.now();
        for (const s of states)
            (0, core_1.read)(s);
        return performance.now() - start;
    },
    runWrite(count) {
        const states = [];
        for (let i = 0; i < count; i++)
            states.push((0, core_1.createState)(i));
        const start = performance.now();
        for (const s of states)
            (0, core_1.write)(s, 1);
        return performance.now() - start;
    },
    runCreateState(count) {
        const start = performance.now();
        for (let i = 0; i < count; i++)
            (0, core_1.createState)(i);
        return performance.now() - start;
    },
    runCreateCompute(count) {
        const start = performance.now();
        for (let i = 0; i < count; i++)
            (0, core_1.createCompute)(() => i);
        return performance.now() - start;
    },
    runCreateEffect(count) {
        const start = performance.now();
        for (let i = 0; i < count; i++)
            (0, core_1.createEffect)(() => i);
        return performance.now() - start;
    },
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
            core_1.DestructionSystem.destroyEntity(entityId);
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
            console.log(`[DESTROY ENTITY] individual=${individualTime.toFixed(2)}ms / batched=${batchedTime.toFixed(2)}ms (${(individualTime / batchedTime).toFixed(1)}x)`);
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
            const fanInTime = BenchmarkSystem.runFanInBenchmark(fanCount);
            console.log(`[Fan-Out/In] n=${fanCount}: out=${fanOutTime.toFixed(2)}ms in=${fanInTime.toFixed(2)}ms`);
        }
        {
            const createCount = Math.min(n, 50000);
            const before = getMemory();
            const stateTime = BenchmarkSystem.runCreateState(createCount);
            const computeTime = BenchmarkSystem.runCreateCompute(createCount);
            const effectTime = BenchmarkSystem.runCreateEffect(createCount);
            const after = getMemory();
            console.log(`[CREATE COST] state=${stateTime.toFixed(2)}ms compute=${computeTime.toFixed(2)}ms effect=${effectTime.toFixed(2)}ms | ${formatMemoryDelta(before, after)}`);
        }
    }
    console.log("\n=== BENCHMARK END ===");
}
window.runWaterveinBenchmark = () => {
    console.log("=== PERFORMANCE TEST START ===");
    const { time: constTime, entityId } = BenchmarkSystem.runGraphConstruction(10000);
    console.log(`[1] Building a Massive DAG with 10,000 Nodes: ${constTime.toFixed(2)} ms`);
    core_1.DestructionSystem.destroyEntity(entityId);
    const updateTime = BenchmarkSystem.runHighFrequencyUpdate(2000, 50);
    console.log(`[2] 2,000 signals × 50 batch updates (100,000 patches total): ${updateTime.toFixed(2)} ms`);
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
    console.log("=== BENCHMARK END ===");
};
window.runWaterveinScaleBenchmark = runScaleSuite;
//# sourceMappingURL=index.js.map