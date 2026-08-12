import { NextResponse } from 'next/server';

import {
  getStravaClientIdFromEnv,
  getStravaRedirectUriForRequest,
} from '@/lib/strava/env';

const STRAVA_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';

/** Zahájí Strava OAuth2 flow – přesměruje na oficiální přihlašovací stránku Stravy. */
export async function GET(request: Request) {
  const clientId = getStravaClientIdFromEnv();
  const redirectUri = getStravaRedirectUriForRequest(request);

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          'Strava client_id není nakonfigurován. Nastav STRAVA_CLIENT_ID ve Vercel Environment Variables.',
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const userId =
    url.searchParams.get('userId') ??
    request.headers.get('cookie')?.match(/ai_coach_user_id=([^;]+)/)?.[1];

  const state = Buffer.from(
    JSON.stringify({
      userId: userId ? decodeURIComponent(userId) : undefined,
      redirectUri,
    }),
  ).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  });

  return NextResponse.redirect(`${STRAVA_AUTHORIZE_URL}?${params.toString()}`);
}
