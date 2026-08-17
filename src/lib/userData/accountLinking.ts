import { mergeUserDataSnapshots } from './mergeSnapshots';
import {
  findUserIdByStravaAthleteId,
  getUserData,
  linkStravaAthleteId,
  normalizeSnapshot,
  saveUserData,
} from './repository';
import type { UserDataSnapshot } from '../../types/userData';

export interface AccountLinkResult {
  canonicalUserId: string;
  merged: boolean;
  data: UserDataSnapshot;
}

async function safeGetUserData(userId: string): Promise<UserDataSnapshot | null> {
  try {
    return await getUserData(userId);
  } catch (error) {
    console.warn('[accountLinking] getUserData failed', { userId, error });
    return null;
  }
}

/** Propojí Strava účet napříč zařízeními – vrátí kanonické user_id s daty z PC. */
export async function resolveStravaLinkedAccount(
  deviceUserId: string,
  athleteId: number,
): Promise<AccountLinkResult> {
  const canonicalUserId = await findUserIdByStravaAthleteId(athleteId, deviceUserId);

  if (!canonicalUserId || canonicalUserId === deviceUserId) {
    await linkStravaAthleteId(deviceUserId, athleteId);
    const data = (await getUserData(deviceUserId)) ?? normalizeSnapshot(null);
    return { canonicalUserId: deviceUserId, merged: false, data };
  }

  const [canonicalData, deviceData] = await Promise.all([
    getUserData(canonicalUserId),
    safeGetUserData(deviceUserId),
  ]);

  if (!canonicalData) {
    throw new Error(
      `Strava účet nalezen (cloud_id=${canonicalUserId}), ale data v Supabase chybí.`,
    );
  }

  const merged = mergeUserDataSnapshots(
    canonicalData,
    deviceData ?? normalizeSnapshot(null),
  );

  const saved = await saveUserData(canonicalUserId, merged);
  await linkStravaAthleteId(canonicalUserId, athleteId);

  return { canonicalUserId, merged: true, data: saved };
}

/** Ruční propojení zařízení – sloučí data z deviceUserId do targetUserId (Cloud ID z PC). */
export async function linkDeviceToAccount(
  deviceUserId: string,
  targetUserId: string,
): Promise<AccountLinkResult> {
  const targetData = await getUserData(targetUserId);
  if (!targetData) {
    throw new Error(
      `Cloud ID ${targetUserId} nebyl nalezen v Supabase. Na PC nejdřív ulož nastavení (parametry / paměť trenéra).`,
    );
  }

  if (deviceUserId === targetUserId) {
    return { canonicalUserId: targetUserId, merged: false, data: targetData };
  }

  const deviceData = await safeGetUserData(deviceUserId);
  const merged = mergeUserDataSnapshots(targetData, deviceData ?? normalizeSnapshot(null));
  const saved = await saveUserData(targetUserId, merged);

  const athleteId = saved.stravaTokens?.athleteId;
  if (athleteId) {
    await linkStravaAthleteId(targetUserId, athleteId);
  }

  return { canonicalUserId: targetUserId, merged: true, data: saved };
}
