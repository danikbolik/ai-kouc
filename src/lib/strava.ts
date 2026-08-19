import type {
  Activity,
  DayData,
  StravaHrZoneSummary,
  StravaLapSummary,
  WorkoutSession,
} from '@/types/training';

import {
  getStravaClientIdFromEnv,
  getStravaClientSecretFromEnv,
  getStravaRedirectUriFromEnv,
} from './strava/env';
import {
  calculateGapPaceString,
  calculateHrTSS,
  inferTerrainType,
} from './loadManagement';
import {
  assertDirectStravaUrl,
  buildStravaApiUrl,
  STRAVA_OAUTH_AUTHORIZE_URL,
  STRAVA_OAUTH_TOKEN_URL,
} from './strava/endpoints';
import { stravaStartDateToUnix } from './strava/activityTimestamps';

export {
  STRAVA_API_V3_BASE,
  STRAVA_OAUTH_AUTHORIZE_URL,
  STRAVA_OAUTH_TOKEN_URL,
} from './strava/endpoints';

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete?: {
    id: number;
    firstname: string;
    lastname: string;
  };
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  start_date_local: string;
  type: string;
  sport_type: string;
  total_elevation_gain?: number;
}

export interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, unknown>;
}

export function getStravaConfig(credentials?: {
  clientId?: string;
  clientSecret?: string;
}) {
  const clientId = credentials?.clientId || getStravaClientIdFromEnv();
  const clientSecret = credentials?.clientSecret || getStravaClientSecretFromEnv();
  const redirectUri = getStravaRedirectUriFromEnv();

  return { clientId, clientSecret, redirectUri };
}

export function isStravaConfigured(credentials?: {
  clientId?: string;
  clientSecret?: string;
}): boolean {
  const { clientId, clientSecret } = getStravaConfig(credentials);
  return Boolean(clientId && clientSecret);
}

/** Sestaví Strava OAuth2 autorizační URL */
export function getStravaAuthorizationUrl(
  state?: string,
  credentials?: { clientId?: string; clientSecret?: string },
): string {
  const { clientId, redirectUri } = getStravaConfig(credentials);
  if (!clientId) {
    throw new Error('STRAVA_CLIENT_ID is not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
  });

  if (state) params.set('state', state);

  return `${STRAVA_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/** Vymění autorizační kód za access token */
export async function exchangeStravaCode(
  code: string,
  credentials?: { clientId?: string; clientSecret?: string },
  redirectUriOverride?: string,
): Promise<StravaTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getStravaConfig(credentials);
  const redirect_uri = redirectUriOverride ?? redirectUri;
  if (!clientId || !clientSecret) {
    throw new Error('Strava credentials are not configured');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri,
  });

  const tokenUrl = STRAVA_OAUTH_TOKEN_URL;
  assertDirectStravaUrl(tokenUrl);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Strava token exchange failed: ${error}`);
  }

  return response.json() as Promise<StravaTokenResponse>;
}

/** Obnoví access token pomocí refresh tokenu */
export async function refreshStravaToken(
  refreshToken: string,
  credentials?: { clientId?: string; clientSecret?: string },
): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = getStravaConfig(credentials);
  if (!clientId || !clientSecret) {
    throw new Error('Strava credentials are not configured');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const tokenUrl = STRAVA_OAUTH_TOKEN_URL;
  assertDirectStravaUrl(tokenUrl);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Strava token refresh failed: ${error}`);
  }

  return response.json() as Promise<StravaTokenResponse>;
}

/** Výchozí počet dní historie pro Strava sync */
export const STRAVA_SYNC_DAYS_DEFAULT = 60;

/** Formátuje dobu trvání ze sekund (min / hod) */
export function formatDurationFromSeconds(seconds: number): string {
  if (seconds <= 0) return '—';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

/** Formátuje tempo min/km ze Strava activity */
export function formatPaceFromActivity(movingTimeSec: number, distanceMeters: number): string {
  if (distanceMeters <= 0 || movingTimeSec <= 0) return '—';

  const paceSecPerKm = movingTimeSec / (distanceMeters / 1000);
  const minutes = Math.floor(paceSecPerKm / 60);
  const seconds = Math.round(paceSecPerKm % 60);

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface StravaLapRaw {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_heartrate?: number;
}

export interface StravaZoneBucket {
  max: number;
  min: number;
  time: number;
}

export interface StravaZoneDistribution {
  type: string;
  distribution_buckets: StravaZoneBucket[];
}

const HR_ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;
const DETAIL_FETCH_BATCH_SIZE = 5;
const DETAIL_FETCH_BATCH_DELAY_MS = 300;

export class StravaRateLimitError extends Error {
  constructor(message = 'Rate Limit Exceeded') {
    super(message);
    this.name = 'StravaRateLimitError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stravaFetch<T>(accessToken: string, path: string): Promise<T> {
  const url = buildStravaApiUrl(path);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });

  if (response.status === 429) {
    throw new StravaRateLimitError();
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Strava API ${path} failed: ${error}`);
  }

  return response.json() as Promise<T>;
}

/** Stáhne mezičasy (laps) aktivity */
export async function fetchActivityLaps(
  accessToken: string,
  activityId: number,
): Promise<StravaLapRaw[]> {
  return stravaFetch<StravaLapRaw[]>(accessToken, `/activities/${activityId}/laps`);
}

/** Stáhne tepové zóny aktivity */
export async function fetchActivityZones(
  accessToken: string,
  activityId: number,
): Promise<StravaZoneDistribution[]> {
  return stravaFetch<StravaZoneDistribution[]>(accessToken, `/activities/${activityId}/zones`);
}

export function mapStravaLapsToSummaries(laps: StravaLapRaw[]): StravaLapSummary[] {
  return laps.map((lap, index) => ({
    index: index + 1,
    label:
      lap.distance >= 900 && lap.distance <= 1100
        ? `Km ${index + 1}`
        : lap.name?.trim() || `Úsek ${index + 1}`,
    distanceKm: Math.round((lap.distance / 1000) * 100) / 100,
    pace: formatPaceFromActivity(lap.moving_time, lap.distance),
    avgHR: Math.round(lap.average_heartrate ?? 0),
    durationSec: lap.moving_time,
  }));
}

export function mapStravaZonesToSummaries(
  zones: StravaZoneDistribution[],
): StravaHrZoneSummary[] {
  const hrZones = zones.find((z) => z.type === 'heartrate');
  if (!hrZones?.distribution_buckets?.length) return [];

  const buckets = hrZones.distribution_buckets.slice(0, 5);
  const totalTime = buckets.reduce((sum, bucket) => sum + bucket.time, 0);

  return buckets.map((bucket, index) => ({
    zone: HR_ZONE_LABELS[index] ?? 'Z5',
    minHR: Math.round(bucket.min),
    maxHR: Math.round(bucket.max),
    timeSec: bucket.time,
    percent: totalTime > 0 ? Math.round((bucket.time / totalTime) * 1000) / 10 : 0,
  }));
}

/** Převede Strava aktivitu do formátu WorkoutSession['actual'] */
export function stravaActivityToActual(
  activity: StravaActivity,
  details?: {
    laps?: StravaLapRaw[];
    zones?: StravaZoneDistribution[];
  },
  options?: { thresholdHR?: number },
): NonNullable<WorkoutSession['actual']> {
  const laps = details?.laps ? mapStravaLapsToSummaries(details.laps) : undefined;
  const hrZones = details?.zones ? mapStravaZonesToSummaries(details.zones) : undefined;
  const elevationGainM = Math.round(activity.total_elevation_gain ?? 0);
  const distanceKm = Math.round((activity.distance / 1000) * 100) / 100;
  const durationMin = Math.round(activity.moving_time / 60);
  const avgPace = formatPaceFromActivity(activity.moving_time, activity.distance);
  const avgHR = Math.round(activity.average_heartrate ?? 0);
  const terrainType = inferTerrainType(activity.name ?? '', activity.sport_type);
  const thresholdHR = options?.thresholdHR ?? 0;
  const tss =
    thresholdHR > 0 && avgHR > 0
      ? calculateHrTSS(durationMin, avgHR, thresholdHR)
      : undefined;
  const gapPace =
    elevationGainM > 0
      ? calculateGapPaceString(avgPace, distanceKm, elevationGainM)
      : undefined;

  return {
    stravaActivityId: activity.id,
    distanceKm,
    durationMin,
    avgPace,
    avgHR,
    garminSyncStatus: 'synced',
    laps: laps && laps.length > 0 ? laps : undefined,
    hrZones: hrZones && hrZones.length > 0 ? hrZones : undefined,
    elevationGainM: elevationGainM > 0 ? elevationGainM : undefined,
    tss,
    gapPace,
    terrainType,
  };
}

/** Extrahuje datum YYYY-MM-DD z start_date_local */
export function activityToDateKey(startDateLocal: string): string {
  return startDateLocal.split('T')[0];
}

/** Odhad fáze dne podle času startu */
function inferPhaseFromStart(startDateLocal: string): Activity['phase'] {
  const hour = Number(startDateLocal.split('T')[1]?.slice(0, 2) ?? 12);
  if (hour < 12) return 'AM';
  if (hour < 17) return 'PM';
  return 'EVENING';
}

/** Převede Strava aktivitu do typu Activity */
export function stravaActivityToActivity(
  activity: StravaActivity,
  details?: {
    laps?: StravaLapRaw[];
    zones?: StravaZoneDistribution[];
  },
  options?: { thresholdHR?: number },
): Activity {
  const actual = stravaActivityToActual(activity, details, options);
  return {
    id: `strava-${activity.id}`,
    stravaActivityId: activity.id,
    stravaStartAt: stravaStartDateToUnix(activity.start_date_local),
    title: activity.name?.trim() || 'Běh (Strava)',
    type: 'klus',
    phase: inferPhaseFromStart(activity.start_date_local),
    distanceKm: actual.distanceKm,
    durationMin: actual.durationMin,
    avgPace: actual.avgPace,
    avgHR: actual.avgHR,
    garminSyncStatus: actual.garminSyncStatus,
    laps: actual.laps,
    hrZones: actual.hrZones,
    elevationGainM: actual.elevationGainM,
    tss: actual.tss,
    gapPace: actual.gapPace,
    terrainType: actual.terrainType,
  };
}

/** Seskupí VŠECHNY běžecké aktivity podle data (bez slučování) */
export function groupRunsByDay(activities: StravaActivity[]): Map<string, StravaActivity[]> {
  const map = new Map<string, StravaActivity[]>();

  for (const activity of activities) {
    if (!isStravaRunActivity(activity)) continue;

    const dateKey = activityToDateKey(activity.start_date_local);
    const list = map.get(dateKey) ?? [];
    list.push(activity);
    map.set(dateKey, list);
  }

  for (const [dateKey, list] of map) {
    list.sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
    map.set(dateKey, list);
  }

  return map;
}

/** Stáhne jednu stránku aktivit sportovce ze Stravy */
export async function fetchRecentActivities(
  accessToken: string,
  options: { page?: number; perPage?: number; after?: number } = {},
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 100),
  });

  if (options.after) {
    params.set('after', String(options.after));
  }

  const url = buildStravaApiUrl(`/athlete/activities?${params}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });

  if (response.status === 429) {
    throw new StravaRateLimitError();
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Strava activities: ${error}`);
  }

  return response.json() as Promise<StravaActivity[]>;
}

/**
 * Stáhne aktivity novější než `after` (inkrementální sync).
 * Bez `after` stáhne pouze první stránku (rychlá aktualizace).
 */
export async function fetchActivitiesAfter(
  accessToken: string,
  options: { after?: number; perPage?: number; maxPages?: number } = {},
): Promise<StravaActivity[]> {
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? (options.after != null ? Number.POSITIVE_INFINITY : 1);
  const allActivities: StravaActivity[] = [];
  let page = 1;

  while (page <= maxPages) {
    const batch = await fetchRecentActivities(accessToken, {
      page,
      perPage,
      after: options.after,
    });

    if (batch.length === 0) break;

    allActivities.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return allActivities;
}

/** Stáhne kompletní historii aktivit sportovce (paginace bez časového limitu) */
export async function fetchAllActivities(
  accessToken: string,
  options: { perPage?: number } = {},
): Promise<StravaActivity[]> {
  const perPage = options.perPage ?? 200;
  const allActivities: StravaActivity[] = [];
  let page = 1;

  while (true) {
    const batch = await fetchRecentActivities(accessToken, {
      page,
      perPage,
    });

    if (batch.length === 0) break;

    allActivities.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return allActivities;
}

/** @deprecated Použij fetchActivitiesAfter nebo fetchAllActivities */
export async function fetchActivitiesSince(
  accessToken: string,
  options: { daysBack?: number; perPage?: number; after?: number } = {},
): Promise<StravaActivity[]> {
  const after =
    options.after ??
    (options.daysBack != null
      ? Math.floor(Date.now() / 1000) - options.daysBack * 86400
      : undefined);

  return fetchActivitiesAfter(accessToken, {
    after,
    perPage: options.perPage ?? 200,
  });
}

/** Stáhne detail jedné aktivity (pro webhook handler) */
export async function fetchActivityById(
  accessToken: string,
  activityId: number,
): Promise<StravaActivity> {
  const url = buildStravaApiUrl(`/activities/${activityId}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Strava activity ${activityId}`);
  }

  return response.json() as Promise<StravaActivity>;
}

const STRAVA_RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

export function isStravaRunActivity(activity: StravaActivity): boolean {
  const legacyType = activity.type;
  const sportType = activity.sport_type ?? legacyType;
  return legacyType === 'Run' || STRAVA_RUN_TYPES.has(sportType);
}

/** Vrátí nejdelší běh daného dne z načtených aktivit */
export function pickBestRunPerDay(activities: StravaActivity[]): Map<string, StravaActivity> {
  const map = new Map<string, StravaActivity>();

  for (const activity of activities) {
    if (!isStravaRunActivity(activity)) continue;

    const dateKey = activityToDateKey(activity.start_date_local);
    const existing = map.get(dateKey);

    if (!existing || activity.distance > existing.distance) {
      map.set(dateKey, activity);
    }
  }

  return map;
}

/** Stáhne lapy a zóny pro všechny běžecké aktivity – vrátí mapu date -> Activity[] */
export async function buildActivitiesByDate(
  accessToken: string,
  activities: StravaActivity[],
  options?: { thresholdHR?: number },
): Promise<Map<string, Activity[]>> {
  const grouped = groupRunsByDay(activities);
  const allRuns = Array.from(grouped.values()).flat();
  const result = new Map<string, Activity[]>();

  for (let i = 0; i < allRuns.length; i += DETAIL_FETCH_BATCH_SIZE) {
    const batch = allRuns.slice(i, i + DETAIL_FETCH_BATCH_SIZE);

    await Promise.all(
      batch.map(async (activity) => {
        const dateKey = activityToDateKey(activity.start_date_local);
        const [laps, zones] = await Promise.all([
          fetchActivityLaps(accessToken, activity.id).catch((error) => {
            console.warn(`[Strava] Laps pro aktivitu ${activity.id} nedostupné:`, error);
            return [] as StravaLapRaw[];
          }),
          fetchActivityZones(accessToken, activity.id).catch((error) => {
            console.warn(`[Strava] Zóny pro aktivitu ${activity.id} nedostupné:`, error);
            return [] as StravaZoneDistribution[];
          }),
        ]);

        const converted = stravaActivityToActivity(activity, { laps, zones }, {
          thresholdHR: options?.thresholdHR,
        });
        const existing = result.get(dateKey) ?? [];
        existing.push(converted);
        existing.sort((a, b) => (a.phase ?? 'AM').localeCompare(b.phase ?? 'AM'));
        result.set(dateKey, existing);
      }),
    );

    if (i + DETAIL_FETCH_BATCH_SIZE < allRuns.length) {
      await sleep(DETAIL_FETCH_BATCH_DELAY_MS);
    }
  }

  return result;
}

/** @deprecated Použij buildActivitiesByDate */
export async function buildActualsWithDetails(
  accessToken: string,
  activities: StravaActivity[],
): Promise<Map<string, NonNullable<WorkoutSession['actual']>>> {
  const byDate = await buildActivitiesByDate(accessToken, activities);
  const result = new Map<string, NonNullable<WorkoutSession['actual']>>();

  for (const [dateKey, dayActivities] of byDate) {
    const longest = dayActivities.reduce((best, current) =>
      current.distanceKm > best.distanceKm ? current : best,
    );
    result.set(dateKey, {
      stravaActivityId: longest.stravaActivityId,
      distanceKm: longest.distanceKm,
      durationMin: longest.durationMin,
      avgPace: longest.avgPace,
      avgHR: longest.avgHR,
      garminSyncStatus: longest.garminSyncStatus,
      laps: longest.laps,
      hrZones: longest.hrZones,
    });
  }

  return result;
}

/** @deprecated Použij buildActualsWithDetails pro plná data včetně lapů a zón */
export function mapActivitiesToActuals(
  activities: StravaActivity[],
): Map<string, NonNullable<WorkoutSession['actual']>> {
  const map = new Map<string, NonNullable<WorkoutSession['actual']>>();

  for (const [dateKey, activity] of pickBestRunPerDay(activities)) {
    map.set(dateKey, stravaActivityToActual(activity));
  }

  return map;
}

/** Vytvoří den v kalendáři z odtrénovaných dat ze Stravy */
export function createStravaDayData(
  date: string,
  activities: Activity[],
): DayData {
  return {
    date,
    activities,
    plannedWorkouts: [],
  };
}
