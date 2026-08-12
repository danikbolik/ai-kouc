import { NextResponse } from 'next/server';

import {
  exchangeStravaCode,
  isStravaConfigured,
  type StravaTokenResponse,
} from '@/lib/strava';
import {
  getAppBaseUrlFromRequest,
  getStravaClientIdFromEnv,
  getStravaClientSecretFromEnv,
  getStravaRedirectUriForRequest,
} from '@/lib/strava/env';
import { isValidUserId, saveStravaTokensForUser } from '@/lib/userData/repository';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function setStravaTokenCookies(response: NextResponse, tokens: StravaTokenResponse) {
  response.cookies.set('strava_access_token', tokens.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: Math.max(tokens.expires_in, 3600),
  });
  response.cookies.set('strava_refresh_token', tokens.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set('strava_expires_at', String(tokens.expires_at), {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set('strava_connected', 'true', {
    ...COOKIE_OPTIONS,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });
}

function parseOAuthState(
  stateParam: string | null,
  request: Request,
): { userId?: string; redirectUri: string } {
  const fallbackRedirectUri = getStravaRedirectUriForRequest(request);

  if (stateParam) {
    try {
      const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString()) as {
        userId?: string;
        redirectUri?: string;
      };
      return {
        userId: isValidUserId(state.userId) ? state.userId : parseUserIdFromCookie(request),
        redirectUri: state.redirectUri ?? fallbackRedirectUri,
      };
    } catch {
      // ignore invalid state
    }
  }

  return {
    userId: parseUserIdFromCookie(request),
    redirectUri: fallbackRedirectUri,
  };
}

function parseUserIdFromCookie(request: Request): string | undefined {
  const cookieMatch = request.headers.get('cookie')?.match(/ai_coach_user_id=([^;]+)/)?.[1];
  const cookieUserId = cookieMatch ? decodeURIComponent(cookieMatch) : undefined;
  return isValidUserId(cookieUserId) ? cookieUserId : undefined;
}

/** Strava OAuth callback – vymění code za tokeny, uloží do Supabase a přesměruje do aplikace. */
export async function GET(request: Request) {
  const credentials = {
    clientId: getStravaClientIdFromEnv(),
    clientSecret: getStravaClientSecretFromEnv(),
  };
  const appBase = getAppBaseUrlFromRequest(request);

  if (!isStravaConfigured(credentials)) {
    return NextResponse.redirect(new URL('/?strava=error&reason=config', appBase));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const stateParam = url.searchParams.get('state');

  if (error) {
    return NextResponse.redirect(
      new URL(`/?strava=error&reason=${encodeURIComponent(error)}`, appBase),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?strava=error&reason=no_code', appBase));
  }

  const { userId, redirectUri } = parseOAuthState(stateParam, request);

  try {
    const tokens = await exchangeStravaCode(code, credentials, redirectUri);

    const redirectUrl = new URL('/', appBase);
    redirectUrl.searchParams.set('strava', 'connected');

    const response = NextResponse.redirect(redirectUrl);
    setStravaTokenCookies(response, tokens);

    if (userId) {
      try {
        await saveStravaTokensForUser(userId, {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_at,
          athleteId: tokens.athlete?.id,
          athleteName: tokens.athlete
            ? `${tokens.athlete.firstname} ${tokens.athlete.lastname}`.trim()
            : undefined,
        });
      } catch (cloudError) {
        console.error('[Strava callback] Cloud token save failed (cookies still set):', cloudError);
      }
    }

    return response;
  } catch (err) {
    console.error('[Strava callback]', err);
    const reason =
      err instanceof Error ? encodeURIComponent(err.message.slice(0, 120)) : 'token_exchange';
    return NextResponse.redirect(new URL(`/?strava=error&reason=${reason}`, appBase));
  }
}

export async function DELETE() {
  const response = NextResponse.json({ connected: false });

  for (const name of [
    'strava_access_token',
    'strava_refresh_token',
    'strava_expires_at',
    'strava_connected',
  ]) {
    response.cookies.set(name, '', { maxAge: 0, path: '/' });
  }

  return response;
}
