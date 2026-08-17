import { normalizeAllDays } from '../dayData';
import { EMPTY_API_KEYS } from '../apiKeyHeaders';
import { formatSupabaseError, isMissingColumnError } from '../supabase/errors';
import { getSupabaseAdmin, isCloudDbConfigured } from '../supabase/server';
import { DEFAULT_HR_ZONES, DEFAULT_PACE_ZONES, DEFAULT_USER_METRICS } from '../../types/settings';
import type { UserDataSnapshot } from '../../types/userData';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUserId(userId: string | null | undefined): userId is string {
  return Boolean(userId && UUID_RE.test(userId));
}

function normalizeSnapshot(raw: Partial<UserDataSnapshot> | null | undefined): UserDataSnapshot {
  const userMetrics = {
    ...DEFAULT_USER_METRICS,
    ...(raw?.userMetrics ?? {}),
  };

  if (!userMetrics.paceZones?.length) {
    userMetrics.paceZones = DEFAULT_PACE_ZONES;
  }

  if (!userMetrics.hrZones?.length) {
    userMetrics.hrZones = DEFAULT_HR_ZONES;
  }

  return {
    days: normalizeAllDays(raw?.days ?? {}),
    userMetrics,
    coachNotes: raw?.coachNotes ?? [],
    uploadedMethodology: raw?.uploadedMethodology ?? [],
    apiKeys: {
      ...EMPTY_API_KEYS,
      ...(raw?.apiKeys ?? {}),
    },
    stravaConnected: raw?.stravaConnected ?? false,
    stravaTokens: raw?.stravaTokens ?? null,
    lastStravaSyncAt: raw?.lastStravaSyncAt,
    lastStravaActivityAt: raw?.lastStravaActivityAt,
    updatedAt: raw?.updatedAt ?? new Date(0).toISOString(),
  };
}

export async function getUserData(userId: string): Promise<UserDataSnapshot | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_data')
    .select('payload, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError('getUserData SELECT failed', error, { userId }));
  }

  if (!data) return null;

  const payload = (data.payload ?? {}) as Partial<UserDataSnapshot>;
  return normalizeSnapshot({
    ...payload,
    updatedAt: data.updated_at ?? payload.updatedAt,
  });
}

async function findUserIdByStravaAthleteIdColumn(
  athleteId: number,
  excludeUserId?: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let query = supabase.from('user_data').select('user_id').eq('strava_athlete_id', athleteId);

  if (excludeUserId) {
    query = query.neq('user_id', excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    if (isMissingColumnError(error, 'strava_athlete_id')) {
      return null;
    }
    console.warn('[findUserIdByStravaAthleteIdColumn]', formatSupabaseError('column lookup', error));
    return null;
  }

  return (data?.user_id as string | undefined) ?? null;
}

async function findUserIdByStravaAthleteIdPayload(
  athleteId: number,
  excludeUserId?: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: rows, error } = await supabase
    .from('user_data')
    .select('user_id, payload')
    .not('payload', 'is', null);

  if (error) {
    console.warn('[findUserIdByStravaAthleteIdPayload]', formatSupabaseError('payload scan', error));
    return null;
  }

  for (const row of rows ?? []) {
    if (excludeUserId && row.user_id === excludeUserId) continue;
    const payload = (row.payload ?? {}) as Partial<UserDataSnapshot>;
    if (payload.stravaTokens?.athleteId === athleteId) {
      return row.user_id as string;
    }
  }

  return null;
}

/** Najde existující cloud účet podle Strava athlete ID. */
export async function findUserIdByStravaAthleteId(
  athleteId: number,
  excludeUserId?: string,
): Promise<string | null> {
  const byColumn = await findUserIdByStravaAthleteIdColumn(athleteId, excludeUserId);
  if (byColumn) return byColumn;
  return findUserIdByStravaAthleteIdPayload(athleteId, excludeUserId);
}

export async function linkStravaAthleteId(userId: string, athleteId: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from('user_data')
    .update({ strava_athlete_id: athleteId })
    .eq('user_id', userId);

  if (error && !isMissingColumnError(error, 'strava_athlete_id')) {
    console.warn('[linkStravaAthleteId]', formatSupabaseError('UPDATE strava_athlete_id', error, { userId }));
  }
}

export async function saveUserData(
  userId: string,
  snapshot: UserDataSnapshot,
): Promise<UserDataSnapshot> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Cloud databáze není nakonfigurována (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }

  let existing: UserDataSnapshot | null = null;
  try {
    existing = await getUserData(userId);
  } catch (error) {
    console.warn('[saveUserData] Existing row load failed, upserting snapshot', { userId, error });
  }

  const payload: UserDataSnapshot = normalizeSnapshot({
    ...snapshot,
    stravaTokens:
      snapshot.stravaTokens !== undefined
        ? snapshot.stravaTokens
        : (existing?.stravaTokens ?? null),
    updatedAt: new Date().toISOString(),
  });

  const upsertBase = {
    user_id: userId,
    payload,
    updated_at: payload.updatedAt,
  };

  const { data, error } = await supabase
    .from('user_data')
    .upsert(upsertBase, { onConflict: 'user_id' })
    .select('payload, updated_at')
    .single();

  if (error) {
    throw new Error(formatSupabaseError('saveUserData UPSERT failed', error, { userId }));
  }

  const athleteId = payload.stravaTokens?.athleteId;
  if (athleteId) {
    await linkStravaAthleteId(userId, athleteId);
  }

  const savedPayload = (data.payload ?? {}) as Partial<UserDataSnapshot>;
  return normalizeSnapshot({
    ...savedPayload,
    updatedAt: data.updated_at ?? savedPayload.updatedAt,
  });
}

export async function saveStravaTokensForUser(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    athleteId?: number;
    athleteName?: string;
  },
): Promise<void> {
  if (!isCloudDbConfigured() || !isValidUserId(userId)) return;

  const existing = (await getUserData(userId)) ?? normalizeSnapshot(null);
  await saveUserData(userId, {
    ...existing,
    stravaConnected: true,
    stravaTokens: tokens,
  });
}

export { isCloudDbConfigured, normalizeSnapshot };
