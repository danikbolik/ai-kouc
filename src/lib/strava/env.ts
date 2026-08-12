/** Produkční URL aplikace na Vercelu (fallback, pokud není nastaveno v env). */
export const PRODUCTION_APP_URL = 'https://ai-kouc-five.vercel.app';

/** Server-side Strava client ID: env → NEXT_PUBLIC fallback (client ID is not secret). */
export function getStravaClientIdFromEnv(): string | undefined {
  const id =
    process.env.STRAVA_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID?.trim();
  return id || undefined;
}

/** Server-side Strava client secret (never exposed to the browser). */
export function getStravaClientSecretFromEnv(): string | undefined {
  const secret = process.env.STRAVA_CLIENT_SECRET?.trim();
  return secret || undefined;
}

/** Základní URL aplikace pro redirect po OAuth. */
export function getAppBaseUrlFromEnv(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;

  return PRODUCTION_APP_URL;
}

/** OAuth callback URL – musí přesně odpovídat nastavení ve Strava API. */
export function getStravaRedirectUriFromEnv(): string {
  const explicit = process.env.STRAVA_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  return `${getAppBaseUrlFromEnv()}/api/strava/callback`;
}
