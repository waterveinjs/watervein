import {
  createState,
  createCompute,
  createResource,
  write,
  read,
} from '@watervein/core';
import { Show, For, mountToBody } from '@watervein/dom-core';
import { button, div, h1, h3, p, section, span, strong } from '@watervein/dom';

/* ------------------------------------------------------------------ */
/* Server spec (async resource)                                        */
/* ------------------------------------------------------------------ */
const serverId = createState('srv-node-01');

const serverSpecResource = createResource(serverId, async (id) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { id, cpu: 'ExampleCPU', cores: 8, os: 'ExampleOS' };
});

/* ------------------------------------------------------------------ */
/* Global telemetry                                                    */
/* ------------------------------------------------------------------ */
const cpuLoad = createState(0);
const memoryUsage = createState(0);

const alertLevel = createCompute(() => {
  const load = read(cpuLoad);
  if (load > 85) return 'CRITICAL';
  if (load > 60) return 'WARNING';
  return 'HEALTHY';
});

type Row = {
  pid: number;
  name: string;
  cpu: ReturnType<typeof createState<number>>;
  memory: ReturnType<typeof createState<number>>;
  raw: { cpu: number; memory: number };
};

const makeRow = (i: number): Row => {
  const cpu = Math.floor(Math.random() * 20);
  const memory = Math.floor(Math.random() * 200);
  return {
    pid: 1000 + i,
    name: `korphere-worker-${i.toString().padStart(2, '0')}`,
    cpu: createState(cpu),
    memory: createState(memory),
    raw: { cpu, memory },
  };
};

const rows = createState<Row[]>(
  Array.from({ length: 100 }, (_, i) => makeRow(i)),
);
const sortBy = createState<'pid' | 'cpu' | 'memory'>('pid');

const sortTick = createState(0);
const SORT_REFRESH_EVERY = 10;

const sortedRows = createCompute(() => {
  const list = [...read(rows)];
  const key = read(sortBy);

  if (key === 'pid') {
    return list.sort((a, b) => a.pid - b.pid);
  }

  read(sortTick);
  return list.sort((a, b) => b.raw[key] - a.raw[key]);
});

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */
const col = (width: string) => ({ width });
const COL_PID = col('100px');
const COL_NAME = col('250px');
const COL_NUM = col('100px');

const ALERT_STYLE = { fontWeight: 'bold' };

const app = div(
  {
    class: 'monitoring-dashboard',
    style: { padding: '20px', fontFamily: 'sans-serif' },
  },
  [
    h1({}, 'watervein 2026 Core Metrics Dashboard'),

    section({ class: 'panel spec-panel', style: { minHeight: '120px' } }, [
      h3({}, 'System Specifications'),
      Show(
        () => read(serverSpecResource).loading,
        () =>
          div(
            { class: 'loading' },
            'Fetching remote hardware details via stream pipeline...',
          ),
        () => {
          const res = read(serverSpecResource);
          return div({ class: 'spec-grid' }, [
            p({}, `Node ID: ${res.data?.id}`),
            p(
              {},
              `CPU Architecture: ${res.data?.cpu} (${res.data?.cores} cores)`,
            ),
            p({}, `Operating System: ${res.data?.os}`),
          ]);
        },
      ),
    ]),

    section({ class: 'panel metrics-panel' }, [
      h3({}, '■ Real-time Telemetry (100ms intervals)'),
      div({ class: 'grid' }, [
        div({ class: 'card' }, [
          span({}, 'CPU Core Total Load: '),
          strong({}, () => `${read(cpuLoad)}%`),
        ]),
        div({ class: 'card' }, [
          span({}, 'Memory Usage: '),
          strong({}, () => `${read(memoryUsage)} MB`),
        ]),
        div({ class: 'card' }, [
          span({}, 'System Alert Level: '),
          span({ style: ALERT_STYLE }, alertLevel),
        ]),
      ]),
    ]),

    section({ class: 'panel process-panel' }, [
      h3({}, 'Process Monitor'),

      div({ class: 'toolbar', style: { marginBottom: '10px' } }, [
        span({}, 'Sort By: '),
        button({ onclick: () => write(sortBy, 'pid') }, 'Process ID'),
        button({ onclick: () => write(sortBy, 'cpu') }, 'Highest CPU'),
        button({ onclick: () => write(sortBy, 'memory') }, 'Highest Memory'),
      ]),

      div(
        {
          class: 'table-header',
          style: {
            display: 'flex',
            fontWeight: 'bold',
            borderBottom: '2px solid #ccc',
          },
        },
        [
          div({ style: COL_PID }, 'PID'),
          div({ style: COL_NAME }, 'Process Name'),
          div({ style: COL_NUM }, 'CPU Load'),
          div({ style: COL_NUM }, 'Memory'),
        ],
      ),

      div({ class: 'table-body' }, [
        For(
          sortedRows,
          (row) => row.pid,
          (item) => {
            const row = item();

            return div(
              {
                class: 'table-row',
                style: {
                  display: 'flex',
                  padding: '5px 0',
                  borderBottom: '1px solid #eee',
                },
              },
              [
                div({ style: COL_PID }, `${row.pid}`),
                div({ style: COL_NAME }, row.name),
                div({ style: COL_NUM }, () => `${read(row.cpu)}%`),
                div({ style: COL_NUM }, () => `${read(row.memory)} MB`),
              ],
            );
          },
        ).fragment,
      ]),
    ]),
  ],
);

mountToBody(app);

/* ------------------------------------------------------------------ */
/* Simulator                                                           */
/* ------------------------------------------------------------------ */
let tick = 0;

setInterval(() => {
  tick++;

  write(cpuLoad, Math.floor(Math.random() * 100));
  write(memoryUsage, Math.floor(Math.random() * 16384));

  for (const row of read(rows)) {
    const cpu = Math.floor(Math.random() * 100);
    const memory = Math.floor(Math.random() * 2048);
    row.raw.cpu = cpu;
    row.raw.memory = memory;
    write(row.cpu, cpu);
    write(row.memory, memory);
  }

  if (tick % SORT_REFRESH_EVERY === 0 && read(sortBy) !== 'pid') {
    write(sortTick, tick);
  }
}, 100);
