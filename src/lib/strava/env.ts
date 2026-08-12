/** Produkční URL aplikace na Vercelu (fallback, pokud není nastaveno v env). */
export const PRODUCTION_APP_URL = 'https://ai-kouc-five.vercel.app';

function trimEnv(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^["']|["']$/g, '');
}

/** Server-side Strava client ID: env → NEXT_PUBLIC fallback (client ID is not secret). */
export function getStravaClientIdFromEnv(): string | undefined {
  const id =
    trimEnv(process.env.STRAVA_CLIENT_ID) ||
    trimEnv(process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID);
  return id || undefined;
}

/** Server-side Strava client secret (never exposed to the browser). */
export function getStravaClientSecretFromEnv(): string | undefined {
  return trimEnv(process.env.STRAVA_CLIENT_SECRET);
}

/** Základní URL aplikace pro redirect po OAuth. */
export function getAppBaseUrlFromEnv(): string {
  const fromEnv = trimEnv(process.env.NEXT_PUBLIC_APP_URL);
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const vercelUrl = trimEnv(process.env.VERCEL_URL);
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;

  return PRODUCTION_APP_URL;
}

/** OAuth callback URL z env (statická konfigurace). */
export function getStravaRedirectUriFromEnv(): string {
  const explicit = trimEnv(process.env.STRAVA_REDIRECT_URI);
  if (explicit) return explicit;

  return `${getAppBaseUrlFromEnv()}/api/strava/callback`;
}

/**
 * OAuth callback URL odvozená z aktuálního requestu.
 * Zaručí shodu redirect_uri mezi authorize a token exchange na stejné doméně.
 */
export function getStravaRedirectUriForRequest(request: Request): string {
  const explicit = trimEnv(process.env.STRAVA_REDIRECT_URI);
  if (explicit) return explicit;

  return `${new URL(request.url).origin}/api/strava/callback`;
}

/** Kam přesměrovat uživatele po OAuth – vždy stejná doména jako callback. */
export function getAppBaseUrlFromRequest(request: Request): string {
  return new URL(request.url).origin;
}
