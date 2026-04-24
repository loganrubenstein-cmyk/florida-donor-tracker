export default function robots() {
  const BASE = 'https://floridainfluence.com';
  // AI training crawlers historically hammer dynamic routes and burn Vercel
  // function invocations (this site got paused on Hobby plan once already).
  // Block by name. Real search engines (Googlebot, Bingbot, DuckDuckBot,
  // Applebot, etc.) keep full access.
  const aiBots = [
    'GPTBot',
    'ChatGPT-User',
    'OAI-SearchBot',
    'ClaudeBot',
    'Claude-Web',
    'anthropic-ai',
    'PerplexityBot',
    'Perplexity-User',
    'Bytespider',
    'CCBot',
    'Google-Extended',
    'Applebot-Extended',
    'Diffbot',
    'FacebookBot',
    'Meta-ExternalAgent',
    'Amazonbot',
    'cohere-ai',
    'Omgili',
    'YouBot',
  ];
  return {
    rules: [
      ...aiBots.map(userAgent => ({ userAgent, disallow: '/' })),
      { userAgent: '*', allow: '/', disallow: '/api/' },
    ],
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
