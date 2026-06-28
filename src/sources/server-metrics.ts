// Host metrics for the 服务器负载 panel — CPU%, memory%, network I/O of the
// machine running this backend. Rolling buffers feed the sparklines and are
// topped up by the background sampler (server.ts) plus each fetch.

import si from 'systeminformation';
import os from 'node:os';
import type { ServerMetric } from '../types.js';
import { ACCENT_COLOR, DOWN_COLOR } from '../config.js';
import { pushSample, getBuffer } from '../cache.js';
import { sparkLine } from '../spark.js';
import { fmt } from '../format.js';

const warnColor = (warn: boolean) => (warn ? DOWN_COLOR : ACCENT_COLOR);

interface NetState {
  rxBytes: number;
  txBytes: number;
  at: number;
}
let prevNet: NetState | null = null;

interface RawMetrics {
  cpu: number; // %
  mem: number; // %
  memUsedGb: number;
  memTotalGb: number;
  cores: number;
  rxMbps: number;
  txMbps: number;
}

async function read(): Promise<RawMetrics> {
  const [load, mem, cpu, net] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.cpu(),
    si.networkStats(),
  ]);

  const totalRx = net.reduce((s, n) => s + (n.rx_bytes || 0), 0);
  const totalTx = net.reduce((s, n) => s + (n.tx_bytes || 0), 0);
  const now = Date.now();
  let rxMbps = 0;
  let txMbps = 0;
  if (prevNet) {
    const dt = (now - prevNet.at) / 1000;
    if (dt > 0) {
      rxMbps = Math.max(0, ((totalRx - prevNet.rxBytes) * 8) / 1e6 / dt);
      txMbps = Math.max(0, ((totalTx - prevNet.txBytes) * 8) / 1e6 / dt);
    }
  }
  prevNet = { rxBytes: totalRx, txBytes: totalTx, at: now };

  return {
    cpu: load.currentLoad || 0,
    mem: mem.total ? (mem.active / mem.total) * 100 : 0,
    memUsedGb: mem.active / 1024 ** 3,
    memTotalGb: mem.total / 1024 ** 3,
    cores: cpu.cores || os.cpus().length || 1,
    rxMbps,
    txMbps,
  };
}

/** Sample metrics and append to rolling buffers. Called by the sampler. */
export async function sampleServer(): Promise<void> {
  try {
    const m = await read();
    pushSample('srv.cpu', m.cpu);
    pushSample('srv.mem', m.mem);
    pushSample('srv.net', m.rxMbps + m.txMbps);
  } catch {
    /* sampler is best-effort */
  }
}

/** Build the three metric cards from the latest sample + rolling history. */
export async function getServerMetrics(): Promise<ServerMetric[]> {
  const m = await read();
  pushSample('srv.cpu', m.cpu);
  pushSample('srv.mem', m.mem);
  pushSample('srv.net', m.rxMbps + m.txMbps);

  const net = m.rxMbps + m.txMbps;

  return [
    {
      label: 'CPU 使用率',
      big: fmt(m.cpu, 0) + '%',
      pct: Math.min(100, m.cpu),
      barColor: warnColor(m.cpu > 85),
      spark: sparkLine(getBuffer('srv.cpu')),
      sub: `${m.cores} vCPU · 负载 ${fmt((m.cpu / 100) * m.cores, 2)}`,
    },
    {
      label: '内存',
      big: fmt(m.mem, 0) + '%',
      pct: Math.min(100, m.mem),
      barColor: warnColor(m.mem > 88),
      spark: sparkLine(getBuffer('srv.mem')),
      sub: `${fmt(m.memUsedGb, 1)} / ${fmt(m.memTotalGb, 1)} GB`,
    },
    {
      label: '网络 I/O',
      big: fmt(net, 0) + ' Mbps',
      pct: Math.min(100, net / 6),
      barColor: warnColor(false),
      spark: sparkLine(getBuffer('srv.net')),
      sub: `↑ ${fmt(m.txMbps, 0)}   ↓ ${fmt(m.rxMbps, 0)} Mbps`,
    },
  ];
}
