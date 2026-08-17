import { normalizeAllDays } from '../dayData';
import { EMPTY_API_KEYS } from '../apiKeyHeaders';
import { formatSupabaseError, isMissingColumnError, isUpsertConflictError } from '../supabase/errors';
import { getSupabaseAdmin, isCloudDbConfigured } from '../supabase/server';
import { DEFAULT_HR_ZONES, DEFAULT_PACE_ZONES, DEFAULT_USER_METRICS } from '../../types/settings';
import type { UserDataSnapshot } from '../../types/userData';
import {
  detectUserDataShape,
  idFilterColumn,
  rowToSnapshot,
  snapshotToRow,
  type UserDataTableShape,
} from './schemaAdapter';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedTableShape: UserDataTableShape | null = null;

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

async function resolveTableShape(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
): Promise<UserDataTableShape> {
  if (cachedTableShape) return cachedTableShape;

  const { error: payloadProbeError } = await supabase
    .from('user_data')
    .select('payload')
    .limit(1);

  if (!payloadProbeError) {
    cachedTableShape = { idColumn: 'user_id', blobColumn: 'payload', splitColumns: false };
    return cachedTableShape;
  }

  if (isMissingColumnError(payloadProbeError, 'payload')) {
    const { error: dataProbeError } = await supabase.from('user_data').select('data').limit(1);
    if (!dataProbeError) {
      cachedTableShape = { idColumn: 'user_id', blobColumn: 'data', splitColumns: false };
      return cachedTableShape;
    }

    const { data, error } = await supabase.from('user_data').select('*').limit(1);
    if (error) {
      console.warn('[resolveTableShape]', formatSupabaseError('legacy probe', error));
    }

    cachedTableShape = detectUserDataShape((data?.[0] ?? null) as Record<string, unknown> | null);
    console.warn(
      '[userData] Tabulka user_data nemá sloupec payload – používám legacy/split sloupce. Spusť supabase/migrations/001_add_payload_column.sql',
    );
    return cachedTableShape;
  }

  throw new Error(formatSupabaseError('resolveTableShape failed', payloadProbeError));
}

export async function getUserData(userId: string): Promise<UserDataSnapshot | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const shape = await resolveTableShape(supabase);
  let idColumn = idFilterColumn(shape);

  let { data, error } = await supabase
    .from('user_data')
    .select('*')
    .eq(idColumn, userId)
    .maybeSingle();

  if (error && isMissingColumnError(error, idColumn)) {
    idColumn = idColumn === 'user_id' ? 'cloud_id' : 'user_id';
    cachedTableShape = { ...shape, idColumn };
    ({ data, error } = await supabase
      .from('user_data')
      .select('*')
      .eq(idColumn, userId)
      .maybeSingle());
  }

  if (error) {
    throw new Error(formatSupabaseError('getUserData SELECT failed', error, { userId, idColumn }));
  }

  if (!data) return null;

  const partial = rowToSnapshot(data as Record<string, unknown>, shape);
  return normalizeSnapshot(partial);
}

async function findUserIdByStravaAthleteIdColumn(
  athleteId: number,
  excludeUserId?: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let query = supabase.from('user_data').select('user_id, cloud_id').eq('strava_athlete_id', athleteId);

  if (excludeUserId) {
    const shape = await resolveTableShape(supabase);
    query = query.neq(idFilterColumn(shape), excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    if (isMissingColumnError(error, 'strava_athlete_id')) {
      return null;
    }
    console.warn('[findUserIdByStravaAthleteIdColumn]', formatSupabaseError('column lookup', error));
    return null;
  }

  if (!data) return null;
  const row = data as Record<string, unknown>;
  return (row.user_id ?? row.cloud_id) as string | null;
}

async function findUserIdByStravaAthleteIdPayload(
  athleteId: number,
  excludeUserId?: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const shape = await resolveTableShape(supabase);
  const { data: rows, error } = await supabase.from('user_data').select('*');

  if (error) {
    console.warn('[findUserIdByStravaAthleteIdPayload]', formatSupabaseError('full scan', error));
    return null;
  }

  for (const row of rows ?? []) {
    const record = row as Record<string, unknown>;
    const rowId = (record.user_id ?? record.cloud_id) as string | undefined;
    if (excludeUserId && rowId === excludeUserId) continue;
    const partial = rowToSnapshot(record, shape);
    if (partial.stravaTokens?.athleteId === athleteId) {
      return rowId ?? null;
    }
  }

  return null;
}

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

  const shape = await resolveTableShape(supabase);
  const idColumn = idFilterColumn(shape);

  const { error } = await supabase
    .from('user_data')
    .update({ strava_athlete_id: athleteId })
    .eq(idColumn, userId);

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

  const shape = await resolveTableShape(supabase);
  const idColumn = idFilterColumn(shape);

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

  const upsertRow = snapshotToRow(userId, payload, shape);

  let data: Record<string, unknown> | null = null;

  const tryUpsert = async () =>
    supabase.from('user_data').upsert(upsertRow, { onConflict: idColumn }).select('*').single();

  const tryUpdate = async () =>
    supabase.from('user_data').update(upsertRow).eq(idColumn, userId).select('*').maybeSingle();

  const tryInsert = async () => supabase.from('user_data').insert(upsertRow).select('*').single();

  const upsertResult = await tryUpsert();

  if (!upsertResult.error && upsertResult.data) {
    data = upsertResult.data as Record<string, unknown>;
  } else if (
    upsertResult.error &&
    (isUpsertConflictError(upsertResult.error) || upsertResult.error.code === '42P10')
  ) {
    const updateResult = await tryUpdate();
    if (updateResult.error) {
      throw new Error(formatSupabaseError('saveUserData UPDATE failed', updateResult.error, { userId }));
    }

    if (updateResult.data) {
      data = updateResult.data as Record<string, unknown>;
    } else {
      const insertResult = await tryInsert();
      if (insertResult.error) {
        throw new Error(formatSupabaseError('saveUserData INSERT failed', insertResult.error, { userId }));
      }
      data = insertResult.data as Record<string, unknown>;
    }
  } else if (upsertResult.error) {
    throw new Error(
      formatSupabaseError('saveUserData UPSERT failed', upsertResult.error, {
        userId,
        idColumn,
        blobColumn: shape.blobColumn,
        splitColumns: shape.splitColumns,
      }),
    );
  }

  if (!data) {
    throw new Error(`saveUserData: žádná data nevrácena po uložení (userId=${userId}).`);
  }

  const athleteId = payload.stravaTokens?.athleteId;
  if (athleteId) {
    await linkStravaAthleteId(userId, athleteId);
  }

  const savedPartial = rowToSnapshot(data as Record<string, unknown>, shape);
  return normalizeSnapshot(savedPartial);
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
