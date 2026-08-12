import { cookies } from 'next/headers';

import { resolveStravaCredentials } from '@/lib/resolveApiKeys';
import {
  getStravaClientIdFromEnv,
  getStravaClientSecretFromEnv,
} from '@/lib/strava/env';

/** Resolve Strava credentials: headers → cookies → env */
export async function resolveStravaCredentialsWithCookies(
  request: Request,
): Promise<{ clientId?: string; clientSecret?: string }> {
  const fromHeaders = resolveStravaCredentials(request);
  if (fromHeaders.clientId && fromHeaders.clientSecret) {
    return fromHeaders;
  }

  const cookieStore = await cookies();
  return {
    clientId: cookieStore.get('strava_client_id')?.value || getStravaClientIdFromEnv(),
    clientSecret:
      cookieStore.get('strava_client_secret')?.value || getStravaClientSecretFromEnv(),
  };
}

/** Uloží Strava credentials do httpOnly cookies (pro OAuth redirect flow) */
export async function saveStravaCredentialsToCookies(
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };

  cookieStore.set('strava_client_id', clientId, options);
  cookieStore.set('strava_client_secret', clientSecret, options);
}
