// The Verge (tech) Top 10 via the site's public feed.
// https://www.theverge.com/rss/tech/index.xml is an Atom feed; we parse it with
// cheerio in XML mode and map entries onto the news-panel shape.
//
// NOTE: The Verge is not reachable from the build sandbox (network policy denies
// it), so parsing here is intentionally defensive — every field is optional with
// a fallback, both Atom (<entry>) and RSS (<item>) layouts are handled — and an
// empty/unexpected payload surfaces an error so the panel degrades gracefully.

import * as cheerio from 'cheerio';
import type { VergeItem } from '../types.js';
import { fetchText } from '../http.js';
import { relTimeZh } from '../format.js';

const FEED_URL = 'https://www.theverge.com/rss/tech/index.xml';

export async function getVerge(): Promise<VergeItem[]> {
  const xml = await fetchText(FEED_URL, { headers: { Accept: 'application/xml, text/xml, */*' } });
  const $ = cheerio.load(xml, { xmlMode: true });

  const entries = $('entry').toArray();
  const rows = (entries.length ? entries : $('item').toArray()).slice(0, 10);

  const items: VergeItem[] = rows.map((el, i) => {
    const node = $(el);

    // Article URL: Atom <link rel="alternate" href> (any <link href>), else
    // RSS <link> text.
    const url =
      (node.find('link[rel="alternate"]').attr('href') || node.find('link[href]').attr('href') || '').trim() ||
      node.find('link').first().text().trim() ||
      'https://www.theverge.com/tech';

    // Publish time across Atom (<published>/<updated>) and RSS (<pubDate>).
    const rawTime =
      node.find('published').first().text().trim() ||
      node.find('updated').first().text().trim() ||
      node.find('pubDate').first().text().trim();
    const ms = rawTime ? Date.parse(rawTime) : NaN;
    const time = Number.isFinite(ms) ? relTimeZh(ms) : '';

    // Byline label, capped so the chip stays compact.
    const rawAuthor =
      node.find('author > name').first().text().trim() ||
      node.find('creator').first().text().trim() ||
      node.find('author').first().text().trim() ||
      'The Verge';
    const author = rawAuthor.length > 18 ? rawAuthor.slice(0, 18) : rawAuthor;

    return {
      rank: i + 1,
      title: node.find('title').first().text().replace(/\s+/g, ' ').trim() || '(untitled)',
      author,
      time,
      url,
    };
  });

  if (items.length === 0) throw new Error('the verge: empty feed (markup changed?)');
  return items;
}
