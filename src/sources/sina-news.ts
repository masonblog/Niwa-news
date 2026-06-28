// 新浪财经要闻 Top 10 via Sina's roll-news JSON feed.
// lid 2509 = 财经要闻 under pageid 153.

import type { SinaItem } from '../types.js';
import { fetchJson } from '../http.js';
import { relTimeZh } from '../format.js';

interface SinaRollItem {
  title: string;
  url: string;
  ctime: string | number;
  keywords?: string;
  media_name?: string;
}

interface SinaRollResp {
  result?: { data?: SinaRollItem[] };
}

function tagOf(it: SinaRollItem): string {
  if (it.keywords) {
    const first = it.keywords.split(/[,，;；]/)[0]?.trim();
    if (first) return first.length > 6 ? first.slice(0, 6) : first;
  }
  return '要闻';
}

export async function getSinaNews(): Promise<SinaItem[]> {
  const url =
    'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=&num=10&page=1';
  const resp = await fetchJson<SinaRollResp>(url, {
    headers: { Referer: 'https://finance.sina.com.cn/' },
  });
  const data = resp.result?.data ?? [];
  if (data.length === 0) throw new Error('sina news: empty feed');

  return data.slice(0, 10).map((it, i) => ({
    rank: i + 1,
    title: it.title?.trim() || '(无标题)',
    tag: tagOf(it),
    time: relTimeZh(Number(it.ctime) || Date.now() / 1000),
    url: it.url || 'https://finance.sina.com.cn/',
  }));
}
