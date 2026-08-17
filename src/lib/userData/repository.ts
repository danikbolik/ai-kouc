import { normalizeAllDays } from '../dayData';
import { EMPTY_API_KEYS } from '../apiKeyHeaders';
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
    .select('payload, updated_at, strava_athlete_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const detail = error.message ?? error.code ?? JSON.stringify(error);
    console.error('[userDataRepository.getUserData]', { userId, detail, error });
    throw new Error(`Nepodařilo se načíst data z cloudu: ${detail}`);
  }

  if (!data) return null;

  const payload = (data.payload ?? {}) as Partial<UserDataSnapshot>;
  return normalizeSnapshot({
    ...payload,
    updatedAt: data.updated_at ?? payload.updatedAt,
  });
}

/** Najde existující cloud účet podle Strava athlete ID (sloupec nebo JSONB fallback). */
export async function findUserIdByStravaAthleteId(
  athleteId: number,
  excludeUserId?: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let columnQuery = supabase
    .from('user_data')
    .select('user_id')
    .eq('strava_athlete_id', athleteId);

  if (excludeUserId) {
    columnQuery = columnQuery.neq('user_id', excludeUserId);
  }

  const { data: byColumn, error: columnError } = await columnQuery.maybeSingle();

  if (!columnError && byColumn?.user_id) {
    return byColumn.user_id as string;
  }

  const { data: rows, error: jsonError } = await supabase
    .from('user_data')
    .select('user_id, payload')
    .not('payload', 'is', null);

  if (jsonError) {
    console.warn('[findUserIdByStravaAthleteId]', jsonError);
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

export async function linkStravaAthleteId(userId: string, athleteId: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from('user_data')
    .update({ strava_athlete_id: athleteId })
    .eq('user_id', userId);

  if (error) {
    console.warn('[linkStravaAthleteId] Column update failed (may need migration):', error.message);
  }
}

export async function saveUserData(
  userId: string,
  snapshot: UserDataSnapshot,
): Promise<UserDataSnapshot> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Cloud databáze není nakonfigurována.');
  }

  let existing: UserDataSnapshot | null = null;
  try {
    existing = await getUserData(userId);
  } catch (error) {
    console.warn('[userDataRepository.saveUserData] Existing row load failed, upserting snapshot', {
      userId,
      error,
    });
  }

  const payload: UserDataSnapshot = normalizeSnapshot({
    ...snapshot,
    stravaTokens:
      snapshot.stravaTokens !== undefined
        ? snapshot.stravaTokens
        : (existing?.stravaTokens ?? null),
    updatedAt: new Date().toISOString(),
  });

  const upsertRow: Record<string, unknown> = {
    user_id: userId,
    payload,
    updated_at: payload.updatedAt,
  };

  const athleteId = payload.stravaTokens?.athleteId;
  if (athleteId) {
    upsertRow.strava_athlete_id = athleteId;
  }

  const { data, error } = await supabase
    .from('user_data')
    .upsert(upsertRow, { onConflict: 'user_id' })
    .select('payload, updated_at')
    .single();

  if (error) {
    if (athleteId && error.message?.includes('strava_athlete_id')) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('user_data')
        .upsert(
          {
            user_id: userId,
            payload,
            updated_at: payload.updatedAt,
          },
          { onConflict: 'user_id' },
        )
        .select('payload, updated_at')
        .single();

      if (fallbackError) {
        throw new Error(`Nepodařilo se uložit data do cloudu: ${fallbackError.message}`);
      }

      const savedPayload = (fallbackData.payload ?? {}) as Partial<UserDataSnapshot>;
      return normalizeSnapshot({
        ...savedPayload,
        updatedAt: fallbackData.updated_at ?? savedPayload.updatedAt,
      });
    }

    const detail = error.message ?? error.code ?? JSON.stringify(error);
    console.error('[userDataRepository.saveUserData]', { userId, detail, error });
    throw new Error(`Nepodařilo se uložit data do cloudu: ${detail}`);
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

  if (tokens.athleteId) {
    await linkStravaAthleteId(userId, tokens.athleteId);
  }
}

export { isCloudDbConfigured, normalizeSnapshot };
