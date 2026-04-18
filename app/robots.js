export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    sitemap: 'https://floridainfluence.com/sitemap.xml',
  };
}
