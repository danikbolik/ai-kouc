import { NextResponse } from 'next/server';

/** Zpětná kompatibilita – přesměruje na /api/strava/login */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const loginUrl = new URL('/api/strava/login', request.url);
  loginUrl.search = url.search;
  return NextResponse.redirect(loginUrl);
}
