import { getDb } from '@/lib/db';
import { listPoliticianSlugs } from '@/lib/loadCandidate';

const BASE = 'https://florida-donor-tracker.vercel.app';

const STATIC_PAGES = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/candidates', priority: 0.8 },
  { path: '/committees', priority: 0.8 },
  { path: '/donors', priority: 0.8 },
  { path: '/explorer', priority: 0.7 },
  { path: '/lobbying', priority: 0.8 },
  { path: '/lobbying-firms', priority: 0.7 },
  { path: '/lobbyists', priority: 0.7 },
  { path: '/principals', priority: 0.7 },
  { path: '/legislature', priority: 0.7 },
  { path: '/legislators', priority: 0.7 },
  { path: '/legislature/committees', priority: 0.6 },
  { path: '/elections', priority: 0.7 },
  { path: '/cycles', priority: 0.6 },
  { path: '/industries', priority: 0.6 },
  { path: '/network', priority: 0.5 },
  { path: '/network/graph', priority: 0.5 },
  { path: '/flow', priority: 0.5 },
  { path: '/connections', priority: 0.5 },
  { path: '/ie', priority: 0.5 },
  { path: '/party-finance', priority: 0.5 },
  { path: '/solicitations', priority: 0.5 },
  { path: '/research', priority: 0.5 },
  { path: '/investigations', priority: 0.5 },
  { path: '/search', priority: 0.4 },
  { path: '/about', priority: 0.4 },
  { path: '/methodology', priority: 0.4 },
  { path: '/data', priority: 0.4 },
  { path: '/coverage', priority: 0.4 },
  { path: '/lobbying/bills', priority: 0.6 },
];

export async function generateSitemaps() {
  return [
    { id: 'static' },
    { id: 'politicians' },
    { id: 'candidates' },
    { id: 'committees' },
    { id: 'donors' },
    { id: 'lobbyists' },
    { id: 'principals' },
    { id: 'legislators' },
    { id: 'lobbying-firms' },
  ];
}

async function fetchSlugs(table, col = 'slug') {
  const db = getDb();
  const { data } = await db.from(table).select(col);
  return (data || []).map(r => r[col]);
}

export default async function sitemap({ id }) {
  if (id === 'static') {
    return STATIC_PAGES.map(p => ({
      url: `${BASE}${p.path}`,
      changeFrequency: p.changeFrequency || 'monthly',
      priority: p.priority || 0.5,
    }));
  }

  if (id === 'politicians') {
    const slugs = listPoliticianSlugs();
    return slugs.map(s => ({
      url: `${BASE}/politician/${s}`,
      changeFrequency: 'weekly',
      priority: 0.9,
    }));
  }

  if (id === 'candidates') {
    const accts = await fetchSlugs('candidates', 'acct_num');
    return accts.map(a => ({
      url: `${BASE}/candidate/${a}`,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  }

  if (id === 'committees') {
    const accts = await fetchSlugs('committees', 'acct_num');
    return accts.map(a => ({
      url: `${BASE}/committee/${a}`,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  }

  if (id === 'donors') {
    const slugs = await fetchSlugs('donors');
    return slugs.map(s => ({
      url: `${BASE}/donor/${s}`,
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  }

  if (id === 'lobbyists') {
    const slugs = await fetchSlugs('lobbyists');
    return slugs.map(s => ({
      url: `${BASE}/lobbyist/${s}`,
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  }

  if (id === 'principals') {
    const slugs = await fetchSlugs('principals');
    return slugs.map(s => ({
      url: `${BASE}/principal/${s}`,
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  }

  if (id === 'legislators') {
    const ids = await fetchSlugs('legislators', 'people_id');
    return ids.map(id => ({
      url: `${BASE}/legislator/${id}`,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
  }

  if (id === 'lobbying-firms') {
    const slugs = await fetchSlugs('lobbying_firms');
    return slugs.map(s => ({
      url: `${BASE}/lobbying-firm/${s}`,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  }

  return [];
}
