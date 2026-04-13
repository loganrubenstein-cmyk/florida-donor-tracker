export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    sitemap: 'https://florida-donor-tracker.vercel.app/sitemap.xml',
  };
}
