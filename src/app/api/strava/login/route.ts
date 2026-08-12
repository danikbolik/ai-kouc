import { NextResponse } from 'next/server';

import { resolveStravaClientId } from '@/lib/resolveApiKeys';
import { getStravaAuthorizationUrl } from '@/lib/strava';

/** Zahájí Strava OAuth2 flow – přesměruje na autorizační stránku Stravy */
export async function GET(request: Request) {
  const clientId = resolveStravaClientId(request);

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          'Strava client_id není nakonfigurován. Nastav STRAVA_CLIENT_ID v .env.local nebo předej client_id jako query parametr.',
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') ?? '/settings?strava=connected';
  const userId = url.searchParams.get('userId') ?? request.headers.get('cookie')?.match(/ai_coach_user_id=([^;]+)/)?.[1];

  const state = Buffer.from(JSON.stringify({ returnTo, userId: userId ? decodeURIComponent(userId) : undefined })).toString('base64url');
  const authUrl = getStravaAuthorizationUrl(state, { clientId });

  return NextResponse.redirect(authUrl);
}