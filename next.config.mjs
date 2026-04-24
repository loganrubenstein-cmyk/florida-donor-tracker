// Edge cache header for safe, public, read-only entity + tool routes.
// Middleware-set Cache-Control gets overridden by Next.js after render
// when supabase-js queries trigger the dynamic-render path. Setting via
// next.config.headers() is applied at Vercel's edge layer AFTER the render
// pipeline, so the cached response gets these headers and CDN can serve
// from edge cache on subsequent visits.
//
// Cache window is intentionally short (60s fresh, 10min stale-while-
// revalidate) because the site is still under active editing — edits
// propagate within a minute, with at most 10min of background staleness
// while the SWR refresh fires. Bump these once the site is stable.
//
// Routes left as default (live function each visit):
//   home, /follow, /compare, /connections, /who-funds, /search, /decode,
//   /timeline, /flow, /explorer, /pulse, /api/*
const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=600';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/district', destination: '/who-funds', permanent: true },
      { source: '/research', destination: '/influence', permanent: true },
    ];
  },
  async headers() {
    const cached = (source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: PUBLIC_CACHE }],
    });
    return [
      // Entity profile prefixes — :slug* matches any depth.
      cached('/donor/:slug*'),
      cached('/candidate/:slug*'),
      cached('/committee/:slug*'),
      cached('/legislator/:slug*'),
      cached('/principal/:slug*'),
      cached('/lobbyist/:slug*'),
      cached('/lobbying-firm/:slug*'),
      cached('/politician/:slug*'),
      cached('/bill/:slug*'),
      cached('/vendor/:slug*'),
      cached('/race/:slug*'),
      cached('/industry/:slug*'),
      cached('/cycle/:slug*'),
      cached('/legislature/committee/:slug*'),
      cached('/lobbying/bill/:slug*'),
      // Listing / tool pages without per-request input.
      cached('/lobbying'),
      cached('/lobbying/bills'),
      cached('/lobbying/issues'),
      cached('/legislature'),
      cached('/legislature/committees'),
      cached('/legislators'),
      cached('/principals'),
      cached('/lobbyists'),
      cached('/vendors'),
      cached('/contracts'),
      cached('/expenditures'),
      cached('/ie'),
      cached('/investigations'),
      cached('/federal'),
      cached('/federal/donors'),
      cached('/cycles'),
      cached('/industries'),
      cached('/elections'),
      cached('/party-finance'),
      cached('/solicitations'),
      cached('/transparency'),
      cached('/about'),
      cached('/methodology'),
      cached('/influence'),
    ];
  },
};
export default nextConfig;
