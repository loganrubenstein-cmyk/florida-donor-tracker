// Wrapper around NextResponse.json that adds an edge Cache-Control header.
// Use for listing-API endpoints where the same query string returns the same
// data for every visitor (donors, candidates, committees, lobbyists, etc.).
// Vercel's edge caches the response keyed on full URL — different query
// strings cache separately.
//
// Default: 10 minutes fresh, 1 hour stale-while-revalidate. Listing data
// changes only when the upstream load script runs (daily quarterly cycle),
// so a 10-minute window is conservative and dramatically lowers function
// invocations on browse pages and bot crawls.

import { NextResponse } from 'next/server';

export function cachedJson(payload, { sMaxage = 600, swr = 3600, status = 200 } = {}) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': `public, s-maxage=${sMaxage}, stale-while-revalidate=${swr}`,
    },
  });
}
