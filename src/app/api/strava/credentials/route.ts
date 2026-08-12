import { NextResponse } from 'next/server';

import { resolveStravaCredentials } from '@/lib/resolveApiKeys';
import { saveStravaCredentialsToCookies } from '@/lib/stravaCredentials';

/** Uloží Strava credentials z hlaviček do cookies pro OAuth flow */
export async function POST(request: Request) {
  const { clientId, clientSecret } = resolveStravaCredentials(request);

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing Strava credentials' }, { status: 400 });
  }

  await saveStravaCredentialsToCookies(clientId, clientSecret);

  return NextResponse.json({ saved: true });
}
