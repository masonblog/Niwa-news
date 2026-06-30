// Assemble the full DashboardData. Each source is cached independently with its
// own TTL and isolated error handling: one upstream failure degrades only its
// panel (last good value retained, error noted) and never breaks the payload.

import type { DashboardData } from './types.js';
import { config } from './config.js';
import { getFresh, getStale, set, markForce } from './cache.js';
import { nowCst } from './format.js';
import { getServerMetrics } from './sources/server-metrics.js';
import { getHackerNews } from './sources/hackernews.js';
import { getGithubTrending } from './sources/github.js';
import { getKrNews } from './sources/kr36.js';
import { getQuotes } from './sources/quotes.js';

const errors: Record<string, string> = {};

/** Resolve a source value: serve fresh cache, else refetch; on failure fall back
 *  to the last good value and record the error. */
async function source<T>(
  key: string,
  ttlMs: number,
  force: boolean,
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const cached = getFresh<T>(key, ttlMs, force);
  if (cached !== undefined) {
    delete errors[key];
    return cached;
  }
  if (force) markForce(key);
  try {
    const value = await fetcher();
    set(key, value);
    delete errors[key];
    return value;
  } catch (e) {
    errors[key] = e instanceof Error ? e.message : String(e);
    const stale = getStale<T>(key);
    return stale !== undefined ? stale : fallback;
  }
}

export async function getDashboard(force: boolean): Promise<DashboardData> {
  const [server, indices, holdings, hn, github, kr] = await Promise.all([
    // Server metrics are always live (cheap, local) — no TTL gating.
    source('server', 0, true, getServerMetrics, []),
    source('indices', config.ttl.quotes, force, () => getQuotes(config.indices), []),
    source('holdings', config.ttl.quotes, force, () => getQuotes(config.holdings), []),
    source('hn', config.ttl.hn, force, getHackerNews, []),
    source('github', config.ttl.github, force, getGithubTrending, []),
    source('kr', config.ttl.kr, force, getKrNews, []),
  ]);

  return {
    lastUpdated: nowCst(),
    server,
    indices,
    holdings,
    hn,
    github,
    kr,
    errors: { ...errors },
  };
}
