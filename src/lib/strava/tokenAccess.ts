import { cookies } from 'next/headers';

import { getUserData, isValidUserId, saveStravaTokensForUser } from '@/lib/userData/repository';
import { refreshStravaToken, type StravaTokenResponse } from '@/lib/strava';

interface StravaCredentials {
  clientId?: string;
  clientSecret?: string;
}

const TOKEN_REFRESH_BUFFER_SEC = 300;

interface ResolvedStravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function isTokenExpired(expiresAt: number, nowSec = Date.now() / 1000): boolean {
  if (!expiresAt) return true;
  return expiresAt <= nowSec + TOKEN_REFRESH_BUFFER_SEC;
}

function getUserIdFromRequest(request: Request): string | null {
  const header = request.headers.get('x-user-id');
  return isValidUserId(header) ? header : null;
}

async function resolveStoredStravaTokens(
  request: Request,
): Promise<{ tokens: ResolvedStravaTokens | null; userId: string | null }> {
  const cookieStore = await cookies();
  const userId = getUserIdFromRequest(request);

  let accessToken = cookieStore.get('strava_access_token')?.value ?? '';
  let refreshToken = cookieStore.get('strava_refresh_token')?.value ?? '';
  let expiresAt = Number(cookieStore.get('strava_expires_at')?.value ?? 0);

  if (userId) {
    try {
      const cloud = await getUserData(userId);
      const cloudTokens = cloud?.stravaTokens;

      if (cloudTokens?.refreshToken || cloudTokens?.accessToken) {
        const cookieUsable =
          accessToken && refreshToken && !isTokenExpired(expiresAt);

        if (!cookieUsable) {
          accessToken = cloudTokens.accessToken ?? accessToken;
          refreshToken = cloudTokens.refreshToken ?? refreshToken;
          expiresAt = cloudTokens.expiresAt ?? expiresAt;
        }
      }
    } catch (error) {
      console.error('[resolveStoredStravaTokens] Cloud load failed:', error);
    }
  }

  if (!accessToken && !refreshToken) {
    return { tokens: null, userId };
  }

  return {
    tokens: { accessToken, refreshToken, expiresAt },
    userId,
  };
}

async function persistStravaTokens(
  tokens: StravaTokenResponse,
  userId: string | null,
): Promise<void> {
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };

  cookieStore.set('strava_access_token', tokens.access_token, {
    ...cookieOptions,
    maxAge: Math.max(tokens.expires_in, 3600),
  });
  cookieStore.set('strava_refresh_token', tokens.refresh_token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set('strava_expires_at', String(tokens.expires_at), {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set('strava_connected', 'true', {
    ...cookieOptions,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });

  if (userId) {
    await saveStravaTokensForUser(userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      athleteId: tokens.athlete?.id,
      athleteName: tokens.athlete
        ? `${tokens.athlete.firstname} ${tokens.athlete.lastname}`.trim()
        : undefined,
    });
  }
}

/** Lehká kontrola připojení bez refresh tokenu (pro status endpoint). */
export async function hasStravaConnection(request: Request): Promise<boolean> {
  const { tokens } = await resolveStoredStravaTokens(request);
  if (!tokens) return false;

  if (tokens.accessToken && !isTokenExpired(tokens.expiresAt)) return true;
  return Boolean(tokens.refreshToken);
}

/**
 * Vrátí platný access token – načte z cookies/Supabase, při expiraci automaticky obnoví
 * přes refresh_token a uloží nové tokeny zpět do cookies i Supabase.
 */
export async function getValidStravaAccessToken(
  request: Request,
  credentials: StravaCredentials,
): Promise<string | null> {
  const { tokens, userId } = await resolveStoredStravaTokens(request);

  if (!tokens) return null;

  const needsRefresh =
    !tokens.accessToken || isTokenExpired(tokens.expiresAt);

  if (!needsRefresh) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    console.error('[getValidStravaAccessToken] Token expired and no refresh_token');
    return null;
  }

  try {
    console.log('[getValidStravaAccessToken] Refreshing expired Strava token…');
    const refreshed = await refreshStravaToken(tokens.refreshToken, credentials);
    await persistStravaTokens(refreshed, userId);
    return refreshed.access_token;
  } catch (error) {
    console.error('[getValidStravaAccessToken] Refresh failed:', error);
    return null;
  }
}

export { TOKEN_REFRESH_BUFFER_SEC };
