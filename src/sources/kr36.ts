// 36氪资讯 (web_news/latest) Top 10. The page
// https://www.36kr.com/information/web_news/latest/ renders this same feed,
// which it loads over XHR from 36Kr's information-flow gateway. We POST the
// same request and map the items onto the news-panel shape.
//
// NOTE: 36Kr's gateway is not reachable from the build sandbox (network policy
// denies it), so parsing here is intentionally defensive — every field is
// optional with a fallback — and surfaces an error to the aggregator on an
// empty/unexpected payload so the panel degrades gracefully.

import type { KrItem } from '../types.js';
import { fetchJson } from '../http.js';
import { relTimeZh } from '../format.js';

interface KrMaterial {
  itemId?: number | string;
  widgetTitle?: string;
  authorName?: string;
  publishTime?: number; // epoch ms
}

interface KrFlowItem {
  itemId?: number | string;
  templateMaterial?: KrMaterial;
}

interface KrFlowResp {
  code?: number;
  data?: { itemList?: KrFlowItem[] };
}

/** Short label for the chip: prefer the author/media name, capped at 6 chars. */
function tagOf(m: KrMaterial): string {
  const a = m.authorName?.trim();
  if (a) return a.length > 6 ? a.slice(0, 6) : a;
  return '36氪';
}

export async function getKrNews(): Promise<KrItem[]> {
  const url = 'https://gateway.36kr.com/api/mis/nav/ifm/subNav/flow';
  const body = JSON.stringify({
    partner_id: 'web',
    param: {
      subnavType: 1,
      subnavNick: 'web_news',
      pageSize: 30,
      pageEvent: 1,
      pageCallback: '',
      siteId: 1,
      platformId: 2,
    },
    timestamp: Date.now(),
  });

  const resp = await fetchJson<KrFlowResp>(url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.36kr.com',
      Referer: 'https://www.36kr.com/information/web_news/latest/',
    },
  });

  const list = resp.data?.itemList ?? [];
  const items: KrItem[] = list
    // Keep entries that carry a real article (title + id); skip ad/widget rows.
    .map((it) => it.templateMaterial)
    .filter((m): m is KrMaterial => !!m && !!m.widgetTitle && m.itemId != null)
    .slice(0, 10)
    .map((m, i) => ({
      rank: i + 1,
      title: m.widgetTitle!.trim() || '(无标题)',
      tag: tagOf(m),
      time: m.publishTime ? relTimeZh(m.publishTime) : '',
      url: `https://www.36kr.com/p/${m.itemId}`,
    }));

  if (items.length === 0) throw new Error('36kr news: empty feed (api changed?)');
  return items;
}
