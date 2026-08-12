/** Server-side Strava client ID: env → NEXT_PUBLIC fallback (client ID is not secret). */
export function getStravaClientIdFromEnv(): string | undefined {
  const id = process.env.STRAVA_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID?.trim();
  return id || undefined;
}

/** Server-side Strava client secret (never exposed to the browser). */
export function getStravaClientSecretFromEnv(): string | undefined {
  const secret = process.env.STRAVA_CLIENT_SECRET?.trim();
  return secret || undefined;
}

export function getStravaRedirectUriFromEnv(): string {
  return (
    process.env.STRAVA_REDIRECT_URI?.trim() ??
    `${process.env.NEXT_PUBLIC_APP_URL?.trim() ?? 'http://localhost:3000'}/api/strava/callback`
  );
}
