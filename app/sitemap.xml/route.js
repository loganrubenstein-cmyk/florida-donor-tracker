// Sitemap index for /sitemap.xml.
//
// app/sitemap.js uses Next's generateSitemaps + id pattern, which emits
// individual sitemaps at /sitemap/<id>.xml but does NOT auto-generate a
// sitemap index at /sitemap.xml. Crawlers that probe /sitemap.xml directly
// (rather than reading robots.txt) were seeing a 404. This route returns a
// proper sitemap index pointing at each per-type sitemap.

import { generateSitemaps } from '@/app/sitemap';

const BASE = 'https://floridainfluence.com';

// Cache the generated index for a day. Sitemap entries change at most when a
// new entity is added; daily refresh is plenty for crawlers and lifts the
// per-request CPU off the function.
export const revalidate = 86400;

export async function GET() {
  const ids = await generateSitemaps();
  const now = new Date().toISOString();
  const entries = ids
    .map(({ id }) =>
      `  <sitemap><loc>${BASE}/sitemap/${id}.xml</loc><lastmod>${now}</lastmod></sitemap>`
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      // Edge cache one day, serve stale up to a week while revalidating.
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
