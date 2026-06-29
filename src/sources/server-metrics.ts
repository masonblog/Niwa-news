// Host metrics for the 服务器负载 panel — CPU% and memory% of the machine
// running this backend, rendered as colour-coded ring gauges. Rolling buffers
// feed the sparklines and are topped up by the background sampler (server.ts)
// plus each fetch.

import si from 'systeminformation';
import os from 'node:os';
import type { ServerMetric } from '../types.js';
import { pushSample, getBuffer } from '../cache.js';
import { sparkLine } from '../spark.js';
import { fmt } from '../format.js';

// Traffic-light palette for the ring gauges: green when healthy, amber as load
// climbs, red once it crosses the critical threshold.
const RING_OK = 'var(--up,#34d399)';
const RING_WARN = '#fbbf24';
const RING_CRIT = 'var(--down,#f87171)';

/** Pick a ring colour for a 0-100 load given warn/critical thresholds. */
const ringColor = (pct: number, warn: number, crit: number): string =>
  pct >= crit ? RING_CRIT : pct >= warn ? RING_WARN : RING_OK;

interface RawMetrics {
  cpu: number; // %
  mem: number; // %
  memUsedGb: number;
  memTotalGb: number;
  cores: number;
}

async function read(): Promise<RawMetrics> {
  const [load, mem, cpu] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.cpu(),
  ]);

  return {
    cpu: load.currentLoad || 0,
    mem: mem.total ? (mem.active / mem.total) * 100 : 0,
    memUsedGb: mem.active / 1024 ** 3,
    memTotalGb: mem.total / 1024 ** 3,
    cores: cpu.cores || os.cpus().length || 1,
  };
}

/** Sample metrics and append to rolling buffers. Called by the sampler. */
export async function sampleServer(): Promise<void> {
  try {
    const m = await read();
    pushSample('srv.cpu', m.cpu);
    pushSample('srv.mem', m.mem);
  } catch {
    /* sampler is best-effort */
  }
}

/** Build the CPU and memory ring gauges from the latest sample + history. */
export async function getServerMetrics(): Promise<ServerMetric[]> {
  const m = await read();
  pushSample('srv.cpu', m.cpu);
  pushSample('srv.mem', m.mem);

  return [
    {
      label: 'CPU',
      big: fmt(m.cpu, 0) + '%',
      pct: Math.min(100, m.cpu),
      barColor: ringColor(m.cpu, 70, 85),
      spark: sparkLine(getBuffer('srv.cpu')),
      sub: `${m.cores} vCPU · 负载 ${fmt((m.cpu / 100) * m.cores, 2)}`,
    },
    {
      label: '内存',
      big: fmt(m.mem, 0) + '%',
      pct: Math.min(100, m.mem),
      barColor: ringColor(m.mem, 75, 88),
      spark: sparkLine(getBuffer('srv.mem')),
      sub: `${fmt(m.memUsedGb, 1)} / ${fmt(m.memTotalGb, 1)} GB`,
    },
  ];
}
