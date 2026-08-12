import { cookies } from 'next/headers';

import { getUserData, isValidUserId, saveStravaTokensForUser } from '@/lib/userData/repository';
import { refreshStravaToken } from '@/lib/strava';

interface StravaCredentials {
  clientId?: string;
  clientSecret?: string;
}

export async function getValidStravaAccessToken(
  request: Request,
  credentials: StravaCredentials,
): Promise<string | null> {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get('strava_access_token')?.value;
  let refreshToken = cookieStore.get('strava_refresh_token')?.value;
  let expiresAt = Number(cookieStore.get('strava_expires_at')?.value ?? 0);

  const userId = request.headers.get('x-user-id');

  if (!accessToken && isValidUserId(userId)) {
    const cloud = await getUserData(userId);
    if (cloud?.stravaTokens) {
      accessToken = cloud.stravaTokens.accessToken;
      refreshToken = cloud.stravaTokens.refreshToken;
      expiresAt = cloud.stravaTokens.expiresAt;
    }
  }

  if (!accessToken) return null;

  if (expiresAt > Date.now() / 1000 + 300) {
    return accessToken;
  }

  if (!refreshToken) return null;

  try {
    const tokens = await refreshStravaToken(refreshToken, credentials);

    cookieStore.set('strava_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expires_in,
    });
    cookieStore.set('strava_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    cookieStore.set('strava_expires_at', String(tokens.expires_at), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expires_in,
    });

    if (isValidUserId(userId)) {
      await saveStravaTokensForUser(userId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_at,
      });
    }

    return tokens.access_token;
  } catch {
    return null;
  }
}
