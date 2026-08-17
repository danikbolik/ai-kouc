import type { UserDataSnapshot } from '@/types/userData';

export type UserDataIdColumn = 'user_id' | 'cloud_id';

export interface UserDataTableShape {
  idColumn: UserDataIdColumn;
  /** Ukládá celý snapshot do jednoho JSONB sloupce */
  blobColumn: 'payload' | 'data' | null;
  /** Rozdělené sloupce (legacy / ruční schéma v Supabase) */
  splitColumns: boolean;
}

type RawRow = Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickJson<T>(row: RawRow, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key] as T;
    }
  }
  return undefined;
}

/** Detekuje tvar řádku user_data z SELECT *. */
export function detectUserDataShape(sampleRow: RawRow | null): UserDataTableShape {
  if (!sampleRow) {
    return { idColumn: 'user_id', blobColumn: 'payload', splitColumns: false };
  }

  const idColumn: UserDataIdColumn = 'user_id' in sampleRow ? 'user_id' : 'cloud_id';

  if ('payload' in sampleRow) {
    return { idColumn, blobColumn: 'payload', splitColumns: false };
  }

  if ('data' in sampleRow) {
    return { idColumn, blobColumn: 'data', splitColumns: false };
  }

  return { idColumn, blobColumn: null, splitColumns: true };
}

/** Převede řádek user_data na UserDataSnapshot. */
export function rowToSnapshot(
  row: RawRow,
  shape: UserDataTableShape,
): Partial<UserDataSnapshot> {
  const updatedAt =
    (typeof row.updated_at === 'string' ? row.updated_at : undefined) ??
    (typeof row.updatedAt === 'string' ? row.updatedAt : undefined);

  if (shape.blobColumn) {
    const blob = asObject(row[shape.blobColumn]) ?? {};
    return {
      ...(blob as Partial<UserDataSnapshot>),
      updatedAt: updatedAt ?? (blob.updatedAt as string | undefined),
    };
  }

  const userMetrics = pickJson(row, 'personal_params', 'user_metrics', 'userMetrics');
  const coachNotes = pickJson(row, 'coach_memory', 'coach_notes', 'coachNotes');
  const uploadedMethodology = pickJson(
    row,
    'methodology',
    'uploaded_methodology',
    'uploadedMethodology',
  );
  const days = pickJson(row, 'days', 'calendar_days', 'training_days');
  const apiKeys = pickJson(row, 'api_keys', 'apiKeys', 'openai_api_key');

  const openaiFromColumn =
    typeof row.openai_api_key === 'string' ? row.openai_api_key : undefined;

  return {
    days: (days as UserDataSnapshot['days']) ?? undefined,
    userMetrics: (userMetrics as UserDataSnapshot['userMetrics']) ?? undefined,
    coachNotes: (coachNotes as UserDataSnapshot['coachNotes']) ?? undefined,
    uploadedMethodology:
      (uploadedMethodology as UserDataSnapshot['uploadedMethodology']) ?? undefined,
    apiKeys:
      (apiKeys as UserDataSnapshot['apiKeys']) ??
      (openaiFromColumn ? { openaiApiKey: openaiFromColumn, stravaClientId: '', stravaClientSecret: '' } : undefined),
    stravaConnected:
      typeof row.strava_connected === 'boolean'
        ? row.strava_connected
        : typeof row.stravaConnected === 'boolean'
          ? row.stravaConnected
          : undefined,
    stravaTokens: pickJson(row, 'strava_tokens', 'stravaTokens') as UserDataSnapshot['stravaTokens'],
    lastStravaSyncAt: pickJson(row, 'last_strava_sync_at', 'lastStravaSyncAt') as string | undefined,
    lastStravaActivityAt: pickJson(row, 'last_strava_activity_at', 'lastStravaActivityAt') as
      | number
      | undefined,
    updatedAt,
  };
}

/** Připraví řádek pro UPSERT podle dostupného schématu tabulky. */
export function snapshotToRow(
  userId: string,
  snapshot: UserDataSnapshot,
  shape: UserDataTableShape,
): RawRow {
  const base: RawRow = {
    [shape.idColumn]: userId,
    updated_at: snapshot.updatedAt,
  };

  if (shape.blobColumn) {
    return {
      ...base,
      [shape.blobColumn]: snapshot,
    };
  }

  return {
    ...base,
    personal_params: snapshot.userMetrics,
    user_metrics: snapshot.userMetrics,
    coach_memory: snapshot.coachNotes,
    coach_notes: snapshot.coachNotes,
    methodology: snapshot.uploadedMethodology,
    uploaded_methodology: snapshot.uploadedMethodology,
    days: snapshot.days,
    api_keys: snapshot.apiKeys,
    openai_api_key: snapshot.apiKeys?.openaiApiKey ?? '',
    strava_connected: snapshot.stravaConnected,
    strava_tokens: snapshot.stravaTokens ?? null,
    last_strava_sync_at: snapshot.lastStravaSyncAt ?? null,
    last_strava_activity_at: snapshot.lastStravaActivityAt ?? null,
  };
}

export function idFilterColumn(shape: UserDataTableShape): UserDataIdColumn {
  return shape.idColumn;
}
