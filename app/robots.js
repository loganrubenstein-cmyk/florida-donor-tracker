export default function robots() {
  const BASE = 'https://floridainfluence.com';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    sitemap: [
      `${BASE}/sitemap/static.xml`,
      `${BASE}/sitemap/politicians.xml`,
      `${BASE}/sitemap/candidates.xml`,
      `${BASE}/sitemap/committees.xml`,
      `${BASE}/sitemap/donors.xml`,
      `${BASE}/sitemap/vendors.xml`,
      `${BASE}/sitemap/lobbyists.xml`,
      `${BASE}/sitemap/principals.xml`,
      `${BASE}/sitemap/legislators.xml`,
      `${BASE}/sitemap/lobbying-firms.xml`,
    ],
  };
}
