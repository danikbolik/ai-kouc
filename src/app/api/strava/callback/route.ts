import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  exchangeStravaCode,
  isStravaConfigured,
  type StravaTokenResponse,
} from '@/lib/strava';
import { getUserData, isValidUserId, saveStravaTokensForUser } from '@/lib/userData/repository';
import { resolveStravaCredentialsWithCookies } from '@/lib/stravaCredentials';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function setStravaTokenCookies(response: NextResponse, tokens: StravaTokenResponse) {
  response.cookies.set('strava_access_token', tokens.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: tokens.expires_in,
  });
  response.cookies.set('strava_refresh_token', tokens.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set('strava_expires_at', String(tokens.expires_at), {
    ...COOKIE_OPTIONS,
    maxAge: tokens.expires_in,
  });
  response.cookies.set('strava_connected', 'true', {
    ...COOKIE_OPTIONS,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function GET(request: Request) {
  const credentials = await resolveStravaCredentialsWithCookies(request);

  if (!isStravaConfigured(credentials)) {
    return NextResponse.redirect(new URL('/?strava=error&reason=config', request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const stateParam = url.searchParams.get('state');

  if (error) {
    return NextResponse.redirect(new URL(`/?strava=error&reason=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?strava=error&reason=no_code', request.url));
  }

  try {
    const tokens = await exchangeStravaCode(code, credentials);

    let returnTo = '/settings?strava=connected';
    let userId: string | undefined;
    if (stateParam) {
      try {
        const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString()) as {
          returnTo?: string;
          userId?: string;
        };
        returnTo = state.returnTo ?? '/settings?strava=connected';
        userId = state.userId;
      } catch {
        // ignore invalid state
      }
    }

    const redirectUrl = new URL(returnTo, request.url);
    redirectUrl.searchParams.set('strava', 'connected');

    const response = NextResponse.redirect(redirectUrl);
    setStravaTokenCookies(response, tokens);

    if (isValidUserId(userId)) {
      await saveStravaTokensForUser(userId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_at,
      });
    }

    return response;
  } catch (err) {
    console.error('[Strava callback]', err);
    return NextResponse.redirect(new URL('/?strava=error&reason=token_exchange', request.url));
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const response = NextResponse.json({ connected: false });

  for (const name of [
    'strava_access_token',
    'strava_refresh_token',
    'strava_expires_at',
    'strava_connected',
  ]) {
    cookieStore.delete(name);
    response.cookies.set(name, '', { maxAge: 0, path: '/' });
  }

  return response;
}
