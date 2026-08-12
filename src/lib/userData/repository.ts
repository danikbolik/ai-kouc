import { normalizeAllDays } from '../dayData';
import { EMPTY_API_KEYS, type ApiKeys } from '../apiKeyHeaders';
import { getSupabaseAdmin, isCloudDbConfigured } from '../supabase/server';
import { DEFAULT_PACE_ZONES, DEFAULT_USER_METRICS } from '../../types/settings';
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
    console.error('[userDataRepository.getUserData]', error);
    throw new Error('Nepodařilo se načíst data z cloudu.');
  }

  if (!data) return null;

  const payload = (data.payload ?? {}) as Partial<UserDataSnapshot>;
  return normalizeSnapshot({
    ...payload,
    updatedAt: data.updated_at ?? payload.updatedAt,
  });
}

export async function saveUserData(
  userId: string,
  snapshot: UserDataSnapshot,
): Promise<UserDataSnapshot> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Cloud databáze není nakonfigurována.');
  }

  const existing = await getUserData(userId);

  const payload: UserDataSnapshot = normalizeSnapshot({
    ...snapshot,
    stravaTokens:
      snapshot.stravaTokens !== undefined
        ? snapshot.stravaTokens
        : (existing?.stravaTokens ?? null),
    updatedAt: new Date().toISOString(),
  });

  const { data, error } = await supabase
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

  if (error) {
    console.error('[userDataRepository.saveUserData]', error);
    throw new Error('Nepodařilo se uložit data do cloudu.');
  }

  const savedPayload = (data.payload ?? {}) as Partial<UserDataSnapshot>;
  return normalizeSnapshot({
    ...savedPayload,
    updatedAt: data.updated_at ?? savedPayload.updatedAt,
  });
}

export async function saveStravaTokensForUser(
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number },
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
