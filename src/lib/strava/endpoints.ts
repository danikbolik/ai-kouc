/**
 * Oficiální Strava API endpointy – jediný povolený cíl pro server-side HTTP volání.
 *
 * Integrace je výhradně direct (bez 3rd party proxy, CORS wrapperů ani middleware).
 * Klient (prohlížeč) volá pouze vlastní Next.js API routes (/api/strava/*);
 * tyto routes pak volají přímo www.strava.com.
 *
 * @see https://developers.strava.com/docs/reference/
 */

export const STRAVA_OAUTH_TOKEN_URL = 'https://www.strava.com/oauth/token';
export const STRAVA_OAUTH_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
export const STRAVA_API_V3_BASE = 'https://www.strava.com/api/v3';

const STRAVA_OFFICIAL_HOST = 'www.strava.com';

/** Runtime kontrola – zablokuje neoficiální/proxy URL ještě před odesláním požadavku. */
export function assertDirectStravaUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== STRAVA_OFFICIAL_HOST) {
    throw new Error(
      `Strava API: povoleny jsou pouze přímé HTTPS požadavky na ${STRAVA_OFFICIAL_HOST}, obdrženo: ${parsed.origin}`,
    );
  }
}

export function buildStravaApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${STRAVA_API_V3_BASE}${normalizedPath}`;
  assertDirectStravaUrl(url);
  return url;
}
