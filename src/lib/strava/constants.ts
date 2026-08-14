/** Minimální interval mezi automatickými synchronizacemi (3 hodiny). */
export const STRAVA_SYNC_COOLDOWN_MS = 3 * 60 * 60 * 1000;

/** Obnov access token, pokud do expirace zbývá méně než 5 minut. */
export const TOKEN_REFRESH_BUFFER_SEC = 300;
