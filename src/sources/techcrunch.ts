// TechCrunch Top 10 via the site's public feed.
// https://techcrunch.com/feed/ is an RSS 2.0 feed; we parse it with
// cheerio in XML mode and map entries onto the news-panel shape.
//
// NOTE: TechCrunch is not reachable from the build sandbox (network policy denies
// it), so parsing here is intentionally defensive — every field is optional with
// a fallback, both RSS (<item>) and Atom (<entry>) layouts are handled — and an
// empty/unexpected payload surfaces an error so the panel degrades gracefully.

import * as cheerio from 'cheerio';
import type { TechCrunchItem } from '../types.js';
import { fetchText } from '../http.js';
import { relTimeZh } from '../format.js';

const FEED_URL = 'https://techcrunch.com/feed/';

export async function getTechCrunch(): Promise<TechCrunchItem[]> {
  const xml = await fetchText(FEED_URL, { headers: { Accept: 'application/xml, text/xml, */*' } });
  const $ = cheerio.load(xml, { xmlMode: true });

  const entries = $('entry').toArray();
  const rows = (entries.length ? entries : $('item').toArray()).slice(0, 10);

  const items: TechCrunchItem[] = rows.map((el, i) => {
    const node = $(el);

    // Article URL: RSS <link> text, else Atom <link rel="alternate" href> (any
    // <link href>).
    const url =
      node.find('link').first().text().trim() ||
      (node.find('link[rel="alternate"]').attr('href') || node.find('link[href]').attr('href') || '').trim() ||
      'https://techcrunch.com';

    // Publish time across RSS (<pubDate>) and Atom (<published>/<updated>).
    const rawTime =
      node.find('pubDate').first().text().trim() ||
      node.find('published').first().text().trim() ||
      node.find('updated').first().text().trim();
    const ms = rawTime ? Date.parse(rawTime) : NaN;
    const time = Number.isFinite(ms) ? relTimeZh(ms) : '';

    // Byline label, capped so the chip stays compact.
    const rawAuthor =
      node.find('creator').first().text().trim() ||
      node.find('author > name').first().text().trim() ||
      node.find('author').first().text().trim() ||
      'TechCrunch';
    const author = rawAuthor.length > 18 ? rawAuthor.slice(0, 18) : rawAuthor;

    return {
      rank: i + 1,
      title: node.find('title').first().text().replace(/\s+/g, ' ').trim() || '(untitled)',
      author,
      time,
      url,
    };
  });

  if (items.length === 0) throw new Error('techcrunch: empty feed (markup changed?)');
  return items;
}
