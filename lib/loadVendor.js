import { getDb } from '@/lib/db';

export async function loadVendor(slug) {
  const db = getDb();
  const [{ data, error }, { data: newsRows }] = await Promise.all([
    db.rpc('get_vendor_profile', { p_slug: slug }),
    db.from('news_entity_articles')
      .select('article_title, article_url, article_outlet, article_published, article_snippet, source')
      .eq('entity_type', 'vendor')
      .eq('entity_slug', slug)
      .order('article_published', { ascending: false })
      .limit(8),
  ]);
  if (error) throw error;
  if (!data || !data.entity) return null;
  const news = (newsRows || []).map(n => ({
    title:     n.article_title,
    url:       n.article_url,
    outlet:    n.article_outlet,
    published: n.article_published,
    snippet:   n.article_snippet,
    source:    n.source,
  }));
  return { ...data, news };
}
