import type { UserDataSnapshot } from '@/types/userData';

import { normalizeSnapshot, saveUserData } from './repository';

export interface CloudReadResult {
  data: UserDataSnapshot | null;
  error: string | null;
}

/** Načte cloud data bez házení výjimky – vhodné pro Strava sync, kde cloud není kritický. */
export async function tryGetUserData(userId: string): Promise<CloudReadResult> {
  try {
    const { getUserData } = await import('./repository');
    const data = await getUserData(userId);
    return { data, error: null };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Neznámá chyba při čtení cloudu.';
    console.error('[tryGetUserData]', { userId, detail, error });
    return { data: null, error: detail };
  }
}

/** Uloží metadata Strava sync – selhání neblokuje samotnou synchronizaci aktivit. */
export async function trySaveStravaSyncMetadata(
  userId: string,
  fields: {
    lastStravaSyncAt: string;
    lastStravaActivityAt?: number;
  },
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { data: existing, error: readError } = await tryGetUserData(userId);

    if (readError && !existing) {
      console.warn('[trySaveStravaSyncMetadata] Cloud read failed, attempting upsert anyway');
    }

    const base =
      existing ??
      normalizeSnapshot({
        stravaConnected: true,
      });

    await saveUserData(userId, {
      ...base,
      lastStravaSyncAt: fields.lastStravaSyncAt,
      lastStravaActivityAt:
        fields.lastStravaActivityAt ?? base.lastStravaActivityAt,
    });

    return { ok: true, error: null };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Nepodařilo se uložit metadata synchronizace.';
    console.error('[trySaveStravaSyncMetadata]', { userId, detail, error });
    return { ok: false, error: detail };
  }
}
