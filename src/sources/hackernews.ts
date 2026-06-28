// Hacker News Top 10 via the official Firebase API.

import type { HnItem } from '../types.js';
import { fetchJson } from '../http.js';
import { fmtK } from '../format.js';

interface HnStory {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
}

const ITEM_URL = (id: number) => `https://news.ycombinator.com/item?id=${id}`;

function domainOf(url: string | undefined, id: number): string {
  if (!url) return 'news.ycombinator.com';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return ITEM_URL(id);
  }
}

export async function getHackerNews(): Promise<HnItem[]> {
  const ids = await fetchJson<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json');
  const top = ids.slice(0, 10);
  const stories = await Promise.all(
    top.map((id) => fetchJson<HnStory>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)),
  );
  return stories.map((s, i) => ({
    rank: i + 1,
    title: s.title ?? '(untitled)',
    domain: domainOf(s.url, s.id),
    points: fmtK(s.score ?? 0),
    comments: fmtK(s.descendants ?? 0),
    url: s.url || ITEM_URL(s.id),
  }));
}
