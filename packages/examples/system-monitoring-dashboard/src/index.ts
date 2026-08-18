import { createState, createCompute, createResource, write, read, UISystem, untrack } from '@watervein/core';
import { Show, For, mountToBody } from '@watervein/dom-core';
import { button, div, h1, h3, p, section, span, strong } from '@watervein/dom';

const serverId = createState("srv-node-01");

const serverSpecResource = createResource(serverId, async (id) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
        id,
        cpu: "ExampleCPU",
        cores: 8,
        os: "ExampleOS"
    };
});

const cpuLoad = createState(0);
const memoryUsage = createState(0);

const alertLevel = createCompute(() => {
    const load = read(cpuLoad);
    if (load > 85) return "CRITICAL";
    if (load > 60) return "WARNING";
    return "HEALTHY";
});

type Process = { pid: number; name: string; cpu: number; memory: number };

const initialProcesses: Process[] = Array.from({ length: 100 }, (_, i) => ({
    pid: 1000 + i,
    name: `korphere-worker-${i.toString().padStart(2, '0')}`,
    cpu: Math.floor(Math.random() * 20),
    memory: Math.floor(Math.random() * 200)
}));

const processes = createState<Process[]>(initialProcesses);
const sortBy = createState<"pid" | "cpu" | "memory">("pid");

const sortedProcesses = createCompute(() => {
    const list = [...read(processes)];
    const key = read(sortBy);
    
    return list.sort((a, b) => {
        if (key === "pid") return a.pid - b.pid;
        return b[key] - a[key];
    });
});

const app = div({ class: "monitoring-dashboard", style: { padding: "20px", fontFamily: "sans-serif" } }, [
    h1({}, "watervein 2026 Core Metrics Dashboard"),
    
    section({ class: "panel spec-panel" }, [
        h3({}, "System Specifications"),
        Show(
            () => read(serverSpecResource).loading,
            () => div({ class: "loading" }, "Fetching remote hardware details via stream pipeline..."),
            () => {
                const res = read(serverSpecResource);
                if (res.error) return div({}, `Error: ${res.error.message}`);
                return div({ class: "spec-grid" }, [
                    p({}, `Node ID: ${res.data?.id}`),
                    p({}, `CPU Architecture: ${res.data?.cpu}`),
                    p({}, `Operating System: ${res.data?.os}`)
                ]);
            }
        )
    ]),

    section({ class: "panel metrics-panel" }, [
        h3({}, "■ Real-time Telemetry (100ms intervals)"),
        div({ class: "grid" }, [
            div({ class: "card" }, [
                span({}, "CPU Core Total Load: "),
                strong({}, () => `${read(cpuLoad)}%`)
            ]),
            div({ class: "card" }, [
                span({}, "System Alert Level: "),
                span({
                    fontWeight: "bold"
                }, alertLevel)
            ])
        ])
    ]),

    section({ class: "panel process-panel" }, [
        h3({}, "Process Monitor"),
        
        div({ class: "toolbar", style: { marginBottom: "10px" } }, [
            span({}, "Sort By: "),
            button({ onclick: () => {write(sortBy, "pid")} }, "Process ID"),
            button({ onclick: () => write(sortBy, "cpu") }, "Highest CPU"),
            button({ onclick: () => write(sortBy, "memory") }, "Highest Memory"),
        ]),

        div({ class: "table-header", style: { display: "flex", fontWeight: "bold", borderBottom: "2px solid #ccc" } }, [
            div({ style: { width: "100px" } }, "PID"),
            div({ style: { width: "250px" } }, "Process Name"),
            div({ style: { width: "100px" } }, "CPU Load"),
            div({ style: { width: "100px" } }, "Memory")
        ]),

        div({ class: "table-body" }, [
            For(sortedProcesses, (p) => p.pid, (rawItem) => {
                const getRowCpu = () => {
                    const list = read(sortedProcesses);
                    const latest = list.find(x => x.pid === rawItem().pid);
                    return latest ? `${latest.cpu}%` : `${rawItem().cpu}%`;
                };

                const getRowMemory = () => {
                    const list = read(sortedProcesses);
                    const latest = list.find(x => x.pid === rawItem().pid);
                    return latest ? `${latest.memory} MB` : `${rawItem().memory} MB`;
                };

                return div({ class: "table-row", style: { display: "flex", padding: "5px 0", borderBottom: "1px solid #eee" } }, [
                    div({ style: { width: "100px" } }, `${rawItem().pid}`),
                    div({ style: { width: "250px" } }, rawItem.name),
                    div({ style: { width: "100px" } }, getRowCpu),
                    div({ style: { width: "100px" } }, getRowMemory)
                ]);
            }).fragment
        ])
    ])
]);

mountToBody(app);

setInterval(() => {
    const cpu = Math.floor(Math.random() * 100);
    console.log("⚡ [write] The simulator updates the value. Current value:", cpu);
    write(cpuLoad, cpu);
    write(memoryUsage, Math.floor(Math.random() * 16384));

    untrack(() => {
        const currentList = read(processes);
        const nextList = currentList.map(p => ({
            pid: p.pid,
            name: p.name,
            cpu: Math.floor(Math.random() * 100), 
            memory: Math.floor(Math.random() * 2048)
        }));
        
        write(processes, nextList);
    })

    UISystem.flush();

}, 100);