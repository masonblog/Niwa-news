import { config } from './config.js';

interface FetchOpts {
  headers?: Record<string, string>;
  /** Override default timeout. */
  timeoutMs?: number;
}

async function withTimeout(url: string, opts: FetchOpts): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? config.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': config.userAgent, ...opts.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await withTimeout(url, { ...opts, headers: { Accept: 'application/json', ...opts.headers } });
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await withTimeout(url, opts);
  return await res.text();
}

/** Sina hq endpoints return GBK-ish bytes; decode as latin1 then we only read
 *  ASCII numeric fields, so a plain text decode is sufficient for quotes. */
export async function fetchTextRaw(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await withTimeout(url, opts);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString('latin1');
}
