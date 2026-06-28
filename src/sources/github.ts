// GitHub Trending (today) — scraped from the public trending page since there is
// no official API. Selectors target the current Box-row markup; parse failures
// surface to the aggregator so the panel degrades gracefully.

import * as cheerio from 'cheerio';
import type { GithubItem } from '../types.js';
import { fetchText } from '../http.js';
import { fmtK } from '../format.js';

function parseInt0(s: string): number {
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function getGithubTrending(): Promise<GithubItem[]> {
  const html = await fetchText('https://github.com/trending?since=daily', {
    headers: { Accept: 'text/html' },
  });
  const $ = cheerio.load(html);
  const rows = $('article.Box-row').toArray().slice(0, 10);

  const items: GithubItem[] = rows.map((el, i) => {
    const row = $(el);
    const anchor = row.find('h2 a');
    const href = (anchor.attr('href') || '').trim();
    const name = anchor.text().replace(/\s+/g, ' ').trim();
    const desc = row.find('p.col-9, p.my-1').first().text().replace(/\s+/g, ' ').trim();
    const lang = row.find('[itemprop="programmingLanguage"]').first().text().trim();
    const langColor =
      row.find('.repo-language-color').first().attr('style')?.match(/background-color:\s*([^;]+)/)?.[1]?.trim() ||
      '#8b929b';
    const stars = row.find('a[href$="/stargazers"]').first().text().replace(/\s+/g, '').trim();
    const todayText = row
      .find('.float-sm-right, span.d-inline-block.float-sm-right')
      .filter((_, e) => /today/i.test($(e).text()))
      .first()
      .text();

    return {
      rank: i + 1,
      name,
      desc: desc || '—',
      lang: lang || '—',
      langColor,
      stars: fmtK(parseInt0(stars)),
      today: parseInt0(todayText),
      url: href ? `https://github.com${href}` : 'https://github.com/trending',
    };
  });

  if (items.length === 0) throw new Error('github trending: no rows parsed (markup changed?)');
  return items;
}
