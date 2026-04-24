import { NextResponse } from 'next/server';

// Edge cache headers for entity profile + tool/listing pages.
//
// Background: Next.js + Supabase doesn't auto-ISR because supabase-js fetches
// aren't tagged with cache hints, so Next.js treats every entity profile as
// dynamically rendered and emits "Cache-Control: private, no-cache, no-store"
// on the response. Result: every visit invokes a function and runs a fresh
// query — the exact pattern that caused the Hobby plan to pause.
//
// This middleware overrides that header for safe, public, read-only pages so
// Vercel's CDN can serve them. Visitor-personalized routes (search bars,
// /api/*, /follow with user input, /compare with user input) are left alone.
//
// Cache-Control format:
//   public, s-maxage=<edge-cache-seconds>, stale-while-revalidate=<swr>
// Edge serves cached for s-maxage seconds, then serves stale for SWR seconds
// while re-fetching fresh in the background.

// Match any path that starts with these prefixes.
const ENTITY_PREFIXES = [
  '/donor/',
  '/candidate/',
  '/committee/',
  '/legislator/',
  '/principal/',
  '/lobbyist/',
  '/lobbying-firm/',
  '/politician/',
  '/bill/',
  '/vendor/',
  '/race/',
  '/industry/',
  '/cycle/',
  '/legislature/committee/',
  '/lobbying/bill/',
];

// Whole-route equality.
const TOOL_ROUTES = new Set([
  '/lobbying',
  '/lobbying/bills',
  '/lobbying/issues',
  '/legislature',
  '/legislature/committees',
  '/legislators',
  '/principals',
  '/lobbyists',
  '/vendors',
  '/contracts',
  '/expenditures',
  '/ie',
  '/investigations',
  '/federal',
  '/federal/donors',
  '/cycles',
  '/industries',
  '/elections',
  '/party-finance',
  '/solicitations',
  '/transparency',
  '/about',
  '/methodology',
  '/influence',
]);

export function middleware(request) {
  const path = request.nextUrl.pathname;

  // Don't touch APIs (they manage their own headers via cachedJson).
  if (path.startsWith('/api/')) return NextResponse.next();

  // Don't touch routes that take user input as the primary state.
  if (path === '/' || path === '/follow' || path === '/compare' || path === '/who-funds'
      || path === '/connections' || path === '/search' || path === '/decode'
      || path === '/timeline' || path === '/flow' || path === '/explorer'
      || path === '/pulse') {
    return NextResponse.next();
  }

  let cacheable = TOOL_ROUTES.has(path);
  if (!cacheable) {
    for (const pre of ENTITY_PREFIXES) {
      if (path.startsWith(pre)) { cacheable = true; break; }
    }
  }
  if (!cacheable) return NextResponse.next();

  const res = NextResponse.next();
  // 5 minutes fresh at the edge, 1 hour stale-while-revalidate. Conservative
  // values — entity profiles change at most daily but we want an upper bound
  // on staleness in case of a data correction.
  res.headers.set(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=3600',
  );
  return res;
}

export const config = {
  // Skip static assets, _next chunks, and image opt routes.
  matcher: '/((?!_next|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|css|js|map)).*)',
};
